// The SUSPENSION CALCULATOR (build 218).
//
// WHY THIS EXISTS. The VEHICLE tab gained a window that opens one corner of the car as a quarter car and lets every
// input be changed: sprung and unsprung mass, spring rate and motion ratio, bound and rebound damping, tyre rate, and a
// step in the road. It reads the natural frequencies, the damping, the response to a road wave and the step in time.
// What must hold:
//   · it starts from the car's own corner: the lap's quarterCar(), so its damping is the car's vehicle.zetaF / zetaR and
//     its wheel hop the car's vehicle.hopHz;
//   · the modes are the two-mass system's: each is a root of its characteristic equation, the body's close to the ride
//     rate shortcut sqrt(kr / ms) and the wheel's to sqrt((ks + kt) / mu); the motion ratio acts as its square;
//   · the frequency response is the physics: the body's peak sits near its mode and falls as the damping grows; far
//     above the wheel hop the body barely moves; at zero frequency both move with the road;
//   · the bound and rebound damping: a road wave meets their mean (the describing function), which a sine run in time
//     with the real two-way damper confirms to within 10% at the body's resonance; over a step up, harder rebound
//     overshoots less; the step settles on the road's new height;
//   · the tyre cannot pull: a 50 mm drop leaves the wheel in the air, a 25 mm rise does not;
//   · it is a calculator: opening it and changing every input moves nothing in the car or its lap;
//   · the window: opens from its button, draws both charts, re-reads as an input changes, puts the car back on FROM THE
//     CAR, switches corner, follows a change of car, reads in Greek, closes on Escape.
import { chromium } from './pw.mjs';
import { fileURLToPath, pathToFileURL } from 'url';
import path from 'path';
const repo = fileURLToPath(new URL('..', import.meta.url));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors = [];
page.on('console', m => { if (m.type() === 'error' && !/ERR_FILE_NOT_FOUND/.test(m.text())) errors.push('console: ' + m.text()); });
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
await page.goto(pathToFileURL(path.join(repo, 'index.html')).href, { waitUntil: 'networkidle' });
await page.waitForTimeout(400);
const fails = [];

