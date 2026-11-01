// Dampers and the road (build 215).
//
// WHY THIS EXISTS. The lap was solved as a string of steady corners, where a damper does nothing, so stage 3 of the
// suspension (dampers) waited. Build 215 gives the circuits a road: ISO 8608 roughness, and a quarter car at each
// axle (body, spring, damper, wheel, tyre) whose response sets how far the tyres' load swings. A swinging load grips
// less on average than a steady one (load sensitivity), and none at all when the wheel leaves the road. What must hold:
//   · the quarter car is a real one: damping at the kit's ratio and the step, wheel hop at 10-16 Hz; the load swing
//     grows as the root of roughness times speed;
//   · the swing is least near the textbook optimum, about half of critical, and grows both softer and stiffer; the
//     ride (body acceleration) grows steadily stiffer; stiffer springs swing the load more;
//   · the grip kept is 1 with no swing and falls as the swing grows; the load cannot pull on the road, and its mean
//     stays the car's weight (a wheel in the air is made up by a harder landing);
//   · on a lap: a perfectly smooth surface gives the old lap exactly; the Nordschleife (a public road) costs more
//     than a smooth GP circuit; on the same racing line, dampers far too soft are slower than the kit's;
//   · the 0-100, the braking and the skidpad do not change (a smooth test surface);
//   · FRONT/REAR DAMPERS: off STANDARD they cost and make the car (modified), REFIT puts them back, a save keeps
//     them, a save from before has none and gets the kit's; the summary and the guide say it, in Greek too.
import { chromium } from './pw.mjs';
import { fileURLToPath, pathToFileURL } from 'url';
import path from 'path';
const repo = fileURLToPath(new URL('..', import.meta.url));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors = [];
page.on('console', m => { if (m.type() === 'error' && !/ERR_FILE_NOT_FOUND/.test(m.text())) errors.push('console: ' + m.text()); });
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
await page.goto(pathToFileURL(path.join(repo, 'index.html')).href, { waitUntil: 'networkidle' });
await page.waitForTimeout(400);
const fails = [];

const r = await page.evaluate(() => {
  const o = {};
  const load = n => { loadVehiclePreset(VEHICLE_PRESETS.find(x => x.name.includes(n))); buildVehicle(); };
  const set = (id, v) => { document.getElementById(id).value = String(v); buildVehicle(); };
  load('BMW M3 (E46');
  // 1. the quarter car
  const kit = SUSPENSION[vehicle.suspension];
  o.q = { kit: vehicle.suspension, kitZeta: kit.zeta, zetaF: vehicle.zetaF, zetaR: vehicle.zetaR, hop: vehicle.hopHz };
  set('vhDamperF', 1); o.q.step = vehicle.zetaF / o.q.zetaF; set('vhDamperF', 0);
  const qF = quarterCar(vehicle, 'F');
  o.scale = { a: vehicle.roughF * Math.sqrt(8e-6 * 30), b: vehicle.roughF * Math.sqrt(32e-6 * 30), c: vehicle.roughF * Math.sqrt(8e-6 * 120) };
  // 2. the swing and the ride against the damping, and against the springs
  const sweep = [];
  for (const z of [0.08, 0.15, 0.3, 0.5, 0.8, 1.3]) {
    const q = Object.assign({}, qF, { cs: 2 * z * Math.sqrt(qF.ks * qF.ms) }), c = quarterCoef(q);
    sweep.push({ z, F: c.F, A: c.A });
  }
  o.sweep = sweep;
  const stiff = Object.assign({}, qF, { ks: qF.ks * 1.69 });   // stiffer springs on the same dampers
  o.springs = { soft: quarterCoef(qF).F, stiff: quarterCoef(stiff).F };
  // 3. the grip kept
  o.grip = [0, 0.1, 0.2, 0.4, 0.8, 1.5, 3].map(s => roadGrip(s));
  // 4. laps
  const lap = (t, opt) => simulateLap(t, opt).lap;
  const mixedLine = simulateLap('mixed').line, nordLine = simulateLap('nord').line;
  o.lap = {
    mixedSmooth: lap('mixed', { line: mixedLine, road: 0 }), mixed: lap('mixed', { line: mixedLine }),
    nordSmooth: lap('nord', { line: nordLine, road: 0 }), nord: lap('nord', { line: nordLine }),
    roads: { mixed: trackRoad('mixed'), nord: trackRoad('nord'), cota: trackRoad('cota'), sakhir: trackRoad('sakhir') }
  };
  // dampers far too soft (four steps under SOFT -2 is out of the menu's reach, so set directly), on the same line
  const keep = [vehicle.damperF, vehicle.damperR];
  const roughWith = st => { vehicle.damperF = vehicle.damperR = st; const a = quarterCoef(quarterCar(vehicle, 'F')), b = quarterCoef(quarterCar(vehicle, 'R')); vehicle.roughF = a.F; vehicle.roughR = b.F; };
  roughWith(-6); o.lap.nordLoose = lap('nord', { line: nordLine });
  roughWith(0); o.lap.nordKit = lap('nord', { line: nordLine });
  vehicle.damperF = keep[0]; vehicle.damperR = keep[1]; buildVehicle();
  // 5. the test surface
  const perf = () => { const a = simulateAccel(); return [a.t100, a.vmax, vehicle.brakeDecelCap, latMuEff(vehicle.mass * G, G)].map(x => +(+x).toFixed(6)).join('|'); };
  const p0 = perf(); set('vhDamperF', -2); set('vhDamperR', 2); o.perfSame = perf() === p0;
  // 6. the parts
  o.parts = { modified: !isFactoryFit(vehicle), cost: vehicle.cost };
  set('vhDamperF', 0); set('vhDamperR', 0); o.parts.base = vehicle.cost; set('vhDamperR', 2); o.parts.one = vehicle.cost;
  const saved = serializeBuild('t', ''); load('Golf GTI (Mk7'); applyBuild(saved);
  o.parts.saved = { r: document.getElementById('vhDamperR').value, damperR: vehicle.damperR };
  const old = JSON.parse(JSON.stringify(saved)); if (old.vehicle) { delete old.vehicle.damperF; delete old.vehicle.damperR; }
  applyBuild(old); o.parts.old = { f: document.getElementById('vhDamperF').value, r: document.getElementById('vhDamperR').value, zeta: vehicle.zetaF };
  set('vhDamperF', 1); document.getElementById('btnRefit').click();
  o.parts.refit = document.getElementById('vhDamperF').value;
  // 7. the words
  setTab('vehicle'); updateVehicleSummary();
  o.summary = document.getElementById('vehicleSummary') ? document.getElementById('vehicleSummary').innerText : '';
  applyLang('el'); updateVehicleSummary(); setTab('guide'); showGuide('dampers');
  o.el = { summary: document.getElementById('vehicleSummary') ? document.getElementById('vehicleSummary').innerText : '', label: document.querySelector('label[for="vhDamperF"]').textContent,
    guide: document.querySelector('#gp-dampers .guide-title').textContent };
  applyLang('en'); showGuide(null);
  return o;
});
await browser.close();

