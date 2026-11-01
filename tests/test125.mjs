// The side column and the dyno, tidied (build 213).
//
// WHY THIS EXISTS. LIVE OUTPUT sat beside every tab, the ENGINE form and the PARTS page included, where nothing runs;
// the DYNO tab's column was a wall of eleven buttons below RESET; the dyno's rpm table filled the page under the
// chart; the readout took a fixed tall block; and a designed part could not be put back to its factory numbers short
// of starting a new one. What must hold:
//   · LIVE OUTPUT shows on LIVE and DYNO only; a tab with nothing in the right column takes the whole width;
//   · on DYNO the buttons below RESET are in a MORE menu: buttons, not a select, opened by MORE, closed by a pick,
//     Escape or a click elsewhere, and each one still works from it (a logged pull); on LIVE they stay laid out;
//   · the dyno's rpm table is hidden until its button is pressed, and stays as chosen when the result re-renders;
//   · LIVE OUTPUT folds to its first row, about a third of its height, and the choice survives a reload;
//   · RESET on each part designer puts the factory part's dimensions back, keeping the name and the part's identity;
//   · all of it in Greek.
import { chromium } from './pw.mjs';
import { fileURLToPath, pathToFileURL } from 'url';
import path from 'path';
const repo = fileURLToPath(new URL('..', import.meta.url));
const URL_ = pathToFileURL(path.join(repo, 'index.html')).href;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors = [];
page.on('console', m => { if (m.type() === 'error' && !/ERR_FILE_NOT_FOUND/.test(m.text())) errors.push('console: ' + m.text()); });
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
await page.goto(URL_, { waitUntil: 'networkidle' });
await page.evaluate(() => { try { localStorage.removeItem('pes.liveFold'); localStorage.removeItem('pes.parts'); } catch (e) {} });
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(400);
const fails = [];
const vis = id => page.evaluate(id => { const el = document.getElementById(id); return !!el && el.offsetParent !== null && getComputedStyle(el).display !== 'none'; }, id);

// 1. where LIVE OUTPUT shows
const where = {};
for (const t of ['Design', 'Vehicle', 'Parts', 'Garage', 'Track', 'Race', 'Engine', 'Dyno', 'Guide', 'Options']) {
  await page.evaluate(t => setTab(t.toLowerCase()), t);
  where[t] = { live: await vis('livePanel'), wide: await page.evaluate(() => document.querySelector('.main').classList.contains('wide')) };
}
await page.evaluate(() => setTab('engine'));
console.log('== LIVE OUTPUT by tab: ' + Object.entries(where).map(([t, w]) => t + (w.live ? ' shown' : ' -') + (w.wide ? ' (wide)' : '')).join(' · ') + ' ==');
for (const [t, w] of Object.entries(where)) {
  const want = t === 'Engine' || t === 'Dyno';
  if (w.live !== want) fails.push(`LIVE OUTPUT ${w.live ? 'shows' : 'is hidden'} on the ${t === 'Engine' ? 'LIVE' : t.toUpperCase()} tab`);
}
for (const t of ['Design', 'Parts', 'Garage', 'Options', 'Guide']) if (!where[t].wide) fails.push(`the ${t.toUpperCase()} tab leaves an empty right column`);
for (const t of ['Engine', 'Dyno', 'Vehicle', 'Track']) if (where[t].wide) fails.push(`the ${t} tab lost its right column`);

// 2. the MORE menu
const MENU = ['btnAutoThermal', 'btnNitrous', 'btnLogPull', 'btnClearPulls', 'btnReportPng', 'btnReportPdf', 'btnSave', 'btnLoad', 'btnExport', 'btnImport', 'btnShare'];
const onLive = { more: await vis('btnMore'), shown: (await Promise.all(MENU.map(vis))).filter(Boolean).length };
await page.click('#tabDyno'); await page.waitForTimeout(200);
const shut = { more: await vis('btnMore'), shown: (await Promise.all(MENU.map(vis))).filter(Boolean).length, reset: await vis('btnReset'),
  tag: await page.evaluate(() => document.getElementById('btnMore').tagName) };
