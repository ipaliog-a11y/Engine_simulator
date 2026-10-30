// A hybrid's front axle motor, and the Porsche 918 Spyder (build 195, step 3.5b of plans/hybrid-electric/; decision 14).
//
// WHY THIS EXISTS. A hybrid can now carry the electric car's FRONT MOTOR (src/js/hybrid.js): a motor driving the front
// wheels through its own fixed reduction, outside the gearbox, the car all-wheel drive. Its force at the wheels is
// added to the gearbox's in the 0-100, the top speed and the lap (pt.frontForce); it shares the pack with the main motor
// in proportion to their peak powers, and the lap's charge balance counts what it draws. What must hold:
//   · fitting it makes the car all-wheel drive and locks the drivetrain, taking it off gives the drive back;
//   · its force follows its own speed through its reduction (matched so its top speed falls at the car's, or published),
//     and it is declutched past its top speed; the pack's power is shared, never more than the pack gives;
//   · the lap sustains the charge with the front motor's draw counted, and is quicker with it than without;
//   · the Porsche 918 Spyder, its engine matched to its published 447 kW: 0-100 km/h 2.6 s, 0-200 7.2 s, 345 km/h
//     (Porsche). Its pack is the model's hybrid cells (~141 kW from 6.8 kWh, the real one ~230 kW): printed.
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
  const g = id => document.getElementById(id), o = {};
  const p = HYB_VEHICLE_PRESETS.find(x => /918/.test(x.name)), ep = HYB_ENGINE_PRESETS.find(x => /918/.test(x.name));
  loadVehiclePreset(p); setTab('design');
  const hy = engine.hy, f = hy.front;
  o.car = { hp: engine.score.peakHP, drive: vehicle.drive, locked: g('vhDrive').disabled, frontFd: vehicle.frontFd, matched: vehicle.frontFdMatched,
    shareSum: hy.shareR + f.shareF, packKW: packMaxPower(hy.pack, HYB_SOC) / 1000, nMax: f.motor.nMax, rTire: vehicle.rTire, frontRow: vis('evFrontFd'), rearCountHidden: !vis('evRearCount') };
  function vis(id) { const el = g(id), fl = el && el.closest('.field'); return !!fl && getComputedStyle(fl).display !== 'none'; }
  // the declutch speed, and the force either side of it
  const vDecl = f.motor.nMax * 2 * Math.PI * vehicle.rTire / 60 / vehicle.frontFd;
  o.decl = { v: vDecl * 3.6, below: hybFrontF(vDecl * 0.98), above: hybFrontF(vDecl * 1.02), at20: hybFrontF(20 / 3.6) };
  // the pack shared: the main motor with and without its partner, and what both draw flat out never past the pack
  const V = hybBusV(hy); let peakR = 0, peakF = 0;
  for (let rr = 200; rr <= hy.motor.nMax; rr += 200) peakR = Math.max(peakR, (hybMotorTq(hy, rr) * rr * Math.PI / 30 + motorLosses(hy.motor, hybMotorTq(hy, rr), rr, V, { w: 85, c: 80, r: 60 }).total));
  for (let rr = 200; rr <= f.motor.nMax; rr += 200) peakF = Math.max(peakF, (hybFrontTq(hy, rr) * rr * Math.PI / 30 + motorLosses(f.motor, hybFrontTq(hy, rr), rr, V, { w: 85, c: 80, r: 60 }).total));
  o.pack = { drawKW: (peakR + peakF) / 1000 };
  o.perf = { t100: perf.t100, t200: perf.t200, top: perf.topSpeed, free: perf.freeSpeed };
  const k = ep.real.hp / engine.score.peakHP, c0 = buildTorqueCurve, g0 = buildTorqueGrid;
  window.buildTorqueCurve = () => c0().map(q => ({ rpm: q.rpm, tq: q.tq * k }));
  window.buildTorqueGrid = () => { const G = g0(); return Object.assign({}, G, { tq: G.tq.map(row => row.map(t => t * k)) }); };
  hy._c = null; buildVehicle(); o.matchedPerf = { t100: perf.t100, t200: perf.t200, top: perf.topSpeed, free: perf.freeSpeed };
  window.buildTorqueCurve = c0; window.buildTorqueGrid = g0; hy._c = null; buildVehicle();
  { const L = simulateLap('tech'); o.lap = { t: L.lap, dep: L.hy.deployKJ, reg: L.hy.regenKJ, share: L.hy.share }; }
  // a short front reduction declutches it lower
  g('evFrontFd').value = 12; buildEngine(); o.short = { fd: vehicle.frontFd, at200: hybFrontF(200 / 3.6), at60: hybFrontF(60 / 3.6) };
  g('evFrontFd').value = 0;
  // the same car without the front motor
  g('evFront').value = 'none'; syncDesignEnable(); buildEngine(); buildVehicle();
  { const L = simulateLap('tech'); o.noFront = { drive: vehicle.drive, locked: g('vhDrive').disabled, front: !!engine.hy.front, t100: perf.t100, lap: L.lap, F: hybFrontF(30) }; }
  applyBuild({ engine: Object.assign({}, DEFAULT_ENGINE), tune: Object.assign({}, STD_TUNE) });
  return o;
});
const f = (x, d = 1) => (+x).toFixed(d);
const pct = (a, b) => (a / b - 1) * 100;

