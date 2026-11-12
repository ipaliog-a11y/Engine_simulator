// Dashboard lamps and starter/power stubs (build 254).
//
// WHY THIS EXISTS. LIVE/DYNO gained telltale lamps and Starter / Power Off controls. Oil pressure and
// fault codes are not modeled, so those lamps must stay dim stubs. Since build 265 the buttons stop and start a
// plain engine (test169 checks the physics); a hybrid reuses engOn. What must hold:
//   · the lamp row and both buttons show on LIVE and DYNO;
//   · OIL P and FAULT stay lamp-stub and never take on/warn/danger in normal use;
//   · COOL goes danger when coolant is forced hot; BATT goes danger when voltage is forced low;
//   · on a running ICE, Starter says it is already on; Power Off cuts the ignition (the engine stops firing);
//   · on a hybrid, Power Off clears engOn and Starter sets it;
//   · at phone width the page does not scroll sideways.
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
await page.waitForTimeout(300);
const fails = [];
const vis = id => page.evaluate(id => {
  const el = document.getElementById(id);
  return !!el && el.offsetParent !== null && getComputedStyle(el).display !== 'none' && !el.hidden;
}, id);

await page.evaluate(() => { applyBuild({ engine: Object.assign({}, DEFAULT_ENGINE), tune: Object.assign({}, STD_TUNE) }); setTab('engine'); updateUI(); });
await page.waitForTimeout(100);

for (const tab of ['engine', 'dyno']) {
  await page.evaluate(t => setTab(t), tab);
  await page.waitForTimeout(80);
  for (const id of ['dashLamps', 'btnStarter', 'btnPowerOff', 'lampCool', 'lampOil', 'lampOilP', 'lampFault', 'lampBatt']) {
    if (!(await vis(id))) fails.push(`${id} is hidden on ${tab === 'engine' ? 'LIVE' : 'DYNO'}`);
  }
  if (await vis('lampHyb')) fails.push(`hybrid lamp shows on a plain ICE on ${tab}`);
}

const stubs = await page.evaluate(() => {
  updateDashLamps();
  const cls = id => document.getElementById(id).className;
  return { oilP: cls('lampOilP'), fault: cls('lampFault') };
});
console.log(`== stubs: oilP="${stubs.oilP}" fault="${stubs.fault}" ==`);
if (!/\blamp-stub\b/.test(stubs.oilP) || /\b(on|warn|danger)\b/.test(stubs.oilP)) fails.push('OIL P is not a dim stub');
if (!/\blamp-stub\b/.test(stubs.fault) || /\b(on|warn|danger)\b/.test(stubs.fault)) fails.push('FAULT is not a dim stub');

const lit = await page.evaluate(() => {
  state.coolant = 120; state.oil = 100; state.systemVoltage = 10.8; state.batterySOC = 0.2;
  updateDashLamps();
  return {
    cool: document.getElementById('lampCool').className,
    batt: document.getElementById('lampBatt').className,
  };
});
console.log(`== lit: cool="${lit.cool}" batt="${lit.batt}" ==`);
if (!/\bdanger\b/.test(lit.cool)) fails.push('COOL does not go danger when coolant is hot');
if (!/\bdanger\b/.test(lit.batt)) fails.push('BATT does not go danger when voltage is low');
await page.evaluate(() => { state.coolant = 90; state.systemVoltage = 14.0; state.batterySOC = 1.0; updateDashLamps(); });

const ice = await page.evaluate(() => {
  const rpm0 = state.rpm;
  document.getElementById('btnStarter').click();
  const afterStart = { rpm: state.rpm, status: document.getElementById('status').textContent };
  document.getElementById('btnPowerOff').click();
  stepEngine(0.01);
  const r = { rpm0, afterStart, afterOff: { firing: state.firing, ign: state.ignOn, status: document.getElementById('status').textContent } };
  state.firing = true; state.ignOn = true; state.crank = 0; state.rpm = rpm0;      // running again for the checks below
  return r;
});
console.log(`== ICE: rpm ${ice.rpm0} → start "${ice.afterStart.status}" → off "${ice.afterOff.status}" ==`);
if (ice.afterStart.rpm !== ice.rpm0) fails.push('Starter on a running engine changed its rpm');
if (!/already on/i.test(ice.afterStart.status)) fails.push('Starter on a running engine did not say it is on');
if (ice.afterOff.firing || ice.afterOff.ign) fails.push('ICE Power Off did not cut the ignition');

const hyb = await page.evaluate(() => {
  loadVehiclePreset(HYB_VEHICLE_PRESETS.find(x => x.name.includes('Ioniq')));
  setTab('engine');
  const H = hybBenchState();
  H.engOn = true; H.dwell = 0; updateUI();
  const before = { on: H.engOn, hybVis: !document.getElementById('lampHyb').hidden, hybCls: document.getElementById('lampHyb').className };
  document.getElementById('btnPowerOff').click();
  const afterOff = { on: H.engOn, status: document.getElementById('status').textContent };
  document.getElementById('btnStarter').click();
  const afterStart = { on: H.engOn, status: document.getElementById('status').textContent };
  updateDashLamps();
  return { before, afterOff, afterStart, hybLbl: document.getElementById('lampHyb').querySelector('.lamp-lbl').textContent };
});
console.log(`== hybrid: lamp shown=${hyb.before.hybVis} cls=${hyb.before.hybCls}; off→${hyb.afterOff.on}; start→${hyb.afterStart.on}; lbl=${hyb.hybLbl} ==`);
if (!hyb.before.hybVis) fails.push('hybrid lamp stays hidden on a hybrid');
if (hyb.afterOff.on) fails.push('hybrid Power Off did not clear engOn');
if (!hyb.afterStart.on) fails.push('hybrid Starter did not set engOn');

await page.setViewportSize({ width: 390, height: 844 });
await page.evaluate(() => setTab('engine'));
await page.waitForTimeout(100);
const scroll = await page.evaluate(() => ({ w: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
console.log(`== phone width: scroll ${scroll.w} / client ${scroll.cw} ==`);
if (scroll.w > scroll.cw + 1) fails.push(`horizontal scroll at phone width (${scroll.w} > ${scroll.cw})`);

if (errors.length) console.log('ERRORS:\n  ' + errors.join('\n  '));
if (fails.length) console.log('\nFAIL:\n  ' + fails.join('\n  '));
else console.log('\nOK: dashboard lamps and starter/power stubs behave as specified.');
await browser.close();
process.exit(fails.length || errors.length ? 1 : 0);
