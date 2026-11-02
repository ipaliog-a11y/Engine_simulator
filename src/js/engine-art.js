// ====== ENGINE PICTURE ======
// The ENGINE tab's outside view. One camera for every layout: a front three-quarter, light from
// the front-left, the same way the car sprites are shaded. Cylinders step back along the crank
// (+a is the rear, up and to the right on screen), so an inline, a V and a boxer can all be
// counted. V banks lean out; boxer banks lie flat and opposed.
//
// Parts that repeat or stretch (block, head, cover, pipes, seams, bolts) are drawn here.
// Showpiece parts (turbo, blower, carb, ITB, intercooler, radiator, fan, nitrous, alternator,
// hybrid motor) are palette-index sprites from engine-art-data.js, blitted — never loaded as
// images, because a drawn image taints the canvas under file:// and breaks garage thumbnails.
//
// Static pixels are cached per configuration. Each frame copies that and redraws only what
// moves: pulley spokes, belts, compressor and fan frames, a firing flash in each cylinder window.

const ENG_ART_W = 240, ENG_ART_H = 144;

function engXY(o, a, c, z) {
  return [Math.round(o.x + 4 * a - 2 * c), Math.round(o.y - 2 * a - 2 * c - z)];
}
function engProj(o, box, a, c, z) {
  const shr = box && box.shear ? box.shear * (z - (box.zRef != null ? box.zRef : box.z0)) : 0;
  return engXY(o, a, c + shr, z);
}
function engLine(buf, a, b, col) {
  if (!a || !b || !col) return;
  const n = Math.max(1, Math.round(Math.max(Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1]))));
  for (let i = 0; i <= n; i++) buf.set(a[0] + (b[0] - a[0]) * i / n, a[1] + (b[1] - a[1]) * i / n, col);
}
function engTube(buf, pts, mid, hi, rad) {
  rad = rad == null ? 1 : rad;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    const n = Math.max(1, Math.round(Math.max(Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1]))));
    for (let k = 0; k <= n; k++) {
      const x = a[0] + (b[0] - a[0]) * k / n, y = a[1] + (b[1] - a[1]) * k / n;
      for (let dy = -rad; dy <= rad; dy++) for (let dx = -rad; dx <= rad; dx++) {
        if (dx * dx + dy * dy > rad * rad + 0.25) continue;
        buf.set(x + dx, y + dy, (dx <= 0 && dy <= 0) ? hi : mid);
      }
    }
  }
}
function engBez(p0, p1, p2, p3, n) {
  const o = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, u = 1 - t;
    o.push([
      u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
      u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1]
    ]);
  }
  return o;
}
function engQuad(buf, pts, col) { if (col) buf.poly(pts, col); }
function blitEng(buf, name, x, y, frame) {
  const s = (typeof ENG_SPRITES !== 'undefined') && ENG_SPRITES[name];
  if (!s) return null;
  const fr = s.frames[((frame | 0) % s.frames.length + s.frames.length) % s.frames.length];
  const x0 = Math.round(x - s.ax), y0 = Math.round(y - s.ay);
  for (let yy = 0; yy < s.h; yy++) {
    const row = fr[yy]; if (!row) continue;
    let xx = 0;
    for (let k = 0; k < row.length; k++) {
      const idx = row[k][0], n = row[k][1], col = idx ? ENG_PAL[idx] : null;
      if (col) for (let i = 0; i < n; i++) buf.set(x0 + xx + i, y0 + yy, col);
      xx += n;
    }
  }
  return s;
}
function engFrame(ang, n) {
  let u = (ang / (Math.PI * 2)) % 1;
  if (u < 0) u += 1;
  return Math.floor(u * n) % n;
}

function drawShadedBox(buf, o, box, ramp) {
  const C = i => engRamp(ramp, i);
  const P = (a, c, z) => engProj(o, box, a, c, z);
  const { a0, a1, c0, c1, z0, z1 } = box;
  const zM = (z0 + z1) / 2, cM = (c0 + c1) / 2;
  // c0 faces the camera on a near bank and the valley on a far bank, so both get a side.
  const sideLo = box.side === 'far' ? 3 : 3, sideHi = box.side === 'far' ? 2 : 2;
  engQuad(buf, [P(a0, c0, z0), P(a1, c0, z0), P(a1, c0, zM), P(a0, c0, zM)], C(sideLo));
  engQuad(buf, [P(a0, c0, zM), P(a1, c0, zM), P(a1, c0, z1), P(a0, c0, z1)], C(sideHi));
  engLine(buf, P(a0, c0, z0), P(a1, c0, z0), C(4));
  engQuad(buf, [P(a0, c0, z0), P(a0, c1, z0), P(a0, c1, z1), P(a0, c0, z1)], C(1));
  engLine(buf, P(a0, c0, z0), P(a0, c0, z1), C(0));
  engQuad(buf, [P(a0, c0, z1), P(a1, c0, z1), P(a1, cM, z1), P(a0, cM, z1)], C(0));
  engQuad(buf, [P(a0, cM, z1), P(a1, cM, z1), P(a1, c1, z1), P(a0, c1, z1)], C(2));
  engLine(buf, P(a0, c1, z1), P(a1, c1, z1), C(3));
}
function drawSeams(buf, o, box, n, col) {
  if (n < 2) return;
  const P = (a, c, z) => engProj(o, box, a, c, z);
  for (let i = 1; i < n; i++) {
    const a = box.a0 + (box.a1 - box.a0) * i / n;
    engLine(buf, P(a, box.c0, box.z1), P(a, box.c1, box.z1), col);
    engLine(buf, P(a, box.c0, box.z0 + 1), P(a, box.c0, box.z1), col);
  }
}
function drawBolts(buf, o, box, n, hi, lo) {
  const P = (a, c, z) => engProj(o, box, a, c, z);
  const c = box.c0 + (box.c1 - box.c0) * (box.side === 'far' ? 0.7 : 0.28);
  for (let i = 0; i < n; i++) {
    const a = box.a0 + (box.a1 - box.a0) * (i + 0.5) / n;
    const p = P(a, c, box.z1);
    buf.set(p[0], p[1], hi); buf.set(p[0] + 1, p[1], lo); buf.set(p[0], p[1] + 1, engPal(1));
  }
}

