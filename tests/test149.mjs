// The electric drive's design as cards (build 238).
//
// WHY THIS EXISTS. The ENGINE tab's motor, inverter and battery were four grids of bare numbers: nothing said what a
// field does, what a real drive uses, or what a change did until BUILD & DYNO. Build 238 puts them in cards with a
// slider, real-drive ticks, help and a live preview (src/js/ev-designer.js). What must hold:
//   · the 27 fields keep their ids and stay .field elements with their labels, all inside the cards: saves, presets,
//     the build and the other tests read them as before;
//   · seven cards and a menu of seven; on a wide panel one card is shown, and the menu switches it;
//   · the preview is the DYNO's: for every electric preset its peak power and torque are the scorecard's after BUILD;
//   · a slider writes its field, a tick sets a real drive's value, and the change shows its effect beside the field;
//   · "?" fills the side panel's help (what it is, what it trades, the real drives) and its guide button opens the page;
//   · BASIC hides the advanced fields, says how many, and ADVANCED shows them;
//   · a hybrid shows the cards for its motor, without the electric car's own fields, and a combustion engine none;
//   · in Greek, none of the cards' English text is left;
//   · on a phone: no sideways scroll, the cards fold one at a time, the help opens under the field, and the results are
//     a bar fixed to the bottom that opens;
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
const FIELDS = ['evMotorType', 'evRotorD', 'evStack', 'evPoles', 'evTurns', 'evWire', 'evConductor', 'evMagnet', 'evRetention', 'evMaxRpm',
  'evCooling', 'evLamination', 'evInverter', 'evAmps', 'evRegen', 'evRearCount', 'evFront', 'evFrontD', 'evFrontStack', 'evFrontPoles',
  'evFrontTurns', 'evFrontAmps', 'evFrontFd', 'evChem', 'evSeries', 'evKWh', 'evYear'];
// load a factory engine the way the menu does, and wait for the preview
const load = (p, re) => p.evaluate(async re => {
  const i = FACTORY_ENGINES.findIndex(q => new RegExp(re).test(q.name));
  applyEngineToForm(Object.assign({}, FACTORY_ENGINES[i].engine));
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  return FACTORY_ENGINES[i].name;
}, re);
const open = async (w, h) => {
  const p = await browser.newPage({ viewport: { width: w, height: h } });
  watch(p);
  await p.addInitScript(() => { try { localStorage.removeItem('pes.evdAdv'); localStorage.removeItem('pes.evdCard'); } catch (e) {} });
  await p.goto(url, { waitUntil: 'networkidle' });
  await p.evaluate(() => document.getElementById('tabDesign').click());
  return p;
};

// ---------- 1. the fields, the cards, the menu ----------
const page = await open(1400, 1000);
await load(page, 'Model 3 RWD drive');
const shape = await page.evaluate(FIELDS => {
  const box = document.getElementById('evDesigner');
  const fields = FIELDS.map(id => { const el = document.getElementById(id), f = el && el.closest('.field');
    return { id, ok: !!f && box.contains(f) && !!f.querySelector('label[for="' + id + '"]') }; });
  const shown = [...box.querySelectorAll('.evd-card')].filter(c => getComputedStyle(c).display !== 'none').map(c => c.dataset.card);
  return { fields: fields.filter(f => !f.ok).map(f => f.id), cards: box.querySelectorAll('.evd-card').length,
    rail: box.querySelectorAll('.evd-rb').length, shown, visible: getComputedStyle(box).display !== 'none' };
}, FIELDS);
console.log(`== cards ${shape.cards}, menu ${shape.rail}, shown: ${shape.shown.join(',')}; fields outside the cards: ${shape.fields.join(',') || 'none'} ==`);
if (!shape.visible) fails.push('the cards are not shown for an electric build');
if (shape.fields.length) fails.push('fields lost their id, label or card: ' + shape.fields.join(', '));
if (shape.cards !== 7 || shape.rail !== 7) fails.push(`expected 7 cards and 7 menu entries, got ${shape.cards} and ${shape.rail}`);
if (shape.shown.length !== 1) fails.push('a wide panel shows one card at a time, it shows ' + shape.shown.length);
await page.click('#evdRb-batt');
const afterRail = await page.evaluate(() => [...document.querySelectorAll('#evDesigner .evd-card')].filter(c => getComputedStyle(c).display !== 'none').map(c => c.dataset.card));
if (afterRail.join() !== 'batt') fails.push('the menu did not switch to the battery card: ' + afterRail.join());
await page.click('#evdRb-size');

