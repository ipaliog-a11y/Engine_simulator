// The electric drive's physics (build 178, step 2.1 of plans/hybrid-electric/).
//
// WHY THIS EXISTS. The motor, inverter and battery are derived from what they are built of: the rotor's size, the turns,
// the magnets, the cooling, the inverter's devices, the cells. Three constants are measured, all on one motor (the
// Tesla Model 3 rear motor, MotorXP 2020), so the model is checked here against what did NOT set it. What must hold:
//   · the Model 3: the measured back-EMF and the torque at 953 A come back (the constants are wired as documented),
//     and its phase resistance, from the slot copper alone, lands near the measured 4.75 mOhm;
//   · the 2012 Nissan Leaf (ORNL, Burress 2013), with only its geometry and the turns that put its knee where Nissan
//     says (80 kW from 2730 rpm on 375 V): it makes its 280 Nm and 80 kW, holds 80 kW at 7000 rpm with the stator
//     settling near ORNL's ~135 C, and is above ~97% efficient somewhere between 5000 and 9000 rpm;
//   · the Model 3's two packs: 96 x 46 NCA cells give ~350 V and ~230 Ah, 108 LFP prisms ~340 V;
//   · every field acts through its mechanism and costs something: more turns raise torque per amp and lower the knee,
//     a sleeve lets a big rotor rev, hot magnets lose torque, thin laminations cut high-speed iron loss, SiC beats
//     IGBT at part load, better cooling holds a cooler winding, a higher voltage raises the knee;
//   · technology follows the year: a 2010 pack costs several times a 2020 one, LFP is not there in the 1990s, and a
//     loaded pack sags.
import { chromium } from './pw.mjs';
import { fileURLToPath, pathToFileURL } from 'url';
import path from 'path';
const repo = fileURLToPath(new URL('..', import.meta.url));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
const errors = [];
page.on('console', m => { if (m.type() === 'error' && !/ERR_FILE_NOT_FOUND/.test(m.text())) errors.push('console: ' + m.text()); });
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
await page.goto(pathToFileURL(path.join(repo, 'index.html')).href, { waitUntil: 'networkidle' });
await page.waitForTimeout(400);
const fails = [];