function engCoverRamp(e) {
  if (e.type === 'diesel' && (e.cam || 'stock') === 'stock') return 'coverDiesel';
  const c = e.cam || 'stock';
  if (c === 'sport') return 'coverSport';
  if (c === 'race') return 'coverRace';
  if (c === 'atkinson') return 'coverAtkinson';
  return 'coverStock';
}
function engHeaderRamp(e) {
  if (e.exhaust === 'race') return 'headRace';
  if (e.exhaust === 'sport') return 'headSport';
  return 'headStock';
}
function engNorm(e) {
  e = e || (typeof DEFAULT_ENGINE !== 'undefined' ? DEFAULT_ENGINE : {});
  const type = e.type || 'petrol4';
  const et = (typeof ENGINE_TYPE !== 'undefined' && ENGINE_TYPE[type]) || { maxCyl: 12, ports: type === 'twostroke' || type === 'rotary', ci: type === 'diesel' };
  const rotary = type === 'rotary';
  const two = type === 'twostroke';
  const n = Math.max(1, Math.min(et.maxCyl || 12, Math.round(+e.cylinders || 4)));
  const layout = rotary ? 'rotary' : (e.layout === 'v' || e.layout === 'boxer' ? e.layout : 'inline');
  return {
    type, rotary, two, ports: !!(et.ports || rotary || two), ci: !!et.ci, n, layout,
    bore: +e.bore_mm || (rotary ? 105 : 86),
    stroke: +e.stroke_mm || (rotary ? 80 : 86),
    ecc: +e.ecc_mm || 15,
    intake: e.intake || 'na',
    intercooler: e.intercooler || 'none',
    turboSize: e.turboSize || 'medium',
    turboConfig: e.turboConfig || 'single',
    vgt: !!e.vgt, antilag: !!e.antilag,
    housing: e.housing || 'stock',
    scType: e.scType || 'roots',
    nitrous: e.nitrous || 'none',
    cat: e.cat || 'stock',
    intakeSys: e.intakeSys || 'efi',
    cam: e.cam || 'stock',
    vvt: !!e.vvt && !(et.ports || rotary || two),
    valves: (et.ports || rotary || two) ? 0 : Math.max(2, Math.min(5, Math.round(+e.valves || 4))),
    valveMat: e.valveMat || 'steel',
    fuel: type === 'diesel' ? 'diesel' : (e.fuel || 'gasoline'),
    radiator: e.radiator || 'stock',
    fan: e.fan || 'electric',
    oilCooler: !!e.oilCooler,
    alternator: String(e.alternator || '120'),
    hyMode: e.hyMode || '',
    airFilter: e.airFilter || 'stock',
    exhaust: e.exhaust || 'stock',
    runner: e.runner || 'medium',
    ignitionType: e.ignitionType || 'coil',
    egr: e.egr || 'none',
    redline: +e.redline || 7000
  };
}

function engArtKey(e) {
  const r = v => Math.round(+v || 0);
  return [e.type, e.n, r(e.bore), r(e.stroke), r(e.ecc), e.layout, e.intake, e.intercooler, e.turboSize,
    e.turboConfig, e.vgt ? 1 : 0, e.antilag ? 1 : 0, e.housing, e.scType, e.nitrous, e.cat, e.intakeSys,
    e.cam, e.vvt ? 1 : 0, e.valves, e.valveMat, e.fuel, e.radiator, e.fan, e.oilCooler ? 1 : 0, e.alternator,
    e.hyMode, e.airFilter, e.exhaust, e.runner, e.ignitionType, e.egr].join('|');
}

function bankOf(a0, a1, n, c0, c1, z0, zBlock, zHead, zCover, shear, side, cyl0) {
  return { a0, a1, n, c0, c1, z0, z1: zCover, zBlock, zHead, zCover, shear, zRef: z0, side, cyl0 };
}

