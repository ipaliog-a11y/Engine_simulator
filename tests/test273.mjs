// WHY THIS EXISTS (build 450): EV & hybrid architecture expansion (pack cooling, cold ambient derating, inverter & MG1
// thermal nodes, 2-speed EV gearbox, pure-EV evFrontFd, evMaker selector, dual-rear TV, configurable power-split, MHEV/P3/P4,
// and P2 K0 clutch slip heat). What must hold:
//   · cold pack (< 0 C vs 25 C) derates via evPackGain & Arrhenius packR (no 25 C lower clamp);
//   · passive-air pack (0.35 W/K/kWh) heats faster than liquid plate (2.0 W/K/kWh) under identical load;
//   · inverter thermal node (temp.inv) rises under sustained load and derates IGBT above 105 C (SiC above 125 C);
//   · 2-speed EV gearbox ([1.93, 1.0]) boosts low-speed thrust and shifts in simulateAccelRun;
//   · evMaker is a visible <select>, evFrontFd is available on AWD pure EVs, and dual-rear EVs enable active rear TV;
//   · power-split tracks MG1 thermal node (H.mg1T) and honors configurable psRho/psK2/psBusV (0 = Prius default);
//   · MHEV 48V (no pure-EV drive), P3, and P4 (AWD) hybrid builds run cleanly, and P2 K0 clutch accumulates slip heat;
//   · stock EV and hybrid presets stay healthy and finite.
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

  // 1. Cold pack derating (< 0 C vs 25 C) and passive-air vs liquid pack heating
  load(EV_ENGINE_PRESETS[0], { evPackCool: 'liquid', evAmbT: 25 });
  const gain25 = evPackGain(engine, 6000, 25);
  const gainCold = evPackGain(engine, 6000, -10);
  const pkLiq = packBuild({ chem: 'nca', series: 96, kWh: 20, year: 2020, cooling: 'liquid', ambT: 25 });
  const pkAir = packBuild({ chem: 'nca', series: 96, kWh: 20, year: 2020, cooling: 'air_passive', ambT: 25 });
  const tLiq = { b: 35 }, tAir = { b: 35 };
  for (let i = 0; i < 1800; i++) { packHeatStep(pkLiq, tLiq, 4000, 1); packHeatStep(pkAir, tAir, 4000, 1); }
  load(EV_ENGINE_PRESETS[0], { evPackCool: 'liquid', evAmbT: -5 });
  const coldStartT = state.tB.b;
  out.pack = { gain25, gainCold, liqEnd: tLiq.b, airEnd: tAir.b, coldStartT };

  // 2. Inverter thermal node rises & derates IGBT (> 105 C) vs SiC (> 125 C)
  load(EV_ENGINE_PRESETS[0], { evInverter: 'igbt', evCooling: 'air', evAmps: 900 });
  const mIgbt = engine.motor, V0 = motorRatedV(engine);
  const tInv = { w: mIgbt.cool.tCool, c: mIgbt.cool.tCool, r: mIgbt.cool.tCool, inv: mIgbt.cool.tCool };
  const invStart = tInv.inv;
  for (let i = 0; i < 200; i++) {
    const L = motorLosses(mIgbt, motorMaxTorque(mIgbt, 3000, V0, tInv.r), 3000, V0, tInv);
    motorHeatStep(mIgbt, tInv, L, 0.5);
  }
  const derIgbt115 = motorDerate({ motor: mIgbt }, { w: 70, c: 70, r: 70, inv: 115 });
  load(EV_ENGINE_PRESETS[0], { evInverter: 'sic' });
  const derSic115 = motorDerate({ motor: engine.motor }, { w: 70, c: 70, r: 70, inv: 115 });
  const derSic135 = motorDerate({ motor: engine.motor }, { w: 70, c: 70, r: 70, inv: 135 });
  out.inv = { invStart, invHot: tInv.inv, derIgbt115, derSic115, derSic135 };

  // 3. 2-speed EV gearbox shifts & boosts low-speed thrust; evMaker selector, pure-EV evFrontFd, dual-rear TV
  load(EV_ENGINE_PRESETS[0], { evGearbox: '1spd' });
  const acc1 = simulateAccelRun();
  const r1Len = vehicle.ratios.length;
  const f1Low = evCurve(engine)[1].tq * vehicle.ratios[0] * vehicle.finalDrive;
  load(EV_ENGINE_PRESETS[0], { evGearbox: '2spd' });
  const acc2 = simulateAccelRun();
  const r2Len = vehicle.ratios.length;
  const f2Low = evCurve(engine)[1].tq * vehicle.ratios[0] * vehicle.finalDrive;

  const makerEl = document.getElementById('evMaker');
  const makerTag = makerEl ? makerEl.tagName : '';
  load(EV_ENGINE_PRESETS[1], { evFrontFd: 11.5 });
  const frontFdDisabled = document.getElementById('evFrontFd').disabled;
  const frontFdVal = vehicle.frontFd;
  const frontPartK = engine.motor.parts[1].k;

  load(EV_ENGINE_PRESETS[2]); // Model S Plaid (dual rear)
  const tvFlag = vehicle.dualRearTV;
  const tvRes = evRearTorqueVector(engine.motor, vehicle, 7.0, 25, 400);
  out.evArch = {
    r1Len, r2Len, f1Low, f2Low, shifts2: acc2.shifts.length, t100_1: acc1.t100, t100_2: acc2.t100,
    makerTag, frontFdDisabled, frontFdVal, frontPartK, tvFlag, tvMz: tvRes.Mz, tvActive: tvRes.active
  };

  // 4. Power-split MG1 thermal node & configurable psRho / psBusV
  const prius = HYB_ENGINE_PRESETS.find(p => p.engine.hyMode === 'ps');
  load(prius);
  const psDef = psParams(engine.hy);
  const Hps = hybBenchState();
  Hps.mode = 'sport'; Hps.n = 4000; state.throttle = 1; state.load = 0.5;
  const mg1W0 = Hps.mg1T.w;
  for (let i = 0; i < 600; i++) stepHybridBench(0.05);
  const mg1W1 = Hps.mg1T.w;
  load(prius, { psRho: 0.45, psK2: 3.0, psBusV: 650 });
  const psCustom = psParams(engine.hy);
  out.ps = { defRho: psDef.rho, defBusV: psDef.busV, cusRho: psCustom.rho, cusK2: psCustom.k2, cusBusV: psCustom.busV, mg1W0, mg1W1 };

  // 5. MHEV 48V (no pure-EV drive), P3, P4 (AWD) builds & P2 K0 clutch slip heat
  const baseIce = PRESETS[0].engine;
  applyEngineToForm(Object.assign({}, DEFAULT_ENGINE, baseIce, HYB_DEFAULT_MHEV, { hyMode: 'mhev' }));
  syncDesignEnable(); buildEngine();
  const Hm = hybBenchState();
  Hm.mode = 'ev'; state.throttle = 0.2;
  stepHybridBench(0.05);
  const mhevNoEv = engine.hy.noEv && Hm.engOn;
  const mhevAcc = simulateAccelRun();

  applyEngineToForm(Object.assign({}, DEFAULT_ENGINE, baseIce, HYB_DEFAULT_P4, { hyMode: 'p4' }));
  syncDesignEnable(); buildEngine();
  const p4Drive = vehicle.drive, p4FrontF = hybFrontF(15);
  const p4Acc = simulateAccelRun();

  applyEngineToForm(Object.assign({}, DEFAULT_ENGINE, baseIce, HYB_DEFAULT_P4, { hyMode: 'p3' }));
  syncDesignEnable(); buildEngine();
  const p3FrontF = hybFrontF(15);
  const p3Acc = simulateAccelRun();

  const p2Pr = HYB_ENGINE_PRESETS.find(p => p.engine.hyMode === 'p2');
  load(p2Pr);
  const Hp2 = hybBenchState();
  Hp2.mode = 'auto'; Hp2.engOn = true; Hp2.fired = false; Hp2.n = 2500; Hp2.k0Temp = 40; Hp2.k0SlipJ = 0;
  state.rpm = 0; state.throttle = 0.9; state.load = 0.5;
  for (let i = 0; i < 90; i++) stepHybridBench(1 / 60);
  out.hyb = {
    mhevNoEv, mhevT100: mhevAcc.t100,
    p4Drive, p4FrontF, p4T100: p4Acc.t100,
    p3FrontF, p3T100: p3Acc.t100,
    p2Fired: Hp2.fired, k0SlipJ: Hp2.k0SlipJ, k0Temp: Hp2.k0Temp
  };

  // 6. Stock EV & Hybrid presets remain healthy
  const presets = [];
  for (const pr of [...EV_ENGINE_PRESETS, ...HYB_ENGINE_PRESETS]) {
    load(pr);
    presets.push({ name: pr.name, hp: engine.score.peakHP, tq: engine.score.peakTQ });
  }
  out.presets = presets;
  return out;
});

