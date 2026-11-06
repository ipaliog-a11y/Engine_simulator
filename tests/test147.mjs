// The car showcase (build 237).
//
// WHY THIS EXISTS. Every factory car now has a page of its own to be looked at: CAR SHOWCASE on the title menu opens a
// grid of all of them, each with its showroom picture and order number, and the chosen car large beside it with the
// figures its maker published. DRIVE THIS CAR loads it as the FACTORY CAR picker does. What must hold:
//   · the title menu's fifth item opens the showcase and closes the menu; BACK and Escape return to the menu;
//   · one card per factory car, in order-number order (001 to 100), each with that car's own picture;
//   · the families: ALL is every car, and each family button shows exactly that family's cars;
//   · the figures are the presets' own, never estimated: a combustion car's power, torque and mass, its 0–100 and top
//     speed (and "governed" when it is), a hybrid's system power, and no power line for an electric drive, which carries
//     no single published figure;
//   · arrow keys walk the cards, and Enter or DRIVE THIS CAR loads the chosen car exactly as the picker does (the same
//     saved build), shows it in both pickers, closes the showcase and opens the VEHICLE tab, without the menu;
//   · opening again starts on the car that is loaded;
//   · it reads in Greek, and neither language scrolls sideways on a phone.
import { chromium } from './pw.mjs';
import { fileURLToPath, pathToFileURL } from 'url';
import path from 'path';
const repo = fileURLToPath(new URL('..', import.meta.url));
const url = pathToFileURL(path.join(repo, 'index.html')).href + '?title=1';
const browser = await chromium.launch();
const errors = [], fails = [];
const watch = p => {
  p.on('console', m => { if (m.type() === 'error' && !/ERR_FILE_NOT_FOUND/.test(m.text())) errors.push('console: ' + m.text()); });
  p.on('pageerror', e => errors.push('pageerror: ' + e.message));
};
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
watch(page);
await page.goto(url, { waitUntil: 'networkidle' });
await page.waitForTimeout(300);
const state = () => page.evaluate(() => ({ sc: !document.getElementById('showcase').hidden, title: !document.getElementById('titleScreen').hidden, mode: vizMode }));
const figs = () => page.evaluate(() => Object.fromEntries([...document.querySelectorAll('#scDetail .sc-figs dt')].map(dt => [dt.textContent, dt.nextElementSibling.textContent])));
const selName = () => page.evaluate(() => scList()[showcase.sel].p.name);

// 1. from the title menu, and back
await page.click('#titleScreen .title-menu button[data-go="showcase"]');
await page.waitForTimeout(200);
let s = await state();
console.log('== open from the menu: showcase ' + s.sc + ', menu ' + s.title + ' ==');
if (!s.sc || s.title) fails.push('CAR SHOWCASE did not swap the menu for the showcase');
await page.click('#scClose');
await page.waitForTimeout(100);
s = await state();
if (s.sc || !s.title) fails.push('BACK did not return to the menu');
await page.click('#titleScreen .title-menu button[data-go="showcase"]');
await page.keyboard.press('Escape');
await page.waitForTimeout(100);
s = await state();
if (s.sc || !s.title) fails.push('Escape did not return to the menu');
await page.click('#titleScreen .title-menu button[data-go="showcase"]');
await page.waitForTimeout(200);

// 2. the cards
const cards = await page.evaluate(() => ({
  n: FACTORY_CARS.length,
  cards: [...document.querySelectorAll('#scGrid .sc-card')].map(b => ({ no: b.querySelector('.sc-no').textContent, nm: b.querySelector('.sc-nm').textContent, src: (b.querySelector('img') || {}).getAttribute ? b.querySelector('img').getAttribute('src') : '' })),
  want: FACTORY_CARS.map(p => p.name).sort((a, b) => CAR_NO[a] - CAR_NO[b]).map(n => ({ no: carNo(n), nm: n, src: carArtUrl(n) })),
}));
const wrong = cards.want.filter((w, k) => !cards.cards[k] || cards.cards[k].no !== w.no || cards.cards[k].nm !== w.nm || cards.cards[k].src !== w.src);
console.log(`== cards: ${cards.cards.length} of ${cards.n} factory cars, first ${cards.cards[0].no}, last ${cards.cards.at(-1).no}; ${wrong.length} out of place ==`);
if (cards.cards.length !== cards.n) fails.push(`${cards.cards.length} cards for ${cards.n} factory cars`);
if (wrong.length) fails.push('cards out of order or with the wrong picture: ' + wrong.slice(0, 5).map(w => w.no + ' ' + w.nm).join(', '));

