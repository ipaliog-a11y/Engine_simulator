// Sprite-stacked Track & Environment Renderer v2 (Phases 2 & 3).
//
// Classic script (no ES modules, zero runtime dependencies, file://-safe).
// Drop-in replacement/overlay for src/js/track-scene.js keeping 100% compatibility
// with Test Track, Race, Drift, Skidpad, Moose, Eco, Championship, and Fullscreen Track.
//
// Architecture:
//   1. Mode B Chunked/Tiled World Ground Cache (160m x 160m tiles @ 4 px/m = 640x640 px,
//      LRU cap 24 tiles = ~38 MB peak RAM even on 20 km Nordschleife / custom GPX tracks).
//   2. Procedural 3D Sprite-Stacked Roadside Props (pines, oaks, tire walls, grandstands,
//      pit buildings, gantry pillars + elevated bridge) baked once into shared mini-atlases.
//   3. Strict Back-to-Front Painter's List interleaving all cars and 3D props so cars
//      pass cleanly behind trees/stands and underneath the overhead start/finish gantry.
//   4. Batched Particle Pass (1 fill path per kind: smoke, wet spray, skid marks).
//   5. Locked North-Up Follow Camera (sceneFollow) alongside Chase & Overview.
//   6. Seamless integration with car-stacks.js (fallback to legacy drawCar for unsheeted cars).

