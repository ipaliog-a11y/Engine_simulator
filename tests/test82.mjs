// The driver's foot (build 152). The lap's throttle used to be read straight off the speed solve, point by point:
// 1-0-1 inside one 5 m step, 75-115 times a Spa lap, from the line's flickering radius in corners and a lift on
// every upshift whatever the gearbox. A driver holds a corner steady, stays flat through a spark-cut shift (DCT,
// sequential, automatic: the turbo stays spun up), lifts for an H-pattern shift, and moves the pedal no faster than
// a foot: fully off in 0.10 s, fully on in 0.25 s. The speeds are the solve's; this pins the pedal and the boost.
import { chromium } from './pw.mjs';
import { fileURLToPath, pathToFileURL } from 'url';
import path from 'path';
const repo = fileURLToPath(new URL('..', import.meta.url));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors = [];
page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
await page.goto(pathToFileURL(path.join(repo, 'index.html')).href, { waitUntil: 'networkidle' });
await page.waitForTimeout(600);
const fails = [];

const rows = await page.evaluate(() => {
  const out = [];
  for (const n of ['GR Yaris', 'McLaren 720S', 'M3 (E46', '911 Turbo S (992']) for (const trk of ['tech', 'mixed', 'spa']) {
    loadVehiclePreset(VEHICLE_PRESETS.find(x => x.name.includes(n)));
    const L = simulateLap(trk), R = L.replay, thr = R.thr, brk = R.brk, line = L.track.line, N = thr.length, v = L.v;
    const dtAt = i => line[i].ds3 / Math.max(2, (v[i] + v[(i + 1) % N]) / 2);
    let up = 0, down = 0, pumps = 0, shifts = 0, shiftLifts = 0, shiftDips = 0, boostKept = 1;
    for (let i = 0; i < N; i++) {
      const h = (i - 1 + N) % N, d = thr[i] - thr[h], dt = dtAt(h);
      up = Math.max(up, d / dt); down = Math.max(down, -d / dt);
      // a stab: flat, below 40%, flat again inside 0.4 s, with no braking and no H-pattern shift (a lift and a touch of
      // the brakes for a fast kink is real, and so is that lift)
      if (thr[i] > 0.9) { let t = 0, k = i + 1, mn = 1, br = false;
        while (t < 0.4) { const q = k % N; t += dtAt(q); mn = Math.min(mn, thr[q]); if (brk[q] > 0 || R.cut[q]) br = true; if (thr[q] > 0.9 && mn < 0.4) break; k++; }
        if (!br && mn < 0.4 && thr[k % N] > 0.9) pumps++; }
      // each shift: the pedal through it, and the boost (manifold pressure) against just before it
      if (R.cut[i] && !R.cut[h] && brk[i] < 0.02 && thr[h] > 0.9) { shifts++;
        let k = i, mn = 1, mapMin = 9; while (R.cut[k % N]) { mn = Math.min(mn, thr[k % N]); mapMin = Math.min(mapMin, R.map[k % N]); k++; }
        if (mn < 0.5) shiftLifts++; if (mn < thr[h] - 1e-9) shiftDips++;
        boostKept = Math.min(boostKept, mapMin / Math.max(1e-9, R.map[h])); }
    }
    out.push({ car: n, trk, gb: vehicle.gearbox, turbo: engine.intake === 'turbo', lap: L.lap, up, down, pumps, shifts, shiftLifts, shiftDips, boostKept });
  }
  return out;
});

console.log('== the pedal on a hot lap ==');
for (const r of rows) console.log(`  ${r.car.padEnd(17)} ${r.trk.padEnd(5)} ${r.gb.padEnd(6)} lap ${r.lap.toFixed(2)} s  fastest on ${r.up.toFixed(1)}/s, off ${r.down.toFixed(1)}/s  stabs ${r.pumps}  shifts from flat ${r.shifts}: lifted ${r.shiftLifts}, dipped ${r.shiftDips}` + (r.turbo && r.gb !== 'manual' ? `, boost kept ${(r.boostKept * 100).toFixed(0)}%` : ''));
for (const r of rows) {
  const k = `${r.car} @ ${r.trk}`;
  if (r.up > 1 / 0.25 + 0.05) fails.push(`${k}: the pedal goes on at ${r.up.toFixed(1)}/s, faster than a foot (fully on in 0.25 s)`);
  if (r.down > 1 / 0.10 + 0.05) fails.push(`${k}: the pedal comes off at ${r.down.toFixed(1)}/s, faster than a foot (fully off in 0.10 s)`);
  if (r.pumps > 1) fails.push(`${k}: ${r.pumps} full-off-full stabs inside 0.4 s with no braking`);
  if (!(r.shifts > 0)) fails.push(`${k}: no upshifts from full throttle to look at`);
  if (r.gb === 'manual' && r.shiftLifts !== r.shifts) fails.push(`${k}: ${r.shifts - r.shiftLifts} H-pattern upshifts without a lift`);
  if (r.gb !== 'manual' && r.shiftDips > 0) fails.push(`${k}: the pedal comes up in ${r.shiftDips} spark-cut shifts`);
  if (r.turbo && r.gb !== 'manual' && !(r.boostKept > 0.9)) fails.push(`${k}: a flat shift loses ${((1 - r.boostKept) * 100).toFixed(0)}% of the boost`);
}

console.log('\nERRORS:', errors.length ? errors : 'none');
console.log(fails.length ? 'FAIL:\n  ' + fails.join('\n  ') : '\nPASS');
await browser.close();
process.exit(fails.length || errors.length ? 1 : 0);
