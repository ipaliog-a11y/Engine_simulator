// The combustion engine's design as cards (build 239).
//
// WHY THIS EXISTS. Build 238 put the electric drive in cards; the combustion engine, about fifty fields in seven grids,
// was still a sheet of bare values. Build 239 moves it into six cards on the same machinery (src/js/design-cards.js,
// src/js/engine-designer.js), with a preview that runs BUILD's own code on the form. What must hold:
//   · every combustion field keeps its id and stays a .field with its label, inside the cards; ENGINE TYPE stays
//     outside them, shown for an electric build too;
//   · six cards and a menu of six; on a wide panel one card is shown, and the menu switches it;
//   · the preview is BUILD's: for every factory combustion engine, its peak power, torque, reliability and grade are
//     the scorecard's after BUILD, and working it out leaves the live engine and state as they were;
//   · a slider writes its field, a tick sets a factory engine's value, and the change shows its effect beside it;
//   · a redline past the valve-float rpm is flagged on the redline and named in WHAT HOLDS IT BACK;
//   · "?" fills the help, and its guide button opens the field's page; BASIC hides the advanced fields, ADVANCED shows
//     them; a field the design does not use (boost on an engine without a turbo) is not shown;
//   · a hybrid shows the engine's cards and the motor's, with one bar at the bottom of a phone;
//   · in Greek none of the cards' English is left; on a phone nothing scrolls sideways and the cards fold;
//   · no page errors.
import { chromium } from './pw.mjs';
import { fileURLToPath, pathToFileURL } from 'url';
import path from 'path';
const repo = fileURLToPath(new URL('..', import.meta.url));
const url = pathToFileURL(path.join(repo, 'index.html')).href;
const browser = await chromium.launch();
const errors = [], fails = [];
const watch = p => {
  p.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  p.on('pageerror', e => errors.push('pageerror: ' + e.message));
};
// load a factory engine the way the ENGINE tab's build list does, then wait out the preview
const load = (p, re) => p.evaluate(async re => {
  const pr = FACTORY_ENGINES.find(q => new RegExp(re).test(q.name));
  applyBuild({ engine: Object.assign({}, pr.engine), tune: Object.assign({}, STD_TUNE), vehicle: readVehicleFromForm(), name: pr.name });
  setTab('design');
  await new Promise(r => setTimeout(r, 120));
  ICD.update();
  return pr.name;
}, re);
const settle = p => p.evaluate(() => new Promise(r => setTimeout(() => requestAnimationFrame(() => requestAnimationFrame(r)), 400)));
const open = async (w, h) => {
  const p = await browser.newPage({ viewport: { width: w, height: h } });
  watch(p);
  await p.addInitScript(() => { try { ['pes.icdAdv', 'pes.icdCard', 'pes.evdAdv', 'pes.evdCard'].forEach(k => localStorage.removeItem(k)); } catch (e) {} });
  await p.goto(url, { waitUntil: 'networkidle' });
  await p.evaluate(() => setTab('design'));
  return p;
};

// ---------- 1. the fields, the cards, the menu ----------
const page = await open(1400, 1000);
await load(page, 'EA888');
const shape = await page.evaluate(() => {
  const box = document.getElementById('icDesigner');
  const ids = Object.keys(ICD_KEY).concat(['valFloat', 'valOverlap', 'valRam', 'valScav']);
  const lost = ids.filter(id => { const el = document.getElementById(id), f = el && el.closest('.field'); return !f || !box.contains(f) || !f.querySelector('label'); });
  const helpless = ids.filter(id => !(ICD_FIELDS[id] && ICD_FIELDS[id].what && ICD_FIELDS[id].trade));
  const shown = [...box.querySelectorAll('.evd-card')].filter(c => getComputedStyle(c).display !== 'none').map(c => c.dataset.card);
  const type = document.getElementById('edType');
  return { n: ids.length, lost, helpless, cards: box.querySelectorAll('.evd-card').length, rail: box.querySelectorAll('.evd-rb').length, shown,
    typeOutside: !box.contains(type) };
});
console.log(`== ${shape.n} fields; cards ${shape.cards}, menu ${shape.rail}, shown: ${shape.shown.join(',')}; lost: ${shape.lost.join(',') || 'none'} ==`);
if (shape.lost.length) fails.push('fields lost their id, label or card: ' + shape.lost.join(', '));
if (shape.helpless.length) fails.push('fields without help: ' + shape.helpless.join(', '));
if (shape.cards !== 6 || shape.rail !== 6) fails.push(`expected 6 cards and 6 menu entries, got ${shape.cards} and ${shape.rail}`);
if (shape.shown.join() !== 'block') fails.push('a wide panel shows one card, BLOCK first: ' + shape.shown.join());
if (!shape.typeOutside) fails.push('ENGINE TYPE moved into the cards; an electric build would lose it');
await page.click('#icdRb-fuel');
const afterRail = await page.evaluate(() => [...document.querySelectorAll('#icDesigner .evd-card')].filter(c => getComputedStyle(c).display !== 'none').map(c => c.dataset.card).join());
if (afterRail !== 'fuel') fails.push('the menu did not switch to FUEL & SPARK: ' + afterRail);
await page.click('#icdRb-block');

