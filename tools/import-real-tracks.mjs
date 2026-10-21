#!/usr/bin/env node
// Build tracks/real-circuits.js from open data. Run offline by a maintainer, never by the app.
//
//   node tools/import-real-tracks.mjs            fetch (cached in tools/.cache/), fit, write, print QA
//   node tools/import-real-tracks.mjs --only spa only the named circuit(s), comma separated
//
// THREE SOURCES, BECAUSE NONE HAS EVERYTHING.
//   1. TUMFTM/racetrack-database (LGPL-3.0): centreline every 5 m and the MEASURED width to each side,
//      in a local metre frame with no geographic reference and no height.
//   2. bacinger/f1-circuits (MIT) GeoJSON, or OpenStreetMap raceway ways (ODbL) where bacinger has no
//      file: the same circuit in latitude/longitude, but sparse (Spa: 153 points, gaps up to 377 m).
//   3. A terrain model through OpenTopoData: EU-DEM 25 m in Europe, USGS NED 10 m in the USA, SRTM 30 m
//      elsewhere. Height at any latitude/longitude.
// The TUM centreline is laid onto the geographic one by a rigid fit (rotation + translation, no scale:
// both are metres), which georeferences it; the terrain model then gives each point its height.
//
// A terrain model is the ground plus a few metres of noise (and, in a city, roofs). Vertical curvature
// is the second derivative of that height, so unsmoothed noise would invent crests the road does not
// have. A 5-point median takes out single spikes, then a Gaussian over ~60 m keeps the hills.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const CACHE = path.join(ROOT, 'tools', '.cache');
const OUT = path.join(ROOT, 'tracks', 'real-circuits.js');
const TUM = 'https://raw.githubusercontent.com/TUMFTM/racetrack-database/master/tracks/';
const BAC = 'https://raw.githubusercontent.com/bacinger/f1-circuits/master/circuits/';
const STEP = 20;          // control-point spacing, metres (the app's spline resamples to 5 m)
const MAX_RMS = 15;       // a fit worse than this means the two sources disagree about the layout

