// Generates the GPX fixture that tests/test35.mjs imports.
//
//   node tests/fixtures/make-track-gpx.mjs
//
// WHY A GENERATED TRACE. test35 used to read an uploaded Nordschleife GPX from an absolute path
// under /root/.claude/uploads/<session-id>/. That directory belongs to one session on one machine,
// so the test could only ever pass where the upload happened — on a fresh clone it threw ENOENT
// before its first assertion. It is exactly the failure mode tests/proto/README.md warns about:
// a thing that only exists on a scratch disk is one machine away from not existing.
//
// What test35 actually exercises is the IMPORTER PIPELINE — parse, project, re-origin, resample to
// even spacing, bridge the closure gap, detect corners, solve a lap, render a report. None of that
// needs the real circuit; it needs a trace with a real circuit's DIMENSIONS and a real GPS trace's
// DEFECTS. So this builds one, and the fixture is reproducible from source rather than being an
// opaque blob nobody can regenerate.
//
// Deliberately NOT the Nordschleife. The dimensions match the published figures test35 checks
// against (20.8 km, ~300 m of elevation) because those are the assertions; the shape does not, and
// the file says so in its own <name>. Nothing here should be read as a survey of a real circuit.
//
// The two properties that make it a useful fixture rather than a smooth synthetic curve:
//
//   UNEVEN SPACING. A real GPS trace logs by time, not distance, so it bunches in slow corners and
//   stretches on fast straights, with occasional dropouts. The source trace measured 2.4 / 27.9 /
//   421.8 m (min/median/max). test35 asserts the importer EQUALISES that, which is only a real test
//   if the input is uneven to begin with — a uniformly sampled fixture would pass it vacuously.
//
//   A CLOSURE GAP. A hand-stopped lap never ends exactly where it started. The importer bridges it,
//   and test35 checks elevation closes to within 1 cm afterwards.
import { writeFileSync } from 'fs';
import { fileURLToPath } from 'url';

const OUT = fileURLToPath(new URL('./circuit-20km.gpx', import.meta.url));
const TARGET_M = 20800;     // published Nordschleife length, which is what test35 asserts
const ELEV_RANGE = 300;     // published ~300 m
const LAT0 = 50.3356, LON0 = 6.9475;   // Eifel region, so the projection works on realistic numbers

// Deterministic PRNG — a fixture that changes every run is not a fixture.
let seed = 0x9e3779b9;
const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;

// ---- plan view: a filleted polygon, not a smooth curve ----------------------------------------
// A harmonic curve was the first attempt and it produced ONE corner over 20.8 km — a 227 km/h
// average, which is a ring road, not a circuit. Radius modulation changes how wide a loop is, not
// how sharply it turns. A real layout is straights joined by arcs, so build that: an irregular
// closed polygon with every vertex rounded to a chosen radius. Closure is automatic because the
// polygon is closed, and the fillet radii are what put genuine corners in.
const NV = 28;
// Corner radii in metres, cycled around the lap: hairpins, medium turns and fast sweepers, the
// mix a real circuit has. Nothing here is copied from a real layout.
// Nothing below ~60 m: the importer resamples to ~22 m control spacing, so a tighter arc is only
// two or three points long and corner detection cannot see it as a corner at all. That is a real
// resolution limit of the pipeline, not something to hide — it just means a fixture built to test
// corner DETECTION has to use corners the pipeline can resolve.
const RADII = [48, 300, 62, 380, 55, 260, 70, 420, 45, 320, 66, 280,
               52, 360, 75, 240, 50, 400, 68, 290, 58, 340, 60, 250,
               72, 310, 44, 270];

const polygon = scale => {
  const v = [];
  for (let i = 0; i < NV; i++) {
    const a = 2 * Math.PI * i / NV;
    const r = scale * (1 + 0.52 * Math.sin(3 * a + 0.5) + 0.31 * Math.cos(7 * a + 1.3)
                         + 0.17 * Math.sin(11 * a + 2.2));
    v.push({ x: r * Math.cos(a), y: r * Math.sin(a) });
  }
  return v;
};

