import { chromium } from './pw.mjs';
import { fileURLToPath, pathToFileURL } from 'url';
import path from 'path';
const repo = fileURLToPath(new URL('..', import.meta.url));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 950 } });
const errors = [];
page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
await page.goto(pathToFileURL(path.join(repo, 'index.html')).href, { waitUntil: 'networkidle' });
await page.waitForTimeout(500);
const fails = [];
const fm = s => { const m = Math.floor(s / 60); return `${m}:${(s - m * 60).toFixed(2).padStart(5, '0')}`; };

// 1. Every track objective is REACHABLE by a real build
console.log('== track objectives are achievable ==');
const solve = await page.evaluate(() => {
  const spec = {
    clubsprint: ['2.0 Turbo Hot-Hatch I4', 'hatch', { vhTire: 'semi', vhSusp: 'coilover', vhWeight: 'sport' }],
    gppace: ['3.0 Turbo I6 (2JZ)', 'coupe', { vhTire: 'slick', vhAeroF: 'splitter', vhAeroR: 'wing', vhAeroFl: 'diffuser', vhWeight: 'race', vhSusp: 'race', vhGearbox: 'dct' }],
    greenhell: ['2.0 ITB NA Screamer I4', 'roadster', { vhTire: 'slick', vhAeroF: 'splitter', vhAeroR: 'wing', vhAeroFl: 'diffuser', vhWeight: 'race', vhSusp: 'race', vhDiff: 'clsd', vhGearbox: 'sequential' }],
    'laptime$': ['2.0 Turbo Hot-Hatch I4', 'hatch', { vhTire: 'semi', vhSusp: 'coilover', vhWeight: 'sport' }]
  };
  return CHALLENGES.filter(c => c.circuit).map(ch => {
    const sp = spec[ch.id];
    const pr = PRESETS.find(x => x.name === sp[0]);
    applyEngineToForm(Object.assign({}, DEFAULT_ENGINE, pr.engine)); buildEngine();
    applyChassisFit(sp[1]);
    Object.entries(sp[2]).forEach(([k, v]) => { const el = document.getElementById(k); if (el) el.value = v; });
    buildVehicle();
    activeChallenge = ch.id;
    const m = buildMetrics(ch), ev = evalChallenge(ch, m);
    const lapT = ch.targets.find(t => t.key === 'lap');
    return { id: ch.id, name: ch.name, circuit: TRACKS[ch.circuit].label, lap: m.lap, target: lapT.t,
      margin: +(lapT.t - m.lap).toFixed(2), cost: m.buildCost, budget: ch.budget || 0, pass: ev.pass };
  });
});
solve.forEach(x => console.log(`  ${x.name.padEnd(24)} ${x.circuit.padEnd(14)} ${fm(x.lap)} / ${fm(x.target)}  margin ${x.margin}s  $${Math.round(x.cost / 1000)}k${x.budget ? '/$' + Math.round(x.budget / 1000) + 'k' : ''}  ${x.pass ? 'PASS' : 'FAIL'}`));
solve.forEach(x => {
  if (!x.pass) fails.push(`${x.name}: not achievable by its reference build`);
  if (x.margin < 0.5) fails.push(`${x.name}: only ${x.margin}s of margin — too knife-edge`);
  if (x.margin > 25) fails.push(`${x.name}: ${x.margin}s of margin — target is trivial`);
});

// 2. ...and NOT passed by a weak build (the objective has to mean something)
console.log('\n== a weak build must fail them ==');
const weak = await page.evaluate(() => {
  return CHALLENGES.filter(c => c.circuit).map(ch => {
    const pr = PRESETS.find(x => x.name === '1.0 Kei Turbo I3');
    applyEngineToForm(Object.assign({}, DEFAULT_ENGINE, pr.engine)); buildEngine();
    applyChassisFit('kei'); buildVehicle();
    activeChallenge = ch.id;
    const m = buildMetrics(ch);
    return { name: ch.name, lap: m.lap, pass: evalChallenge(ch, m).pass };
  });
});
weak.forEach(x => console.log(`  kei car on ${x.name.padEnd(24)} ${fm(x.lap)}  ${x.pass ? 'PASS (!)' : 'fails, as it should'}`));
weak.forEach(x => { if (x.pass) fails.push(`${x.name}: a 112 hp kei car passes it`); });

// 3. Budget covers the WHOLE car for track objectives, engine only for engine objectives
const bud = await page.evaluate(() => {
  const pr = PRESETS.find(x => x.name === '6.5 V12 NA Supercar');
  applyEngineToForm(Object.assign({}, DEFAULT_ENGINE, pr.engine)); buildEngine();
  applyChassisFit('hyper'); buildVehicle();
  const track = CHALLENGES.find(c => c.id === 'gppace'), eng = CHALLENGES.find(c => c.id === 'sleeper');
  const mt = buildMetrics(track), me = buildMetrics(eng);
  return { engineCost: me.cost, carCost: mt.buildCost, trackCharges: evalChallenge(track, mt).cost, engCharges: evalChallenge(eng, me).cost };
});
console.log(`\nbudget scope: engine $${bud.engineCost} · whole car $${bud.carCost}`);
console.log(`  track objective charges $${bud.trackCharges} (car) · engine objective charges $${bud.engCharges} (engine)`);
if (bud.trackCharges !== bud.carCost) fails.push('track objective does not budget the whole car');
if (bud.engCharges !== bud.engineCost) fails.push('engine objective no longer budgets the engine only');

