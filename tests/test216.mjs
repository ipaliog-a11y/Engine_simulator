// Premium touring tyres (build 354).
//
// WHY THIS EXISTS. Eco tyres are for slow, light, non-performance cars. The Teslas and the Qashqai e-POWER leave the
// factory on premium touring tyres built for low rolling resistance: street's grip, eco's rolling resistance.
// What must hold:
//   · TIRE_TYPE.premium has street's mu and eco's crr;
//   · the Model 3, Model Y and Qashqai e-POWER are on it; the F-150 Raptor is on street;
//   · the Model 3 pulls 0.83-0.90 g on a 40 m skidpad (Car and Driver 0.86);
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

const r = await page.evaluate(() => {
  const P = TIRE_TYPE.premium, tyre = n => FACTORY_CARS.find(p => p.name.includes(n)).fit.tire;
  const cls = Object.fromEntries(['Model 3', 'Model Y', 'Qashqai', 'F-150 Raptor'].map(n => [n, tyre(n)]));
  loadVehiclePreset(FACTORY_CARS.find(p => p.name.includes('Model 3'))); const car = driveCar();
  const circle = (s, R, vt) => { const want = Math.atan((car.a + car.b) / R) / car.steerLock, r0 = Math.hypot(s.x, s.y - R);
    return { steer: Math.max(-1, Math.min(1, want + 0.08 * (r0 - R) + 0.6 * (vt / R - s.yaw))), throttle: Math.max(0, Math.min(1, (vt - s.vx) * 0.5 + 0.15)) }; };
  const s = driveState(car); let vt = 8, ay = 0;   // as test168's skidpad
  for (let i = 0; i < 9000; i++) { vt += 0.002; stepCar(car, s, circle(s, 40, vt), 0.01);
    if (i > 500 && Math.abs(Math.hypot(s.x, s.y - 40) - 40) < 3) ay = Math.max(ay, Math.abs(s.ayF) / 9.81);
    if (Math.abs(Math.atan2(s.vy, s.vx)) > 0.5) break; }
  return { mu: P.mu === TIRE_TYPE.street.mu, crr: P.crr === TIRE_TYPE.eco.crr, cls, ay };
});
await browser.close();

console.log(`classes ${JSON.stringify(r.cls)}; Model 3 skidpad ${r.ay.toFixed(2)} g (Car and Driver 0.86)`);
if (!r.mu || !r.crr) fails.push('premium touring is not street grip with eco rolling resistance');
for (const n of ['Model 3', 'Model Y', 'Qashqai']) if (r.cls[n] !== 'premium') fails.push(`${n} on ${r.cls[n]}`);
if (r.cls['F-150 Raptor'] !== 'street') fails.push(`F-150 Raptor on ${r.cls['F-150 Raptor']}`);
if (!(r.ay >= 0.83 && r.ay <= 0.90)) fails.push(`Model 3 skidpad ${r.ay.toFixed(2)} g`);
console.log(fails.length ? 'FAIL:\n  ' + fails.join('\n  ') : 'PASS');
console.log('ERRORS:', errors.length ? errors : 'none');
process.exit(fails.length || errors.length ? 1 : 0);