const C = r.car;
console.log(`== 918: engine ${C.hp} hp as built (608 PS); ${C.drive}, locked ${C.locked}; front reduction ${f(C.frontFd, 2)}:1 (matched ${f(C.matched, 2)}); pack shares sum ${f(C.shareSum, 6)}, ` +
  `the pack gives ${f(C.packKW)} kW and both motors draw at most ${f(r.pack.drawKW)}; FRONT REDUCTION shown ${C.frontRow}, REAR MOTORS hidden ${C.rearCountHidden} ==`);
if (C.drive !== 'awd' || !C.locked) fails.push('a front axle motor does not make the car all-wheel drive');
if (Math.abs(C.shareSum - 1) > 1e-9 || r.pack.drawKW > C.packKW * 1.01) fails.push('the two motors draw more than the pack gives');
if (!C.frontRow || !C.rearCountHidden) fails.push('the form does not offer a hybrid its front motor\'s fields');
const Dc = r.decl;
console.log(`== front motor: ${f(Dc.at20, 0)} N at 20 km/h; declutched at ${f(Dc.v, 0)} km/h (${f(Dc.below, 0)} N below, ${f(Dc.above, 0)} N above); a 12:1 reduction: ${f(r.short.at60, 0)} N at 60, ${f(r.short.at200, 0)} N at 200 km/h ==`);
if (!(Dc.at20 > 1000 && Dc.below > 0 && Dc.above === 0)) fails.push('the front motor is not declutched past its top speed');
if (!(r.short.fd === 12 && r.short.at60 > Dc.at20 * 0 && r.short.at200 === 0)) fails.push('a published front reduction is not used');
const P = r.perf, M = r.matchedPerf;
console.log(`== as built: 0-100 ${f(P.t100, 2)} s, 0-200 ${f(P.t200, 2)}, top ${f(P.top, 0)}; matched to 447 kW: 0-100 ${f(M.t100, 2)} s (Porsche 2.6, ${f(pct(M.t100, 2.6))}%), ` +
  `0-200 ${f(M.t200, 2)} s (7.2, ${f(pct(M.t200, 7.2))}%), top ${f(M.top, 0)} km/h (345, ${f(pct(M.top, 345))}%) ==`);
if (Math.abs(pct(M.t100, 2.6)) > 10) fails.push(`the 918's 0-100 ${f(M.t100, 2)} s against Porsche's 2.6`);
if (Math.abs(pct(M.t200, 7.2)) > 8) fails.push(`the 918's 0-200 ${f(M.t200, 2)} s against Porsche's 7.2`);
if (Math.abs(pct(M.top, 345)) > 4) fails.push(`the 918's top speed ${f(M.top, 0)} km/h against Porsche's 345`);
const L = r.lap, N = r.noFront;
console.log(`== lap (tech): ${f(L.t, 2)} s, deploy share ${f(L.share * 100, 0)}%, ${f(L.dep, 0)} kJ out, ${f(L.reg, 0)} back; without the front motor ${f(N.lap, 2)} s, 0-100 ${f(N.t100, 2)} s, ${N.drive} (locked ${N.locked}) ==`);
if (!(L.dep <= L.reg * 1.002 + 0.1)) fails.push('the lap does not sustain the charge with the front motor counted');
if (!(N.lap > L.t && N.t100 > P.t100)) fails.push('the front motor does not make the car quicker');
if (N.front || N.F !== 0 || N.locked) fails.push('taking the front motor off does not give the drive back');

await browser.close();
if (errors.length) console.log('ERRORS:\n  ' + errors.join('\n  '));
if (fails.length) console.log('\nFAIL:\n  ' + fails.join('\n  '));
else console.log('\nOK: a hybrid\'s front axle motor drives the front wheels, shares the pack, and gives the 918 Spyder its pace.');
process.exit(fails.length || errors.length ? 1 : 0);
