// WHY THIS EXISTS (build 307): spark retard heats the exhaust, and an ECU whose retard runs out enriches, then lowers
// the boost. What must hold:
//   · the exhaust takes the work a retarded spark does not do: EGT rises with retard, by no more than that lost work;
//   · egtAt, left to itself, reads the spark the ECU runs;
//   · an over-boosted, low-octane build that knocks at the furthest retard gets a richer mixture (never past lambda 0.78)
//     and a boost limit, and with them its AUTO sweep stays at the knock limit;
//   · with FIXED timing there is no knock control: no enrichment, no boost limit.
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

const r = await page.evaluate(() => {
  const load = (name, over) => {
    const pr = PRESETS.find(x => x.name === name);
    applyEngineToForm(Object.assign({}, DEFAULT_ENGINE, pr.engine, over || {})); buildEngine();
  };
  const out = {};
  // 1. the energy balance on a turbo four at full load
  load('2.0 Turbo Hot-Hatch I4');
  { const rpm = 4000, map = wotMapAt(rpm), lam = curAFR(rpm, map) / engine.stoichAFR;
    const T0 = egtAt(rpm, map, lam, 0), T15 = egtAt(rpm, map, lam, 15);
    const lost = grossEtaReleased(rpm, lam) * (1 - sparkPhaseFactor(15));
    out.bal = { T0, T15, dShare: exhaustHeatFrac(rpm, lam, 15) - exhaustHeatFrac(rpm, lam, 0), lost }; }
  // 2. the TwinAir retards ~16 deg at 1500 rpm: egtAt reads it
  load('Fiat 0.9 TwinAir turbo');
  { const rpm = 1500, map = wotMapAt(rpm), ret = mbtAdvance(rpm, map) - activeAdvance(rpm, map);
    out.twin = { ret, T: egtAt(rpm, map), Tmbt: egtAt(rpm, map, 0, 0), Tret: egtAt(rpm, map, 0, ret) }; }
  // 3. too much boost on too little octane
  // the 1.0 EcoBoost runs lambda 1 at full load (its exhaust needs no enrichment), so its map leaves room to enrich
  const hot = { compression: 14, boost_bar: 1.5, octane: 87, injector: 'port', tqLimit: 0 };
  load('Ford 1.0 EcoBoost (Fiesta 125)', hot);
  { const rows = [];let enr = null, worst = 0;
    for (let rpm = 1500; rpm <= engine.redline; rpm += 250) {
      const map = wotMapAt(rpm), base = baseFuelLambda(rpm, map), lam = curAFR(rpm, map) / engine.stoichAFR;
      const k = knockAt(rpm, map, activeAdvance(rpm, map));
      worst = Math.max(worst, k);
      if (lam < base - 1e-3 && (!enr || lam < enr.lam)) enr = { rpm, base, lam };
      rows.push({ rpm, boost: map - 1, cap: knockLimitBoost(rpm), lam, k });
    }
    out.hot = { table: !!engine.knockLimTable, enr, worst, rows, minLam: Math.min(...rows.map(x => x.lam)) }; }
  load('Ford 1.0 EcoBoost (Fiesta 125)', Object.assign({ timingMode: 'fixed', ignitionAdv: 20 }, hot));
  { const rpm = 3000, map = wotMapAt(rpm);
    out.fixed = { table: !!engine.knockLimTable, lam: curAFR(rpm, map) / engine.stoichAFR, base: baseFuelLambda(rpm, map) }; }
  return out;
});

const f = (x, d = 1) => Number(x).toFixed(d);
console.log(`== energy balance, 2.0 turbo at 4000 rpm: EGT ${f(r.bal.T0 - 273, 0)} C at best spark, ${f(r.bal.T15 - 273, 0)} C at 15 deg retard;` +
  ` exhaust share +${f(r.bal.dShare * 100, 2)}% of the heat, lost work ${f(r.bal.lost * 100, 2)}% ==`);
if (!(r.bal.T15 > r.bal.T0 + 10)) fails.push('15 degrees of retard does not heat the exhaust');
if (!(r.bal.dShare > 0.5 * r.bal.lost && r.bal.dShare <= r.bal.lost + 1e-9)) fails.push('the exhaust does not take the lost work (between half of it, the port taking some, and all of it)');
console.log(`== TwinAir 1500 rpm: ${f(r.twin.ret)} deg retard, EGT ${f(r.twin.Tmbt - 273, 0)} C at best spark, ${f(r.twin.T - 273, 0)} C as run ==`);
if (!(r.twin.ret > 5) || Math.abs(r.twin.T - r.twin.Tret) > 1e-6 || !(r.twin.T > r.twin.Tmbt)) fails.push('egtAt does not read the spark the ECU runs');
console.log('== 1.0 EcoBoost at CR 14, 1.5 bar, 87 RON, port injection, AUTO ==');
for (const x of r.hot.rows) console.log(`  ${x.rpm} rpm  boost ${f(x.boost, 2)} (limit ${x.cap > 9 ? '-' : f(x.cap, 2)})  lambda ${f(x.lam, 3)}  knock ${f(x.k)}`);
if (!r.hot.table) fails.push('no knock limit on boost for a build that knocks at the furthest retard');
if (!r.hot.enr) fails.push('the ECU did not enrich past its fuel map against knock');
if (r.hot.minLam < 0.78 - 1e-3) fails.push('enriched past lambda 0.78');
if (r.hot.worst > 40.5) fails.push(`AUTO sweep knocks past the limit (${f(r.hot.worst)})`);
console.log(`== same build, FIXED 20 deg: boost limit ${r.fixed.table ? 'yes' : 'none'}, lambda ${f(r.fixed.lam, 3)} (map ${f(r.fixed.base, 3)}) ==`);
if (r.fixed.table || Math.abs(r.fixed.lam - r.fixed.base) > 1e-3) fails.push('FIXED timing still gets knock control');

await browser.close();
if (errors.length) console.log('ERRORS:\n  ' + errors.join('\n  '));
if (fails.length) console.log('\nFAIL:\n  ' + fails.join('\n  '));
else console.log('\nOK: retard heats the exhaust; past the furthest retard the ECU enriches, then lowers the boost.');
process.exit(fails.length || errors.length ? 1 : 0);
