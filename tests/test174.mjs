// ABS, traction control and stability control as a tune of the stepped car (build 281).
//
// WHY THIS EXISTS. The driver aids were fixed numbers inside stepCar, and there was no stability control. They are now
// a calibration the car carries (car.aids, from vehicle.aids over DRIVE_AIDS). What must hold:
//   · a car with nothing set carries the defaults, as plain data; without traction control it has no ESP;
//   · ABS: a stop from 100 km/h is longer with it off, and longer with the release set far past the tyre's peak slip
//     (3 x) than at the default (1.3 x);
//   · traction control: a powerful rear-driver's wheels spin most with it off, less at twice the peak slip, least at
//     the peak;
//   · ESP, against a spin: FMVSS 126's sine with dwell (0.7 Hz, a 0.5 s dwell, from 80 km/h, at 5 and 6.5 times the
//     steering that gives 0.3 g). The rule: 1 s after the steering ends the yaw rate is under 35% of its peak, 1.75 s
//     after under 20%, and the car has moved 1.83 m sideways 1.07 s in. The Model 3 spins with ESP off and passes
//     with it on; a wider espBeta lets it slide further;
//   · ESP, against a push: full power on a circle, a front-driver's front tyres slip less and it runs less wide with it on;
//   · on a straight launch and a straight stop ESP does nothing;
//   · no page errors.
import { chromium } from './pw.mjs';
import { fileURLToPath, pathToFileURL } from 'url';
import path from 'path';
const repo = fileURLToPath(new URL('..', import.meta.url));
const browser = await chromium.launch();
const page = await browser.newPage();
const errors = [], fails = [];
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
await page.goto(pathToFileURL(path.join(repo, 'index.html')).href, { waitUntil: 'networkidle' });
await page.waitForTimeout(300);

