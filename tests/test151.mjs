// The design cards' pictures are drawn when they come into view, and PLUG-IN is not translated (build 240).
//
// WHY THIS EXISTS. Builds 238 and 239 drew the cards' pictures and the side panel's curve only while they were on
// screen. Picking a build from the list jumps to the DYNO tab, so they were worked out while hidden and nothing drew
// them when the player came back to ENGINE: the rotor and stator, the battery and the curve were blank. And the Greek
// called a plug-in hybrid ΕΠΑΝΑΦΟΡΤΙΖΟΜΕΝΟ, where Greek makers and buyers say PLUG-IN. What must hold:
//   · after a pick from the build list (which shows DYNO) and a return to ENGINE, the open card's picture and the
//     curve are drawn, for the electric drive and for a combustion engine;
//   · a card opened afterwards from the menu has its picture drawn;
//   · in Greek the PLUG-IN field reads PLUG-IN, and no Greek text says ΕΠΑΝΑΦΟΡΤΙΖΟΜΕΝΟ any more;
//   · no page errors.
import { chromium } from './pw.mjs';
import { fileURLToPath, pathToFileURL } from 'url';
import path from 'path';
const repo = fileURLToPath(new URL('..', import.meta.url));
const url = pathToFileURL(path.join(repo, 'index.html')).href;
const browser = await chromium.launch();
const errors = [], fails = [];
const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
await page.goto(url, { waitUntil: 'networkidle' });

// how much of a canvas is drawn: pixels brighter than its dark background
const lit = sel => page.evaluate(s => {
  const c = document.querySelector(s); if (!c || !c.width) return 0;
  const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0;
  for (let i = 0; i < d.length; i += 4) if (d[i] + d[i + 1] + d[i + 2] > 120) n++;
  return n;
}, sel);
// pick from the ENGINE tab's build list, as a player does (its family, then the build): it shows the DYNO tab
const pick = re => page.evaluate(async re => {
  const pr = FACTORY_ENGINES.find(q => new RegExp(re).test(q.name));
  const fam = document.getElementById('edFamily'); fam.value = pr.cat || 'Archetypes'; fam.dispatchEvent(new Event('change'));
  const s = document.getElementById('edPreset'), o = [...s.options].find(o => o.textContent.includes(pr.name));
  s.value = o.value; s.dispatchEvent(new Event('change'));
  await new Promise(r => setTimeout(r, 900));
  return pr.name;
}, re);

for (const [re, p, first, other] of [['Model 3 RWD drive', 'evd', 'size', 'batt'], ['EA888', 'icd', 'block', null]]) {
  const name = await pick(re);
  const shown = await page.evaluate(() => vizMode);
  await page.click('#tabDesign'); await page.waitForTimeout(800);
  const viz = await lit('#' + p + 'Viz-' + first), curve = await lit('#' + p + 'Curve');
  console.log(`== ${name}: picked on ${shown}; back on ENGINE the ${first} picture has ${viz} lit pixels, the curve ${curve} ==`);
  if (shown !== 'dyno') fails.push(`picking ${name} should show the DYNO tab, it showed ${shown}`);
  if (viz < 500) fails.push(`${name}: the ${first} card's picture is blank after coming back to ENGINE`);
  if (curve < 500) fails.push(`${name}: the side panel's curve is blank after coming back to ENGINE`);
  if (other) {
    await page.click('#' + p + 'Rb-' + other); await page.waitForTimeout(300);
    const o = await lit('#' + p + 'Viz-' + other);
    console.log(`   then ${other} from the menu: ${o} lit pixels`);
    if (o < 500) fails.push(`${name}: the ${other} card's picture is blank when opened from the menu`);
  }
}

// PLUG-IN, in Greek
const gk = await page.evaluate(() => {
  applyLang('el');
  const label = document.querySelector('label[for="edHyPlug"]').textContent;
  const all = JSON.stringify(I18N) + JSON.stringify(GUIDE_I18N);
  const out = { label, old: (all.match(/ΕΠΑΝΑΦΟΡΤΙΖΟΜ|[Εε]παναφορτιζόμ/g) || []).length, deploy: tr('PLUG-IN DEPLOY') };
  applyLang('en');
  return out;
});
console.log(`== Greek: the field reads "${gk.label}", "${gk.deploy}"; the old word is left ${gk.old} times ==`);
if (gk.label !== 'PLUG-IN') fails.push('in Greek the PLUG-IN field reads ' + gk.label);
if (gk.old) fails.push('the Greek still says ΕΠΑΝΑΦΟΡΤΙΖΟΜΕΝΟ ' + gk.old + ' times');
if (!/PLUG-IN/.test(gk.deploy)) fails.push('PLUG-IN DEPLOY reads ' + gk.deploy);
await browser.close();

if (errors.length) fails.push(...errors.slice(0, 5));
if (fails.length) { console.log('\nFAIL\n  ' + fails.join('\n  ')); process.exit(1); }
console.log('\nPASS: the cards\' pictures are drawn when they come into view, and PLUG-IN stays PLUG-IN');