// Round every vertex: the arc of radius R tangent to both legs sits back d = R/tan(phi/2) from the
// corner, where phi is the interior angle. Clamp R so neighbouring fillets cannot overlap.
function fillet(v) {
  const n = v.length, out = [];
  const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y });
  const len = a => Math.hypot(a.x, a.y);
  const unit = a => { const l = len(a) || 1; return { x: a.x / l, y: a.y / l }; };
  for (let i = 0; i < n; i++) {
    const P = v[(i - 1 + n) % n], V = v[i], N = v[(i + 1) % n];
    const u = unit(sub(P, V)), w = unit(sub(N, V));
    const cosPhi = Math.max(-0.999, Math.min(0.999, u.x * w.x + u.y * w.y));
    const phi = Math.acos(cosPhi);
    let R = RADII[i % RADII.length];
    const maxD = Math.min(len(sub(P, V)), len(sub(N, V))) * 0.45;
    R = Math.min(R, maxD * Math.tan(phi / 2));
    const d = R / Math.tan(phi / 2);
    const T1 = { x: V.x + u.x * d, y: V.y + u.y * d };     // tangent point on the incoming leg
    const T2 = { x: V.x + w.x * d, y: V.y + w.y * d };     // and on the outgoing leg
    // Arc centre lies along the interior bisector.
    const bis = unit({ x: u.x + w.x, y: u.y + w.y });
    const C = { x: V.x + bis.x * (R / Math.sin(phi / 2)), y: V.y + bis.y * (R / Math.sin(phi / 2)) };
    out.push({ T1, T2, C, R });
  }
  // Walk the path: straight from the previous fillet's exit to this one's entry, then the arc.
  const path = [];
  const ang = (C, P) => Math.atan2(P.y - C.y, P.x - C.x);
  for (let i = 0; i < n; i++) {
    const prev = out[(i - 1 + n) % n], cur = out[i];
    const A = prev.T2, B = cur.T1;
    const segLen = Math.hypot(B.x - A.x, B.y - A.y);
    const steps = Math.max(2, Math.round(segLen / 12));
    for (let k = 0; k < steps; k++)
      path.push({ x: A.x + (B.x - A.x) * k / steps, y: A.y + (B.y - A.y) * k / steps });
    let a0 = ang(cur.C, cur.T1), a1 = ang(cur.C, cur.T2);
    let da = a1 - a0;
    while (da > Math.PI) da -= 2 * Math.PI;
    while (da < -Math.PI) da += 2 * Math.PI;
    const asteps = Math.max(3, Math.round(Math.abs(da) * cur.R / 6));
    for (let k = 0; k < asteps; k++) {
      const a = a0 + da * k / asteps;
      path.push({ x: cur.C.x + cur.R * Math.cos(a), y: cur.C.y + cur.R * Math.sin(a) });
    }
  }
  return path;
}

const pathLen = p => { let L = 0; for (let i = 0; i < p.length; i++) { const a = p[i], b = p[(i + 1) % p.length]; L += Math.hypot(b.x - a.x, b.y - a.y); } return L; };

// Scale the polygon until the filleted path measures TARGET_M.
let scale = TARGET_M / (2 * Math.PI);
for (let it = 0; it < 60; it++) {
  const L = pathLen(fillet(polygon(scale)));
  scale *= TARGET_M / L;
}
const dense = fillet(polygon(scale));

// Elevation, periodic in the loop parameter so it closes to zero net climb on its own.
const elevUnit = u => Math.sin(2 * Math.PI * u + 0.9) + 0.55 * Math.sin(4 * Math.PI * u + 2.1)
                    + 0.30 * Math.sin(6 * Math.PI * u + 0.3) + 0.15 * Math.sin(10 * Math.PI * u + 1.7);
let eLo = Infinity, eHi = -Infinity;
for (let i = 0; i < 20000; i++) { const e = elevUnit(i / 20000); if (e < eLo) eLo = e; if (e > eHi) eHi = e; }
const eScale = ELEV_RANGE / (eHi - eLo);

// Cumulative distance along the dense path, so we can resample it unevenly below.
const cum = [0];
for (let i = 1; i < dense.length; i++)
  cum.push(cum[i - 1] + Math.hypot(dense[i].x - dense[i - 1].x, dense[i].y - dense[i - 1].y));