function engineArtModel(e, W, H) {
  const layout = e.layout, n = e.n;
  const multi = layout === 'v' || layout === 'boxer';
  const nFar = multi ? Math.floor(n / 2) : 0;
  const nNear = multi ? n - nFar : n;
  const per = Math.max(1, multi ? Math.max(nNear, nFar) : n);
  const pitch = per >= 8 ? 3 : 4;
  const bore = e.bore, stroke = e.stroke;
  const half = Math.max(5, Math.min(8, Math.round(5 + (bore - 70) / 18)));
  const bH = Math.max(7, Math.min(14, Math.round(7 + (stroke - 60) / 11)));
  const coverH = e.ports ? 0 : (e.valves <= 2 ? 4 : 6);
  const headH = e.rotary ? 0 : 4;
  const aNear = Math.max(pitch, nNear * pitch);
  const aFar = nFar ? Math.max(pitch, nFar * pitch) : 0;
  const aLen = Math.max(aNear, aFar);
  const boxer = layout === 'boxer';
  // Bank angle from vertical. The stack's screen height is L·cos and the lean is tan,
  // so a V stays a V and a boxer lies down instead of two slabs flying apart.
  const ang = !multi ? 0 : (boxer ? 0.85 : 0.46);
  const stack = bH + headH + (e.ports ? (e.two ? 5 : 0) : coverH);
  const dz = multi ? Math.max(9, stack * Math.cos(ang)) : stack;
  const lean = multi ? Math.tan(ang) : 0;
  const zBase = multi ? 2 : 0;
  const zBlock = multi ? zBase + dz * (bH / stack) : bH;
  const zHead = multi ? zBase + dz * ((bH + headH) / stack) : bH + headH;
  const zCover = multi ? zBase + dz : (e.ports ? zHead + (e.two ? 5 : 0) : zHead + coverH);
  const bw = Math.max(4, half - 1);

  let banks = [];
  if (e.rotary) {
    /* housings are painted on their own; banks stays empty */
  } else if (!multi) {
    banks.push(bankOf(0, aNear, nNear, -half, half, 0, bH, bH + headH, bH + headH + coverH, 0, 'near', 1));
  } else {
    if (nFar) banks.push(bankOf(0, aFar, nFar, 1.1, 1.1 + bw, zBase, zBlock, zHead, zCover, lean, 'far', 1));
    banks.push(bankOf(0, aNear, nNear, -(1.1 + bw), -1.1, zBase, zBlock, zHead, zCover, -lean, 'near', nFar + 1));
  }

  const pts = [];
  const pushBox = (a0, a1, c0, c1, z0, z1, shear, zRef) => {
    const box = { shear, zRef, z0 };
    for (const a of [a0, a1]) for (const c of [c0, c1]) for (const z of [z0, z1]) pts.push(engProj({ x: 0, y: 0 }, box, a, c, z));
  };
  if (e.rotary) {
    const rw = Math.max(5, Math.min(9, Math.round(e.stroke / 12)));
    const rh = Math.max(10, Math.min(16, Math.round(e.bore / 8)));
    for (let i = 0; i < n; i++) pushBox(i * (rw + 2), i * (rw + 2) + rw, -rh / 2, rh / 2, -2, rh, 0, 0);
  } else {
    for (const b of banks) pushBox(b.a0, b.a1, b.c0, b.c1, b.z0 - 4, b.zCover, b.shear, b.zRef);
    if (multi) pushBox(0, aLen, -3, 3, -6, 5, 0, 0);
  }
  let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
  for (const p of pts) { minX = Math.min(minX, p[0]); maxX = Math.max(maxX, p[0]); minY = Math.min(minY, p[1]); maxY = Math.max(maxY, p[1]); }
  const o = {
    x: Math.round((46 + W - 16) / 2 - (minX + maxX) / 2),
    y: Math.round((18 + H - 18) / 2 - (minY + maxY) / 2)
  };
  // Keep the crank in frame if a long inline would otherwise shove the nose off the left.
  const nose = engXY(o, -2, 0, 0);
  if (nose[0] < 40) o.x += 40 - nose[0];
  if (nose[1] > H - 28) o.y -= nose[1] - (H - 28);

  const pulley = engXY(o, -1.2, 0, multi ? 1 : 2);
  const anim = { pulleys: [], belts: [], wheels: [], fans: [], windows: [], glows: [], flames: [], n, layout: e.rotary ? 'inline' : layout, rotary: e.rotary, two: e.two };
  const top = [];
  return {
    e, o, W, H, banks, multi, boxer, aLen, aNear, aFar, nNear, nFar, pitch, half, bH, pulley, zCover,
    cover: engCoverRamp(e), header: engHeaderRamp(e), anim, top,
    ground: null
  };
}

function paintBank(buf, m, b) {
  const e = m.e, o = m.o;
  const block = { a0: b.a0, a1: b.a1, c0: b.c0, c1: b.c1, z0: b.z0, z1: b.zBlock, shear: b.shear, zRef: b.zRef, side: b.side };
  drawShadedBox(buf, o, block, 'iron');
  drawSeams(buf, o, block, b.n, engRamp('iron', 4));
  if (e.two) {
    for (let k = 0; k < 3; k++) {
      const z0 = b.zBlock + k * 2, z1 = z0 + 1;
      const fin = { a0: b.a0, a1: b.a1, c0: b.c0 - 1, c1: b.c1 + 1, z0, z1, shear: b.shear, zRef: b.zRef, side: b.side };
      drawShadedBox(buf, o, fin, 'iron');
    }
  } else if (!e.rotary) {
    const head = { a0: b.a0, a1: b.a1, c0: b.c0 + 0.4, c1: b.c1 - 0.4, z0: b.zBlock, z1: b.zHead, shear: b.shear, zRef: b.zRef, side: b.side };
    drawShadedBox(buf, o, head, 'alloy');
    const cover = { a0: b.a0 + 0.3, a1: b.a1 - 0.3, c0: b.c0 + 1, c1: b.c1 - 1, z0: b.zHead, z1: b.zCover, shear: b.shear, zRef: b.zRef, side: b.side };
    drawShadedBox(buf, o, cover, m.cover);
    drawSeams(buf, o, cover, b.n, engRamp(m.cover, 3));
    const boltHi = e.valveMat === 'titanium' ? engPal(98) : engPal(87);
    drawBolts(buf, o, cover, b.n, boltHi, engPal(88));
    if (e.valves >= 4) {
      const P = (a, c) => engProj(o, cover, a, c, cover.z1);
      const cA = cover.c0 + (cover.c1 - cover.c0) * 0.32, cB = cover.c0 + (cover.c1 - cover.c0) * 0.68;
      engLine(buf, P(cover.a0 + 0.4, cA), P(cover.a1 - 0.4, cA), engRamp(m.cover, 2));
      engLine(buf, P(cover.a0 + 0.4, cB), P(cover.a1 - 0.4, cB), engRamp(m.cover, 2));
      if (e.valves >= 5) {
        const cC = (cover.c0 + cover.c1) / 2;
        engLine(buf, P(cover.a0 + 0.4, cC), P(cover.a1 - 0.4, cC), engRamp(m.cover, 3));
      }
    }
    if (e.vvt && b.side !== 'far') {
      const p = engProj(o, cover, cover.a0, (cover.c0 + cover.c1) / 2, cover.z1 - 1);
      buf.disc(p[0], p[1], 2, engPal(85)); buf.disc(p[0], p[1], 1, engPal(1));
    }
    // spark / glow / coil marks, one per cylinder, so the count reads on the cover too
    for (let i = 0; i < b.n; i++) {
      const a = b.a0 + (b.a1 - b.a0) * (i + 0.5) / b.n;
      const p = engProj(o, cover, a, (b.c0 + b.c1) / 2 + (b.side === 'far' ? -0.6 : 0.6), b.zCover);
      if (e.ci) { buf.set(p[0], p[1] - 1, engPal(91)); }
      else if (!e.ports) {
        const show = e.ignitionType === 'wasted' ? (i % 2 === 0) : e.ignitionType !== 'distributor';
        if (show) { buf.set(p[0], p[1] - 1, engPal(95)); buf.set(p[0], p[1] - 2, engPal(91)); }
      }
    }
    if (!e.ports && !e.ci && e.ignitionType === 'distributor' && b.side !== 'far') {
      const p = engProj(o, cover, b.a0 + 0.8, b.c0 + 1.2, b.zCover);
      buf.disc(p[0], p[1], 2, engPal(18)); buf.disc(p[0], p[1], 1, engPal(91));
    }
  }
  // piston windows on the face you can see
  if (b.side !== 'far') {
    for (let i = 0; i < b.n; i++) {
      const a = b.a0 + (b.a1 - b.a0) * (i + 0.5) / b.n;
      const p = engProj(o, b, a, b.c0, (b.z0 + b.zBlock) / 2);
      buf.rect(p[0], p[1], 2, 3, engPal(95));
      m.anim.windows.push({ x: p[0], y: p[1], cyl: b.cyl0 + i });
    }
  }
}

