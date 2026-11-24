// WHY THIS EXISTS (build 442): EV & Hybrid NaN guards and race pack-overload free-energy fix. What must hold:
//   · PM zero-flux motor (evRotorD=80, evPoles=12, ferrite, evMagW=40) stays finite (Bg=0, wt>0, hy>0, T=0, finite score/op-points/losses);
//   · IM imSat floors at 0.15 so extreme electric loading keeps positive torque and finite imCurrents;
//   · IM zero-torque build (Imax <= ImR) keeps scoreMotor, motorOperatingPoint, and evRaceFFNow (pRef=0) finite;
//   · packDrawClamped prevents overload from dropping heat to 0 in evRaceHeatStep (no free recharge), evLapHeat, and evCycle;
//   · packBuild (kWh<=0, series<=0), hybMachineFrom (T2<=0 / amps cap), hybrid shareF/shareR (Pr+Pf<=0),
//     hybrid-views BSFC map (best.b=Infinity and high-torque Y-axis), and 918 Spyder merged unsure all hold;
//   · healthy EV and Hybrid presets stay finite with positive peak power and torque.
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

  // 1. PM zero-flux motor: small rotor + 12-pole Ferrite (bridge leakage > Am*Br)
  load(EV_ENGINE_PRESETS[0], {
    evMotorType: 'pm', evRotorD: 80, evStatorOD: 140, evStack: 80,
    evPoles: 12, evMagnet: 'ferrite', evMagW: 40, evFront: 'none'
  });
  const pm = engine.motor, pmS = engine.score;
  const pmL = motorLosses(pm, 0, 2000, motorRatedV(engine), { w: 60, c: 60, r: 60 });
  const pmOpP = motorOperatingPoint('power'), pmOpT = motorOperatingPoint('torque'), pmOpE = motorOperatingPoint('eco');
  out.pmZero = {
    Bg: pm.Bg, wt: pm.wt, hy: pm.hy, psi20: pm.psi20,
    peakHP: pmS.peakHP, peakTQ: pmS.peakTQ, overall: pmS.overall, rel: pmS.reliability,
    lossTot: pmL.total, opP: pmOpP.tq, opT: pmOpT.tq, opE: pmOpE.rpm,
    ffZero: evRaceFFNow({ tankKg: 50, ev: { pack: engine.pack, motor: pm, pRef: 0, kWh: engine.pack.kWh } },
      { evFF: 0, fuelKg: 25, evT: { w: 60, c: 60, r: 60, b: 30 }, evCut: false })
  };

  // 2. IM imSat floor + IM zero-torque (Imax <= ImR)
  const imHi = motorBuild({
    type: 'im', rotorD: 120, statorOD: 200, stackL: 120, poles: 4, turns: 60,
    retention: 'bridges', cooling: 'jacket', lamination: 'm270', wire: 'round', conductor: 'copper',
    inverter: 'sic', invAmps: 1500, maxRpm: 16000
  });
  const imSatVal = imSat(imHi, imHi.Imax);
  const imTqHi = imTorque(imHi, imHi.Imax);
  const imCurHi = imCurrents(imHi, imTqHi * 0.5, 2000, 400);
  load(EV_ENGINE_PRESETS[0], {
    evMotorType: 'im', evRotorD: 150, evStatorOD: 240, evStack: 130,
    evPoles: 4, evTurns: 10, evAmps: 20, evFront: 'none'
  });
  out.im = {
    imSatVal, imTqHi, imCurI: imCurHi.I,
    zeroPeakHP: engine.score.peakHP, zeroOverall: engine.score.overall,
    zeroOpP: motorOperatingPoint('power').tq
  };

  // 3. packDrawClamped & EV race/lap/cycle overload
  load(EV_ENGINE_PRESETS[0]);
  const pk = engine.pack;
  const pMax30 = packMaxPower(pk, 0.25, 30);
  const rawNull = packDraw(pk, 0.25, pMax30 * 1.5, 30);
  const clamped = packDrawClamped(pk, 0.25, pMax30 * 1.5, 30);
  // evRaceHeatStep overload: pack must heat up, and dE must not refund h0 (free energy)
  const M = { tankKg: pk.kWh * 0.85, ev: { pack: pk, motor: engine.motor, V: motorRatedV(engine), pRef: evRefPower(engine), kWh: pk.kWh, rl: engine.redline, k: 25 } };
  const h0Ref = 5000; // 5 kW ref cell heat
  const Pover = pMax30 * 1.5;
  const c = {
    fuelKg: M.tankKg * 0.25, fuelUsed: 0, v: 30,
    _fh: h0Ref / 3600, _fr: (Pover + h0Ref) / 3600, _tq: 150,
    evT: { w: 60, c: 60, r: 60, b: 30 }, evPeak: { w: 60, b: 30 }
  };
  const fuelBefore = c.fuelKg, tbBefore = c.evT.b;
  evRaceHeatStep(M, c, 1, 1.0, 1);
  // evLapHeat overload
  const prof = { dt: [1, 1, 1], rpm: [4000, 4000, 4000], tq: [1500, 1500, 1500] };
  const lapH = evLapHeat(engine, prof);
  // evCycle with tiny pack so WLTC overloads pack
  load(EV_ENGINE_PRESETS[0], { evKWh: 1.5, evSeries: 40 });
  const cyc = evCycle(engine, vehicle);
  out.overload = {
    rawNull, clampedHeat: clamped.heat, clampedI: clamped.I,
    tbDelta: c.evT.b - tbBefore, fuelDelta: c.fuelKg - fuelBefore,
    lapTbEnd: lapH.tB[lapH.tB.length - 1], cycWhkm: cyc.whkm
  };

  // 4. packBuild, hybMachineFrom, hybrid shareF/shareR, BSFC map, 918 Spyder unsure
  const badPack = packBuild({ chem: 'nca', series: 0, kWh: 0, year: 2020 });
  const mg1Zero = hybMachineFrom(pm, 100, 30000, 600);
  // Hybrid with zero-flux rear + front motors
  load(HYB_ENGINE_PRESETS.find(p => p.name.includes('918')), {
    evMotorType: 'pm', evRotorD: 80, evStatorOD: 140, evStack: 80, evPoles: 12, evMagnet: 'ferrite', evMagW: 40,
    evFront: 'pm', evFrontD: 80, evFrontOD: 140, evFrontStack: 80, evFrontPoles: 12
  });
  const hyZeroShares = { shareF: engine.hy.front.shareF, shareR: engine.hy.shareR };
  // BSFC map with best.b = Infinity and high-torque ICE
  const cInf = bsfcColour(NaN, Infinity);
  const cInf2 = bsfcColour(250, Infinity);
  // 918 Spyder preset unsure merged
  const p918 = HYB_ENGINE_PRESETS.find(p => p.name.includes('918'));
  out.guards = {
    packFinite: Number.isFinite(badPack.Vnom) && Number.isFinite(badPack.Ah) && Number.isFinite(badPack.R) && badPack.R > 0 && badPack.mass > 0,
    mg1Finite: Number.isFinite(mg1Zero.Imax) && Number.isFinite(mg1Zero.mass) && mg1Zero.Imax < 1e5,
    hyZeroShares,
    cInfOk: cInf[0] === 14 && cInf2[0] === 14,
    p918Unsure: p918.unsure
  };

  // 5. Healthy EV and Hybrid presets stay finite with positive peakHP/peakTQ
  const presetChecks = [];
  for (const pr of [...EV_ENGINE_PRESETS, ...HYB_ENGINE_PRESETS]) {
    load(pr);
    const s = engine.score;
    presetChecks.push({
      name: pr.name,
      ok: Number.isFinite(s.peakHP) && s.peakHP > 0 && Number.isFinite(s.peakTQ) && s.peakTQ > 0 && Number.isFinite(s.overall)
    });
  }
  out.presets = presetChecks;
  return out;
});