await page.click('#btnMore');
const opened = { shown: (await Promise.all(MENU.map(vis))).filter(Boolean).length, exp: await page.getAttribute('#btnMore', 'aria-expanded') };
const pulls0 = await page.evaluate(() => dynoPulls.length);
await page.click('#btnLogPull'); await page.waitForTimeout(100);
const afterPick = { pulls: await page.evaluate(() => dynoPulls.length) - pulls0, open: await vis('btnLogPull') };
await page.click('#btnMore'); await page.keyboard.press('Escape');
const afterEsc = await vis('btnLogPull');
await page.click('#btnMore'); await page.mouse.click(300, 300);
const afterOutside = await vis('btnLogPull');
await page.evaluate(() => { const b = document.getElementById('btnClearPulls'); b.click(); });
console.log(`== MORE: on LIVE ${onLive.shown}/${MENU.length} laid out (MORE ${onLive.more ? 'shown' : 'hidden'}); on DYNO shut ${shut.shown} shown (MORE a ${shut.tag}, RESET ${shut.reset ? 'shown' : 'hidden'}), open ${opened.shown}/${MENU.length}; a pick logs ${afterPick.pulls} pull and ${afterPick.open ? 'leaves it open' : 'closes it'}; Escape ${afterEsc ? 'leaves it open' : 'closes it'}; a click outside ${afterOutside ? 'leaves it open' : 'closes it'} ==`);
if (onLive.more || onLive.shown !== MENU.length) fails.push('on LIVE the controls are not laid out as before');
if (!shut.more || shut.tag !== 'BUTTON' || shut.shown !== 0 || !shut.reset) fails.push('on DYNO the buttons below RESET are not folded behind a MORE button');
if (opened.shown !== MENU.length || opened.exp !== 'true') fails.push(`MORE opens ${opened.shown} of ${MENU.length} buttons`);
if (afterPick.pulls !== 1 || afterPick.open) fails.push('a button picked from the menu does not work, or leaves the menu open');
if (afterEsc || afterOutside) fails.push('the menu does not close on Escape or a click elsewhere');

// 3. the rpm table
const tbl = async () => ({ shown: await vis('dynoTable'), btn: await page.textContent('#btnDynoTable') });
const t0 = await tbl();
await page.click('#btnDynoTable'); const t1 = await tbl();
await page.evaluate(() => renderDynoResult(true)); const t2 = await tbl();
await page.click('#btnDynoTable'); const t3 = await tbl();
console.log(`== rpm table: ${t0.shown ? 'shown' : 'hidden'} ("${t0.btn}"), pressed ${t1.shown ? 'shown' : 'hidden'} ("${t1.btn}"), re-rendered ${t2.shown ? 'shown' : 'hidden'}, pressed again ${t3.shown ? 'shown' : 'hidden'} ==`);
if (t0.shown || !/SHOW TABLE/.test(t0.btn)) fails.push('the rpm table is not hidden behind its button');
if (!t1.shown || !/HIDE TABLE/.test(t1.btn)) fails.push('pressing the button does not show the rpm table');
if (!t2.shown) fails.push('the rpm table closes when the result re-renders');
if (t3.shown) fails.push('pressing again does not hide the rpm table');

