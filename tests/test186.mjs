// WHY THIS EXISTS (build 304): the ECU's spark table is editable, opens filled with what the model derives, and the
// physics answers an edit. What must hold:
//   · untouched, the table shows the derived advance (best torque, or the knock limit) and moves no number;
//   · an edited cell is the advance the engine runs: retarded it loses torque, advanced past the knock limit it knocks;
//   · RESET returns the derived table and the torque exactly; a saved build keeps its table; a diesel shows none.
import { chromium } from './pw.mjs';
import { fileURLToPath, pathToFileURL } from 'url';
import path from 'path';
const repo = fileURLToPath(new URL('..', import.meta.url));
const browser = await chromium.launch();
const page = await browser.newPage();
const errors = [];
page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
await page.goto(pathToFileURL(path.join(repo, 'index.html')).href, { waitUntil: 'networkidle' });
await page.waitForTimeout(600);
const fails = [];

const r = await page.evaluate(() => {
  const c = 4, row = FM_ROWS - 1, rpm = fmRpmAt(c), map = fmMapAt(row);
  const tq = () => brakeTorqueRaw(rpm, map, false), probe = [[rpm + 130, map * 0.9], [rpm, map]];
  const live = () => probe.map(([a, m]) => activeAdvance(a, m));
  const o = { timing: engine.timingMode, rpm, map };
  o.tq0 = tq(); o.adv0 = live(); o.knockLimit = activeAdvance(rpm, map); o.mbt = mbtAdvance(rpm, map);
  renderSparkMap();
  const cell = document.querySelector('#sparkMapBox td[data-c="' + c + '"][data-r="' + row + '"]');
  o.cellText = cell && cell.textContent; o.shown = document.getElementById('sparkMapBox').style.display;
  o.untouched = { custom: sparkMapCustom, tq: tq(), adv: live() };
  selectSkCell(c, row); for (let i = 0; i < 10; i++) adjustSkCell(-1);
  o.retard = { adv: activeAdvance(rpm, map), tq: tq() };
  for (let i = 0; i < 25; i++) adjustSkCell(1);
  o.over = { adv: activeAdvance(rpm, map), knock: knockAt(rpm, map, activeAdvance(rpm, map)), target: KNOCK_TARGET,
    red: !!document.querySelector('#sparkMapBox td.knk') };
  const saved = serializeBuild('t', ''); o.savedHas = Array.isArray(saved.sparkMap);
  resetSparkMap(); o.reset = { custom: sparkMapCustom, tq: tq(), adv: live() };
  applyBuild(saved); o.reloaded = { custom: sparkMapCustom, adv: activeAdvance(rpm, map) };
  resetSparkMap();
  const d = PRESETS.find(p => p.engine && p.engine.type === 'diesel');
  if (d) { applyBuild({ engine: Object.assign({}, d.engine), tune: Object.assign({}, STD_TUNE), vehicle: readVehicleFromForm(), name: d.name });
    o.diesel = { name: d.name, ci: engine.ci, shown: document.getElementById('sparkMapBox').style.display }; }
  return o;
});

const f1 = x => (+x).toFixed(1);
console.log(`cell ${r.rpm} rpm, ${f1(r.map)} bar: derived ${f1(r.knockLimit)}° (best torque ${f1(r.mbt)}°), shown "${r.cellText}"`);
console.log(`torque ${f1(r.tq0)} Nm untouched; retarded to ${f1(r.retard.adv)}°: ${f1(r.retard.tq)} Nm; advanced to ${f1(r.over.adv)}°: knock ${f1(r.over.knock)} (limit ${r.over.target})`);
console.log(`reset: torque ${f1(r.reset.tq)} Nm; reloaded build custom ${r.reloaded.custom} at ${f1(r.reloaded.adv)}°; diesel ${r.diesel && r.diesel.name}: table ${r.diesel && r.diesel.shown}`);

if (r.timing !== 'auto' || r.shown !== 'block') fails.push('the default build does not show the spark table on AUTO ignition');
if (+r.cellText !== Math.round(r.knockLimit)) fails.push(`cell shows ${r.cellText}, derived ${f1(r.knockLimit)}`);
if (r.untouched.custom || r.untouched.tq !== r.tq0 || r.untouched.adv.some((a, i) => a !== r.adv0[i])) fails.push('showing the table moved a number');
if (!(Math.abs(r.retard.adv - (r.knockLimit - 10)) <= 1)) fails.push(`retarded cell runs ${f1(r.retard.adv)}°`);
if (!(r.retard.tq < r.tq0 - 1)) fails.push('10° of retard did not lose torque');
if (!(r.over.knock > r.over.target)) fails.push('15° past the derived advance does not knock');
if (!r.over.red) fails.push('no knocking cell is marked');
if (!r.savedHas) fails.push('a hand-tuned table is not saved with the build');
if (r.reset.custom || r.reset.tq !== r.tq0 || r.reset.adv.some((a, i) => a !== r.adv0[i])) fails.push('RESET did not return the derived table exactly');
if (!r.reloaded.custom || Math.abs(r.reloaded.adv - r.over.adv) > 1e-9) fails.push('a loaded build lost its spark table');
if (!r.diesel || !r.diesel.ci || r.diesel.shown !== 'none') fails.push('a diesel shows a spark table');
fails.push(...errors);
await browser.close();
if (fails.length) { console.log('\nFAIL\n' + fails.map(f => '  - ' + f).join('\n')); process.exit(1); }
console.log('\nPASS');
