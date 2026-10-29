// The Greek interface (build 161; the guide, build 162).
//
// WHY THIS EXISTS. The Greek translation was made once and the interface kept growing in English: by build 155 a
// sweep of the app in Greek found 9 tr() calls with no Greek, every dropdown in English, the design and vehicle
// summaries, the status bar, the help lines, ~30 tooltips and screen-reader labels, and 39 guide titles. Nothing
// failed, because tr() falls back to the English and every Greek test checked one feature. This test is the sweep:
//   · every tr('literal') in the source, every guide title, category and picture caption, every circuit's
//     description and every trIn() lookup has Greek, and no status message is an untranslated literal; the table has no key twice
//     (a second entry silently wins: 'LOAD' was the load button's ΦΟΡΤΩΣΗ on the fuel map's load axis);
//   · with Greek chosen, no tab shows an English word outside the terms the translation keeps in Latin letters
//     (BOOST, ECU, LSD...), units, and the names of real cars, engines and circuits; both on a fresh load in Greek
//     and after switching from English mid-session (the refresh path, which once left the top bar in English);
//   · switching back to English leaves no Greek behind (a label cached in Greek would stay Greek for good);
//   · the guide: its blocks without Greek are a budget that may only go down, so new guide text must be
//     translated or the budget raised on purpose, in the open. The guide's own text is excluded from the sweep;
//   · the electric drive's words (src/js/electric-ui.js, build 179) are a second such budget: decision 11 of
//     plans/hybrid-electric/ lets them fall back to English for now. Only what an electric build shows is in it; what
//     every player sees (the ELECTRIC choice, the build message) is translated, and the sweep below runs on an engine.
import { chromium } from './pw.mjs';
import { fileURLToPath, pathToFileURL } from 'url';
import { readFileSync } from 'fs';
import path from 'path';
const repo = fileURLToPath(new URL('..', import.meta.url));
const SRC = readFileSync(path.join(repo, 'index.html'), 'utf8');
const URL_ = pathToFileURL(path.join(repo, 'index.html')).href;
const fails = [], errors = [];

// The guide's blocks with no Greek. Lower it as pages are translated; never raise it to make new text pass.
const GUIDE_BLOCKS_WITHOUT_GREEK = 0;   // build 162 translated the guide
// The electric drive's tr() words with no Greek yet (decision 11: English for now). Lower it as they are translated;
// never raise it to let new text pass. A word not in electric-ui.js is held to the full rule above.
const ELECTRIC_WORDS_WITHOUT_GREEK = 64;
const EV_SRC = readFileSync(path.join(repo, 'src', 'js', 'electric-ui.js'), 'utf8');

// Kept in Latin letters by the translation (as the existing Greek does: ΣΤΟΧΟΣ BOOST, LSD ΜΕ ΔΙΣΚΟΥΣ), units, and
// names (SYNTH and GAS are the two sound models'; WLTP the regulation's own name, ATKINSON the cycle's inventor's, eCVT the transmission's). Matched as whole words, case-sensitive.
const ALLOW = new Set(`BOOST BUILD DYNO ECU LSD VVT ITB PFI DCT AFR RON BTDC MAP RPM rpm BSFC PNG PDF GPX ALT ALS ANTI LAG
  INTERCOOLER ROOTS COMPOUND DECAT WANKEL Wankel HOT HATCH ROADSTER MUSCLE CAR GRAND TOURER SUPERCAR Supercar HYPERCAR
  PICKUP SUV FWD RWD AWD SPOOL TOURING SLICK DRAG RADIAL SPLITTER SPOILER DIFFUSER COILOVERS Kei KEI wiki WIKI pixel art
  browser coupe build grand prix Sleeper Grand Prix Ring Automation PIXEL ENGINE SIM BMEP BATT kWh Nm bar VGT CdA ClA
  OFF stall PIT PITS GT boost pit Wastegate Intercooler SYNTH GAS Ange Yaghi CPU WLTP ATKINSON eCVT`.split(/\s+/).filter(Boolean));
// Selects of names, the app's title, the circuit's name, and the guide's pages (budgeted above).
const SKIP = '#edPreset, #vhPreset, #raceAddSel, #trkSel, #raceTrk, #edLang, h1, #lapHead, [id^="gp-"]';

