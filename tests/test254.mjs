// The scope's signal picker, with the O2 sensor's voltage.
//
// WHY THIS EXISTS. The owner asked to choose what the scope shows, and to see the lambda sensor's voltage. What must hold:
//   · by default the four lanes of build 409 (rpm, MAP, lambda, knock), with a picker of buttons under the scope;
//   · a fifth signal is refused while four are on; switching one off and picking O2 SENSOR draws it, in mV, with the
//     value lambdaSensorMv gives for the running mixture;
//   · the choice survives a reload (localStorage, pes.scopeCh); an electric car has its own list and default;
//   · no horizontal scroll at 390 px, and no page errors.
import { chromium } from './pw.mjs';
import { fileURLToPath, pathToFileURL } from 'url';
import path from 'path';
const repo = fileURLToPath(new URL('..', import.meta.url));
const url = pathToFileURL(path.join(repo, 'index.html')).href;
const browser = await chromium.launch();
const fails = [], errors = [];
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
const scope = () => page.evaluate(async () => {
  const t = document.getElementById('titleScreen'); if (t) t.hidden = true;
  setTab('engine'); const el = document.getElementById('ecuComputer'); el.classList.add('open'); ecuSync(); ecuScreen('scope');
  for (let i = 0; i < 20; i++) { ecuSample(); await new Promise(r => setTimeout(r, 20)); }
  ecuTick();
  const out = [], P = CanvasRenderingContext2D.prototype, f0 = P.fillText;
  P.fillText = function (s, ...a) { if (this.canvas.id === 'ecuScope') out.push(String(s)); return f0.call(this, s, ...a); };
  ecuDrawScope(); P.fillText = f0;
  const btn = [...document.querySelectorAll('#ecuChans button')].map(b => b.dataset.ch + (b.classList.contains('on') ? '*' : ''));
  return { out, btn, sw: document.documentElement.scrollWidth };
});
await page.goto(url, { waitUntil: 'networkidle' });
await page.evaluate(() => { try { localStorage.removeItem('pes.scopeCh'); } catch (e) {} });
let s = await scope();
console.log('default', s.btn.join(' '));
if (s.btn.filter(b => b.endsWith('*')).join() !== 'rpm*,map*,lam*,knock*') fails.push('default lanes are not rpm, MAP, lambda, knock: ' + s.btn);
if (!s.btn.includes('o2')) fails.push('no O2 SENSOR button');
const refused = await page.evaluate(() => { ecuPick('o2'); return !ecuPicked('ice').includes('o2'); });
if (!refused) fails.push('a fifth signal was accepted');
const mv = await page.evaluate(() => { ecuPick('knock'); ecuPick('o2'); return Math.round(lambdaSensorMv(ecuLam())); });
s = await scope();
const o2 = s.out.find(t => /^O2 SENSOR \(mV\)/.test(t));
console.log('after pick', s.btn.join(' '), '|', o2, '| model', mv);
if (!o2) fails.push('O2 SENSOR (mV) lane not drawn');
else if (Math.abs(+o2.split(/\s+/).pop().replace(/,/g, '') - mv) > 30) fails.push('O2 value ' + o2 + ' is not the model\'s ' + mv);
if (s.out.some(t => /^KNOCK RISK/.test(t))) fails.push('knock still drawn after switching it off');
if (s.sw > 390) fails.push('horizontal scroll ' + s.sw);
await page.reload({ waitUntil: 'networkidle' });
s = await scope();
if (!s.out.some(t => /^O2 SENSOR/.test(t))) fails.push('the choice did not survive a reload');
const ev = await page.evaluate(() => { loadVehiclePreset(FACTORY_CARS.find(p => p.name.includes('Model 3'))); return isElectric(); });
if (ev) {
  s = await scope();
  console.log('EV', s.btn.join(' '));
  if (s.btn.includes('o2') || !s.btn.includes('v*')) fails.push('EV list wrong: ' + s.btn);
  if (!s.out.some(t => /^PACK VOLTAGE \(V\)/.test(t))) fails.push('EV scope lacks pack voltage');
} else fails.push('Model 3 is not electric: pick another EV');
await browser.close();
if (errors.length) fails.push(...errors);
if (fails.length) { console.log('FAIL\n  ' + fails.join('\n  ')); process.exit(1); }
console.log('PASS');