function paintRotary(buf, m) {
  const e = m.e, o = m.o, n = e.n;
  const rw = Math.max(5, Math.min(9, Math.round(e.stroke / 12)));
  const rh = Math.max(10, Math.min(16, Math.round(e.bore / 8)));
  const pinch = Math.max(1, Math.min(4, Math.round((e.ecc - 8) / 5)));
  for (let i = n - 1; i >= 0; i--) {
    const a0 = i * (rw + 2), a1 = a0 + rw;
    const plate = { a0: a0 - 1, a1: a0, c0: -rh / 2 - 1, c1: rh / 2 + 1, z0: -2, z1: rh + 1, shear: 0, zRef: 0, side: 'near' };
    if (i === 0) drawShadedBox(buf, o, plate, 'iron');
    const mid = { a0, a1, c0: -rh / 2, c1: rh / 2, z0: -1, z1: rh, shear: 0, zRef: 0, side: 'near' };
    drawShadedBox(buf, o, mid, 'alloy');
    // waist: the eccentricity shows as how deep the housing pinches
    const waist = { a0: a0 + rw * 0.35, a1: a0 + rw * 0.65, c0: -rh / 2 + pinch, c1: rh / 2 - pinch, z0: rh * 0.3, z1: rh * 0.7, shear: 0, zRef: 0, side: 'near' };
    drawShadedBox(buf, o, waist, 'iron');
    const port = engProj(o, mid, (a0 + a1) / 2, mid.c0, rh * 0.45);
    buf.rect(port[0], port[1], 2, 2, engPal(95));
    m.anim.glows.push({ x: port[0], y: port[1], cyl: i + 1 });
    m.anim.windows.push({ x: port[0], y: port[1] + 3, cyl: i + 1 });
    buf.rect(port[0], port[1] + 3, 2, 2, engPal(95));
  }
}

function paintHeaders(buf, m, b) {
  const o = m.o, e = m.e;
  const hi = engRamp(m.header, 0), mid = engRamp(m.header, 1), lo = engRamp(m.header, 3);
  const ports = [];
  for (let i = 0; i < b.n; i++) {
    const a = b.a0 + (b.a1 - b.a0) * (i + 0.5) / b.n;
    const z = (e.two ? b.zBlock + 2 : b.zHead - 1);
    const c = b.side === 'far' ? b.c1 : b.c0;
    const p = engProj(o, b, a, c, z);
    ports.push(p);
    m.anim.glows.push({ x: Math.round(p[0]), y: Math.round(p[1]), cyl: b.cyl0 + i });
    buf.set(p[0], p[1], engPal(95));
  }
  if (!ports.length) return null;
  const out = b.side === 'far' ? -1 : 1;
  const colA = b.a0 + (b.a1 - b.a0) * 0.28;
  const col = engProj(o, b, colA, (b.side === 'far' ? b.c1 : b.c0) + out * -4, b.z0 - 1);
  if (b.side === 'far') {
    const p = ports[Math.floor(ports.length / 2)];
    const tip = [p[0] - 6, p[1] - 3];
    engTube(buf, [p, tip], mid, hi, 1);
    return { x: tip[0], y: tip[1], a: colA };
  }
  if (e.exhaust === 'stock') {
    engTube(buf, ports, mid, hi, 2);
    engTube(buf, [ports[0], col], lo, mid, 2);
  } else {
    const rad = e.exhaust === 'race' ? 1 : 1;
    for (const p of ports) {
      const c1 = [p[0] + out * 7, p[1] + 5];
      const c2 = [(c1[0] + col[0]) / 2, Math.min(c1[1], col[1]) - 4];
      engTube(buf, engBez(p, c1, c2, col, 7), mid, hi, rad);
    }
  }
  return { x: col[0], y: col[1], a: colA };
}

