// Cooled EGR (build 204).
//
// WHY THIS EXISTS. The hybrids' engines still burned more than their makers' figures once the fuel map ran them at
// stoichiometric (build 202): the Prius 4.65 L/100 km on the WLTP cycle against Toyota's 4.14. Both run cooled EGR:
// Toyota recirculates up to 25% on the 2016 2ZR-FXE and runs it at maximum output (SAE 2016-01-0684; Motor-Fan), Hyundai
// "over 20%" on the Kappa 1.6 GDi hybrid. EGR is an engine option now (NONE / COOLED, OFF AT FULL LOAD / COOLED, TO FULL
// LOAD), and what it does is derived: the trapped charge is that much exhaust, so the same torque takes the throttle
// wider open (less pumping), and the walls take less of the fuel's heat (the wall trace, diluted). What must hold:
//   · the ECU's schedule: none at light load, the most from mid load, held to full load or taken out there;
//   · held to full load, the 2ZR-FXE makes its published power (it made 131 hp as built without it: Toyota's 96.6);
//   · dilution lowers the walls' share of the heat; the same part-load torque is made at a higher manifold pressure,
//     with less pumping work;
//   · the Prius's WLTP within 5% of Toyota's; the Ioniq's within Hyundai's 4.4-5.2;
//   · an engine without EGR is untouched (the Prius's engine with NONE is the build-203 engine);
//   · the form: offered on a spark engine, not on a diesel, in both languages.
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
  const eng = (n, mod) => { const p = FACTORY_ENGINES.find(e => e.name.includes(n)); applyBuild({ engine: Object.assign({}, DEFAULT_ENGINE, p.engine, mod || {}), tune: Object.assign({}, STD_TUNE), name: p.name }); return p; };
  // the schedule, on the Prius's engine: load from light to full at 3000 rpm
  const p = eng('2ZR-FXE'), w = wotMapAt(3000);
  o.sched = [0.2, 0.4, 0.5, 0.7, 0.9, 1.0].map(f => egrRate(3000, f * w));
  o.prius = { hp: engine.score.peakHP, real: p.real.hp, egrWall: engine.egrWall, egrMax: engine.egrMax };
  // the same torque at part load: the manifold pressure that makes it, and the pumping there, with and without
  Object.assign(state, DYNO_STD);
  const mapFor = T => { let lo = 0.2, hi = w; for (let k = 0; k < 40; k++) { const m = (lo + hi) / 2; if (calcAtRpm(2000, m).torque < T) lo = m; else hi = m; } return (lo + hi) / 2; };
  const T = 60, mE = mapFor(T); o.part = { mapEgr: mE, pmpEgr: pumpFrictionMEP(2000, mE, 1), bsfcEgr: steadyBSFC(2000, mE).bsfc };
  eng('2ZR-FXE', { egr: 'none' }); Object.assign(state, DYNO_STD);
  const mN = mapFor(T); o.part.mapNone = mN; o.part.pmpNone = pumpFrictionMEP(2000, mN, 1); o.part.bsfcNone = steadyBSFC(2000, mN).bsfc;
  o.none = { hp: engine.score.peakHP, egrMax: engine.egrMax, rate: egrRate(3000, 0.7 * w) };
  // the Kappa: taken out at full load
  const k = eng('Kappa'); const wk = wotMapAt(3000);
  o.kappa = { egr: k.engine.egr, full: egrRate(3000, wk), mid: egrRate(3000, 0.7 * wk), hp: engine.score.peakHP, real: k.real.hp };
  // the cycles
  o.cyc = {};
  for (const n of ['Prius', 'Ioniq Hybrid']) { loadVehiclePreset(FACTORY_CARS.find(x => x.name.includes(n))); engine._hcyc = null; o.cyc[n] = hybridCycle(vehicle).l100; }
  // the form
  const g = id => document.getElementById(id);
  eng('Golf GTI'); setTab('design'); o.form = { petrol: !g('edEgr').disabled, opts: [...g('edEgr').options].map(x => x.value) };
  eng('TDI'); o.form.diesel = g('edEgr').disabled;
  applyLang('el'); o.form.el = [...g('edEgr').options].map(x => x.textContent); applyLang('en');
  return o;
});
await browser.close();

