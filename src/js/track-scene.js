// The race and hotlap picture: an oblique chase over the circuit the lap already solved.
// The camera, the ground and the car are the draft view. The solver is not touched.
// Dressing (rail, trees, boards, flags) is drawn, not surveyed, and the car does not ride it.
// One closure, so the short names in here (T, project, quad, shade…) stay out of the page's one script.
const { sceneBind, sceneWeather, sceneChase, sceneOverview, scenePan, sceneProject, scenePaint } = (() => {
let T = null;
let WX = { key: "dry", wet: 0, rain: 0, cloud: 0.05 };
let TOD = "day";
const TEX = {};
let OCCLUDERS = [];
const FURN_SIDE = 1;
let BASE = new DOMMatrix();
const SCENE_MAX_W = 480;
let LAYER = null;

function sceneBind(src) {
  if (src._look) { T = src._look; return T; }
  const pts = src.pts.map(p => ({
    x: p.x, y: p.y, s: p.s || 0, ds: p.ds || 1,
    nx: p.nx || 0, ny: p.ny || 1, w: p.w || src.width || 10
  }));
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const q = pts[(i + 1) % n];
    const ds = Math.hypot(q.x - pts[i].x, q.y - pts[i].y) || 1;
    pts[i].ds = ds;
    pts[i].tx = (q.x - pts[i].x) / ds;
    pts[i].ty = (q.y - pts[i].y) / ds;
    pts[i].hd = Math.atan2(pts[i].ty, pts[i].tx);
  }
  for (let i = 0; i < n; i++) {
    const a = pts[(i - 1 + n) % n], b = pts[i];
    let d = b.hd - a.hd;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    b.curv = d / Math.max(0.5, b.ds);
  }
  for (let k = 0; k < 4; k++) {
    const prev = pts.map(p => p.curv);
    for (let i = 0; i < n; i++) pts[i].curv = (prev[(i - 1 + n) % n] + prev[i] * 2 + prev[(i + 1) % n]) / 4;
  }
  T = { label: src.label, pts, length: src.length || pts[n - 1].s + pts[n - 1].ds, wind: 1 };
  src._look = T;
  return T;
}

function sceneNear(cam, x, y) {
  const dx = x - cam.ox, dy = y - cam.oy;
  const reach = Math.hypot(cam.W, cam.H) / Math.max(0.25, cam.scale * cam.pitch) + 70;
  return dx * dx + dy * dy < reach * reach;
}

function sceneWeather(kind, wet) {
  const x = wet || 0;
  if (kind === "night") { TOD = "night"; return; }
  TOD = "day";
  if (kind === "rain" && x > 0.02) WX = { key: "rain", wet: Math.min(0.7, x), rain: Math.min(1, x / 0.7), cloud: 0.8 };
  else if (kind === "drying") WX = { key: "drying", wet: x, rain: 0, cloud: 0.18 };
  else if (x < 0.02) WX = { key: "dry", wet: 0, rain: 0, cloud: 0.05 };
  else if (x < 0.35) WX = { key: "damp", wet: x, rain: x > 0.12 ? 0.28 : 0, cloud: 0.4 };
  else WX = { key: "wet", wet: Math.min(0.7, x), rain: 0.06, cloud: 0.5 };
}

function sceneChase(car, W, H, scale, carFrac) {
  return chaseCam(car, W, H, scale, carFrac);
}
// Slide the picture by (tx, ty) screen units: the camera moves the other way, along its own axes.
function scenePan(cam, tx, ty) {
  const c = Math.cos(cam.roll || 0), sn = Math.sin(cam.roll || 0);
  const ux = tx * c + ty * sn, uy = -tx * sn + ty * c;   // the lean turned back
  const a = -ux / cam.scale, b = uy / (cam.scale * cam.pitch);
  cam.ox += a * cam.lx + b * cam.fx;
  cam.oy += a * cam.ly + b * cam.fy;
  return cam;
}
function sceneProject(cam, x, y, h) { return project(cam, x, y, h || 0); }
// The scene is painted on the page's own drawing grid (cam.W x cam.H) and then copied up to the canvas
// through whatever scale the page draws with. A sharper screen then costs no more to paint, and the
// picture keeps the page's chunky pixels.
// The scene is painted on a layer no wider than SCENE_MAX_W and copied up to the canvas, unsmoothed,
// through whatever scale the page draws with. A larger or sharper screen then costs no more to paint,
// and the picture keeps the page's chunky pixels. At full size the textured fills kept the page busy
// enough that a click on the timing tower could miss its row (test72).
function scenePaint(ctx, cam, opts) {
  const k = Math.min(1, SCENE_MAX_W / cam.W);
  const W = Math.max(1, Math.round(cam.W * k)), H = Math.max(1, Math.round(cam.H * k));
  if (!LAYER) LAYER = document.createElement("canvas");
  if (LAYER.width !== W || LAYER.height !== H) { LAYER.width = W; LAYER.height = H; }
  const g = LAYER.getContext("2d");
  BASE = new DOMMatrix([k, 0, 0, k, 0, 0]);
  g.save();
  drawWorld(g, cam, opts || {});
  g.restore();
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(LAYER, 0, 0, cam.W, cam.H);
  ctx.restore();
}

function hash(i) {
  let x = Math.imul(i ^ 0x9e3779b9, 0x85ebca6b);
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35);
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
}

function sampleAt(T, s) {
  const pts = T.pts, n = pts.length;
  let ss = ((s % T.length) + T.length) % T.length;
  let lo = 0, hi = n - 1;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (pts[mid].s <= ss) lo = mid; else hi = mid; }
  const a = pts[lo], b = pts[(lo + 1) % n];
  const f = a.ds > 1e-4 ? (ss - a.s) / a.ds : 0;
  const mix = (u, v) => u + (v - u) * f;
  const hd = Math.atan2(Math.sin(a.hd) * (1 - f) + Math.sin(b.hd) * f, Math.cos(a.hd) * (1 - f) + Math.cos(b.hd) * f);
  return {
    x: mix(a.x, b.x), y: mix(a.y, b.y),
    nx: mix(a.nx, b.nx), ny: mix(a.ny, b.ny),
    tx: Math.cos(hd), ty: Math.sin(hd), hd, w: mix(a.w, b.w), s: ss, curv: mix(a.curv, b.curv)
  };
}

function tintSprite(src, rgba) {
  const c = document.createElement("canvas");
  c.width = src.width; c.height = src.height;
  const g = c.getContext("2d");
  g.drawImage(src, 0, 0);
  g.globalCompositeOperation = "source-atop";
  g.fillStyle = rgba;
  g.fillRect(0, 0, c.width, c.height);
  return c;
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const im = new Image();
    im.onload = () => resolve(im);
    im.onerror = () => reject(new Error(src));
    im.src = src;
  });
}

function worldMatrix(cam) {
  const s = cam.scale, p = cam.pitch;
  let m = new DOMMatrix([
    cam.lx * s,
    -cam.fx * s * p,
    cam.ly * s,
    -cam.fy * s * p,
    cam.cx - (cam.ox * cam.lx + cam.oy * cam.ly) * s,
    cam.cy + (cam.ox * cam.fx + cam.oy * cam.fy) * s * p
  ]);
  if (cam.roll) {
    const r = new DOMMatrix();
    r.translateSelf(cam.cx, cam.cy);
    r.rotateSelf((cam.roll * 180) / Math.PI);
    r.translateSelf(-cam.cx, -cam.cy);
    m = r.multiply(m);
  }
  return m;
}