const R = await page.evaluate(() => {
  const out = {};
  const mk = (n, aids) => { loadVehiclePreset(FACTORY_CARS.find(x => x.name.startsWith(n))); vehicle.aids = aids; const c = driveCar(); vehicle.aids = undefined; return c; };
  const roll = (car, vk) => { const v = vk / 3.6, s = driveState(car); s.vx = v; s.w = s.w.map(() => v / car.r);
    for (let g = car.ratios.length; g >= 1; g--) { s.gear = g; if (v / car.r * car.ratios[g - 1] * car.fd * 30 / Math.PI >= 2000) break; }
    s.we = v / car.r * car.ratios[s.gear - 1] * car.fd; return s; };
  // ---- the defaults
  { const c = mk('Mazda MX-5'), d = mk('Honda Civic Type R (FK8');
    out.def = { same: ['absSlip', 'absRel', 'absApp', 'tcSlip', 'tcGain', 'espBand', 'espTau', 'espCut', 'espVmin'].every(k => JSON.stringify(c.aids[k]) === JSON.stringify(DRIVE_AIDS[k])),
      plain: JSON.stringify(JSON.parse(JSON.stringify(c.aids))) === JSON.stringify(c.aids), mx5: [c.tc, c.abs, c.esp], ctr: [d.tc, d.abs, d.esp], beta: c.aids.espBeta * 180 / Math.PI }; }
  // ---- ABS: a stop from 100 km/h
  const stop = car => { const s = roll(car, 100); let e = 0; while (s.vx > 0.3 && s.t < 15) { stepCar(car, s, { steer: 0, throttle: 0, brake: 1 }, 0.005); e = Math.max(e, ...s.esp); } return { m: s.x, esp: e }; };
  out.abs = { def: stop(mk('Ford Mustang GT', { esp: true })), off: stop(mk('Ford Mustang GT', { abs: false })).m, loose: stop(mk('Ford Mustang GT', { absSlip: [3, 3] })).m };
  // ---- traction control: a launch
  const launch = car => { const s = driveLaunch(car); let k = 0, e = 0; while (s.vx < 100 / 3.6 && s.t < 20) { stepCar(car, s, { steer: 0, throttle: 1, brake: 0 }, 0.005); k = Math.max(k, s.kappa[2], s.kappa[3]); e = Math.max(e, ...s.esp); } return { t: s.t, k, esp: e }; };
  out.tc = { off: launch(mk('Ford Mustang GT', { tc: false })), two: launch(mk('Ford Mustang GT', { tcSlip: 2 })), one: launch(mk('Ford Mustang GT', { esp: true })) };
  // ---- ESP against a spin: the sine with dwell
  const swd = (car, mult) => { const s = roll(car, 80), v = 80 / 3.6, L = car.a + car.b, T = 1 / 0.7, t0 = 0.5, end = t0 + T + 0.5;
    const A = Math.min(mult * 0.3 * 9.81 * L * (1 + car.Kus * v * v) / (v * v), car.steerLock * 4.71 / 8.5);   // no more than 270 deg of hand wheel, as the rule has it
    const st = t => t < 0 ? 0 : t < 0.75 * T ? Math.sin(2 * Math.PI * 0.7 * t) : t < 0.75 * T + 0.5 ? -1 : t < T + 0.5 ? Math.sin(2 * Math.PI * 0.7 * (t - 0.5)) : 0;
    const o = { pk: 0, y: 0, r1: 0, r175: 0, beta: 0 };
    while (s.t < end + 2) { const t = s.t - t0; stepCar(car, s, { steer: A * st(t) / car.steerLock, throttle: 0, brake: 0, gear: s.gear }, 0.005);
      if (t > 0.5 * T) o.pk = Math.max(o.pk, Math.abs(s.yaw)); if (Math.abs(t - 1.07) < 0.003) o.y = Math.abs(s.y);
      if (Math.abs(s.t - end - 1) < 0.003) o.r1 = Math.abs(s.yaw); if (Math.abs(s.t - end - 1.75) < 0.003) o.r175 = Math.abs(s.yaw);
      o.beta = Math.max(o.beta, Math.abs(Math.atan2(s.vy, Math.max(1, s.vx))) * 180 / Math.PI); }
    return { y: o.y, r1: o.r1 / o.pk, r175: o.r175 / o.pk, beta: o.beta }; };
  { const off = mk('Tesla Model 3', { esp: false }), on = mk('Tesla Model 3'), wide = mk('Tesla Model 3', { espBeta: 1.5 * on.aids.espBeta });
    out.swd = { off: [5, 6.5].map(m => swd(off, m)), on: [5, 6.5].map(m => swd(on, m)), wide: swd(wide, 6.5), fitted: on.esp }; }
  // ---- ESP against a push: full power on a 30 m circle, second gear (test168's manoeuvre)
  const push = car => { const s = driveState(car), Rc = 30, vt = Math.sqrt(0.6 * car.mu * 9.81 * Rc); car.tc = false;
    const circle = () => { const want = Math.atan((car.a + car.b) / Rc) / car.steerLock, r0 = Math.hypot(s.x, s.y - Rc), v0 = Math.min(vt, 4 + s.t * 2);
      return { steer: Math.max(-1, Math.min(1, want + 0.08 * (r0 - Rc) + 0.6 * (v0 / Rc - s.yaw))), throttle: Math.max(0, Math.min(1, 0.3 + 0.5 * (v0 - s.vx))), brake: 0, gear: s.vx > 6 ? 2 : 1 }; };
    for (let i = 0; i < 1200; i++) stepCar(car, s, circle(), 0.01);
    const st = Math.min(1, circle().steer * 2); let r = 0, e = 0, aF = 0;          // the wheel turned in further, and the pedal flat
    for (let i = 0; i < 300; i++) { stepCar(car, s, { steer: st, throttle: 1, gear: 2 }, 0.01); if (i >= 100) { r += Math.hypot(s.x, s.y - Rc) / 200; aF += Math.abs(s.alpha[0] + s.alpha[1]) / 2 / 200; } e = Math.max(e, s.esp[2], s.esp[3]); }
    return { r, esp: e, aF: aF * 180 / Math.PI, v: s.vx * 3.6 }; };
  out.push = { off: push(mk('Honda Civic Type R (FK8', { esp: false })), on: push(mk('Honda Civic Type R (FK8')) };
  return out;
});
await browser.close();