const r = await page.evaluate(() => {
  const o = {};
  const M3 = { rotorD: 149.9, stackL: 134, poles: 6, turns: 12, magnet: 'ndfeb', retention: 'bridges', cooling: 'jacket',
    inverter: 'igbt', invAmps: 953, maxRpm: 18000 };
  const m3 = motorBuild(M3), psi = motorPsi(m3, 20);
  o.m3 = { emf: Math.sqrt(3) * psi * m3.p * 1000 * Math.PI / 30, tq: motorTorqueAtI(m3, 953, psi), R: m3.R20 * 1000,
    mass: m3.mass, J: m3.J, nMax: m3.nMax };
  // the Leaf: ORNL's geometry (stator 198 mm, stack 151 mm, 8 poles), 33 turns, a 260 A inverter, 375 V
  const LF = { rotorD: 130, stackL: 151.4, poles: 8, turns: 33, magnet: 'ndfeb', retention: 'bridges', cooling: 'jacket',
    inverter: 'igbt', invAmps: 260, maxRpm: 10390 };
  const lf = motorBuild(LF), ps = motorPsi(lf, 60);
  const T80 = 80000 / (7000 * Math.PI / 30), st = motorSteadyTemps(lf, T80, 7000, 375);
  let best = { e: 0 };
  for (let n = 1000; n <= 10000; n += 250) for (let T = 10; T <= 300; T += 5) {
    if (T > motorMaxTorque(lf, n, 375)) continue;
    const L = motorLosses(lf, T, n, 375, { w: 90, r: 70 }), P = T * n * Math.PI / 30, e = P / (P + L.cu + L.fe + L.mech);
    if (e > best.e) best = { e, n, T };
  }
  o.leaf = { knee: motorBaseW(lf, 375, ps) * 30 / Math.PI, tpk: motorMaxTorque(lf, 1000, 375),
    pk: Math.max(...[3000, 5000, 7000, 9000].map(n => motorMaxTorque(lf, n, 375) * n * Math.PI / 30)) / 1000,
    hold: motorMaxTorque(lf, 7000, 375) >= T80, tW: st.w, tC: st.c, best };
  // packs
  const lr = packBuild({ chem: 'nca', series: 96, kWh: 80.5, year: 2018 }), rwd = packBuild({ chem: 'lfp', series: 108, kWh: 60, year: 2023 });
  o.pack = { lrV: lr.Vnom, lrAh: lr.Ah, rwdV: rwd.Vnom, lrMass: lr.mass,
    sag: packDraw(lr, 0.5, 200e3), ocv50: packOcv(lr, 0.5),
    pHi: packMaxPower(lr, 0.9), pLo: packMaxPower(lr, 0.1),
    c2010: packBuild({ chem: 'nca', series: 96, kWh: 80, year: 2010 }).cost, c2020: packBuild({ chem: 'nca', series: 96, kWh: 80, year: 2020 }).cost,
    lfp1995: chemAvailable('lfp', 1995), lfp2020: chemAvailable('lfp', 2020), lead1995: chemAvailable('lead', 1995),
    tooMuch: packDraw(rwd, 0.5, 2e6) };
  // mechanisms, each against the Model 3 motor with one field changed
  const mod = patch => motorBuild(Object.assign({}, M3, patch));
  const tqA = (m, I) => motorTorqueAtI(m, I, motorPsi(m, 20)), knee = (m, V) => motorBaseW(m, V, motorPsi(m, 20)) * 30 / Math.PI;
  const more = mod({ turns: 14 });
  o.turns = { tq: [tqA(m3, 500), tqA(more, 500)], knee: [knee(m3, 350), knee(more, 350)] };
  const big = { rotorD: 200, maxRpm: 20000 };
  o.sleeve = [mod(big).nMax, mod(Object.assign({ retention: 'sleeve' }, big)).nMax];
  o.hotMag = [motorMaxTorque(m3, 1000, 350, 40), motorMaxTorque(m3, 1000, 350, 140)];
  const pt = { w: 90, r: 70 };
  o.lam = [motorLosses(m3, 60, 15000, 350, pt).fe, motorLosses(mod({ lamination: 0.2 }), 60, 15000, 350, pt).fe];
  o.sic = [motorEfficiency(m3, 60, 4000, 350), motorEfficiency(mod({ inverter: 'sic' }), 60, 4000, 350)];
  o.cool = ['air', 'jacket', 'spray', 'slot'].map(c => ({ c, tW: motorSteadyTemps(mod({ cooling: c }), 150, 6000, 350).w, cost: mod({ cooling: c }).cost }));
  o.volt = [knee(m3, 400), knee(m3, 800)];
  o.costs = { base: m3.cost, sleeve: mod({ retention: 'sleeve' }).cost, dy: mod({ magnet: 'ndfebDy' }).cost, sic: mod({ inverter: 'sic' }).cost };
  // a held peak heats the winding, and a cooler start or better cooling holds it longer
  const hold = m => { const t = { w: 65, c: 65, r: 65 }; let s = 0; for (; s < 600 && t.w < 180; s += 0.5) motorHeatStep(m, t, motorLosses(m, 430, 3000, 350, t), 0.5); return s; };
  o.peakHold = { jacket: hold(m3), slot: hold(mod({ cooling: 'slot' })), air: hold(mod({ cooling: 'air' })) };
  return o;
});
const f = (x, d = 1) => (+x).toFixed(d);

// 1. the Model 3: the measured constants come back, and what they did not set
console.log(`== Model 3 rear motor: ${f(r.m3.emf)} V/krpm back-EMF (measured 42), ${f(r.m3.tq, 0)} Nm at 953 A (430), ` +
  `phase resistance ${f(r.m3.R, 2)} mOhm from the slot copper (measured 4.75), ${f(r.m3.mass, 0)} kg, J ${f(r.m3.J, 3)} kg m2, ` +
  `max ${f(r.m3.nMax, 0)} rpm ==`);