(function () {
  const WORLD_TILE_M = 160;
  const WORLD_PX_PER_M = 4;
  const WORLD_TILE_PX = WORLD_TILE_M * WORLD_PX_PER_M; // 640x640 px per tile
  const WORLD_TILE_MAX = 24;                           // LRU cap (~38 MB max RAM)
  const PROP_HEADINGS = 32;
  const PROP_SQUASH = 0.78;

  const _tileCache = new Map(); // "key|tx|ty" -> { canvas, lastUsed }
  let _propAtlases = null;
  let _boundKey = '';
  let _sceneProps = [];         // { kind, x, y, hd, scale }
  let _gantry = null;           // { x, y, lx, ly, rx, ry, hd }
  let _particles = [];          // lightweight batched smoke / spray / skid ring buffer
  let _tileHits = 0;
  let _tileMisses = 0;
  let _modeBEnabled = true;
  let _layer = null;
  let _base = new DOMMatrix();

  function _bridge() {
    return typeof _sceneBridge !== 'undefined' ? _sceneBridge : null;
  }
  function _getT() {
    const b = _bridge();
    return b ? b.getT() : (typeof T !== 'undefined' ? T : null);
  }
  function _getWX() {
    const b = _bridge();
    return b ? b.getWX() : (typeof WX !== 'undefined' ? WX : null);
  }
  function _getTOD() {
    const b = _bridge();
    return b ? b.getTOD() : (typeof TOD !== 'undefined' ? TOD : 'day');
  }
  function _project(cam, x, y, h) {
    if (typeof sceneProject === 'function') return sceneProject(cam, x, y, h || 0);
    const b = _bridge();
    if (b && b.project) return b.project(cam, x, y, h || 0);
    return project(cam, x, y, h || 0);
  }
  function _worldMatrix(cam) {
    const b = _bridge();
    if (b && b.worldMatrix) return b.worldMatrix(cam);
    return worldMatrix(cam);
  }

  function _mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // ---- Critically Damped Spring State for Silky Follow & Chase Cameras ----
  const _camSpring = {
    mode: '',
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    hd: 0,
    hdVel: 0,
    lastTs: 0,
  };

  function _stepCamSpring(mode, tx, ty, tHd) {
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const rawDt = _camSpring.lastTs ? (now - _camSpring.lastTs) / 1000 : 1;
    _camSpring.lastTs = now;
    const jumped = Math.hypot(tx - _camSpring.x, ty - _camSpring.y) > 40;
    if (_camSpring.mode !== mode || rawDt > 0.25 || rawDt <= 0 || jumped) {
      _camSpring.mode = mode;
      _camSpring.x = tx;
      _camSpring.y = ty;
      _camSpring.vx = 0;
      _camSpring.vy = 0;
      _camSpring.hd = tHd;
      _camSpring.hdVel = 0;
      return _camSpring;
    }
    const dt = Math.min(0.05, rawDt);
    const wPos = mode === 'chase' ? 10.5 : 9.5;
    _camSpring.vx += ((tx - _camSpring.x) * (wPos * wPos) - 2 * wPos * _camSpring.vx) * dt;
    _camSpring.vy += ((ty - _camSpring.y) * (wPos * wPos) - 2 * wPos * _camSpring.vy) * dt;
    _camSpring.x += _camSpring.vx * dt;
    _camSpring.y += _camSpring.vy * dt;

    let dHd = tHd - _camSpring.hd;
    while (dHd > Math.PI) dHd -= Math.PI * 2;
    while (dHd < -Math.PI) dHd += Math.PI * 2;
    const wRot = 6.2;
    _camSpring.hdVel += (dHd * (wRot * wRot) - 2 * wRot * _camSpring.hdVel) * dt;
    _camSpring.hd += _camSpring.hdVel * dt;
    return _camSpring;
  }

  // ---- Locked North-Up Follow Camera (critically damped, does not rotate behind car) ----
  function sceneFollow(car, W, H, scale, carFrac) {
    const hd = car.camHd == null ? car.hd : car.camHd;
    const look = Math.max(2.2, 34 / Math.max(2, scale));
    const tx = car.x + Math.cos(hd) * look;
    const ty = car.y + Math.sin(hd) * look;
    const sp = _stepCamSpring('follow', tx, ty, 0);
    return {
      ox: sp.x,
      oy: sp.y,
      fx: 0,
      fy: 1,
      lx: 1,
      ly: 0,
      cx: W * 0.5,
      cy: H * (carFrac || 0.52),
      scale,
      pitch: 0.78,
      lift: scale * 0.42,
      roll: 0,
      W,
      H,
    };
  }

  // ---- Smooth Critically Damped Chase Camera Wrapper ----
  function sceneChaseV2(raw) {
    if (!raw) return raw;
    const targetHd = Math.atan2(raw.fy, raw.fx);
    const sp = _stepCamSpring('chase', raw.ox, raw.oy, targetHd);
    const fx = Math.cos(sp.hd);
    const fy = Math.sin(sp.hd);
    return Object.assign({}, raw, {
      ox: sp.x,
      oy: sp.y,
      fx,
      fy,
      lx: -fy,
      ly: fx,
    });
  }

  // ---- Procedural 3D Sprite-Stacked Prop Atlas Baker (~240 KB total RAM) ----
  function _makeVoxelSlices(w, h, count, paint) {
    const slices = [];
    for (let z = 0; z < count; z++) {
      const data = new Uint8ClampedArray(w * h * 4);
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const rgba = paint(z, x, y);
          if (!rgba) continue;
          const p = (y * w + x) * 4;
          data[p] = rgba[0];
          data[p + 1] = rgba[1];
          data[p + 2] = rgba[2];
          data[p + 3] = rgba[3];
        }
      }
      slices.push({ w, h, data });
    }
    return slices;
  }

  function _bakePropAtlas(slices, headings, spacing, glowSlices) {
    const w = slices[0].w;
    const h = slices[0].h;
    const n = slices.length;
    const diag = Math.ceil(Math.hypot(w, h));
    const stackLift = Math.ceil((n - 1) * spacing);
    const pad = 4;
    const fw = diag + pad * 2;
    const fh = Math.ceil(diag * PROP_SQUASH) + stackLift + pad * 2;
    const cx = Math.floor(fw / 2);
    const baseY = fh - pad - Math.ceil((diag * PROP_SQUASH) / 2);
    const halfW = (w - 1) * 0.5;
    const halfH = (h - 1) * 0.5;
    const extX = Math.ceil(diag * 0.5) + 1;
    const extY = Math.ceil(diag * 0.5 * PROP_SQUASH) + 1;

    const canvas = document.createElement('canvas');
    canvas.width = fw * headings;
    canvas.height = fh;
    const ctx = canvas.getContext('2d');

    let glowCanvas = null;
    let glowCtx = null;
    if (glowSlices) {
      glowCanvas = document.createElement('canvas');
      glowCanvas.width = fw * headings;
      glowCanvas.height = fh;
      glowCtx = glowCanvas.getContext('2d');
    }

    function renderOne(srcSlices, angle, withShadowOutline) {
      const out = new Uint8ClampedArray(fw * fh * 4);
      const body = new Uint8ClampedArray(fw * fh * 4);
      const ca = Math.cos(angle);
      const sa = Math.sin(angle);

      if (withShadowOutline) {
        const s0 = srcSlices[0].data;
        const shX = 3;
        const shY = 2;
        for (let y = Math.max(0, baseY + shY - extY); y <= Math.min(fh - 1, baseY + shY + extY); y++) {
          const dy = (y - (baseY + shY)) / PROP_SQUASH;
          for (let x = Math.max(0, cx + shX - extX); x <= Math.min(fw - 1, cx + shX + extX); x++) {
            const dx = x - (cx + shX);
            const sx = Math.round(dx * ca + dy * sa + halfW);
            const sy = Math.round(-dx * sa + dy * ca + halfH);
            if (sx >= 0 && sx < w && sy >= 0 && sy < h && s0[(sy * w + sx) * 4 + 3] > 0) {
              const p = (y * fw + x) * 4;
              out[p] = 8; out[p + 1] = 12; out[p + 2] = 14; out[p + 3] = 105;
            }
          }
        }
      }

      for (let z = 0; z < srcSlices.length; z++) {
        const liftY = Math.round(z * spacing);
        const sData = srcSlices[z].data;
        const y0 = Math.max(0, baseY - liftY - extY);
        const y1 = Math.min(fh - 1, baseY - liftY + extY);
        const x0 = Math.max(0, cx - extX);
        const x1 = Math.min(fw - 1, cx + extX);
        for (let y = y0; y <= y1; y++) {
          const dy = (y - (baseY - liftY)) / PROP_SQUASH;
          for (let x = x0; x <= x1; x++) {
            const dx = x - cx;
            const sx = Math.round(dx * ca + dy * sa + halfW);
            const sy = Math.round(-dx * sa + dy * ca + halfH);
            if (sx >= 0 && sx < w && sy >= 0 && sy < h) {
              const sp = (sy * w + sx) * 4;
              if (sData[sp + 3] > 0) {
                const dp = (y * fw + x) * 4;
                body[dp] = sData[sp]; body[dp + 1] = sData[sp + 1];
                body[dp + 2] = sData[sp + 2]; body[dp + 3] = 255;
              }
            }
          }
        }
      }

      if (withShadowOutline) {
        for (let y = 1; y < fh - 1; y++) {
          for (let x = 1; x < fw - 1; x++) {
            const p = (y * fw + x) * 4;
            if (body[p + 3] > 0) continue;
            if (
              body[((y - 1) * fw + x) * 4 + 3] > 0 ||
              body[((y + 1) * fw + x) * 4 + 3] > 0 ||
              body[(y * fw + x - 1) * 4 + 3] > 0 ||
              body[(y * fw + x + 1) * 4 + 3] > 0
            ) {
              out[p] = 12; out[p + 1] = 16; out[p + 2] = 20; out[p + 3] = 255;
            }
          }
        }
      }
      for (let i = 0; i < out.length; i += 4) {
        if (body[i + 3] > 0) {
          out[i] = body[i]; out[i + 1] = body[i + 1]; out[i + 2] = body[i + 2]; out[i + 3] = 255;
        }
      }
      return out;
    }

    for (let i = 0; i < headings; i++) {
      const ang = (i / headings) * Math.PI * 2;
      const frame = renderOne(slices, ang, true);
      ctx.putImageData(new ImageData(frame, fw, fh), i * fw, 0);
      if (glowCtx && glowSlices) {
        const gFrame = renderOne(glowSlices, ang, false);
        glowCtx.putImageData(new ImageData(gFrame, fw, fh), i * fw, 0);
      }
    }

    return { canvas, glowCanvas, headings, frameW: fw, frameH: fh, anchorX: cx, anchorY: baseY };
  }

  function _ensurePropAtlases() {
    if (_propAtlases) return _propAtlases;

    // 1. Pine tree (radial -> 1 heading)
    const pine = _bakePropAtlas(
      _makeVoxelSlices(16, 16, 14, (z, x, y) => {
        const dx = x - 7.5;
        const dy = y - 7.5;
        const r = Math.hypot(dx, dy);
        if (z < 3) return r < 1.8 ? [82, 54, 34, 255] : null;
        const t = (z - 3) / 10;
        const rad = 6.6 * (1 - t * 0.82) + (z % 2 === 0 ? 0.6 : -0.3);
        if (r > rad) return null;
        const shade = 0.72 + 0.34 * t - dx * 0.035;
        return [
          Math.min(255, Math.round(24 * shade)),
          Math.min(255, Math.round(92 * shade)),
          Math.min(255, Math.round(46 * shade)),
          255,
        ];
      }),
      1,
      1.2
    );

    // 2. Oak tree (broad canopy, 1 heading)
    const oak = _bakePropAtlas(
      _makeVoxelSlices(18, 18, 12, (z, x, y) => {
        const dx = x - 8.5;
        const dy = y - 8.5;
        const r = Math.hypot(dx, dy);
        if (z < 3) return r < 2.1 ? [92, 62, 38, 255] : null;
        const t = (z - 3) / 8;
        const rad = 7.4 * Math.sin(Math.min(1, 0.25 + t * 0.85) * Math.PI);
        if (r > rad) return null;
        const shade = 0.74 + 0.34 * t - dx * 0.03;
        return [
          Math.min(255, Math.round(44 * shade)),
          Math.min(255, Math.round(118 * shade)),
          Math.min(255, Math.round(42 * shade)),
          255,
        ];
      }),
      1,
      1.1
    );

    // 3. Red/White Tire Wall (oriented)
    const tirewall = _bakePropAtlas(
      _makeVoxelSlices(8, 22, 6, (z, x, y) => {
        if (x < 1 || x > 6 || y < 1 || y > 20) return null;
        const block = Math.floor(y / 5) % 2 === 0;
        const top = z === 5 ? 1.12 : 0.92;
        if (block) return [Math.min(255, Math.round(215 * top)), 38, 42, 255];
        return [Math.min(255, Math.round(235 * top)), Math.min(255, Math.round(238 * top)), 244, 255];
      }),
      PROP_HEADINGS,
      0.85
    );

    // 4. Covered Grandstand + night floodlit fascia
    const gsSlices = _makeVoxelSlices(16, 36, 12, (z, x, y) => {
      if (y < 1 || y > 34 || x < 1 || x > 14) return null;
      if (z === 11) return [218, 224, 236, 255];
      if (z === 10 && (x === 2 || x === 13)) return [0, 200, 235, 255];
      if (z >= 2 && z <= 8 && x >= 3 && x <= 11 && x >= z + 1) {
        return (y + z) % 3 === 0 ? [225, 65, 65, 255] : [64, 78, 108, 255];
      }
      if (x <= 2 || y <= 2 || y >= 33) return [46, 52, 68, 255];
      return null;
    });
    const gsGlow = _makeVoxelSlices(16, 36, 12, (z, x, y) => {
      if (z === 10 && x === 13 && y % 5 === 2) return [255, 244, 198, 255];
      return null;
    });
    const grandstand = _bakePropAtlas(gsSlices, PROP_HEADINGS, 1.05, gsGlow);

    // 5. Pit Building + illuminated night garage bays
    const pitSlices = _makeVoxelSlices(14, 34, 10, (z, x, y) => {
      if (x < 1 || x > 12 || y < 1 || y > 32) return null;
      if (z === 9) return [56, 64, 82, 255];
      if (z === 8 && (x === 1 || x === 12)) return [0, 229, 255, 255];
      if (z <= 4 && x === 12 && y % 6 >= 2 && y % 6 <= 4) return [24, 28, 38, 255];
      return [94, 104, 124, 255];
    });
    const pitGlow = _makeVoxelSlices(14, 34, 10, (z, x, y) => {
      if (z >= 1 && z <= 3 && x === 12 && y % 6 >= 2 && y % 6 <= 4) return [255, 218, 128, 255];
      return null;
    });
    const pitbuilding = _bakePropAtlas(pitSlices, PROP_HEADINGS, 1.0, pitGlow);

    // 6. Start/Finish Gantry Pillar
    const gantryPillar = _bakePropAtlas(
      _makeVoxelSlices(6, 6, 13, (z, x, y) => {
        if (x < 1 || x > 4 || y < 1 || y > 4) return null;
        return z % 3 === 0 ? [0, 229, 255, 255] : [78, 88, 108, 255];
      }),
      1,
      1.05
    );

    _propAtlases = { pine, oak, tirewall, grandstand, pitbuilding, gantryPillar };
    return _propAtlases;
  }

  // ---- Deterministic Circuit Prop & Gantry Placement (Clear of All Track Segments) ----
  function _rebuildPropsForBoundTrack() {
    const trk = _getT();
    if (!trk || !trk.pts || trk.pts.length < 6) return;
    const key = trk.label + '|' + trk.pts.length + '|' + Math.round(trk.length || 0);
    if (key === _boundKey) return;
    _boundKey = key;
    _tileCache.clear();
    _sceneProps = [];
    _particles = [];

    const pts = trk.pts;
    const n = pts.length;
    const rng = _mulberry32((trk.label || 'track').split('').reduce((a, c) => a * 31 + c.charCodeAt(0), 1337));

    // Start/finish gantry at station 0
    const sf = pts[0];
    const halfW = (sf.w || 12) * 0.5;
    const gSpan = halfW + 2.4;
    _gantry = {
      x: sf.x,
      y: sf.y,
      lx: sf.x - sf.nx * gSpan,
      ly: sf.y - sf.ny * gSpan,
      rx: sf.x + sf.nx * gSpan,
      ry: sf.y + sf.ny * gSpan,
      hd: sf.hd,
    };
    _sceneProps.push({ kind: 'gantryPillar', x: _gantry.lx, y: _gantry.ly, hd: sf.hd, scale: 1 });
    _sceneProps.push({ kind: 'gantryPillar', x: _gantry.rx, y: _gantry.ry, hd: sf.hd, scale: 1 });

    // Helper: ensure prop is safely clear of every track segment (safe on figure-8 / tight hairpins)
    const stride = Math.max(1, Math.floor(n / 180));
    function clearOfTrack(x, y, minClear) {
      for (let i = 0; i < n; i += stride) {
        const p = pts[i];
        const dx = x - p.x;
        const dy = y - p.y;
        const lim = (p.w || 12) * 0.5 + minClear;
        if (dx * dx + dy * dy < lim * lim) return false;
      }
      return true;
    }

    // Pit building & main grandstand along start/finish straight
    for (let k = -1; k <= 1; k++) {
      const idx = (k * 4 + n) % n;
      const p = pts[idx];
      const px = p.x + p.nx * ((p.w || 12) * 0.5 + 11.5);
      const py = p.y + p.ny * ((p.w || 12) * 0.5 + 11.5);
      if (clearOfTrack(px, py, 6.0)) {
        _sceneProps.push({ kind: 'pitbuilding', x: px, y: py, hd: p.hd, scale: 1 });
      }
      const gx = p.x - p.nx * ((p.w || 12) * 0.5 + 13.5);
      const gy = p.y - p.ny * ((p.w || 12) * 0.5 + 13.5);
      if (clearOfTrack(gx, gy, 7.0)) {
        _sceneProps.push({ kind: 'grandstand', x: gx, y: gy, hd: p.hd + Math.PI, scale: 1 });
      }
    }

    // Tire walls on outer side of sharp corners + trees along track corridor
    const step = Math.max(2, Math.floor(n / 120));
    for (let i = 0; i < n; i += step) {
      const p = pts[i];
      if (Math.abs(p.curv) > 0.025) {
        const outSide = p.curv > 0 ? -1 : 1;
        const tx = p.x + p.nx * outSide * ((p.w || 12) * 0.5 + 4.4);
        const ty = p.y + p.ny * outSide * ((p.w || 12) * 0.5 + 4.4);
        if (clearOfTrack(tx, ty, 3.0)) {
          _sceneProps.push({ kind: 'tirewall', x: tx, y: ty, hd: p.hd, scale: 1 });
        }
      }
      for (let sideIdx = 0; sideIdx < 2; sideIdx++) {
        if (rng() > 0.58) continue;
        const side = sideIdx === 0 ? -1 : 1;
        const dist = (p.w || 12) * 0.5 + 8.5 + rng() * 18;
        const x = p.x + p.nx * side * dist;
        const y = p.y + p.ny * side * dist;
        if (clearOfTrack(x, y, 6.2)) {
          _sceneProps.push({
            kind: rng() > 0.42 ? 'pine' : 'oak',
            x,
            y,
            hd: 0,
            scale: 0.85 + rng() * 0.45,
          });
        }
      }
    }
  }

  // ---- Mode B Chunked/Tiled World Ground Cache (160m x 160m Tiles) ----
  function _getOrBakeWorldTile(tx, ty) {
    const wx = _getWX();
    const wet = wx ? (wx.wet || 0) : 0;
    const wetBucket = Math.round(wet * 4);
    const key = _boundKey + '|' + wetBucket + '|' + tx + '|' + ty;
    const hit = _tileCache.get(key);
    if (hit) {
      hit.lastUsed = performance.now();
      _tileHits++;
      return hit.canvas;
    }

    _tileMisses++;
    const canvas = document.createElement('canvas');
    canvas.width = WORLD_TILE_PX;
    canvas.height = WORLD_TILE_PX;
    const ctx = canvas.getContext('2d');
    const ox = tx * WORLD_TILE_M;
    const oy = ty * WORLD_TILE_M;
    const toX = (wxPos) => (wxPos - ox) * WORLD_PX_PER_M;
    const toY = (wyPos) => (wyPos - oy) * WORLD_PX_PER_M;

    const isWet = wet > 0.12;

    // 1. Mowed pixel-art grass backdrop
    ctx.fillStyle = isWet ? '#1b3622' : '#254a2c';
    ctx.fillRect(0, 0, WORLD_TILE_PX, WORLD_TILE_PX);
    ctx.fillStyle = isWet ? '#1f3e27' : '#2b5533';
    for (let s = 0; s < WORLD_TILE_PX; s += 32) {
      ctx.fillRect(s, 0, 16, WORLD_TILE_PX);
    }

    // Subtle grass grain speckles
    const rng = _mulberry32((tx * 73856093) ^ (ty * 19349663) ^ 42);
    ctx.fillStyle = isWet ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.045)';
    for (let g = 0; g < 180; g++) {
      ctx.fillRect(Math.floor(rng() * WORLD_TILE_PX), Math.floor(rng() * WORLD_TILE_PX), 2, 2);
    }

    // Check if any track points pass near this tile
    const trk = _getT();
    const pts = trk ? trk.pts : [];
    const n = pts.length;
    const padM = 28;
    let touchesTile = false;
    for (let i = 0; i < n; i++) {
      const p = pts[i];
      if (
        p.x >= ox - padM &&
        p.x <= ox + WORLD_TILE_M + padM &&
        p.y >= oy - padM &&
        p.y <= oy + WORLD_TILE_M + padM
      ) {
        touchesTile = true;
        break;
      }
    }

    if (touchesTile) {
      const avgW = pts[0].w || 12;
      const fillRibbon = (halfFn, style) => {
        ctx.save();
        ctx.fillStyle = style;
        ctx.beginPath();
        for (let i = 0; i <= n; i++) {
          const p = pts[i % n];
          const hw = halfFn(p);
          const x = toX(p.x + p.nx * hw);
          const y = toY(p.y + p.ny * hw);
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        for (let i = n; i >= 0; i--) {
          const p = pts[i % n];
          const hw = halfFn(p);
          ctx.lineTo(toX(p.x - p.nx * hw), toY(p.y - p.ny * hw));
        }
        ctx.closePath();
        ctx.fill('evenodd');
        ctx.restore();
      };
      const strokeCenterline = (widthM, style, dash) => {
        ctx.save();
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.lineWidth = widthM * WORLD_PX_PER_M;
        ctx.strokeStyle = style;
        if (dash) ctx.setLineDash(dash);
        ctx.beginPath();
        for (let i = 0; i <= n; i++) {
          const p = pts[i % n];
          if (i === 0) ctx.moveTo(toX(p.x), toY(p.y));
          else ctx.lineTo(toX(p.x), toY(p.y));
        }
        ctx.closePath();
        ctx.stroke();
        ctx.restore();
      };

      // 2. Variable-width gravel runoff & dark asphalt shoulder (matches track-scene.js)
      fillRibbon((p) => (p.w || avgW) * 0.5 + 3.1, isWet ? '#4c463b' : '#726a58');
      fillRibbon((p) => (p.w || avgW) * 0.5 + 0.55, '#141720');

      // 3. Main variable-width asphalt ribbon (with subtle crest highlight & wet darkening)
      fillRibbon((p) => (p.w || avgW) * 0.5, isWet ? '#1e2430' : '#2d323e');
      fillRibbon((p) => Math.max(1, (p.w || avgW) * 0.5 - 0.4), isWet ? '#232a38' : '#323846');

      // 4. Rubbered-in racing groove
      strokeCenterline(avgW * 0.34, isWet ? 'rgba(12,18,28,0.45)' : 'rgba(18,20,28,0.28)');

      // 5. Alternating red/white apex & exit curbs outside track edge (KERB_W = 0.8 m, racing-line-lap.js)
      const kerbs = trk && trk.kerbs ? trk.kerbs : null;
      ctx.lineCap = 'butt';
      for (let sideIdx = 0; sideIdx < 2; sideIdx++) {
        const side = sideIdx === 0 ? -1 : 1;
        const kArr = kerbs ? (side > 0 ? kerbs.P : kerbs.N) : null;
        for (let i = 0; i < n; i++) {
          const a = pts[i];
          if (kArr ? !kArr[i] : Math.abs(a.curv) < 0.028) continue;
          const b = pts[(i + 1) % n];
          if (
            a.x < ox - padM || a.x > ox + WORLD_TILE_M + padM ||
            a.y < oy - padM || a.y > oy + WORLD_TILE_M + padM
          ) continue;
          const offA = side * ((a.w || avgW) * 0.5 + 0.42);
          const offB = side * ((b.w || avgW) * 0.5 + 0.42);
          ctx.beginPath();
          ctx.moveTo(toX(a.x + a.nx * offA), toY(a.y + a.ny * offA));
          ctx.lineTo(toX(b.x + b.nx * offB), toY(b.y + b.ny * offB));
          ctx.strokeStyle = Math.floor(a.s / 3.2) % 2 === 0 ? '#dc2626' : '#f1f5f9';
          ctx.lineWidth = 0.85 * WORLD_PX_PER_M;
          ctx.stroke();
        }
      }

      // 6. Crisp white track-limit lines
      ctx.strokeStyle = isWet ? 'rgba(226,232,240,0.65)' : 'rgba(241,245,249,0.88)';
      ctx.lineWidth = Math.max(1.2, 0.22 * WORLD_PX_PER_M);
      for (let sideIdx = 0; sideIdx < 2; sideIdx++) {
        const side = sideIdx === 0 ? -1 : 1;
        ctx.beginPath();
        for (let i = 0; i <= n; i++) {
          const p = pts[i % n];
          const off = side * ((p.w || avgW) * 0.5 - 0.32);
          const x = toX(p.x + p.nx * off);
          const y = toY(p.y + p.ny * off);
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.stroke();
      }

      // 7. Start/Finish checkered line (if inside this tile)
      const sf = pts[0];
      if (sf.x >= ox - 20 && sf.x <= ox + WORLD_TILE_M + 20 && sf.y >= oy - 20 && sf.y <= oy + WORLD_TILE_M + 20) {
        ctx.save();
        ctx.translate(toX(sf.x), toY(sf.y));
        ctx.rotate(sf.hd);
        const halfPx = ((sf.w || avgW) * 0.5 - 0.4) * WORLD_PX_PER_M;
        const sq = 3;
        for (let r = 0; r < 2; r++) {
          for (let y = -halfPx; y < halfPx; y += sq) {
            ctx.fillStyle = (Math.floor((y + halfPx) / sq) + r) % 2 === 0 ? '#f8fafc' : '#0f172a';
            ctx.fillRect((r - 1) * sq, y, sq, Math.min(sq, halfPx - y));
          }
        }
        ctx.restore();
      }
    }

    // Evict oldest tile if cache exceeds LRU cap
    if (_tileCache.size >= WORLD_TILE_MAX) {
      let oldestKey = null;
      let oldestTs = Infinity;
      for (const [k, v] of _tileCache.entries()) {
        if (v.lastUsed < oldestTs) {
          oldestTs = v.lastUsed;
          oldestKey = k;
        }
      }
      if (oldestKey) _tileCache.delete(oldestKey);
    }

    _tileCache.set(key, { canvas, lastUsed: performance.now() });
    return canvas;
  }

  /** Paint visible Mode B world tiles in 1 affine drawImage per tile. */
  function _drawWorldTiles(ctx, cam) {
    const W = cam.W;
    const H = cam.H;
    const wm = _worldMatrix(cam);
    const inv = wm.inverse();
    const corners = [
      new DOMPoint(0, 0).matrixTransform(inv),
      new DOMPoint(W, 0).matrixTransform(inv),
      new DOMPoint(W, H).matrixTransform(inv),
      new DOMPoint(0, H).matrixTransform(inv),
    ];
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (let i = 0; i < 4; i++) {
      if (corners[i].x < minX) minX = corners[i].x;
      if (corners[i].x > maxX) maxX = corners[i].x;
      if (corners[i].y < minY) minY = corners[i].y;
      if (corners[i].y > maxY) maxY = corners[i].y;
    }

    const tx0 = Math.floor(minX / WORLD_TILE_M);
    const tx1 = Math.floor(maxX / WORLD_TILE_M);
    const ty0 = Math.floor(minY / WORLD_TILE_M);
    const ty1 = Math.floor(maxY / WORLD_TILE_M);

    // Guard against extreme zoom-out creating > 20 tiles in a single frame
    if ((tx1 - tx0 + 1) * (ty1 - ty0 + 1) > 20) return false;

    ctx.save();
    ctx.setTransform(_base.multiply(wm));
    ctx.imageSmoothingEnabled = false;
    for (let ty = ty0; ty <= ty1; ty++) {
      for (let tx = tx0; tx <= tx1; tx++) {
        const tile = _getOrBakeWorldTile(tx, ty);
        ctx.drawImage(tile, tx * WORLD_TILE_M, ty * WORLD_TILE_M, WORLD_TILE_M, WORLD_TILE_M);
      }
    }
    ctx.restore();
    return true;
  }

  /** Step & draw batched tire smoke and wet spray (1 path per kind). */
  function _stepAndDrawBatchedParticles(ctx, cam, cars) {
    const wx = _getWX();
    const wet = wx ? (wx.wet || 0) : 0;
    if (cars && _particles.length < 280) {
      for (let i = 0; i < cars.length; i++) {
        const car = cars[i];
        const brk = typeof car.brk === 'number' ? car.brk : car.brk ? 1 : 0;
        if (wet > 0.12 && Math.random() < 0.32) {
          _particles.push({
            x: car.x - Math.cos(car.hd) * 1.9,
            y: car.y - Math.sin(car.hd) * 1.9,
            vx: -Math.cos(car.hd) * 3.2,
            vy: -Math.sin(car.hd) * 3.2,
            life: 0,
            max: 0.36,
            kind: 'spray',
          });
        } else if (brk > 0.55 && Math.random() < 0.35) {
          _particles.push({
            x: car.x - Math.cos(car.hd) * 1.8,
            y: car.y - Math.sin(car.hd) * 1.8,
            vx: (Math.random() - 0.5) * 1.2,
            vy: (Math.random() - 0.5) * 1.2,
            life: 0,
            max: 0.45,
            kind: 'smoke',
          });
        }
      }
    }

    const dt = 1 / 60;
    for (let i = _particles.length - 1; i >= 0; i--) {
      const p = _particles[i];
      p.life += dt;
      if (p.life >= p.max) { _particles.splice(i, 1); continue; }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }

    if (_particles.length === 0) return;
    ctx.save();
    ctx.setTransform(_base);

    ctx.fillStyle = 'rgba(218, 224, 236, 0.44)';
    ctx.beginPath();
    for (let i = 0; i < _particles.length; i++) {
      const p = _particles[i];
      if (p.kind !== 'smoke') continue;
      const pr = _project(cam, p.x, p.y, 0.4 + p.life * 1.2);
      const sz = Math.max(1, Math.round((1.8 + p.life * 2.4) * (cam.scale / 6)));
      ctx.rect(Math.round(pr.sx - sz * 0.5), Math.round(pr.sy - sz * 0.5), sz, sz);
    }
    ctx.fill();

    if (wet > 0.08) {
      ctx.fillStyle = 'rgba(186, 230, 253, 0.40)';
      ctx.beginPath();
      for (let i = 0; i < _particles.length; i++) {
        const p = _particles[i];
        if (p.kind !== 'spray') continue;
        const pr = _project(cam, p.x, p.y, 0.45 + p.life * 1.5);
        const sz = Math.max(1, Math.round(1.7 * (cam.scale / 6)));
        ctx.rect(Math.round(pr.sx), Math.round(pr.sy), sz, sz);
      }
      ctx.fill();
    }
    ctx.restore();
  }

  /** Paint unified Mode B world + depth-sorted 3D props & stacked cars + night glow. */
  function scenePaintV2(ctx, cam, opts) {
    _rebuildPropsForBoundTrack();
    const atlases = _ensurePropAtlases();
    const b = _bridge();
    const maxW = b ? b.SCENE_MAX_W : (typeof SCENE_MAX_W !== 'undefined' ? SCENE_MAX_W : 480);
    const k = Math.min(1, maxW / cam.W);
    const W = Math.max(1, Math.round(cam.W * k));
    const H = Math.max(1, Math.round(cam.H * k));
    if (!_layer) _layer = document.createElement('canvas');
    if (_layer.width !== W || _layer.height !== H) { _layer.width = W; _layer.height = H; }
    const g = _layer.getContext('2d');
    _base = new DOMMatrix([k, 0, 0, k, 0, 0]);
    if (b) {
      b.setLAYER(_layer);
      b.setBASE(_base);
    }
    opts = opts || {};
    const tod = _getTOD();

    g.save();
    g.setTransform(_base);

    // 1. Ground & Track (Mode B tiled world cache; graceful fallback to legacy drawStill on extreme overview)
    const paintedTiles = _modeBEnabled && _drawWorldTiles(g, cam);
    if (!paintedTiles && b && b.drawStill) {
      b.drawStill(g, cam, opts);
    }

    // 1b. Pre-light ground darkening at night so headlamp beams illuminate dark asphalt
    g.setTransform(_base);
    if (paintedTiles && tod === 'night') {
      g.fillStyle = 'rgba(6, 10, 24, 0.50)';
      g.fillRect(0, 0, cam.W, cam.H);
    }

    // 2. Color-coded racing-line overlay (drawStill already painted it in daytime overview)
    if (b && b.drawLimits && (paintedTiles || tod === 'night')) {
      b.drawLimits(g, cam, opts);
    }

    // 3. Pre-car asphalt lighting (twin headlamp beams + red tarmac brake wash)
    const cars = opts.cars || [];
    for (let i = 0; i < cars.length; i++) {
      const car = cars[i];
      const handled = typeof drawStackedCarLights === 'function' && drawStackedCarLights(g, cam, car);
      if (!handled && (tod === 'night' || tod === 'sunset') && b && b.drawHeadlights) {
        b.drawHeadlights(g, cam, car);
      }
    }

    // 4. Unified Back-to-Front Painter's List (Cars + 3D Sprite-Stacked Props + Gantry Bridge)
    const drawList = [];
    for (let i = 0; i < cars.length; i++) {
      const pr = _project(cam, cars[i].x, cars[i].y, 0);
      if (pr.sx < -90 || pr.sx > cam.W + 90 || pr.sy < -90 || pr.sy > cam.H + 90) continue;
      drawList.push({ sy: pr.sy, kind: 'car', car: cars[i], pr });
    }
    if (paintedTiles) {
      for (let i = 0; i < _sceneProps.length; i++) {
        const prop = _sceneProps[i];
        const pr = _project(cam, prop.x, prop.y, 0);
        if (pr.sx < -120 || pr.sx > cam.W + 120 || pr.sy < -120 || pr.sy > cam.H + 120) continue;
        drawList.push({ sy: pr.sy, kind: 'prop', prop, pr });
      }
      if (_gantry) {
        const gp = _project(cam, _gantry.x, _gantry.y, 0);
        if (gp.sx > -140 && gp.sx < cam.W + 140 && gp.sy > -140 && gp.sy < cam.H + 140) {
          drawList.push({ sy: gp.sy + 2.4 * cam.scale * 0.25, kind: 'gantry', pr: gp });
        }
      }
    }
    drawList.sort((a, bItem) => a.sy - bItem.sy);

    const nightGlowOps = [];

    for (let i = 0; i < drawList.length; i++) {
      const item = drawList[i];
      if (item.kind === 'car') {
        const usedStack = typeof drawStackedCar === 'function' && drawStackedCar(g, cam, item.car);
        if (!usedStack && b && b.drawCar) {
          b.drawCar(g, cam, item.car);
        }
      } else if (item.kind === 'prop') {
        const prop = item.prop;
        const atl = atlases[prop.kind];
        if (!atl) continue;
        const worldUnits =
          prop.kind === 'grandstand' ? 15.0 :
          prop.kind === 'pitbuilding' ? 14.0 :
          prop.kind === 'tirewall' ? 4.2 :
          prop.kind === 'gantryPillar' ? 3.2 : 6.6 * prop.scale;
        let bin = 0;
        if (atl.headings > 1) {
          const p1 = _project(cam, prop.x + Math.cos(prop.hd), prop.y + Math.sin(prop.hd), 0);
          const screenAngle = Math.atan2((p1.sy - item.pr.sy) / PROP_SQUASH, p1.sx - item.pr.sx);
          const atlasAngle = screenAngle - Math.PI * 0.5;
          const norm = ((atlasAngle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
          bin = Math.round((norm / (Math.PI * 2)) * atl.headings) % atl.headings;
        }
        const ds = (worldUnits * cam.scale) / Math.max(atl.frameW * 0.65, 10);
        const dw = Math.max(3, Math.round(atl.frameW * ds));
        const dh = Math.max(3, Math.round(atl.frameH * ds));
        const dx = Math.round(item.pr.sx - atl.anchorX * ds);
        const dy = Math.round(item.pr.sy - atl.anchorY * ds);
        g.imageSmoothingEnabled = false;
        g.drawImage(atl.canvas, bin * atl.frameW, 0, atl.frameW, atl.frameH, dx, dy, dw, dh);
        if (tod === 'night' && atl.glowCanvas) {
          const gc = atl.glowCanvas;
          const fw = atl.frameW;
          const fh = atl.frameH;
          const bIdx = bin;
          nightGlowOps.push(() => g.drawImage(gc, bIdx * fw, 0, fw, fh, dx, dy, dw, dh));
        }
      } else if (item.kind === 'gantry' && _gantry) {
        const pL = _project(cam, _gantry.lx, _gantry.ly, 6.0);
        const pR = _project(cam, _gantry.rx, _gantry.ry, 6.0);
        const thick = Math.max(4, Math.round(1.5 * cam.scale));
        g.save();
        g.lineCap = 'butt';
        g.strokeStyle = '#0e1018';
        g.lineWidth = thick + 2;
        g.beginPath(); g.moveTo(pL.sx, pL.sy); g.lineTo(pR.sx, pR.sy); g.stroke();
        g.strokeStyle = '#1e293b';
        g.lineWidth = thick;
        g.stroke();
        g.strokeStyle = '#00e5ff';
        g.lineWidth = Math.max(1, Math.round(thick * 0.25));
        g.stroke();
        g.restore();
      }
    }

    // 5. Batched smoke & wet spray particles
    _stepAndDrawBatchedParticles(g, cam, cars);

    // 6. Time-of-day atmospheric grading + additive night prop glow
    g.setTransform(_base);
    if (paintedTiles && tod === 'night') {
      g.fillStyle = 'rgba(6, 10, 24, 0.20)';
      g.fillRect(0, 0, cam.W, cam.H);
    } else if (tod === 'sunset') {
      g.fillStyle = 'rgba(249, 115, 22, 0.14)';
      g.fillRect(0, 0, cam.W, cam.H);
    }
    if (nightGlowOps.length > 0) {
      g.save();
      g.globalCompositeOperation = 'lighter';
      for (let i = 0; i < nightGlowOps.length; i++) nightGlowOps[i]();
      g.restore();
    }

    if (b && b.drawAtmosphere) b.drawAtmosphere(g, cam);
    g.restore();

    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(_layer, 0, 0, cam.W, cam.H);
    ctx.restore();
  }

  // Expose public hooks + diagnostics for automated tests (test-sprite-stacks.mjs)
  window.sceneFollow = sceneFollow;
  window.sceneChaseV2 = sceneChaseV2;
  window.scenePaintV2 = scenePaintV2;
  window.sceneV2Stats = function () {
    return {
      modeB: _modeBEnabled,
      tilesCached: _tileCache.size,
      tileHits: _tileHits,
      tileMisses: _tileMisses,
      propsPlaced: _sceneProps.length,
    };
  };
  window.sceneSetModeB = function (on) {
    _modeBEnabled = !!on;
  };

  // Keep reference to legacy renderer
  if (typeof window !== 'undefined') {
    const b = _bridge();
    window._legacyScenePaint = b ? b.legacyPaint : null;
  }
})();