// Assertions
chk(r.pmZero.Bg === 0 && r.pmZero.wt > 0 && r.pmZero.hy > 0 && r.pmZero.psi20 === 0, 'PM zero-flux geometry/flux: ' + JSON.stringify(r.pmZero));
chk(r.pmZero.peakHP === 0 && r.pmZero.peakTQ === 0 && Number.isFinite(r.pmZero.overall) && Number.isFinite(r.pmZero.rel) && Number.isFinite(r.pmZero.lossTot), 'PM zero-flux score/losses: ' + JSON.stringify(r.pmZero));
chk(Number.isFinite(r.pmZero.opP) && Number.isFinite(r.pmZero.opT) && Number.isFinite(r.pmZero.opE) && Number.isFinite(r.pmZero.ffZero), 'PM zero-flux op/race: ' + JSON.stringify(r.pmZero));

chk(r.im.imSatVal >= 0.15 && r.im.imTqHi > 0 && Number.isFinite(r.im.imCurI), 'IM high-loading imSat/imCurrents: ' + JSON.stringify(r.im));
chk(r.im.zeroPeakHP === 0 && Number.isFinite(r.im.zeroOverall) && Number.isFinite(r.im.zeroOpP), 'IM zero-torque score/op: ' + JSON.stringify(r.im));

chk(r.overload.rawNull === null && r.overload.clampedHeat > 0 && r.overload.clampedI > 0, 'packDrawClamped overload: ' + JSON.stringify(r.overload));
chk(r.overload.tbDelta > 0 && r.overload.fuelDelta <= 0, 'evRaceHeatStep overload heats pack and does not add free energy: ' + JSON.stringify(r.overload));
chk(Number.isFinite(r.overload.lapTbEnd) && r.overload.lapTbEnd > 30, 'evLapHeat overload heats pack: ' + JSON.stringify(r.overload));
chk(Number.isFinite(r.overload.cycWhkm) && r.overload.cycWhkm > 0, 'evCycle overload finite whkm: ' + JSON.stringify(r.overload));

chk(r.guards.packFinite, 'packBuild zero kWh/series finite');
chk(r.guards.mg1Finite, 'hybMachineFrom zero-torque MG2 finite');
chk(r.guards.hyZeroShares.shareF === 0.5 && r.guards.hyZeroShares.shareR === 0.5, 'hybrid zero-torque shares: ' + JSON.stringify(r.guards.hyZeroShares));
chk(r.guards.cInfOk, 'bsfcColour Infinity guard');
chk(r.guards.p918Unsure.includes('silencer') && r.guards.p918Unsure.includes('stator'), '918 Spyder unsure merged: ' + JSON.stringify(r.guards.p918Unsure));

for (const p of r.presets) chk(p.ok, 'Healthy preset failed: ' + p.name);
for (const e of errors) fails.push(e);

console.log('test264:', fails.length ? 'FAIL' : 'PASS', `(${r.presets.length} presets checked)`);
if (fails.length) { fails.forEach(f => console.error('  -', f)); process.exit(1); }
await browser.close();
