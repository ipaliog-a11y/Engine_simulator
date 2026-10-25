// The GEAR RATIOS window (build 170).
//
// WHY THIS EXISTS. Build 169 gave the car a gear spacing, its own published box and hand-set ratios, but the only way to
// see or set a ratio was the spacing dropdown. The window shows each ratio with a slider, the final drive, and two
// graphs of what they do. What must hold:
//   · it opens from the vehicle tab and closes on its button, on Escape and on the backdrop;
//   · a spacing button is the car's spacing; a moved gear makes the box CUSTOM and stays between its neighbours;
//   · a hand-set final drive is the car's, the GEARING slider is off while it is set, and AUTO gives it back;
//   · what it shows is the model's: the read-out is the 0-100 run's and the top speed's, the rpm graph's path is the
//     run's own launch and shift points (each drop the next gear's ratio over this one's), and the force graph's
//     gears are T(N)·i·i_f·η/r, none ever above the ideal P·η/v;
//   · RESET gives back the stock box; every preset opens it without an error; it fits a phone; it speaks Greek.
import { chromium } from './pw.mjs';
import { fileURLToPath, pathToFileURL } from 'url';
import path from 'path';
const repo = fileURLToPath(new URL('..', import.meta.url));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1300, height: 950 } });
const errors = [];
page.on('console', m => { if (m.type() === 'error' && !/ERR_FILE_NOT_FOUND/.test(m.text())) errors.push('console: ' + m.text()); });
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
await page.goto(pathToFileURL(path.join(repo, 'index.html')).href, { waitUntil: 'networkidle' });
await page.waitForTimeout(400);
const fails = [];
const open = () => page.evaluate(() => !document.getElementById('gearWin').hidden && gw.open);

// 1. open and close
await page.evaluate(() => { loadVehiclePreset(VEHICLE_PRESETS.find(p => p.name.includes('M3 (E46'))); setTab('vehicle'); });
await page.click('#btnGearRatios'); await page.waitForTimeout(300);
const o1 = await open();
await page.keyboard.press('Escape'); await page.waitForTimeout(100);
const o2 = await open();
await page.click('#btnGearRatios'); await page.waitForTimeout(300);
await page.mouse.click(5, 5); await page.waitForTimeout(100);
const o3 = await open();
await page.click('#btnGearRatios'); await page.waitForTimeout(300);
await page.click('#gwClose'); await page.waitForTimeout(100);
const o4 = await open();
console.log(`== open / close: opens ${o1}; Escape closes ${!o2}; the backdrop ${!o3}; its button ${!o4} ==`);
if (!o1 || o2 || o3 || o4) fails.push('the window does not open and close as it should');