// 3. the families
const fams = await page.evaluate(async () => {
  const out = [];
  for (const b of [...document.querySelectorAll('#scFilters button')].map(x => x.dataset.fam)) {
    document.querySelector('#scFilters button[data-fam="' + CSS.escape(b) + '"]').click();
    const names = [...document.querySelectorAll('#scGrid .sc-nm')].map(x => x.textContent);
    const want = FACTORY_CARS.filter(p => b === 'ALL' || p.cat === b).map(p => p.name);
    out.push({ fam: b, n: names.length, ok: names.length === want.length && want.every(n => names.includes(n)) });
  }
  document.querySelector('#scFilters button[data-fam="ALL"]').click();
  return out;
});
console.log('== families: ' + fams.map(f => f.fam + ' ' + f.n + (f.ok ? '' : ' (WRONG)')).join(', ') + ' ==');
const badFam = fams.filter(f => !f.ok);
if (badFam.length) fails.push('families showing the wrong cars: ' + badFam.map(f => f.fam).join(', '));
if (!fams.some(f => f.fam === 'ALL' && f.n === cards.n)) fails.push('ALL is not every car');

// 4. the figures are the presets' own
const pickByName = n => page.evaluate(n => { const k = scList().findIndex(x => x.p.name === n); scSelect(k); }, n);
const checkFigs = async (name, label) => {
  await pickByName(name);
  const f = await figs();
  const want = await page.evaluate(n => {
    const p = FACTORY_CARS.find(q => q.name === n), e = FACTORY_ENGINES.find(q => q.name === p.engine);
    return { er: e.real || {}, cr: p.real || {}, kg: p.body.kg, drive: p.fit.drive };
  }, name);
  const fmt = v => Number(v).toLocaleString('en-US', { maximumFractionDigits: 0 });
  console.log(`  ${label}: ` + Object.entries(f).map(([k, v]) => k + ' ' + v).join(' | '));
  if (want.er.hp && !(f.POWER || '').startsWith(fmt(want.er.hp) + ' hp')) fails.push(`${label}: power ${f.POWER} is not the maker's ${want.er.hp} hp`);
  if (!want.er.hp && f.POWER) fails.push(`${label}: shows a power line (${f.POWER}) the preset has no figure for`);
  if (want.er.tq && !(f.TORQUE || '').startsWith(fmt(want.er.tq) + ' Nm')) fails.push(`${label}: torque ${f.TORQUE}`);
  if (f.MASS !== fmt(want.kg) + ' kg') fails.push(`${label}: mass ${f.MASS}, preset ${want.kg} kg`);
  if (want.cr.t100 && f['0–100 km/h'] !== want.cr.t100.toFixed(1) + ' s') fails.push(`${label}: 0–100 ${f['0–100 km/h']}`);
  if (want.cr.top && !(f['TOP SPEED'] || '').startsWith(fmt(want.cr.top) + ' km/h')) fails.push(`${label}: top speed ${f['TOP SPEED']}`);
  if (!!want.cr.limited !== /governed/.test(f['TOP SPEED'] || '')) fails.push(`${label}: governed flag wrong (${f['TOP SPEED']})`);
  if (f['DRIVEN WHEELS'] !== want.drive.toUpperCase()) fails.push(`${label}: driven wheels ${f['DRIVEN WHEELS']}`);
  if (want.er.sysKW && !(f['SYSTEM POWER'] || '').startsWith(fmt(want.er.sysKW) + ' kW')) fails.push(`${label}: system power ${f['SYSTEM POWER']}`);
  return f;
};
console.log('== figures ==');
await checkFigs('Porsche 911 GT3 (991.2, 2017)', 'combustion');
await checkFigs('Porsche 918 Spyder (2013)', 'hybrid');
await checkFigs('Tesla Model 3 RWD (2021)', 'electric');

// 5. walk with the keys, then drive with Enter. "The same build" is the engine and the car: the tune's mixture is live
// state (an ECU-mapped engine's follows the rpm every frame), so it is left out of the comparison.
await page.evaluate(() => { window.carOf = b => JSON.stringify({ engine: b.engine, vehicle: b.vehicle }); });
await pickByName('Porsche 911 GT3 (991.2, 2017)');
await page.keyboard.press('ArrowRight');
await page.keyboard.press('ArrowRight');
await page.keyboard.press('ArrowLeft');
const walked = await selName();
const wantWalk = await page.evaluate(() => FACTORY_CARS.find(p => CAR_NO[p.name] === 13).name);
console.log('== keys: 012 → right, right, left → ' + walked + ' ==');
if (walked !== wantWalk) fails.push('arrow keys landed on ' + walked + ', not ' + wantWalk);
await page.keyboard.press('Enter');
await page.waitForTimeout(300);
s = await state();
const drove = await page.evaluate(() => ({ body: vehBody && vehBody.name, preset: document.getElementById('vhPreset').value,
  presetName: (FACTORY_CARS[+document.getElementById('vhPreset').value] || {}).name, build: carOf(serializeBuild('x', '')) }));
