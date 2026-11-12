// The circuit as a place, not a ribbon (the map stays the fitted top-down view).
// Grass, gravel, a green runoff and a deeper trap are painted from the centreline the lap already
// uses. Nothing here is surveyed: a corner is "tight" when its radius is under 90 m, the rail sits
// on the +normal side the whole way round, and a board marks distance along the sampled centreline.
// Sausage kerbs and the grass behind them are drawn only. The lap still rides the 0.8 m FIA ramp.
const SCENE = { grass: null };

function sceneTex() {
  if (SCENE.grass) return SCENE.grass;
  const c = document.createElement('canvas');
  c.width = 8; c.height = 8;
  const g = c.getContext('2d');
  g.fillStyle = '#3c6a32'; g.fillRect(0, 0, 8, 8);
  g.fillStyle = '#4d7c3e'; g.fillRect(1, 2, 2, 2); g.fillRect(5, 5, 2, 2);
  g.fillStyle = '#2c5226'; g.fillRect(4, 1, 2, 1); g.fillRect(2, 6, 2, 1);
  SCENE.grass = c;
  return c;
}

function sceneTurn(pts, i) {
  const n = pts.length, a = pts[(i - 1 + n) % n], b = pts[i], c = pts[(i + 1) % n];
  return (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
}
// +normal is to the left of travel, so a left turn's outside is -normal.
function sceneOutside(pts, i) { return sceneTurn(pts, i) >= 0 ? -1 : 1; }

function sceneRibbon(g, T, px, py, scV, extra) {
  const p = T.pts, n = p.length;
  const hw = q => ((q.hw != null ? q.hw : T.width / 2) + extra) * scV;
  g.beginPath();
  for (let i = 0; i <= n; i++) {
    const q = p[i % n], h = hw(q);
    const X = px(q) + q.nx * h, Y = py(q) + q.ny * h;
    if (i) g.lineTo(X, Y); else g.moveTo(X, Y);
  }
  for (let i = n; i >= 0; i--) {
    const q = p[i % n], h = hw(q);
    g.lineTo(px(q) - q.nx * h, py(q) - q.ny * h);
  }
  g.closePath();
  g.fill();
}

function sceneBand(g, T, px, py, scV, pred, inner, outer) {
  const pts = T.pts, n = pts.length;
  g.beginPath();
  for (let i = 0; i < n; i++) {
    const a = pts[i], b = pts[(i + 1) % n];
    if (!pred(a)) continue;
    const side = sceneOutside(pts, i);
    const edge = q => (q.hw != null ? q.hw : T.width / 2) * scV;
    const ia = edge(a) + inner * scV, oa = edge(a) + outer * scV;
    const ib = edge(b) + inner * scV, ob = edge(b) + outer * scV;
    g.moveTo(px(a) + side * a.nx * ia, py(a) + side * a.ny * ia);
    g.lineTo(px(b) + side * b.nx * ib, py(b) + side * b.ny * ib);
    g.lineTo(px(b) + side * b.nx * ob, py(b) + side * b.ny * ob);
    g.lineTo(px(a) + side * a.nx * oa, py(a) + side * a.ny * oa);
    g.closePath();
  }
  g.fill();
}

function sceneAt(T, s) {
  const pts = T.pts;
  let lo = 0, hi = pts.length - 1;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (pts[mid].s <= s) lo = mid; else hi = mid; }
  return pts[lo];
}

