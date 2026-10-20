// Vehicle dynamics consistency (build 105): five things the vehicle review found inconsistent.
//
// WHY THIS EXISTS. The straight-line run and the lap solver are two integrations of one car, and they
// disagreed: the lap had no load transfer under acceleration, downforce went 50/50 to the axles whatever
// was fitted, brakes faded on the 100-0 stop but never on a lap, a locked diff's cornering scrub also
// cut straight-line braking, and an engine swap changed the mass but not where it sits. Each check
// here is one of those, stated as the physics says it must come out.
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
  const out = {};
  const engineOf = nm => { applyEngineToForm(Object.assign({}, DEFAULT_ENGINE, PRESETS.find(p => p.name === nm).engine)); buildEngine(); };
  const set = (id, val) => { document.getElementById(id).value = val; };
  // ---- 1. aero balance: where each part's downforce lands, and which axle it helps ----
  engineOf('5.0 V8 NA Muscle'); applyChassisFit('coupe');
  const aero = (f, rr, fl, drive) => { set('vhAeroF', f); set('vhAeroR', rr); set('vhAeroFl', fl); set('vhDrive', drive); buildVehicle();
    return { bal: vehicle.aeroBal, driven: vehicle.drivenAero }; };
  out.aero = { wingRwd: aero('none', 'wing', 'none', 'rwd'), wingFwd: aero('none', 'wing', 'none', 'fwd'),
    splitFwd: aero('splitter', 'none', 'none', 'fwd'), diffuser: aero('none', 'none', 'diffuser', 'rwd') };
  // ---- 2. load transfer on the lap: a powerful car, rear- vs front-driven, everything else equal ----
  engineOf('6.2 Supercharged V8'); applyChassisFit('coupe');
  const lapAs = drive => { set('vhDrive', drive); set('vhDiff', 'clsd'); buildVehicle(); const L = simulateLap('mixed');
    return { lap: L.lap, traction: L.counts.traction / L.lineLength }; };
  out.drive = { rwd: lapAs('rwd'), fwd: lapAs('fwd') };
  // ---- 3. brake fade on the lap ----
  engineOf('6.5 V12 NA Supercar'); applyChassisFit('gt');
  const fadeLap = brake => { set('vhBrake', brake); buildVehicle(); const L = simulateLap('nord');
    const keep = vehicle.brakeTh.onset; vehicle.brakeTh.onset = Infinity; const C = simulateLap('nord'); vehicle.brakeTh.onset = keep;
    return { lap: L.lap, cold: C.lap }; };
  out.fade = { steel: fadeLap('steel'), carbon: fadeLap('carbon') };
  // ---- 3b. cooling (build 110): the vanes pump air as the wheel turns, a duct feeds them more ----
  loadVehiclePreset(VEHICLE_PRESETS.find(v => v.name === 'Porsche 911 GT3 (991.2, 2017)'));
  { const th = vehicle.brakeTh, d = th.front, v = 150 / 3.6, noDuct = Object.assign({}, d, { duct: 0 }), solid = Object.assign({}, d, { vented: false });
    let T = 600, t = 0; while (T > 300 && t < 1000) { T = rotorStep(T, d, th, 0, v, 0.1); t += 0.1; }
    out.cool = { t300: t, duct: rotorCooling(600, d, th, v), plain: rotorCooling(600, noDuct, th, v), solid: rotorCooling(600, solid, th, v),
      still: rotorCooling(600, noDuct, th, 0) - rotorCooling(600, solid, th, 0) }; }
  // ---- 4. a locked diff scrubs in corners, not in a straight line under braking ----
  engineOf('2.0 Turbo Hot-Hatch I4'); applyChassisFit('coupe'); set('vhDrive', 'rwd');
  // fade off: since build 107 the brakes have a temperature, and two cars that corner differently heat
  // them differently, which is not what this check is about
  const straightBrake = diff => { set('vhDiff', diff); buildVehicle(); vehicle.brakeTh.onset = Infinity;
    const L = simulateLap('nord'), p = L.track.line, n = p.length, mech = new Array(n).fill(null);
    for (let i = 0; i < n; i++) {
      if (L.lim[i] !== 'brake' || p[i].r < 3000) continue;
      const j = (i + 1) % n, aLong = (L.v[j] ** 2 - L.v[i] ** 2) / (2 * p[i].ds3);
      mech[i] = -aLong - 0.5 * AIR_RHO * vehicle.cdA * L.v[i] ** 2 / vehicle.mass - G * p[i].sinT;
    }
    return { mech, cap: Math.min(vehicle.brakeDecelCap, vehicle.mu * G) }; };
  // The ceiling is what the fix is about: hard on the brakes in a straight line, both cars must reach the
  // same deceleration. (An average over "braking" points is not that: the spool corners slower, so its
  // braking zones are longer and more of them sit at the ceiling.) So compare the top of each car's
  // straight-line braking, its 90th percentile.
  const top = arr => { const a = arr.filter(x => x != null).sort((x, y) => x - y); return { mech: a[Math.floor(a.length * 0.9)] || 0, n: a.length }; };
  const o = straightBrake('open'), sp = straightBrake('spool');
  out.diff = { open: Object.assign(top(o.mech), { cap: o.cap }), spool: top(sp.mech) };
  // ---- 5. an engine swap moves the weight split by the engine's mass at its position ----
  const swap = (car, eng) => {
    loadVehiclePreset(VEHICLE_PRESETS.find(v => v.name === car)); const f0 = vehicle.fWt, body = vehicle.body.fWt, m0 = vehicle.engineMass;
    engineOf(eng); buildVehicle(); return { f0, body, f1: vehicle.fWt, dm: vehicle.engineMass - m0 }; };
  out.swap = { mx5: swap('Mazda MX-5 1.6 (NA, 1989)', 'GM LS7 (Corvette Z06 C6)'),
    huracan: swap('Lamborghini Huracán LP610-4 (2014)', 'Dodge 6.2 Hellcat (Challenger SRT)'),
    gt3: swap('Porsche 911 GT3 (991.2, 2017)', 'Dodge 6.2 Hellcat (Challenger SRT)') };
  // ---- 5b. the lap brakes at the limit (build 114): wherever the brakes are on, the car slows as hard
  // as the tyres (less what cornering takes) and the brakes allow AT THE SPEED IT IS DOING. Until build 114
  // the braking pass read the friction circle at the cornering ceiling instead, where the tyre is all
  // used sideways, found almost no braking left and crept towards corners: 250 m at 82 km/h down a 13%
  // hill into a 42 m corner on the Nordschleife.
  out.limit = ['tech', 'nord'].map(k => { loadVehiclePreset(VEHICLE_PRESETS.find(v => v.name === 'Porsche 911 GT3 (991.2, 2017)'));
    const L = simulateLap(k), p = L.track.line, n = p.length, m = vehicle.mass; let used = 0, soft = 0, worst = 1;
    const res = i => (0.5 * AIR_RHO * vehicle.cdA * L.v[i] ** 2) / m + G * p[i].sinT;
    const dec = i => { const j = (i + 1) % n; return (L.v[i] ** 2 - L.v[j] ** 2) / (2 * p[i].ds3); };
    const braking = i => dec(i) - res(i) >= 1.5;          // on the brakes, not just lifting, drag or the hill
    for (let i = 0; i < n; i++) {
      // inside a braking zone: the segments at each end are part braking, part not (the solver's two
      // passes cross inside them), so they are not a measure of how hard it brakes
      if (!(braking(i) && braking((i - 1 + n) % n) && braking((i + 1) % n))) continue;
      const v = L.v[i], a = dec(i), dn = 0.5 * AIR_RHO * vehicle.clA * v * v;
      const N = Math.max(m * G * 0.15, m * G * p[i].cosT + dn + clamp(m * v * v * p[i].kv, -0.6 * m * G, 0.6 * m * G));
      const rs = res(i);
      const ay = v * v / p[i].r, u = clamp(ay / Math.max(0.1, latMuEff(N, ay) * (vehicle.df.corner || 1) * N / m), 0, 1);
      const avail = Math.min(vehicle.brakeDecelCap * L.replay.fade[i], tyreMuX(N / 4) * N / m * Math.sqrt(Math.max(0, 1 - u * u)));
      used++; const f = (a - rs) / avail; worst = Math.min(worst, f); if (f < 0.9) soft++;
    }
    return { k, used, soft, worst }; });
  // ---- 6. brakes from the hydraulics (build 113): a road car's brakes out-pull its tyres ----
  out.brakes = VEHICLE_PRESETS.map(pr => { loadVehiclePreset(pr);
    return { n: pr.name, cap: vehicle.brakeDecelCap / G, grip: tyreMuX(vehicle.mass * G / 4), d: perf.brake100.dist, type: vehicle.brakeType }; });
  return out;
});

