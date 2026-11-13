// The driver aids as a card on the VEHICLE tab (build 280).
//
// WHY THIS EXISTS. Build 279 made ABS, traction control and stability control a tune of the stepped car; this build
// lets the player set it, and shows what it does. What must hold:
//   · the card ECU: DRIVER AIDS holds the eight fields, traction control among them; each has its help;
//   · the fields are the car's (vehicle.aids), a factory car loads the defaults (ESP where it has traction control),
//     and a saved car puts its own back;
//   · the card's three tests follow the settings: the Model 3 passes the sine with dwell and spins with ESP off; a
//     wider slide lets it go further sideways; without ABS the stop is longer and a wheel locks; a looser traction
//     control lets the tyres slip more;
//   · the lap's and the 0-100's figures do not move with them (they do not read the stepped car yet);
//   · the picture is drawn, and on a phone nothing scrolls sideways; no page errors.
import { chromium } from './pw.mjs';
import { fileURLToPath, pathToFileURL } from 'url';
import path from 'path';
const repo = fileURLToPath(new URL('..', import.meta.url));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 800 } });
const errors = [], fails = [];
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
await page.goto(pathToFileURL(path.join(repo, 'index.html')).href, { waitUntil: 'networkidle' });
await page.evaluate(() => setTab('vehicle'));
await page.waitForTimeout(400);

const R = await page.evaluate(async () => {
  const g = id => document.getElementById(id), set = (id, v) => { g(id).value = v; g(id).dispatchEvent(new Event('input', { bubbles: true })); };
  const ids = ['vhAbs', 'vhAbsF', 'vhAbsR', 'vhTC', 'vhTcSlip', 'vhEsp', 'vhEspSlide', 'vhEspCut'], out = {};
  const card = g('vcdCard-aids');
  out.fields = ids.filter(id => g(id) && card.contains(g(id)) && g(id).closest('.field')).length; out.help = ids.filter(id => VCD_FIELDS[id] && VCD_FIELDS[id].what).length;
  const form = () => ids.map(id => g(id).value).join(' ');
  loadVehiclePreset(FACTORY_CARS.find(x => x.name.startsWith('Mazda MX-5'))); out.mx5 = form();
  loadVehiclePreset(FACTORY_CARS.find(x => x.name.startsWith('Tesla Model 3'))); out.m3 = form(); out.aids0 = JSON.stringify(vehicle.aids);
  const t100 = perf.t100, snap = () => { const A = vcdAids(); return { beta: A.swd.beta, pass: A.swd.pass, off: A.off && A.off.pass, stop: A.stop.dist, lock: A.stop.lock, slip: A.sprint.slip }; };
  out.base = snap();
  set('vhEspSlide', 1.5); out.wide = snap(); set('vhEspSlide', 1);
  set('vhEsp', 'off'); out.noEsp = snap(); out.aidsEsp = vehicle.aids.esp; set('vhEsp', 'on');
  set('vhAbs', 'off'); out.noAbs = snap(); set('vhAbs', 'on');
  set('vhTcSlip', 2); out.loose = snap(); out.t100 = [t100, perf.t100];
  const saved = JSON.parse(JSON.stringify(vehicle)); saved.aids.absSlip = [1.1, 2]; saved.aids.espCut = false;
  loadVehiclePreset(FACTORY_CARS.find(x => x.name.startsWith('Mazda MX-5'))); applyVehicleToForm(saved); out.back = form();
  // the picture, with the card open
  const b = [...document.querySelectorAll('#vcdRail *')].find(e => /AIDS/.test(e.textContent) && !e.children.length); if (b) b.click();
  card.scrollIntoView(); await new Promise(r => setTimeout(r, 1200));
  const cv = g('vcdViz-aids'), d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data; let green = 0;
  for (let i = 0; i < d.length; i += 4) if (d[i] < 40 && d[i + 1] > 220 && d[i + 2] > 100 && d[i + 2] < 170) green++;
  out.green = green; out.scroll = document.documentElement.scrollWidth - innerWidth;
  return out;
});
await browser.close();

console.log(`fields ${R.fields}/8 in the card, ${R.help}/8 with help`);
console.log(`MX-5: ${R.mx5}\nModel 3: ${R.m3}\nsaved car back: ${R.back}`);
const p = o => `${o.beta.toFixed(0)} deg ${o.pass ? 'pass' : 'spin'}, 100-0 ${o.stop.toFixed(1)} m${o.lock ? ' locked' : ''}, slip ${(o.slip * 100).toFixed(0)}%`;
for (const k of ['base', 'wide', 'noEsp', 'noAbs', 'loose']) console.log(`${k.padEnd(6)} ${p(R[k])}`);
if (R.fields !== 8 || R.help !== 8) fails.push('the card does not hold the eight fields with their help');
if (R.mx5 !== 'on 1.3 1.3 off 1 off 1 on') fails.push('the MX-5 (no traction control) does not load the defaults with ESP off: ' + R.mx5);
if (R.m3 !== 'on 1.3 1.3 on 1 on 1 on') fails.push('the Model 3 does not load the defaults: ' + R.m3);
if (R.back !== 'on 1.1 2 on 2 on 1 off') fails.push('a saved car\'s aids do not come back: ' + R.back);
if (!(R.base.pass && R.base.off === false)) fails.push('the Model 3 as set does not pass where it spins with ESP off');
if (!(R.wide.beta > R.base.beta + 1)) fails.push('a wider slide does not show');
if (R.noEsp.pass || R.aidsEsp !== false) fails.push('ESP off is not the car\'s, or it still passes');
if (!(R.noAbs.lock && R.noAbs.stop > R.base.stop + 1 && !R.base.lock)) fails.push('no ABS does not lock a wheel and lengthen the stop');
if (!(R.loose.slip > R.base.slip + 0.03)) fails.push('a looser traction control does not let the tyres slip more');
if (R.t100[0] !== R.t100[1]) fails.push(`the 0-100 moved with the aids: ${R.t100}`);
if (!(R.green > 50)) fails.push('the picture is not drawn');
if (R.scroll > 0) fails.push('the phone scrolls sideways by ' + R.scroll + ' px');
for (const e of errors) fails.push(e);
if (fails.length) { console.log('\nFAIL'); for (const f of fails) console.log('  - ' + f); process.exit(1); }
console.log('\nPASS');