// 2. what it shows is the model's
await page.click('#btnGearRatios'); await page.waitForTimeout(800);
const shown = await page.evaluate(() => {
  const P = perf, n = vehicle.ratios.length, sh = P.shifts, pts = gw.path, rl = engine.redline;
  // the path: launch, then for each shift its speed and revs either side
  const pathShifts = []; for (let k = 2; k + 1 < pts.length; k += 2) pathShifts.push([pts[k][0], pts[k][1], pts[k + 1][1]]);
  const drops = sh.map(x => ({ g: x.g, ratio: x.rpmTo / x.rpm, want: vehicle.ratios[x.g + 1] / vehicle.ratios[x.g], rpm: x.rpm }));
  const L = gw.layoutForce, curve = buildTorqueCurve();
  const tq = rpm => { for (let k = 1; k < curve.length; k++) if (rpm <= curve[k].rpm) { const a = curve[k - 1], b = curve[k]; return a.tq + (b.tq - a.tq) * (rpm - a.rpm) / (b.rpm - a.rpm); } return curve[curve.length - 1].tq; };
  let worstF = 0, overIdeal = 0;
  for (let i = 0; i < n; i++) for (let vk = 5; vk <= 300; vk += 5) {
    const vms = vk / 3.6, f = L.Fgear(i, vms); if (f == null) continue;
    const rpm = vms * vehicle.ratios[i] * vehicle.finalDrive / vehicle.rTire * 60 / (2 * Math.PI);
    const mine = tq(rpm) * vehicle.ratios[i] * vehicle.finalDrive * vehicle.driveEff / vehicle.rTire;
    worstF = Math.max(worstF, Math.abs(f / mine - 1));
    if (f > L.Pmax * L.eff / vms * (1 + 1e-9)) overIdeal++;
  }
  return { read: document.getElementById('gwRead').textContent, t100: P.t100, top: P.topSpeed, launch: P.launchRpm, pts0: pts[0], pts1: pts[1],
    pathShifts, runShifts: sh.map(x => [x.v * 3.6, x.rpm, x.rpmTo]), drops, rl, worstF, overIdeal,
    sliders: [...document.querySelectorAll('#gwSliders input[data-g]')].length, n };
});
console.log(`\n== the read-out and the graphs ==\n  ${shown.read}`);
console.log(`  path: launch at ${Math.round(shown.pts0[1])} rpm; shifts at ` + shown.pathShifts.map(s => `${s[0].toFixed(0)} km/h ${Math.round(s[1])}->${Math.round(s[2])}`).join(', '));
if (!shown.read.includes(shown.t100.toFixed(2)) || !shown.read.includes(String(Math.round(shown.top)))) fails.push('the read-out is not the 0-100 run\'s and the top speed\'s');
if (Math.abs(shown.pts0[1] - shown.launch) > 1e-6) fails.push('the path does not launch at the run\'s launch revs');
const upTo = shown.runShifts.filter(s => s[0] <= 400);
if (shown.pathShifts.length < Math.min(upTo.length, 1)) fails.push('the path has no shift points');
shown.pathShifts.forEach((s, k) => { const r = shown.runShifts[k]; if (!r || Math.abs(s[0] - r[0]) > 1e-6 || Math.abs(s[1] - r[1]) > 1e-6 || Math.abs(s[2] - r[2]) > 1e-6) fails.push(`the path's shift ${k + 1} is not the run's`); });
for (const d of shown.drops) if (Math.abs(d.ratio / d.want - 1) > 0.03) fails.push(`the drop from ${d.g + 1} is ${d.ratio.toFixed(3)} of the revs, the ratios say ${d.want.toFixed(3)}`);
console.log(`  force graph: worst difference from T·i·i_f·η/r ${(shown.worstF * 100).toFixed(3)}%; points above the ideal ${shown.overIdeal}; sliders ${shown.sliders} for ${shown.n} gears`);
if (shown.worstF > 1e-6) fails.push('the force graph is not T(N)·i·i_f·η/r');
if (shown.overIdeal) fails.push('a gear is drawn above the ideal (peak power at every speed)');
if (shown.sliders !== shown.n) fails.push('not one slider per gear');

