// The induction motor (build 182, step 2.5a of plans/hybrid-electric/).
//
// WHY THIS EXISTS. MOTOR TYPE now offers an induction motor beside the permanent-magnet one: no magnets, the stator's
// own current magnetising a copper-cage rotor. What must hold:
//   · the Tesla Model S 60's rear motor, built from its published geometry (Thomas, Garbuio, Gerbaud et al., Modeling
//     and design analysis of the Tesla Model S induction motor, 2020: 4 poles, 60 slots, 74 bars, bore 156.8 mm, stack
//     152 mm, air gap 0.5 mm; 225 kW, 430 Nm, 15,000 rpm). Its turns are taken from its measured phase resistance,
//     4.35 mOhm (a production motor's DC test, Politecnico di Torino thesis 24147, 2022): 13 star-equivalent turns. What
//     was NOT used to set anything: at 350 V and the current that gives 430 Nm, the peak power and the knee against the
//     published 225 kW and ~5000 rpm, and the copper-only efficiency at 225 kW against the finite-element 93.4%;
//   · against a magnet motor of the same size and current: a lower best efficiency, no drag at all when no torque is
//     asked (no field, no iron loss: why a secondary axle carries one), and a hotter rotor. Its cost is about the same
//     (printed, not asserted): the copper cage costs what the ~1.3 kg of NdFeB it replaces does;
//   · in the app: the MOTOR TYPE field disables the magnet grade and retention, the build, the summary, the bench, a
//     lap, a race and a save all carry it, and an old save is a magnet motor.
import { chromium } from './pw.mjs';
import { fileURLToPath, pathToFileURL } from 'url';
import path from 'path';
const repo = fileURLToPath(new URL('..', import.meta.url));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1300, height: 1000 } });
const errors = [];
page.on('console', m => { if (m.type() === 'error' && !/ERR_FILE_NOT_FOUND/.test(m.text())) errors.push('console: ' + m.text()); });
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
await page.goto(pathToFileURL(path.join(repo, 'index.html')).href, { waitUntil: 'networkidle' });
await page.waitForTimeout(400);
const fails = [];

const r = await page.evaluate(() => {
  const o = {};
  // 1. the Model S 60 motor
  const V = 350, hot = { w: 150, c: 120, r: 150 };
  const geo = { type: 'im', rotorD: 155.8, stackL: 152, poles: 4, turns: 13, cooling: 'jacket', inverter: 'igbt', maxRpm: 15000 };
  let A = 300; while (A < 2500 && motorMaxTorque(motorBuild(Object.assign({ invAmps: A }, geo)), 100, V, 60) < 430) A += 10;
  const m = motorBuild(Object.assign({ invAmps: A }, geo));
  let Pk = 0; for (let n = 500; n <= 15000; n += 250) Pk = Math.max(Pk, motorMaxTorque(m, n, V, 60) * n * Math.PI / 30);
  const L = motorLosses(m, 358, 6000, V, hot), P225 = 358 * 6000 * Math.PI / 30;
  o.s60 = { slots: m.slots, bars: m.Qr, R: m.R20 * 1000, A, Pk: Pk / 1000, knee: motorBaseW(m, V, m.psi20) * 30 / Math.PI, nMax: m.nMax,
    joule: P225 / (P225 + L.cu + L.rcu), ImR: m.ImR };
  // 2. against a magnet motor of the same size and current
  const pm = motorBuild(Object.assign({}, geo, { type: 'pm', magnet: 'ndfeb', retention: 'bridges', invAmps: A }));
  const best = x => { let b = 0; for (let n = 1000; n <= 14000; n += 500) { const Tm = motorMaxTorque(x, n, V, 60); for (let T = 10; T <= Tm; T += 10) b = Math.max(b, motorEfficiency(x, T, n, V, hot)); } return b; };
  const peakHot = x => { const n = 4000, T = motorMaxTorque(x, n, V, 60), t = { w: 65, c: 65, r: 65 }; for (let k = 0; k < 60; k++) motorHeatStep(x, t, motorLosses(x, T, n, V, t), 0.5); return t; };
  o.vs = { bestIM: best(m), bestPM: best(pm), coastIM: motorLosses(m, 0, 8000, V, hot), coastPM: motorLosses(pm, 0, 8000, V, hot).total,
    costIM: m.cost, costPM: pm.cost, rotorIM: peakHot(m).r, rotorPM: peakHot(pm).r };
  // 3. in the app
  const set = (id, v) => { document.getElementById(id).value = v; };
  set('edType', 'electric'); set('evMotorType', 'im'); syncDesignEnable(); buildEngine();
  o.app = { magnetOff: document.getElementById('evMagnet').disabled && document.getElementById('evRetention').disabled, im: engine.motor.im,
    summary: document.getElementById('designSummary').textContent, score: engine.score };
  document.getElementById('btnMaxPower').click(); state.rpm = 0;
  for (let k = 0; k < 240; k++) { stepEngine(1 / 60); }
  o.app.bench = { rpm: state.rpm, kW: state.powerKW, rotor: state.mT.r };
  o.app.lap = simulateLap('tech').lap;
  const rec = { name: 'IM', build: serializeBuild('IM', '') };
  o.app.race = raceCarModel(rec, 'tech').unit;
  o.app.saved = rec.build.engine.evMotorType;
  set('evMotorType', 'pm'); syncDesignEnable(); buildEngine(); const pmLap = simulateLap('tech').lap;
  o.app.pm = { magnetOn: !document.getElementById('evMagnet').disabled, lap: pmLap };
  applyBuild(rec.build); o.app.reloaded = engine.motor.im;
  const old = serializeBuild('old', ''); delete old.engine.evMotorType; applyBuild(old); o.app.old = engine.motor.im;
  set('edType', 'petrol4'); syncDesignEnable(); buildEngine();
  return o;
});
const f = (x, d = 1) => (+x).toFixed(d);