// ---------- 2. the preview is the DYNO's ----------
console.log('== preview against the scorecard after BUILD ==');
for (const re of ['Model 3 RWD drive', 'Model Y Long Range drive', 'Model S Plaid drive']) {
  const name = await load(page, re);
  const o = await page.evaluate(() => {
    const r = evdState.res, t0 = performance.now(); evdCompute(); const ms = performance.now() - t0;
    buildEngine();
    return { pk: r && r.pk, tq: r && r.tq, top: r && r.top, kW: engine.score.peakKW, Nm: engine.score.peakTQ, nMax: engine.motor.nMax, ms };
  });
  console.log(`  ${name}: preview ${o.pk.toFixed(1)} kW ${o.tq.toFixed(1)} Nm ${o.top} rpm | DYNO ${o.kW} kW ${o.Nm} Nm ${o.nMax} rpm | ${o.ms.toFixed(1)} ms`);
  if (Math.abs(o.pk - o.kW) > 0.5) fails.push(`${name}: preview peak ${o.pk.toFixed(1)} kW, the DYNO's ${o.kW}`);
  if (Math.abs(o.tq - o.Nm) > 0.5) fails.push(`${name}: preview torque ${o.tq.toFixed(1)} Nm, the DYNO's ${o.Nm}`);
  if (o.top !== o.nMax) fails.push(`${name}: preview top ${o.top} rpm, the motor's ${o.nMax}`);
  if (o.ms > 250) fails.push(`${name}: one preview took ${o.ms.toFixed(0)} ms; a slider would stutter`);
}

// ---------- 3. slider, tick, the effect of a change ----------
await load(page, 'Model 3 RWD drive');
const slide = await page.evaluate(async () => {
  const f = document.getElementById('evRotorD').closest('.field'), rng = f.querySelector('input[type=range]');
  const before = evdState.res.pk;
  rng.value = 700; rng.dispatchEvent(new Event('input', { bubbles: true }));
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  const val = +document.getElementById('evRotorD').value, chips = document.getElementById('evdMeta-evRotorD').querySelectorAll('.evd-chip').length;
  const warn = !!document.getElementById('evdMeta-evRotorD').querySelector('.evd-warn');
  const tick = f.querySelector('.evd-tick'); tick.click();
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  return { val, chips, warn, before, after: evdState.res.pk, tickV: +tick.dataset.v, nowV: +document.getElementById('evRotorD').value,
    names: tick.title };
});
console.log(`== slider to 70%: rotor ${slide.val} mm, ${slide.chips} chips, rim warning ${slide.warn}; tick "${slide.names}" -> ${slide.nowV} mm ==`);
if (!(slide.val > 200)) fails.push('the slider did not write the rotor diameter: ' + slide.val);
if (!slide.chips) fails.push('a change shows no effect beside the field');
if (!slide.warn) fails.push('a 200+ mm rotor at 18,000 rpm passes its rim speed, and no warning says so');
if (slide.nowV !== slide.tickV) fails.push(`the tick did not set its value: ${slide.nowV} vs ${slide.tickV}`);