// key: app key; tum: TUM file; geo: bacinger id, or an OSM bbox [w,s,e,n]; dem: OpenTopoData dataset.
const CIRCUITS = [
  { key: 'cota',   tum: 'Austin',       geo: 'us-2012', dem: 'ned10m',   label: 'COTA',             place: 'Austin, Texas' },
  { key: 'brands', tum: 'BrandsHatch',  geo: [0.245, 51.348, 0.280, 51.366], dem: 'eudem25m', label: 'BRANDS HATCH', place: 'Kent, England' },
  { key: 'hungaro',tum: 'Budapest',     geo: 'hu-1986', dem: 'eudem25m', label: 'HUNGARORING',      place: 'Mogyoród, Hungary' },
  { key: 'catalunya',tum:'Catalunya',   geo: 'es-1991', dem: 'eudem25m', label: 'CATALUNYA',        place: 'Montmeló, Spain' },
  { key: 'hockenheim',tum:'Hockenheim', geo: 'de-1932', dem: 'eudem25m', label: 'HOCKENHEIM',       place: 'Hockenheim, Germany' },
  { key: 'indy',   tum: 'IMS',          geo: [-86.242, 39.786, -86.226, 39.804], dem: 'ned10m', label: 'INDIANAPOLIS OVAL', place: 'Speedway, Indiana (the 2.5-mile oval)' },
  { key: 'melbourne',tum:'Melbourne',   geo: 'au-1953', dem: 'srtm30m',  label: 'ALBERT PARK',      place: 'Melbourne, Australia' },
  { key: 'mexico', tum: 'MexicoCity',   geo: 'mx-1962', dem: 'srtm30m',  label: 'HERMANOS RODRIGUEZ', place: 'Mexico City, Mexico' },
  { key: 'montreal',tum:'Montreal',     geo: 'ca-1978', dem: 'srtm30m',  label: 'GILLES VILLENEUVE',place: 'Montreal, Canada' },
  { key: 'monza',  tum: 'Monza',        geo: 'it-1922', dem: 'eudem25m', label: 'MONZA',            place: 'Monza, Italy' },
  { key: 'nurgp',  tum: 'Nuerburgring', geo: 'de-1927', dem: 'eudem25m', label: 'NURBURGRING GP',   place: 'Nürburg, Germany' },
  { key: 'sakhir', tum: 'Sakhir',       geo: 'bh-2002', dem: 'srtm30m',  label: 'BAHRAIN',          place: 'Sakhir, Bahrain' },
  { key: 'interlagos',tum:'SaoPaulo',   geo: 'br-1940', dem: 'srtm30m',  label: 'INTERLAGOS',       place: 'São Paulo, Brazil' },
  { key: 'sepang', tum: 'Sepang',       geo: 'my-1999', dem: 'srtm30m',  label: 'SEPANG',           place: 'Sepang, Malaysia' },
  { key: 'shanghai',tum:'Shanghai',     geo: 'cn-2004', dem: 'srtm30m',  label: 'SHANGHAI',         place: 'Shanghai, China' },
  { key: 'silverstone',tum:'Silverstone',geo:'gb-1948', dem: 'eudem25m', label: 'SILVERSTONE',      place: 'Northamptonshire, England' },
  { key: 'sochi',  tum: 'Sochi',        geo: 'ru-2014', dem: 'srtm30m',  label: 'SOCHI',            place: 'Sochi, Russia' },
  { key: 'spa',    tum: 'Spa',          geo: 'be-1925', dem: 'eudem25m', label: 'SPA-FRANCORCHAMPS',place: 'Stavelot, Belgium' },
  { key: 'spielberg',tum:'Spielberg',   geo: 'at-1969', dem: 'eudem25m', label: 'RED BULL RING',    place: 'Spielberg, Austria' },
  { key: 'suzuka', tum: 'Suzuka',       geo: 'jp-1962', dem: 'srtm30m',  label: 'SUZUKA',           place: 'Suzuka, Japan' },
  { key: 'yasmarina',tum:'YasMarina',   geo: 'ae-2009', dem: 'srtm30m',  label: 'YAS MARINA',       place: 'Abu Dhabi, UAE' },
  { key: 'zandvoort',tum:'Zandvoort',   geo: 'nl-1948', dem: 'eudem25m', label: 'ZANDVOORT',        place: 'Zandvoort, Netherlands' },
];

const sleep = ms => new Promise(r => setTimeout(r, ms));
// curl rather than fetch: it honours the environment's proxy and CA settings without configuration.
async function cached(name, url, args = []) {
  mkdirSync(CACHE, { recursive: true });
  const f = path.join(CACHE, name);
  if (existsSync(f)) return readFileSync(f, 'utf8');
  for (let a = 0; ; a++) {
    try { execFileSync('curl', ['-sSL', '--fail', '--max-time', '120', ...args, '-o', f, url]); return readFileSync(f, 'utf8'); }
    catch (e) { if (a >= 3) throw new Error('download failed: ' + url); await sleep(2000 * 2 ** a); }
  }
}

// ---- sources ----
function readTum(text) {
  return text.split('\n').filter(l => l.trim() && !l.startsWith('#'))
    .map(l => l.split(',').map(Number)).map(([x, y, wr, wl]) => ({ x, y, w: wr + wl }));
}
// Reference geometry as a list of polylines in [lon, lat].
async function geoLines(c) {
  if (typeof c.geo === 'string') {
    const g = JSON.parse(await cached(c.geo + '.geojson', BAC + c.geo + '.geojson'));
    return g.features.map(f => f.geometry).flatMap(g => g.type === 'LineString' ? [g.coordinates] : g.coordinates);
  }
  // OpenStreetMap: every way tagged highway=raceway in the box. Extra ways (an alternative loop, a
  // kart track) do no harm: the fit pulls the TUM line onto the NEAREST reference point.
  const xml = await cached(c.key + '.osm', 'https://api.openstreetmap.org/api/0.6/map?bbox=' + c.geo.join(','));
  const nodes = new Map();
  for (const m of xml.matchAll(/<node id="(\d+)"[^>]*?lat="([-\d.]+)" lon="([-\d.]+)"/g)) nodes.set(m[1], [+m[3], +m[2]]);
  const lines = [];
  for (const m of xml.matchAll(/<way id="\d+"[^>]*>([\s\S]*?)<\/way>/g)) {
    if (!/<tag k="highway" v="raceway"\/>/.test(m[1])) continue;
    lines.push([...m[1].matchAll(/<nd ref="(\d+)"\/>/g)].map(n => nodes.get(n[1])).filter(Boolean));
  }
  return lines;
}

