// Real cars: each car's own body over its chassis class, and the model against the published figures.
//
// WHY THIS EXISTS. Until build 97 a car was a chassis archetype: every hot hatch had the same mass, drag
// and wheelbase. A real car is one member of its class, and its curb mass, Cd, frontal area, wheelbase
// and weight split are published. This test checks that a loaded car is that car (and stays coherent
// when parts are swapped), then reports every car against its maker's 0-100 and top speed. Like test60
// it is a REPORT plus health checks, with each car's current known problems named, so a new problem
// fails and a fixed one is announced. Nothing here is a fit target.
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

// ---- 1. the body is the car's, and behaves like a body ------------------------------------------
const mech = await page.evaluate(() => {
  const out = {};
  const p = VEHICLE_PRESETS.find(x => x.name === 'VW Golf GTI (Mk7, 2013)');
  loadVehiclePreset(p);
  out.kg = { model: vehicle.mass, real: p.body.kg };
  out.cdA = { model: vehicle.cdA, real: p.body.cd * p.body.area };
  out.stock = isFactoryFit(readVehicleFromForm());
  out.label = vehicle.chLabel;
  // swap the engine: the platform stays, the mass moves by the difference between the engines
  const e0 = vehicle.engineMass, m0 = vehicle.mass;
  applyEngineToForm(Object.assign({}, DEFAULT_ENGINE, PRESETS.find(x => x.name === 'GM LS3 (Corvette C6)').engine)); buildEngine();
  buildVehicle();
  out.swap = { dm: vehicle.mass - m0, de: vehicle.engineMass - e0, still: vehicle.chLabel };
  // a saved build carries the body; loading it gives the same car
  const saved = JSON.parse(JSON.stringify(serializeBuild('t', '')));
  applyBuild({ engine: Object.assign({}, DEFAULT_ENGINE), tune: Object.assign({}, STD_TUNE) });
  out.cleared = vehicle.body;
  applyBuild(saved);
  out.reload = { mass: vehicle.mass, label: vehicle.chLabel, m0: m0 + out.swap.dm };
  // picking a generic chassis leaves the real car
  const sel = document.getElementById('vhChassis'); sel.value = 'hatch'; sel.dispatchEvent(new Event('input'));
  out.generic = { body: vehicle.body, label: vehicle.chLabel, kg: vehicle.mass, arche: CHASSIS.hatch.mass + vehicle.engineMass };
  // the speed limiter (build 99): a governed car holds its governor; removing it frees the car, and
  // nothing below the governor changes
  loadVehiclePreset(VEHICLE_PRESETS.find(x => x.name === 'BMW M3 (E46, 2000)'));
  const on = { top: perf.topSpeed, gov: vehicle.governor, governed: perf.governed, t100: perf.t100, free: perf.freeSpeed };
  const lim = document.getElementById('vhLimiter'); lim.value = 'off'; lim.dispatchEvent(new Event('input'));
  out.limiter = { on, off: { top: perf.topSpeed, t100: perf.t100, gov: vehicle.governor, stock: isFactoryFit(readVehicleFromForm()) } };
  // every preset names an engine that exists, and arrives on its own factory fit
  out.bad = VEHICLE_PRESETS.filter(v => !PRESETS.some(e => e.name === v.engine) || !CHASSIS[v.chassis]).map(v => v.name);
  return out;
});
console.log(`== GTI Mk7: ${Math.round(mech.kg.model)} kg (real ${mech.kg.real}), CdA ${mech.cdA.model.toFixed(3)} (${mech.cdA.real.toFixed(3)}), factory fit ${mech.stock} ==`);
if (Math.abs(mech.kg.model - mech.kg.real) > 0.5) fails.push(`a loaded car is ${Math.round(mech.kg.model)} kg, not its real ${mech.kg.real}`);
if (Math.abs(mech.cdA.model - mech.cdA.real) > 1e-9) fails.push('a loaded car does not carry its own Cd x area');
if (!mech.stock) fails.push('a loaded car does not read as factory spec');
console.log(`== engine swap: mass ${mech.swap.dm >= 0 ? '+' : ''}${mech.swap.dm.toFixed(1)} kg for an engine ${mech.swap.de >= 0 ? '+' : ''}${mech.swap.de.toFixed(1)} kg heavier ==`);
if (Math.abs(mech.swap.dm - mech.swap.de) > 1e-6) fails.push('an engine swap must move the mass by exactly the engine difference');
if (mech.swap.still !== mech.label) fails.push('an engine swap dropped the car body');
if (mech.cleared) fails.push('loading a build without a body kept the previous car body');
if (Math.abs(mech.reload.mass - mech.reload.m0) > 1e-6 || mech.reload.label !== mech.label) fails.push('a saved build does not bring its car body back');
if (mech.generic.body || Math.abs(mech.generic.kg - mech.generic.arche) > 1e-6) fails.push('a generic chassis still carries the real car body');
const L = mech.limiter;
console.log(`== M3 E46 limiter: on ${L.on.gov} km/h -> top ${L.on.top.toFixed(1)}; removed -> top ${L.off.top.toFixed(1)} (free ${L.on.free.toFixed(1)}) ==`);
if (!(L.on.governed && Math.abs(L.on.top - L.on.gov) < 1e-6)) fails.push('a governed car does not hold its governor');
if (!(L.off.gov === 0 && Math.abs(L.off.top - L.on.free) < 0.6 && L.off.top > L.on.top)) fails.push('removing the limiter does not free the car');
if (Math.abs(L.off.t100 - L.on.t100) > 1e-9) fails.push('a governor above 100 km/h changed the 0-100');
if (L.off.stock) fails.push('a car with its limiter removed still reads as factory spec');
if (mech.bad.length) fails.push('presets with a missing engine or chassis: ' + mech.bad.join(', '));

