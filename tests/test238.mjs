// Off the track: the soil's rolling resistance, a bend's gravel trap, and an ESP that reads the surface (small-physics 7).
//
// WHY THIS EXISTS. Off the asphalt the stepped car lost grip but rolled as freely as on the road, every verge was grass,
// and the stability control took dry asphalt's grip for its limit. What must hold:
//   · on gravel a wheel rolls against Bekker's sinkage (Wong, ch. 2): a car's wheel gives 0.25-0.32 of its load,
//     against 0.30 measured for car tyres on sand (Wong, Table 1.1), with the ground's pressure under the tyre's
//     inflation (so it counts as rigid); grass takes 0.08 of the load; with no soil given, the tyre's own crr;
//   · coasting in neutral on gravel, the car (with its wheels' inertia) slows by their resistance and the air, within 3%;
//   · a real circuit has traps where its picture draws them: 5 m past the edge outside such a bend is gravel, inside
//     it and 1.5 m past the edge is grass;
//   · on wet grass the sine with dwell (FMVSS 126, 6.5 x, from 60 km/h): with ESP the Model 3's yaw rate is under 35%
//     of its peak 1 s after the steering ends; with it off it is not;
//   · no page errors.
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
  const o = {}, g = DRIVE_G;
  const mk = (n, aids) => { loadVehiclePreset(FACTORY_CARS.find(x => x.name.startsWith(n))); vehicle.aids = aids; const c = driveCar(); vehicle.aids = undefined; return c; };
  const roll = (car, vk) => { const v = vk / 3.6, s = driveState(car); s.vx = v; s.w = s.w.map(() => v / car.r);
    for (let k = car.ratios.length; k >= 1; k--) { s.gear = k; if (v / car.r * car.ratios[k - 1] * car.fd * 30 / Math.PI >= 2000) break; }
    s.we = v / car.r * car.ratios[s.gear - 1] * car.fd; return s; };
  const all = x => [x, x, x, x], SO = DRIVE_SOIL;
  // ---- the soil
  { const c = mk('BMW M3 (E46'), W = 4000, Q = SO.gravel, k = Q.kc + c.tw * Q.kphi;
    const z0 = Math.pow(3 * W / ((3 - Q.n) * k * Math.sqrt(2 * c.r)), 2 / (2 * Q.n + 1));
    o.soil = { gravel: driveRollF(c, W, Q) / W, grass: driveRollF(c, W, SO.grass) / W, road: driveRollF(c, W, null) === c.crr * W,
      p: (Q.kc / c.tw + Q.kphi) * Math.pow(z0, Q.n) / 1000, z0: z0 * 1000 };
    // coasting in neutral on gravel from 60 km/h
    const s = roll(c, 60), road = { grip: all(DRIVE_SURFACE.gravel), soil: all(Q) };
    for (let t = 0; t < 0.5; t += 0.001) stepCar(c, s, { steer: 0, throttle: 0, brake: 0, gear: 0, road }, 0.001);
    const v0 = s.vx, F = s.Fz.reduce((a, f) => a + driveRollF(c, f, Q), 0) + 0.5 * DRIVE_RHO * c.cdA * v0 * v0;
    for (let t = 0; t < 0.2; t += 0.001) stepCar(c, s, { steer: 0, throttle: 0, brake: 0, gear: 0, road }, 0.001);
    o.coast = { got: (v0 - s.vx) / 0.2, want: F / (c.m + 4 * c.Iw / (c.r * c.r)) }; }   // the wheels turn too
  // ---- the traps of a real circuit
  { const lap = simulateLap('yasmarina'), S = driveSurface(lap, 0), c = mk('BMW M3 (E46'), n = S.x.length;
    const at = (i, side, past) => { const y = side * (S.hw[i] + past + c.tF / 2), p = { x: S.x[i] + S.nx[i] * y, y: S.y[i] + S.ny[i] * y,
      psi: Math.atan2(S.ny[i], S.nx[i]) - Math.PI / 2 }; const r = driveRoadAt(S, c, p, {}); const q = side > 0 ? 0 : 1;   // the left wheels sit +y
      return r.soil[q] === SO.gravel ? 'gravel' : r.soil[q] === SO.grass ? 'grass' : 'road'; };
    let traps = 0, out = {}, inn = {}, near = {};
    for (let i = 0; i < n; i++) if (S.trap[i] && S.trap[(i + 1) % n] === S.trap[i] && S.trap[(i - 1 + n) % n] === S.trap[i]) { traps++;
      const a = at(i, S.trap[i], 5), b = at(i, -S.trap[i], 5), d = at(i, S.trap[i], 1.5); out[a] = (out[a] || 0) + 1; inn[b] = (inn[b] || 0) + 1; near[d] = (near[d] || 0) + 1; }
    o.trap = { traps, n, out, inn, near }; }
  // ---- the ESP on wet grass: the sine with dwell
  { const G = DRIVE_SURFACE.grassWet, road = { grip: all(G), soil: all(SO.grass) };
    const swd = car => { const s = roll(car, 60), v = 60 / 3.6, L = car.a + car.b, T = 1 / 0.7, t0 = 0.5, end = t0 + T + 0.5;
      const A = Math.min(6.5 * 0.3 * G * g * L * (1 + car.Kus * v * v) / (v * v), car.steerLock * 4.71 / 8.5);   // 6.5 x the steering for 0.3 g of this grip
      const st = t => t < 0 ? 0 : t < 0.75 * T ? Math.sin(2 * Math.PI * 0.7 * t) : t < 0.75 * T + 0.5 ? -1 : t < T + 0.5 ? Math.sin(2 * Math.PI * 0.7 * (t - 0.5)) : 0;
      let pk = 0, r1 = 0, beta = 0;
      while (s.t < end + 1.1) { const t = s.t - t0; stepCar(car, s, { steer: A * st(t) / car.steerLock, throttle: 0, brake: 0, gear: s.gear, road }, 0.005);
        if (t > 0.5 * T) pk = Math.max(pk, Math.abs(s.yaw)); if (Math.abs(s.t - end - 1) < 0.003) r1 = Math.abs(s.yaw);
        beta = Math.max(beta, Math.abs(Math.atan2(s.vy, Math.max(1, s.vx))) * 180 / Math.PI); }
      return { r1: r1 / pk, beta }; };
    o.esp = { on: swd(mk('Tesla Model 3', { esp: true })), off: swd(mk('Tesla Model 3', { esp: false })) }; }
  return o;
});
await browser.close();