function scaledPattern(ctx, canvas, meters, deg = 0) {
  const pat = ctx.createPattern(canvas, "repeat");
  const sx = meters / canvas.width, sy = meters / canvas.height;
  const rad = deg * Math.PI / 180;
  const cos = Math.cos(rad), sin = Math.sin(rad);
  const m = new DOMMatrix([sx * cos, sx * sin, -sy * sin, sy * cos, 0, 0]);
  pat.setTransform(m);
  return pat;
}

function project(cam, x, y, h = 0) {
  const dx = x - cam.ox, dy = y - cam.oy;
  const rx = dx * cam.lx + dy * cam.ly;
  const fy = dx * cam.fx + dy * cam.fy;
  let sx = rx * cam.scale;
  let sy = -fy * cam.scale * cam.pitch - h * cam.lift;
  if (cam.roll) {
    const c = Math.cos(cam.roll), sn = Math.sin(cam.roll);
    const x2 = sx * c - sy * sn;
    const y2 = sx * sn + sy * c;
    sx = x2; sy = y2;
  }
  return { sx: cam.cx + sx, sy: cam.cy + sy, fy };
}

function camFrom(car, W, H, opts) {
  const look = opts.look, backScale = opts.scale;
  const fx = Math.cos(car.hd), fy = Math.sin(car.hd);
  const ox = car.x + fx * look, oy = car.y + fy * look;
  return {
    ox, oy, fx, fy, lx: -fy, ly: fx,
    cx: W * (opts.cx || 0.5), cy: H * (opts.cy || 0.56),
    scale: backScale, pitch: opts.pitch, lift: backScale * (opts.lift || 0.42),
    roll: opts.roll || 0,
    W, H
  };
}

function sceneOverview(W, H) {
  let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
  for (const p of T.pts) { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y); }
  const pad = 46;
  const scale = Math.min((W - 80) / (maxX - minX + pad * 2), (H - 120) / ((maxY - minY + pad * 2) * 0.82));
  return {
    ox: (minX + maxX) / 2, oy: (minY + maxY) / 2,
    fx: 0, fy: 1, lx: 1, ly: 0,
    cx: W / 2, cy: H / 2 + 10,
    scale, pitch: 0.82, lift: scale * 0.42, roll: 0, W, H
  };
}

function quad(ctx, a, b, c, d) {
  ctx.beginPath();
  ctx.moveTo(a.sx, a.sy); ctx.lineTo(b.sx, b.sy); ctx.lineTo(c.sx, c.sy); ctx.lineTo(d.sx, d.sy);
  ctx.closePath(); ctx.fill();
}

function traceRibbon(ctx, cam, half) {
  const pts = T.pts, n = pts.length;
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const p = pts[i];
    const q = project(cam, p.x + p.nx * half(p), p.y + p.ny * half(p), 0);
    if (i === 0) ctx.moveTo(q.sx, q.sy); else ctx.lineTo(q.sx, q.sy);
  }
  for (let i = n - 1; i >= 0; i--) {
    const p = pts[i];
    const q = project(cam, p.x - p.nx * half(p), p.y - p.ny * half(p), 0);
    ctx.lineTo(q.sx, q.sy);
  }
  ctx.closePath();
}

function traceRibbonWorld(ctx, half) {
  const pts = T.pts, n = pts.length;
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const p = pts[i];
    const x = p.x + p.nx * half(p), y = p.y + p.ny * half(p);
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  for (let i = n - 1; i >= 0; i--) {
    const p = pts[i];
    ctx.lineTo(p.x - p.nx * half(p), p.y - p.ny * half(p));
  }
  ctx.closePath();
}

function fillGround(ctx, cam, canvas, meters) {
  const reach = Math.hypot(cam.W, cam.H) / Math.max(0.01, cam.scale) + 90;
  ctx.save();
  ctx.setTransform(BASE.multiply(worldMatrix(cam)));
  const pat = canvas && scaledPattern(ctx, canvas, meters, 0);
  ctx.fillStyle = pat || "#3d6b34";
  ctx.fillRect(cam.ox - reach, cam.oy - reach, reach * 2, reach * 2);
  ctx.restore();
}

function fillRibbonWorld(ctx, cam, canvas, meters, half, tint) {
  ctx.save();
  ctx.setTransform(BASE.multiply(worldMatrix(cam)));
  const pat = canvas && scaledPattern(ctx, canvas, meters);
  ctx.fillStyle = pat || (meters < 5 ? "#9a7848" : "#2a2c30");
  traceRibbonWorld(ctx, half);
  ctx.fill();
  if (tint) {
    ctx.fillStyle = tint;
    ctx.fill();
  }
  ctx.restore();
}

function sunK() { return (TOD === "night" ? 0.2 : 1) * (1 - WX.cloud * 0.62); }

