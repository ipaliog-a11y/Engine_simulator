// The surface under each wheel of the stepped car (build 334, phase G7).
//
// WHY THIS EXISTS. stepCar took the road's height under each wheel as an input, but nothing gave it one: no kerbs, no
// bumps, and the same grip everywhere. driveSurface and driveRoadAt now read them from the circuit. What must hold:
//   · the bumps are ISO 8608's: their RMS height is the root of the spectrum's area over the band, within 5%, and a
//     rear wheel meets what the front wheel of its side met a wheelbase earlier;
//   · running onto a 5 cm apex kerb with the left wheels, the left front's load jumps by its tyre's rate times the
//     kerb's height under it, the left rear's follows a wheelbase later, and the car leans away from it;
//   · a locked stop from 40 km/h on dry grass takes 0.65/0.37 as far as on dry asphalt, and on wet grass 0.65/0.22
//     (Noon 1994; Cenek et al.), within 3%; with only the left wheels on grass the car turns towards the asphalt;
//   · with no surface given, stepCar does exactly what it did;
//   · a real circuit's surface is plain data, and a car is driven round a lap on it, kerbs and bumps included.
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
  loadVehiclePreset(FACTORY_CARS.find(x => x.name.startsWith('BMW M3 (E46')));
  const car = driveCar(), o = {}, L = car.a + car.b, GD = 16e-6;
  // a straight 2 km long and 10 m wide along x (left is +y), an apex kerb on its left from 600 m to 700 m
  const pts = []; for (let i = 0; i <= 400; i++) pts.push({ x: i * 5, y: 0, nx: 0, ny: 1 });
  const P = pts.map(q => q.x >= 600 && q.x < 700 ? 0.05 : 0), flat = { track: { pts, width: 10, kerbs: { P, N: pts.map(() => 0) } } };
  const at = (x, y) => ({ x, y, psi: 0 });
  // ---- the bumps
  { const S = driveSurface(flat, GD), m = {}; let q = 0, n = 0, lag = 0;
    for (let x = 100; x < 1900; x += 0.05) { const z = driveRoadAt(S, car, at(x, 0), m).z; q += z[0] * z[0]; n++;
      lag = Math.max(lag, Math.abs(z[3] - driveRoadAt(S, car, at(x - L, 0), {}).z[1])); }
    o.rms = Math.sqrt(q / n); o.rmsWant = Math.sqrt(GD * 0.01 * (1 / 0.011 - 1 / 2.83)); o.lag = lag;
    o.plain = JSON.stringify(S) === JSON.stringify(JSON.parse(JSON.stringify(S))); }
  // ---- the kerb: the left wheels 0.4 m onto it (half its height), at 30 m/s
  { const S = driveSurface(flat, 0), m = {}, s = driveRolling(car, 108), y0 = 5 + 0.4 - car.tF / 2, u = { steer: 0, throttle: 0.15, brake: 0 };
    for (let t = 0; t < 3; t += 0.001) stepCar(car, s, u, 0.001);
    s.x = 560; s.y = y0; s.psi = 0; const f0 = s.Fz.slice(); let tF = 0, tR = 0, jump = 0, right = 0;
    while (s.x < 690) { u.road = driveRoadAt(S, car, s, m); stepCar(car, s, u, 0.001); s.y = y0; s.psi = 0; s.vy = 0; s.yaw = 0;   // held straight: the loads are the question
      if (!tF && u.road.z[0] > 0) { tF = s.t; o.zF = u.road.z[0]; jump = s.Fz[0] - f0[0]; o.lagWant = L / s.vx; }
      if (!tR && u.road.z[2] > 0) tR = s.t;
      if (tF && s.t - tF < 0.05) right = Math.max(right, Math.abs(s.Fz[1] - f0[1])); }
    o.jump = jump; o.jumpWant = car.ktF * o.zF; o.lagK = tR - tF; o.right = right; o.roll = s.roll; }
  // ---- grip: locked from 40 km/h, the anti-lock off
  { const stop = (grip) => { const c2 = Object.assign({}, car, { abs: false, esp: false }), s = driveRolling(c2, 40), x0 = s.x;
      while (s.vx > 0.1 && s.t < 30) stepCar(c2, s, { steer: 0, throttle: 0, brake: 1, road: grip && { grip } }, 0.001); return { d: s.x - x0, yaw: s.psi }; };
    const G = DRIVE_SURFACE; o.dA = stop(null).d; o.dG = stop([G.grass, G.grass, G.grass, G.grass]).d; o.dW = stop([G.grassWet, G.grassWet, G.grassWet, G.grassWet]).d;
    o.same = stop([1, 1, 1, 1]).d === o.dA; o.split = stop([G.grass, 1, G.grass, 1]).yaw;
    const S = driveSurface(flat, 0), Sw = driveSurface(flat, 0, true);
    o.gOn = driveRoadAt(S, car, at(300, 0), {}).grip; o.gOff = driveRoadAt(S, car, at(300, 5 - 0.1), {}).grip;     // the left wheels over the edge
    o.gKerb = driveRoadAt(S, car, at(650, 5 + 0.4 - car.tF / 2), {}).grip; o.gWet = driveRoadAt(Sw, car, at(300, 5 - 0.1), {}).grip; o.G = G; }
  // ---- a real circuit, driven
  { const lap = simulateLap('tech'), line = driveLine(lap), N = line.length, S = driveSurface(lap, TRACK_ROAD[trackRoad('tech')]);
    o.real = JSON.stringify(S).length > 0 && [S.x, S.y, S.nx, S.ny, S.hw, S.arc, S.P, S.N].every(a => a.length === S.x.length && a.every(Number.isFinite));
    const run = (surf) => { const c2 = Object.assign({}, car, { esp: false }), s = driveState(c2), d = { i: 0 }, m = {};
      s.x = line[0].x; s.y = line[0].y; s.psi = Math.atan2(line[1].y - line[0].y, line[1].x - line[0].x); s.vx = line[0].v; s.w = s.w.map(() => s.vx / c2.r);
      for (let g = 1; g <= c2.ratios.length; g++) { s.gear = g; if (s.vx / c2.r * c2.ratios[g - 1] * c2.fd * 30 / Math.PI < 0.9 * c2.redline) break; }
      s.we = s.vx / c2.r * c2.ratios[s.gear - 1] * c2.fd;
      let laps = 0, t1 = 0, prev = 0, kerb = 0, grass = 0, e = 0;
      while (s.t < 300) { const u = driveDriver(c2, s, line, d);
        if (surf) { Object.assign(u.road, driveRoadAt(S, c2, s, m)); if (u.road.grip.some(g => g < 1)) grass += 0.01; }
        stepCar(c2, s, u, 0.01); e = Math.max(e, Math.abs(d.e));
        if (Math.abs(d.e) > 15 || s.vx < 1) return { off: `left the line at point ${d.i} of ${N}`, e };
        if (d.i < prev - N / 2 && ++laps) { if (laps === 2) return { lap: s.t - t1, grass, e }; t1 = s.t; grass = 0; }
        prev = d.i; }
      return { off: 'no lap in 300 s' }; };
    o.smooth = run(false); o.rough = run(true); o.solver = lap.lap; }
  return o;
});
await browser.close();
const near = (a, b, tol) => Math.abs(a - b) <= tol * Math.abs(b), G = R.G;
console.log(`bumps: RMS ${(R.rms * 1000).toFixed(2)} mm (the spectrum's ${(R.rmsWant * 1000).toFixed(2)}); rear against front a wheelbase back ${R.lag.toExponential(1)} m`);
console.log(`kerb: ${(R.zF * 1000).toFixed(0)} mm under the left front, its load +${R.jump.toFixed(0)} N (tyre rate x height ${R.jumpWant.toFixed(0)}), right front within ${R.right.toFixed(0)} N; ` +
  `the rear ${(R.lagK * 1000).toFixed(0)} ms later (wheelbase / speed ${(R.lagWant * 1000).toFixed(0)}); lean ${(R.roll * 180 / Math.PI).toFixed(2)} deg away from it`);