// 4. The engine GRADE must not move when only the car changes
const grade = await page.evaluate(() => {
  const pr = PRESETS.find(x => x.name === '3.0 Turbo I6 (2JZ)');
  applyEngineToForm(Object.assign({}, DEFAULT_ENGINE, pr.engine)); buildEngine();
  applyChassisFit('kei'); buildVehicle();
  const a = { grade: engine.score.grade, overall: engine.score.overall, lap: lapFor('mixed') };
  applyChassisFit('hyper'); buildVehicle();
  const b = { grade: engine.score.grade, overall: engine.score.overall, lap: lapFor('mixed') };
  return { a, b, same: a.grade === b.grade && a.overall === b.overall, lapMoved: a.lap !== b.lap };
});
console.log(`\nengine grade with a kei body ${grade.a.grade}(${grade.a.overall}) → hypercar body ${grade.b.grade}(${grade.b.overall})`);
console.log(`  grade unchanged: ${grade.same} · lap did change: ${grade.lapMoved} (${grade.a.lap.toFixed(1)}s → ${grade.b.lap.toFixed(1)}s)`);
if (!grade.same) fails.push('engine grade changed when only the vehicle changed');
if (!grade.lapMoved) fails.push('lap time did not respond to the vehicle');

// 5. Lap caching: repeated calls must not re-solve
const perf = await page.evaluate(() => {
  const pr = PRESETS.find(x => x.name === '3.0 Turbo I6 (2JZ)');
  applyEngineToForm(Object.assign({}, DEFAULT_ENGINE, pr.engine)); buildEngine();
  applyChassisFit('coupe'); buildVehicle();
  lapScoreCache = { key: '', val: null };
  const t1 = performance.now(); lapFor('nord'); const cold = performance.now() - t1;
  const t2 = performance.now(); for (let i = 0; i < 500; i++) lapFor('nord'); const warm = (performance.now() - t2) / 500;
  buildVehicle();                       // a rebuild must invalidate
  const t3 = performance.now(); lapFor('nord'); const after = performance.now() - t3;
  return { cold: +cold.toFixed(1), warm: +warm.toFixed(4), after: +after.toFixed(1) };
});
console.log(`\nlap cache: cold ${perf.cold} ms · cached ${perf.warm} ms/call · after a rebuild ${perf.after} ms`);
if (perf.warm > 0.05) fails.push('lap result is not cached (dyno redraws 60x/s)');
if (perf.after < 1) fails.push('rebuilding the vehicle did not invalidate the lap cache');

// 6. UI: card shows the circuit, formats laps as times, and Greek works
await page.evaluate(() => { activeChallenge = 'greenhell'; document.getElementById('edChallenge').value = 'greenhell'; renderChallenge(); });
await page.waitForTimeout(200);
const ui = await page.evaluate(() => document.getElementById('challengeCard').textContent);
console.log('\ncard:', ui.replace(/\s+/g, ' ').slice(0, 150));
if (!/NORDSCHLEIFE/.test(ui)) fails.push('card does not name the circuit');
if (!/\d:\d\d\.\d\d/.test(ui)) fails.push('lap target not formatted as a time');
await page.evaluate(() => applyLang('el')); await page.waitForTimeout(200);
const el = await page.evaluate(() => ({ card: document.getElementById('challengeCard').textContent,
  opts: [...document.getElementById('edChallenge').options].map(o => o.textContent).join('|') }));
console.log('EL card:', el.card.replace(/\s+/g, ' ').slice(0, 90));
if (!/Ring|Επτά/.test(el.opts)) fails.push('new objectives not translated');
await page.evaluate(() => applyLang('en'));

// 7. Scorecard surfaces the lap
const sc = await page.evaluate(() => {
  const pr = PRESETS.find(x => x.name === '3.0 Turbo I6 (2JZ)');
  applyEngineToForm(Object.assign({}, DEFAULT_ENGINE, pr.engine)); buildEngine();
  applyChassisFit('coupe'); trackKey = 'mixed'; buildVehicle();
  updateDesignSummary();
  return document.getElementById('designSummary') ? document.getElementById('designSummary').textContent : scoreLapLine();
});
console.log('\nscorecard lap line:', String(sc).replace(/\s+/g, ' ').match(/Lap[^•]*•[^•]*/) ? String(sc).replace(/\s+/g, ' ').match(/Lap.{0,60}/)[0] : String(sc).slice(0, 80));
if (!/Lap/.test(String(sc))) fails.push('scorecard does not surface a lap time');

console.log('\nERRORS:', errors.length ? errors : 'none');
console.log(fails.length ? 'FAIL:\n  ' + fails.join('\n  ') : '\nPASS');
await browser.close();
process.exit(fails.length || errors.length ? 1 : 0);