const f = (x, d = 2) => (+x).toFixed(d), pct = (a, b) => (a / b - 1) * 100;
console.log(`== the ECU's EGR at 3000 rpm, 20/40/50/70/90/100% load: ${r.sched.map(x => f(x * 100, 0) + '%').join(' / ')}; the Kappa's at 70% and full load ${f(r.kappa.mid * 100, 0)}% / ${f(r.kappa.full * 100, 0)}% ==`);
const [s20, s40, s50, s70, s90, s100] = r.sched;
if (s20 !== 0) fails.push('EGR at light load, where the burn cannot take it');
if (!(s40 > 0 && s40 < s50) || Math.abs(s50 - 0.25) > 1e-9 || Math.abs(s70 - 0.25) > 1e-9) fails.push('the EGR does not rise to its 25% by mid load');
if (Math.abs(s100 - 0.25) > 1e-9) fails.push('COOLED, TO FULL LOAD does not hold it at full load (Toyota runs it at maximum output)');
if (r.kappa.egr !== 'cooled' || r.kappa.full !== 0 || Math.abs(r.kappa.mid - 0.25) > 1e-9) fails.push('COOLED, OFF AT FULL LOAD does not take it out at full load');
console.log(`== the 2ZR-FXE: ${r.prius.hp} hp with its EGR (Toyota ${r.prius.real}, ${f(pct(r.prius.hp, r.prius.real), 1)}%); without, ${r.none.hp} hp; the walls' share ${f(r.prius.egrWall * 100, 2)} points at 25% ==`);
if (Math.abs(pct(r.prius.hp, r.prius.real)) > 5) fails.push(`the 2ZR-FXE makes ${r.prius.hp} hp, not Toyota's ${r.prius.real}`);
if (!(r.none.hp > r.prius.hp * 1.2) || r.none.egrMax !== 0 || r.none.rate !== 0) fails.push('an engine without EGR is not the engine it was');
if (!(r.prius.egrWall < -0.005)) fails.push('dilution does not take heat off the walls');
const P = r.part;
console.log(`== 60 Nm at 2000 rpm: ${f(P.mapNone)} bar without, ${f(P.mapEgr)} bar with EGR; pumping and friction ${f(P.pmpNone)} -> ${f(P.pmpEgr)} bar; BSFC ${f(P.bsfcNone, 0)} -> ${f(P.bsfcEgr, 0)} g/kWh ==`);
if (!(P.mapEgr > P.mapNone * 1.05)) fails.push('the same torque is not made with the throttle wider open');
if (!(P.pmpEgr < P.pmpNone)) fails.push('the wider throttle does not pump less');
if (!(P.bsfcEgr < P.bsfcNone)) fails.push('EGR does not lower the part-load fuel per kWh');
console.log(`== WLTP: Prius ${f(r.cyc['Prius'])} L/100 km (Toyota 4.14, ${f(pct(r.cyc['Prius'], 4.14), 1)}%), Ioniq ${f(r.cyc['Ioniq Hybrid'])} (Hyundai 4.4-5.2) ==`);
if (Math.abs(pct(r.cyc['Prius'], 4.14)) > 5) fails.push(`the Prius burns ${f(r.cyc['Prius'])} L/100 km, not within 5% of Toyota's 4.14`);
if (!(r.cyc['Ioniq Hybrid'] >= 4.4 && r.cyc['Ioniq Hybrid'] <= 5.2)) fails.push(`the Ioniq burns ${f(r.cyc['Ioniq Hybrid'])} L/100 km, outside Hyundai's 4.4-5.2`);
console.log(`== form: petrol ${r.form.petrol}, diesel disabled ${r.form.diesel}, ${r.form.opts.join(' / ')}; Greek ${r.form.el.join(' / ')} ==`);
if (!r.form.petrol || !r.form.diesel || r.form.opts.join() !== 'none,cooled,cooled-full') fails.push('the EGR choice is not on the spark engines\' form');
if (r.form.el.some(t => /COOLED/.test(t))) fails.push('the EGR choice is not in Greek');

if (errors.length) console.log('ERRORS:\n  ' + errors.join('\n  '));
if (fails.length) console.log('\nFAIL:\n  ' + fails.join('\n  '));
else console.log('\nOK: cooled EGR dilutes the charge as the ECU schedules it, the throttle opens and the walls cool, and the Prius makes its power and burns its figure.');
process.exit(fails.length || errors.length ? 1 : 0);
