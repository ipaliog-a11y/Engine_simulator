// WHY THIS EXISTS (E5): Electric turbo / MGU-H on the turbo shaft.
// What must hold:
//   · Default-off (eTurbo === 'none'): disabled on NA engines, enabled on turbo engines, eGenW === 0,
//     dyno torque curve, mass and cost unchanged;
//   · Spool assist (motoring): off-boost / below boost target under throttle, E-Turbo (48 V) and MGU-H (HV)
//     spin up the turbo shaft faster (higher boost after 0.3 s from rest) while drawing electrical power (eGenW < 0);
//   · Exhaust recovery (generating): at full load once on boost, E-Turbo / MGU-H recover surplus turbine power
//     (eGenW > 0, within rated power * eta) without dropping boost below target, and feed the hybrid pack;
//   · Fitted E-Turbo / MGU-H adds derived mass and cost; no page errors.
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

const r = await page.evaluate(() => {
  const load = (name, over) => {
    const pr = PRESETS.find(x => x.name === name);
    applyEngineToForm(Object.assign({}, DEFAULT_ENGINE, pr.engine, over || {}));
    syncDesignEnable();
    buildEngine();
  };
  const out = {};

  // 1. Default-off & UI enable state
  load('1.6 Sport NA I4');
  out.naDisabled = document.getElementById('edETurbo').disabled;
  out.defaultVal = DEFAULT_ENGINE.eTurbo;

  const baseSpec = { turboSize: 'large', boost_bar: 1.4 };
  load('2.0 Turbo Hot-Hatch I4', baseSpec);
  out.turboDisabled = document.getElementById('edETurbo').disabled;
  const massNone = engineMass(), costNone = computeCost();
  const dynoNone = buildTorqueCurve().map(p => p.tq);
  let sE = 0, b = 0, genOff = 0;
  for (let i = 0; i < 15; i++) {
    const a = advanceShaft(sE, 3000, b, 1.0, 0.02);
    sE = a.shaftE; b = a.boost; genOff = a.eGenW;
  }
  const boostNone03 = b;
  out.none = { massNone, costNone, boostNone03, genOff };

  // 2. E-Turbo (48 V) spool assist & full-load recovery
  load('2.0 Turbo Hot-Hatch I4', Object.assign({}, baseSpec, { eTurbo: 'e48' }));
  const massE48 = engineMass(), costE48 = computeCost();
  const dynoE48 = buildTorqueCurve().map(p => p.tq);
  sE = 0; b = 0; let genE48Spool = 0;
  for (let i = 0; i < 15; i++) {
    const a = advanceShaft(sE, 3000, b, 1.0, 0.02);
    sE = a.shaftE; b = a.boost; genE48Spool = a.eGenW;
  }
  const boostE4803 = b;
  let bHi = boostAvail(6000), sEHi = 0.5 * engine.shaftJ * Math.pow(0.8 * engine.shaftMax * 2 * Math.PI / 60, 2), genE48Full = 0;
  for (let i = 0; i < 20; i++) {
    const a = advanceShaft(sEHi, 6000, bHi, 1.0, 0.02);
    sEHi = a.shaftE; bHi = a.boost; genE48Full = a.eGenW;
  }
  out.e48 = {
    massDelta: massE48 - massNone,
    costDelta: costE48 - costNone,
    dynoMatch: dynoE48.every((t, i) => Math.abs(t - dynoNone[i]) < 1e-9),
    boostE4803,
    genE48Spool,
    genE48Full,
    boostHeld: bHi >= boostTarget(6000) - 0.02
  };

  // 3. MGU-H (HV) spool assist & full-load recovery
  load('2.0 Turbo Hot-Hatch I4', Object.assign({}, baseSpec, { eTurbo: 'mguh' }));
  const massMguh = engineMass(), costMguh = computeCost();
  sE = 0; b = 0; let genMguhSpool = 0;
  for (let i = 0; i < 15; i++) {
    const a = advanceShaft(sE, 3000, b, 1.0, 0.02);
    sE = a.shaftE; b = a.boost; genMguhSpool = a.eGenW;
  }
  const boostMguh03 = b;
  bHi = boostAvail(6000); sEHi = 0.5 * engine.shaftJ * Math.pow(0.8 * engine.shaftMax * 2 * Math.PI / 60, 2);
  let genMguhFull = 0;
  for (let i = 0; i < 20; i++) {
    const a = advanceShaft(sEHi, 6000, bHi, 1.0, 0.02);
    sEHi = a.shaftE; bHi = a.boost; genMguhFull = a.eGenW;
  }
  out.mguh = {
    massDelta: massMguh - massNone,
    costDelta: costMguh - costNone,
    boostMguh03,
    genMguhSpool,
    genMguhFull,
    boostHeld: bHi >= boostTarget(6000) - 0.02
  };

  // 4. Hybrid bench integration: MGU-H recovery feeds the hybrid pack SOC at full load
  const runHyb = (eTurbo) => {
    load('2.0 Turbo Hot-Hatch I4', Object.assign({}, baseSpec, { eTurbo, hyMode: 'p2' }));
    hybBench = null;
    state.throttle = 1.0; state.load = 0.5;
    const H = hybBenchState();
    H.mode = 'manual'; H.cmd = 0; H.thrE = 1.0; H.soc = 0.6; H.n = 6000; state.rpm = 6000;
    state.boostActual = boostAvail(6000);
    state.shaftE = 0.5 * engine.shaftJ * Math.pow(0.8 * engine.shaftMax * 2 * Math.PI / 60, 2);
    for (let i = 0; i < 40; i++) stepHybridBench(0.05);
    return H.soc;
  };
  out.hybSocNone = runHyb('none');
  out.hybSocMguh = runHyb('mguh');

  return out;
});