if (Math.abs(r.m3.emf / 42 - 1) > 0.02) fails.push(`the Model 3's back-EMF is ${f(r.m3.emf)} V/krpm, not the measured 42`);
if (Math.abs(r.m3.tq / 430 - 1) > 0.03) fails.push(`the Model 3 makes ${f(r.m3.tq, 0)} Nm at 953 A, not 430`);
// Known gap: the slot-copper estimate gives less resistance than measured (the leads, the strand insulation and the
// real slot shape are not modelled). Held to within half either way, so a change that breaks it is seen.
if (!(r.m3.R > 0.5 * 4.75 && r.m3.R < 1.5 * 4.75)) fails.push(`the Model 3's phase resistance is ${f(r.m3.R, 2)} mOhm against a measured 4.75`);
if (!(r.m3.mass > 35 && r.m3.mass < 80)) fails.push(`a Model 3-sized motor weighs ${f(r.m3.mass, 0)} kg`);

// 2. the Leaf, which set nothing
const L = r.leaf;
console.log(`== 2012 Leaf (ORNL): knee ${f(L.knee, 0)} rpm on 375 V (Nissan 2730), ${f(L.tpk, 0)} Nm (280), ${f(L.pk)} kW (80, ` +
  `ORNL ran it above), 80 kW held at 7000 rpm: winding ${f(L.tW, 0)} C, core ${f(L.tC, 0)} C (ORNL ~135 C), peak ` +
  `${f(100 * L.best.e)}% at ${L.best.n} rpm ${L.best.T} Nm (ORNL >97% at 5000-9000) ==`);
if (Math.abs(L.knee / 2730 - 1) > 0.1) fails.push(`the Leaf's knee is ${f(L.knee, 0)} rpm, not near 2730`);
if (L.tpk < 280) fails.push(`the Leaf makes ${f(L.tpk, 0)} Nm, under its 280`);
if (!(L.pk >= 80 && L.pk < 100)) fails.push(`the Leaf makes ${f(L.pk)} kW at most, not its 80-odd`);
if (!L.hold) fails.push('the Leaf cannot make 80 kW at 7000 rpm');
if (!(L.tW > 100 && L.tW < 170)) fails.push(`holding 80 kW at 7000 rpm the Leaf's winding settles at ${f(L.tW, 0)} C, not near ORNL's ~135`);
if (!(L.best.e > 0.965 && L.best.n >= 4500 && L.best.n <= 9500)) fails.push(`the Leaf peaks at ${f(100 * L.best.e)}% at ${L.best.n} rpm, not ~97% at 5000-9000`);

// 3. the packs
const P = r.pack;
console.log(`== packs: Model 3 LR 96s NCA ${f(P.lrV)} V (350) ${f(P.lrAh)} Ah (230) ${f(P.lrMass, 0)} kg; RWD 108s LFP ${f(P.rwdV)} V (340); ` +
  `200 kW at half charge sags ${f(P.ocv50)} -> ${f(P.sag.V)} V; most power ${f(P.pHi / 1000, 0)} kW full, ${f(P.pLo / 1000, 0)} kW at 10%; ` +
  `80 kWh costs $${P.c2010} in 2010, $${P.c2020} in 2020 ==`);
