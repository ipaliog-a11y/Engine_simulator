// WHY THIS EXISTS (build 446): EV & hybrid thermal, regen, P2 cranking, and IM/power-split physics parity. What must hold:
//   · packChargePower tapers regen at high SOC (98% vs 50%) and packDraw rejects charging past vMax/cCharge;
//     evRegenTable/hybRegenTable wire packChargePower and evLapHeat integrates real SOC across the lap;
//   · EV LIVE bench initializes & steps state.tB (heats under load, derates when hot) and supports negative regen torque testing;
//   · P2 hybrid starts the ICE at full throttle (no cranking deadlock) and hybrid bench derates on live H.mT / H.tB.b;
//   · hybrid lap (hybLapHeat) and race (hybRaceHeatStep) heat pack/motor and derate under sustained high-C draw;
//   · aluminium-conductor IM has higher rotor resistance (Rr20) than copper IM, NdFeB rotorIronLoss includes magnet eddy loss,
//     and power-split boost converter applies 97% DC-DC efficiency when boosting pack voltage to PS.busV.
import { chromium } from './pw.mjs';
import { fileURLToPath, pathToFileURL } from 'url';
import path from 'path';
const repo = fileURLToPath(new URL('..', import.meta.url));
const browser = await chromium.launch();
const page = await browser.newPage();
const errors = [];
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
await page.goto(pathToFileURL(path.join(repo, 'index.html')).href, { waitUntil: 'networkidle' });
const fails = [];
const chk = (ok, msg) => { if (!ok) fails.push(msg); };