function drawTrackScene(g, T, px, py, scV) {
  const pts = T.pts, n = pts.length;
  if (!n || pts[0].nx == null) {
    g.fillStyle = '#23232f';
    trackRibbon(g, T, px, py, scV, 3);
    return;
  }
  const pat = g.createPattern(sceneTex(), 'repeat');
  const tile = scV * 0.5;
  const ox = px({ x: 0, y: 0 }), oy = py({ x: 0, y: 0 });
  pat.setTransform(new DOMMatrix([tile, 0, 0, tile, ox, oy]));
  let minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9;
  for (const q of [
    { x: T.minX - 30, y: T.minY - 30 }, { x: T.maxX + 30, y: T.minY - 30 },
    { x: T.minX - 30, y: T.maxY + 30 }, { x: T.maxX + 30, y: T.maxY + 30 }
  ]) {
    const x = px(q), y = py(q);
    minX = Math.min(minX, x); maxX = Math.max(maxX, x);
    minY = Math.min(minY, y); maxY = Math.max(maxY, y);
  }
  g.fillStyle = pat;
  g.fillRect(minX, minY, maxX - minX, maxY - minY);

  g.fillStyle = '#9a7848';
  sceneRibbon(g, T, px, py, scV, 3.2);
  g.fillStyle = '#6a4e30';
  sceneBand(g, T, px, py, scV, p => p.r < 70, 3.2, 8);
  g.fillStyle = '#1c7a3c';
  sceneBand(g, T, px, py, scV, p => p.r < 90, 1.05, 2.6);

  if (T.kerbs) {
    const K = T.kerbs, kw = Math.max(1.5, KERB_W * scV);
    for (let i = 0; i < n; i++) {
      const a = pts[i], b = pts[(i + 1) % n];
      for (const [H, s, w] of [[K.P, 1, K.wP], [K.N, -1, K.wN]]) {
        if (!H[i] || !H[(i + 1) % n]) continue;
        const hA = (a.hw != null ? a.hw : T.width / 2) * scV, hB = (b.hw != null ? b.hw : T.width / 2) * scV;
        g.fillStyle = (i % 2) ? '#e8e8ee' : '#d23a3a';
        g.beginPath();
        g.moveTo(px(a) + s * a.nx * hA, py(a) + s * a.ny * hA);
        g.lineTo(px(b) + s * b.nx * hB, py(b) + s * b.ny * hB);
        g.lineTo(px(b) + s * b.nx * (hB + kw * w[(i + 1) % n]), py(b) + s * b.ny * (hB + kw * w[(i + 1) % n]));
        g.lineTo(px(a) + s * a.nx * (hA + kw * w[i]), py(a) + s * a.ny * (hA + kw * w[i]));
        g.closePath(); g.fill();
      }
    }
  }

  for (let i = 0; i < n; i += 3) {
    const a = pts[i];
    if (a.r > 90) continue;
    const apex = -sceneOutside(pts, i);
    const d = ((a.hw != null ? a.hw : T.width / 2) + 0.55) * scV;
    const x = px(a) + apex * a.nx * d, y = py(a) + apex * a.ny * d;
    const len = Math.max(3, 1.3 * scV), th = Math.max(2, 0.45 * scV);
    g.fillStyle = ((i / 3) % 2) ? '#f2f2f4' : '#e23b3b';
    g.fillRect(x - len / 2, y - th / 2, len, th);
  }

  g.fillStyle = '#1e2028';
  sceneRibbon(g, T, px, py, scV, 0);
  g.strokeStyle = '#f3f3f0';
  g.lineWidth = Math.max(1, scV * 0.12);
  g.lineJoin = 'round';
  for (const side of [-1, 1]) {
    g.beginPath();
    for (let i = 0; i <= n; i++) {
      const p = pts[i % n];
      const d = ((p.hw != null ? p.hw : T.width / 2) - 0.4) * scV;
      const x = px(p) + side * p.nx * d, y = py(p) + side * p.ny * d;
      if (i) g.lineTo(x, y); else g.moveTo(x, y);
    }
    g.stroke();
  }
  g.strokeStyle = '#34344a';
  g.lineWidth = 1;
  g.setLineDash([4, 6]);
  g.beginPath();
  g.moveTo(px(pts[0]), py(pts[0]));
  for (let i = 1; i < n; i++) g.lineTo(px(pts[i]), py(pts[i]));
  g.closePath(); g.stroke();
  g.setLineDash([]);

  const side = 1;
  const rail = p => {
    const d = ((p.hw != null ? p.hw : T.width / 2) + 3.7) * scV;
    return [px(p) + side * p.nx * d, py(p) + side * p.ny * d];
  };
  g.lineJoin = 'round'; g.lineCap = 'butt';
  g.strokeStyle = '#b7bcc4';
  g.lineWidth = Math.max(2, scV * 0.16);
  g.beginPath();
  for (let i = 0; i <= n; i++) { const [x, y] = rail(pts[i % n]); if (i) g.lineTo(x, y); else g.moveTo(x, y); }
  g.stroke();
  g.strokeStyle = '#6e747c';
  g.lineWidth = Math.max(1, scV * 0.08);
  for (let s = 0; s < T.length; s += 12) {
    const p = sceneAt(T, s), [x, y] = rail(p);
    g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + Math.max(3, scV * 0.35)); g.stroke();
  }
  g.font = '6px "Press Start 2P"';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  let lastBoard = null;
  for (let s = 100; s < T.length; s += 100) {
    const p = sceneAt(T, s), [x, y] = rail(p);
    if (lastBoard && Math.hypot(x - lastBoard[0], y - lastBoard[1]) < 36) continue;
    lastBoard = [x, y];
    const label = String(Math.round(s));
    const w = Math.max(18, label.length * 7), h = 10;
    g.fillStyle = '#111'; g.fillRect(x - w / 2 + 1, y - h / 2 + 2, w, h);
    g.fillStyle = '#f4f4f0'; g.fillRect(x - w / 2, y - h / 2, w, h);
    g.fillStyle = '#161616'; g.fillText(label, x, y + 1);
  }
  g.textAlign = 'left'; g.textBaseline = 'alphabetic';

  let lastFlag = -1e9;
  for (let i = 1; i < n; i++) {
    const p = pts[i];
    if (p.r > 55) continue;
    const prev = pts[(i - 1 + n) % n], next = pts[(i + 1) % n];
    if (p.r > prev.r || p.r >= next.r) continue;
    if (p.s - lastFlag < 80 && lastFlag > 0) continue;
    lastFlag = p.s;
    const out = sceneOutside(pts, i);
    const d = ((p.hw != null ? p.hw : T.width / 2) + 6.2) * scV;
    const x = px(p) + out * p.nx * d, y = py(p) + out * p.ny * d;
    g.fillStyle = '#141414';
    for (let k = 0; k < 4; k++) g.fillRect(x + (k - 1.5) * Math.max(3, scV * 0.4) - 2, y - 2, 4, 4);
    g.strokeStyle = '#d8dbe0'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(x + 10, y); g.lineTo(x + 10, y - 12); g.stroke();
    g.fillStyle = '#ff8a1e';
    g.beginPath(); g.moveTo(x + 10, y - 12); g.lineTo(x + 20, y - 8); g.lineTo(x + 10, y - 5); g.fill();
  }
}

// Dark tyre tracks where the solved lap is brake-limited. Drawn under the coloured racing line.
function drawBrakeRubber(L, px, py, scV) {
  if (!L || !L.lim || !L.track) return;
  const line = L.track.line, n = line.length;
  if (!line[0] || line[0].nx == null) return;
  ctx.save();
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.strokeStyle = 'rgba(6,6,8,0.55)';
  ctx.lineWidth = Math.max(1.5, scV * 0.28);
  for (const lat of [-0.85, 0.85]) {
    ctx.beginPath();
    let on = false;
    for (let i = 0; i <= n; i++) {
      const p = line[i % n];
      if (L.lim[i % n] !== 'brake') { on = false; continue; }
      const x = px(p) + p.nx * lat * scV, y = py(p) + p.ny * lat * scV;
      if (!on) { ctx.moveTo(x, y); on = true; } else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  ctx.restore();
}
