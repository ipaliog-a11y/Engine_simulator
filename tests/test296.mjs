// WHY THIS EXISTS: regression guard for the two-way connection between the
// SPRINGS, BARS & DAMPERS parts designer and the SUSPENSION CALCULATOR window.
// What must hold:
//   · #psCalc opens #susWin with the unsaved designer draft's motion ratio, spring rate,
//     bound damping, and rebound damping for both FRONT and REAR corners;
//   · #susReset ("FROM THE CAR") clears the designer draft and reloads from the car;
//   · #susApply ("TO DESIGNER") converts the calculator's k, mr, cb, cr into coil geometry,
//     motion ratio, and damper settings for the active axle, leaving the other axle and
//     anti-roll bar intact, and refreshes the designer preview;
//   · Opening #susWin from #btnSusp on the VEHICLE tab and clicking #susApply switches
//     to PARTS -> SPRINGS, BARS & DAMPERS and applies the corner without page errors.
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
  const mx5 = FACTORY_CARS.find(c => c.name.includes('MX-5'));
  loadVehiclePreset(mx5);

  // 1. Designer -> Calculator: unsaved draft values flow into #susWin
  setTab('parts');
  partsUI.kind = 'susp';
  renderParts();
  document.getElementById('ps_mrF').value = '0.75';
  document.getElementById('ps_dampF').value = '1800';
  document.getElementById('ps_rbF').value = '2.5';
  document.getElementById('ps_barDF_mm').value = '24';
  document.getElementById('ps_mrR').value = '0.82';
  document.getElementById('ps_dampR').value = '1400';
  document.getElementById('ps_rbR').value = '2.0';
  const expectedKsF = +(springRate(+document.getElementById('ps_wireDF_mm').value, +document.getElementById('ps_coilDF_mm').value, +document.getElementById('ps_coilsF').value) / 1000).toFixed(1);
  document.getElementById('psCalc').click();
  out.openFromDesigner = !document.getElementById('susWin').hidden && sc.open;
  out.frontDraft = { mr: sc.p.mr, cb: sc.p.cb, cr: sc.p.cr, k: +sc.p.k.toFixed(1), expectedKsF };
  document.querySelector('#susCorner button[data-ax="R"]').click();
  out.rearDraft = { mr: sc.p.mr, cb: sc.p.cb, cr: sc.p.cr };

  // 2. FROM THE CAR clears draft
  document.getElementById('susReset').click();
  out.resetClearsPart = sc.part === null && sc.p.mr === 1;

  // 3. Calculator -> Designer: TO DESIGNER updates active axle, preserves bar and other axle
  document.querySelector('#susCorner button[data-ax="F"]').click();
  document.getElementById('sc_k').value = '60';
  document.getElementById('sc_mr').value = '0.80';
  document.getElementById('sc_cb').value = '2200';
  document.getElementById('sc_cr').value = '4840';
  document.getElementById('sc_k').dispatchEvent(new Event('input', { bubbles: true }));
  document.getElementById('susApply').click();
  const p = partFromEditor('susp');
  const wheelRateNmm = p.mrF * p.mrF * springRate(p.wireDF_mm, p.coilDF_mm, p.coilsF) / 1000;
  out.applied = {
    winClosed: document.getElementById('susWin').hidden && !sc.open,
    wheelRateNmm,
    expectedWheelRateNmm: 60 * 0.8 * 0.8,
    mrF: p.mrF,
    dampF: p.dampF,
    rbF: p.rbF,
    barDF: p.barDF_mm,
    mrR: p.mrR,
    dampR: p.dampR,
  };

  // 4. Open from VEHICLE tab -> TO DESIGNER switches to PARTS tab
  setTab('vehicle');
  document.getElementById('btnSusp').click();
  document.querySelector('#susCorner button[data-ax="R"]').click();
  document.getElementById('sc_k').value = '50';
  document.getElementById('sc_mr').value = '0.90';
  document.getElementById('sc_cb').value = '1600';
  document.getElementById('sc_cr').value = '3200';
  document.getElementById('sc_k').dispatchEvent(new Event('input', { bubbles: true }));
  document.getElementById('susApply').click();
  out.fromVehicle = {
    tab: vizMode,
    kind: partsUI.kind,
    mrR: +document.getElementById('ps_mrR').value,
    dampR: +document.getElementById('ps_dampR').value,
    rbR: +document.getElementById('ps_rbR').value,
  };
  return out;
});

chk(r.openFromDesigner, 'psCalc opens #susWin');
chk(Math.abs(r.frontDraft.mr - 0.75) < 1e-6, 'front draft mr: ' + r.frontDraft.mr);
chk(Math.abs(r.frontDraft.cb - 1800) < 1e-6, 'front draft cb: ' + r.frontDraft.cb);
chk(Math.abs(r.frontDraft.cr - 4500) < 1e-6, 'front draft cr: ' + r.frontDraft.cr);
chk(Math.abs(r.frontDraft.k - r.frontDraft.expectedKsF) < 0.2, 'front draft k: ' + r.frontDraft.k + ' vs ' + r.frontDraft.expectedKsF);
chk(Math.abs(r.rearDraft.mr - 0.82) < 1e-6 && Math.abs(r.rearDraft.cb - 1400) < 1e-6 && Math.abs(r.rearDraft.cr - 2800) < 1e-6, 'rear draft: ' + JSON.stringify(r.rearDraft));
chk(r.resetClearsPart, 'susReset clears sc.part and resets mr to 1');
chk(r.applied.winClosed, 'susApply closes #susWin');
chk(Math.abs(r.applied.wheelRateNmm - r.applied.expectedWheelRateNmm) < 0.2, 'applied wheel rate: ' + r.applied.wheelRateNmm + ' vs ' + r.applied.expectedWheelRateNmm);
chk(Math.abs(r.applied.mrF - 0.8) < 1e-6 && Math.abs(r.applied.dampF - 2200) < 1e-6 && Math.abs(r.applied.rbF - 2.2) < 1e-6, 'applied F damper/mr: ' + JSON.stringify(r.applied));
chk(Math.abs(r.applied.barDF - 24) < 1e-6 && Math.abs(r.applied.mrR - 0.82) < 1e-6 && Math.abs(r.applied.dampR - 1400) < 1e-6, 'preserved bar and R axle: ' + JSON.stringify(r.applied));
chk(r.fromVehicle.tab === 'parts' && r.fromVehicle.kind === 'susp', 'susApply from vehicle switches to parts/susp');
chk(Math.abs(r.fromVehicle.mrR - 0.9) < 1e-6 && Math.abs(r.fromVehicle.dampR - 1600) < 1e-6 && Math.abs(r.fromVehicle.rbR - 2.0) < 1e-6, 'applied R from vehicle: ' + JSON.stringify(r.fromVehicle));
for (const e of errors) fails.push(e);

await browser.close();
console.log(fails.length ? 'FAIL:\n  ' + fails.join('\n  ') : 'PASS: suspension designer <-> calculator two-way link');
process.exit(fails.length ? 1 : 0);
