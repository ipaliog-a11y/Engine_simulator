// One car picture, a still cutaway, and a scope you can read.
//
// WHY THIS EXISTS. The owner found three things after builds 391–398. What must hold:
//   · VEHICLE shows exactly one picture of the car (the showroom profile), at 390 px and on a desktop;
//     the drawn car came back in build 391 after build 224 took it off;
//   · the engine cutaway draws without any rotation, whatever the torque (build 392 leaned it);
//   · the scope names every trace with its unit and present value, has scale numbers and a time axis;
//   · no horizontal scroll at 390 px, and no page errors.
import { chromium } from './pw.mjs';
import { fileURLToPath, pathToFileURL } from 'url';
import path from 'path';
const repo = fileURLToPath(new URL('..', import.meta.url));
const browser = await chromium.launch();
const fails = [], errors = [];
for (const [name, vp] of [['phone', { width: 390, height: 844 }], ['desktop', { width: 1280, height: 800 }]]) {
  const page = await browser.newPage({ viewport: vp });
  page.on('pageerror', e => errors.push(name + ' pageerror: ' + e.message));
  await page.goto(pathToFileURL(path.join(repo, 'index.html')).href, { waitUntil: 'networkidle' });
  await page.evaluate(() => { const t = document.getElementById('titleScreen'); if (t) t.hidden = true; setTab('vehicle'); });
  await page.waitForTimeout(500);
  const pics = await page.evaluate(() => {
    const panel = document.getElementById('vehiclePanelTab'), hint = panel.querySelector('.hint');
    const lim = hint.getBoundingClientRect().top;
    return [...panel.querySelectorAll('img,canvas')].filter(n => {
      const r = n.getBoundingClientRect(); return r.height > 20 && r.top < lim && getComputedStyle(n).display !== 'none';
    }).map(n => n.tagName + '#' + n.id);
  });
  console.log(name, 'car pictures', pics);
  if (pics.length !== 1) fails.push(name + ': VEHICLE shows ' + pics.length + ' car pictures: ' + pics.join(' '));

  await page.evaluate(() => setTab('engine'));
  await page.waitForTimeout(300);
  const rot = await page.evaluate(() => {
    let n = 0; const P = CanvasRenderingContext2D.prototype, r0 = P.rotate;
    P.rotate = function (...a) { if (this === ctx) n++; return r0.apply(this, a); };
    state.torque = 400; state.rpm = engine.redline * 0.9; drawEngine(0.016);
    P.rotate = r0; return n;
  });
  console.log(name, 'cutaway rotate calls', rot);
  if (rot) fails.push(name + ': the cutaway rotates (' + rot + ' calls)');

  const txt = await page.evaluate(async () => {
    const el = document.getElementById('ecuComputer'); el.classList.add('open'); ecuSync(); ecuScreen('scope');
    for (let i = 0; i < 30; i++) { state.rpm = 1500 + i * 100; ecuSample(); await new Promise(r => setTimeout(r, 20)); }
    const out = [], P = CanvasRenderingContext2D.prototype, f0 = P.fillText;
    P.fillText = function (s, ...a) { if (this.canvas.id === 'ecuScope') out.push(String(s)); return f0.call(this, s, ...a); };
    ecu.freeze = true; ecuDrawScope(); ecu.freeze = false; P.fillText = f0;
    return { out, sw: document.documentElement.scrollWidth };
  });
  console.log(name, 'scope text', txt.out.join(' | '));
  const has = re => txt.out.some(s => re.test(s));
  for (const [re, what] of [[/ENGINE SPEED \(rpm\)\s+\d/, 'rpm label and value'], [/MANIFOLD PRESSURE \(bar\)\s+\d/, 'MAP label'],
    [/LAMBDA\s+\d/, 'lambda label'], [/KNOCK RISK \(%\)\s+\d/, 'knock label'], [/^NOW$/, 'time axis end'],
    [/^-\d+$/, 'time ticks'], [/TIME \(s\)/, 'time axis title']])
    if (!has(re)) fails.push(name + ': scope lacks ' + what);
  if (txt.out.filter(s => /^[\d,.]+$/.test(s)).length < 12) fails.push(name + ': scope has too few scale numbers');
  if (txt.sw > vp.width) fails.push(name + ': horizontal scroll ' + txt.sw);
  await page.close();
}
await browser.close();
if (errors.length) fails.push(...errors);
if (fails.length) { console.log('FAIL\n  ' + fails.join('\n  ')); process.exit(1); }
console.log('PASS');