// ---------- 1. the tables ----------
const i18nSrc = SRC.slice(SRC.indexOf('const I18N={'), SRC.indexOf('\n};', SRC.indexOf('const I18N={')));
const keys = [...i18nSrc.matchAll(/(?:^|[,{\s])('(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"):\{el:/g)].map(m => m[1].slice(1, -1));
const seen = {}; keys.forEach(k => seen[k] = (seen[k] || 0) + 1);
const twice = Object.entries(seen).filter(([, n]) => n > 1).map(([k]) => k);
// four were there before build 161, meaning the same both times; any new one fails
const twiceNew = twice.filter(k => !['COMPRESSION', 'KNOCK RISK', 'BRAKES', 'Valvetrain'].includes(k));
console.log('I18N keys:', keys.length, '| twice:', twice.join(', ') || 'none');
if (twiceNew.length) fails.push('I18N has keys twice (the second wins): ' + twiceNew.join(', '));
const lits = new Set();
for (const m of SRC.matchAll(/\btr\(\s*(['"])((?:\\.|(?!\1).)*)\1\s*\)/g)) lits.add(m[2].replace(/\\'/g, "'").replace(/\\"/g, '"'));
// trIn('ctx','English') looks up ctx:English first; either must have Greek (build 163)
const ctxLits = [...SRC.matchAll(/\btrIn\(\s*'([a-z]+)'\s*,\s*'([^']+)'\s*\)/g)].map(m => [m[1], m[2]]);
// A status message is read in Greek too: flash() must never be handed an English literal (build 163)
const rawFlash = [...SRC.matchAll(/\bflash\(\s*(['"])([^'"]*[A-Za-z]{3,}[^'"]*)\1/g)].map(m => m[2]).filter(x => !/Language: English/.test(x));
if (rawFlash.length) fails.push('status messages not passed through tr(): ' + rawFlash.join(' | '));

const browser = await chromium.launch();
const open = async (lang) => {
  const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  if (lang) await page.addInitScript(l => { try { localStorage.setItem('pes.lang', l); } catch (e) {} }, lang);
  await page.goto(URL_, { waitUntil: 'networkidle' }); await page.waitForTimeout(400);
  return page;
};
const page = await open('el');
const tables = await page.evaluate(([lits, ctxLits]) => ({
  noGreek: lits.filter(k => !(I18N[k] && I18N[k].el)),
  empty: Object.keys(I18N).filter(k => !I18N[k].el),
  titles: guidePages().map(p => p.dataset.title).filter(t => !(I18N[t] && I18N[t].el)),
  cats: Object.values(GUIDE_CATS).filter(t => !(I18N[t] && I18N[t].el)),
  captions: [...document.querySelectorAll('.gart-cap')].map(c => c.dataset.en || c.textContent.trim()).filter(t => !(I18N[t] && I18N[t].el)),
  // every circuit's description, not only the one on screen (build 163: 22 were English and the sweep never saw them)
  blurbs: Object.values(TRACKS).filter(t => t.blurb && !(I18N[t.blurb] && I18N[t.blurb].el)).map(t => t.label),
  ctx: ctxLits.filter(([c, k]) => !((I18N[c + ':' + k] || I18N[k] || {}).el)).map(([c, k]) => c + ':' + k),
  blocks: [...document.querySelectorAll('[data-gk]')].filter(b => !(GUIDE_I18N[b.dataset.gk] && GUIDE_I18N[b.dataset.gk].el)).length,
  orphans: Object.keys(GUIDE_I18N).filter(k => !document.querySelector('[data-gk="' + k + '"]')),
}), [[...lits], ctxLits]);
console.log('tr() literals:', lits.size, '| without Greek:', tables.noGreek.length, '| guide titles without Greek:', tables.titles.length,
  '| guide blocks without Greek:', tables.blocks, '(budget', GUIDE_BLOCKS_WITHOUT_GREEK + ')');
// the electric drive's own words count against their budget (decision 11); any other word must have Greek
const isEvWord = k => EV_SRC.includes("tr('" + k.replace(/'/g, "\\'") + "')") || EV_SRC.includes('tr("' + k + '")');
const evNoGreek = tables.noGreek.filter(isEvWord), noGreek = tables.noGreek.filter(k => !isEvWord(k));
console.log('electric words without Greek:', evNoGreek.length, '(budget', ELECTRIC_WORDS_WITHOUT_GREEK + ')');
if (evNoGreek.length > ELECTRIC_WORDS_WITHOUT_GREEK) fails.push(`electric words without Greek ${evNoGreek.length} > budget ${ELECTRIC_WORDS_WITHOUT_GREEK}: translate the new text`);
if (evNoGreek.length < ELECTRIC_WORDS_WITHOUT_GREEK) console.log(`  (the electric budget can come down to ${evNoGreek.length})`);
if (noGreek.length) fails.push('tr() calls with no Greek: ' + noGreek.join(' | '));
if (tables.empty.length) fails.push('I18N entries with an empty Greek: ' + tables.empty.join(' | '));
if (tables.titles.length) fails.push('guide titles with no Greek: ' + tables.titles.join(' | '));
if (tables.cats.length) fails.push('guide categories with no Greek: ' + tables.cats.join(' | '));
if (tables.captions.length) fails.push('guide picture captions with no Greek: ' + tables.captions.join(' | '));
if (tables.blurbs.length) fails.push('circuit descriptions with no Greek: ' + tables.blurbs.join(' | '));
if (tables.ctx.length) fails.push('trIn() lookups with no Greek: ' + tables.ctx.join(' | '));
if (tables.orphans.length) fails.push('GUIDE_I18N blocks with no page: ' + tables.orphans.join(' | '));
if (tables.blocks > GUIDE_BLOCKS_WITHOUT_GREEK) fails.push(`guide blocks without Greek ${tables.blocks} > budget ${GUIDE_BLOCKS_WITHOUT_GREEK}: translate the new text`);
if (tables.blocks < GUIDE_BLOCKS_WITHOUT_GREEK) console.log(`  (the budget can come down to ${tables.blocks})`);

// ---------- 2-3. every tab, in Greek, then back in English ----------
const TABS = ['tabDesign', 'tabVehicle', 'tabGarage', 'tabTrack', 'tabRace', 'tabEngine', 'tabDyno', 'tabGuide', 'tabOptions'];
const sweep = (p, skip) => p.evaluate((skip) => {
  const vis = el => { for (let e = el; e; e = e.parentElement) { const cs = getComputedStyle(e); if (cs.display === 'none' || cs.visibility === 'hidden' || e.hidden) return false; } return el.getClientRects().length > 0; };
  const out = [], skipped = el => el.closest(skip);
  const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n; (n = w.nextNode());) { const el = n.parentElement, t = n.textContent.replace(/\s+/g, ' ').trim();
    if (t && el && !/^(SCRIPT|STYLE)$/.test(el.tagName) && !skipped(el) && vis(el)) out.push({ t, at: (el.closest('[id]') || el).id }); }
  for (const el of document.querySelectorAll('[title],[aria-label],[placeholder]')) { if (skipped(el) || !vis(el)) continue;
    for (const a of ['title', 'aria-label', 'placeholder']) { const v = el.getAttribute(a); if (v) out.push({ t: v, at: el.id + '[' + a + ']' }); } }
  for (const s of document.querySelectorAll('select')) { if (skipped(s) || !vis(s)) continue;
    for (const o of s.options) out.push({ t: o.textContent.trim(), at: s.id + ' option' });
    for (const g of s.querySelectorAll('optgroup')) out.push({ t: g.label, at: s.id + ' group' }); }
  return out;
}, skip);
const click = (p, id) => p.evaluate(id => { const e = document.getElementById(id); if (e) e.click(); }, id);
async function everyTab(p) {
  const all = [];
  for (const t of TABS) { await click(p, t); await p.waitForTimeout(t === 'tabTrack' ? 3000 : 300); all.push(...(await sweep(p, SKIP)).map(x => ({ ...x, tab: t })));
    if (t === 'tabRace') await click(p, 'raceBack'); }
  return all;
}
const english = list => {
  const bad = new Map();
  // engine-sim is a project's name, which its two English words would otherwise flag
  for (const x of list) { const words = (x.t.replace(/engine-sim/g, '').match(/[A-Za-z]{3,}/g) || []).filter(w => !ALLOW.has(w));
    if (words.length) bad.set(x.at + ': ' + x.t.slice(0, 90), x.tab); }
  return [...bad].map(([k, tab]) => tab + ' ' + k);
};
// the names of real circuits, engines and cars, wherever they turn up (the scorecard names the circuit)
for (const w of await page.evaluate(() => [...Object.values(TRACKS).map(t => t.label), ...PRESETS.map(p => p.name),
  ...VEHICLE_PRESETS.map(p => p.name)].join(' ').match(/[A-Za-z]{3,}/g) || [])) ALLOW.add(w);
const atLoad = english(await everyTab(page));
console.log('Greek at load, English left:', atLoad.length);
const p2 = await open(null);
await p2.evaluate(() => applyLang('el')); await p2.waitForTimeout(300);
const switched = english(await everyTab(p2));
console.log('switched to Greek, English left:', switched.length);
for (const [name, list] of [['on a load in Greek', atLoad], ['after switching to Greek', switched]])
  if (list.length) fails.push(`English ${name}:\n    ` + list.slice(0, 40).join('\n    ') + (list.length > 40 ? `\n    … ${list.length - 40} more` : ''));

await p2.evaluate(() => applyLang('en')); await p2.waitForTimeout(300);
const back = [];
// μ is the friction coefficient's symbol, in either language
for (const x of await everyTab(p2)) if (/[Ͱ-λν-Ͽ]/.test(x.t) &&!/ΕΛΛΗΝΙΚΑ|Ελληνικά/.test(x.t)) back.push(x.tab + ' ' + x.at + ': ' + x.t.slice(0, 90));
console.log('back in English, Greek left:', back.length);
if (back.length) fails.push('Greek left after switching back to English:\n    ' + [...new Set(back)].slice(0, 30).join('\n    '));

console.log('\nERRORS:', errors.length ? errors : 'none');
console.log(fails.length ? 'FAIL:\n  ' + fails.join('\n  ') : '\nPASS');
await browser.close();
process.exit(fails.length || errors.length ? 1 : 0);
