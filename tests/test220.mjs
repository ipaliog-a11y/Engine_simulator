// Bump stops, droop and bound/rebound damping in the stepped car (build 364, plans/small-physics.md step 1).
//
// WHY THIS EXISTS. Each corner's spring was linear without end: a wheel could rise through the body or hang below
// it. What must hold, on a strut-fronted car (M3 E46) and a wishbone-fronted one (MX-5):
//   · a 200 mm step up under the left front reaches the bump rubber but never passes its travel (bump + rubber);
//   · the road falling 300 mm away under it leaves the wheel hanging at full droop (over 20 ms, off the road), never past it;
//   · rebound damping is DAMPER_RB times bound, their mean the kit's damper (the lap's quarter car unchanged).
import { chromium } from './pw.mjs';
import { fileURLToPath, pathToFileURL } from 'url';
import path from 'path';
const repo = fileURLToPath(new URL('..', import.meta.url));
const browser = await chromium.launch();
const page = await browser.newPage();
const errors = [];
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
await page.goto(pathToFileURL(path.join(repo, 'index.html')).href, { waitUntil: 'networkidle' });
const fails = [];
const R = await page.evaluate(() => {
  const out = [];
  for (const n of ['BMW M3 (E46', 'Mazda MX-5']) {
    loadVehiclePreset(FACTORY_CARS.find(x => x.name.startsWith(n)));
    const car = driveCar(), o = { name: n, up: car.bumpF, top: car.bumpF + DRIVE_BUMP_RUBBER, dn: car.droopF, rb: DAMPER_RB };
    const trav = s => s.zu[0] - s.heave - s.pitch * car.a - s.roll * car.tF / 2;   // the left front's, up on the body
    const run = z => { const s = driveRolling(car, 60); let hi = -1, lo = 1, hang = 0;
      for (let t = 0; t < 2; t += 0.001) stepCar(car, s, { steer: 0, throttle: 0.12, brake: 0 }, 0.001);
      for (let t = 0; t < 0.6; t += 0.001) { stepCar(car, s, { steer: 0, throttle: 0.12, brake: 0, road: { z: [z, 0, 0, 0] } }, 0.001);
        const c = trav(s); hi = Math.max(hi, c); lo = Math.min(lo, c);
        // hanging: the tyre off the road, the wheel at full droop (within 1 mm: the body moves after the wheels in a step)
        if (s.Fz[0] === 0 && Math.abs(c + car.droopF) < 1e-3) hang += 0.001; }
      return { hi, lo, hang }; };
    o.bump = run(0.2); o.drop = run(-0.3);
    out.push(o);
  }
  return out;
});
await browser.close();
const mm = x => (x * 1000).toFixed(1);
for (const o of R) {
  console.log(`${o.name.padEnd(14)} 200 mm up: highest ${mm(o.bump.hi)} mm (rubber from ${mm(o.up)}, travel ${mm(o.top)}); ` +
    `300 mm down: lowest ${mm(o.drop.lo)} mm (droop ${mm(o.dn)}), hanging there off the road ${mm(o.drop.hang)} ms`);
  if (!(o.bump.hi > o.up)) fails.push(`${o.name}: the step up never reaches the bump rubber`);
  if (!(o.bump.hi <= o.top + 1e-6)) fails.push(`${o.name}: the wheel passes its bump travel`);
  if (!(o.drop.lo >= -o.dn - 1e-6)) fails.push(`${o.name}: the wheel hangs past full droop`);
  if (!(o.drop.hang > 0.02)) fails.push(`${o.name}: the lifted wheel does not hang at full droop`);
  if (!(o.rb > 1)) fails.push(`${o.name}: rebound is not stiffer than bound`);
}
for (const e of errors) fails.push(e);
if (fails.length) { console.log('\nFAIL:\n  ' + fails.join('\n  ')); process.exit(1); }
console.log('\nPASS');