// ---------- 2. the preview is BUILD's, for every factory combustion engine, and leaves the live engine alone ----------
const sweep = await page.evaluate(() => {
  const out = { n: 0, bad: [], disturbed: [], slow: [] };
  for (const pr of FACTORY_ENGINES.filter(q => q.engine.type !== 'electric')) {
    applyBuild({ engine: Object.assign({}, pr.engine), tune: Object.assign({}, STD_TUNE), vehicle: readVehicleFromForm(), name: pr.name });
    const live = engine, liveScore = JSON.stringify(engine.score), st = JSON.stringify(state), rev = buildRev;
    const t0 = performance.now(); const r = icdCompute(); const ms = performance.now() - t0;
    if (engine !== live || JSON.stringify(engine.score) !== liveScore || JSON.stringify(state) !== st || buildRev !== rev) out.disturbed.push(pr.name);
    buildEngine();
    const s = engine.score;
    if (r.hp !== s.peakHP || r.tq !== s.peakTQ || r.rel !== s.reliability || r.grade !== s.grade || Math.abs(r.cost - engine.cost) > 0.5)
      out.bad.push(`${pr.name}: preview ${r.hp} hp ${r.tq} Nm rel ${r.rel} ${r.grade} $${Math.round(r.cost)} | BUILD ${s.peakHP} hp ${s.peakTQ} Nm rel ${s.reliability} ${s.grade} $${Math.round(engine.cost)}`);
    if (ms > 1500) out.slow.push(pr.name + ' ' + Math.round(ms) + ' ms');
    out.n++; out.max = Math.max(out.max || 0, ms);
  }
  return out;
});
console.log(`== preview against BUILD: ${sweep.n} engines, ${sweep.bad.length} differ, ${sweep.disturbed.length} disturbed the live engine; slowest ${Math.round(sweep.max)} ms ==`);
sweep.bad.slice(0, 5).forEach(b => console.log('  ' + b));
if (sweep.bad.length) fails.push(`${sweep.bad.length} engines preview other figures than BUILD gives`);
if (sweep.disturbed.length) fails.push('the preview changed the live engine or state: ' + sweep.disturbed.slice(0, 3).join(', '));
if (sweep.slow.length) fails.push('previews slower than 1.5 s: ' + sweep.slow.join(', '));