const r = await page.evaluate(() => {
  const out = {};
  const load = (pr, over) => {
    applyEngineToForm(Object.assign({}, DEFAULT_ENGINE, pr.engine, over || {}));
    syncDesignEnable();
    buildEngine();
  };

  // 1. packChargePower tapers at high SOC, packDraw rejects charge overload, evLapHeat integrates SOC
  load(EV_ENGINE_PRESETS[1]); // Model Y / NCA pack (vMax = 4.20 V, 1C = 78 kW)
  const pk = engine.pack;
  const pChg50 = packChargePower(pk, 0.5, 25);
  const pChg98 = packChargePower(pk, 0.98, 25);
  const pChgCold = packChargePower(pk, 0.98, 0);
  const chgOver = packDraw(pk, 0.98, -pChg50 * 2, 25);
  const chgClamp = packDrawClamped(pk, 0.98, -pChg50 * 2, 25);
  const reg50 = evRegenTable(engine, engine.redline, null, 0.5, 25);
  const reg98 = evRegenTable(engine, engine.redline, null, 0.98, 25);
  const lapProf = {
    dt: Array(40).fill(1),
    rpm: Array(40).fill(4500),
    tq: Array(40).fill(220)
  };
  const lapH = evLapHeat(engine, lapProf, 0.8);
  out.regenSoc = {
    pChg50, pChg98, pChgCold,
    chgOverNull: chgOver === null,
    chgClampI: chgClamp.I, chgClampHeat: chgClamp.heat,
    regHigh50: reg50[reg50.length - 1], regHigh98: reg98[reg98.length - 1],
    lapSocEnd: lapH.socEnd, lapTbEnd: lapH.tB[lapH.tB.length - 1]
  };

  // 2. EV LIVE bench: pack thermal tracking (state.tB) + derate + negative regen torque testing
  load(EV_ENGINE_PRESETS[0], { evKWh: 10, evSeries: 96 }); // smaller pack heats visibly quickly
  const tB0 = state.tB.b;
  state.throttle = 1; state.load = 0.5; state.rpm = 4000; state.soc = 0.7;
  for (let i = 0; i < 600; i++) stepMotorBench(0.05); // 30 s full load
  const tBHot = state.tB.b;
  // Hot pack derating
  state.tB.b = 58;
  const tqCool = driveMaxTorque(engine, 4000, packOcv(engine.pack, 0.7), state.mT, 0.7, 30);
  const tqHot = driveMaxTorque(engine, 4000, packOcv(engine.pack, 0.7), state.mT, 0.7, 58);
  // Negative regen torque testing on EV bench (read live torque/current while rotor is spinning)
  state.tB.b = 30; state.soc = 0.6; state.rpm = 5000; state.load = 0; state.throttle = -0.8;
  const socBeforeRegen = state.soc;
  stepMotorBench(0.02);
  const regenTq = state.torque, regenI = state.battI, regenKW = state.battKW;
  for (let i = 0; i < 10; i++) stepMotorBench(0.02);
  out.evBench = {
    tB0, tBHot, tqCool, tqHot,
    regenTq, regenI, regenKW,
    socBeforeRegen, socAfterRegen: state.soc
  };
  state.throttle = 0;

  // 3. P2 hybrid full-throttle engine-start (no deadlock) + live bench thermal derating
  const p2Pr = HYB_ENGINE_PRESETS.find(p => p.engine.hyMode === 'p2');
  load(p2Pr);
  const H = hybBenchState();
  H.mode = 'auto'; H.engOn = true; H.fired = false; H.n = 1500;
  state.rpm = 0; state.throttle = 1; state.load = 0.5;
  let firedAt = -1;
  for (let i = 0; i < 120; i++) { // up to 2 s
    stepHybridBench(1 / 60);
    if (H.fired && firedAt < 0) firedAt = (i + 1) / 60;
  }
  const p2Start = { fired: H.fired, firedAt, rpm: state.rpm, Te: H.Te };
  // Thermal derating on hybrid bench
  H.mode = 'ev'; H.engOn = false; H.fired = false; H.n = 2000; state.throttle = 1;
  H.tB.b = 30; H.mT = { w: 70, c: 70, r: 70 };
  stepHybridBench(1 / 60);
  const tmCool = H.Tm;
  H.tB.b = 58; H.mT = { w: 170, c: 120, r: 145 };
  stepHybridBench(1 / 60);
  const tmHot = H.Tm;
  out.hybBench = { p2Start, tmCool, tmHot };

  // 4. Hybrid lap (hybLapHeat) and race (hybRaceHeatStep) thermal heating & derating on sustained high-C draw
  load(p2Pr);
  const fakeLap = {
    v: Float32Array.from({ length: 60 }, () => 35),
    track: { line: Array.from({ length: 60 }, () => ({ ds3: 100 })) },
    replay: { rpm: Float32Array.from({ length: 60 }, () => 3500) }
  };
  const fakePm = Float32Array.from({ length: 60 }, () => 35000); // sustained 35 kW (~22C on 1.56 kWh pack)
  const hLap = hybLapHeat(engine, fakeLap, fakePm, 0.6);
  // Hybrid race thermal stepping
  const M = {
    L3: 6000,
    hy: {
      D: 2000, usable: 5000, socHi: 85, socT: 60,
      motor: engine.hy.motor, pack: engine.hy.pack, V: hybBusV(engine.hy),
      tCool: engine.hy.motor.cool.tCool, pDeployW: 28000, pRegenW: 12000, rpmAvg: 3500
    }
  };
  const car = { M, v: 40 };
  hybRaceCarInit(car, { hyX: 1 });
  const raceTb0 = car.hyT.b;
  for (let i = 0; i < 240; i++) hybRaceHeatStep(M, car, 1.0); // 4 min sustained racing
  out.hybThermal = {
    lapBMax: hLap.bMax, lapWMax: hLap.wMax, lapMinShare: hLap.minShare,
    raceTb0, raceTbEnd: car.hyT.b, raceWEnd: car.hyT.w, raceDerate: car.hyDerate, raceHyX: car.hyX
  };

  // 5. IM aluminium rotor cage (RHO_AL), PM magnet eddy loss, and Power-Split DC-DC boost converter efficiency
  const imCu = motorBuild({
    type: 'im', rotorD: 150, statorOD: 230, stackL: 130, poles: 4, turns: 12,
    retention: 'bridges', cooling: 'jacket', lamination: 0.35, wire: 'round', conductor: 'copper',
    inverter: 'igbt', invAmps: 800, maxRpm: 16000
  });
  const imAl = motorBuild({
    type: 'im', rotorD: 150, statorOD: 230, stackL: 130, poles: 4, turns: 12,
    retention: 'bridges', cooling: 'jacket', lamination: 0.35, wire: 'round', conductor: 'aluminium',
    inverter: 'igbt', invAmps: 800, maxRpm: 16000
  });
  const pmNd = motorBuild({
    type: 'pm', rotorD: 150, statorOD: 225, stackL: 134, poles: 6, turns: 12, magnet: 'ndfeb',
    retention: 'bridges', cooling: 'jacket', lamination: 0.35, wire: 'round', conductor: 'copper',
    inverter: 'igbt', invAmps: 950, maxRpm: 18000
  });
  const pmFe = motorBuild({
    type: 'pm', rotorD: 150, statorOD: 225, stackL: 134, poles: 6, turns: 12, magnet: 'ferrite',
    retention: 'bridges', cooling: 'jacket', lamination: 0.35, wire: 'round', conductor: 'copper',
    inverter: 'igbt', invAmps: 950, maxRpm: 18000
  });
  const feRNd = rotorIronLoss(pmNd, 12000, 0.8);
  const feRFe = rotorIronLoss(pmFe, 12000, 0.8);
  const psPr = HYB_ENGINE_PRESETS.find(p => p.engine.hyMode === 'ps');
  load(psPr);
  const etaPs = psBoostEta(engine.hy);
  load(p2Pr);
  const etaP2 = psBoostEta(engine.hy);
  out.refinements = {
    imCuRr20: imCu.Rr20, imAlRr20: imAl.Rr20, imRrRatio: imAl.Rr20 / imCu.Rr20,
    imCuCageKg: imCu.mCage, imAlCageKg: imAl.mCage,
    feRNd, feRFe,
    etaPs, etaP2
  };
  return out;
});

