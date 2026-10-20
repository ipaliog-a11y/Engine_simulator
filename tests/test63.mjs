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

if (errors.length) fails.push(...errors);
console.log(fails.length ? '\nFAIL:\n  ' + fails.join('\n  ') : '\nPASS');
await browser.close();
process.exit(fails.length ? 1 : 0);