const r = await page.evaluate(() => {
  const load = n => { loadVehiclePreset(FACTORY_CARS.find(p => p.name.includes(n))); setTab('vehicle'); };
  const o = {};
  // 1. the car's own corner
  load('BMW M3 (E46');
  o.car = [];
  for (const ax of ['F', 'R']) {
    const p = scFromCar(ax), c = scCalc(p);
    o.car.push({ ax, ze: c.ze, zeta: ax === 'F' ? vehicle.zetaF : vehicle.zetaR, hop: c.simple.hop, hopCar: vehicle.hopHz, body: c.modes.body, hopM: c.modes.hop, sb: c.simple.body });
  }
  // 2. the modes against their equation, and the motion ratio
  const p0 = scFromCar('F'), c0 = scCalc(p0), w = c0.w;
  const chr = f => { const x = Math.pow(2 * Math.PI * f, 2); return (w.ms * w.mu * x * x - (w.ms * (w.ks + w.kt) + w.mu * w.ks) * x + w.ks * w.kt) / (w.ks * w.kt); };
  o.res = [chr(c0.modes.body), chr(c0.modes.hop)];
  const pm = Object.assign({}, p0, { mr: 0.7, k: p0.k / 0.49, cb: p0.cb / 0.49, cr: p0.cr / 0.49 }), cm = scCalc(pm);
  o.mr = { body: [c0.modes.body, cm.modes.body], ze: [c0.ze, cm.ze], ks: [c0.w.ks, cm.w.ks] };
  // 3. the frequency response
  o.pk = [0.5, 1, 2].map(k => { const c = scCalc(Object.assign({}, p0, { cb: p0.cb * k, cr: p0.cr * k })); return { ze: c.ze, f: c.pkB.f, a: c.pkB.a, mode: c.modes.body }; });
  o.low = scFreq(w, c0.ce, 0.01); o.high = scFreq(w, c0.ce, 40);
  // 4. bound and rebound: a sine at the body's mode with a 2:1 damper, against the linear damper at the mean
  const pa = Object.assign({}, p0, { cb: p0.cb * 2 / 3, cr: p0.cb * 4 / 3, step: 0 }), ca = scCalc(pa);
  const f = ca.modes.body, A = 0.01, T = 12;
  const s = scSim(ca.w, t => A * Math.sin(2 * Math.PI * f * t), T);
  let lo = Infinity, hi = -Infinity; for (let i = 0; i < s.t.length; i++) if (s.t[i] > T - 3 / f) { lo = Math.min(lo, s.zs[i]); hi = Math.max(hi, s.zs[i]); }
  o.sine = { sim: (hi - lo) / 2 / A, lin: scFreq(ca.w, ca.ce, f).body, offset: (hi + lo) / 2 / A };
  o.reb = [1, 2, 3].map(k => { const c = scCalc(Object.assign({}, p0, { cr: p0.cb * k, step: 25 })); return { over: c.over, end: c.sim.zs[c.sim.zs.length - 1] }; });
  // 5. the tyre cannot pull
  o.up = scCalc(Object.assign({}, p0, { step: 25 })).sim.air;
  o.down = scCalc(Object.assign({}, p0, { step: -50 })).sim;
  o.down = { air: o.down.air, min: o.down.ftMin };
  // 6. nothing moves
  const json = x => JSON.stringify(x, (k, v) => ArrayBuffer.isView(v) ? Array.from(v) : v);
  load('Golf GTI (Mk7');
  const before = json(simulateLap('mixed')) + json(perf) + vehicle.zetaF + vehicle.hopHz;
  openSuspWin();
  for (const [k] of SC_IN) { const i = document.getElementById('sc_' + k); i.value = String(+i.value * 1.7 + 1); i.dispatchEvent(new Event('input', { bubbles: true })); }
  closeSuspWin();
  o.same = before === json(simulateLap('mixed')) + json(perf) + vehicle.zetaF + vehicle.hopHz;
  // 7. the window
  load('BMW M3 (E46');
  document.getElementById('btnSusp').click();
  const lit = id => { const c = document.getElementById(id), d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 0) n++; return n; };
  o.win = { open: !document.getElementById('susWin').hidden, litF: lit('susFreq'), litS: lit('susStep'), rows: document.querySelectorAll('#susRead .gg-row').length, inputs: document.querySelectorAll('#susForm input').length };
  const read0 = document.getElementById('susRead').innerText;
  const inp = document.getElementById('sc_cr'); inp.value = String(+inp.value * 2); inp.dispatchEvent(new Event('input', { bubbles: true }));
  o.win.reread = document.getElementById('susRead').innerText !== read0;
  document.getElementById('susReset').click();
  o.win.reset = Math.abs(sc.p.cr - scFromCar('F').cr) < 1e-9 && document.getElementById('susRead').innerText === read0;
  document.querySelector('#susCorner button[data-ax="R"]').click();
  o.win.rear = sc.ax === 'R' && Math.abs(sc.p.ms - quarterCar(vehicle, 'R').ms) < 1e-9;
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
  o.win.closed = document.getElementById('susWin').hidden;
  load('Mazda MX-5 1.6 (NA'); openSuspWin();
  o.win.follows = Math.abs(sc.p.ms - quarterCar(vehicle, sc.ax).ms) < 1e-9; closeSuspWin();
  load('Model 3'); openSuspWin(); o.ev = { body: sc.r.modes.body, hop: sc.r.modes.hop }; closeSuspWin();
  load('BMW M3 (E46'); applyLang('el'); openSuspWin();
  o.el = { title: document.getElementById('susTitle').textContent, btn: document.getElementById('btnSusp').textContent, read: document.getElementById('susRead').innerText.slice(0, 120),
    form: document.getElementById('susForm').innerText.slice(0, 80) };
  closeSuspWin(); applyLang('en');
  o.en = document.getElementById('btnSusp').textContent;
  return o;
});
await browser.close();