// ---------- 4. help and the guide ----------
const help = await page.evaluate(() => {
  document.querySelector('#evdCard-size .evd-q[data-f="evStack"]').click();
  const h = document.getElementById('evdHelp').innerText;
  const g = document.querySelector('#evdHelp .evd-guide'); g.click();
  const page = [...document.querySelectorAll('#guidePanel .guide-page')].find(p => !p.hidden);
  document.getElementById('tabDesign').click();
  return { h, page: page && page.id };
});
console.log('== help: ' + help.h.replace(/\s+/g, ' ').slice(0, 110) + '… | guide: ' + help.page + ' ==');
for (const w of ['STACK LENGTH', 'WHAT IT IS', 'WHAT IT TRADES', 'REAL DRIVES', 'Tesla Model 3 RWD'])
  if (!help.h.includes(w)) fails.push('the help for the stack length lacks ' + w);
if (help.page !== 'gp-evmotor') fails.push('the help\'s guide button opened ' + help.page + ', not the motor page');

// ---------- 5. BASIC and ADVANCED ----------
const lv = await page.evaluate(async () => {
  const vis = id => getComputedStyle(document.getElementById(id).closest('.field')).display !== 'none';
  document.getElementById('evdRb-wind').click();
  const more = document.querySelector('#evdCard-wind .evd-more').innerText;
  const basic = { wire: vis('evWire'), turns: vis('evTurns') };
  document.querySelector('#evdLevel [data-lv="1"]').click();
  const adv = { wire: vis('evWire'), more: document.querySelector('#evdCard-wind .evd-more').innerText };
  document.querySelector('#evdLevel [data-lv="0"]').click();
  return { more, basic, adv };
});
console.log(`== BASIC: winding ${lv.basic.wire ? 'shown' : 'hidden'}, "${lv.more}" | ADVANCED: winding ${lv.adv.wire ? 'shown' : 'hidden'} ==`);
if (lv.basic.wire || !lv.basic.turns) fails.push('BASIC should hide WINDING and keep TURNS PER PHASE');
if (!/2/.test(lv.more)) fails.push('BASIC should say 2 more fields in the winding card: ' + lv.more);
if (!lv.adv.wire || lv.adv.more) fails.push('ADVANCED should show WINDING, with no "more" left');

// ---------- 6. a hybrid, and a combustion engine ----------
await load(page, 'Ioniq Hybrid');
const hy = await page.evaluate(() => {
  const vis = id => getComputedStyle(document.getElementById(id).closest('.field')).display !== 'none';
  return { shown: getComputedStyle(document.getElementById('evDesigner')).display !== 'none', regen: vis('evRegen'), rear: vis('evRearCount'),
    h1: document.getElementById('evdH1').textContent, pk: evdState.res && evdState.res.pk, hybrid: evdState.res && evdState.res.hybrid };
});
console.log(`== Ioniq Hybrid: cards ${hy.shown}, "${hy.h1}", motor ${hy.pk && hy.pk.toFixed(1)} kW ==`);
if (!hy.shown || !hy.hybrid) fails.push('a hybrid shows no cards for its motor');
if (hy.regen || hy.rear) fails.push('a hybrid shows the electric car\'s own REGENERATION or REAR MOTORS');
if (!(hy.pk > 10)) fails.push('a hybrid\'s motor preview is empty');
await load(page, 'Civic Type R|GTI|^Honda|^Toyota');
const ice = await page.evaluate(() => getComputedStyle(document.getElementById('evDesigner')).display);
if (ice !== 'none') fails.push('a combustion engine shows the electric cards');