function paintIntake(buf, m) {
  const e = m.e, o = m.o;
  const topBank = m.banks.find(b => b.side === 'near') || m.banks[0];
  if (e.rotary) {
    const a0 = 0, a1 = Math.max(4, e.n * 7);
    const pl = { a0, a1, c0: -3, c1: 3, z0: 12, z1: 16, shear: 0, zRef: 0, side: 'near' };
    drawShadedBox(buf, o, pl, 'alloy');
    return engProj(o, pl, a0, 0, 14);
  }
  if (!topBank) return null;
  const a0 = topBank.a0 + 0.5;
  const a1 = topBank.a1 - 0.5;
  const sys = e.intakeSys;
  const runH = e.runner === 'long' ? 5 : e.runner === 'short' ? 2 : 3;
  const valley = m.multi;
  const c0 = valley ? -2.2 : (topBank.c0 + 1.5);
  const c1 = valley ? 2.2 : (topBank.c1 - 1.5);
  const z0 = valley ? topBank.z0 + (topBank.zCover - topBank.z0) * 0.35 : topBank.zCover;
  const sheer = valley ? 0 : (topBank.shear || 0);
  const zRef = valley ? 0 : topBank.zRef;
  const base = { shear: sheer, zRef, z0 };
  const plenumless = sys === 'itb' || sys === 'mech' || sys === 'sidedraft';
  const blower = e.intake === 'supercharger' && e.scType !== 'centrifugal';
  let mouth = null;
  if (!plenumless || blower) {
    const nRun = valley ? Math.max(m.nNear, 1) : (topBank ? topBank.n : e.n);
    for (let i = 0; i < nRun; i++) {
      const a = a0 + (a1 - a0) * (i + 0.5) / nRun;
      const run = { a0: a - 0.35, a1: a + 0.35, c0: (c0 + c1) / 2 - 0.4, c1: (c0 + c1) / 2 + 0.4, z0, z1: z0 + runH, shear: sheer, zRef, side: 'near' };
      drawShadedBox(buf, o, run, 'alloy');
    }
    if (e.runner === 'variable') {
      const rail = { a0, a1, c0: c0 - 0.3, c1: c0 + 0.5, z0: z0 + 1, z1: z0 + 2, shear: sheer, zRef, side: 'near' };
      drawShadedBox(buf, o, rail, 'chrome');
    }
    const pl = { a0, a1, c0, c1, z0: z0 + runH, z1: z0 + runH + (blower ? 2 : 4), shear: sheer, zRef, side: 'near' };
    drawShadedBox(buf, o, pl, 'alloy');
    mouth = engProj(o, pl, pl.a0, (c0 + c1) / 2, pl.z1);
    const tb = engProj(o, pl, (a0 + a1) / 2, (c0 + c1) / 2, pl.z1 + 1);
    if (blower) {
      const name = e.scType === 'screw' ? 'screw' : 'roots';
      const s = ENG_SPRITES[name];
      const bx = tb[0], by = tb[1] - 16;
      m.top.push({ name, x: bx, y: by });
      if (s) {
        m.anim.pulleys.push({ x: bx - s.w / 2 + 4, y: by, r: 3 });
        mouth = [bx + (s.inn ? s.inn[0] : 0), by + (s.inn ? s.inn[1] : -8)];
      }
    } else if (sys === 'carb1' || sys === 'carb2' || sys === 'carb4') {
      const name = sys === 'carb1' ? 'carb1' : sys === 'carb2' ? 'carb2' : 'carb4';
      m.top.push({ name, x: tb[0], y: tb[1] - 6 });
      mouth = [tb[0], tb[1] - 16];
    } else {
      // EFI throttle body at the front of the plenum
      const body = { a0: a0 - 1.4, a1: a0 - 0.2, c0: (c0 + c1) / 2 - 1, c1: (c0 + c1) / 2 + 1, z0: z0 + runH, z1: z0 + runH + 3, shear: 0, zRef: 0, side: 'near' };
      drawShadedBox(buf, o, body, 'chrome');
      mouth = engProj(o, body, body.a0, (body.c0 + body.c1) / 2, (body.z0 + body.z1) / 2);
    }
  } else if (sys === 'itb' || sys === 'mech') {
    const src = [];
    const list = valley ? m.banks : [topBank];
    for (const b of list) {
      for (let i = 0; i < b.n; i++) {
        const a = b.a0 + (b.a1 - b.a0) * (i + 0.5) / b.n;
        const p = engProj(o, b, a, (b.c0 + b.c1) / 2, b.zCover);
        m.top.push({ name: 'itb', x: p[0], y: p[1] - 4 });
        src.push([p[0], p[1] - 28]);
      }
    }
    mouth = src[0] || null;
    if (sys === 'mech' && mouth) buf.rect(mouth[0] + 8, mouth[1], 5, 5, engPal(23));
  } else if (sys === 'sidedraft') {
    const b = topBank;
    const k = Math.max(1, Math.ceil(b.n / 2));
    for (let i = 0; i < k; i++) {
      const a = b.a0 + (b.a1 - b.a0) * (i + 0.5) / k;
      const p = engProj(o, b, a, b.c0 - 1, b.zHead);
      blitEng(buf, 'side', p[0], p[1], 0);
      if (i === 0) mouth = [p[0] - 4, p[1] - 4];
    }
  }
  return mouth;
}

function paintFilter(buf, m, at) {
  if (!at || m.e.airFilter === 'none') return;
  const name = m.e.airFilter === 'perf' ? 'filtPerf' : m.e.airFilter === 'restrictive' ? 'filtRest' : 'filtBox';
  m.top.push({ name, x: at[0] - 16, y: at[1] - 12 });
}