// ---- 2. every car against its maker ------------------------------------------------------------
const cars = await page.evaluate(() => VEHICLE_PRESETS.map(p => {
  loadVehiclePreset(p);
  const ep = PRESETS.find(e => e.name === p.engine);
  const stock = isFactoryFit(readVehicleFromForm()), kgOk = Math.abs(vehicle.mass - p.body.kg) < 0.5;
  const own = simulateAccel(), hp = engine.score.peakHP;
  // the same car with power scaled to the rating, so a bad 0-100 can be blamed on engine or car
  const c0 = buildTorqueCurve, g0 = buildTorqueGrid, k = ep.real.hp / Math.max(1, hp);
  window.buildTorqueCurve = () => c0().map(q => ({ rpm: q.rpm, tq: q.tq * k }));
  window.buildTorqueGrid = () => { const g = g0(); return { ...g, tq: g.tq.map(r => r.map(t => t * k)) }; };
  const matched = simulateAccel();
  window.buildTorqueCurve = c0; window.buildTorqueGrid = g0;
  return { n: p.name, real: p.real, rhp: ep.real.hp, note: ep.note || p.note, hp, stock, kgOk,
    t100: own.t100, top: own.topSpeed, t100m: matched.t100, governed: own.governed };
}));
await browser.close();

const pc = (m, r) => (m / r - 1) * 100;
const sg = v => (v >= 0 ? '+' : '') + v.toFixed(0) + '%';
const rms = a => Math.sqrt(a.reduce((s, x) => s + x * x, 0) / a.length);
console.log('\ncar                                          hp real/model      0-100 real/model (power-matched)     top real/model');
for (const c of cars)
  console.log(`${c.n.padEnd(44)} ${String(c.rhp).padStart(4)}/${String(c.hp).padStart(4)} ${sg(pc(c.hp, c.rhp)).padStart(5)}   ` +
    `${c.real.t100.toFixed(1).padStart(5)}/${(c.t100 ? c.t100.toFixed(2) : 'never').padStart(6)} ${(c.t100 ? sg(pc(c.t100, c.real.t100)) : '').padStart(5)} (${c.t100m ? sg(pc(c.t100m, c.real.t100)) : '—'})   ` +
    `${String(c.real.top).padStart(4)}/${String(Math.round(c.top)).padStart(4)} ${sg(pc(c.top, c.real.top)).padStart(5)}${c.real.limited ? ' governed' : ''}`);
