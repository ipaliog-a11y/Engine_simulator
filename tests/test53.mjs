// The diesel, from its fuel: combustion time, wall heat, turbine temperature, gross IMEP.
//
// WHY THIS EXISTS. Until build 88 a diesel took its torque from AIR times a constant fitted on spark
// engines, ran at lambda 1.02-1.05 to make a real engine's torque from that, and carried the fitted VE
// bell to make its top end fall. Its BSFC read 120-160 g/kWh against a real 200-230, and its exhaust
// temperature (which assumed a realistic lambda 1.35) never agreed with the mixture it burned.
//
// Every check here is either a structural property the physics must have, or a published figure for
// real engines — not a number this model produced and was then pinned to.
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
  const load = nm => { applyEngineToForm(Object.assign({}, DEFAULT_ENGINE, PRESETS.find(p => p.name === nm).engine)); buildEngine(); };
  const out = {};
  // 1. who still carries the fitted bell
  out.bell = PRESETS.map(p => { load(p.name); return { n: p.name, ci: !!engine.ci, ports: !!engine.ports, bell: engine.veBell }; });

  // 2. the burn: 1 at the reference, falling with rpm, and absent on a spark engine
  load('2.0 Turbo Diesel I4');
  out.burn = [1000, 2000, 3000, 4000, 4800].map(n => +burnPhasing(n).toFixed(4));
  load('1.6 Sport NA I4');
  out.burnSI = [1000, 4000, 7000].map(n => burnPhasing(n));

  // 3-5. on the 2.0 TDI at full load
  load('2.0 Turbo Diesel I4');
  engine.afrMode = 'fixed'; Object.assign(state, DYNO_STD, { systemVoltage: 14 });
  state.afr = engine.stoichAFR * SMOKE_LAMBDA_CI;
  const pts = [];
  for (let n = 1200; n <= engine.redline; n += 200) {
    const map = wotMapAt(n), lam = curAFR(n, map) / engine.stoichAFR;
    pts.push({ n, lam, egt: exhaustGasT(1, n, lam), bsfc: steadyBSFC(n, map).bsfc });
  }
  out.pts = pts;
  out.limit = VANE_T_LIMIT; out.smoke = SMOKE_LAMBDA_CI;
  // 6. torque follows fuel: leaner is less torque, but more torque per gram
  const tqAt = lam => { state.afr = engine.stoichAFR * lam; return calcAtRpm(2000).torque; };
  const bsAt = lam => { state.afr = engine.stoichAFR * lam; return steadyBSFC(2000, wotMapAt(2000)).bsfc; };
  out.fuel = { tq12: tqAt(1.2), tq16: tqAt(1.6), tq20: tqAt(2.0), bs12: bsAt(1.2), bs16: bsAt(1.6) };
  // 7. gas exchange is signed for the diesel: boost above back-pressure is work given back
  const map = wotMapAt(1800); engine.boostNow = map;
  const pExh = 1 + backPressureBar(1800, egtAt(1800, map));
  out.pump = { pumping: pumpingMEP(1800, map), pExh, map };
  return out;
});

console.log('== who carries the fitted VE bell ==');
for (const b of r.bell) {
  const want = b.ports;
  if (b.bell !== want) fails.push(`${b.n}: veBell is ${b.bell}, expected ${want} (only ported engines keep it)`);
}
console.log(`  bell kept on: ${r.bell.filter(b => b.bell).map(b => b.n).join(', ')}`);

console.log('\n== the diesel burn takes a fixed time ==');
console.log(`  phasing at 1000/2000/3000/4000/4800 rpm: ${r.burn.join(' ')}`);
if (Math.abs(r.burn[1] - 1) > 1e-3) fails.push(`burn phasing should be 1 at its 2000 rpm reference, is ${r.burn[1]}`);
for (let i = 1; i < r.burn.length; i++)
  if (!(r.burn[i] < r.burn[i - 1])) fails.push('a fixed-time burn must cost more as rpm rises');
if (!(r.burn[4] > 0.6 && r.burn[4] < 0.95)) fails.push(`burn phasing at 4800 rpm ${r.burn[4]} is outside a believable 0.6-0.95`);
if (r.burnSI.some(x => x !== 1)) fails.push('a spark engine has a turbulent flame: its burn scales with rpm and carries no time penalty');

console.log('\n== at full load: the ECU holds the turbine at its limit, and the smoke limit below it ==');
for (const p of r.pts) console.log(`  ${String(p.n).padStart(4)} rpm  λ${p.lam.toFixed(2)}  EGT ${Math.round(p.egt - 273)} C  BSFC ${Math.round(p.bsfc)} g/kWh`);
const over = r.pts.filter(p => p.egt > r.limit + 1);
if (over.length) fails.push(`full-load exhaust above the ${r.limit} K vane limit at ${over.map(p => p.n).join(', ')} rpm`);
if (r.pts.some(p => p.lam < r.smoke - 1e-9)) fails.push('a diesel was fuelled richer than its smoke limit');
if (!(r.pts[0].lam - r.smoke < 1e-6)) fails.push('at low rpm the smoke limit, not temperature, should set the fuel');
if (!(r.pts[r.pts.length - 1].lam > r.smoke + 0.01)) fails.push('near the redline the turbine-temperature floor should be leaning the engine out');
// Published: a production common-rail diesel at full load near peak torque runs 200-215 g/kWh.
const pt2000 = r.pts.find(p => p.n === 2000);
console.log(`  full-load BSFC at 2000 rpm: ${Math.round(pt2000.bsfc)} g/kWh (real 200-215)`);
if (!(pt2000.bsfc > 190 && pt2000.bsfc < 225)) fails.push(`full-load BSFC at 2000 rpm ${Math.round(pt2000.bsfc)} g/kWh — real engines run 200-215`);

console.log('\n== torque is fuel ==');
const f = r.fuel;
console.log(`  2000 rpm: λ1.2 ${f.tq12.toFixed(0)} Nm  λ1.6 ${f.tq16.toFixed(0)} Nm  λ2.0 ${f.tq20.toFixed(0)} Nm · BSFC λ1.2 ${Math.round(f.bs12)}  λ1.6 ${Math.round(f.bs16)}`);
if (!(f.tq12 > f.tq16 && f.tq16 > f.tq20)) fails.push('less fuel for the same air must make less torque');
if (!(f.bs16 < f.bs12)) fails.push('a leaner diesel burns its fuel more efficiently (fuel-air cycle)');

console.log('\n== gas exchange is signed ==');
console.log(`  1800 rpm: intake ${r.pump.map.toFixed(2)} bar, exhaust ${r.pump.pExh.toFixed(2)} bar → PMEP ${r.pump.pumping.toFixed(3)} bar`);
if (Math.abs(r.pump.pumping - (r.pump.pExh - Math.max(1, r.pump.map))) > 1e-6)
  fails.push('a boosted diesel pumping loop should be p_exh - p_int');

if (errors.length) fails.push(...errors);
console.log(fails.length ? '\nFAIL:\n  ' + fails.join('\n  ') : '\nPASS');
await browser.close();
process.exit(fails.length ? 1 : 0);