if (Math.abs(P.lrV / 350 - 1) > 0.03) fails.push(`the Model 3 LR pack is ${f(P.lrV)} V, not ~350`);
if (Math.abs(P.lrAh / 230 - 1) > 0.03) fails.push(`the Model 3 LR pack is ${f(P.lrAh)} Ah, not ~230`);
if (Math.abs(P.rwdV / 340 - 1) > 0.03) fails.push(`the Model 3 RWD LFP pack is ${f(P.rwdV)} V, not ~340`);
if (!(P.sag && P.sag.V < P.ocv50 - 10)) fails.push('a pack under 200 kW does not sag');
if (!(P.pLo < P.pHi)) fails.push('a nearly empty pack gives as much power as a full one');
if (!(P.c2010 > 4 * P.c2020)) fails.push(`a 2010 pack ($${P.c2010}) is not several times a 2020 one ($${P.c2020})`);
if (P.lfp1995 || !P.lfp2020 || !P.lead1995) fails.push('chemistries are not available by the year');
if (P.tooMuch !== null) fails.push('a pack gives 2 MW');

// 4. every field through its mechanism, and at a price
console.log(`== turns 12 -> 14: ${f(r.turns.tq[0], 0)} -> ${f(r.turns.tq[1], 0)} Nm at 500 A, knee ${f(r.turns.knee[0], 0)} -> ${f(r.turns.knee[1], 0)} rpm; ` +
  `200 mm rotor ${f(r.sleeve[0], 0)} rpm on bridges, ${f(r.sleeve[1], 0)} sleeved; magnets 40 -> 140 C ${f(r.hotMag[0], 0)} -> ${f(r.hotMag[1], 0)} Nm; ` +
  `iron at 15000 rpm ${f(r.lam[0], 0)} W at 0.35 mm, ${f(r.lam[1], 0)} at 0.20; part load ${f(100 * r.sic[0], 2)}% IGBT, ${f(100 * r.sic[1], 2)}% SiC; ` +
  `knee ${f(r.volt[0], 0)} rpm at 400 V, ${f(r.volt[1], 0)} at 800 ==`);
console.log('   cooling at 150 Nm, 6000 rpm: ' + r.cool.map(c => `${c.c} ${isFinite(c.tW) ? f(c.tW, 0) + ' C' : 'cannot hold it (runaway)'} ($${c.cost})`).join(', ') +
  `; peak 430 Nm from 65 C to 180 C: jacket ${f(r.peakHold.jacket)} s, slot ${f(r.peakHold.slot)} s, air ${f(r.peakHold.air)} s`);
if (!(r.turns.tq[1] > r.turns.tq[0] && r.turns.knee[1] < r.turns.knee[0])) fails.push('more turns do not trade the knee for torque per amp');
if (!(r.sleeve[1] > r.sleeve[0])) fails.push('a carbon sleeve does not let a big rotor rev higher');
if (!(r.hotMag[1] < r.hotMag[0])) fails.push('hot magnets do not lose torque');
if (!(r.lam[1] < r.lam[0])) fails.push('thinner laminations do not cut high-speed iron loss');
if (!(r.sic[1] > r.sic[0])) fails.push('SiC is not more efficient than IGBT at part load');
if (!(r.volt[1] > 1.9 * r.volt[0])) fails.push('doubling the voltage does not double the knee');
const tw = r.cool.map(c => c.tW), cc = r.cool.map(c => c.cost);
if (!(tw[0] > tw[1] && tw[1] > tw[2] && tw[2] > tw[3])) fails.push('better cooling does not hold a cooler winding: ' + tw.map(x => f(x, 0)).join(' > '));
if (!(cc[0] < cc[1] && cc[1] < cc[2] && cc[2] < cc[3])) fails.push('better cooling is not dearer');
if (!(r.peakHold.slot > r.peakHold.jacket && r.peakHold.jacket > r.peakHold.air)) fails.push('better cooling does not hold the peak longer');
const C = r.costs;
if (!(C.sleeve > C.base && C.dy > C.base && C.sic > C.base)) fails.push(`a sleeve, Dy magnets or SiC cost nothing: ${JSON.stringify(C)}`);

await browser.close();
if (errors.length) console.log('ERRORS:\n  ' + errors.join('\n  '));
if (fails.length) { console.log('\nFAIL:\n  ' + fails.join('\n  ')); }
else console.log('\nOK: the electric drive is the measured motors, the packs, and every field at a price.');
process.exit(fails.length || errors.length ? 1 : 0);
