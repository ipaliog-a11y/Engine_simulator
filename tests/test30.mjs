import { chromium } from './pw.mjs';
import { fileURLToPath, pathToFileURL } from 'url';
import path from 'path';
const repo = fileURLToPath(new URL('..', import.meta.url));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1120, height: 1000 } });
const errors = [];
page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
await page.goto(pathToFileURL(path.join(repo, 'index.html')).href, { waitUntil: 'networkidle' });
await page.waitForTimeout(400);
const fails = [];

// 1. Geometry sane and closed
const geo = await page.evaluate(() => Object.keys(TRACKS).map(k => {
  const T = buildTrack(k);
  const gap = Math.hypot(T.pts[0].x - T.pts[T.pts.length - 1].x, T.pts[0].y - T.pts[T.pts.length - 1].y);
  const rs = T.pts.map(q => q.r).sort((a, b) => a - b);
  return { k, label: T.label, len: Math.round(T.length), corners: T.corners, gap: +gap.toFixed(1), rMin: Math.round(rs[0]) };
}));
console.log('== circuits ==');
geo.forEach(g => console.log(`  ${g.label.padEnd(15)} ${g.len}m  ${g.corners} corners  rMin ${g.rMin}m  closure gap ${g.gap}m`));
geo.forEach(g => { if (g.gap > 12) fails.push(`${g.label} centreline does not close (gap ${g.gap} m)`); });
// Upper bound covers imported road courses (the Nordschleife is 20.4 km), not just club circuits.
geo.forEach(g => { if (g.len < 1200 || g.len > 25000) fails.push(`${g.label} length implausible`); });

// 2. Circuit character: light+agile wins the tight one, powerful wins the fast one
console.log('\n== circuit character ==');
const ch = await page.evaluate(() => {
  const out = {};
  for (const [nm, chas] of [['2.0 ITB NA Screamer I4', 'roadster'], ['6.2 Supercharged V8', 'muscle']]) {
    const pr = PRESETS.find(x => x.name === nm);
    applyEngineToForm(Object.assign({}, DEFAULT_ENGINE, pr.engine)); buildEngine();
    applyChassisFit(chas); buildVehicle();
    out[nm] = { hp: engine.score.peakHP, kg: Math.round(vehicle.mass) };
    for (const k of Object.keys(TRACKS)) out[nm][k] = +simulateLap(k).lap.toFixed(2);
  }
  return out;
});
const light = ch['2.0 ITB NA Screamer I4'], heavy = ch['6.2 Supercharged V8'];
console.log(`  light screamer  ${light.hp}hp ${light.kg}kg: tech ${light.tech}s  fast ${light.fast}s`);
console.log(`  heavy blown V8  ${heavy.hp}hp ${heavy.kg}kg: tech ${heavy.tech}s  fast ${heavy.fast}s`);
if (!(light.tech < heavy.tech)) fails.push('the light car should win the technical circuit');
if (!(heavy.fast < light.fast)) fails.push('the powerful car should win the fast circuit');

// 3. The promised trade: spool wins the drag strip, loses the lap
console.log('\n== diff: drag strip vs lap (842 hp muscle) ==');
const diffs = await page.evaluate(() => ['open', 'visc', 'clsd', 'spool'].map(d => {
  const pr = PRESETS.find(x => x.name === '6.2 Supercharged V8');
  applyEngineToForm(Object.assign({}, DEFAULT_ENGINE, pr.engine)); buildEngine();
  applyChassisFit('muscle'); document.getElementById('vhDiff').value = d; buildVehicle();
  return { d, t100: +perf.t100.toFixed(2), lap: +simulateLap('tech').lap.toFixed(2) };
}));
diffs.forEach(r => console.log(`  ${r.d.padEnd(6)} 0-100 ${r.t100}s   lap ${r.lap}s`));
const D = Object.fromEntries(diffs.map(r => [r.d, r]));
if (!(D.spool.t100 < D.clsd.t100)) fails.push('spool should still win the standing start');
if (!(D.spool.lap > D.clsd.lap + 1)) fails.push('spool should lose meaningfully on a lap');
if (!(D.open.lap > D.clsd.lap)) fails.push('open diff should be slower than a clutch LSD on a lap');
if (!(D.open.t100 > D.clsd.t100)) fails.push('open diff should be slower than a clutch LSD off the line');