function paintForced(buf, m, collectors, mouth) {
  const e = m.e;
  if (e.intake === 'na') return mouth;
  const icName = e.intercooler === 'large' ? 'icL' : e.intercooler === 'small' ? 'icS' : null;
  let icAt = null, icIn = null, icOut = null;
  if (icName) {
    const s = ENG_SPRITES[icName];
    const topY = m.pulley[1] - 2 * (m.aLen + 2) - ((m.zCover || 16) - 2);
    icAt = [Math.round(m.pulley[0] + 6), Math.max(14, Math.round(topY - 10))];
    m.top.push({ name: icName, x: icAt[0], y: icAt[1] });
    icIn = [icAt[0] + (s.inn ? s.inn[0] : -8), icAt[1]];
    icOut = [icAt[0] + (s.out ? s.out[0] : 8), icAt[1]];
  }
  const hi = engRamp('silicone', 0), mid = engRamp('silicone', 1);
  if (e.intake === 'turbo') {
    const size = e.turboSize === 'small' ? 'S' : e.turboSize === 'large' ? 'L' : 'M';
    const cfg = e.turboConfig || 'single';
    const units = cfg === 'twin' ? ['S', 'S'] : cfg === 'sequential' ? ['S', 'L'] : cfg === 'compound' ? ['M', 'L'] : [size];
    // twin on a V uses one snail per bank; otherwise they stack at the near collector
    const spots = [];
    if (cfg === 'twin' && collectors.length > 1) {
      spots.push(collectors[0], collectors[1]);
    } else {
      const c = collectors[collectors.length - 1] || { x: m.pulley[0] - 8, y: m.pulley[1] + 8 };
      const offs = cfg === 'single' ? [[16, -8]] : cfg === 'twin' ? [[12, -6], [28, -18]] : cfg === 'sequential' ? [[12, -4], [28, -16]] : [[10, -2], [26, 12]];
      offs.forEach((d, i) => { if (units[i]) spots.push({ x: c.x + d[0], y: c.y + d[1] }); });
    }
    let outlet = null;
    spots.forEach((sp, i) => {
      const sz = units[i] || size;
      m.top.push({ name: 'turbo' + sz, x: sp.x, y: sp.y });
      const s = ENG_SPRITES['turbo' + sz];
      if (!s) return;
      m.anim.wheels.push({ name: 'wheel' + sz, x: sp.x, y: sp.y });
      if (e.vgt) m.top.push({ name: 'vgt' + sz, x: sp.x + (s.hot ? s.hot[0] : 4), y: sp.y + (s.hot ? s.hot[1] : 4) });
      const out = [sp.x + (s.out ? s.out[0] : 8), sp.y + (s.out ? s.out[1] : -4)];
      if (i === 0) outlet = out;
      if (e.antilag) m.anim.flames.push([sp.x + (s.hot ? s.hot[0] : 4), sp.y + (s.hot ? s.hot[1] : 6) + 6]);
      const ar = e.housing === 'tight' ? 3 : e.housing === 'loose' ? 9 : 6;
      m.anim.housings = m.anim.housings || [];
      m.anim.housings.push({ x: sp.x + (s.hot ? s.hot[0] : 0), y: sp.y + (s.hot ? s.hot[1] : 0) + 4, len: ar });
      // inlet filter on the first compressor only when there is no separate airbox upstream of an IC
      if (i === spots.length - 1 && e.airFilter !== 'none') {
        paintFilter(buf, m, [sp.x + (s.inn ? s.inn[0] : 0), sp.y + (s.inn ? s.inn[1] : 0)]);
      }
    });
    if (outlet) {
      const dest = icIn || mouth || [m.pulley[0], m.pulley[1] - 20];
      engTube(buf, [outlet, [outlet[0], dest[1]], dest], mid, hi, 1);
      if (icOut && mouth) engTube(buf, [icOut, [mouth[0], icOut[1]], mouth], mid, hi, 1);
    }
    return null; // filter already placed
  }
  if (e.intake === 'supercharger' && e.scType === 'centrifugal') {
    const p = [m.pulley[0] + 16, m.pulley[1] - 8];
    m.top.push({ name: 'centri', x: p[0], y: p[1] });
    const s = ENG_SPRITES.centri;
    m.anim.wheels.push({ name: 'wheelS', x: p[0], y: p[1] });
    m.anim.pulleys.push({ x: p[0] - 6, y: p[1], r: 3 });
    const out = [p[0] + (s && s.out ? s.out[0] : 6), p[1] + (s && s.out ? s.out[1] : -4)];
    const dest = icIn || mouth || [m.pulley[0], m.pulley[1] - 24];
    engTube(buf, [out, [out[0], dest[1]], dest], mid, hi, 1);
    if (icOut && mouth) engTube(buf, [icOut, mouth], mid, hi, 1);
    if (e.airFilter !== 'none') paintFilter(buf, m, [p[0] + (s && s.inn ? s.inn[0] : -6), p[1]]);
    return null;
  }
  // roots / screw: charge leaves the blower mouth toward the IC, or the filter sits on the blower
  if (icIn && mouth) {
    engTube(buf, [mouth, [mouth[0], icIn[1]], icIn], mid, hi, 1);
    const back = [m.pulley[0] + 4, mouth[1]];
    if (icOut) engTube(buf, [icOut, back], mid, hi, 1);
  }
  return mouth;
}

function paintCooling(buf, m) {
  const e = m.e;
  const name = e.radiator === 'small' ? 'radS' : e.radiator === 'large' ? 'radL' : 'radM';
  const s = ENG_SPRITES[name];
  const x = Math.max(8 + (s ? s.ax : 6), m.pulley[0] - 28);
  const y = Math.min(m.H - 20, Math.max(20, m.pulley[1]));
  blitEng(buf, name, x, y, 0);
  const top = [x, y - (s ? s.h / 2 : 12) + 2];
  const bot = [x, y + (s ? s.h / 2 : 12) - 3];
  const head = [m.pulley[0] + 2, m.pulley[1] - 10];
  engTube(buf, [top, [top[0] + 6, top[1]], head], engRamp('coolant', 0), engRamp('coolant', 1), 1);
  engTube(buf, [bot, [m.pulley[0], bot[1]]], engRamp('coolant', 2), engRamp('coolant', 1), 1);
  if (e.fan !== 'none') m.anim.fans.push({ x: x + (e.fan === 'mechanical' ? 6 : 0), y, mech: e.fan === 'mechanical' });
  if (e.oilCooler) blitEng(buf, 'oil', x, Math.min(m.H - 8, y + (s ? s.h / 2 : 16) + 4), 0);
  m.rad = { x, y };
}

