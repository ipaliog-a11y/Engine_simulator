// The vehicle's design as cards (build 247).
//
// WHY THIS EXISTS. Builds 238 and 239 put the electric drive and the combustion engine in cards; the VEHICLE tab, about
// thirty fields in four grids, was still a sheet of bare values. Build 247 moves it into six cards on the same machinery
// (src/js/design-cards.js, src/js/vehicle-designer.js). What must hold:
//   · every vehicle field keeps its id and stays a .field with its label, inside the cards; seven cards (CHASSIS NUMBERS since build 250), a menu of seven,
//     and on a wide panel one card shown, which the menu switches;
//   · the preview is the car's own run: after loading a factory car, its 0-100 and top speed are PERFORMANCE's;
//   · a slider writes its field and rebuilds the car (the form is live), a tick sets a factory car's value, and the
//     change shows its effect beside it; GEARING's own slider moves the final drive in the preview;
//   · a tyre rated under the top speed is flagged on the rating, in the menu and in WHAT HOLDS IT BACK;
//   · "?" fills the help; BASIC hides the springs, ADVANCED shows them; an electric car hides the gearbox fields;
//   · on a phone nothing scrolls sideways and the cards fold; no page errors.
import { chromium } from './pw.mjs';
import { fileURLToPath, pathToFileURL } from 'url';
import path from 'path';
const repo = fileURLToPath(new URL('..', import.meta.url));
const url = pathToFileURL(path.join(repo, 'index.html')).href;
const browser = await chromium.launch();
const errors = [], fails = [];
const settle = p => p.evaluate(() => new Promise(r => setTimeout(() => requestAnimationFrame(() => requestAnimationFrame(r)), 200)));
const open = async (w, h) => {
  const p = await browser.newPage({ viewport: { width: w, height: h } });
  p.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  p.on('pageerror', e => errors.push('pageerror: ' + e.message));
  await p.addInitScript(() => { try { ['pes.vcdAdv', 'pes.vcdCard'].forEach(k => localStorage.removeItem(k)); } catch (e) {} });
  await p.goto(url, { waitUntil: 'networkidle' });
  await p.evaluate(() => setTab('vehicle'));
  return p;
};
const loadCar = (p, re) => p.evaluate(re => { const i = FACTORY_CARS.findIndex(q => new RegExp(re).test(q.name)); loadFactoryCarUI(i); setTab('vehicle'); return FACTORY_CARS[i].name; }, re);

// ---------- 1. the fields, the cards, the menu ----------
const page = await open(1400, 1000);
await loadCar(page, 'Porsche 911');
await settle(page);
const shape = await page.evaluate(() => {
  const box = document.getElementById('vhDesigner');
  const ids = Object.keys(VCD_FIELDS).concat(['vhSpacing', 'vhGearing', 'btnGearRatios', 'btnGG', 'btnSusp']);
  const lost = ids.filter(id => { const el = document.getElementById(id), f = el && el.closest('.field'); return !f || !box.contains(f) || !f.querySelector('label'); });
  const shown = [...box.querySelectorAll('.evd-card')].filter(c => getComputedStyle(c).display !== 'none').map(c => c.dataset.card);
  return { n: ids.length, lost, cards: box.querySelectorAll('.evd-card').length, rail: box.querySelectorAll('.evd-rb').length, shown };
});
console.log(`== ${shape.n} fields; cards ${shape.cards}, menu ${shape.rail}, shown: ${shape.shown.join(',')}; lost: ${shape.lost.join(',') || 'none'} ==`);
if (shape.lost.length) fails.push('fields lost their id, label or card: ' + shape.lost.join(', '));
if (shape.cards !== 7 || shape.rail !== 7) fails.push(`expected 7 cards and 7 menu entries, got ${shape.cards} and ${shape.rail}`);
if (shape.shown.join() !== 'chassis') fails.push('a wide panel shows one card, CHASSIS & DRIVE first: ' + shape.shown.join());
await page.click('#vcdRb-tyres');
const afterRail = await page.evaluate(() => [...document.querySelectorAll('#vhDesigner .evd-card')].filter(c => getComputedStyle(c).display !== 'none').map(c => c.dataset.card).join());
if (afterRail !== 'tyres') fails.push('the menu did not switch to WHEELS & TYRES: ' + afterRail);

// ---------- 2. the preview is the car's own run ----------
for (const re of ['Civic Type R', 'Model 3', 'Prius', 'Alto Works']) {
  const name = await loadCar(page, re);
  await settle(page);
  const r = await page.evaluate(() => ({ t: VCD.st.res && VCD.st.res.t100, top: VCD.st.res && VCD.st.res.top, pt: perf.t100, ptop: perf.topSpeed }));
  console.log(`  ${name}: preview ${r.t}/${r.top && r.top.toFixed(0)}, PERFORMANCE ${r.pt}/${r.ptop && r.ptop.toFixed(0)}`);
  if (r.t !== r.pt || r.top !== r.ptop) fails.push(`${name}: the preview is not PERFORMANCE's`);
}