const f1 = x => x.toFixed(1), f2 = x => x.toFixed(2);
console.log(`defaults: MX-5 tc/abs/esp ${R.def.mx5}, Civic Type R ${R.def.ctr}; the rear may slip ${f1(R.def.beta)} deg`);
if (!R.def.same || !R.def.plain) fails.push('a car with no tune does not carry the defaults as plain data');
if (R.def.mx5.join() !== 'false,true,false' || R.def.ctr.join() !== 'true,true,true') fails.push('what is fitted does not follow the preset');
console.log(`ABS, Mustang GT from 100 km/h: ${f1(R.abs.def.m)} m; off ${f1(R.abs.off)} m; released at 3 x the peak slip ${f1(R.abs.loose)} m`);
if (!(R.abs.off > R.abs.def.m + 1)) fails.push('no ABS does not lengthen the stop');
if (!(R.abs.loose > R.abs.def.m + 0.5 && R.abs.loose < R.abs.off)) fails.push('a loose ABS is not between the default and none');
console.log(`traction control, Mustang GT 0-100: off ${f2(R.tc.off.t)} s, wheel slip to ${f2(R.tc.off.k)}; at 2 x the peak ${f2(R.tc.two.t)} s, ${f2(R.tc.two.k)}; at the peak ${f2(R.tc.one.t)} s, ${f2(R.tc.one.k)}`);
if (!(R.tc.off.k > R.tc.two.k && R.tc.two.k > R.tc.one.k)) fails.push('the traction control\'s slip target does not order the wheelspin');
if (R.abs.def.esp > 0 || R.tc.one.esp > 0) fails.push('ESP braked a wheel in a straight line');
const pass = o => o.r1 <= 0.35 && o.r175 <= 0.20 && o.y >= 1.83;
for (const [k, a] of [['off', R.swd.off], ['on', R.swd.on]]) console.log(`sine with dwell, Model 3, ESP ${k}: ` + a.map((o, i) => `${[5, 6.5][i]} x: yaw ${f2(o.r1)} / ${f2(o.r175)} of its peak after 1 / 1.75 s, ${f2(o.y)} m across, ${o.beta.toFixed(0)} deg sideways`).join('; '));
console.log(`  with 1.5 x the slip allowed: ${R.swd.wide.beta.toFixed(0)} deg sideways`);
if (!R.swd.fitted) fails.push('the Model 3 has no ESP');
if (R.swd.off.some(pass)) fails.push('the Model 3 passes the sine with dwell with ESP off: the manoeuvre shows nothing');
if (!R.swd.on.every(pass)) fails.push('the Model 3 fails FMVSS 126 with ESP on');
if (!(R.swd.wide.beta > R.swd.on[1].beta + 1 && pass(R.swd.wide))) fails.push('a wider espBeta does not let the car slide further and still recover');
console.log(`push, Civic Type R, full power on a 30 m circle: ESP off ${f1(R.push.off.r)} m out, front tyres at ${f1(R.push.off.aF)} deg, ${R.push.off.v.toFixed(0)} km/h; ESP on ${f1(R.push.on.r)} m, ${f1(R.push.on.aF)} deg, ${R.push.on.v.toFixed(0)} km/h (inner rear brake to ${R.push.on.esp.toFixed(0)} Nm)`);
if (!(R.push.on.esp > 0 && R.push.on.aF < R.push.off.aF - 0.5 && R.push.on.r < R.push.off.r && R.push.on.v < R.push.off.v)) fails.push('ESP does not hold a pushing front-driver closer to its line');
for (const e of errors) fails.push(e);
if (fails.length) { console.log('\nFAIL'); for (const f of fails) console.log('  - ' + f); process.exit(1); }
console.log('\nPASS');
