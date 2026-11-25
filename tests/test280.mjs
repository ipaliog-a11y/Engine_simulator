// WHY THIS EXISTS (B17): regression coverage for EV & Hybrid bench telemetry, Garage detail drawer, and EV Designer parity:
//   · an induction motor EV build shows "IM MOTOR" in #subtitle and "IM " in motorCaption (never "PM");
//   · EV LIVE bench renders pack °C (both PACK TEMP bar on canvas and #readout) and thermal warning when pack >= 50 °C;
//   · Ferrite magnet temperature bar scales dynamically >= 250 °C (not clipped at 200 °C);
//   · EV dyno KNEE marker is not drawn off-chart when s.knee > engine.redline;
//   · Hybrid LIVE bench displays live motor temperatures & thermal derate warnings in #hyTemp, colors SOC warnings from hybTune().socLo/socHi (e.g. PHEV 330e), renders P2 clutch CRANKING/OPEN/CLOSED accurately, and shows FRONT EV in flow & telemetry for AWD hybrids (918 Spyder);
//   · saved EV in Garage detail drawer (garageDetail) displays EV motor type, kW, pack kWh, V, and drive layout with no petrol bore/stroke/octane fallback;
//   · EV Designer computes evdComputeSlow (hold/cont) for hybrids and includes evFrontOD in evdFrontOnly.
import { chromium } from './pw.mjs';
import { fileURLToPath, pathToFileURL } from 'url';
import path from 'path';

const repo = fileURLToPath(new URL('..', import.meta.url));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
await page.goto(pathToFileURL(path.join(repo, 'index.html')).href, { waitUntil: 'networkidle' });

