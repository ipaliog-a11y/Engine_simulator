import { chromium } from './pw.mjs';
import { readFileSync, statSync } from 'fs';
import { fileURLToPath, pathToFileURL } from 'url';
import path from 'path';
const repo = fileURLToPath(new URL('..', import.meta.url));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 900 }, acceptDownloads: true });
const errors = [];
page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
await page.goto(pathToFileURL(path.join(repo, 'index.html')).href, { waitUntil: 'networkidle' });
await page.waitForTimeout(800);
const fails = [];

// 1. Corner detection: unique apexes, sensible speeds, every one named, UI count agrees
console.log('== corners ==');
const cs = await page.evaluate(async () => {
  await document.fonts.ready;
  const pr = PRESETS.find(x => x.name === '3.0 Turbo I6 (2JZ)');
  applyEngineToForm(Object.assign({}, DEFAULT_ENGINE, pr.engine)); buildEngine();
  applyChassisFit('coupe'); buildVehicle();
  const o = {};
  for (const k of Object.keys(TRACKS)) {
    trackKey = k; refreshLap();
    const c = lapCorners(lapResult), th = lapThrottleStats(lapResult);
    o[k] = { label: lapResult.track.label, declared: lapResult.track.corners, found: c.length,
      declares: (lapResult.track.names || []).length > 0,
      named: c.filter(x => !/^Turn \d+$/.test(x.name)).length,
      uniqS: new Set(c.map(x => Math.round(x.s))).size,
      apexBelowEntry: c.filter(x => x.vApex <= x.vEntry + 0.5).length,
      wot: +th.wotPct.toFixed(1), brake: +th.brakePct.toFixed(1),
      sample: c.slice(0, 3).map(x => `${x.tag} ${x.name} ${Math.round(x.vApex)}km/h g${x.gear}`) };
  }
  return o;
});
for (const [k, o] of Object.entries(cs)) {
  console.log(`  ${o.label.padEnd(14)} declared ${o.declared} = found ${o.found} | named ${o.named}/${o.found} | unique traps ${o.uniqS} | WOT ${o.wot}% brake ${o.brake}%`);
  console.log(`      ${o.sample.join('  |  ')}`);
  if (o.declared !== o.found) fails.push(`${o.label}: UI corner count (${o.declared}) disagrees with the report (${o.found})`);
  // A circuit may deliberately ship without corner names (imported road courses do, because the
  // detector can't be aligned with the real names). Only require naming where names are declared.
  if (o.declares && o.named !== o.found) fails.push(`${o.label}: ${o.found - o.named} corners unnamed`);
  if (o.uniqS !== o.found) fails.push(`${o.label}: duplicate speed traps (${o.uniqS} unique of ${o.found})`);
  if (o.apexBelowEntry !== o.found) fails.push(`${o.label}: an apex is not the slowest point of its corner`);
  if (o.wot <= 5 || o.wot >= 95) fails.push(`${o.label}: implausible full-throttle share (${o.wot}%)`);
  if (o.brake <= 2) fails.push(`${o.label}: implausible braking share (${o.brake}%)`);
}

// 2. Report renders for a range of cars/circuits
console.log('\n== report renders ==');
const rr = await page.evaluate(async () => {
  await document.fonts.ready;
  const out = [];
  for (const [nm, ch, tk] of [['1.0 Kei Turbo I3', 'kei', 'tech'], ['6.5 V12 NA Supercar', 'super', 'fast'], ['6.6 V8 Turbodiesel', 'pickup', 'mixed']]) {
    const pr = PRESETS.find(x => x.name === nm);
    applyEngineToForm(Object.assign({}, DEFAULT_ENGINE, pr.engine)); buildEngine();
    applyChassisFit(ch); buildVehicle(); trackKey = tk; refreshLap();
    const cv = hotLapReportCanvas(2), g = cv.getContext('2d');
    out.push({ nm, tk, w: cv.width, h: cv.height, hdr: g.getImageData(10, 10, 1, 1).data[0], body: g.getImageData(1240, 1400, 1, 1).data[3] });
  }
  return out;
});
rr.forEach(r => console.log(`  ${r.nm.padEnd(22)} on ${r.tk.padEnd(6)} ${r.w}x${r.h} header ${r.hdr} body alpha ${r.body}`));
rr.forEach(r => { if (r.w !== 2480 || r.h !== 3508) fails.push(`${r.nm}: wrong canvas size`); if (r.hdr > 60) fails.push(`${r.nm}: header not drawn`); });