// ---------- 3. sliders, ticks, chips, GEARING ----------
await loadCar(page, 'Porsche 911');
await page.click('#vcdRb-tyres');
await settle(page);
const slid = await page.evaluate(async () => {
  const rng = document.querySelector('#vhTireW').closest('.field').querySelector('.evd-track input[type=range]');
  const w0 = vehicle.tireWidth;
  rng.value = 900; rng.dispatchEvent(new Event('input', { bubbles: true })); rng.dispatchEvent(new Event('change', { bubbles: true }));
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  const out = { w0, w1: vehicle.tireWidth, box: +document.getElementById('vhTireW').value, chips: document.getElementById('vcdMeta-vhTireW').querySelectorAll('.evd-chip').length };
  const tick = document.querySelector('#vhTireA').closest('.field').querySelector('.evd-tick');
  tick.click();
  out.tickV = +tick.dataset.v; out.aspect = vehicle.tireAspect;
  const fd0 = VCD.st.res.fd, g = document.getElementById('vhGearing');
  g.value = 5; g.dispatchEvent(new Event('input', { bubbles: true }));
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  out.fd0 = fd0; out.fd1 = VCD.st.res.fd;
  return out;
});
console.log(`  slider: width ${slid.w0} -> ${slid.w1} (box ${slid.box}), chips ${slid.chips}; tick ${slid.tickV} -> aspect ${slid.aspect}; final drive ${slid.fd0.toFixed(2)} -> ${slid.fd1.toFixed(2)}`);
if (slid.w1 === slid.w0 || slid.w1 !== slid.box) fails.push('the slider did not rebuild the car with its width');
if (!slid.chips) fails.push('the slider\'s change shows no effect beside it');
if (slid.aspect !== slid.tickV) fails.push('a tick did not set the car\'s aspect');
if (!(slid.fd1 > slid.fd0)) fails.push('GEARING\'s slider did not move the preview\'s final drive');

// ---------- 4. a tyre rated under the top speed ----------
await loadCar(page, 'Porsche 911');
await page.selectOption('#vhRating', 'T');
await settle(page);
const warn = await page.evaluate(() => ({ meta: document.getElementById('vcdMeta-vhRating').innerText, rail: document.getElementById('vcdRb-tyres').classList.contains('warn'),
  verdict: document.getElementById('vcdVerdict').innerText }));
console.log(`  rating T: "${warn.meta}" | ${warn.verdict}`);
if (!/▲/.test(warn.meta) || !warn.rail || !/rating/.test(warn.verdict)) fails.push('a tyre rated under the top speed is not flagged');

// ---------- 5. help, BASIC/ADVANCED, an electric car ----------
await page.click('#vcdRb-susp');
const lv = await page.evaluate(() => {
  const vis = id => getComputedStyle(document.getElementById(id).closest('.field')).display !== 'none';
  document.querySelector('#vcdLevel [data-lv="0"]').click(); const basic = vis('vhSpringF');
  document.querySelector('#vcdLevel [data-lv="1"]').click(); const adv = vis('vhSpringF');
  document.querySelector('.evd-q[data-f="vhSusp"]').click();
  return { basic, adv, help: document.getElementById('vcdHelp').innerText };
});
if (lv.basic || !lv.adv) fails.push(`BASIC/ADVANCED: springs shown ${lv.basic}/${lv.adv}`);
if (!/WHAT IT TRADES/.test(lv.help)) fails.push('"?" did not fill the help');
await loadCar(page, 'Model 3');
await settle(page);
const ev = await page.evaluate(() => ({ hidden: ['vhGearbox', 'vhGears'].every(id => getComputedStyle(document.getElementById(id).closest('.field')).display === 'none'),
  sum: document.querySelector('#vcdRb-gearbox .evd-sum').innerText }));
if (!ev.hidden || !/SINGLE/.test(ev.sum)) fails.push('an electric car: gearbox fields hidden ' + ev.hidden + ', summary "' + ev.sum + '"');

// ---------- 6. a phone ----------
const ph = await open(390, 800);
await loadCar(ph, 'Civic Type R');
await settle(ph);
const phone = await ph.evaluate(() => ({ sw: document.documentElement.scrollWidth,
  bodies: [...document.querySelectorAll('#vhDesigner .evd-body')].filter(b => getComputedStyle(b).display !== 'none').length,
  mini: document.getElementById('vcdMini').innerText.replace(/\s+/g, ' ') }));
console.log(`  phone: width ${phone.sw}, open cards ${phone.bodies}, bar "${phone.mini}"`);
if (phone.sw > 390) fails.push('a phone scrolls sideways: ' + phone.sw);
if (phone.bodies > 1) fails.push('on a phone the cards do not fold: ' + phone.bodies + ' open');
if (!/km\/h/.test(phone.mini)) fails.push('the phone has no bar of what the car does');

await browser.close();
if (errors.length) fails.push(...errors.slice(0, 5));
console.log(fails.length ? 'FAIL\n  ' + fails.join('\n  ') : 'PASS');
process.exit(fails.length ? 1 : 0);