// Capped or voluntary ratings are not what the engine made, so they stay out of the error summary.
const scored = cars.filter(c => !c.note && c.t100);
console.log(`\n  RMS 0-100 ${rms(scored.map(c => pc(c.t100, c.real.t100))).toFixed(1)}% on the model's own power, ` +
  `${rms(scored.map(c => pc(c.t100m, c.real.t100))).toFixed(1)}% power-matched (the car alone), over ${scored.length} cars`);
const free = cars.filter(c => !c.real.limited);
console.log(`  RMS top speed ${rms(cars.map(c => pc(c.top, c.real.top))).toFixed(1)}% over all ${cars.length} cars (governors fitted), ` +
  `${rms(free.map(c => pc(c.top, c.real.top))).toFixed(1)}% over the ${free.length} ungoverned`);

// ---- 3. health checks, against each car's known problems ---------------------------------------
//   slow-car   right power (within 10%) but 0-100 off by more than 25%: the car model is wrong
//   short      a governed car tops out below 97% of its governor: it cannot reach it, as the real car does
//   never      cannot reach 100 km/h
// KNOWN, build 97, each traced before it was listed:
//   Duramax pickup, 29% slow with power within 7%: traction-limited for 9.2 of its 10.3 s, 1234 Nm
//     through two eco tyres on a 3.4 t truck. Its inputs are the weakest in the table (kg, Cd, area
//     and 0-100 all secondary), and it has an 8-speed where the real one has 10.
//   RS3, 27% slow with power within 7%: an ENGINE shape problem the power column cannot see. It holds
//     boost only high up (torque peak 5500 rpm against a real 1700), so 3.3 s of the run is below 90%
//     boost; power-matched it is still +19%. Its boost pressure is an unsure input in PRESETS.
const KNOWN = {
  'Chevrolet Silverado 2500HD Duramax (2020)': ['slow-car'],
  'Audi RS3 Sportback (8V, 2017)': ['slow-car'],
  // Short of the 250 km/h governor (233-242) because their engines are 17-26% short of their rating
  // (test60): the R34's is the JDM 280 PS figure real cars beat, the STI's and Evo's boost is unsure.
  'Nissan Skyline GT-R V-spec (R34, 1999)': ['short'],
  'Subaru Impreza WRX STI (GD, 2004)': ['short'],
  'Mitsubishi Lancer Evolution IX (2006)': ['short'],
};
const found = {};
for (const c of cars) {
  const f = [];
  if (!c.t100) f.push('never');
  else if (Math.abs(pc(c.hp, c.rhp)) < 10 && Math.abs(pc(c.t100, c.real.t100)) > 25) f.push('slow-car');
  if (c.real.limited && c.top < 0.97 * c.real.top) f.push('short');
  if (!c.stock) fails.push(`${c.n}: does not load as factory spec`);
  if (!c.kgOk) fails.push(`${c.n}: does not load at its real curb mass`);
  found[c.n] = f;
}
for (const [n, f] of Object.entries(found)) {
  const known = KNOWN[n] || [];
  for (const x of f) if (!known.includes(x)) fails.push(`${n}: new problem '${x}'`);
  for (const x of known) if (!f.includes(x)) console.log(`  FIXED: ${n} no longer shows '${x}' — retire it from KNOWN`);
}

if (errors.length) fails.push(...errors);
console.log(fails.length ? '\nFAIL:\n  ' + fails.join('\n  ') : '\nPASS');
process.exit(fails.length ? 1 : 0);