// ---- geometry ----
function resampleClosed(pts, step) {
  const n = pts.length, cum = [0];
  for (let i = 0; i < n; i++) { const a = pts[i], b = pts[(i + 1) % n]; cum.push(cum[i] + Math.hypot(b.x - a.x, b.y - a.y)); }
  const total = cum[n], N = Math.round(total / step), out = [];
  let k = 0;
  for (let j = 0; j < N; j++) {
    const want = j * total / N;
    while (cum[k + 1] < want) k++;
    const a = pts[k], b = pts[(k + 1) % n], t = (want - cum[k]) / Math.max(1e-9, cum[k + 1] - cum[k]);
    out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, w: a.w + (b.w - a.w) * t });
  }
  return { out, total };
}
// Densify reference polylines to ~2 m so nearest-point is close to nearest-on-line, and bucket them
// in a 25 m grid so the fit's nearest-neighbour search is cheap.
function refCloud(lines, proj) {
  const P = [];
  for (const L of lines) for (let i = 0; i + 1 < L.length; i++) {
    const a = proj(L[i]), b = proj(L[i + 1]), d = Math.hypot(b[0] - a[0], b[1] - a[1]), k = Math.max(1, Math.ceil(d / 2));
    for (let j = 0; j < k; j++) P.push([a[0] + (b[0] - a[0]) * j / k, a[1] + (b[1] - a[1]) * j / k]);
  }
  const G = 25, grid = new Map(), key = (i, j) => i + ',' + j;
  for (const p of P) { const k = key(Math.floor(p[0] / G), Math.floor(p[1] / G)); (grid.get(k) || grid.set(k, []).get(k)).push(p); }
  const nearest = (x, y) => {
    const gi = Math.floor(x / G), gj = Math.floor(y / G);
    let best = null, bd = Infinity;
    for (let r = 0; r < 40 && (best === null || (r - 1) * G < Math.sqrt(bd)); r++)
      for (let i = gi - r; i <= gi + r; i++) for (let j = gj - r; j <= gj + r; j++) {
        if (Math.max(Math.abs(i - gi), Math.abs(j - gj)) !== r) continue;
        for (const p of grid.get(key(i, j)) || []) { const d = (p[0] - x) ** 2 + (p[1] - y) ** 2; if (d < bd) { bd = d; best = p; } }
      }
    return [best, Math.sqrt(bd)];
  };
  const cx = P.reduce((s, p) => s + p[0], 0) / P.length, cy = P.reduce((s, p) => s + p[1], 0) / P.length;
  return { nearest, cx, cy };
}
// Rigid fit of TUM points onto the reference: coarse sweep over rotation and handedness, then ICP
// (Kabsch in 2-D) on the closest pairs, trimming the worst 10 % so a section where the two sources
// disagree cannot drag the rest.
function fit(src, ref, shift) {
  const mx = src.reduce((s, p) => s + p.x, 0) / src.length, my = src.reduce((s, p) => s + p.y, 0) / src.length;
  const S = src.map(p => [p.x - mx, p.y - my]);
  const apply = (T, p) => [T.c * p[0] * T.m - T.s * p[1] + T.tx, T.s * p[0] * T.m + T.c * p[1] + T.ty];
  const score = T => { let s = 0; for (const p of S) { const q = apply(T, p); s += ref.nearest(q[0], q[1])[1] ** 2; } return Math.sqrt(s / S.length); };
  // The reference centroid is only a first guess at where the circuit sits: OSM can carry other
  // raceways (a kart track, the Indy loop) that pull it off. So the sweep also shifts the start
  // across ±shift m (only when the fit from the centroid alone fails), scoring on every 8th point.
  const S8 = S.filter((_, i) => i % 8 === 0);
  const coarse = T => { let s = 0; for (const p of S8) { const q = apply(T, p); s += Math.min(ref.nearest(q[0], q[1])[1], 100) ** 2; } return s; };
  let best = null;
  for (const m of [1, -1]) for (let deg = 0; deg < 360; deg += 4) for (let dx = -shift; dx <= shift; dx += 50) for (let dy = -shift; dy <= shift; dy += 50) {
    const a = deg * Math.PI / 180, T = { m, c: Math.cos(a), s: Math.sin(a), tx: ref.cx + dx, ty: ref.cy + dy };
    const r = coarse(T); if (!best || r < best.r) best = { T, r };
  }
  let T = best.T;
  for (let it = 0; it < 60; it++) {
    const pairs = S.map(p => { const q = apply(T, p), [n, d] = ref.nearest(q[0], q[1]); return { p: [p[0] * T.m, p[1]], n, d }; })
      .sort((a, b) => a.d - b.d).slice(0, Math.floor(S.length * 0.9));
    const N = pairs.length;
    const pa = pairs.reduce((s, q) => [s[0] + q.p[0] / N, s[1] + q.p[1] / N], [0, 0]);
    const na = pairs.reduce((s, q) => [s[0] + q.n[0] / N, s[1] + q.n[1] / N], [0, 0]);
    let sxx = 0, sxy = 0;
    for (const q of pairs) {
      const ax = q.p[0] - pa[0], ay = q.p[1] - pa[1], bx = q.n[0] - na[0], by = q.n[1] - na[1];
      sxx += ax * bx + ay * by; sxy += ax * by - ay * bx;
    }
    const a = Math.atan2(sxy, sxx), c = Math.cos(a), s = Math.sin(a);
    T = { m: T.m, c, s, tx: na[0] - (c * pa[0] - s * pa[1]), ty: na[1] - (s * pa[0] + c * pa[1]) };
  }
  return { map: p => apply(T, [p.x - mx, p.y - my]), rms: score(T), mirrored: T.m < 0 };
}