// Assertions
chk(r.regenSoc.pChg98 < r.regenSoc.pChg50, `packChargePower did not taper at 98% SOC: 50%=${r.regenSoc.pChg50.toFixed(0)} vs 98%=${r.regenSoc.pChg98.toFixed(0)}`);
chk(r.regenSoc.pChgCold < r.regenSoc.pChg98, `packChargePower did not taper when cold (0 C): ${r.regenSoc.pChgCold.toFixed(0)} vs ${r.regenSoc.pChg98.toFixed(0)}`);
chk(r.regenSoc.chgOverNull, 'packDraw did not return null on charging overload (P < 0)');
chk(r.regenSoc.chgClampI < 0 && r.regenSoc.chgClampHeat > 0, `packDrawClamped charging overload invalid: ${JSON.stringify(r.regenSoc)}`);
chk(r.regenSoc.regHigh98 < r.regenSoc.regHigh50, `evRegenTable did not taper at 98% SOC: ${r.regenSoc.regHigh50.toFixed(1)} vs ${r.regenSoc.regHigh98.toFixed(1)}`);
chk(r.regenSoc.lapSocEnd < 0.8 && r.regenSoc.lapSocEnd > 0.05, `evLapHeat did not integrate SOC: socEnd=${r.regenSoc.lapSocEnd}`);

chk(r.evBench.tBHot > r.evBench.tB0 + 0.5, `EV bench pack did not heat: tB0=${r.evBench.tB0} -> tBHot=${r.evBench.tBHot}`);
chk(r.evBench.tqHot < r.evBench.tqCool * 0.5, `EV bench hot pack (58 C) did not derate torque: cool=${r.evBench.tqCool.toFixed(1)} hot=${r.evBench.tqHot.toFixed(1)}`);
chk(r.evBench.regenTq < -10 && r.evBench.regenI < -5 && r.evBench.socAfterRegen > r.evBench.socBeforeRegen,
  `EV bench negative regen torque failed: ${JSON.stringify(r.evBench)}`);

chk(r.hybBench.p2Start.fired && r.hybBench.p2Start.firedAt > 0 && r.hybBench.p2Start.Te > 0,
  `P2 hybrid full-throttle engine start deadlocked: ${JSON.stringify(r.hybBench.p2Start)}`);
chk(r.hybBench.tmHot < r.hybBench.tmCool * 0.5, `Hybrid bench did not thermally derate: cool=${r.hybBench.tmCool.toFixed(1)} hot=${r.hybBench.tmHot.toFixed(1)}`);

chk(r.hybThermal.lapBMax > 50 && r.hybThermal.lapMinShare < 1,
  `hybLapHeat did not heat & derate small hybrid pack under sustained high-C draw: ${JSON.stringify(r.hybThermal)}`);
chk(r.hybThermal.raceTbEnd > 50 && r.hybThermal.raceDerate < 1 && r.hybThermal.raceHyX < 1,
  `hybRaceHeatStep did not heat & derate hybrid pack in race: ${JSON.stringify(r.hybThermal)}`);

chk(r.refinements.imRrRatio > 1.55 && r.refinements.imRrRatio < 1.75 && r.refinements.imAlCageKg < r.refinements.imCuCageKg,
  `Aluminium IM cage physics wrong: ${JSON.stringify(r.refinements)}`);
chk(r.refinements.feRNd > r.refinements.feRFe, `NdFeB rotorIronLoss should exceed ferrite due to magnet eddy loss: Nd=${r.refinements.feRNd.toFixed(2)} Fe=${r.refinements.feRFe.toFixed(2)}`);
chk(Math.abs(r.refinements.etaPs - 0.97) < 1e-6 && r.refinements.etaP2 === 1,
  `Power-split boost converter efficiency wrong: ps=${r.refinements.etaPs} p2=${r.refinements.etaP2}`);

console.log('test271 EV/Hybrid parity:', JSON.stringify(r, null, 2));
if (errors.length) fails.push(...errors);
await browser.close();
if (fails.length) {
  console.error('FAILS:\n  - ' + fails.join('\n  - '));
  process.exit(1);
}
console.log('PASS test271');
