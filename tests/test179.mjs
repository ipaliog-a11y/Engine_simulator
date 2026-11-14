// The magnet motor's circuit solved under load (build 294, phase C of plans/road-to-v1.md).
//
// WHY THIS EXISTS. Until build 294 three things about a magnet motor were constants set on the Model 3: how much torque
// per amp saturation takes (SAT_K), the voltage drop at full current (V_DROP) and the constant-power range (CPSR, with
// the field-weakening current as 0.7 of the inverter's); and its iron loss was all the iron at 1.5 T, shared 80/20. Now
// the magnets' circuit is solved slice by slice round a pole with the stator's current in it. What must hold:
//   · the constants are gone from src/js/electric.js;
//   · saturation: torque per amp falls as the current rises;
//   · saliency: the best angle (MTPA) leans to the negative d-axis and gives more than pure q-axis current;
//   · field weakening: well past the knee the current runs on the negative d-axis and the voltage sits at the
//     inverter's limit; a held torque there needs more current than below the knee;
//   · iron per part: the stator's teeth and yoke and the rotor's surface each have their loss, the rotor's goes to the
//     rotor in the heat, and a wider gap (less slot ripple) lowers the rotor's;
//   · the answers do not depend on the order they are asked in (the caches hold exact answers).
import { chromium } from './pw.mjs';
import { readFileSync } from 'fs';
import { fileURLToPath, pathToFileURL } from 'url';
import path from 'path';
const repo = fileURLToPath(new URL('..', import.meta.url));
const fails = [];
const src = readFileSync(path.join(repo, 'src/js/electric.js'), 'utf8');
for (const c of [/\bSAT_K=/, /V_DROP=/, /const CPSR=/, /const B_CORE=/, /0\.7\*m\.Imax/]) if (c.test(src)) fails.push(`${c} is still in electric.js`);

const browser = await chromium.launch();
const page = await browser.newPage();
const errors = [];
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
await page.goto(pathToFileURL(path.join(repo, 'index.html')).href, { waitUntil: 'networkidle' });
await page.waitForTimeout(300);
const r = await page.evaluate(() => {
  const M3 = { rotorD: 149.9, stackL: 134, poles: 6, turns: 12, magnet: 'ndfeb', retention: 'bridges', cooling: 'jacket',
    inverter: 'igbt', invAmps: 953, maxRpm: 18000 };
  const m = motorBuild(M3), V = 350, psi = motorPsi(m, 60), o = {};
  o.kq = motorTorqueAtI(m, 953 / 4, psi) / (953 / 4); o.kf = motorTorqueAtI(m, 953, psi) / 953;
  const mt = dqMtpa(m, 953, 60); o.g = mt.g * 180 / Math.PI; o.Tm = mt.T; o.Tq = dqAt(m, 0, 953, 60).T;
  const knee = motorBaseW(m, V, psi) * 30 / Math.PI; o.knee = knee;
  const lo = motorOp(m, 150, knee * 0.5, V, 60), hi = motorOp(m, 150, knee * 2, V, 60);
  o.lo = { I: lo.I, Id: lo.Id }; o.hi = { I: hi.I, Id: hi.Id, V: hi.V, Vmax: V / Math.sqrt(3) };
  const t = { w: 90, r: 70 }, L = motorLosses(m, 150, 6000, V, t);
  o.L = { feS: L.feS, feR: L.feR, fe: L.fe };
  const h0 = { w: 65, c: 65, r: 65 }, h1 = { w: 65, c: 65, r: 65 };
  motorHeatStep(m, h0, Object.assign({}, L, { feR: 0 }), 10); motorHeatStep(m, h1, L, 10); o.rotorWarmer = h1.r - h0.r;
  const wide = Object.assign({}, m, { gap: m.gap * 2 }); o.feRwide = rotorIronLoss(wide, 6000, 1);
  o.feRbase = rotorIronLoss(m, 6000, 1);
  // order: the same questions asked of a fresh motor in reverse order
  const ask = mm => [3000, 9000, 15000].map(n => motorMaxTorque(mm, n, V, 60) + motorLosses(mm, 100, n, V, t).total);
  const a = ask(motorBuild(M3)), b = ask(motorBuild(Object.assign({}, M3, { maxRpm: 18000 }))).reverse().reverse();
  const m2 = motorBuild(M3); [15000, 9000, 3000].forEach(n => motorLosses(m2, 100.0001, n, V, t)); const c = ask(m2);
  o.order = a.every((x, i) => x === b[i] && x === c[i]);
  return o;
});
const f = (x, d = 1) => (+x).toFixed(d);
console.log(`== saturation: ${f(r.kq, 3)} Nm/A at a quarter of the current, ${f(r.kf, 3)} at full ==`);
if (!(r.kf < 0.97 * r.kq)) fails.push('torque per amp does not fall with the current');
console.log(`== MTPA at 953 A: ${f(r.g)} deg towards -d, ${f(r.Tm, 0)} Nm against ${f(r.Tq, 0)} on the q-axis ==`);
if (!(r.g > 5 && r.g < 60 && r.Tm > r.Tq * 1.02)) fails.push('the best angle does not lean to -d, or gives no reluctance torque');
console.log(`== 150 Nm: at half the knee (${f(r.knee * 0.5, 0)} rpm) ${f(r.lo.I, 0)} A, Id ${f(r.lo.Id, 0)}; at twice it ${f(r.hi.I, 0)} A, Id ${f(r.hi.Id, 0)}, ${f(r.hi.V, 0)} V of ${f(r.hi.Vmax, 0)} ==`);
if (!(r.hi.Id < -50 && r.hi.I > r.lo.I && Math.abs(r.hi.V / r.hi.Vmax - 1) < 0.01)) fails.push('past the knee the field is not weakened to the voltage');
console.log(`== iron at 150 Nm, 6000 rpm: stator ${f(r.L.feS, 0)} W, rotor ${f(r.L.feR, 0)} W; the rotor's loss warms it ${f(r.rotorWarmer, 3)} C in 10 s; ` +
  `rotor ripple loss ${f(r.feRbase, 1)} W, ${f(r.feRwide, 1)} W with twice the gap; order-independent ${r.order} ==`);
if (!(r.L.feS > 0 && r.L.feR > 0 && Math.abs(r.L.fe - r.L.feS - r.L.feR) < 1e-6)) fails.push('the iron loss is not the stator\'s and the rotor\'s');
if (!(r.rotorWarmer > 0)) fails.push('the rotor\'s iron loss does not heat the rotor');
if (!(r.feRwide < r.feRbase)) fails.push('a wider gap does not lower the rotor\'s ripple loss');
if (!r.order) fails.push('the motor\'s answers depend on the order they are asked in');
await browser.close();
if (errors.length || fails.length) { console.log('\nFAIL:\n  ' + fails.concat(errors).join('\n  ')); process.exit(1); }
console.log('\nOK: the magnet motor\'s saturation, saliency, field weakening and iron loss come from its circuit.');