const S = R.soil, f2 = x => x.toFixed(2);
console.log(`soil: gravel ${f2(S.gravel)} of the load (sinks ${S.z0.toFixed(0)} mm, ground ${S.p.toFixed(0)} kPa under the tyre), grass ${f2(S.grass)}; no soil gives crr: ${S.road}`);
if (!(S.gravel >= 0.25 && S.gravel <= 0.32)) fails.push('gravel\'s rolling resistance is not Wong\'s sand');
if (!(S.p < 200)) fails.push('the ground presses harder than the tyre\'s inflation: not a rigid wheel');
if (S.grass !== 0.08 || !S.road) fails.push('grass, or the road without soil, is not as given');
console.log(`coasting on gravel: ${f2(R.coast.got)} m/s2 (the wheels and the air ${f2(R.coast.want)})`);
if (!(Math.abs(R.coast.got - R.coast.want) <= 0.03 * R.coast.want)) fails.push('the car does not slow by the soil\'s resistance');
const T = R.trap;
console.log(`Yas Marina: ${T.traps} of ${T.n} points with a trap; 5 m out ${JSON.stringify(T.out)}, 5 m in ${JSON.stringify(T.inn)}, 1.5 m out ${JSON.stringify(T.near)}`);
if (!(T.traps > 10) || T.out.gravel !== T.traps || T.inn.grass !== T.traps || T.near.grass !== T.traps) fails.push('the traps are not where the picture draws them');
console.log(`wet grass, sine with dwell 6.5 x from 60 km/h, Model 3: ESP on ${f2(R.esp.on.r1)} of the peak yaw 1 s after (slip ${R.esp.on.beta.toFixed(1)} deg), off ${f2(R.esp.off.r1)} (${R.esp.off.beta.toFixed(1)} deg)`);
if (!(R.esp.on.r1 < 0.35)) fails.push('ESP does not catch the car on wet grass');
if (!(R.esp.off.r1 >= 0.35)) fails.push('with ESP off the car does not spin on wet grass: the check shows nothing');
for (const e of errors) fails.push(e);
if (fails.length) { console.log('FAIL:\n  ' + fails.join('\n  ')); process.exit(1); }
console.log('PASS');