// 4. Sensitivity: aero and tyres must move lap time; sectors must sum to the lap
console.log('\n== sensitivity ==');
const sens = await page.evaluate(() => {
  const base = v => {
    const pr = PRESETS.find(x => x.name === '3.0 Turbo I6 (2JZ)');
    applyEngineToForm(Object.assign({}, DEFAULT_ENGINE, pr.engine)); buildEngine();
    applyChassisFit('coupe'); Object.entries(v).forEach(([k, val]) => document.getElementById(k).value = val);
    buildVehicle(); return simulateLap('mixed');
  };
  const stock = base({});
  return {
    stock: +stock.lap.toFixed(2),
    sectorSum: +(stock.sectors[0] + stock.sectors[1] + stock.sectors[2]).toFixed(2),
    slicks: +base({ vhTire: 'slick' }).lap.toFixed(2),
    eco: +base({ vhTire: 'eco' }).lap.toFixed(2),
    wings: +base({ vhAeroF: 'wing', vhAeroR: 'wing', vhAeroFl: 'diffuser' }).lap.toFixed(2),
    steel: +base({ vhBrake: 'steel', vhRotor: 260 }).lap.toFixed(2),
    manual: +base({ vhGearbox: 'manual' }).lap.toFixed(2),
    dct: +base({ vhGearbox: 'dct' }).lap.toFixed(2)
  };
});
console.log(`  stock ${sens.stock}s | slicks ${sens.slicks}s | eco tyres ${sens.eco}s | full aero ${sens.wings}s | steel brakes ${sens.steel}s`);
console.log(`  manual ${sens.manual}s vs DCT ${sens.dct}s  (shift time on track)`);
console.log(`  sectors sum ${sens.sectorSum}s vs lap ${sens.stock}s`);
if (!(sens.slicks < sens.stock)) fails.push('slicks should be quicker than sport tyres');
if (!(sens.eco > sens.stock)) fails.push('eco tyres should be slower');
if (!(sens.wings < sens.stock)) fails.push('downforce should be quicker on a mixed circuit');
if (!(sens.steel > sens.stock)) fails.push('undersized brakes should be slower');
if (!(sens.dct < sens.manual)) fails.push('a faster-shifting box should be quicker on a lap');
if (Math.abs(sens.sectorSum - sens.stock) > 0.05) fails.push('sector times do not sum to the lap time');

// 5. Determinism: lap must not depend on live driving state
const det = await page.evaluate(() => {
  applyEngineToForm(Object.assign({}, DEFAULT_ENGINE, { cylinders: 6, intake: 'turbo', boost_bar: 1.0 })); buildEngine();
  applyChassisFit('coupe'); buildVehicle();
  const a = simulateLap('mixed').lap;
  state.throttle = 0; state.systemVoltage = 10.2; state.engineHealth = 0.4; state.coolant = 125; state.afr = 18; state.nitrousActive = true;
  const b = simulateLap('mixed').lap;
  return { same: a === b, health: state.engineHealth };
});
console.log('\nlap independent of live state:', det.same, '| health preserved:', det.health);
if (!det.same) fails.push('lap time depends on live engine state');

// 6. UI
await page.click('#tabTrack'); await page.waitForTimeout(400);
const ui = await page.evaluate(() => ({
  cells: [...document.querySelectorAll('#lapGrid .perf-cell .k')].map(e => e.textContent),
  head: document.getElementById('lapHead').textContent,
  canvasShown: document.getElementById('engineCanvas').style.display !== 'none',
  panelShown: document.getElementById('trackPanel').style.display !== 'none'
}));
console.log('\nlap cells:', ui.cells.join(' | '));
console.log('canvas visible:', ui.canvasShown, '| panel visible:', ui.panelShown);
if (!ui.canvasShown || !ui.panelShown) fails.push('TRACK tab does not show both the map and the panel');
if (ui.cells.length !== 8) fails.push('lap grid should have 8 cells');
// switching circuit updates the readout
await page.selectOption('#trkSel', 'fast'); await page.waitForTimeout(300);
const sw = await page.evaluate(() => document.getElementById('lapHead').textContent);
console.log('after switching to CAPE:', sw.trim());
if (!/CAPE/.test(sw)) fails.push('circuit selector does not update the readout');

// 7. Greek
await page.evaluate(() => applyLang('el')); await page.waitForTimeout(200);
const el = await page.evaluate(() => ({
  tab: document.getElementById('tabTrack').textContent,
  cells: [...document.querySelectorAll('#lapGrid .perf-cell .k')].map(e => e.textContent).join(' '),
  note: document.getElementById('lapNote').textContent.slice(0, 40)
}));
console.log('\nEL tab:', el.tab, '| cells:', el.cells.slice(0, 60));
console.log('EL blurb:', el.note);
if (!/ΠΙΣΤΑ/.test(el.tab) || !/ΧΡΟΝΟΣ/.test(el.cells)) fails.push('Greek track strings missing');
if (/^A balanced|^Tight|^Long/.test(el.note)) fails.push('Greek circuit blurb not translated');
await page.evaluate(() => applyLang('en'));

console.log('\nERRORS:', errors.length ? errors : 'none');
console.log(fails.length ? 'FAIL:\n  ' + fails.join('\n  ') : '\nPASS');
await browser.close();
process.exit(fails.length || errors.length ? 1 : 0);
