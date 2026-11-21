// Sprite-stacked 3D car renderer & lazy 64-heading atlas cache (Phase 1).
//
// Classic script (no ES modules, no runtime dependencies, file://-safe) included by
// src/shell.html via:  <!-- @include js/car-stacks.js -->
//
// Loads compact pre-sliced strips from assets/cars/stacks/<slug>.png on demand,
// asserts stripWidth % slices === 0, and lazily bakes a 64-heading + Z-interleaved
// 3-pose (-28deg / 0deg / +28deg) atlas with an LRU cap so even 50-car mixed grids
// stay fast and light on mobile RAM. Any car without a strip returns false from
// drawStackedCar() so track-scene.js falls back seamlessly to legacy drawCar().

const CAR_STACKS_DIR = 'assets/cars/stacks/';
const CAR_STACK_HEADINGS = 64;
const CAR_STACK_SQUASH = 0.78;
const CAR_STACK_STEER_RAD = 0.48; // ~27.5 deg front-wheel lock
const CAR_STACK_MAX_BAKED = 24;   // LRU cap in RAM (~24-36 MB peak on mobile)

// Auto-updated by tools/slice-cars.mjs or Batch Pipeline export.
const CAR_STACKS = {
  "Toyota GR Yaris (2020)": {"slug":"toyota-gr-yaris-2020","slices":26,"sliceW":44,"sliceL":81,"spacing":0.4765,"frontAxle":0.7952,"len":3.995,"w":1.805,"h":1.455},
  "Honda S2000 (AP1, 2000)": {"slug":"honda-s2000-ap1-2000","slices":24,"sliceW":45,"sliceL":89,"spacing":0.4784,"frontAxle":0.8129,"len":4.135,"w":1.75,"h":1.27},
  "Porsche 911 GT3 (991.2, 2017)": {"slug":"porsche-911-gt3-991-2-2017","slices":24,"sliceW":43,"sliceL":93,"spacing":0.4534,"frontAxle":0.7497,"len":4.562,"w":1.852,"h":1.271},
  "Ferrari F40 (1987)": {"slug":"ferrari-f40-1987","slices":22,"sliceW":44,"sliceL":90,"spacing":0.4431,"frontAxle":0.7483,"len":4.358,"w":1.97,"h":1.124}
};

const _stackCache = new Map();     // slug -> { status, img, atlas, lastUsed }
let _stackLights = null;           // pre-baked zero-allocation optical light textures