chk(errors.length === 0, 'page errors: ' + errors.join('; '));
chk(r.pack.gainCold < r.pack.gain25 * 0.95 && r.pack.gainCold > 0.1, `cold pack derates: 25C=${r.pack.gain25.toFixed(3)} -10C=${r.pack.gainCold.toFixed(3)}`);
chk(r.pack.airEnd > r.pack.liqEnd + 5, `passive air heats faster than liquid: air=${r.pack.airEnd.toFixed(1)}C liq=${r.pack.liqEnd.toFixed(1)}C`);
chk(r.pack.coldStartT === -5, `packStartT honors evAmbT=-5: got ${r.pack.coldStartT}`);

chk(r.inv.invHot > r.inv.invStart + 20, `inverter node rises under load: ${r.inv.invStart.toFixed(1)} -> ${r.inv.invHot.toFixed(1)}C`);
chk(r.inv.derIgbt115 < 0.7 && r.inv.derIgbt115 > 0.2, `IGBT derates at 115C: ${r.inv.derIgbt115}`);
chk(r.inv.derSic115 === 1 && r.inv.derSic135 < 0.7, `SiC holds 115C (${r.inv.derSic115}) and derates 135C (${r.inv.derSic135})`);

chk(r.evArch.r1Len === 1 && r.evArch.r2Len === 2, `EV gearbox ratios: 1spd=${r.evArch.r1Len} 2spd=${r.evArch.r2Len}`);
chk(r.evArch.f2Low > r.evArch.f1Low * 1.5, `2-speed boosts low-speed thrust: 1spd=${r.evArch.f1Low.toFixed(0)} 2spd=${r.evArch.f2Low.toFixed(0)}`);
chk(r.evArch.shifts2 >= 1 && r.evArch.t100_2 > 0, `2-speed shifts in accel run: shifts=${r.evArch.shifts2} t100=${r.evArch.t100_2}`);
chk(r.evArch.makerTag === 'SELECT', `evMaker exposed as SELECT: got ${r.evArch.makerTag}`);
chk(!r.evArch.frontFdDisabled && Math.abs(r.evArch.frontFdVal - 11.5) < 0.05 && r.evArch.frontPartK > 1.1,
  `AWD EV evFrontFd works: disabled=${r.evArch.frontFdDisabled} fd=${r.evArch.frontFdVal} k=${r.evArch.frontPartK}`);
