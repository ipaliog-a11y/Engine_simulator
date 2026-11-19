// Camber and camber thrust in the stepped car (phase G4).
//
// WHY THIS EXISTS. stepCar's tyres stood upright whatever the body did. Each wheel now leans by its static camber and
// the body's roll less what its linkage recovers, and pushes towards its lean by the brush model's camber thrust (THE
// CAMBER in drive-model.js). The grip by camber is left out, a named gap. What must hold:
//   · steady on a skidpad, the outside front leans by camberF + the body's roll less camRecF of its roll on the springs
//     and of its heave (small-physics step 3),
//     within 2% (build 333: the body's roll less the axle's tilt on its tyres, the load difference over kt t), and by
//     more than the lap's camberF + rollGrad ay/g (1 - camRecF), which has no tyre give;
//   · a cambered tyre at no slip pushes towards its lean by C a/(3R) per radian, within 2%;
//   · pulling away straight from rest, the static camber's thrusts cancel: the car keeps its line within 1 cm and 0.05 deg.
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
      // build 333: the tyres give too. The axle tilts by its load difference over the tyres' rate and the track, the
      // body rolls on top of that, and the linkage recovers its share of the roll on the springs only.
      want: (() => { const tilt = Math.abs(s.Fz[1] - s.Fz[0]) / (car.ktF * car.tF), roll = Math.abs(s.roll);
        // small-physics step 3: the wheel's own heave on the body cambers it by the same curve, the top inwards in bump
        const cm = (s.zu[0] + s.zu[1]) / 2 - s.heave - s.pitch * car.a;
        return vehicle.camberF + (roll - vehicle.camRecF * (roll - tilt) - vehicle.camRecF * 2 * cm / car.tF) * 180 / Math.PI; })(),
      lap: vehicle.camberF + vehicle.rollGrad * Math.abs(s.ay) / 9.81 * (1 - vehicle.camRecF) });
  }
  // camber thrust at no slip
  { const car = driveCar(), Fz = car.FzRefF, ah = drivePatch(car.r, car.ktF, Fz), g = Math.PI / 180;
    const xz = Fz / car.FzRefF, Ca = car.cc * Fz * (car.ccP2 + 1) / (car.ccP2 + xz * xz);
    out.thrust = { got: driveTyre(car, Fz, 0, 0, true, ah / (3 * car.r) * Math.sin(g))[1], want: Ca * ah / (3 * car.r) * Math.sin(g), perDeg: Ca * ah / (3 * car.r) * g / Fz }; }
  // pulling away straight from rest, with race camber
  { const car = Object.assign(driveCar(), { camF: -2.5 * Math.PI / 180, camR: -2.5 * Math.PI / 180 }), s = driveState(car);
    for (let t = 0; t < 8; t += 0.01) stepCar(car, s, { steer: 0, throttle: 0.6, brake: 0 }, 0.01);
    out.straight = { y: s.y, psi: s.psi * 180 / Math.PI, v: s.vx * 3.6 }; }
  return out;
});

const near = (a, b, t) => Math.abs(a / b - 1) <= t;
for (const o of R.cars) {
  console.log(`${o.name.padEnd(24)} outside front camber ${o.cam.toFixed(3)} deg (want ${o.want.toFixed(3)}, the lap's ${o.lap.toFixed(3)})`);
  if (!near(o.cam, o.want, 0.02)) fails.push(`${o.name}: outside front camber off its roll and tilt`);
  if (!(o.cam > o.lap && o.cam < o.lap + 0.6)) fails.push(`${o.name}: outside front camber is not the lap's plus the tyres' give`);
}
const T = R.thrust;
console.log(`camber thrust at 1 deg: ${T.got.toFixed(1)} N (want ${T.want.toFixed(1)}), ${T.perDeg.toFixed(4)} of the load per degree`);
if (!(T.got > 0 && near(T.got, T.want, 0.02))) fails.push('camber thrust not C a/(3R), or not towards the lean');
const S = R.straight;
console.log(`pulling away at -2.5 deg camber: ${S.v.toFixed(0)} km/h after 8 s, ${(S.y * 100).toFixed(2)} cm aside, heading ${S.psi.toFixed(3)} deg`);
if (!(S.v > 30 && Math.abs(S.y) < 0.01 && Math.abs(S.psi) < 0.05)) fails.push('the static camber pushes the car off a straight line');
if (errors.length) console.log('ERRORS:\n  ' + errors.join('\n  '));
if (fails.length) console.log('\nFAIL:\n  ' + fails.join('\n  '));
else console.log('\nOK: the wheels lean as the lap says, push towards their lean, and cancel on a straight.');
await browser.close();
process.exit(fails.length || errors.length ? 1 : 0);
