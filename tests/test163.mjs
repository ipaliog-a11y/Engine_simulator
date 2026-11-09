// The intercooler as a part (build 255); its effectiveness from its fins, its drop on the compressor (build 256).
//
// WHY THIS EXISTS. The two factory cores were a quoted effectiveness, a pipe length and a volume. The PARTS page now
// designs a core by its face, depth, fins and pipe, and the charge path reads its own volume and an effectiveness
// scaled from its surfaces. What must hold:
//   · a factory core written down as a part is that core, exactly, on three turbo engines (the fingerprint is identical);
//   · a wider core cools better and drops more pressure; more fins cool better; a longer pipe holds more charge;
//   · the preview moves nothing; SAVE & FIT fits the core as previewed, as its class, and it travels with a build;
//   · an old build's boolean intercooler still loads as its factory core; an NA engine is told a core changes nothing;
//   · (256) no core carries a quoted effectiveness any more; a core cools better at a lower flow; the compressor makes up
//     the drop (the boost still reaches its target where it did, the compressor works to target + drop); a factory core
//     grows for an engine whose full flow is past its rating (the Ford GT's small core) and not for one within it.
import { chromium } from './pw.mjs';
import { fileURLToPath, pathToFileURL } from 'url';
import path from 'path';
const repo = fileURLToPath(new URL('..', import.meta.url));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors = [];
page.on('console', m => { if (m.type() === 'error' && !/ERR_FILE_NOT_FOUND/.test(m.text())) errors.push('console: ' + m.text()); });
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
await page.addInitScript(() => { try { localStorage.removeItem('pes.parts'); } catch (e) {} });
await page.goto(pathToFileURL(path.join(repo, 'index.html')).href, { waitUntil: 'networkidle' });
await page.waitForTimeout(400);
const fails = [];

const r = await page.evaluate(() => {
  const o = {};
  const load = n => loadVehiclePreset(FACTORY_CARS.find(p => p.name.includes(n)));
  const maxDiff = (a, b) => a.pts.reduce((m, x, i) => Math.max(m, Math.abs(x.tq - b.pts[i].tq) / a.peakTQ), 0);
  const json = x => JSON.stringify(x, (k, v) => ArrayBuffer.isView(v) ? Array.from(v) : v);
  o.fac = [];
  for (const car of ['Golf GTI (Mk7', 'Focus RS', 'Swift Sport']) {
    load(car);
    for (const k of ['small', 'large']) {
      const a = icReport(k), p = partFromFactory(k, 'intercooler'), b = icReport(p);
      o.fac.push({ car: vehicle.body.name, k, hp: a.peakHP, cls: icClass(p), d: maxDiff(a, b), de: Math.abs(a.eff - b.eff), dv: Math.abs(a.vol - b.vol) });
    }
  }
  // 256: derived effectiveness, the drop on the compressor, the factory core sized for its engine
  o.quoted = Object.values(INTERCOOLER).some(c => 'eff' in c);
  load('Golf GTI (Mk7');
  { const G = icGeom(engine), m = airFlowAt(engine.redline, engine.mapMax); o.flowEff = [icEps(G, m), icEps(G, m / 2)]; o.golfH = G.h;
    const rpm = 5000, tgt = 1 + boostTarget(rpm), dp = icDpBar(airFlowAt(rpm, tgt), tgt); o.dp = dp; o.hold = Math.abs(steadyBoost(rpm) + 1 - tgt);
    const sv = state.iat; state.iat = 25; const keep = icDpBar; o.tOut = [compOutletT(tgt, rpm)]; icDpBar = () => 0; o.tOut.push(compOutletT(tgt, rpm)); icDpBar = keep; state.iat = sv; }
  load('Ford GT (2005');
  o.gtH = icGeom(engine).h;
  load('Golf GTI (Mk7');
  const base = partFromFactory('large', 'intercooler'), R = x => icReport(Object.assign({}, base, x));
  o.w = [400, 600, 800].map(w => { const q = R({ w }); return { eff: q.eff, dp: q.dp.core }; });
  o.fpi = [10, 14, 20].map(fpi => R({ fpi }).eff);
  o.pipe = [1, 3, 5].map(pipe_m => R({ pipe_m }).vol);
  const before = { score: json(engine.score), pull: json(wotPull()) };
  partsUI.kind = 'intercooler'; setTab('parts'); previewPart('intercooler');
  o.still = before.score === json(engine.score) && before.pull === json(wotPull());
  o.guide = document.getElementById('pxGuide').innerText;
  const q = Object.assign({}, base, { name: 'TEST IC', w: 300, h: 120 });
  const pre = icReport(q);
  partsUI.edit.intercooler = Object.assign({}, q); partToEditor('intercooler', partsUI.edit.intercooler);
  document.getElementById('pxSaveFit').click();
  o.fit = { part: !!engine.icPart, cls: engine.intercooler, pull: json(wotPull().pts) === json(pre.pts),
    form: document.getElementById('edIntercooler').value === 'part:' + (engine.icPart && engine.icPart.id) };
  const saved = serializeBuild('t', '');
  partLib = []; persistParts(); fillPartSelects(); load('Focus RS');
  applyBuild(saved);
  o.travel = { lib: partLib.length, name: engine.icPart && engine.icPart.name, cls: engine.intercooler };
  applyEngineToForm(Object.assign({}, engine, { intercooler: false, icPart: undefined })); buildEngine();
  o.legacy = engine.intercooler;
  load('BMW M3 (E46'); partsUI.edit.intercooler = null; setTab('parts');
  o.na = document.getElementById('pxGuide').innerText;
  return o;
});
await browser.close();