function _stackMeta(name) {
  if (!name) return null;
  return CAR_STACKS[name] || CAR_STACKS[name.replace(/\s+#\d+$/, '')] || null;
}

function hasCarStack(name) {
  return !!_stackMeta(name);
}

function _buildStackLightSprites() {
  if (_stackLights) return _stackLights;

  // 1. Single headlamp optical beam cone (64x32, lamp origin at x=0, y=16 pointing +X)
  const headBeam = document.createElement('canvas');
  headBeam.width = 64;
  headBeam.height = 32;
  {
    const ctx = headBeam.getContext('2d');
    const img = ctx.createImageData(64, 32);
    const d = img.data;
    for (let y = 0; y < 32; y++) {
      const v = (y - 15.5) / 15.5;
      for (let x = 0; x < 64; x++) {
        const u = x / 63;
        const halfW = 0.075 + 0.885 * Math.pow(u, 0.78);
        const t = Math.abs(v) / halfW;
        if (t >= 1) continue;
        const entry = Math.min(1, (x + 0.75) / 2.2);
        const latFall = Math.pow(1 - t * t, 1.9);
        const longFall = Math.pow(1 - u, 1.48);
        const core = Math.exp(-t * t * 5.6) * Math.pow(1 - u, 1.75) * 0.52;
        const val = Math.min(1, entry * (latFall * longFall * 0.64 + core));
        if (val <= 0.004) continue;
        const p = (y * 64 + x) * 4;
        const warmMix = Math.min(1, u * 0.55 + t * 0.45);
        d[p] = 255;
        d[p + 1] = Math.round(252 - warmMix * 16);
        d[p + 2] = Math.round(234 - warmMix * 56);
        d[p + 3] = Math.round(val * 170);
      }
    }
    ctx.putImageData(img, 0, 0);
  }

  // 2. Twin-lobed red asphalt tail/brake reflection wash (36x28)
  const tailWash = document.createElement('canvas');
  tailWash.width = 36;
  tailWash.height = 28;
  {
    const ctx = tailWash.getContext('2d');
    const img = ctx.createImageData(36, 28);
    const d = img.data;
    for (let y = 0; y < 28; y++) {
      const v = (y - 13.5) / 13.5;
      for (let x = 0; x < 36; x++) {
        const u = x / 35;
        const dL = Math.hypot(u * 1.08, (v + 0.34) * 1.32);
        const dR = Math.hypot(u * 1.08, (v - 0.34) * 1.32);
        const lobeL = dL < 1 ? Math.pow(1 - dL, 2.0) : 0;
        const lobeR = dR < 1 ? Math.pow(1 - dR, 2.0) : 0;
        const entry = Math.min(1, (x + 0.6) / 2.2);
        const val = Math.min(1, entry * (lobeL + lobeR) * Math.pow(1 - u, 0.7) * 0.88);
        if (val <= 0.004) continue;
        const p = (y * 36 + x) * 4;
        d[p] = 255;
        d[p + 1] = Math.round(24 + val * 34);
        d[p + 2] = Math.round(18 + val * 20);
        d[p + 3] = Math.round(val * 185);
      }
    }
    ctx.putImageData(img, 0, 0);
  }

  // 3. Brake-light radial bloom with hot incandescent center (24x24)
  const brakeGlow = document.createElement('canvas');
  brakeGlow.width = 24;
  brakeGlow.height = 24;
  {
    const ctx = brakeGlow.getContext('2d');
    const img = ctx.createImageData(24, 24);
    const d = img.data;
    for (let y = 0; y < 24; y++) {
      for (let x = 0; x < 24; x++) {
        const r = Math.hypot(x - 11.5, y - 11.5) / 11.5;
        if (r >= 1) continue;
        const halo = Math.pow(1 - r, 2.55);
        const core = Math.exp(-r * r * 14);
        const a = Math.min(1, halo * 0.82 + core * 0.72);
        const p = (y * 24 + x) * 4;
        d[p] = 255;
        d[p + 1] = Math.round(28 + core * 182);
        d[p + 2] = Math.round(22 + core * 158);
        d[p + 3] = Math.round(a * 255);
      }
    }
    ctx.putImageData(img, 0, 0);
  }

  // 4. Warm-white headlamp lens flare (20x20)
  const headLens = document.createElement('canvas');
  headLens.width = 20;
  headLens.height = 20;
  {
    const ctx = headLens.getContext('2d');
    const img = ctx.createImageData(20, 20);
    const d = img.data;
    for (let y = 0; y < 20; y++) {
      for (let x = 0; x < 20; x++) {
        const r = Math.hypot(x - 9.5, y - 9.5) / 9.5;
        if (r >= 1) continue;
        const halo = Math.pow(1 - r, 2.5);
        const core = Math.exp(-r * r * 13);
        const a = Math.min(1, halo * 0.78 + core * 0.75);
        const p = (y * 20 + x) * 4;
        d[p] = 255;
        d[p + 1] = Math.round(236 + core * 19);
        d[p + 2] = Math.round(176 + core * 72);
        d[p + 3] = Math.round(a * 255);
      }
    }
    ctx.putImageData(img, 0, 0);
  }

  _stackLights = { headBeam, tailWash, brakeGlow, headLens };
  return _stackLights;
}

function _evictOldestBakedStack() {
  if (_stackCache.size <= CAR_STACK_MAX_BAKED) return;
  let oldestKey = null;
  let oldestTs = Infinity;
  for (const [k, v] of _stackCache.entries()) {
    if (v.status === 'ready' && v.lastUsed < oldestTs) {
      oldestTs = v.lastUsed;
      oldestKey = k;
    }
  }
  if (oldestKey) _stackCache.delete(oldestKey);
}

/**
 * Render one heading frame from raw slice RGBA buffers with optional Z-interleaved
 * steered front wheels (strictly below upper fender/hood slices) + 1px dark outline + shadow.
 */
function _renderStackFrame(slices, w, h, angleRad, spacing, frontAxleFrac, steerRad) {
  const n = slices.length;
  const squash = CAR_STACK_SQUASH;
  const diag = Math.ceil(Math.hypot(w, h));
  const stackLift = Math.ceil((n - 1) * spacing);
  const pad = 6;
  const cw = diag + pad * 2;
  const ch = Math.ceil(diag * squash) + stackLift + pad * 2;
  const cx = Math.floor(cw / 2);
  const baseY = ch - pad - Math.ceil((diag * squash) / 2);

  const out = new Uint8ClampedArray(cw * ch * 4);
  const body = new Uint8ClampedArray(cw * ch * 4);
  const ca = Math.cos(angleRad);
  const sa = Math.sin(angleRad);
  const halfW = (w - 1) * 0.5;
  const halfH = (h - 1) * 0.5;
  const extX = Math.ceil(diag * 0.5) + 1;
  const extY = Math.ceil(diag * 0.5 * squash) + 1;

  // Ground shadow footprint from slice 0..1 union
  const foot = new Uint8Array(w * h);
  const footLayers = Math.min(2, n);
  for (let z = 0; z < footLayers; z++) {
    const d = slices[z];
    for (let i = 0; i < w * h; i++) {
      if (d[i * 4 + 3] > 0) foot[i] = 1;
    }
  }
  const shOffX = 3;
  const shOffY = 2;
  const sy0 = Math.max(0, baseY + shOffY - extY);
  const sy1 = Math.min(ch - 1, baseY + shOffY + extY);
  const sx0 = Math.max(0, cx + shOffX - extX);
  const sx1 = Math.min(cw - 1, cx + shOffX + extX);
  for (let y = sy0; y <= sy1; y++) {
    const dy = (y - (baseY + shOffY)) / squash;
    for (let x = sx0; x <= sx1; x++) {
      const dx = x - (cx + shOffX);
      const sx = Math.round(dx * ca + dy * sa + halfW);
      const sy = Math.round(-dx * sa + dy * ca + halfH);
      if (sx >= 0 && sx < w && sy >= 0 && sy < h && foot[sy * w + sx]) {
        const p = (y * cw + x) * 4;
        out[p] = 8;
        out[p + 1] = 10;
        out[p + 2] = 16;
        out[p + 3] = 122;
      }
    }
  }

  // Z-interleaved steered front tires (layers 0..wheelMaxZ only)
  const hasSteer = Math.abs(steerRad) > 0.015;
  const wheelMaxZ = Math.max(2, Math.floor(n * 0.28));
  const axleY = frontAxleFrac * (h - 1);
  const wheelLen = Math.max(5, Math.round(h * 0.165));
  const wheelThick = Math.max(2, Math.round(w * 0.145));
  const halfTrackX = halfW * 0.92;
  const axleOffY = axleY - halfH;
  const wAng = angleRad + steerRad;
  const wca = Math.cos(wAng);
  const wsa = Math.sin(wAng);

  function stampFrontWheels(z, liftY) {
    if (!hasSteer || z > wheelMaxZ) return;
    const zNorm = (z - wheelMaxZ * 0.5) / Math.max(1, wheelMaxZ * 0.5);
    const halfLenZ = wheelLen * 0.5 * Math.sqrt(Math.max(0.2, 1 - zNorm * zNorm * 0.72));
    const halfThick = wheelThick * 0.5;
    const rimZone = Math.abs(zNorm) < 0.58;
    for (let sIdx = 0; sIdx < 2; sIdx++) {
      const side = sIdx === 0 ? -1 : 1;
      const lx = side * halfTrackX;
      const ly = axleOffY;
      const hubX = cx + (lx * ca - ly * sa);
      const hubY = baseY - liftY + (lx * sa + ly * ca) * squash;
      const rBound = Math.ceil(Math.hypot(halfLenZ, halfThick)) + 2;
      const wy0 = Math.max(0, Math.floor(hubY - rBound * squash));
      const wy1 = Math.min(ch - 1, Math.ceil(hubY + rBound * squash));
      const wx0 = Math.max(0, Math.floor(hubX - rBound));
      const wx1 = Math.min(cw - 1, Math.ceil(hubX + rBound));
      for (let y = wy0; y <= wy1; y++) {
        const dy = (y - hubY) / squash;
        for (let x = wx0; x <= wx1; x++) {
          const dx = x - hubX;
          const u = dx * wca + dy * wsa;
          const v = -dx * wsa + dy * wca;
          if (Math.abs(u) <= halfThick && Math.abs(v) <= halfLenZ) {
            const dp = (y * cw + x) * 4;
            const isOuter = side > 0 ? u > halfThick - 1.1 : u < -halfThick + 1.1;
            const isRim = rimZone && isOuter && Math.abs(v) <= halfLenZ * 0.55;
            if (isRim) {
              body[dp] = 178; body[dp + 1] = 186; body[dp + 2] = 198;
            } else {
              const t = z === 0 ? 22 : z === wheelMaxZ ? 46 : 34;
              body[dp] = t; body[dp + 1] = t + 2; body[dp + 2] = t + 6;
            }
            body[dp + 3] = 255;
          }
        }
      }
    }
  }

  for (let z = 0; z < n; z++) {
    const liftY = Math.round(z * spacing);
    const sData = slices[z];
    const y0 = Math.max(0, baseY - liftY - extY);
    const y1 = Math.min(ch - 1, baseY - liftY + extY);
    const x0 = Math.max(0, cx - extX);
    const x1 = Math.min(cw - 1, cx + extX);
    for (let y = y0; y <= y1; y++) {
      const dy = (y - (baseY - liftY)) / squash;
      for (let x = x0; x <= x1; x++) {
        const dx = x - cx;
        const sx = Math.round(dx * ca + dy * sa + halfW);
        const sy = Math.round(-dx * sa + dy * ca + halfH);
        if (sx >= 0 && sx < w && sy >= 0 && sy < h) {
          const sp = (sy * w + sx) * 4;
          if (sData[sp + 3] > 0) {
            const dp = (y * cw + x) * 4;
            body[dp] = sData[sp];
            body[dp + 1] = sData[sp + 1];
            body[dp + 2] = sData[sp + 2];
            body[dp + 3] = 255;
          }
        }
      }
    }
    stampFrontWheels(z, liftY);
  }

  // Single 1px dark outline around the finished stacked silhouette
  for (let y = 1; y < ch - 1; y++) {
    for (let x = 1; x < cw - 1; x++) {
      const p = (y * cw + x) * 4;
      if (body[p + 3] > 0) continue;
      if (
        body[((y - 1) * cw + x) * 4 + 3] > 0 ||
        body[((y + 1) * cw + x) * 4 + 3] > 0 ||
        body[(y * cw + x - 1) * 4 + 3] > 0 ||
        body[(y * cw + x + 1) * 4 + 3] > 0
      ) {
        out[p] = 14; out[p + 1] = 16; out[p + 2] = 24; out[p + 3] = 255;
      }
    }
  }
  for (let i = 0; i < out.length; i += 4) {
    if (body[i + 3] > 0) {
      out[i] = body[i]; out[i + 1] = body[i + 1]; out[i + 2] = body[i + 2]; out[i + 3] = 255;
    }
  }

  return { data: out, w: cw, h: ch, anchorX: cx, anchorY: baseY };
}

/**
 * Zero-getImageData Canvas 2D fallback baker for file:// URLs where local PNGs taint
 * the canvas and forbid getImageData. Preserves identical 64-heading geometry, shadow,
 * Z-interleaved steered front wheels, and 1px dark silhouette outline.
 */
function _bakeCarAtlasCanvas2D(img, meta, w, h, count, spacing, frontAxle) {
  const squash = CAR_STACK_SQUASH;
  const diag = Math.ceil(Math.hypot(w, h));
  const stackLift = Math.ceil((count - 1) * spacing);
  const pad = 6;
  const fw = diag + pad * 2;
  const fh = Math.ceil(diag * squash) + stackLift + pad * 2;
  const cx = Math.floor(fw / 2);
  const baseY = fh - pad - Math.ceil((diag * squash) / 2);

  const halfW = (w - 1) * 0.5;
  const halfH = (h - 1) * 0.5;
  const wheelMaxZ = Math.max(2, Math.floor(count * 0.28));
  const axleOffY = frontAxle * (h - 1) - halfH;
  const wheelLen = Math.max(5, Math.round(h * 0.165));
  const wheelThick = Math.max(2, Math.round(w * 0.145));
  const halfTrackX = halfW * 0.92;

  const makeStrip = () => {
    const c = document.createElement('canvas');
    c.width = fw * CAR_STACK_HEADINGS;
    c.height = fh;
    return c;
  };
  const canvas = makeStrip();
  const steerLeftCanvas = makeStrip();
  const steerRightCanvas = makeStrip();
  const bodyCan = document.createElement('canvas');
  bodyCan.width = fw; bodyCan.height = fh;
  const bCtx = bodyCan.getContext('2d');
  const silCan = document.createElement('canvas');
  silCan.width = fw; silCan.height = fh;
  const sCtx = silCan.getContext('2d');
  const shCan = document.createElement('canvas');
  shCan.width = fw; shCan.height = fh;
  const shCtx = shCan.getContext('2d');

  function paintPose(destCtx, frameIdx, ang, steerRad) {
    const ox = frameIdx * fw;
    const hasSteer = Math.abs(steerRad) > 0.015;
    const ca = Math.cos(ang);
    const sa = Math.sin(ang);

    // 1. Ground shadow from slices 0..1
    shCtx.clearRect(0, 0, fw, fh);
    shCtx.globalCompositeOperation = 'source-over';
    shCtx.imageSmoothingEnabled = false;
    const footLayers = Math.min(2, count);
    for (let z = 0; z < footLayers; z++) {
      shCtx.save();
      shCtx.translate(cx + 3, baseY + 2);
      shCtx.scale(1, squash);
      shCtx.rotate(ang);
      shCtx.drawImage(img, z * w, 0, w, h, -w * 0.5, -h * 0.5, w, h);
      shCtx.restore();
    }
    shCtx.globalCompositeOperation = 'source-atop';
    shCtx.fillStyle = 'rgba(8, 10, 16, 0.48)';
    shCtx.fillRect(0, 0, fw, fh);
    shCtx.globalCompositeOperation = 'source-over';

    // 2. Stacked body slices + Z-interleaved steered front wheels
    bCtx.clearRect(0, 0, fw, fh);
    bCtx.imageSmoothingEnabled = false;
    for (let z = 0; z < count; z++) {
      const liftY = Math.round(z * spacing);
      bCtx.save();
      bCtx.translate(cx, baseY - liftY);
      bCtx.scale(1, squash);
      bCtx.rotate(ang);
      bCtx.drawImage(img, z * w, 0, w, h, -w * 0.5, -h * 0.5, w, h);
      bCtx.restore();

      if (hasSteer && z <= wheelMaxZ) {
        const zNorm = (z - wheelMaxZ * 0.5) / Math.max(1, wheelMaxZ * 0.5);
        const halfLenZ = wheelLen * 0.5 * Math.sqrt(Math.max(0.2, 1 - zNorm * zNorm * 0.72));
        const t = z === 0 ? 22 : z === wheelMaxZ ? 46 : 34;
        bCtx.fillStyle = 'rgb(' + t + ',' + (t + 2) + ',' + (t + 6) + ')';
        for (let sIdx = 0; sIdx < 2; sIdx++) {
          const lx = (sIdx === 0 ? -1 : 1) * halfTrackX;
          const hubX = cx + (lx * ca - axleOffY * sa);
          const hubY = baseY - liftY + (lx * sa + axleOffY * ca) * squash;
          bCtx.save();
          bCtx.translate(hubX, hubY);
          bCtx.scale(1, squash);
          bCtx.rotate(ang + steerRad);
          bCtx.fillRect(-wheelThick * 0.5, -halfLenZ, wheelThick, halfLenZ * 2);
          bCtx.restore();
        }
      }
    }

    // 3. 1px dark outline silhouette
    sCtx.clearRect(0, 0, fw, fh);
    sCtx.globalCompositeOperation = 'source-over';
    sCtx.imageSmoothingEnabled = false;
    sCtx.drawImage(bodyCan, 0, 0);
    sCtx.globalCompositeOperation = 'source-atop';
    sCtx.fillStyle = '#0e1018';
    sCtx.fillRect(0, 0, fw, fh);
    sCtx.globalCompositeOperation = 'source-over';

    // 4. Composite shadow + 4-neighbor outline + stacked body
    destCtx.imageSmoothingEnabled = false;
    destCtx.drawImage(shCan, ox, 0);
    destCtx.drawImage(silCan, ox - 1, 0);
    destCtx.drawImage(silCan, ox + 1, 0);
    destCtx.drawImage(silCan, ox, -1);
    destCtx.drawImage(silCan, ox, 1);
    destCtx.drawImage(bodyCan, ox, 0);
  }

  const ctx0 = canvas.getContext('2d');
  const ctxL = steerLeftCanvas.getContext('2d');
  const ctxR = steerRightCanvas.getContext('2d');
  for (let i = 0; i < CAR_STACK_HEADINGS; i++) {
    const ang = (i / CAR_STACK_HEADINGS) * Math.PI * 2;
    paintPose(ctx0, i, ang, 0);
    paintPose(ctxL, i, ang, -CAR_STACK_STEER_RAD);
    paintPose(ctxR, i, ang, CAR_STACK_STEER_RAD);
  }

  return {
    canvas,
    steerLeftCanvas,
    steerRightCanvas,
    headings: CAR_STACK_HEADINGS,
    frameW: fw,
    frameH: fh,
    anchorX: cx,
    anchorY: baseY,
    sliceW: w,
    sliceL: h,
    slices: count,
    spacing,
    meta,
  };
}

/** Bake 64-heading + 3-steer-pose atlas canvases from a loaded PNG slice strip. */
function _bakeCarAtlasFromStrip(img, meta) {
  const count = meta.slices;
  if (!img.naturalWidth || img.naturalWidth % count !== 0) {
    throw new Error('Invalid slice strip width for ' + meta.slug + ': ' + img.naturalWidth + ' % ' + count);
  }
  const w = img.naturalWidth / count;
  const h = img.naturalHeight;
  const spacing = meta.spacing || (0.42 * (h / meta.len) * (meta.h / count));
  const frontAxle = meta.frontAxle || 0.78;

  let slices = null;
  try {
    const tmp = document.createElement('canvas');
    tmp.width = img.naturalWidth;
    tmp.height = h;
    const tCtx = tmp.getContext('2d', { willReadFrequently: true });
    tCtx.drawImage(img, 0, 0);
    slices = [];
    for (let z = 0; z < count; z++) {
      slices.push(tCtx.getImageData(z * w, 0, w, h).data);
    }
  } catch (err) {
    // file:// origins taint the 2D canvas; fall back seamlessly to pure drawImage baker
    return _bakeCarAtlasCanvas2D(img, meta, w, h, count, spacing, frontAxle);
  }

  const sample = _renderStackFrame(slices, w, h, 0, spacing, frontAxle, 0);
  const fw = sample.w;
  const fh = sample.h;

  const makeStrip = () => {
    const c = document.createElement('canvas');
    c.width = fw * CAR_STACK_HEADINGS;
    c.height = fh;
    return c;
  };
  const canvas = makeStrip();
  const steerLeftCanvas = makeStrip();
  const steerRightCanvas = makeStrip();
  const ctx0 = canvas.getContext('2d');
  const ctxL = steerLeftCanvas.getContext('2d');
  const ctxR = steerRightCanvas.getContext('2d');

  for (let i = 0; i < CAR_STACK_HEADINGS; i++) {
    const ang = (i / CAR_STACK_HEADINGS) * Math.PI * 2;
    const f0 = _renderStackFrame(slices, w, h, ang, spacing, frontAxle, 0);
    ctx0.putImageData(new ImageData(f0.data, fw, fh), i * fw, 0);
    const fL = _renderStackFrame(slices, w, h, ang, spacing, frontAxle, -CAR_STACK_STEER_RAD);
    ctxL.putImageData(new ImageData(fL.data, fw, fh), i * fw, 0);
    const fR = _renderStackFrame(slices, w, h, ang, spacing, frontAxle, CAR_STACK_STEER_RAD);
    ctxR.putImageData(new ImageData(fR.data, fw, fh), i * fw, 0);
  }

  return {
    canvas,
    steerLeftCanvas,
    steerRightCanvas,
    headings: CAR_STACK_HEADINGS,
    frameW: fw,
    frameH: fh,
    anchorX: sample.anchorX,
    anchorY: sample.anchorY,
    sliceW: w,
    sliceL: h,
    slices: count,
    spacing,
    meta,
  };
}

/** Kick off lazy image load & bake for a factory car name (file://-safe). */
function preloadCarStack(name) {
  const meta = _stackMeta(name);
  if (!meta) return null;
  let rec = _stackCache.get(meta.slug);
  if (rec) {
    rec.lastUsed = performance.now();
    return rec.status === 'ready' ? rec.atlas : null;
  }
  rec = { status: 'loading', atlas: null, lastUsed: performance.now() };
  _stackCache.set(meta.slug, rec);

  const img = new Image();
  img.onload = function () {
    try {
      rec.atlas = _bakeCarAtlasFromStrip(img, meta);
      rec.status = 'ready';
      rec.lastUsed = performance.now();
      _evictOldestBakedStack();
    } catch (err) {
      rec.status = 'error';
      if (typeof console !== 'undefined') console.warn('[car-stacks]', err);
    }
  };
  img.onerror = function () {
    rec.status = 'error';
  };
  img.src = CAR_STACKS_DIR + meta.slug + '.png';
  return null;
}

function _stackTod() {
  if (typeof _sceneBridge !== 'undefined' && _sceneBridge) return _sceneBridge.getTOD();
  return typeof TOD !== 'undefined' ? TOD : 'day';
}

function _stackWet() {
  if (typeof _sceneBridge !== 'undefined' && _sceneBridge) {
    const wx = _sceneBridge.getWX();
    return wx ? (wx.wet || 0) : 0;
  }
  return typeof WX !== 'undefined' && WX ? WX.wet || 0 : 0;
}

function _carBasis(cam, car) {
  const proj = typeof sceneProject === 'function' ? sceneProject : project;
  const o = proj(cam, car.x, car.y, 0);
  const fx = Math.cos(car.hd);
  const fy = Math.sin(car.hd);
  const f1 = proj(cam, car.x + fx, car.y + fy, 0);
  const r1 = proj(cam, car.x - fy, car.y + fx, 0);
  return {
    o,
    ux: f1.sx - o.sx,
    uy: f1.sy - o.sy,
    vx: r1.sx - o.sx,
    vy: r1.sy - o.sy,
  };
}

/**
 * Draw pre-car asphalt lighting: twin headlamp beams (night/sunset) and twin-lobed
 * red tarmac brake/taillight wash. Returns true if handled by stacked car system.
 */
function drawStackedCarLights(ctx, cam, car) {
  const atlas = preloadCarStack(car.name);
  if (!atlas) return false;
  const lights = _buildStackLightSprites();
  const meta = atlas.meta;
  const tod = _stackTod();
  const wet = _stackWet();
  const showHead = tod === 'night' || tod === 'sunset';
  const brkLevel = typeof car.brk === 'number' ? Math.max(0, Math.min(1, car.brk)) : (car.brk ? 1 : 0);
  const hasTailWash = brkLevel > 0.08 || tod === 'night';
  if (!showHead && !hasTailWash) return true;

  const { o, ux, uy, vx, vy } = _carBasis(cam, car);
  const visualBoost = cam.scale < 4 ? 2.4 : 1.15;
  const effLen = meta.len * visualBoost;
  const effW = (atlas.sliceW / atlas.sliceL) * effLen;
  const drawScale = (effLen * cam.scale) / atlas.sliceL;
  const stackHeightPx = (atlas.slices - 1) * atlas.spacing * drawScale;

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.imageSmoothingEnabled = true;

  if (showHead) {
    const frontLong = effLen * 0.445;
    const headLat = effW * 0.345;
    const headBeamLiftPx = stackHeightPx * 0.18;
    const beamLenM = cam.scale < 4 ? effLen * 2.15 : Math.max(15.5, effLen * 3.55);
    const beamWidthM = effW * 2.15;

    const a = (ux * beamLenM) / 64;
    const b = (uy * beamLenM) / 64;
    const cM = (vx * beamWidthM) / 32;
    const dM = (vy * beamWidthM) / 32;
    ctx.globalAlpha = (tod === 'night' ? 0.92 : 0.28) * (1 + wet * 0.18);

    ctx.save();
    ctx.transform(a, b, cM, dM, o.sx + ux * frontLong - vx * headLat, o.sy + uy * frontLong - vy * headLat - headBeamLiftPx);
    ctx.drawImage(lights.headBeam, 0, -16);
    ctx.restore();

    ctx.save();
    ctx.transform(a, b, cM, dM, o.sx + ux * frontLong + vx * headLat, o.sy + uy * frontLong + vy * headLat - headBeamLiftPx);
    ctx.drawImage(lights.headBeam, 0, -16);
    ctx.restore();
  }

  if (hasTailWash) {
    const wetBoost = 1 + wet * 0.35;
    const washAlpha =
      brkLevel > 0.08
        ? Math.min(1, (tod === 'night' ? 0.72 : tod === 'sunset' ? 0.48 : 0.24) * (0.45 + 0.55 * brkLevel) * wetBoost)
        : 0.22 * wetBoost;
    if (washAlpha > 0.04) {
      const rearLong = -effLen * 0.455;
      const washLenM = effLen * (0.62 + 0.48 * brkLevel) * (1 + wet * 0.28);
      const washWidthM = effW * (1.38 + 0.22 * brkLevel);
      ctx.globalAlpha = washAlpha;
      ctx.save();
      ctx.transform(
        (-ux * washLenM) / 36,
        (-uy * washLenM) / 36,
        (vx * washWidthM) / 28,
        (vy * washWidthM) / 28,
        o.sx + ux * rearLong,
        o.sy + uy * rearLong
      );
      ctx.drawImage(lights.tailWash, 0, -14);
      ctx.restore();
    }
  }

  ctx.restore();
  return true;
}

/**
 * Draw a sprite-stacked car from its lazily baked 64-heading atlas + twin brake/headlamp
 * lens blooms. Returns true if drawn, or false to fall back to legacy drawCar().
 */
function drawStackedCar(ctx, cam, car) {
  const atlas = preloadCarStack(car.name);
  if (!atlas) return false;
  const meta = atlas.meta;
  const { o, ux, uy, vx, vy } = _carBasis(cam, car);

  const screenAngle = Math.atan2(uy / CAR_STACK_SQUASH, ux);
  const atlasAngle = screenAngle - Math.PI * 0.5;
  const norm = ((atlasAngle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
  const bin = Math.round((norm / (Math.PI * 2)) * atlas.headings) % atlas.headings;

  const visualBoost = cam.scale < 4 ? 2.4 : 1.15;
  const effLen = meta.len * visualBoost;
  const effW = (atlas.sliceW / atlas.sliceL) * effLen;
  const drawScale = (effLen * cam.scale) / atlas.sliceL;
  const stackHeightPx = (atlas.slices - 1) * atlas.spacing * drawScale;
  const dw = Math.max(8, Math.round(atlas.frameW * drawScale));
  const dh = Math.max(8, Math.round(atlas.frameH * drawScale));
  const dx = Math.round(o.sx - atlas.anchorX * drawScale);
  const dy = Math.round(o.sy - atlas.anchorY * drawScale);

  const steer = car.steer != null ? car.steer : Math.max(-0.5, Math.min(0.5, (car.curv || 0) * 14));
  const bodyCanvas =
    steer < -0.14 ? atlas.steerLeftCanvas : steer > 0.14 ? atlas.steerRightCanvas : atlas.canvas;

  const prevSmooth = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(bodyCanvas, bin * atlas.frameW, 0, atlas.frameW, atlas.frameH, dx, dy, dw, dh);
  ctx.imageSmoothingEnabled = prevSmooth;

  // Slot marker pip (keeps authentic car paint while distinguishing race cars)
  if (car.col) {
    ctx.fillStyle = car.col;
    ctx.fillRect(Math.round(o.sx) - 2, dy - 4, 4, 2);
  }

  // Twin Headlamp Lens Flares + Twin Rear Brake / Taillights (zero daytime headlight leak)
  const lights = _buildStackLightSprites();
  const tod = _stackTod();
  const showHead = tod === 'night' || tod === 'sunset';
  const brkLevel = typeof car.brk === 'number' ? Math.max(0, Math.min(1, car.brk)) : (car.brk ? 1 : 0);
  if (showHead || brkLevel > 0.06) {
    const fLen = Math.hypot(ux, uy) || 1;
    const fwdScrY = uy / fLen;
    const rearVis = Math.max(0.28, Math.min(1, 0.78 - fwdScrY * 0.48));
    const frontVis = Math.max(0.22, Math.min(1, 0.72 + fwdScrY * 0.48));
    const carPxW = effW * cam.scale;

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.imageSmoothingEnabled = true;

    if (showHead) {
      const frontLong = effLen * 0.455;
      const headLat = effW * 0.345;
      const headLift = stackHeightPx * 0.33;
      const hDiam = Math.max(3.6, Math.min(13, carPxW * 0.42));
      const hHalf = hDiam * 0.5;
      ctx.globalAlpha = (tod === 'night' ? 0.94 : 0.46) * frontVis;
      ctx.drawImage(lights.headLens, o.sx + ux * frontLong - vx * headLat - hHalf, o.sy + uy * frontLong - vy * headLat - headLift - hHalf, hDiam, hDiam);
      ctx.drawImage(lights.headLens, o.sx + ux * frontLong + vx * headLat - hHalf, o.sy + uy * frontLong + vy * headLat - headLift - hHalf, hDiam, hDiam);
    }

    const rearLong = -effLen * 0.465;
    const tailLat = effW * 0.345;
    const tailLift = stackHeightPx * 0.43;
    const tLx = o.sx + ux * rearLong - vx * tailLat;
    const tLy = o.sy + uy * rearLong - vy * tailLat - tailLift;
    const tRx = o.sx + ux * rearLong + vx * tailLat;
    const tRy = o.sy + uy * rearLong + vy * tailLat - tailLift;

    if (brkLevel > 0.06) {
      const bDiam = Math.max(4.5, Math.min(17, carPxW * (0.46 + 0.24 * brkLevel)));
      const bHalf = bDiam * 0.5;
      ctx.globalAlpha = Math.min(1, (tod === 'day' ? 0.88 : 1.0) * (0.52 + 0.48 * brkLevel) * rearVis);
      ctx.drawImage(lights.brakeGlow, tLx - bHalf, tLy - bHalf, bDiam, bDiam);
      ctx.drawImage(lights.brakeGlow, tRx - bHalf, tRy - bHalf, bDiam, bDiam);
      if (rearVis > 0.4) {
        const coreSz = Math.max(1.4, Math.min(2.6, carPxW * 0.11));
        const cHalf = coreSz * 0.5;
        ctx.fillStyle = '#ff3b30';
        ctx.fillRect(tLx - cHalf, tLy - cHalf, coreSz, coreSz);
        ctx.fillRect(tRx - cHalf, tRy - cHalf, coreSz, coreSz);
      }
      if (cam.scale >= 6 && brkLevel > 0.28 && rearVis > 0.54) {
        const chX = o.sx - ux * (effLen * 0.26);
        const chY = o.sy - uy * (effLen * 0.26) - stackHeightPx * 0.72;
        ctx.fillStyle = '#ff453a';
        ctx.fillRect(Math.round(chX) - 1, Math.round(chY), 2, 1);
      }
    } else if (showHead) {
      const rDiam = Math.max(3.4, Math.min(10.5, carPxW * 0.32));
      const rHalf = rDiam * 0.5;
      ctx.globalAlpha = (tod === 'night' ? 0.58 : 0.26) * rearVis;
      ctx.drawImage(lights.brakeGlow, tLx - rHalf, tLy - rHalf, rDiam, rDiam);
      ctx.drawImage(lights.brakeGlow, tRx - rHalf, tRy - rHalf, rDiam, rDiam);
    }

    ctx.restore();
  }

  return true;
}