const f = (x, d = 2) => (+x).toFixed(d), pc = x => f((x - 1) * 100, 3) + '%';
console.log(`== quarter car: ${r.q.kit} kit at ${r.q.kitZeta} of critical; the car's ${f(r.q.zetaF)} / ${f(r.q.zetaR)}, a step x${f(r.q.step, 3)}; wheel hop ${f(r.q.hop, 1)} Hz ==`);
if (Math.abs(r.q.zetaF - r.q.kitZeta) > 0.005 || Math.abs(r.q.zetaR - r.q.kitZeta) > 0.005) fails.push('the dampers are not at the kit\'s ratio at STANDARD');
if (Math.abs(r.q.step - 1.3) > 0.005) fails.push(`a damper step is x${f(r.q.step, 3)}, not 1.3`);
if (!(r.q.hop > 10 && r.q.hop < 16)) fails.push(`wheel hop at ${f(r.q.hop, 1)} Hz, outside a road car's 10-16`);
const s4 = r.scale.b / r.scale.a, s4v = r.scale.c / r.scale.a;
console.log(`== the swing: ${f(r.scale.a, 0)} N; 4x rougher x${f(s4, 3)}, 4x faster x${f(s4v, 3)} (both should be x2) ==`);
if (Math.abs(s4 - 2) > 0.001 || Math.abs(s4v - 2) > 0.001) fails.push('the load swing does not grow as the root of roughness times speed');
console.log('== against damping: ' + r.sweep.map(s => `${s.z}: swing ${f(s.F, 0)}, ride ${f(s.A, 1)}`).join(' · ') + ' ==');
const iMin = r.sweep.reduce((b, s, i, a) => s.F < a[b].F ? i : b, 0);
if (!(r.sweep[iMin].z >= 0.3 && r.sweep[iMin].z <= 0.8)) fails.push(`the swing is least at ${r.sweep[iMin].z} of critical, not near half`);
if (!(r.sweep[0].F > r.sweep[iMin].F * 1.3)) fails.push('dampers far too soft do not let the load swing much more');
if (!(r.sweep[r.sweep.length - 1].F > r.sweep[iMin].F)) fails.push('dampers too stiff do not swing the load more again');
if (!r.sweep.slice(2).every((s, i, a) => i === 0 || s.A > a[i - 1].A)) fails.push('the ride does not get harsher as the dampers stiffen past 0.3');
console.log(`== springs 1.3x the frequency, same dampers: swing ${f(r.springs.soft, 0)} -> ${f(r.springs.stiff, 0)} ==`);
if (!(r.springs.stiff > r.springs.soft)) fails.push('stiffer springs do not swing the tyres\' load more');
console.log('== grip kept at a swing of 0 / 0.1 / 0.2 / 0.4 / 0.8 / 1.5 / 3: ' + r.grip.map(g => f(g, 4)).join(' / ') + ' ==');
if (r.grip[0] !== 1) fails.push('no swing does not keep all the grip');
if (!r.grip.every((g, i, a) => i === 0 || g < a[i - 1])) fails.push('the grip kept does not fall as the swing grows');
// with the mean load kept, load sensitivity alone takes a wheel that is mostly in the air down to ~0.9 (0.5 x 2^0.85)
if (!(r.grip[1] > 0.998 && r.grip[3] < 0.995 && r.grip[6] > 0.85 && r.grip[6] < 0.95)) fails.push('the grip kept is out of scale: ' + r.grip.map(g => f(g, 4)).join(','));
const L = r.lap;
console.log(`== laps: Riverside smooth ${f(L.mixedSmooth, 3)} -> its road (${L.roads.mixed}) ${f(L.mixed, 3)} (${pc(L.mixed / L.mixedSmooth)}); Nordschleife smooth ${f(L.nordSmooth, 3)} -> its road (${L.roads.nord}) ${f(L.nord, 3)} (${pc(L.nord / L.nordSmooth)}); dampers far too soft ${f(L.nordLoose, 3)} against the kit's ${f(L.nordKit, 3)} ==`);
console.log(`   roads: ${JSON.stringify(L.roads)}`);
if (!(L.mixed >= L.mixedSmooth && L.nord > L.nordSmooth)) fails.push('a road with bumps is not slower than a smooth one');
if (!(L.nord / L.nordSmooth > L.mixed / L.mixedSmooth)) fails.push('the Nordschleife\'s road does not cost more than a GP circuit\'s');
if (!(L.nord / L.nordSmooth < 1.01)) fails.push('the road costs more than 1% of a lap: out of scale for this mechanism');
if (!(L.nordLoose > L.nordKit)) fails.push('dampers far too soft are not slower on the Nordschleife');
if (L.roads.nord !== 'road' || L.roads.cota !== 'bumpy' || L.roads.sakhir !== 'smooth') fails.push('the circuits\' roads are not as labelled');
console.log(`== the 0-100, braking and skidpad with the dampers changed: ${r.perfSame ? 'unchanged' : 'MOVED'} ==`);
if (!r.perfSame) fails.push('the dampers move the performance tests, which run on a smooth surface');
console.log(`== parts: ${JSON.stringify(r.parts)} ==`);
if (!r.parts.modified) fails.push('dampers off STANDARD do not make the car (modified)');
if (r.parts.one - r.parts.base !== 350) fails.push(`one axle's dampers off STANDARD cost ${r.parts.one - r.parts.base}, not 350`);
if (r.parts.saved.r !== '2' || r.parts.saved.damperR !== 2) fails.push('a save does not keep the dampers');
if (r.parts.old.f !== '0' || r.parts.old.r !== '0') fails.push('a save from before build 215 does not get the kit\'s dampers');
if (r.parts.refit !== '0') fails.push('REFIT does not put the dampers back');
console.log(`== summary: ${(r.summary.match(/Dampers[^\n]*/) || [''])[0]} ==`);
console.log(`== Greek: ${r.el.label} · ${r.el.guide} · ${(r.el.summary.match(/Αμορτισέρ[^\n]*/) || [''])[0]} ==`);
if (!/Dampers 0\.\d\d \/ 0\.\d\d of critical .*wheel hop \d+ Hz .*ride \d\.\d\d m\/s²/.test(r.summary)) fails.push('the summary does not show the damping, the wheel hop and the ride');
if (!/ΑΜΟΡΤΙΣΕΡ/.test(r.el.label) || !/Αμορτισέρ/.test(r.el.guide) || !/Αμορτισέρ/.test(r.el.summary)) fails.push('the dampers are not in Greek');

if (errors.length) console.log('ERRORS:\n  ' + errors.join('\n  '));
if (fails.length) console.log('\nFAIL:\n  ' + fails.join('\n  '));
else console.log('\nOK: each axle is a quarter car on its circuit\'s road; the tyres\' load swing costs grip, least near half of critical damping, and only on the lap.');
process.exit(fails.length || errors.length ? 1 : 0);