const a = r.aero;
console.log(`== aero balance: rear wing -> front share ${a.wingRwd.bal.toFixed(2)}, driven share RWD ${a.wingRwd.driven.toFixed(2)} / FWD ${a.wingFwd.driven.toFixed(2)}; ` +
  `splitter -> FWD ${a.splitFwd.driven.toFixed(2)}; diffuser -> front ${a.diffuser.bal.toFixed(2)} ==`);
if (!(a.wingRwd.driven > 0.99 && a.wingFwd.driven < 0.01)) fails.push('a rear wing should load the rear axle only');
if (!(a.splitFwd.driven > 0.99)) fails.push('a front splitter should load the front axle only');
if (Math.abs(a.diffuser.bal - 0.35) > 1e-9) fails.push('a diffuser should put 35% of its downforce on the front axle');

const d = r.drive;
console.log(`== 6.2 SC V8 coupe at Riverside: RWD ${d.rwd.lap.toFixed(2)} s (traction-limited ${(d.rwd.traction * 100).toFixed(0)}%), ` +
  `FWD ${d.fwd.lap.toFixed(2)} s (${(d.fwd.traction * 100).toFixed(0)}%) ==`);
if (!(d.rwd.lap < d.fwd.lap)) fails.push('a 600 hp rear-driver should lap faster than the same car driven at the front');
if (!(d.rwd.traction < d.fwd.traction)) fails.push('squat should give a rear-driver more exit traction than a front-driver');