const f = (x, d = 2) => (+x).toFixed(d);
console.log('== the car\'s own corner: the M3 E46 ==');
for (const c of r.car) {
  console.log(`  ${c.ax}: damping ${f(c.ze, 3)} (the car ${f(c.zeta, 3)}), body ${f(c.body)} Hz (shortcut ${f(c.sb)}), hop ${f(c.hopM, 1)} Hz (shortcut ${f(c.hop, 1)}, the car ${f(c.hopCar, 1)})`);
  if (Math.abs(c.ze - c.zeta) > 1e-9) fails.push(`${c.ax}: the calculator's damping ${c.ze} is not the car's ${c.zeta}`);
  if (c.ax === 'F' && Math.abs(c.hop - c.hopCar) > 1e-9) fails.push('the wheel hop is not the car\'s');
  if (Math.abs(c.body / c.sb - 1) > 0.03 || Math.abs(c.hopM / c.hop - 1) > 0.03) fails.push(`${c.ax}: the exact modes are more than 3% from the shortcuts`);
}
console.log('\n== the modes ==');
console.log(`  characteristic equation at the two modes: ${r.res.map(x => x.toExponential(1)).join(', ')}`);
if (r.res.some(x => Math.abs(x) > 1e-6)) fails.push('a mode is not a root of the two-mass system\'s equation');
console.log(`  motion ratio 0.7 with spring and dampers 1/0.49 as stiff: body ${f(r.mr.body[0], 4)} → ${f(r.mr.body[1], 4)} Hz, damping ${f(r.mr.ze[0], 4)} → ${f(r.mr.ze[1], 4)}`);
if (Math.abs(r.mr.ks[1] / r.mr.ks[0] - 1) > 1e-9 || Math.abs(r.mr.ze[1] / r.mr.ze[0] - 1) > 1e-9) fails.push('the motion ratio does not act as its square');
console.log('\n== the frequency response ==');
for (const x of r.pk) console.log(`  damping ${f(x.ze)}: body peak ×${f(x.a)} at ${f(x.f)} Hz (mode ${f(x.mode)})`);
for (const x of r.pk) if (!(x.f > 0.7 * x.mode && x.f < 1.05 * x.mode)) fails.push(`the body's peak at ${f(x.f)} Hz is not near its mode ${f(x.mode)}`);
if (!(r.pk[0].a > r.pk[1].a && r.pk[1].a > r.pk[2].a)) fails.push('the body\'s resonance does not fall as the damping grows');
console.log(`  0.01 Hz: body ×${f(r.low.body, 4)}, wheel ×${f(r.low.wheel, 4)}; 40 Hz: body ×${f(r.high.body, 4)}`);
if (Math.abs(r.low.body - 1) > 1e-3 || Math.abs(r.low.wheel - 1) > 1e-3) fails.push('at zero frequency the car does not move with the road');
if (!(r.high.body < 0.02)) fails.push('far above the wheel hop the body still moves');
console.log('\n== bound and rebound ==');
console.log(`  a 1 cm sine at the body's mode, rebound twice bound: in time ×${f(r.sine.sim, 3)}, the mean damper ×${f(r.sine.lin, 3)} (${f((r.sine.sim / r.sine.lin - 1) * 100, 1)}%); offset ${f(r.sine.offset * 100, 1)}% of the wave`);
if (Math.abs(r.sine.sim / r.sine.lin - 1) > 0.10) fails.push('the two-way damper in time is more than 10% from its describing function');
console.log(`  25 mm step up, rebound 1 / 2 / 3 × bound: overshoot ${r.reb.map(x => Math.round(x.over * 100) + '%').join(' / ')}; ends at ${r.reb.map(x => f(x.end * 1000, 1)).join(' / ')} mm`);
if (!(r.reb[0].over > r.reb[1].over && r.reb[1].over > r.reb[2].over)) fails.push('harder rebound does not overshoot less over a step up');
if (r.reb.some(x => Math.abs(x.end - 0.025) > 0.0015)) fails.push('the body does not settle on the road\'s new height');
console.log(`  wheel in the air: 25 mm up ${r.up * 1000} ms; 50 mm down ${f(r.down.air * 1000, 0)} ms`);
if (r.up > 0) fails.push('the wheel leaves the road on a 25 mm rise');
if (!(r.down.air > 0) || r.down.min !== 0) fails.push('the wheel does not leave the road on a 50 mm drop');
console.log(`\n== nothing moves: ${r.same} ==`);
if (!r.same) fails.push('the calculator changed the car or its lap');
console.log(`\n== the window: open ${r.win.open}, ${r.win.litF} + ${r.win.litS} pixels drawn, ${r.win.rows} rows, ${r.win.inputs} inputs ==`);
console.log(`  re-reads ${r.win.reread}, FROM THE CAR ${r.win.reset}, rear ${r.win.rear}, closed on Escape ${r.win.closed}, follows a new car ${r.win.follows}`);
console.log(`  Model 3: body ${f(r.ev.body)} Hz, hop ${f(r.ev.hop, 1)} Hz`);
console.log(`  Greek: ${r.el.title} · ${r.el.btn} · ${r.el.read.replace(/\n/g, ' | ')} · ${r.el.form.replace(/\n/g, ' | ')}`);
if (!r.win.open || !r.win.closed) fails.push('the window does not open from its button or close on Escape');
if (r.win.litF < 3000 || r.win.litS < 3000) fails.push('a chart is not drawn');
if (r.win.rows !== 13) fails.push(`the readout has ${r.win.rows} rows, not 13`);
if (r.win.inputs !== 8) fails.push(`the form has ${r.win.inputs} inputs, not 8`);
if (!r.win.reread) fails.push('the readout does not follow an input');
if (!r.win.reset) fails.push('FROM THE CAR does not put the car\'s corner back');
if (!r.win.rear) fails.push('REAR does not open the rear corner');
if (!r.win.follows) fails.push('the calculator keeps the last car\'s corner after a change of car');
if (!(r.ev.body > 0.5 && r.ev.body < 3 && r.ev.hop > 5 && r.ev.hop < 30)) fails.push('the calculator does not work on an electric car');
if (/CALCULATOR|SUSPENSION/.test(r.el.title + r.el.btn) || /Body|Wheel|bound|shortcut/.test(r.el.read) || /MASS|SPRING/.test(r.el.form)) fails.push('the window is not in Greek');
if (r.en !== 'SUSPENSION CALCULATOR…') fails.push(`back in English the button reads ${r.en}`);

if (errors.length) console.log('ERRORS:\n  ' + errors.join('\n  '));
if (fails.length || errors.length) { console.log('\nFAIL:\n  ' + fails.join('\n  ')); process.exit(1); }
console.log('\nPASS');