const total = cum[cum.length - 1];
const at = s => {                                  // point at arc length s
  let lo = 0, hi = cum.length - 1;
  while (lo < hi - 1) { const m = (lo + hi) >> 1; if (cum[m] <= s) lo = m; else hi = m; }
  const f = (s - cum[lo]) / Math.max(1e-9, cum[hi] - cum[lo]);
  return { x: dense[lo].x + (dense[hi].x - dense[lo].x) * f,
           y: dense[lo].y + (dense[hi].y - dense[lo].y) * f };
};
// Local curvature from three samples 8 m apart, used to bunch the fixes in slow corners.
const curvAt = s => {
  const a = at((s - 8 + total) % total), b = at(s), c = at((s + 8) % total);
  const A = Math.hypot(b.x - a.x, b.y - a.y), B = Math.hypot(c.x - b.x, c.y - b.y);
  const C = Math.hypot(c.x - a.x, c.y - a.y);
  const area = Math.abs((b.x - a.x) * (c.y - a.y) - (c.x - a.x) * (b.y - a.y)) / 2;
  return 4 * area / Math.max(1e-9, A * B * C);
};

// ---- sample unevenly, the way a time-logged GPS trace is uneven -------------------------------
// A real trace logs by time, so it bunches where the car is slow and stretches where it is fast,
// with occasional dropouts. test35 asserts the importer EQUALISES this, which is only a real test
// if the input is uneven to begin with.
const pts = [];
let s = 0;
while (s < total) {
  const p = at(s);
  pts.push({ x: p.x, y: p.y, z: (elevUnit(s / total) - eLo) * eScale });
  const k = curvAt(s);
  let step = 3.5 + 38 / (1 + 450 * k);         // tight -> ~4 m, open -> ~42 m
  // No dropout in the last 450 m: one landing on the wrap makes the closure gap look like a
  // 300 m hole rather than the stopwatch error it is meant to represent.
  if (rnd() < 0.010 && s < total - 450) step *= 8;   // dropout
  s += step;
}
// Closure gap: a hand-stopped lap never ends exactly where it started. Trim by DISTANCE rather
// than by a point count — dropping a fixed number of fixes can land on a dropout and leave a
// several-hundred-metre hole, which is not a stopwatch error, it is a broken trace.
const GAP_M = 30;
while (pts.length > 2 &&
       Math.hypot(pts[pts.length - 1].x - pts[0].x, pts[pts.length - 1].y - pts[0].y) < GAP_M)
  pts.pop();

// ---- project back to lat/lon -------------------------------------------------------------------
const M_PER_DEG_LAT = 111132.0;
const M_PER_DEG_LON = 111320.0 * Math.cos(LAT0 * Math.PI / 180);
const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
const name = 'Synthetic 20.8 km circuit (test fixture — NOT a survey of any real track)';

const body = pts.map(p => {
  const lat = LAT0 + p.y / M_PER_DEG_LAT, lon = LON0 + p.x / M_PER_DEG_LON;
  return `<trkpt lat="${lat.toFixed(7)}" lon="${lon.toFixed(7)}"><ele>${p.z.toFixed(1)}</ele></trkpt>`;
}).join('\n');

writeFileSync(OUT, `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="tests/fixtures/make-track-gpx.mjs">
<trk><name>${esc(name)}</name><trkseg>
${body}
</trkseg></trk>
</gpx>
`);

// Report what was built, so a regeneration that drifts is visible rather than silent.
let L = 0, lo = Infinity, hi = -Infinity;
const gaps = [];
for (let i = 0; i < pts.length; i++) {
  const a = pts[i], b = pts[(i + 1) % pts.length];
  const d = Math.hypot(b.x - a.x, b.y - a.y);
  L += d; if (i < pts.length - 1) gaps.push(d);
  if (a.z < lo) lo = a.z; if (a.z > hi) hi = a.z;
}
gaps.sort((a, b) => a - b);
console.log(`wrote ${OUT}`);
console.log(`  ${pts.length} points · ${(L / 1000).toFixed(2)} km · elevation range ${(hi - lo).toFixed(0)} m`);
console.log(`  spacing min ${gaps[0].toFixed(1)} / median ${gaps[gaps.length >> 1].toFixed(1)} / max ${gaps[gaps.length - 1].toFixed(1)} m`);
console.log(`  closure gap ${Math.hypot(pts[0].x - pts[pts.length - 1].x, pts[0].y - pts[pts.length - 1].y).toFixed(1)} m`);