const chk = (ok, msg) => { if (!ok) fails.push(msg); };
chk(r.defaultVal === 'none', 'DEFAULT_ENGINE.eTurbo === none');
chk(r.naDisabled === true, 'edETurbo disabled on NA engine');
chk(r.turboDisabled === false, 'edETurbo enabled on turbo engine');
chk(r.none.genOff === 0, 'eGenW === 0 when eTurbo is none');

chk(r.e48.dynoMatch, 'steady dyno curve unchanged with eTurbo');
chk(r.e48.massDelta > 0 && r.e48.costDelta > 0, 'e48 adds mass and cost');
chk(r.e48.boostE4803 > r.none.boostNone03, `e48 spools faster (${r.e48.boostE4803.toFixed(3)} > ${r.none.boostNone03.toFixed(3)})`);
chk(r.e48.genE48Spool < 0 && r.e48.genE48Spool >= -6000 / 0.88 - 1, `e48 draws electrical power on spool (${r.e48.genE48Spool.toFixed(0)} W)`);
chk(r.e48.genE48Full > 0 && r.e48.genE48Full <= 6000 * 0.88 + 1, `e48 recovers electrical power at full load (${r.e48.genE48Full.toFixed(0)} W)`);
chk(r.e48.boostHeld, 'e48 holds target boost while recovering');

chk(r.mguh.massDelta > r.e48.massDelta && r.mguh.costDelta > r.e48.costDelta, 'mguh adds more mass and cost than e48');
chk(r.mguh.boostMguh03 > r.e48.boostE4803, `mguh spools faster than e48 (${r.mguh.boostMguh03.toFixed(3)} > ${r.e48.boostE4803.toFixed(3)})`);
chk(r.mguh.genMguhSpool < 0, `mguh draws electrical power on spool (${r.mguh.genMguhSpool.toFixed(0)} W)`);
chk(r.mguh.genMguhFull > r.e48.genE48Full && r.mguh.genMguhFull <= 90000 * 0.92 + 1, `mguh recovers more power than e48 (${r.mguh.genMguhFull.toFixed(0)} W)`);
chk(r.mguh.boostHeld, 'mguh holds target boost while recovering');
chk(r.hybSocMguh > r.hybSocNone, `MGU-H charges hybrid pack faster (${r.hybSocMguh.toFixed(4)} > ${r.hybSocNone.toFixed(4)})`);

for (const e of errors) fails.push(e);
await browser.close();
if (fails.length) {
  console.error('FAIL:\n  ' + fails.join('\n  '));
  process.exit(1);
}
console.log('PASS test292 (E5 Electric turbo / MGU-H):', JSON.stringify({
  spool03s: { none: +r.none.boostNone03.toFixed(3), e48: +r.e48.boostE4803.toFixed(3), mguh: +r.mguh.boostMguh03.toFixed(3) },
  recW: { e48: Math.round(r.e48.genE48Full), mguh: Math.round(r.mguh.genMguhFull) },
  hybSoc: { none: +r.hybSocNone.toFixed(4), mguh: +r.hybSocMguh.toFixed(4) }
}));