function paintDress(buf, m, mouth) {
  const e = m.e;
  const p = m.pulley;
  buf.disc(p[0], p[1], 5, engPal(5));
  buf.disc(p[0], p[1], 4, engPal(14));
  buf.disc(p[0], p[1], 2, engPal(4));
  m.anim.pulleys.push({ x: p[0], y: p[1], r: 4 });
  const amp = e.alternator === '60' ? 'altS' : e.alternator === '180' ? 'altL' : 'altM';
  const ax = p[0] - 2, ay = Math.min(m.H - 16, p[1] + 14);
  blitEng(buf, amp, ax, ay, 0);
  m.anim.pulleys.push({ x: ax - 5, y: ay, r: 2 });
  const belt = [[p[0] + 4, p[1]], [ax + 4, ay], [ax - 4, ay], [p[0] - 3, p[1] + 2], [p[0] + 4, p[1]]];
  // blower / cam belt climbs from the crank
  if (mouth) belt.splice(1, 0, [mouth[0], mouth[1]]);
  engTube(buf, belt, engPal(96), engPal(18), 0);
  m.anim.belts.push(belt);
  if (e.hyMode === 'p2' || e.hyMode === 'ps') {
    const rear = engXY(m.o, m.aLen + 1, 0, 2);
    blitEng(buf, e.hyMode === 'ps' ? 'hyPS' : 'hyP2', rear[0], rear[1], 0);
  } else if (e.hyMode === 'series') {
    blitEng(buf, 'hySer', p[0] + 20, p[1] + 6, 0);
    engTube(buf, [[p[0] + 20, p[1] + 2], [p[0] + 8, p[1] - 4]], engPal(91), engPal(92), 0);
  }
}

function paintExhaustTail(buf, m, col) {
  const e = m.e;
  if (!col) return;
  const hi = engRamp(m.header, 0), mid = engRamp(m.header, 2);
  const y = Math.min(m.H - 8, Math.max(col.y + 8, m.H - 14));
  const end = [8, y];
  engTube(buf, [[col.x, col.y], [col.x, y], end], mid, hi, e.exhaust === 'race' ? 1 : 1);
  if (e.two && e.exhaust === 'race') {
    // expansion chamber: a bulge in the tail
    buf.disc((col.x + end[0]) / 2, y, 4, engRamp(m.header, 1));
    buf.disc((col.x + end[0]) / 2, y, 2, engRamp(m.header, 3));
  }
  if (e.cat && e.cat !== 'none') {
    const cw = e.cat === 'stock' ? 14 : 8;
    const cx = Math.round((col.x + end[0]) / 2 - cw / 2);
    buf.rect(cx, y - 3, cw, 7, engRamp('alloy', 2));
    buf.rect(cx, y - 3, cw, 1, engRamp('alloy', 0));
    for (let x = cx + 2; x < cx + cw - 2; x += 3) buf.rect(x, y - 2, 1, 5, engPal(95));
  }
  if (e.egr && e.egr !== 'none') {
    const up = [col.x + 4, col.y - 16];
    engTube(buf, [[col.x, col.y], up, [up[0] + 10, up[1]]], engRamp('alloy', 3), engRamp('alloy', 1), e.egr === 'cooled-full' ? 1 : 0);
  }
}

function paintBottles(buf, m) {
  const e = m.e;
  if (e.nitrous && e.nitrous !== 'none') {
    const name = e.nitrous === 'large' ? 'nosL' : 'nosS';
    const s = ENG_SPRITES[name];
    const x = 10, y = m.H - 8;
    blitEng(buf, name, x, y, 0);
    const top = [x, y - (s ? s.h : 16) + 2];
    engTube(buf, [top, [top[0], top[1] - 8], [m.pulley[0], top[1] - 8]], engPal(72), engPal(71), 0);
  }
  const pair = { gasoline: [75, 76], race: [77, 78], e85: [79, 80], methanol: [81, 82], diesel: [83, 84] }[e.fuel] || [75, 76];
  const fx = e.nitrous && e.nitrous !== 'none' ? 22 : 10;
  buf.rect(fx, m.H - 16, 6, 8, engPal(pair[0]));
  buf.rect(fx, m.H - 16, 6, 1, engPal(pair[1]));
  buf.rect(fx + 2, m.H - 18, 2, 2, e.ci ? engPal(86) : engPal(14));
}

function paintStatic(buf, m) {
  const e = m.e;
  if (e.rotary) paintRotary(buf, m);
  else {
    const far = m.banks.filter(b => b.side === 'far');
    const near = m.banks.filter(b => b.side !== 'far');
    far.forEach(b => paintBank(buf, m, b));
    if (m.multi) {
      const crank = { a0: 0, a1: m.aLen, c0: -4.4, c1: 4.4, z0: -1, z1: 6, shear: 0, zRef: 0, side: 'near' };
      const sump = { a0: 0.8, a1: m.aLen - 0.6, c0: -3.2, c1: 3.2, z0: -6, z1: -1, shear: 0, zRef: 0, side: 'near' };
      drawShadedBox(buf, m.o, sump, 'iron');
      drawShadedBox(buf, m.o, crank, 'iron');
    } else if (near[0]) {
      const b = near[0];
      const sump = { a0: b.a0 + 0.6, a1: b.a1 - 0.4, c0: b.c0 + 1.5, c1: b.c1 - 1.5, z0: -4, z1: b.z0, shear: 0, zRef: 0, side: 'near' };
      drawShadedBox(buf, m.o, sump, 'iron');
    }
    near.forEach(b => paintBank(buf, m, b));
  }
  const collectors = [];
  if (!e.rotary) {
    m.banks.filter(b => b.side === 'far').forEach(b => { const c = paintHeaders(buf, m, b); if (c) collectors.push(c); });
    m.banks.filter(b => b.side !== 'far').forEach(b => { const c = paintHeaders(buf, m, b); if (c) collectors.push(c); });
  } else {
    const c = engXY(m.o, 1, -8, 2);
    collectors.push({ x: c[0], y: c[1] });
    engTube(buf, [engXY(m.o, 2, -6, 4), c], engRamp(m.header, 1), engRamp(m.header, 0), 1);
  }
  const mouth = paintIntake(buf, m);
  const filtAt = paintForced(buf, m, collectors, mouth);
  if (filtAt) paintFilter(buf, m, filtAt);
  else if (e.intake === 'na') paintFilter(buf, m, mouth);
  paintDress(buf, m, (e.intake === 'supercharger' && e.scType !== 'centrifugal') ? mouth : null);
  paintCooling(buf, m);
  paintExhaustTail(buf, m, collectors[collectors.length - 1] || collectors[0]);
  paintBottles(buf, m);
  for (const p of m.top) blitEng(buf, p.name, p.x, p.y, 0);
  for (const fl of m.anim.flames) { buf.set(fl[0], fl[1], engPal(86)); buf.set(fl[0] + 1, fl[1], engPal(52)); }
  // contact shadow under the crank pulley
  const gy = Math.min(m.H - 3, m.pulley[1] + 18);
  m.ground = { x: Math.max(0, m.pulley[0] - 30), y: gy, w: Math.min(m.W, 80 + m.aLen * 4) };
}

