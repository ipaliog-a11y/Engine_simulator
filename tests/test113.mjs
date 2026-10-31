// Racing energy: a plug-in hybrid's own charge spent over a race, and a racing class's energy limits a lap (build 196,
// step 3.5c of plans/hybrid-electric/; decision 15's second half).
//
// WHY THIS EXISTS. The HYBRID TUNE gains DEPLOY LIMIT and HARVEST LIMIT (MJ a lap, a racing class's rules): the lap's
// charge balance never spends more than the deploy limit and never counts more than the harvest limit back. A plug-in
// starts a race on a full pack and spends its own charge on top of what braking returns (src/js/hybrid-race.js): a second
// pace grid of depleting laps, a share between the two chosen so the charge lasts the distance, chosen again at every
// crossing of the line. What must hold:
//   · the deploy limit caps what a lap deploys, the harvest limit what it takes back, each costs lap time, both are saved;
//   · a short race spends the charge flat out (share 1), a long one spreads it so it lasts: the pack ends the race near
//     the charge it sustains, never below; the plug-in is quicker than the same car charge-sustaining, and qualifies on a
//     full pack;
//   · a car that is not a plug-in has no plug-in race (its laps are the charge-sustaining ones); the RACE tab shows a
//     plug-in's pack and share.
import { chromium } from './pw.mjs';
import { fileURLToPath, pathToFileURL } from 'url';
import path from 'path';
const repo = fileURLToPath(new URL('..', import.meta.url));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1300, height: 1000 } });
const errors = [];
page.on('console', m => { if (m.type() === 'error' && !/ERR_FILE_NOT_FOUND/.test(m.text())) errors.push('console: ' + m.text()); });
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
await page.goto(pathToFileURL(path.join(repo, 'index.html')).href, { waitUntil: 'networkidle' });
await page.waitForTimeout(400);
const fails = [];

const r = await page.evaluate(() => {
  const g = id => document.getElementById(id), o = {};
  loadVehiclePreset(HYB_VEHICLE_PRESETS.find(x => /918/.test(x.name))); setTab('design');
  const lap = () => { const L = simulateLap('tech'); return { t: L.lap, dep: L.hy.deployKJ, reg: L.hy.regenKJ, raw: L.hy.rawRegenKJ }; };
  o.free = lap();
  g('edHyDeployMJ').value = 0.6; buildEngine(); o.dep = lap(); o.depSaved = serializeBuild('x', '').engine.hyTune.deployMJ;
  g('edHyDeployMJ').value = 0; g('edHyHarvestMJ').value = 0.5; buildEngine(); o.harv = lap(); o.harvSaved = serializeBuild('x', '').engine.hyTune.harvestMJ;
  g('edHyHarvestMJ').value = 0; buildEngine();
  const plug = { name: '918', build: serializeBuild('918', '') };
  g('edHyPlug').value = 'no'; buildEngine(); buildVehicle();
  const cs = { name: '918 CS', build: serializeBuild('918 CS', '') };
  const M = raceCarModel(plug, 'tech'), Mc = raceCarModel(cs, 'tech');
  o.M = { qual: M.qual, qualCS: Mc.qual, D: M.hy.D, usable: M.hy.usable, csHy: !!Mc.hy };
  const run = (Mx, laps) => { const R = raceInit([Mx], { track: 'tech', laps, seed: 5, strategy: 'auto', air: 22, weather: 'dry' }); raceRun(R);
    const c = R.cars[0], L = c.laps; return { R, t: c.finishT, x0: c.plan.hyX, eEnd: L[L.length - 1].hyE, xs: L.map(l => l.hyX), soc: M.hy ? hybRaceSoc(M, L[L.length - 1].hyE) : null }; };
  const s5 = run(M, 5), l30 = run(M, 30), c30 = run(Mc, 30);
  o.short = { t: s5.t, x0: s5.x0, eEnd: s5.eEnd, xs: s5.xs };
  o.long = { t: l30.t, x0: l30.x0, eEnd: l30.eEnd, soc: l30.soc, xmax: Math.max(...l30.xs) };
  o.cs = { t: c30.t };
  raceUI.run = s5.R; raceUI.phase = 'live'; raceUI.t = s5.R.t; setTab('race'); renderRacePanel(true);
  o.tele = g('raceTele').textContent;
  raceUI.run = null; raceUI.phase = 'setup';
  applyBuild({ engine: Object.assign({}, DEFAULT_ENGINE), tune: Object.assign({}, STD_TUNE) });
  return o;
});
const f = (x, d = 1) => (+x).toFixed(d);