console.log('== the factory cores as parts: peak power, class, largest torque / effectiveness / volume difference ==');
for (const c of r.fac) {
  console.log(`  ${c.car.padEnd(30)} ${c.k.padEnd(6)} ${String(c.hp).padStart(4)} hp  ${c.cls.padEnd(6)} ${c.d.toExponential(1)} ${c.de.toExponential(1)} ${c.dv.toExponential(1)}`);
  if (c.d > 1e-9 || c.de > 1e-9 || c.dv > 1e-9) fails.push(`${c.car} ${c.k}: the part is not the factory core`);
  if (c.cls !== c.k) fails.push(`${c.car} ${c.k}: the part's class is ${c.cls}`);
}
const f = x => x.toFixed(3);
console.log(`== 256: quoted eff left: ${r.quoted}; Golf large core eff at full / half flow ${f(r.flowEff[0])} / ${f(r.flowEff[1])}; drop at 5000 rpm ${(r.dp * 100).toFixed(1)} kPa; boost held to ${r.hold.toExponential(1)} bar; core height Golf ${r.golfH}, Ford GT ${r.gtH} mm ==`);
if (r.quoted) fails.push('a factory core still carries a quoted effectiveness');
if (!(r.flowEff[1] > r.flowEff[0] && r.flowEff[0] > 0.5 && r.flowEff[1] < 1)) fails.push('the large core does not cool better at a lower flow');
if (!(r.dp > 0.01 && r.hold < 0.01)) fails.push('the drop is not made up by the compressor');
if (!(r.tOut[0] > r.tOut[1])) fails.push('the compressor does not deliver more than the boost (its outlet is no hotter with the drop)');
if (r.golfH !== 250 || !(r.gtH > 150)) fails.push('the factory cores are not sized to their engines as the rule says');
console.log(`== width 400/600/800: eff ${r.w.map(x => f(x.eff)).join(' / ')}, core drop ${r.w.map(x => (x.dp / 1000).toFixed(1)).join(' / ')} kPa ==`);
console.log(`== fins 10/14/20: eff ${r.fpi.map(f).join(' / ')}; pipe 1/3/5 m: ${r.pipe.map(x => x.toFixed(2)).join(' / ')} L ==`);
const up = a => a[0] < a[1] && a[1] < a[2];
if (!up(r.w.map(x => x.eff))) fails.push('a wider core does not cool better');
if (!up(r.w.map(x => x.dp))) fails.push('a wider (longer-path) core does not drop more pressure');
if (!up(r.fpi)) fails.push('more fins do not cool better');
if (!up(r.pipe)) fails.push('a longer pipe does not hold more charge');
console.log(`== preview moves nothing: ${r.still}; fitted: ${JSON.stringify(r.fit)}; travels: ${JSON.stringify(r.travel)}; legacy false -> ${r.legacy} ==`);
if (!r.still) fails.push('previewing changed the build');
if (!r.fit.part || r.fit.cls !== 'small' || !r.fit.pull || !r.fit.form) fails.push('SAVE & FIT does not fit the core as previewed, as its class');
if (r.travel.lib !== 1 || r.travel.name !== 'TEST IC' || r.travel.cls !== 'small') fails.push('a saved build does not carry its intercooler');
if (r.legacy !== 'none') fails.push('an old build without an intercooler loads with one');
console.log(`== page: ${r.guide.split('\n')[1]} ==\n== NA: ${r.na.split('\n')[1]} ==`);
if (!/Pressure drop/.test(r.guide)) fails.push('the intercooler designer\'s readout is not shown');
if (!/only matters with forced induction/.test(r.na)) fails.push('an NA engine is not told a core changes nothing');

if (errors.length) console.log('ERRORS:\n  ' + errors.join('\n  '));
if (fails.length) console.log('\nFAIL:\n  ' + fails.join('\n  '));
else console.log('\nOK: a designed intercooler feeds the charge path its own volume and surfaces, and a factory core as a part is that core.');
process.exit(fails.length || errors.length ? 1 : 0);