console.log(`locked from 40 km/h: asphalt ${R.dA.toFixed(1)} m, dry grass ${R.dG.toFixed(1)} m (x${(R.dG / R.dA).toFixed(2)}, want ${(1 / G.grass).toFixed(2)}), wet grass ${R.dW.toFixed(1)} m (x${(R.dW / R.dA).toFixed(2)}, want ${(1 / G.grassWet).toFixed(2)}); left wheels on grass: heading ${(R.split * 180 / Math.PI).toFixed(1)} deg`);
console.log(`grip under the wheels: on the track ${R.gOn.map(x => x.toFixed(2))}, left over the edge ${R.gOff.map(x => x.toFixed(2))}, left on the kerb ${R.gKerb.map(x => x.toFixed(2))}, wet and over the edge ${R.gWet.map(x => x.toFixed(2))}`);
console.log(`a lap of 'tech': solver ${R.solver.toFixed(2)} s, driven smooth ${R.smooth.lap ? R.smooth.lap.toFixed(2) + ' s' : R.smooth.off}, on its surface ${R.rough.lap ? R.rough.lap.toFixed(2) + ' s, ' + R.rough.grass.toFixed(2) + ' s with a wheel on grass, ' + R.rough.e.toFixed(1) + ' m from the line at most' : R.rough.off}`);
if (!near(R.rms, R.rmsWant, 0.05)) fails.push('the bumps are not the spectrum\'s height');
if (!(R.lag < 1e-9)) fails.push('a rear wheel does not meet what the front met');
if (!R.plain || !R.real) fails.push('the surface is not plain data');
if (!near(R.zF, 0.025, 0.1)) fails.push('the kerb is not half its height 0.4 m onto it');
if (!near(R.jump, R.jumpWant, 0.1)) fails.push('the left front\'s load does not jump by its tyre\'s rate times the kerb');
if (!(R.right < 0.2 * R.jump)) fails.push('the right front\'s load moved with the left\'s');
if (!(Math.abs(R.lagK - R.lagWant) <= 0.002)) fails.push('the rear does not meet the kerb a wheelbase later');
if (!(R.roll > 0)) fails.push('the car does not lean away from the kerb');
if (!near(R.dG / R.dA, 1 / G.grass, 0.03) || !near(R.dW / R.dA, 1 / G.grassWet, 0.03)) fails.push('a stop on grass is not longer by the friction measured');
if (!R.same) fails.push('a grip of 1 changes the stop');
if (!(R.split < -0.02)) fails.push('with the left wheels on grass the car does not turn towards the asphalt');
if (R.gOn.some(g => g !== 1) || R.gOff[0] !== G.grass || R.gOff[2] !== G.grass || R.gOff[1] !== 1 || R.gKerb[0] !== 1 || R.gWet[0] !== G.grassWet || R.gWet[1] !== G.wet) fails.push('the grip under a wheel is not its surface\'s');
if (!R.rough.lap) fails.push('the car does not finish a lap on the surface: ' + R.rough.off);
for (const e of errors) fails.push(e);
if (fails.length) { console.log('\nFAIL\n' + fails.map(f => '  - ' + f).join('\n')); process.exit(1); }
console.log('\nPASS');