// ---------- 3. slider, tick, chips; valve float past the redline ----------
await load(page, 'EA888');
const slide = await page.evaluate(async () => {
  const f = document.getElementById('edBore').closest('.field'), rng = f.querySelector('input[type=range]');
  const before = icdState.res.hp;
  rng.value = 900; rng.dispatchEvent(new Event('input', { bubbles: true })); rng.dispatchEvent(new Event('change', { bubbles: true }));
  await new Promise(r => setTimeout(r, 300));
  const val = +document.getElementById('edBore').value, chips = document.getElementById('icdMeta-edBore').querySelectorAll('.evd-chip').length;
  const tick = f.querySelector('.evd-tick'); tick.click();
  await new Promise(r => setTimeout(r, 300));
  return { val, chips, before, after: icdState.res.hp, tickV: +tick.dataset.v, nowV: +document.getElementById('edBore').value };
});
console.log(`== bore slider to 90%: ${slide.val} mm, ${slide.chips} chips (${slide.before} -> ${slide.after} hp after the tick); tick -> ${slide.nowV} mm ==`);
if (!(slide.val > 100)) fails.push('the slider did not write the bore: ' + slide.val);
if (!slide.chips) fails.push('a change shows no effect beside the field');
if (slide.nowV !== slide.tickV) fails.push(`the tick did not set its value: ${slide.nowV} vs ${slide.tickV}`);
// a factory engine whose valves float below the highest redline its type allows, its redline set 200 rpm past the float
const flt = await page.evaluate(async () => {
  let pr = null, f = 0;
  for (const q of FACTORY_ENGINES.filter(q => q.engine.type === 'petrol4')) {
    applyBuild({ engine: Object.assign({}, q.engine), tune: Object.assign({}, STD_TUNE), vehicle: readVehicleFromForm(), name: q.name });
    const fl = engine.floatRpm, mx = ENGINE_TYPE.petrol4.redMax;
    if (fl > 0 && fl + 250 < mx) { pr = q; f = fl; break; }
  }
  if (!pr) return { none: true };
  setTab('design'); ICD.update();
  const red = document.getElementById('edRedline');
  red.value = Math.ceil((f + 200) / 50) * 50; red.dispatchEvent(new Event('change', { bubbles: true }));
  await new Promise(r => setTimeout(r, 600));
  const out = { name: pr.name, float: icdState.res.float, red: icdState.res.redline, warn: !!document.querySelector('#icdMeta-edRedline .evd-warn'), verdict: document.getElementById('icdVerdict').textContent,
    railWarn: document.getElementById('icdRb-block').classList.contains('warn') };
  return out;
});
if (flt.none) { fails.push('no factory engine floats below its type\'s highest redline: the check has nothing to test'); flt.verdict = ''; }
else console.log(`== ${flt.name}: redline ${flt.red} past float ${Math.round(flt.float)}: warning ${flt.warn}, menu ▲ ${flt.railWarn}; "${flt.verdict.slice(0, 70)}…" ==`);
if (!flt.warn || !flt.railWarn) fails.push('a redline past valve float is not flagged on the redline and in the menu');
if (!/float/.test(flt.verdict)) fails.push('WHAT HOLDS IT BACK does not name the valve float');

// ---------- 4. help and the guide, levels, unused fields ----------
await load(page, 'EA888');
const help = await page.evaluate(() => {
  document.querySelector('#icDesigner .evd-q[data-f="edCR"]').click();
  const h = document.getElementById('icdHelp').innerText;
  document.querySelector('#icdHelp .evd-guide').click();
  const pg = [...document.querySelectorAll('#guidePanel .guide-page')].find(p => !p.hidden);
  setTab('design');
  return { h, page: pg && pg.id };
});
console.log('== help: ' + help.h.replace(/\s+/g, ' ').slice(0, 100) + '… | guide: ' + help.page + ' ==');
for (const w of ['COMPRESSION', 'WHAT IT IS', 'WHAT IT TRADES', 'REAL ENGINES']) if (!help.h.includes(w)) fails.push('the help for compression lacks ' + w);
if (help.page !== 'gp-knock') fails.push('the compression help opened ' + help.page + ', not the knock page');
const lv = await page.evaluate(() => {
  const vis = id => getComputedStyle(document.getElementById(id).closest('.field')).display !== 'none';
  document.getElementById('icdRb-head').click();
  const basic = { mat: vis('edValveMat'), cam: vis('edCam'), more: document.querySelector('#icdCard-head .evd-more').innerText };
  document.querySelector('#icdLevel [data-lv="1"]').click();
  const adv = vis('edValveMat');
  document.querySelector('#icdLevel [data-lv="0"]').click();
  return { basic, adv };
});
console.log(`== BASIC: valve material ${lv.basic.mat ? 'shown' : 'hidden'}, "${lv.basic.more}" | ADVANCED: ${lv.adv ? 'shown' : 'hidden'} ==`);
if (lv.basic.mat || !lv.basic.cam || !/3/.test(lv.basic.more)) fails.push('BASIC should hide 3 head fields and keep the cam');
if (!lv.adv) fails.push('ADVANCED should show VALVE MATERIAL');
await load(page, 'LS3');
const na = await page.evaluate(() => ({ boost: getComputedStyle(document.getElementById('edBoost').closest('.field')).display,
  intake: getComputedStyle(document.getElementById('edIntake').closest('.field')).display }));
if (na.boost !== 'none' || na.intake === 'none') fails.push('a naturally aspirated engine should hide BOOST TARGET and show INTAKE TYPE');