// 3. the controls are the car's
const ctl = await page.evaluate(async () => {
  const out = {}, wait = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  document.querySelector('#gwSpacing button[data-sp="wide"]').click(); await wait();
  out.wide = { spacing: vehicle.spacing, same: vehicle.ratios.every((x, i) => Math.abs(x - genRatios(vehicle.gears, 'wide')[i]) < 1e-12), on: document.querySelector('#gwSpacing button.on').dataset.sp };
  const s1 = document.querySelector('#gwSliders input[data-g="1"]');
  const r0 = vehicle.ratios.slice();
  s1.value = Math.round(Math.log(r0[1] * 0.9) * 1000); s1.dispatchEvent(new Event('input', { bubbles: true })); await wait();
  out.moved = { spacing: vehicle.spacing, r1: vehicle.ratios[1], want: Math.exp(Math.round(Math.log(r0[1] * 0.9) * 1000) / 1000), others: vehicle.ratios.every((x, i) => i === 1 || Math.abs(x - r0[i]) < 1e-12) };
  const s2 = document.querySelector('#gwSliders input[data-g="1"]');
  s2.value = Math.round(Math.log(9) * 1000); s2.dispatchEvent(new Event('input', { bubbles: true })); await wait();
  out.clamped = { r0: vehicle.ratios[0], r1: vehicle.ratios[1], order: vehicle.ratios.every((x, i) => i === 0 || x < vehicle.ratios[i - 1]) };
  const fd = document.getElementById('gwFd');
  fd.value = 410; fd.dispatchEvent(new Event('input', { bubbles: true })); await wait();
  out.fd = { fd: vehicle.finalDrive, set: vehFinalDriveSet, gearingOff: document.getElementById('vhGearing').disabled, saved: readVehicleFromForm().finalDriveSet };
  document.getElementById('gwFdAuto').click(); await wait();
  out.auto = { set: vehFinalDriveSet, fd: vehicle.finalDrive, matched: matchedFinalDrive(), gearingOn: !document.getElementById('vhGearing').disabled };
  document.getElementById('gwReset').click(); await wait();
  out.reset = { spacing: vehicle.spacing, set: vehRatioSet, fd: vehicle.finalDrive, factory: isFactoryFit(readVehicleFromForm()) };
  return out;
});
console.log(`\n== the controls ==\n  WIDE: spacing ${ctl.wide.spacing}, ratios the WIDE set ${ctl.wide.same}, button lit ${ctl.wide.on}`);
console.log(`  2nd moved 10% taller: ${ctl.moved.spacing}, ${ctl.moved.r1.toFixed(3)} (asked ${ctl.moved.want.toFixed(3)}), the others untouched ${ctl.moved.others}`);
console.log(`  2nd dragged past 1st: 1st ${ctl.clamped.r0.toFixed(3)}, 2nd ${ctl.clamped.r1.toFixed(3)}, still in order ${ctl.clamped.order}`);
console.log(`  final drive 4.10: runs ${ctl.fd.fd.toFixed(2)}, GEARING slider off ${ctl.fd.gearingOff}, saved ${ctl.fd.saved}; AUTO: ${ctl.auto.fd.toFixed(2)} (matched ${ctl.auto.matched.toFixed(2)}), slider on ${ctl.auto.gearingOn}`);
console.log(`  RESET: ${ctl.reset.spacing}, final ${ctl.reset.fd.toFixed(2)}, factory fit ${ctl.reset.factory}`);
if (ctl.wide.spacing !== 'wide' || !ctl.wide.same || ctl.wide.on !== 'wide') fails.push('the WIDE button is not the car\'s spacing');
if (ctl.moved.spacing !== 'custom' || Math.abs(ctl.moved.r1 - ctl.moved.want) > 1e-9 || !ctl.moved.others) fails.push('a moved gear is not the car\'s, alone, in a CUSTOM box');
if (!ctl.clamped.order || !(ctl.clamped.r1 < ctl.clamped.r0)) fails.push('a gear dragged past its neighbour crossed it');
if (Math.abs(ctl.fd.fd - 4.10) > 1e-9 || !ctl.fd.gearingOff || ctl.fd.saved !== 4.10) fails.push('a hand-set final drive is not the car\'s, or the GEARING slider stays on');
// a CUSTOM box has no published final drive: AUTO gives back the one matched to the engine
if (ctl.auto.set !== 0 || !ctl.auto.gearingOn || Math.abs(ctl.auto.fd - ctl.auto.matched) > 1e-9) fails.push('AUTO does not give the final drive back');
if (ctl.reset.spacing !== 'stock' || ctl.reset.set !== null || Math.abs(ctl.reset.fd - 3.62) > 0.01 || !ctl.reset.factory) fails.push('RESET does not give back the stock box');

// 4. every preset opens it; a phone; Greek
const all = await page.evaluate(() => { const bad = [];
  for (const p of VEHICLE_PRESETS) { try { loadVehiclePreset(p); gw.open = true; renderGearWin(); if (!(gw.path && gw.path.length >= 2)) bad.push(p.name + ': no path'); } catch (e) { bad.push(p.name + ': ' + e.message); } }
  return bad; });
console.log(`\n== every real car opens it: ${all.length ? all.length + ' failed' : 'yes'} ==`);
fails.push(...all);
await page.evaluate(() => closeGearWin());
await page.setViewportSize({ width: 390, height: 844 }); await page.waitForTimeout(200);
await page.evaluate(() => { setTab('vehicle'); openGearWin(); }); await page.waitForTimeout(500);
const phone = await page.evaluate(() => { const g = document.querySelector('#gearWin .gw').getBoundingClientRect(), c = document.getElementById('gwSaw').getBoundingClientRect();
  return { w: g.width, right: g.right, cw: c.width, ch: c.height, vw: window.innerWidth }; });
console.log(`== phone: window ${Math.round(phone.w)} px in ${phone.vw}, graph ${Math.round(phone.cw)} x ${Math.round(phone.ch)} ==`);
if (phone.right > phone.vw + 0.5) fails.push('the window runs off a phone\'s screen');
if (!(phone.ch > phone.cw * 0.6)) fails.push('the graphs are not taller on a phone');
const el = await page.evaluate(() => { applyLang('el'); renderGearWin(); const t = document.getElementById('gwTitle').textContent, b = document.getElementById('btnGearRatios').textContent; applyLang('en'); return { t, b }; });
console.log(`== Greek: ${el.t} · ${el.b} ==`);
if (el.t === 'GEAR RATIOS' || /GEAR/.test(el.b)) fails.push('the window does not speak Greek');

if (errors.length) fails.push(...errors);
await browser.close();
if (fails.length) { console.log('\nFAIL:\n  ' + fails.join('\n  ')); process.exit(1); }
console.log('\nPASS');