const S = r.s60;
console.log(`== Model S 60: ${S.slots} slots, ${S.bars} bars, ${f(S.R, 2)} mOhm (measured 4.35), magnetising ${f(S.ImR, 0)} A; 430 Nm at ${S.A} A; ` +
  `peak ${f(S.Pk, 0)} kW (published 225), knee ${f(S.knee, 0)} rpm, top ${f(S.nMax, 0)} rpm; copper-only efficiency at 225 kW ${f(S.joule * 100)}% (FE 93.4) ==`);
if (S.slots !== 60 || S.bars !== 74) fails.push('the Model S geometry does not give its 60 slots and 74 bars');
if (Math.abs(S.R / 4.35 - 1) > 0.1) fails.push('the phase resistance is not the measured one at 13 turns');
if (!(S.A > 800 && S.A < 1500)) fails.push(`430 Nm takes ${S.A} A: not an automotive inverter's current`);
if (Math.abs(S.Pk / 225 - 1) > 0.2) fails.push(`peak power ${f(S.Pk, 0)} kW against the published 225`);
if (!(S.knee > 4500 && S.knee < 6500)) fails.push(`the knee at ${f(S.knee, 0)} rpm, against ~5000 (225 kW over 430 Nm)`);
if (Math.abs(S.joule - 0.934) > 0.03) fails.push(`copper-only efficiency ${f(S.joule * 100)}% against 93.4%`);
if (Math.abs(S.ImR / S.A - 0.08) > 0.06) fails.push('the magnetising current is not a small share of the peak');

const X = r.vs;
console.log(`== against a magnet motor of the same size: best efficiency ${f(X.bestIM * 100)}% vs ${f(X.bestPM * 100)}%; ` +
  `coasting at 8000 rpm ${f(X.coastIM.total, 0)} W (iron ${f(X.coastIM.fe, 0)}) vs ${f(X.coastPM, 0)} W; $${X.costIM} vs $${X.costPM}; ` +
  `rotor after 30 s at peak ${f(X.rotorIM, 0)} C vs ${f(X.rotorPM, 0)} C ==`);
if (!(X.bestIM < X.bestPM - 0.005)) fails.push('the induction motor is as efficient as a magnet motor at its best');
if (!(X.coastIM.fe === 0 && X.coastIM.cu === 0 && X.coastPM > 3 * X.coastIM.total)) fails.push('the induction motor drags when it is not driving');
if (!(X.rotorIM > X.rotorPM + 10)) fails.push('the cage does not heat the induction motor\'s rotor');

const Ap = r.app;
console.log(`== app: magnet fields disabled ${Ap.magnetOff}, "${Ap.summary.slice(0, 60)}…", ${Ap.score.peakKW} kW ${Ap.score.peakTQ} Nm, grade ${Ap.score.grade}; ` +
  `bench ${f(Ap.bench.rpm, 0)} rpm ${f(Ap.bench.kW, 0)} kW rotor ${f(Ap.bench.rotor, 0)} C; tech lap ${f(Ap.lap, 2)} s (magnet ${f(Ap.pm.lap, 2)}); race in ${Ap.race}; ` +
  `saved "${Ap.saved}", reloaded ${Ap.reloaded ? 'induction' : 'magnet'}, an old save ${Ap.old ? 'induction' : 'magnet'} ==`);
if (!Ap.magnetOff || !Ap.im || !/INDUCTION MOTOR/.test(Ap.summary) || !/COPPER CAGE/.test(Ap.summary)) fails.push('choosing an induction motor does not build one');
if (!(Ap.score.peakKW > 50 && Ap.score.peakTQ > 100)) fails.push('the induction build has no score');
if (!(Ap.bench.rpm > 1000 && Ap.bench.kW > 20)) fails.push('the bench does not run an induction motor');
if (!(Ap.lap > 40 && Ap.lap < 200) || Ap.race !== 'kWh') fails.push('an induction car does not lap or race');
if (!Ap.pm.magnetOn) fails.push('the magnet fields do not come back for a magnet motor');
if (Ap.saved !== 'im' || !Ap.reloaded || Ap.old) fails.push('a save does not carry the motor type, or an old save is not a magnet motor');

await browser.close();
if (errors.length) console.log('ERRORS:\n  ' + errors.join('\n  '));
if (fails.length) console.log('\nFAIL:\n  ' + fails.join('\n  '));
else console.log('\nOK: the induction motor is built from its geometry, meets the Model S 60\'s published figures, and trades efficiency for no magnets and no drag.');
process.exit(fails.length || errors.length ? 1 : 0);