// ---------- 7. Greek ----------
await load(page, 'Model Y Long Range drive');
const greek = await page.evaluate(async () => {
  applyLang('el');
  document.querySelector('#evdCard-size .evd-q[data-f="evRotorD"]').click();
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  const english = new Set();
  EVD_CARDS.forEach(c => { english.add(c.title); if (c.cap) english.add(c.cap); });
  Object.values(EVD_FIELDS).forEach(f => { english.add(f.what); english.add(f.trade); });
  ['WHAT YOUR DRIVE DOES', 'WHAT HOLDS IT BACK', 'ABOUT THIS INPUT', 'WHAT IT IS', 'WHAT IT TRADES', 'REAL DRIVES', 'BASIC', 'ADVANCED',
    'PEAK POWER', 'TOP RPM', 'motor alone', 'rotor rim', 'inverter frequency', 'design limit'].forEach(w => english.add(w));
  const all = [...document.querySelectorAll('#evDesigner .evd-cards, #evDesigner .evd-side, #evDesigner .evd-rail')].map(e => e.innerText).join('\n');
  // every card, as a player would open each
  let cards = '';
  for (const c of EVD_CARDS) { document.getElementById('evdRb-' + c.id).click(); cards += document.getElementById('evdCard-' + c.id).innerText + '\n'; }
  const left = [...english].filter(w => w.length > 3 && (all + cards).includes(w));
  const verdict = document.getElementById('evdVerdict').textContent;
  applyLang('en');
  return { left, verdict: verdict.slice(0, 80), greek: /[α-ω]/.test(verdict) };
});
console.log(`== Greek: English left ${greek.left.length}; verdict "${greek.verdict}…" ==`);
if (greek.left.length) fails.push('English left in Greek: ' + greek.left.slice(0, 6).join(' | '));
if (!greek.greek) fails.push('the verdict is not in Greek');
await page.close();

// ---------- 8. a phone ----------
const phone = await open(400, 860);
await load(phone, 'Model 3 RWD drive');
const ph = await phone.evaluate(async () => {
  const shownBodies = () => [...document.querySelectorAll('#evDesigner .evd-card')].filter(c => getComputedStyle(c.querySelector('.evd-body')).display !== 'none').map(c => c.dataset.card);
  const first = shownBodies();
  document.querySelector('#evdCard-batt .evd-head').click();
  const second = shownBodies();
  document.querySelector('#evdCard-batt .evd-q[data-f="evKWh"]').click();
  const inline = document.querySelector('#evdCard-batt .evd-inhelp[data-f="evKWh"]');
  const mini = document.getElementById('evdMini'), cs = getComputedStyle(document.getElementById('evdSide'));
  const r = mini.getBoundingClientRect();
  const closedPanels = [...document.querySelectorAll('#evdSide .evd-panel')].filter(p => getComputedStyle(p).display !== 'none').length;
  mini.click();
  const openPanels = [...document.querySelectorAll('#evdSide .evd-panel')].filter(p => getComputedStyle(p).display !== 'none').length;
  mini.click();
  return { sw: document.documentElement.scrollWidth, first, second, inline: !!inline && !inline.hidden && inline.innerText.length > 40,
    fixed: cs.position, bottom: Math.round(innerHeight - r.bottom), mini: mini.innerText.replace(/\s+/g, ' '), closedPanels, openPanels };
});
console.log(`== phone: width ${ph.sw}; open ${ph.first.join(',')} then ${ph.second.join(',')}; help under the field ${ph.inline}; ` +
  `bar ${ph.fixed} ${ph.bottom}px from the bottom "${ph.mini}"; panels ${ph.closedPanels} closed, ${ph.openPanels} open ==`);
if (ph.sw > 400) fails.push('a phone scrolls sideways: ' + ph.sw + ' px');
if (ph.first.join() !== 'size' || ph.second.join() !== 'batt') fails.push('the cards should fold one at a time: ' + ph.first + ' then ' + ph.second);
if (!ph.inline) fails.push('on a phone the help should open under the field');
if (ph.fixed !== 'fixed' || ph.bottom > 2 || !/kW/.test(ph.mini)) fails.push('on a phone the results should be a bar at the bottom');
if (ph.closedPanels !== 0 || ph.openPanels < 2) fails.push('the bar should open the results and close again');
await browser.close();

if (errors.length) fails.push(...errors.slice(0, 5));
if (fails.length) { console.log('\nFAIL\n  ' + fails.join('\n  ')); process.exit(1); }
console.log('\nPASS: the electric drive\'s cards keep their fields, preview the DYNO, explain each input, and fold on a phone');