function castShadow(ctx, cam, x, y, rx, ry, ang) {
  const k = sunK();
  const base = project(cam, x, y, 0);
  ctx.save();
  ctx.translate(base.sx, base.sy);
  if (ang) ctx.rotate(ang);
  ctx.globalCompositeOperation = "multiply";
  ctx.fillStyle = "rgba(28, 36, 30, 0.62)";
  ctx.beginPath();
  ctx.ellipse(0, 1, rx * 0.7, ry * 0.4, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  const q = project(cam, x + 3.2 * k, y + 2.3 * k, 0);
  ctx.save();
  ctx.translate(q.sx, q.sy);
  if (ang) ctx.rotate(ang);
  const alpha = (0.32 + 0.28 * k) * (1 - WX.wet * 0.22);
  ctx.fillStyle = `rgba(16, 36, 22, ${alpha * 0.5})`;
  ctx.beginPath();
  ctx.ellipse(3, 2, rx * 1.25, ry * 0.85, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = `rgba(8, 22, 14, ${alpha})`;
  ctx.beginPath();
  ctx.ellipse(0, 0, rx * 0.95, ry * 0.62, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}
function outsideOf(p) {
  return p.curv >= 0 ? -1 : 1;
}

function fillOutsideBand(ctx, cam, minCurv, innerOf, outerOf, style) {
  const pts = T.pts, n = pts.length;
  ctx.save();
  ctx.setTransform(BASE.multiply(worldMatrix(cam)));
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const a = pts[i], b = pts[(i + 1) % n];
    if (Math.abs(a.curv) < minCurv) continue;
    const side = outsideOf(a);
    const ia = innerOf(a), oa = outerOf(a), ib = innerOf(b), ob = outerOf(b);
    ctx.moveTo(a.x + a.nx * side * ia, a.y + a.ny * side * ia);
    ctx.lineTo(b.x + b.nx * side * ib, b.y + b.ny * side * ib);
    ctx.lineTo(b.x + b.nx * side * ob, b.y + b.ny * side * ob);
    ctx.lineTo(a.x + a.nx * side * oa, a.y + a.ny * side * oa);
    ctx.closePath();
  }
  const pat = style.pattern && scaledPattern(ctx, style.pattern, style.meters);
  ctx.fillStyle = pat || style.color || "#6a4e30";
  ctx.fill();
  if (style.tint) { ctx.fillStyle = style.tint; ctx.fill(); }
  ctx.restore();
}

function drawSausages(ctx, cam) {
  const pts = T.pts, n = pts.length;
  for (let i = 0; i < n; i++) {
      const a = pts[i];
      if (Math.abs(a.curv) < 0.02) continue;
      if (!sceneNear(cam, a.x, a.y)) continue;
    if (Math.floor(a.s / 2.4) % 2) continue;
    const b = pts[(i + 1) % n];
    const apex = -outsideOf(a);
    const along = 1.7, across = 0.85;
    const midS = (a.w / 2) + 0.72;
    const x = a.x + a.nx * apex * midS, y = a.y + a.ny * apex * midS;
    const lift = (u, v, h) => project(cam, x + a.tx * u + a.nx * apex * v, y + a.ty * u + a.ny * apex * v, h);
    const A = lift(-along / 2, -across / 2, 0.35);
    const B = lift(along / 2, -across / 2, 0.35);
    const C = lift(along / 2, across / 2, 0.35);
    const D = lift(-along / 2, across / 2, 0.35);
    const drop = cam.lift * 0.16;
    ctx.fillStyle = "rgba(0,0,0,0.28)";
    quad(ctx, { sx: D.sx, sy: D.sy + drop }, { sx: C.sx, sy: C.sy + drop }, { sx: C.sx, sy: C.sy + drop + 3 }, { sx: D.sx, sy: D.sy + drop + 3 });
    const block = Math.floor(a.s / 2.4) % 2 === 0;
    ctx.fillStyle = block ? "#d8d8dc" : "#d23a32";
    quad(ctx, A, B, C, D);
  }
}

function drawMarbles(ctx, cam) {
  const pts = T.pts, n = pts.length;
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = "rgba(230, 214, 170, 0.7)";
  ctx.lineWidth = Math.max(6, cam.scale * 1.05);
  ctx.beginPath();
  let on = false;
  for (let i = 0; i <= n; i++) {
    const p = pts[i % n];
    const c = Math.abs(p.curv);
    const exit = c > 0.012 && c < 0.04;
    if (!exit) { on = false; continue; }
    const side = outsideOf(p);
    const q = project(cam, p.x + p.nx * side * p.w * 0.34, p.y + p.ny * side * p.w * 0.34);
    if (!on) { ctx.moveTo(q.sx, q.sy); on = true; }
    else ctx.lineTo(q.sx, q.sy);
  }
  ctx.stroke();
  ctx.restore();
}

function drawSkids(ctx, cam, cars) {
  const pts = T.pts, n = pts.length;
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = "rgba(8,8,10,0.5)";
  ctx.lineWidth = Math.max(2, cam.scale * 0.2);
  for (const lat of [-0.9, 0.9]) {
    ctx.beginPath();
    let on = false;
    for (let i = 0; i <= n; i++) {
      const p = pts[i % n];
      const ahead = pts[(i + 10) % n];
      const braking = Math.abs(ahead.curv) > Math.abs(p.curv) + 0.003 && Math.abs(ahead.curv) > 0.028;
      if (!braking) { on = false; continue; }
      const q = project(cam, p.x + p.nx * lat, p.y + p.ny * lat);
      if (!on) { ctx.moveTo(q.sx, q.sy); on = true; }
      else ctx.lineTo(q.sx, q.sy);
    }
    ctx.stroke();
  }
  if (cars) {
    ctx.strokeStyle = "rgba(6,6,8,0.72)";
    ctx.lineWidth = Math.max(2.5, cam.scale * 0.24);
    for (const car of cars) {
      if (!car.brk) continue;
      const fx = Math.cos(car.hd), fy = Math.sin(car.hd);
      const lx = -fy, ly = fx;
      for (const side of [-0.7, 0.7]) {
        ctx.beginPath();
        for (let k = 0; k <= 6; k++) {
          const back = 1.2 + k * 0.85;
          const q = project(cam, car.x - fx * back + lx * side, car.y - fy * back + ly * side);
          if (k === 0) ctx.moveTo(q.sx, q.sy); else ctx.lineTo(q.sx, q.sy);
        }
        ctx.stroke();
      }
    }
  }
  ctx.restore();
}

function drawArmco(ctx, cam) {
  const pts = T.pts, n = pts.length;
  const side = FURN_SIDE;
  const rail = (h) => {
    ctx.beginPath();
    for (let i = 0; i <= n; i++) {
      const p = pts[i % n];
      const d = p.w / 2 + 3.6;
      const q = project(cam, p.x + p.nx * side * d, p.y + p.ny * side * d, h);
      if (i === 0) ctx.moveTo(q.sx, q.sy); else ctx.lineTo(q.sx, q.sy);
    }
    ctx.stroke();
  };
  ctx.save();
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.strokeStyle = "rgba(20,22,26,0.45)";
  ctx.lineWidth = Math.max(4, cam.scale * 0.28);
  rail(0.42);
  ctx.strokeStyle = "#d5d8de";
  ctx.lineWidth = Math.max(2.2, cam.scale * 0.16);
  rail(0.62);
  ctx.strokeStyle = "#9aa0a8";
  ctx.lineWidth = Math.max(1.6, cam.scale * 0.1);
  rail(0.34);
  ctx.strokeStyle = "#5e646c";
  ctx.lineWidth = Math.max(2, cam.scale * 0.12);
  for (let s = 0; s < T.length; s += 7.5) {
    const p = sampleAt(T, s);
    if (!sceneNear(cam, p.x, p.y)) continue;
    const d = p.w / 2 + 3.6;
    const a = project(cam, p.x + p.nx * side * d, p.y + p.ny * side * d, 0);
    const b = project(cam, p.x + p.nx * side * d, p.y + p.ny * side * d, 0.7);
    ctx.beginPath();
    ctx.moveTo(a.sx, a.sy);
    ctx.lineTo(b.sx, b.sy);
    ctx.stroke();
  }
  ctx.restore();
}

function cornerList() {
  const pts = T.pts, n = pts.length, out = [];
  for (let i = 0; i < n; i++) {
    const c = Math.abs(pts[i].curv);
    if (c < 0.02) continue;
    const prev = Math.abs(pts[(i - 1 + n) % n].curv);
    const next = Math.abs(pts[(i + 1) % n].curv);
    if (c < prev || c <= next) continue;
    const sep = out.length ? Math.min(Math.abs(pts[i].s - out[out.length - 1].s), T.length - Math.abs(pts[i].s - out[out.length - 1].s)) : 999;
    if (sep < 45) {
      if (c > Math.abs(out[out.length - 1].curv)) out[out.length - 1] = pts[i];
      continue;
    }
    out.push(pts[i]);
  }
  return out;
}

function drawBoard(ctx, cam, o) {
  const q = project(cam, o.x, o.y, 1.35);
  const w = Math.max(26, cam.scale * 1.7), h = Math.max(14, cam.scale * 0.95);
  const base = project(cam, o.x, o.y, 0);
  ctx.strokeStyle = "#4a4e55";
  ctx.lineWidth = Math.max(2, cam.scale * 0.1);
  ctx.beginPath();
  ctx.moveTo(base.sx, base.sy);
  ctx.lineTo(q.sx, q.sy + h * 0.45);
  ctx.stroke();
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.fillRect(q.sx - w / 2 + 2, q.sy - h / 2 + 3, w, h);
  ctx.fillStyle = "#f6f4ee";
  ctx.fillRect(q.sx - w / 2, q.sy - h / 2, w, h);
  ctx.strokeStyle = "#222";
  ctx.lineWidth = 1;
  ctx.strokeRect(q.sx - w / 2, q.sy - h / 2, w, h);
  ctx.fillStyle = "#161616";
  ctx.font = `${Math.max(8, h * 0.48)}px "Press Start 2P", monospace`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(o.text, q.sx, q.sy + 1);
}

function drawMarshal(ctx, cam, o) {
  const base = project(cam, o.x, o.y, 0);
  const top = project(cam, o.x, o.y, 2.2);
  ctx.strokeStyle = "#d8dbe0";
  ctx.lineWidth = Math.max(2, cam.scale * 0.1);
  ctx.beginPath();
  ctx.moveTo(base.sx, base.sy);
  ctx.lineTo(top.sx, top.sy);
  ctx.stroke();
  ctx.fillStyle = "#f2f2f0";
  ctx.fillRect(base.sx - 5, base.sy - 4, 10, 6);
  ctx.fillStyle = "#ff8a1e";
  ctx.beginPath();
  ctx.moveTo(top.sx, top.sy);
  ctx.lineTo(top.sx + 16, top.sy + 5);
  ctx.lineTo(top.sx, top.sy + 11);
  ctx.fill();
  if (TOD === "night") {
    ctx.fillStyle = "rgba(255, 210, 120, 0.9)";
    ctx.beginPath();
    ctx.arc(top.sx, top.sy, 3, 0, 7);
    ctx.fill();
  }
}

function drawTireWall(ctx, cam, o) {
  const p = o.p;
  for (let row = 0; row < 2; row++) {
    for (let k = 0; k < 5; k++) {
      const q = project(cam, o.x + p.tx * (k - 2) * 0.72, o.y + p.ty * (k - 2) * 0.72, 0.28 + row * 0.48);
      ctx.fillStyle = row ? "#141414" : "#1c1c1c";
      ctx.beginPath();
      ctx.ellipse(q.sx, q.sy, Math.max(4, cam.scale * 0.42), Math.max(3, cam.scale * 0.3), p.hd, 0, 7);
      ctx.fill();
      ctx.strokeStyle = "#3c3c3c";
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }
}

function drawHeadlights(ctx, cam, car) {
  const fx = Math.cos(car.hd), fy = Math.sin(car.hd);
  const lx = -fy, ly = fx;
  ctx.save();
  ctx.globalCompositeOperation = "screen";
  for (const side of [-0.62, 0.62]) {
    const ox = car.x + fx * 2.1 + lx * side;
    const oy = car.y + fy * 2.1 + ly * side;
    const a = project(cam, ox, oy, 0.35);
    const b = project(cam, ox + fx * 18 + lx * 3.6, oy + fy * 18 + ly * 3.6, 0);
    const c = project(cam, ox + fx * 18 - lx * 3.6, oy + fy * 18 - ly * 3.6, 0);
    const g = ctx.createLinearGradient(a.sx, a.sy, (b.sx + c.sx) / 2, (b.sy + c.sy) / 2);
    const hot = 0.34 + WX.wet * 0.28;
    g.addColorStop(0, `rgba(255, 246, 220, ${hot})`);
    g.addColorStop(0.4, `rgba(255, 232, 186, ${hot * 0.4})`);
    g.addColorStop(1, "rgba(255, 232, 186, 0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(a.sx, a.sy);
    ctx.lineTo(b.sx, b.sy);
    ctx.lineTo(c.sx, c.sy);
    ctx.closePath();
    ctx.fill();
  }
  if (WX.wet > 0.12) {
    const a = project(cam, car.x + fx * 2.2, car.y + fy * 2.2, 0);
    const b = project(cam, car.x + fx * 14, car.y + fy * 14, 0);
    const g = ctx.createLinearGradient(a.sx, a.sy, b.sx, b.sy);
    g.addColorStop(0, `rgba(255, 244, 210, ${0.18 + WX.wet * 0.28})`);
    g.addColorStop(1, "rgba(255, 244, 210, 0)");
    ctx.strokeStyle = g;
    ctx.lineWidth = Math.max(6, cam.scale * 0.7);
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(a.sx, a.sy);
    ctx.lineTo(b.sx, b.sy);
    ctx.stroke();
  }
  ctx.restore();
}

function drawWorld(ctx, cam, opts) {
  const W = cam.W, H = cam.H;
  ctx.setTransform(BASE);
  fillGround(ctx, cam, TEX.grass, 7.5);
  if (WX.wet > 0.02 || WX.cloud > 0.15) {
    ctx.fillStyle = `rgba(16, 28, 22, ${WX.cloud * 0.16 + WX.wet * 0.18})`;
    ctx.fillRect(0, 0, W, H);
  }

  const asphaltHalf = p => p.w / 2;
  const gravelHalf = p => p.w / 2 + 3.1;

  ctx.save();
  ctx.translate(6, 10);
  ctx.fillStyle = "rgba(0,0,0,0.28)";
  traceRibbon(ctx, cam, gravelHalf);
  ctx.fill();
  ctx.restore();

  fillRibbonWorld(ctx, cam, TEX.gravel, 4.2, gravelHalf, "rgba(90,60,30,0.12)");
  fillOutsideBand(ctx, cam, 0.03, p => p.w / 2 + 3.15, p => p.w / 2 + 8.4, {
    pattern: TEX.gravel, meters: 4.2, tint: "rgba(36, 22, 12, 0.38)"
  });
  fillOutsideBand(ctx, cam, 0.028, p => p.w / 2 + 1.05, p => p.w / 2 + 2.7, { color: "#1a7340" });

  const pts = T.pts, n = pts.length;
  for (const side of [-1, 1]) {
    for (let i = 0; i < n; i++) {
      const a = pts[i];
      if (Math.abs(a.curv) < 0.032) continue;
      const b = pts[(i + 1) % n];
      if (!sceneNear(cam, a.x, a.y) && !sceneNear(cam, b.x, b.y)) continue;
      const block = Math.floor(a.s / 3.2) % 2;
      const inner = p => side * (p.w / 2 + 0.02);
      const outer = p => side * (p.w / 2 + 0.95);
      const A = project(cam, a.x + a.nx * inner(a), a.y + a.ny * inner(a));
      const B = project(cam, b.x + b.nx * inner(b), b.y + b.ny * inner(b));
      const C = project(cam, b.x + b.nx * outer(b), b.y + b.ny * outer(b));
      const D = project(cam, a.x + a.nx * outer(a), a.y + a.ny * outer(a));
      ctx.fillStyle = block ? "#6e1418" : "#8d8e96";
      quad(ctx, { sx: D.sx + 1.2, sy: D.sy + cam.lift * 0.22 }, { sx: C.sx + 1.2, sy: C.sy + cam.lift * 0.22 }, C, D);
      ctx.fillStyle = block ? "#e43737" : "#f4f4f6";
      quad(ctx, A, B, C, D);
    }
  }
  drawSausages(ctx, cam);

  ctx.save();
  ctx.translate(2.2, cam.lift * 0.45);
  ctx.fillStyle = "#1c1e22";
  traceRibbon(ctx, cam, asphaltHalf);
  ctx.fill();
  ctx.restore();

  fillRibbonWorld(ctx, cam, TEX.asphalt, 6.5, asphaltHalf, "rgba(8,10,12,0.22)");
  ctx.strokeStyle = "rgba(12,12,14,0.85)";
  ctx.lineWidth = Math.max(2, cam.scale * 0.07);
  traceRibbon(ctx, cam, asphaltHalf);
  ctx.stroke();

  drawRubber(ctx, cam);
  drawMarbles(ctx, cam);
  drawSkids(ctx, cam, opts.cars);

  ctx.lineCap = "butt";
  ctx.lineJoin = "round";
  ctx.strokeStyle = "#f3f3f0";
  ctx.lineWidth = Math.max(2, cam.scale * 0.16);
  for (const side of [-1, 1]) {
    ctx.beginPath();
    for (let i = 0; i <= n; i++) {
      const p = pts[i % n];
      const q = project(cam, p.x + p.nx * side * (p.w / 2 - 0.38), p.y + p.ny * side * (p.w / 2 - 0.38));
      if (i === 0) ctx.moveTo(q.sx, q.sy); else ctx.lineTo(q.sx, q.sy);
    }
    ctx.stroke();
  }

  drawWetRoad(ctx, cam);
  drawStart(ctx, cam);
  drawDressing(ctx, cam);
  drawSplashes(ctx, cam);
  if (TOD === "night") {
    ctx.fillStyle = "rgba(4, 8, 18, 0.62)";
    ctx.fillRect(0, 0, cam.W, cam.H);
    if (opts.cars) for (const car of opts.cars) drawHeadlights(ctx, cam, car);
  }
  if (opts.lap && opts.lap.lim && typeof LIMC !== "undefined") {
    const L = opts.lap, line = L.track.line, m = line.length;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.lineWidth = Math.max(2, cam.scale * 0.2);
    for (let i = 0; i < m; i++) {
      const j = (i + 1) % m;
      if (!sceneNear(cam, line[i].x, line[i].y)) continue;
      const A = project(cam, line[i].x, line[i].y), B = project(cam, line[j].x, line[j].y);
      ctx.strokeStyle = LIMC[L.lim[i]] || "#888";
      ctx.beginPath();
      ctx.moveTo(A.sx, A.sy);
      ctx.lineTo(B.sx, B.sy);
      ctx.stroke();
    }
  }
  if (opts.cars) {
    const cars = opts.cars.map(car => ({ car, sy: project(cam, car.x, car.y, 0).sy }));
    cars.sort((u, v) => u.sy - v.sy);
    for (const it of cars) {
      drawTyreParticles(ctx, cam, it.car);
      drawCar(ctx, cam, it.car);
    }
  }
  drawAtmosphere(ctx, cam);
}

function drawWetRoad(ctx, cam) {
  if (WX.wet < 0.02) return;
  ctx.save();
  ctx.setTransform(BASE.multiply(worldMatrix(cam)));
  traceRibbonWorld(ctx, p => p.w / 2 - 0.2);
  ctx.clip();
  ctx.setTransform(BASE);
  ctx.fillStyle = `rgba(10, 20, 34, ${0.1 + WX.wet * 0.45})`;
  ctx.fillRect(0, 0, cam.W, cam.H);
  ctx.globalCompositeOperation = "screen";
  ctx.strokeStyle = `rgba(186, 208, 226, ${0.04 + WX.wet * 0.16})`;
  ctx.lineWidth = Math.max(3, cam.scale * 0.7);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  const n = T.pts.length;
  for (const side of [-0.22, 0.18]) {
    ctx.beginPath();
    for (let i = 0; i <= n; i++) {
      const p = T.pts[i % n];
      const q = project(cam, p.x + p.nx * side * p.w, p.y + p.ny * side * p.w);
      if (i === 0) ctx.moveTo(q.sx, q.sy); else ctx.lineTo(q.sx, q.sy);
    }
    ctx.stroke();
  }
  if (WX.key === "drying") {
    ctx.globalCompositeOperation = "destination-out";
    ctx.strokeStyle = "rgba(0,0,0,0.78)";
    ctx.lineWidth = Math.max(10, cam.scale * 2.15);
    ctx.beginPath();
    for (let i = 0; i <= n; i++) {
      const p = T.pts[i % n];
      const off = Math.max(-1, Math.min(1, p.curv * 18)) * p.w * 0.28;
      const q = project(cam, p.x + p.nx * off, p.y + p.ny * off);
      if (i === 0) ctx.moveTo(q.sx, q.sy); else ctx.lineTo(q.sx, q.sy);
    }
    ctx.stroke();
  }
  ctx.restore();
}

function drawAtmosphere(ctx, cam) {
  if (TOD === "night") {
    drawRain(ctx, cam);
    return;
  }
  if (WX.cloud > 0.08) {
    ctx.fillStyle = `rgba(42, 50, 60, ${WX.cloud * 0.32})`;
    ctx.fillRect(0, 0, cam.W, cam.H);
  }
  drawVolumetric(ctx, cam);
  drawRain(ctx, cam);
  if (WX.rain > 0.45) {
    const g = ctx.createLinearGradient(0, cam.H * 0.4, 0, cam.H);
    g.addColorStop(0, "rgba(170,180,190,0)");
    g.addColorStop(1, `rgba(160,172,184,${0.16 * WX.rain})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, cam.W, cam.H);
  }
}

function drawVolumetric(ctx, cam) {
  const scatter = 0.16 + WX.cloud * 0.22 + WX.rain * 0.5 + WX.wet * 0.06;
  const sun = project(cam, cam.ox - 48, cam.oy - 34, 22);
  const ground = project(cam, cam.ox, cam.oy, 0);
  let dx = ground.sx - sun.sx, dy = ground.sy - sun.sy;
  const mag = Math.hypot(dx, dy) || 1;
  dx /= mag; dy /= mag;

  ctx.save();
  ctx.globalCompositeOperation = "screen";
  for (const t of OCCLUDERS) {
    const q = project(cam, t.x - 2.4, t.y - 1.7, 0);
    const rad = t.r * cam.scale * 2.4;
    const g = ctx.createRadialGradient(q.sx, q.sy, rad * 0.05, q.sx, q.sy, rad);
    g.addColorStop(0, `rgba(255, 214, 160, ${scatter * 0.28})`);
    g.addColorStop(1, "rgba(255, 214, 160, 0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(q.sx, q.sy, rad, rad * 0.5, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  const wash = ctx.createLinearGradient(sun.sx, sun.sy, ground.sx + dx * cam.W, ground.sy + dy * cam.H);
  wash.addColorStop(0, `rgba(255, 220, 176, ${scatter * 0.22})`);
  wash.addColorStop(0.45, `rgba(255, 210, 160, ${scatter * 0.05})`);
  wash.addColorStop(1, "rgba(255, 210, 160, 0)");
  ctx.fillStyle = wash;
  ctx.fillRect(0, 0, cam.W, cam.H);
  ctx.restore();
}

function drawRain(ctx, cam) {
  if (WX.rain < 0.04) return;
  const layers = [
    { n: 260, len: 6, thick: 1, alpha: 0.16, slant: 0.18, seed: 11 },
    { n: 150, len: 15, thick: 1.25, alpha: 0.32, slant: 0.28, seed: 29 },
    { n: 48, len: 30, thick: 2.2, alpha: 0.62, slant: 0.36, seed: 47 }
  ];
  ctx.lineCap = "round";
  for (const L of layers) {
    const count = Math.round(L.n * (0.3 + 0.7 * WX.rain));
    ctx.lineWidth = L.thick;
    for (let k = 0; k < count; k++) {
      const x = hash(k * 13 + L.seed) * (cam.W + 40) - 20;
      const y = hash(k * 13 + L.seed + 1) * (cam.H + 40) - 20;
      const slant = L.slant + (hash(k + L.seed) - 0.5) * 0.16;
      const len = L.len * (0.55 + hash(k * 3 + L.seed) * 0.7) * (0.65 + 0.5 * WX.rain);
      const a = L.alpha * (0.4 + 0.6 * WX.rain) * (0.5 + hash(k + 5) * 0.5);
      ctx.strokeStyle = `rgba(198,214,228,${a})`;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x - len * slant, y + len);
      ctx.stroke();
      if (L.seed === 47) {
        ctx.fillStyle = `rgba(230,238,245,${Math.min(0.8, a + 0.2)})`;
        ctx.beginPath();
        ctx.arc(x - len * slant, y + len, L.thick * 0.7, 0, 7);
        ctx.fill();
      }
    }
  }
}

function drawSplashes(ctx, cam) {
  if (WX.rain < 0.12) return;
  const n = Math.round(16 + 36 * WX.rain);
  const reach = 78;
  for (let i = 0; i < n; i++) {
    const age = hash(i * 7 + 3);
    const x = cam.ox + (hash(i * 9 + 1) - 0.5) * reach;
    const y = cam.oy + (hash(i * 9 + 4) - 0.5) * reach * 0.72;
    const q = project(cam, x, y, 0);
    if (q.sx < -30 || q.sx > cam.W + 30 || q.sy < 40 || q.sy > cam.H + 10) continue;
    const rad = (1.5 + age * 6.5) * (0.55 + WX.rain * 0.6);
    ctx.strokeStyle = `rgba(220,232,242,${(1 - age) * 0.42 * WX.rain})`;
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.ellipse(q.sx, q.sy, rad, rad * 0.42, 0, 0, 7);
    ctx.stroke();
  }
}

function drawTyreParticles(ctx, cam, car) {
  const wet = WX.wet > 0.12;
  const braking = !!car.brk;
  if (!wet && !braking) return;
  const fx = Math.cos(car.hd), fy = Math.sin(car.hd);
  const lx = -fy, ly = fx;
  const n = braking ? 18 : 16;
  const seed = Math.floor(car.x * 3 + car.y);
  for (let i = 0; i < n; i++) {
    const age = hash(i * 11 + seed);
    const side = (i % 2 ? 1 : -1) * (0.45 + hash(i + seed) * 0.25);
    let back, spread, lift, col, rad;
    if (braking && (!wet || i < 8)) {
      back = 0.7 + age * 2.4;
      spread = side + (hash(i + 4) - 0.5) * age * 1.6;
      lift = age * 0.35;
      const fade = (1 - age) * 0.45;
      col = `rgba(150,124,86,${fade})`;
      rad = 0.22 + age * 0.55;
    } else {
      back = 1.1 + age * (4.2 + WX.rain * 2.2);
      spread = side + (hash(i + 6) - 0.5) * age * 2.8;
      lift = 0.15 + age * (0.7 + WX.rain * 0.8);
      const fade = (1 - age) * (0.28 + WX.rain * 0.35);
      col = `rgba(214,226,234,${fade})`;
      rad = 0.18 + age * (0.45 + WX.rain * 0.35);
    }
    const q = project(cam, car.x - fx * back + lx * spread, car.y - fy * back + ly * spread, lift);
    const px = Math.max(1.5, rad * cam.scale * 0.85);
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.ellipse(q.sx, q.sy, px, px * 0.72, car.hd, 0, 7);
    ctx.fill();
  }
}
function drawRubber(ctx, cam) {
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = "rgba(6,6,8,0.42)";
  ctx.lineWidth = Math.max(1.5, cam.scale * 0.42);
  ctx.beginPath();
  const n = T.pts.length;
  for (let i = 0; i <= n; i++) {
    const p = T.pts[i % n];
    const off = Math.max(-1, Math.min(1, p.curv * 18)) * p.w * 0.26;
    const q = project(cam, p.x + p.nx * off, p.y + p.ny * off);
    if (i === 0) ctx.moveTo(q.sx, q.sy); else ctx.lineTo(q.sx, q.sy);
  }
  ctx.stroke();
  ctx.strokeStyle = "rgba(20,20,24,0.28)";
  ctx.lineWidth = Math.max(1, cam.scale * 0.16);
  ctx.stroke();
}

function drawStart(ctx, cam) {
  const a = sampleAt(T, 0.2), b = sampleAt(T, 3.4);
  const cols = 10;
  for (let c = 0; c < cols; c++) {
    const u0 = -1 + 2 * c / cols, u1 = -1 + 2 * (c + 1) / cols;
    const at = (p, u) => project(cam, p.x + p.nx * u * (p.w / 2 - 0.5), p.y + p.ny * u * (p.w / 2 - 0.5));
    ctx.fillStyle = c % 2 ? "#f4f4f2" : "#17171b";
    quad(ctx, at(a, u0), at(b, u0), at(b, u1), at(a, u1));
  }
}

function drawDressing(ctx, cam) {
  drawArmco(ctx, cam);
  const posts = [];
  const step = 14;
  const count = Math.floor(T.length / step);
  for (let i = 0; i < count; i++) {
    const p = sampleAt(T, i * step + 6);
    if (!sceneNear(cam, p.x, p.y)) continue;
    const outside = -1;
    if (hash(i + 11) > 0.18) {
      const along = 20;
      const dist = p.w / 2 + 4.6;
      const x0 = p.x - p.tx * along / 2 + p.nx * outside * dist;
      const y0 = p.y - p.ty * along / 2 + p.ny * outside * dist;
      const x1 = p.x + p.tx * along / 2 + p.nx * outside * dist;
      const y1 = p.y + p.ty * along / 2 + p.ny * outside * dist;
      posts.push({ kind: "wall", x: (x0 + x1) / 2, y: (y0 + y1) / 2, x0, y0, x1, y1, h: 0.85 });
    }
    if (hash(i + 21) > 0.42) {
      const dist = p.w / 2 + 6 + hash(i + 4) * 9;
      const lateral = (hash(i + 8) - 0.5) * 6;
      posts.push({
        kind: "tree",
        x: p.x + p.nx * outside * dist + p.tx * lateral,
        y: p.y + p.ny * outside * dist + p.ty * lateral,
        r: 1.6 + hash(i + 6) * 2.4,
        h: 3.2 + hash(i + 7) * 3.5,
        shade: hash(i + 15)
      });
    }
    if (Math.abs(p.curv) > 0.02) {
      const side = outsideOf(p);
      const dist = p.w / 2 + 6.4;
      posts.push({
        kind: "tires",
        p,
        x: p.x + p.nx * side * dist,
        y: p.y + p.ny * side * dist
      });
    }
  }
  for (let s = 100; s < T.length; s += 100) {
    const p = sampleAt(T, s);
    if (!sceneNear(cam, p.x, p.y)) continue;
    const dist = p.w / 2 + 8.2;
    posts.push({
      kind: "board",
      text: String(Math.round(s)),
      x: p.x + p.nx * FURN_SIDE * dist,
      y: p.y + p.ny * FURN_SIDE * dist
    });
  }
  for (const p of cornerList()) {
    if (!sceneNear(cam, p.x, p.y)) continue;
    const side = outsideOf(p);
    const dist = p.w / 2 + 7.2;
    posts.push({
      kind: "marshal",
      x: p.x + p.nx * side * dist - p.tx * 4,
      y: p.y + p.ny * side * dist - p.ty * 4
    });
    posts.push({
      kind: "tires",
      p,
      x: p.x + p.nx * side * (p.w / 2 + 5.4),
      y: p.y + p.ny * side * (p.w / 2 + 5.4)
    });
  }
  posts.push({ kind: "gantry", p: sampleAt(T, 0) });
  OCCLUDERS = posts.filter(o => o.kind === "tree");

  const drawn = posts.map(o => {
    const q = project(cam, o.x || o.p.x, o.y || o.p.y, 0);
    return { o, sy: q.sy };
  });
  drawn.sort((a, b) => a.sy - b.sy);
  for (const d of drawn) {
    if (d.o.kind === "wall") drawWall(ctx, cam, d.o);
    else if (d.o.kind === "tree") drawTree(ctx, cam, d.o);
    else if (d.o.kind === "tires") drawTireWall(ctx, cam, d.o);
    else if (d.o.kind === "board") drawBoard(ctx, cam, d.o);
    else if (d.o.kind === "marshal") drawMarshal(ctx, cam, d.o);
    else if (cam.scale > 6) drawGantry(ctx, cam, d.o.p);
  }
}

function drawWall(ctx, cam, w) {
  const a = project(cam, w.x0, w.y0, 0), b = project(cam, w.x1, w.y1, 0);
  let dx = b.sx - a.sx, dy = b.sy - a.sy;
  const len = Math.hypot(dx, dy) || 1;
  if (len < 28) return;
  const px = -dy / len, py = dx / len;
  const thick = Math.max(4, cam.scale * 0.28);
  const top = [
    { sx: a.sx + px * thick, sy: a.sy + py * thick },
    { sx: b.sx + px * thick, sy: b.sy + py * thick },
    { sx: b.sx - px * 0.2, sy: b.sy - py * 0.2 },
    { sx: a.sx - px * 0.2, sy: a.sy - py * 0.2 }
  ];
  const face = [
    top[3], top[2],
    { sx: b.sx - px * 0.2, sy: b.sy - py * 0.2 + thick * 0.85 },
    { sx: a.sx - px * 0.2, sy: a.sy - py * 0.2 + thick * 0.85 }
  ];
  const k = sunK();
  const sh = project(cam, w.x + 1.2 * k, w.y + 0.85 * k, 0);
  ctx.fillStyle = `rgba(0,0,0,${0.22 * (0.4 + 0.6 * k)})`;
  ctx.beginPath();
  ctx.ellipse(sh.sx, sh.sy, len / 2, thick * 0.85, Math.atan2(dy, dx), 0, 7);
  ctx.fill();
  const paint = (poly, patPx, tint) => {
    ctx.beginPath();
    ctx.moveTo(poly[0].sx, poly[0].sy);
    for (let i = 1; i < poly.length; i++) ctx.lineTo(poly[i].sx, poly[i].sy);
    ctx.closePath();
    ctx.save();
    ctx.clip();
    ctx.fillStyle = TEX.concrete ? scaledPattern(ctx, TEX.concrete, patPx) : "#7a756c";
    ctx.fillRect(Math.min(a.sx, b.sx) - 20, Math.min(a.sy, b.sy) - 20, len + 40, thick * 3 + 40);
    if (tint) { ctx.fillStyle = tint; ctx.fillRect(Math.min(a.sx, b.sx) - 20, Math.min(a.sy, b.sy) - 20, len + 40, thick * 3 + 40); }
    ctx.restore();
  };
  paint(face, 64, "rgba(18,20,24,0.42)");
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(face[0].sx, face[0].sy);
  for (let i = 1; i < face.length; i++) ctx.lineTo(face[i].sx, face[i].sy);
  ctx.closePath();
  ctx.clip();
  const bounce = ctx.createLinearGradient(face[0].sx, face[3].sy, face[0].sx, face[0].sy);
  bounce.addColorStop(0, "rgba(78, 118, 62, 0.38)");
  bounce.addColorStop(1, "rgba(78, 118, 62, 0)");
  ctx.fillStyle = bounce;
  ctx.fillRect(Math.min(a.sx, b.sx) - 20, Math.min(a.sy, b.sy) - 10, len + 40, thick * 3 + 30);
  ctx.restore();
  paint(top, 48, "rgba(70,74,82,0.35)");
}

function drawTree(ctx, cam, t) {
  const base = project(cam, t.x, t.y, 0);
  const top = project(cam, t.x, t.y, t.h * 0.55);
  const r = t.r * cam.scale * 1.15;
  castShadow(ctx, cam, t.x, t.y, r * 0.95, r * 0.62, 0);
  ctx.strokeStyle = "#5c3d28"; ctx.lineWidth = Math.max(2, cam.scale * 0.16);
  ctx.beginPath(); ctx.moveTo(base.sx, base.sy); ctx.lineTo(top.sx, top.sy + r * 0.25); ctx.stroke();
  const spr = TEX.trees && TEX.trees[Math.floor(t.shade * TEX.trees.length) % TEX.trees.length];
  const dw = r * (1.7 + t.shade * 0.7), dh = spr ? dw * (spr.height / spr.width) : dw * 1.3;
  if (spr) ctx.drawImage(spr, top.sx - dw / 2, top.sy - dh * 0.42, dw, dh);
  else {
    ctx.fillStyle = "#2f6b32";
    ctx.beginPath();
    ctx.ellipse(top.sx, top.sy, dw * 0.45, dh * 0.55, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.save();
  ctx.globalCompositeOperation = "multiply";
  ctx.fillStyle = "rgba(70, 110, 58, 0.35)";
  ctx.beginPath();
  ctx.ellipse(top.sx, top.sy + dh * 0.18, dw * 0.36, dh * 0.16, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawGantry(ctx, cam, p) {
  const hw = p.w / 2 + 1.4;
  const h = 4.6;
  for (const side of [-1, 1]) {
    const x = p.x + p.nx * side * hw, y = p.y + p.ny * side * hw;
    const a = project(cam, x, y, 0), b = project(cam, x, y, h);
    ctx.strokeStyle = "#cfd3d8"; ctx.lineWidth = Math.max(3, cam.scale * 0.22);
    ctx.beginPath(); ctx.moveTo(a.sx, a.sy); ctx.lineTo(b.sx, b.sy); ctx.stroke();
  }
  const l = project(cam, p.x + p.nx * -hw, p.y + p.ny * -hw, h);
  const r = project(cam, p.x + p.nx * hw, p.y + p.ny * hw, h);
  ctx.strokeStyle = "#e6e8ec"; ctx.lineWidth = Math.max(4, cam.scale * 0.28);
  ctx.beginPath(); ctx.moveTo(l.sx, l.sy); ctx.lineTo(r.sx, r.sy); ctx.stroke();
  for (let k = 0; k < 5; k++) {
    const u = -0.55 + k * 0.27;
    const q = project(cam, p.x + p.nx * hw * u, p.y + p.ny * hw * u, h - 0.35);
    ctx.fillStyle = k === 4 ? "#3ecf6e" : "#e23b3b";
    ctx.beginPath(); ctx.arc(q.sx, q.sy, Math.max(3, cam.scale * 0.18), 0, 7); ctx.fill();
  }
}

function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const t = f < 0 ? 0 : 255, a = Math.abs(f);
  r = Math.round(r + (t - r) * a); g = Math.round(g + (t - g) * a); b = Math.round(b + (t - b) * a);
  return `rgb(${r},${g},${b})`;
}

function drawCar(ctx, cam, car) {
  const fx = Math.cos(car.hd), fy = Math.sin(car.hd);
  const lx = -fy, ly = fx;
  const o = project(cam, car.x, car.y, 0);
  const f = project(cam, car.x + fx * 4.6, car.y + fy * 4.6, 0);
  const s = project(cam, car.x + lx * 1.9, car.y + ly * 1.9, 0);
  const len = Math.max(18, Math.hypot(f.sx - o.sx, f.sy - o.sy));
  const wid = Math.max(10, Math.hypot(s.sx - o.sx, s.sy - o.sy));
  const ang = Math.atan2(f.sy - o.sy, f.sx - o.sx);
  castShadow(ctx, cam, car.x, car.y, len * 0.5, wid * 0.72, ang);
  ctx.save();
  ctx.translate(o.sx, o.sy);
  ctx.rotate(ang);
  ctx.translate(0, -Math.min(8, cam.lift * 0.18));

  const wheel = (x, y) => {
    ctx.fillStyle = "#141418";
    ctx.beginPath();
    ctx.roundRect(x - len * 0.09, y - wid * 0.16, len * 0.18, wid * 0.32, 2);
    ctx.fill();
  };
  wheel(len * 0.26, -wid * 0.46);
  wheel(len * 0.26, wid * 0.14);
  wheel(-len * 0.30, -wid * 0.46);
  wheel(-len * 0.30, wid * 0.14);

  const body = () => {
    ctx.beginPath();
    ctx.moveTo(-len * 0.46, -wid * 0.38);
    ctx.lineTo(len * 0.22, -wid * 0.42);
    ctx.quadraticCurveTo(len * 0.52, -wid * 0.36, len * 0.52, 0);
    ctx.quadraticCurveTo(len * 0.52, wid * 0.36, len * 0.22, wid * 0.42);
    ctx.lineTo(-len * 0.46, wid * 0.38);
    ctx.quadraticCurveTo(-len * 0.56, 0, -len * 0.46, -wid * 0.38);
    ctx.closePath();
  };
  ctx.fillStyle = shade(car.col, -0.38);
  ctx.save(); ctx.translate(1.4, 3.2); body(); ctx.fill(); ctx.restore();
  ctx.fillStyle = car.col;
  body(); ctx.fill();
  ctx.save();
  body();
  ctx.clip();
  ctx.fillStyle = "#f4f1ea";
  ctx.fillRect(-len * 0.48, -wid * 0.07, len * 0.78, wid * 0.14);
  ctx.fillStyle = shade(car.col, -0.45);
  ctx.fillRect(len * 0.16, -wid * 0.42, len * 0.2, wid * 0.84);
  if (TOD === "night") {
    ctx.fillStyle = "rgba(6, 10, 22, 0.38)";
    ctx.fillRect(-len, -wid, len * 2, wid * 2);
  }
  const bleed = ctx.createLinearGradient(0, wid * 0.5, 0, -wid * 0.15);
  bleed.addColorStop(0, "rgba(64, 112, 52, 0.4)");
  bleed.addColorStop(1, "rgba(64, 112, 52, 0)");
  ctx.fillStyle = bleed;
  ctx.fillRect(-len, -wid, len * 2, wid * 2);
  ctx.restore();
  ctx.lineWidth = Math.max(2, len * 0.055);
  ctx.strokeStyle = "rgba(8,8,10,0.9)";
  ctx.stroke();
  ctx.fillStyle = shade(car.col, 0.22);
  ctx.beginPath();
  ctx.ellipse(len * 0.02, -wid * 0.08, len * 0.22, wid * 0.18, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#1a3144";
  ctx.beginPath();
  ctx.roundRect(-len * 0.08, -wid * 0.28, len * 0.36, wid * 0.56, Math.max(2, wid * 0.08));
  ctx.fill();
  ctx.fillStyle = "rgba(198,228,240,0.92)";
  ctx.beginPath();
  ctx.roundRect(len * 0.08, -wid * 0.22, len * 0.16, wid * 0.44, 2);
  ctx.fill();

  ctx.fillStyle = "#fff3c4";
  ctx.fillRect(len * 0.44, -wid * 0.28, len * 0.07, wid * 0.16);
  ctx.fillRect(len * 0.44, wid * 0.12, len * 0.07, wid * 0.16);
  ctx.fillStyle = car.brk ? "#ff2d2d" : (TOD === "night" ? "#ff5a4a" : "#7a1e1e");
  ctx.fillRect(-len * 0.52, -wid * 0.30, len * 0.06, wid * 0.16);
  ctx.fillRect(-len * 0.52, wid * 0.14, len * 0.06, wid * 0.16);
  if (TOD === "night") {
    ctx.fillStyle = car.brk ? "rgba(255,40,40,0.55)" : "rgba(255,70,50,0.28)";
    ctx.beginPath();
    ctx.arc(-len * 0.48, -wid * 0.22, len * 0.08, 0, 7);
    ctx.arc(-len * 0.48, wid * 0.22, len * 0.08, 0, 7);
    ctx.fill();
  }

  ctx.fillStyle = "#111";
  ctx.font = `${Math.max(8, Math.min(13, wid * 0.5))}px "Press Start 2P", monospace`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(String(car.pos || 1), -len * 0.16, wid * 0.02);
  ctx.restore();
}

function chaseCam(car, W, H, scale, carFrac) {
  const pitch = 0.78;
  const cyFrac = 0.46;
  const look = ((carFrac - cyFrac) * H) / (scale * pitch);
  const cam = camFrom(car, W, H, { look, scale, pitch, cy: cyFrac });
  const lean = Math.max(-0.07, Math.min(0.07, -(car.curv || 0) * 1.35));
  cam.roll = lean;
  return cam;
}

function sceneLoadTex() {
  if (typeof SCENE_TEX === "undefined") return;
  Promise.all([
    loadImage(SCENE_TEX.grass),
    loadImage(SCENE_TEX.asphalt),
    loadImage(SCENE_TEX.gravel),
    loadImage(SCENE_TEX.concrete),
    loadImage(SCENE_TEX.tree)
  ]).then(([grass, asphalt, gravel, concrete, treeImg]) => {
    TEX.grass = grass;
    TEX.asphalt = asphalt;
    TEX.gravel = gravel;
    TEX.concrete = concrete;
    TEX.trees = [
      treeImg,
      tintSprite(treeImg, "rgba(20,70,20,0.28)"),
      tintSprite(treeImg, "rgba(80,90,20,0.22)"),
      tintSprite(treeImg, "rgba(10,40,16,0.35)")
    ];
  }).catch(() => {});
}
sceneLoadTex();
return { sceneBind, sceneWeather, sceneChase, sceneOverview, scenePan, sceneProject, scenePaint };
})();