function engPhase(cyl, n, cycle, order, crank) {
  const k = order ? Math.max(0, order.indexOf(cyl)) : cyl - 1;
  let p = (crank - k * cycle / n) % cycle;
  if (p < 0) p += cycle;
  return p;
}

function paintAnim(buf, m, mot) {
  const e = m.e;
  for (const p of m.anim.pulleys) {
    const a = p.r > 3 && e.intake === 'supercharger' && e.scType !== 'centrifugal' ? mot.sc : mot.crank;
    for (let k = 0; k < 3; k++) {
      const ang = a + k * 2.094;
      buf.set(p.x + Math.cos(ang) * (p.r - 1), p.y + Math.sin(ang) * (p.r - 1), engPal(1));
    }
  }
  for (const path of m.anim.belts) {
    const dash = engFrame(mot.crank, 4);
    for (let i = 0; i < path.length - 1; i++) {
      const a = path[i], b = path[i + 1];
      const n = Math.max(1, Math.round(Math.max(Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1]))));
      for (let k = dash; k <= n; k += 4) buf.set(a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n, engPal(87));
    }
  }
  const wf = engFrame(mot.turbo, 4);
  for (const w of m.anim.wheels) blitEng(buf, w.name, w.x, w.y, wf);
  const ff = engFrame(m.anim.fans.some(f => f.mech) ? mot.crank : mot.turbo + mot.sweep * 6, 4);
  for (const f of m.anim.fans) blitEng(buf, 'fan', f.x, f.y, f.mech ? engFrame(mot.crank, 4) : ff);
  for (const h of m.anim.housings || []) {
    engTube(buf, [[h.x, h.y], [h.x, h.y + h.len]], engRamp(m.header, 2), engRamp(m.header, 0), 1);
  }
  for (const fl of m.anim.flames) {
    buf.set(fl[0], fl[1], engPal(86));
    buf.set(fl[0] + 1, fl[1], engPal(52));
    if (engFrame(mot.turbo, 2) === 1) buf.set(fl[0], fl[1] - 1, engPal(101));
  }
  const cycle = (e.two || e.rotary) ? Math.PI * 2 : Math.PI * 4;
  let order = null;
  try { order = firingOrder(m.anim.layout, m.anim.n); } catch (err) { order = null; }
  const hot = engRamp('headRace', 0);
  for (const w of m.anim.windows) {
    const ph = engPhase(w.cyl, m.anim.n, cycle, order, mot.crank);
    if (ph < cycle * 0.12) {
      buf.rect(w.x, w.y, 2, 3, hot);
      buf.set(w.x, w.y, engPal(101));
    }
  }
  if (mot.sweep > 0.55) {
    const step = mot.sweep > 0.85 ? 0 : 1;
    for (const g of m.anim.glows) {
      const ph = engPhase(g.cyl, m.anim.n, cycle, order, mot.crank);
      if (ph < cycle * 0.2) buf.set(g.x, g.y, engRamp('headRace', step));
    }
  }
}

function engMotion(e, t, live) {
  const red = Math.max(2000, +e.redline || 7000);
  const still = typeof previewStill !== 'undefined' && previewStill;
  const tt = still ? 0 : (+t || 0);
  const sweep = still ? 0.35 : (0.5 - 0.5 * Math.cos(tt * 0.7));
  const sweepRpm = 800 + (red - 800) * sweep;
  // The cutaway integrates crankAngle only on the LIVE tab. Once it has moved, follow it;
  // the ENGINE tab otherwise sweeps idle to redline on previewT.
  if (!still && live && live.crank > 0.02 && live.rpm > 0) {
    return {
      rpm: live.rpm, crank: live.crank, turbo: live.turbo || 0, sc: live.sc || 0,
      sweep: Math.max(0, Math.min(1, live.rpm / red))
    };
  }
  const crank = tt * (sweepRpm / 60) * Math.PI * 2 * 0.18;
  const turbo = e.intake === 'turbo' ? tt * (1.4 + 10 * sweep) : tt * 0.8;
  const sc = e.intake !== 'supercharger' ? 0 : (e.scType === 'centrifugal' ? tt * (2 + 8 * sweep) : crank);
  return { rpm: sweepRpm, crank, turbo, sc, sweep };
}

const _engArtCache = new Map();
function drawEngineArt(buf, raw, t, live) {
  const e = engNorm(raw);
  const key = engArtKey(e) + '|' + buf.w + 'x' + buf.h;
  let slot = _engArtCache.get(key);
  if (!slot) {
    const model = engineArtModel(e, buf.w, buf.h);
    const scratch = new PixBuf(buf.w, buf.h);
    paintStatic(scratch, model);
    slot = { c: scratch.c, model };
    _engArtCache.set(key, slot);
    if (_engArtCache.size > 6) _engArtCache.delete(_engArtCache.keys().next().value);
  }
  buf.c = slot.c.slice();
  paintAnim(buf, slot.model, engMotion(e, t, live));
  const gnd = slot.model.ground;
  if (gnd) buf.under(gnd.x, gnd.y, gnd.w, 2, engPal(89));
  buf.outline(engPal(1));
}