const r = await page.evaluate(() => {
  const fails = [];
  const out = {};

  // Helper to spy on canvas fillText calls during a single draw
  const spyText = (fn) => {
    const texts = [];
    const orig = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function (t, x, y, ...rest) {
      texts.push({ t: String(t), x, y });
      return orig.call(this, t, x, y, ...rest);
    };
    try { fn(); } finally { CanvasRenderingContext2D.prototype.fillText = orig; }
    return texts;
  };

  // 1. Induction motor EV build: IM labels, pack temp on bench, Ferrite bar >= 250 C, dyno KNEE clamp
  applyEngineToForm(Object.assign({}, DEFAULT_ENGINE, EV_DEFAULT, {
    type: 'electric', evMotorType: 'im', evRotorD: 150, evStack: 134, evKWh: 75
  }));
  buildEngine();
  const subIM = document.getElementById('subtitle').textContent;
  const capIM = motorCaption(engine);
  out.im = { subIM, capIM };
  if (!/IM MOTOR/.test(subIM) || /PM MOTOR/.test(subIM)) fails.push('IM subtitle wrong: ' + subIM);
  if (!capIM.startsWith('IM ')) fails.push('IM motorCaption wrong: ' + capIM);

  // EV bench pack °C + thermal warning
  vizMode = 'engine';
  state.tB = { b: 54 };
  updateMotorUI();
  const evReadout = document.getElementById('readout').textContent;
  const benchTexts = spyText(() => drawMotorView(0));
  const hasPackTempBar = benchTexts.some(q => /PACK TEMP/i.test(q.t) && /HOT/i.test(q.t));
  const hasPackReadout = /PACK\s+54°C/.test(evReadout);
  out.evPack = { evReadout, hasPackTempBar, hasPackReadout };
  if (!hasPackTempBar) fails.push('EV bench missing PACK TEMP (HOT) bar at 54 C');
  if (!hasPackReadout) fails.push('EV #readout missing PACK 54°C: ' + evReadout);

  // Ferrite magnet bar scaling >= 250 C
  applyEngineToForm(Object.assign({}, DEFAULT_ENGINE, EV_DEFAULT, {
    type: 'electric', evMotorType: 'pm', evMagnet: 'ferrite'
  }));
  buildEngine();
  const ferriteMax = rotorTempBarMax(engine.motor);
  out.ferriteMax = ferriteMax;
  if (!(ferriteMax >= 250 && engine.motor.mag.Tmax === 250)) {
    fails.push(`Ferrite bar max expected >= 250 (Tmax=250), got max=${ferriteMax}, Tmax=${engine.motor.mag.Tmax}`);
  }

  // EV dyno KNEE clamp when s.knee > rMax
  const origKnee = engine.score.knee;
  engine.score.knee = engine.redline + 4000;
  const dynoTexts = spyText(() => drawMotorDyno());
  engine.score.knee = origKnee;
  const offChartKnee = dynoTexts.filter(q => /KNEE/.test(q.t) && q.x > 55 + 530);
  out.offChartKnee = offChartKnee.length;
  if (offChartKnee.length > 0) fails.push('EV dyno drew KNEE off-chart when s.knee > rMax: ' + JSON.stringify(offChartKnee));

  // 2. Saved EV in Garage detail drawer
  const evSave = {
    id: 'test_ev_1', kind: 'car', name: 'Test IM EV', date: '2026-11-25',
    stats: { hp: 300, tq: 420, hpRpm: 6000, tqRpm: 1000 },
    build: {
      engine: Object.assign({}, DEFAULT_ENGINE, EV_DEFAULT, {
        type: 'electric', evMotorType: 'im', evRotorD: 160, evStack: 140, evPoles: 4,
        evChem: 'nca', evSeries: 96, evKWh: 82, evFront: 'pm', evGearbox: '2spd'
      }),
      vehicle: Object.assign({}, DEFAULT_VEHICLE, { drive: 'awd' })
    }
  };
  const gHtml = garageDetail(evSave);
  out.garageEV = gHtml;
  if (!/INDUCTION MOTOR/.test(gHtml)) fails.push('Garage EV detail missing motor type');
  if (!/kW/.test(gHtml) || !/82 kWh/.test(gHtml) || !/\d+\s*V/.test(gHtml) || !/AWD/.test(gHtml)) {
    fails.push('Garage EV detail missing kW/kWh/V/drive: ' + gHtml);
  }
  if (/Bore|RON|4-stroke|petrol/i.test(gHtml)) {
    fails.push('Garage EV detail leaked petrol fields: ' + gHtml);
  }

  // 3. Hybrid LIVE bench: 330e PHEV SOC bounds, motor temps + thermal warning, P2 CRANKING/OPEN/CLOSED
  const p330 = FACTORY_CARS.find(c => /330e/.test(c.name));
  loadVehiclePreset(p330);
  vizMode = 'engine';
  const H = hybBenchState();
  const tu = hybTune(engine);
  H.soc = 0.25; // between 330e socLo (~12%) and old hardcoded 35%
  H.mT = { w: 162, c: 110, r: 95, inv: 80 };
  updateHybridPanel();
  const socFill25 = document.getElementById('hySocFill').style.background;
  const hyTempText = document.getElementById('hyTemp').textContent;
  H.soc = 0.90; // between old hardcoded 85% and 330e socHi (~95%)
  updateHybridPanel();
  const socFill90 = document.getElementById('hySocFill').style.background;
  out.hyb330e = { socLo: tu.socLo, socHi: tu.socHi, socFill25, socFill90, hyTempText };
  if (tu.socLo < 25 && !/0,\s*255,\s*136|#00ff88/i.test(socFill25)) {
    fails.push(`330e SOC 25% (socLo=${tu.socLo}) should be green, got ${socFill25}`);
  }
  if (tu.socHi > 90 && !/0,\s*255,\s*136|#00ff88/i.test(socFill90)) {
    fails.push(`330e SOC 90% (socHi=${tu.socHi}) should be green, got ${socFill90}`);
  }
  if (!/162°C/.test(hyTempText) || !/110°C/.test(hyTempText) || !/95°C/.test(hyTempText) || !/THERMAL DERATE/.test(hyTempText)) {
    fails.push('Hybrid #hyTemp missing temps or thermal warning: ' + hyTempText);
  }

  // P2 clutch states: CRANKING vs OPEN vs CLOSED
  H.engOn = true; H.fired = false; H.ne = 0;
  const tCrank = spyText(() => drawHybridFlow(H)).map(q => q.t);
  H.engOn = false; H.fired = false;
  const tOpen = spyText(() => drawHybridFlow(H)).map(q => q.t);
  H.engOn = true; H.fired = true; H.ne = 1200;
  const tClosed = spyText(() => drawHybridFlow(H)).map(q => q.t);
  out.clutch = { crank: tCrank.includes('CRANKING'), open: tOpen.includes('OPEN'), closed: tClosed.includes('CLOSED') };
  if (!tCrank.includes('CRANKING') || tCrank.includes('CLOSED')) fails.push('P2 cranking should draw CRANKING, not CLOSED: ' + tCrank.join(','));
  if (!tOpen.includes('OPEN')) fails.push('P2 off should draw OPEN');
  if (!tClosed.includes('CLOSED')) fails.push('P2 fired should draw CLOSED');

  // 4. AWD Hybrid (918 Spyder): FRONT EV in flow & telemetry, plus EV Designer hybrid slow preview & evFrontOD
  const p918 = FACTORY_CARS.find(c => /918/.test(c.name));
  loadVehiclePreset(p918);
  vizMode = 'engine';
  const H918 = hybBenchState();
  updateHybridPanel();
  const hy918Readout = document.getElementById('hyReadout').textContent;
  const flow918 = spyText(() => drawHybridFlow(H918)).map(q => q.t);
  out.hyb918 = { hy918Readout, hasFrontFlow: flow918.includes('FRONT EV') };
  if (!/FRONT EV/.test(hy918Readout)) fails.push('918 #hyReadout missing FRONT EV: ' + hy918Readout);
  if (!flow918.includes('FRONT EV')) fails.push('918 drawHybridFlow missing FRONT EV box');

  // EV Designer: hybrid evdComputeSlow and evFrontOD in evdFrontOnly
  const evdRes = evdCompute();
  const evdSlow = evdComputeSlow(evdRes);
  const fOdNone = evdFrontOnly('evFrontOD', { e: { evFront: 'none' } });
  const fOdPm = evdFrontOnly('evFrontOD', { e: { evFront: 'pm' } });
  out.evd = { hybrid: evdRes && evdRes.hybrid, slow: evdSlow, fOdNone, fOdPm };
  if (!evdSlow || !(evdSlow.cont > 0) || !(evdSlow.hold > 0)) {
    fails.push('evdComputeSlow failed for hybrid motor: ' + JSON.stringify(evdSlow));
  }
  if (fOdNone !== false || fOdPm !== true) {
    fails.push(`evdFrontOnly(evFrontOD) expected false/true, got ${fOdNone}/${fOdPm}`);
  }

  return { fails, out };
});

await browser.close();
console.log('B17 EV & Hybrid UI parity check:', JSON.stringify(r.out, null, 2));
const allFails = [...errors, ...r.fails];
if (allFails.length) {
  console.error('FAILS:\n  ' + allFails.join('\n  '));
  process.exit(1);
}
console.log('PASS');
