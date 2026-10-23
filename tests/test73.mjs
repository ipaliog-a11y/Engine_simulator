// The gearbox through the braking zones (build 139).
//
// WHY THIS EXISTS. Under braking the lap's gear was read off the speed point by point, so it dropped a gear the
// instant the next one stopped over-revving, took no time and gave no engine braking, and the readout merged any
// gear held for under 40 m into the one before: a hard stop showed 4th to 1st in one step. Now the driver works down
// the box in time order. What must hold, on every gearbox and every braking zone of a lap:
//   · one gear at a time (a sequential's drum and a twin-clutch's shafts cannot skip; a driver on the limit with an
//     H-pattern or an automatic goes down one at a time anyway);
//   · consecutive downshifts at least the gearbox's own shift time apart;
//   · the revs after a downshift inside the limiter (the box's over-rev protection);
//   · in gear, the engine brakes the car: the brake pedal is asked for less than the car is slowing by.
// And the live engine's lift-off braking is the engine's own (friction and pumping with the fuel cut), not a fitted
// term on top of it.
import { chromium } from './pw.mjs';
import { fileURLToPath, pathToFileURL } from 'url';
import path from 'path';
const repo = fileURLToPath(new URL('..', import.meta.url));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
const errors = [];
page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
await page.goto(pathToFileURL(path.join(repo, 'index.html')).href, { waitUntil: 'networkidle' });
await page.waitForTimeout(400);
const fails = [];

const r = await page.evaluate(() => {
  const out = [];
  // one factory car per gearbox type, and the H-pattern's on a second circuit
  const seen = {};
  // no factory car has a sequential box, so the GT3 is also run with one fitted
  const gt3 = VEHICLE_PRESETS.find(p => p.name.includes('911 GT3'));
  const runs = VEHICLE_PRESETS.map(vp => ({ vp })).concat([{ vp: gt3, box: 'sequential' }]);
  for (const { vp, box } of runs) {
    loadVehiclePreset(vp);
    if (box) { document.getElementById('vhGearbox').value = box; buildVehicle(); }
    const gb = Object.keys(GEARBOX).find(k => GEARBOX[k] === vehicle.gb) || vehicle.gbLabel;
    if (seen[gb]) continue;
    seen[gb] = true;
    for (const t of gb === 'manual' ? ['tech', 'monza'] : ['tech']) {
      const L = simulateLap(t), R = L.replay, n = L.v.length, rl = engine.redline;
      const res = { car: vp.name, gb, track: t, shiftTime: vehicle.shiftTime, skips: 0, close: 0, overRev: 0, downs: 0,
        decel: 0, pedal: 0, worstGap: 1e9 };
      let lastDown = -1e9;
      for (let i = 1; i < n; i++) {
        const g0 = L.gears[i - 1], g1 = L.gears[i];
        if (g1 < g0) {
          res.downs++;
          if (g0 - g1 > 1) res.skips++;
          const gap = R.tAt[i] - lastDown;
          if (lastDown > -1e8) { res.worstGap = Math.min(res.worstGap, gap); if (gap < vehicle.shiftTime - 1e-6) res.close++; }
          lastDown = R.tAt[i];
          if (R.rpm[i] > rl + 1) res.overRev++;
        }
        // braking: what the car slows by beyond drag, against what the pedal asks the brakes for
        const j = (i + 1) % n, a = (L.v[j] * L.v[j] - L.v[i] * L.v[i]) / (2 * L.track.line[i].ds3);
        if (R.brk[i] > 0.05 && a < -2) { res.decel += -a; res.pedal += R.brk[i] * vehicle.brakeDecelCap; }
      }
      out.push(res);
    }
  }
  // the live engine on a lift: the torque it brakes with is the engine's own
  const vp = VEHICLE_PRESETS.find(p => p.name.includes('Civic Type R')); loadVehiclePreset(vp);
  const own = -brakeTorqueRaw(5000, 0.25, true);
  return { laps: out, liftOwn: own, liftMep: own * engine.strokeDiv / (engine.displacement_L / 1000) / 1e5 };
});

console.log('car                              box         track  downs  skips  < shift time  over-rev  closest  pedal/decel');
for (const x of r.laps) {
  console.log(`${x.car.slice(0, 32).padEnd(32)} ${x.gb.padEnd(11)} ${x.track.padEnd(6)} ${String(x.downs).padStart(5)} ${String(x.skips).padStart(6)} ${String(x.close).padStart(13)} ${String(x.overRev).padStart(9)} ${(x.worstGap === 1e9 ? '-' : x.worstGap.toFixed(2) + 's').padStart(8)} ${(x.pedal / Math.max(1e-9, x.decel)).toFixed(2).padStart(12)}`);
  if (x.downs < 3) fails.push(`${x.car} (${x.gb}) on ${x.track}: only ${x.downs} downshifts in a lap`);
  if (x.skips) fails.push(`${x.car} (${x.gb}) on ${x.track}: ${x.skips} downshifts skip a gear`);
  if (x.close) fails.push(`${x.car} (${x.gb}) on ${x.track}: ${x.close} downshifts closer than the ${x.shiftTime}s shift time`);
  if (x.overRev) fails.push(`${x.car} (${x.gb}) on ${x.track}: ${x.overRev} downshifts land over the limiter`);
  // the pedal asks for less than the car slows by: the engine is doing some of it
  if (!(x.pedal < 0.99 * x.decel)) fails.push(`${x.car} (${x.gb}) on ${x.track}: no engine braking (pedal ${x.pedal.toFixed(0)} vs decel ${x.decel.toFixed(0)})`);
}
const boxes = new Set(r.laps.map(x => x.gb));
for (const gb of ['manual', 'sequential', 'dct', 'auto']) if (!boxes.has(gb)) fails.push(`no factory car with a ${gb} gearbox was checked`);
// A motored engine at 5000 rpm on a closed throttle: friction plus pumping, ~1.5-3.5 bar (Heywood's motored FMEP
// with closed-throttle pumping on top). The fitted term it replaces made ~14 bar on this 2.0 turbo.
console.log(`\nlive lift-off at 5000 rpm, Civic Type R: ${r.liftOwn.toFixed(0)} Nm = ${r.liftMep.toFixed(2)} bar`);
if (!(r.liftMep > 1.0 && r.liftMep < 4.0)) fails.push(`closed-throttle braking ${r.liftMep.toFixed(2)} bar is not a motored engine's`);

if (errors.length) fails.push(...errors);
await browser.close();
if (fails.length) { console.log('\nFAIL:\n  ' + fails.join('\n  ')); process.exit(1); }
console.log('\nPASS');