const f = r.fade;
console.log(`== Nordschleife, V12 GT: steel ${f.steel.lap.toFixed(1)} s (unfaded ${f.steel.cold.toFixed(1)}), carbon ${f.carbon.lap.toFixed(1)} s (unfaded ${f.carbon.cold.toFixed(1)}) ==`);
if (!(f.steel.lap > f.steel.cold + 0.05)) fails.push('steel brakes do not fade on a Nordschleife lap');
if (!(f.steel.lap - f.steel.cold > f.carbon.lap - f.carbon.cold)) fails.push('carbon-ceramics should fade less than steel');
if (f.carbon.lap < f.carbon.cold - 1e-6) fails.push('fade made a lap quicker');

const c = r.cool;
console.log(`== 911 GT3 front rotor at 600 C, 150 km/h: ${(c.solid / 1000).toFixed(1)} kW outside, ${(c.plain / 1000).toFixed(1)} with the vanes, ${(c.duct / 1000).toFixed(1)} ducted; 600 -> 300 C in ${c.t300.toFixed(0)} s ==`);
if (!(c.plain > c.solid && c.duct > c.plain)) fails.push('the vanes and the brake duct should each add cooling');
if (!(c.still < 0.1 * (c.plain - c.solid))) fails.push('the vanes pump air only when the wheel turns');
if (!(c.t300 < 150)) fails.push(`a ducted 911 GT3 rotor takes ${c.t300.toFixed(0)} s to cool from 600 to 300 C at 150 km/h`);

const df = r.diff;
console.log(`== straight-line braking (${df.open.n} points): open ${df.open.mech.toFixed(2)} m/s2, spool ${df.spool.mech.toFixed(2)} m/s2 (tyre/brake limit ${df.open.cap.toFixed(2)}) ==`);
if (df.open.n < 10) fails.push('too few straight braking points to compare the diffs');
if (Math.abs(df.open.mech - df.spool.mech) > 0.02 * df.open.mech) fails.push('a locked diff changed straight-line braking');

console.log('== engine swaps move the weight split ==');
for (const [k, s] of Object.entries(r.swap))
  console.log(`  ${k.padEnd(8)} factory ${s.f0.toFixed(3)} (published ${s.body}) -> ${s.f1.toFixed(3)} with ${s.dm >= 0 ? '+' : ''}${Math.round(s.dm)} kg of engine`);
for (const [k, s] of Object.entries(r.swap)) if (Math.abs(s.f0 - s.body) > 1e-9) fails.push(`${k}: the factory engine does not give the published weight split`);
if (!(r.swap.mx5.f1 > r.swap.mx5.f0)) fails.push('a heavier engine in a front-engined car should move weight forward');
if (!(r.swap.huracan.f1 < r.swap.huracan.f0)) fails.push('a heavier engine in a mid-engined car should move weight back');
if (!(r.swap.gt3.f1 < r.swap.huracan.f1 + (r.swap.huracan.f0 - r.swap.gt3.f0) + 1e-9 && r.swap.gt3.f1 < r.swap.gt3.f0)) fails.push('a heavier engine behind a 911\'s rear axle should move weight back');

for (const x of r.limit) {
  console.log(`== GT3 at ${x.k}: ${x.used} points on the brakes, ${x.soft} braking under 90% of what is available (least ${(x.worst * 100).toFixed(0)}%) ==`);
  if (x.used < 20) fails.push(`${x.k}: too few braking points to check`);
  if (x.soft > 0.05 * x.used) fails.push(`${x.k}: ${x.soft} of ${x.used} braking points use less than 90% of the grip available`);
}
console.log('== brakes from the hydraulics, 100-0 with a 0.2 s pressure build-up ==');
for (const b of r.brakes) if (/Aygo|Fiesta|M3|GT3|Silverado/.test(b.n))
  console.log(`  ${b.n.slice(0, 34).padEnd(34)} ${b.type.padEnd(7)} brakes ${b.cap.toFixed(2)} g vs tyres ${b.grip.toFixed(2)} g  100-0 ${b.d.toFixed(1)} m`);
for (const b of r.brakes) if (!(b.cap > b.grip)) fails.push(`${b.n}: its factory brakes cannot reach its tyres' limit`);
// published 100-0 (km/h) distances: small cars ~37-42 m, a 911 GT3 ~31-33 m
const stop = nm => r.brakes.find(b => b.n.includes(nm)).d;
for (const nm of ['Aygo', 'Fiesta', 'Fiat 500']) if (!(stop(nm) > 36 && stop(nm) < 43)) fails.push(`${nm} stops in ${stop(nm).toFixed(1)} m (real ~37-42)`);
if (!(stop('GT3') > 29.5 && stop('GT3') < 33.5)) fails.push(`911 GT3 stops in ${stop('GT3').toFixed(1)} m (real ~31-33)`);

if (errors.length) fails.push(...errors);
console.log(fails.length ? '\nFAIL:\n  ' + fails.join('\n  ') : '\nPASS');
await browser.close();
process.exit(fails.length ? 1 : 0);