chk(r.evArch.tvFlag && r.evArch.tvActive && r.evArch.tvMz > 100, `dual-rear active TV: flag=${r.evArch.tvFlag} Mz=${r.evArch.tvMz}`);

chk(Math.abs(r.ps.defRho - 30 / 78) < 1e-6 && r.ps.defBusV === 600, `default PS matches Prius: rho=${r.ps.defRho} busV=${r.ps.defBusV}`);
chk(Math.abs(r.ps.cusRho - 0.45) < 1e-6 && r.ps.cusK2 === 3.0 && r.ps.cusBusV === 650, `custom PS params applied: ${JSON.stringify(r.ps)}`);
chk(r.ps.mg1W1 > r.ps.mg1W0 + 1, `MG1 thermal node rises under load: ${r.ps.mg1W0.toFixed(1)} -> ${r.ps.mg1W1.toFixed(1)}C`);

chk(r.hyb.mhevNoEv && r.hyb.mhevT100 > 0, `MHEV 48V runs without pure-EV: noEv=${r.hyb.mhevNoEv} t100=${r.hyb.mhevT100}`);
chk(r.hyb.p4Drive === 'awd' && r.hyb.p4FrontF > 500 && r.hyb.p4T100 > 0, `P4 hybrid AWD & thrust: drive=${r.hyb.p4Drive} F=${r.hyb.p4FrontF} t100=${r.hyb.p4T100}`);
chk(r.hyb.p3FrontF > 500 && r.hyb.p3T100 > 0, `P3 hybrid road-motor thrust: F=${r.hyb.p3FrontF} t100=${r.hyb.p3T100}`);
chk(r.hyb.p2Fired && r.hyb.k0SlipJ > 50 && r.hyb.k0Temp > 40, `P2 K0 clutch slip heat: fired=${r.hyb.p2Fired} J=${r.hyb.k0SlipJ.toFixed(0)} T=${r.hyb.k0Temp.toFixed(2)}C`);

for (const p of r.presets) chk(Number.isFinite(p.hp) && p.hp > 50 && Number.isFinite(p.tq) && p.tq > 50, `preset ${p.name} healthy: ${p.hp} hp / ${p.tq} Nm`);

console.log('test273 summary:', JSON.stringify({
  coldGain: +r.pack.gainCold.toFixed(3), airVsLiq: [Math.round(r.pack.airEnd), Math.round(r.pack.liqEnd)],
  invHot: Math.round(r.inv.invHot), shifts2: r.evArch.shifts2, tvMz: Math.round(r.evArch.tvMz),
  mg1W: [Math.round(r.ps.mg1W0), Math.round(r.ps.mg1W1)], k0SlipJ: Math.round(r.hyb.k0SlipJ)
}));
await browser.close();
if (fails.length) { console.error('FAILS:\n  ' + fails.join('\n  ')); process.exit(1); }
console.log('PASS test273');