// ---------- 5. electric and hybrid ----------
await load(page, 'Model 3 RWD drive');
const ev = await page.evaluate(() => ({ ice: getComputedStyle(document.getElementById('icDesigner')).display, type: getComputedStyle(document.getElementById('edType').closest('.field')).display }));
if (ev.ice !== 'none' || ev.type === 'none') fails.push('an electric build should hide the engine cards and keep ENGINE TYPE');
await load(page, 'Ioniq Hybrid');
const hy = await page.evaluate(() => ({ ice: getComputedStyle(document.getElementById('icDesigner')).display, ev: getComputedStyle(document.getElementById('evDesigner')).display, hp: icdState.res && icdState.res.hp }));
console.log(`== Ioniq Hybrid: engine cards ${hy.ice}, motor cards ${hy.ev}, engine ${hy.hp} hp ==`);
if (hy.ice === 'none' || hy.ev === 'none' || !(hy.hp > 50)) fails.push('a hybrid should show both the engine and the motor cards');

// ---------- 6. Greek ----------
await load(page, 'K20C1');
const greek = await page.evaluate(async () => {
  applyLang('el');
  document.querySelector('#icDesigner .evd-q[data-f="edBore"]').click();
  await new Promise(r => setTimeout(r, 400));
  const english = new Set();
  ICD_CARDS.forEach(c => { english.add(c.title); if (c.cap) english.add(c.cap); });
  Object.values(ICD_FIELDS).forEach(f => { english.add(f.what); english.add(f.trade); });
  ['WHAT YOUR ENGINE DOES', 'WHAT HOLDS IT BACK', 'ABOUT THIS INPUT', 'REAL ENGINES', 'DISPLACEMENT', 'RELIABILITY', 'valve float', 'Combustion engine'].forEach(w => english.add(w));
  let text = document.getElementById('icdSide').innerText + document.getElementById('icdRail').innerText;
  for (const c of ICD_CARDS) { document.getElementById('icdRb-' + c.id).click(); text += document.getElementById('icdCard-' + c.id).innerText; }
  const left = [...english].filter(w => w.length > 3 && text.includes(w));
  const verdict = document.getElementById('icdVerdict').textContent;
  applyLang('en');
  return { left, greek: /[α-ω]/.test(verdict) };
});
console.log(`== Greek: English left ${greek.left.length} ==`);
if (greek.left.length) fails.push('English left in Greek: ' + greek.left.slice(0, 5).join(' | '));
if (!greek.greek) fails.push('the verdict is not in Greek');
await page.close();

// ---------- 7. a phone, with a hybrid: one bar at the bottom ----------
const phone = await open(400, 860);
await load(phone, 'Ioniq Hybrid');
await settle(phone);
const ph = await phone.evaluate(() => {
  const fixed = [...document.querySelectorAll('.evd-side')].filter(s => getComputedStyle(s).position === 'fixed' && s.offsetParent !== null || getComputedStyle(s).position === 'fixed' && s.getClientRects().length);
  const bodies = () => [...document.querySelectorAll('#icDesigner .evd-card')].filter(c => getComputedStyle(c.querySelector('.evd-body')).display !== 'none').map(c => c.dataset.card);
  const first = bodies();
  document.querySelector('#icdCard-air .evd-head').click();
  return { sw: document.documentElement.scrollWidth, fixed: fixed.map(s => s.id), first, second: bodies(), mini: document.getElementById('icdMini').innerText.replace(/\s+/g, ' ') };
});
console.log(`== phone: width ${ph.sw}; fixed bars ${ph.fixed.join(',')} "${ph.mini}"; open ${ph.first} then ${ph.second} ==`);
if (ph.sw > 400) fails.push('a phone scrolls sideways: ' + ph.sw + ' px');
if (ph.fixed.join() !== 'icdSide' || !/hp/.test(ph.mini)) fails.push('a phone should have one bar at the bottom, the engine\'s: ' + ph.fixed.join());
if (ph.first.join() !== 'block' || ph.second.join() !== 'air') fails.push('the cards should fold one at a time: ' + ph.first + ' then ' + ph.second);
await browser.close();

if (errors.length) fails.push(...errors.slice(0, 5));
if (fails.length) { console.log('\nFAIL\n  ' + fails.join('\n  ')); process.exit(1); }
console.log('\nPASS: the engine\'s cards keep their fields, preview BUILD exactly, explain each input, and fold on a phone');
