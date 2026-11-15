// Camber and camber thrust in the stepped car (phase G4).
//
// WHY THIS EXISTS. stepCar's tyres stood upright whatever the body did. Each wheel now leans by its static camber and
// the body's roll less what its linkage recovers, and the tyre grips by that lean as the lap has it, with camber thrust
// from the brush model (DRIVE_CAMBER). What must hold:
//   · steady on a skidpad, the outside front leans as the lap says: camberF + rollGrad ay/g (1 - camRecF), within 2%;
//   · a cambered tyre at no slip pushes towards its lean by C a/(3R) per radian, within 2%;
//   · on a front-limited car, more negative static camber at the front raises the front axle's side force at the limit.
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
  const out = { cars: [] };
  for (const n of ['BMW M3 (E46', 'Honda Civic Type R (FK8', 'Mazda MX-5']) {
    loadVehiclePreset(FACTORY_CARS.find(x => x.name.startsWith(n)));
    const car = driveCar(), s = driveRolling(car, 80);
    for (let t = 0; t < 5; t += 0.01) stepCar(car, s, { steer: 0.08, throttle: 0.35, brake: 0 }, 0.01);
    const o = s.ay > 0 ? 1 : 0;   // the outside front: the right one in a left turn
    out.cars.push({ name: n, cam: (o ? -1 : 1) * s.camber[o] * 180 / Math.PI,
      want: vehicle.camberF + vehicle.rollGrad * Math.abs(s.ay) / 9.81 * (1 - vehicle.camRecF) });
  }
  // camber thrust at no slip
  { const car = driveCar(), Fz = car.FzRefF, ah = drivePatch(car.r, car.ktF, Fz), g = Math.PI / 180;
    const xz = Fz / car.FzRefF, Ca = car.cc * Fz * (car.ccP2 + 1) / (car.ccP2 + xz * xz);
    out.thrust = { got: driveTyre(car, Fz, 0, 0, true, g, ah / (3 * car.r) * Math.sin(g))[1], want: Ca * ah / (3 * car.r) * Math.sin(g), perDeg: Ca * ah / (3 * car.r) * g / Fz }; }
  // the front axle's side force at the limit, a slow ramp of the wheel at 80 km/h, as built and with race camber
  loadVehiclePreset(FACTORY_CARS.find(x => x.name.startsWith('Honda Civic Type R (FK8')));
  const ramp = c => { const q = driveRolling(c, 80); let m = 0;
    for (let t = 0; t < 6; t += 0.002) { stepCar(c, q, { steer: Math.min(0.5, t * 0.05), throttle: 0.3, brake: 0 }, 0.002); m = Math.max(m, Math.abs(q.Fy[0] + q.Fy[1])); }
    return m; };
  const car = driveCar();
  out.grip = { camF: car.camF * 180 / Math.PI, built: ramp(car), race: ramp(Object.assign({}, car, { camF: -2.5 * Math.PI / 180 })) };
  return out;
});

const near = (a, b, t) => Math.abs(a / b - 1) <= t;
for (const o of R.cars) {
  console.log(`${o.name.padEnd(24)} outside front camber ${o.cam.toFixed(3)} deg (lap ${o.want.toFixed(3)})`);
  if (!near(o.cam, o.want, 0.02)) fails.push(`${o.name}: outside front camber off the lap's`);
}
const T = R.thrust;
console.log(`camber thrust at 1 deg: ${T.got.toFixed(1)} N (want ${T.want.toFixed(1)}), ${T.perDeg.toFixed(4)} of the load per degree`);
if (!(T.got > 0 && near(T.got, T.want, 0.02))) fails.push('camber thrust not C a/(3R), or not towards the lean');
const G = R.grip;
console.log(`Civic FK8 front axle at the limit: ${G.built.toFixed(0)} N at ${G.camF.toFixed(1)} deg, ${G.race.toFixed(0)} N at -2.5 deg`);
if (!(G.race > G.built)) fails.push('more negative front camber does not raise the front grip');
if (errors.length) console.log('ERRORS:\n  ' + errors.join('\n  '));
if (fails.length) console.log('\nFAIL:\n  ' + fails.join('\n  '));
else console.log('\nOK: the wheels lean as the lap says, push towards their lean, and more front camber grips harder.');
await browser.close();
process.exit(fails.length || errors.length ? 1 : 0);