// ---- elevation ----
async function elevations(c, ll) {
  const z = [];
  for (let i = 0; i < ll.length; i += 100) {
    const chunk = ll.slice(i, i + 100), locs = chunk.map(([lon, lat]) => lat.toFixed(6) + ',' + lon.toFixed(6)).join('|');
    const name = `${c.key}-${c.dem}-${i}.json`, hit = existsSync(path.join(CACHE, name));
    const r = JSON.parse(await cached(name, `https://api.opentopodata.org/v1/${c.dem}`, ['-G', '--data-urlencode', 'locations=' + locs]));
    if (r.status !== 'OK') throw new Error(c.key + ': elevation ' + JSON.stringify(r).slice(0, 200));
    z.push(...r.results.map(q => q.elevation));
    if (!hit) await sleep(1100);   // the public API allows one request a second
  }
  return z;
}
function smoothZ(z, step) {
  const n = z.length, med = z.map((_, i) => { const w = []; for (let k = -2; k <= 2; k++) w.push(z[(i + k + n) % n]); return w.sort((a, b) => a - b)[2]; });
  const sig = 60 / step, R = Math.ceil(3 * sig), wts = [];
  for (let k = -R; k <= R; k++) wts.push(Math.exp(-k * k / (2 * sig * sig)));
  const W = wts.reduce((a, b) => a + b, 0);
  return med.map((_, i) => { let s = 0; for (let k = -R; k <= R; k++) s += med[(i + k + n) % n] * wts[k + R]; return s / W; });
}