// 3. Vehicle rows are complete and clean
const vr = await page.evaluate(() => lapVehicleRows().map(r => r.join(': ')));
console.log('\nvehicle rows:', vr.length);
vr.slice(0, 4).forEach(r => console.log('  ' + r));
if (vr.length < 12) fails.push('vehicle table too short');
if (/undefined|NaN|\[object/.test(vr.join(' | '))) fails.push('vehicle rows contain undefined/NaN');

// 4. PDF + PNG exports
await page.click('#tabTrack'); await page.waitForTimeout(300);
const d1 = page.waitForEvent('download'); await page.click('#btnLapPdf'); const dl1 = await d1;
const pdfPath = '/tmp/claude-0/-home-user-Engine-simulator/367f578e-6004-580f-ae9f-7158e9c4f5ba/scratchpad/lap.pdf';
await dl1.saveAs(pdfPath);
const buf = readFileSync(pdfPath), txt = buf.toString('latin1');
console.log(`\nPDF: ${dl1.suggestedFilename()}  ${Math.round(buf.length / 1024)} KB`);
if (!txt.startsWith('%PDF-1.')) fails.push('lap PDF has no header');
if (!txt.includes('%%EOF')) fails.push('lap PDF has no EOF');
if (!/\/Filter\s*\/DCTDecode/.test(txt)) fails.push('lap PDF missing image');
{
  const soi = buf.indexOf(Buffer.from([0xFF, 0xD8, 0xFF])), eoi = buf.lastIndexOf(Buffer.from([0xFF, 0xD9]));
  let i = soi + 2, w = 0, h = 0;
  while (i < eoi - 1) { if (buf[i] !== 0xFF) { i++; continue; } const mk = buf[i + 1], seg = buf.readUInt16BE(i + 2);
    if (mk >= 0xC0 && mk <= 0xCF && mk !== 0xC4 && mk !== 0xC8 && mk !== 0xCC) { h = buf.readUInt16BE(i + 5); w = buf.readUInt16BE(i + 7); break; } i += 2 + seg; }
  console.log(`  embedded JPEG ${w}x${h}`);
  if (w !== 2480 || h !== 3508) fails.push(`lap PDF image is ${w}x${h}`);
}
const d2 = page.waitForEvent('download'); await page.click('#btnLapPng'); const dl2 = await d2;
const pngPath = pdfPath.replace('.pdf', '.png'); await dl2.saveAs(pngPath);
console.log(`PNG: ${dl2.suggestedFilename()}  ${Math.round(statSync(pngPath).size / 1024)} KB`);
if (!/hotlap/.test(dl2.suggestedFilename())) fails.push('lap PNG filename wrong');
if (statSync(pngPath).size < 40000) fails.push('lap PNG suspiciously small');

// 5. Guarded with no lap, and Greek
const guard = await page.evaluate(() => {
  const saved = lapResult; lapResult = null;
  let ok = true; try { exportLapPNG(); exportLapPDF(); } catch (e) { ok = false; }
  const msg = document.getElementById('status').textContent; lapResult = saved;
  return { ok, msg };
});
console.log('\nno-lap guard: no throw =', guard.ok, '| status:', guard.msg);
if (!guard.ok) fails.push('lap export throws with no lap');
await page.evaluate(() => applyLang('el')); await page.waitForTimeout(150);
const el = await page.evaluate(() => document.getElementById('btnLapPng').textContent);
console.log('EL button:', el);
if (!/ΑΝΑΦΟΡΑ/.test(el)) fails.push('lap report button not translated');
await page.evaluate(() => applyLang('en'));

console.log('\nERRORS:', errors.length ? errors : 'none');
console.log(fails.length ? 'FAIL:\n  ' + fails.join('\n  ') : '\nPASS');
await browser.close();
process.exit(fails.length || errors.length ? 1 : 0);