// 4. the fold
const h = () => page.evaluate(() => document.getElementById('livePanel').getBoundingClientRect().height);
const full = await h();
await page.click('#btnLiveFold'); const folded = await h();
const foldVis = { row1: await vis('statHP'), row2: await vis('statEff') };
await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(300);
const kept = await page.evaluate(() => document.getElementById('livePanel').classList.contains('folded'));
await page.click('#btnLiveFold'); const back = await h();
console.log(`== fold: ${full.toFixed(0)} px -> ${folded.toFixed(0)} px (${(folded / full * 100).toFixed(0)}%), POWER ${foldVis.row1 ? 'shown' : 'hidden'}, THERMAL EFF ${foldVis.row2 ? 'shown' : 'hidden'}; after a reload ${kept ? 'still folded' : 'open'}; unfolded ${back.toFixed(0)} px ==`);
if (!(folded / full > 0.28 && folded / full < 0.40)) fails.push(`folded, LIVE OUTPUT is ${(folded / full * 100).toFixed(0)}% of its height, not about a third`);
if (!foldVis.row1 || foldVis.row2) fails.push('folded, LIVE OUTPUT does not keep just its first row');
if (!kept) fails.push('the fold is not kept across a reload');
if (Math.abs(back - full) > 1) fails.push('unfolding does not give the full height back');

// 5. RESET on the part designers
const reset = await page.evaluate(() => {
  loadVehiclePreset(FACTORY_CARS.find(p => p.name.includes('BMW M3 (E46')));
  const o = {};
  for (const [kind, U, field, pre] of [['exhaust', PART_UI.exhaust, 'ptPrimL', 'pt'], ['intake', PART_UI.intake, 'piL', 'pi'], ['filter', PART_UI.filter, 'pfArea', 'pf']]) {
    partsUI.kind = kind; partsUI.edit[kind] = null; setTab('parts');
    const from = document.getElementById(U.from).value, factory = partFromFactory(from, kind);
    document.getElementById(U.fields[0]).value = 'MY TEST ' + kind;
    const el = document.getElementById(field); el.value = String(+el.value * 1.3 + 7); el.dispatchEvent(new Event('input'));
    const id = partsUI.edit[kind].id, moved = partFromEditor(kind);
    document.getElementById(pre + 'Reset').click();
    const after = partFromEditor(kind);
    const same = Object.keys(factory).filter(k => !['id', 'name'].includes(k)).every(k => String(after[k]) === String(factory[k]));
    o[kind] = { moved: String(moved[Object.keys(factory).find(k => k.startsWith(field === 'pfArea' ? 'area' : field === 'piL' ? 'runnerL' : 'primL'))]),
      same, name: after.name, id: after.id === id, fitted: !engine[PART_DEF[kind].field] };
  }
  return o;
});
console.log('== RESET: ' + Object.entries(reset).map(([k, r]) => `${k} back to the factory's ${r.same ? 'numbers' : 'NUMBERS? NO'}, name "${r.name}", same part ${r.id}`).join('; ') + ' ==');
for (const [k, r] of Object.entries(reset)) {
  if (!r.same) fails.push(`RESET does not put the ${k}'s factory dimensions back`);
  if (r.name !== 'MY TEST ' + k || !r.id) fails.push(`RESET on the ${k} loses its name or makes it a different part`);
}

// 6. Greek
const el = await page.evaluate(() => {
  applyLang('el'); setTab('dyno'); renderDynoResult(true);
  const o = { more: document.getElementById('btnMore').textContent, table: document.getElementById('btnDynoTable').textContent,
    title: document.querySelector('#livePanel h2>span').textContent, fold: document.getElementById('btnLiveFold').title };
  setTab('parts'); o.reset = document.getElementById('ptReset').textContent;
  applyLang('en'); return o;
});
console.log(`== Greek: ${el.more} · ${el.table} · ${el.title} · "${el.fold}" · ${el.reset} ==`);
if (/MORE|SHOW|Live Output|Collapse|Expand|RESET/.test(Object.values(el).join(' '))) fails.push('the new controls are not in Greek: ' + JSON.stringify(el));

await browser.close();
if (errors.length) console.log('ERRORS:\n  ' + errors.join('\n  '));
if (fails.length) console.log('\nFAIL:\n  ' + fails.join('\n  '));
else console.log('\nOK: LIVE OUTPUT is on LIVE and DYNO only and folds to a third; DYNO keeps its extra buttons in a MORE menu and its rpm table behind a button; each part designer has a RESET.');
process.exit(fails.length || errors.length ? 1 : 0);