console.log(`== drive: ${drove.body}, tab ${s.mode}, showcase ${s.sc}, menu ${s.title}, picker on ${drove.presetName} ==`);
if (drove.body !== wantWalk) fails.push('DRIVE loaded ' + drove.body + ', not ' + wantWalk);
if (s.sc || s.title || s.mode !== 'vehicle') fails.push(`after DRIVE: showcase ${s.sc}, menu ${s.title}, tab ${s.mode} (want the VEHICLE tab alone)`);
if (drove.presetName !== wantWalk) fails.push('the FACTORY CAR picker does not show the car driven (' + drove.presetName + ')');
// the same build as the picker's own load
const viaPicker = await page.evaluate(n => {
  const i = FACTORY_CARS.findIndex(p => p.name === n), fam = document.getElementById('vhFamily'), sel = document.getElementById('vhPreset');
  loadVehiclePreset(FACTORY_CARS[0]);
  fam.value = FACTORY_CARS[i].cat; fam.dispatchEvent(new Event('change'));
  sel.value = String(i); sel.dispatchEvent(new Event('change'));
  return carOf(serializeBuild('x', ''));
}, wantWalk);
if (viaPicker !== drove.build) fails.push('DRIVE THIS CAR and the FACTORY CAR picker load different builds');

// 6. opening again starts on the loaded car; the button drives too
await page.evaluate(() => openShowcase());
await page.waitForTimeout(150);
const startOn = await selName();
if (startOn !== wantWalk) fails.push('opened on ' + startOn + ', not the loaded ' + wantWalk);
await page.click('#scNext');
const next = await selName();
await page.click('#scDrive');
await page.waitForTimeout(300);
s = await state();
const body2 = await page.evaluate(() => vehBody && vehBody.name);
if (body2 !== next || s.sc || s.title) fails.push(`the DRIVE button loaded ${body2} (want ${next}); showcase ${s.sc}, menu ${s.title} (opened from the app, BACK goes nowhere)`);
await page.close();

// 7. Greek, and a phone's width in both languages
for (const [lang, w] of [['el', 1280], ['el', 390], ['en', 390]]) {
  const p = await browser.newPage({ viewport: { width: w, height: 844 } });
  watch(p);
  await p.addInitScript(l => { try { localStorage.setItem('pes.lang', l); } catch (e) {} }, lang);
  await p.goto(url, { waitUntil: 'networkidle' });
  await p.waitForTimeout(250);
  await p.click('#titleScreen .title-menu button[data-go="showcase"]');
  await p.waitForTimeout(250);
  const r = await p.evaluate(() => ({ h: document.getElementById('scHeading').textContent, back: document.getElementById('scClose').textContent,
    drive: document.getElementById('scDrive').textContent, dts: [...document.querySelectorAll('#scDetail dt')].map(x => x.textContent),
    all: document.querySelector('#scFilters button').textContent,
    side: Math.max(document.documentElement.scrollWidth, document.getElementById('showcase').scrollWidth) - document.documentElement.clientWidth }));
  console.log(`== ${lang} ${w}px: ${r.h} · ${r.back} · ${r.drive} · ${r.all} · ${r.dts.join(', ')} · sideways ${r.side}px ==`);
  if (lang === 'el') {
    if (r.h !== 'ΕΚΘΕΣΗ ΑΥΤΟΚΙΝΗΤΩΝ' || r.back !== 'ΠΙΣΩ' || r.drive !== 'ΟΔΗΓΗΣΕ ΤΟ' || r.all !== 'ΟΛΑ') fails.push('Greek labels: ' + [r.h, r.back, r.drive, r.all].join(' | '));
    if (r.dts.some(t => /[A-Z]{3,}/.test(t) && !/km\/h/.test(t))) fails.push('figure labels left in English: ' + r.dts.join(', '));
  }
  if (r.side > 0) fails.push(`${lang} at ${w}px scrolls sideways by ${r.side}px`);
  await p.close();
}

console.log(fails.length ? 'FAIL:\n  ' + fails.join('\n  ') : 'PASS');
console.log('ERRORS:', errors.length ? errors : 'none');
await browser.close();
process.exit(fails.length || errors.length ? 1 : 0);