// ---- main ----
const only = (process.argv.find(a => a.startsWith('--only=')) || '').slice(7) || (process.argv.includes('--only') ? process.argv[process.argv.indexOf('--only') + 1] : '');
const want = only ? CIRCUITS.filter(c => only.split(',').includes(c.key)) : CIRCUITS;
const prev = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8').match(/=\s*(\{[\s\S]*\});\s*$/)[1]) : {};
const result = only ? prev : {};
const qa = [];
for (const c of want) {
  const tum = readTum(await cached(c.tum + '.csv', TUM + c.tum + '.csv'));
  const lines = await geoLines(c);
  const all = lines.flat(), lat0 = all.reduce((s, p) => s + p[1], 0) / all.length, lon0 = all.reduce((s, p) => s + p[0], 0) / all.length;
  const R = 6371000, rad = Math.PI / 180, kx = rad * R * Math.cos(lat0 * rad), ky = rad * R;
  const ref = refCloud(lines, ([lon, lat]) => [(lon - lon0) * kx, (lat - lat0) * ky]);
  const sub = tum.filter((_, i) => i % 3 === 0);
  let F = fit(sub, ref, 0);
  if (F.rms > MAX_RMS) F = fit(sub, ref, 300);
  if (F.rms > MAX_RMS) throw new Error(`${c.key}: TUM and reference disagree (fit RMS ${F.rms.toFixed(1)} m)`);
  const { out, total } = resampleClosed(tum, STEP);
  const en = out.map(p => F.map(p));
  const ll = en.map(([e, n]) => [lon0 + e / kx, lat0 + n / ky]);
  const zr = await elevations(c, ll);
  if (zr.some(v => v == null)) throw new Error(c.key + ': terrain model has gaps on this circuit');
  const z = smoothZ(zr, total / out.length);
  // App frame: x east, y DOWN the screen (south), as gpxToTrack does; re-origined to positive values.
  const minE = Math.min(...en.map(p => p[0])), maxN = Math.max(...en.map(p => p[1])), zMin = Math.min(...z);
  const wMean = out.reduce((s, p) => s + p.w, 0) / out.length;
  result[c.key] = {
    label: c.label, width: +wMean.toFixed(2), wprof: out.map(p => +(p.w / wMean).toFixed(3)),
    // Not `gps`: the app's GPS denoiser exists for raw receiver traces. TUM's centreline is already
    // smoothed, and denoising it again shaved 1.3 % off every lap by straightening real bends.
    real: true, names: [],
    blurb: `${c.place}. Centreline and measured track width from the TUM racetrack database, laid onto ${typeof c.geo === 'string' ? 'the f1-circuits' : 'OpenStreetMap'} geometry (fit ${F.rms.toFixed(1)} m RMS); elevation from the ${c.dem === 'eudem25m' ? 'EU-DEM 25 m' : c.dem === 'ned10m' ? 'USGS 10 m' : 'SRTM 30 m'} terrain model, smoothed. Corners are numbered, not named. The layout is the one in the source data and may predate recent changes.`,
    src: { tum: c.tum, geo: c.geo, dem: c.dem, fitRms: +F.rms.toFixed(2), lat: +lat0.toFixed(5), lon: +lon0.toFixed(5) },
    pts: en.map(([e, n], i) => ({ x: +(e - minE).toFixed(1), y: +(maxN - n).toFixed(1), z: +(z[i] - zMin).toFixed(1) })),
  };
  const ws = out.map(p => p.w);
  qa.push({ key: c.key, length_m: Math.round(total), pts: out.length, fitRms_m: +F.rms.toFixed(1), mirrored: F.mirrored,
    width_m: `${Math.min(...ws).toFixed(1)}-${Math.max(...ws).toFixed(1)}`, elevRange_m: +(Math.max(...z) - zMin).toFixed(1), rawRange_m: +(Math.max(...zr) - Math.min(...zr)).toFixed(1) });
  console.error('done', c.key);
}
console.table(qa);
mkdirSync(path.dirname(OUT), { recursive: true });
writeFileSync(OUT, `// Real circuits for Pixel Engine Sim. GENERATED by tools/import-real-tracks.mjs — do not edit by hand.
//
// Track data is derived from, and carries the licences of, its sources:
//  - Centrelines and track widths: TUMFTM racetrack-database, Technical University of Munich,
//    https://github.com/TUMFTM/racetrack-database — GNU LGPL-3.0. This file is kept separate from the
//    MIT-licensed app so it can be replaced or regenerated on its own.
//  - Georeferencing: bacinger/f1-circuits, https://github.com/bacinger/f1-circuits — MIT; and
//    © OpenStreetMap contributors, https://www.openstreetmap.org/copyright — ODbL (Brands Hatch).
//  - Elevation via OpenTopoData (https://www.opentopodata.org): EU-DEM v1.1 (© European Union,
//    Copernicus Land Monitoring Service), USGS 3DEP/NED (public domain), NASA SRTM (public domain).
window.REAL_TRACKS = ${JSON.stringify(result)};
`);
console.error('wrote', path.relative(ROOT, OUT), (readFileSync(OUT).length / 1024).toFixed(0) + ' KB');