console.log(`== 918 lap (tech): free ${f(r.free.t, 2)} s, ${f(r.free.dep, 0)} kJ deployed; DEPLOY LIMIT 0.6 MJ: ${f(r.dep.t, 2)} s, ${f(r.dep.dep, 0)} kJ (saved ${r.depSaved}); ` +
  `HARVEST LIMIT 0.5 MJ: ${f(r.harv.t, 2)} s, ${f(r.harv.reg, 0)} kJ back of ${f(r.harv.raw, 0)} (saved ${r.harvSaved}) ==`);
if (!(r.dep.dep <= 600 + 1e-6 && r.dep.t > r.free.t && r.depSaved === 0.6)) fails.push('the deploy limit does not cap what a lap deploys');
if (!(r.harv.reg <= 500 + 1e-6 && r.harv.raw > 500 && r.harv.dep <= r.harv.reg * 1.002 + 0.1 && r.harv.t > r.free.t && r.harvSaved === 0.5)) fails.push('the harvest limit does not cap what a lap takes back');
const M = r.M;
console.log(`== plug-in race model: ${f(M.usable / 3600, 2)} kWh of its own charge, ${f(M.D, 0)} kJ a depleting lap; qualifies ${f(M.qual, 2)} s against ${f(M.qualCS, 2)} charge-sustaining; not plugged in: plug-in race ${M.csHy} ==`);
if (!(M.D > 0 && M.usable > 0 && M.qual < M.qualCS) || M.csHy) fails.push('the plug-in race model is missing, or a car that is not a plug-in has one');
console.log(`== 5 laps: share ${f(r.short.x0, 2)}, ${f(r.short.eEnd, 0)} kJ left; 30 laps: share ${f(r.long.x0, 2)} (up to ${f(r.long.xmax, 2)}), ${f(r.long.eEnd, 0)} kJ left (pack ${f(r.long.soc, 1)}%), ` +
  `${f(r.long.t, 2)} s against ${f(r.cs.t, 2)} charge-sustaining ==`);
if (!(r.short.x0 === 1 && r.short.xs.every(x => x === 1) && r.short.eEnd > 0)) fails.push('a short race does not spend the plug-in\'s charge flat out');
if (!(r.long.x0 > 0.1 && r.long.x0 < 1 && r.long.eEnd >= 0 && r.long.eEnd < M.usable * 0.05)) fails.push('a long race does not spread the plug-in\'s charge over the distance');
if (!(r.long.t < r.cs.t)) fails.push('the plug-in is not quicker than the same car charge-sustaining');
console.log(`== RACE tab: "${r.tele.match(/PACK[^•]*•[^%]*%/) || ''}" ==`);
if (!/PACK \d+%/.test(r.tele) || !/PLUG-IN DEPLOY \d+%/.test(r.tele)) fails.push('the RACE tab does not show a plug-in\'s pack and share');

await browser.close();
if (errors.length) console.log('ERRORS:\n  ' + errors.join('\n  '));
if (fails.length) console.log('\nFAIL:\n  ' + fails.join('\n  '));
else console.log('\nOK: a racing class\'s energy limits hold a lap, and a plug-in spends its own charge over the race.');
process.exit(fails.length || errors.length ? 1 : 0);
