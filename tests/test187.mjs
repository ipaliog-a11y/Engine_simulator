// WHY THIS EXISTS (build 305): the ECU's VE table is its estimate of the air, used only to meter fuel. What must hold:
//   · untouched, the table shows the derived VE at each breakpoint and moves no number;
//   · an edited cell changes the burned mixture by real VE / table VE, never the engine's real VE: set low it runs lean
//     and loses torque, set high it runs rich;
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
  const tq = () => brakeTorqueRaw(rpm, map, false), afr = () => curAFR(rpm, map), ve = () => veTrue(rpm, map);
  const o = { mode: engine.afrMode, rpm, map, tq0: tq(), afr0: afr(), ve0: ve(), target: mappedAFR(rpm, map) };
  renderVeMap();
  const cell = document.querySelector('#veMapBox td[data-c="' + c + '"][data-r="' + row + '"]');
  o.cellText = cell && cell.textContent; o.shown = document.getElementById('veMapBox').style.display;
  o.untouched = { custom: veMapCustom, tq: tq(), afr: afr() };
  selectVeCell(c, row); adjustVeCell(0);
  o.interp = { custom: veMapCustom, afr: afr() };   // edited by nothing: the table, read at its own breakpoint
  for (let i = 0; i < 15; i++) adjustVeCell(-1);
  o.low = { table: veTableAt(rpm, map), afr: afr(), tq: tq(), ve: ve() };
  for (let i = 0; i < 30; i++) adjustVeCell(1);
  o.high = { table: veTableAt(rpm, map), afr: afr(), tq: tq(), red: !!document.querySelector('#veMapBox td.knk') };
  const saved = serializeBuild('t', ''); o.savedHas = Array.isArray(saved.veMap);
  resetVeMap(); o.reset = { custom: veMapCustom, tq: tq(), afr: afr() };
  applyBuild(saved); o.reloaded = { custom: veMapCustom, table: veTableAt(rpm, map) };
  resetVeMap();
  const d = PRESETS.find(p => p.engine && p.engine.type === 'diesel');
  if (d) { applyBuild({ engine: Object.assign({}, d.engine), tune: Object.assign({}, STD_TUNE), vehicle: readVehicleFromForm(), name: d.name });
    o.diesel = { name: d.name, ci: engine.ci, shown: document.getElementById('veMapBox').style.display }; }
  return o;
});

const f1 = x => (+x).toFixed(1), f2 = x => (+x).toFixed(2);
console.log(`cell ${r.rpm} rpm, ${f1(r.map)} bar: engine VE ${f2(r.ve0)}, shown "${r.cellText}"; AFR ${f2(r.afr0)} (target ${f2(r.target)}), ${f1(r.tq0)} Nm`);
console.log(`table ${f2(r.low.table)}: AFR ${f2(r.low.afr)}, ${f1(r.low.tq)} Nm; table ${f2(r.high.table)}: AFR ${f2(r.high.afr)}, ${f1(r.high.tq)} Nm`);
console.log(`reset: ${f1(r.reset.tq)} Nm; reloaded build custom ${r.reloaded.custom}; diesel ${r.diesel && r.diesel.name}: table ${r.diesel && r.diesel.shown}`);

if (r.mode !== 'auto' || r.shown !== 'block') fails.push('the default build does not show the VE table on an AUTO fuel map');
if (+r.cellText !== Math.round(r.ve0 * 100)) fails.push(`cell shows ${r.cellText}, derived ${f2(r.ve0)}`);
if (r.untouched.custom || r.untouched.tq !== r.tq0 || r.untouched.afr !== r.afr0) fails.push('showing the table moved a number');
if (!r.interp.custom || Math.abs(r.interp.afr / r.afr0 - 1) > 0.002) fails.push(`an unedited breakpoint burns AFR ${f2(r.interp.afr)}, not ${f2(r.afr0)}`);
if (Math.abs(r.low.ve - r.ve0) > 1e-12) fails.push('editing the table moved the engine\'s real VE');
if (Math.abs(r.low.afr / r.target - r.ve0 / r.low.table) > 1e-6) fails.push('burned AFR is not target x real VE / table VE');
if (!(r.low.afr > r.afr0 * 1.1 && r.low.tq < r.tq0 - 1)) fails.push('a table set 15 points low did not run lean and lose torque');
if (!(r.high.afr < r.afr0 * 0.9)) fails.push('a table set 15 points high did not run rich');
if (!r.high.red) fails.push('no mismatched cell is marked');
if (!r.savedHas) fails.push('a hand-tuned VE table is not saved with the build');
if (r.reset.custom || r.reset.tq !== r.tq0 || r.reset.afr !== r.afr0) fails.push('RESET did not return the derived table exactly');
if (!r.reloaded.custom || Math.abs(r.reloaded.table - r.high.table) > 1e-9) fails.push('a loaded build lost its VE table');
if (!r.diesel || !r.diesel.ci || r.diesel.shown !== 'none') fails.push('a diesel shows a VE table');
fails.push(...errors);
await browser.close();
if (fails.length) { console.log('\nFAIL\n' + fails.map(f => '  - ' + f).join('\n')); process.exit(1); }
console.log('\nPASS');
