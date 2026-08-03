import { chromium } from './pw.mjs';
import { writeFileSync, statSync } from 'fs';
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

// 1. Report canvas renders at print size for a range of engine types
console.log('== report renders ==');
const sizes = await page.evaluate(async () => {
  await document.fonts.ready;
  const out = [];
  for (const nm of ['3.0 Turbo I6 (2JZ)', '6.6 V8 Turbodiesel', '1.3 Rotary NA (Renesis)', '500cc 2-Stroke Twin']) {
    const pr = PRESETS.find(x => x.name === nm);
    applyEngineToForm(Object.assign({}, DEFAULT_ENGINE, pr.engine)); buildEngine();
    const cv = dynoReportCanvas(2);
    // sample a few pixels to confirm it isn't blank
    const g = cv.getContext('2d');
    const mid = g.getImageData(Math.round(cv.width / 2), Math.round(cv.height * 0.3), 1, 1).data;
    out.push({ nm, w: cv.width, h: cv.height, hdr: g.getImageData(10, 10, 1, 1).data[0], midA: mid[3] });
  }
  return out;
});
sizes.forEach(s => console.log(`  ${s.nm.padEnd(24)} ${s.w}x${s.h}  header ink ${s.hdr}  content alpha ${s.midA}`));
sizes.forEach(s => { if (s.w !== 2480 || s.h !== 3508) fails.push(`${s.nm}: unexpected canvas size ${s.w}x${s.h}`); });
sizes.forEach(s => { if (s.hdr > 60) fails.push(`${s.nm}: header band not drawn`); });

// 2. Peak values on the sheet agree with the engine's own scorecard
const agree = await page.evaluate(() => {
  const pr = PRESETS.find(x => x.name === '3.0 Turbo I6 (2JZ)');
  applyEngineToForm(Object.assign({}, DEFAULT_ENGINE, pr.engine)); buildEngine();
  const data = getDynoData();
  let mp = 0, mpr = 0, mt = 0, mtr = 0;
  data.forEach(p => { if (p.powerHP > mp) { mp = p.powerHP; mpr = p.rpm; } if (p.torque > mt) { mt = p.torque; mtr = p.rpm; } });
  return { sheetHP: +mp.toFixed(1), sheetRpm: mpr, scoreHP: engine.score.peakHP, scoreRpm: engine.score.peakHPrpm };
});
console.log(`\nsheet peak ${agree.sheetHP} hp @ ${agree.sheetRpm}  |  scorecard ${agree.scoreHP} hp @ ${agree.scoreRpm}`);
// they use different AFR assumptions, so allow a margin but they must be in the same ballpark
if (Math.abs(agree.sheetHP - agree.scoreHP) / agree.scoreHP > 0.15) fails.push('sheet peak power disagrees with the scorecard by >15%');

// 3. Spec rows cover the engine and never contain undefined
const rows = await page.evaluate(() => {
  const out = {};
  for (const nm of ['6.6 V8 Turbodiesel', '1.3 Rotary NA (Renesis)', '2.0 ITB NA Screamer I4']) {
    const pr = PRESETS.find(x => x.name === nm);
    applyEngineToForm(Object.assign({}, DEFAULT_ENGINE, pr.engine)); buildEngine();
    out[nm] = { spec: reportSpecRows().map(r => r.join(': ')), cond: reportCondRows().map(r => r.join(': ')) };
  }
  return out;
});
console.log('\n== spec rows (diesel) ==');
rows['6.6 V8 Turbodiesel'].spec.slice(0, 8).forEach(r => console.log('  ' + r));
for (const [nm, o] of Object.entries(rows)) {
  const all = o.spec.concat(o.cond).join(' | ');
  if (/undefined|NaN|\[object/.test(all)) fails.push(`${nm}: spec/conditions contain undefined/NaN`);
  if (o.spec.length < 15) fails.push(`${nm}: spec table too short`);
}
// rotary must say ROTOR, diesel must say compression ignition
if (!/ROTOR/.test(rows['1.3 Rotary NA (Renesis)'].spec.join(' '))) fails.push('rotary not described as rotors');
if (!/[Cc]ompression ignition/.test(rows['6.6 V8 Turbodiesel'].spec.join(' '))) fails.push('diesel not described as compression ignition');

// 4. PDF export produces a real, structurally valid PDF
const dl = page.waitForEvent('download');
await page.click('#tabDyno'); await page.waitForTimeout(200);
await page.click('#btnReportPdf');
const d = await dl;
const pdfPath = '/tmp/claude-0/-home-user-Engine-simulator/367f578e-6004-580f-ae9f-7158e9c4f5ba/scratchpad/report.pdf';
await d.saveAs(pdfPath);
const buf = (await import('fs')).readFileSync(pdfPath);
const head = buf.subarray(0, 8).toString('latin1');
const tail = buf.subarray(-8).toString('latin1');
const txt = buf.toString('latin1');
console.log(`\nPDF: ${d.suggestedFilename()}  ${Math.round(buf.length / 1024)} KB  header "${head.trim()}"  trailer "${tail.trim()}"`);
if (!head.startsWith('%PDF-1.')) fails.push('PDF has no %PDF header');
if (!tail.includes('%%EOF')) fails.push('PDF has no %%EOF');
if (!/\/Type\s*\/Catalog/.test(txt)) fails.push('PDF missing catalog');
if (!/\/Filter\s*\/DCTDecode/.test(txt)) fails.push('PDF missing the JPEG image');
if (!/startxref/.test(txt)) fails.push('PDF missing startxref');
// xref offsets must actually point at the objects they claim
const m = txt.match(/xref\n0 6\n0000000000 65535 f \n([\s\S]{60,})?trailer/);
if (!m) fails.push('PDF xref table malformed');
else {
  const offs = m[1].trim().split('\n').map(l => parseInt(l.slice(0, 10), 10));
  offs.forEach((o, i) => { if (!txt.startsWith(`${i + 1} 0 obj`, o)) fails.push(`PDF xref offset ${i + 1} points at the wrong place`); });
  console.log('  xref offsets all resolve to their objects:', offs.length === 5 && !fails.some(f => f.includes('xref offset')));
}
if (!/\.pdf$/.test(d.suggestedFilename())) fails.push('PDF filename wrong');
// Extract the embedded JPEG and confirm it is a real, correctly-sized image — proves the
// payload survived the byte splicing, not just that the PDF skeleton looks right.
{
  const soi = buf.indexOf(Buffer.from([0xFF, 0xD8, 0xFF]));
  const eoi = buf.lastIndexOf(Buffer.from([0xFF, 0xD9]));
  console.log(`  embedded JPEG: SOI @${soi}, EOI @${eoi}, ${Math.round((eoi - soi) / 1024)} KB`);
  if (soi < 0 || eoi < soi) fails.push('no JPEG found inside the PDF');
  else {
    // walk JPEG markers to the SOF and read the real dimensions
    let i = soi + 2, w = 0, h = 0;
    while (i < eoi - 1) {
      if (buf[i] !== 0xFF) { i++; continue; }
      const mk = buf[i + 1], seg = buf.readUInt16BE(i + 2);
      if (mk >= 0xC0 && mk <= 0xCF && mk !== 0xC4 && mk !== 0xC8 && mk !== 0xCC) { h = buf.readUInt16BE(i + 5); w = buf.readUInt16BE(i + 7); break; }
      i += 2 + seg;
    }
    console.log(`  JPEG SOF dimensions: ${w}x${h}`);
    if (w !== 2480 || h !== 3508) fails.push(`embedded JPEG is ${w}x${h}, expected 2480x3508`);
    // and confirm a browser will actually decode it
    writeFileSync(pdfPath.replace('.pdf', '.jpg'), buf.subarray(soi, eoi + 2));
    const dec = await page.evaluate(async (b64) => await new Promise(res => {
      const im = new Image();
      im.onload = () => res({ ok: true, w: im.naturalWidth, h: im.naturalHeight });
      im.onerror = () => res({ ok: false });
      im.src = 'data:image/jpeg;base64,' + b64;
    }), buf.subarray(soi, eoi + 2).toString('base64'));
    console.log('  browser decodes it:', dec.ok, dec.ok ? `${dec.w}x${dec.h}` : '');
    if (!dec.ok) fails.push('embedded JPEG does not decode');
  }
}

// 5. PNG export downloads
const dl2 = page.waitForEvent('download');
await page.click('#btnReportPng');
const d2 = await dl2;
const pngPath = pdfPath.replace('.pdf', '.png');
await d2.saveAs(pngPath);
console.log(`PNG: ${d2.suggestedFilename()}  ${Math.round(statSync(pngPath).size / 1024)} KB`);
if (!/\.png$/.test(d2.suggestedFilename())) fails.push('PNG filename wrong');
if (statSync(pngPath).size < 40000) fails.push('PNG suspiciously small');

// 6. Guarded when there's no engine, and Greek labels
const guard = await page.evaluate(() => {
  const saved = engine.score; engine.score = null;
  let ok = true;
  try { exportDynoPNG(); exportDynoPDF(); } catch (e) { ok = false; }
  const msg = document.getElementById('status').textContent;
  engine.score = saved;
  return { ok, msg };
});
console.log('\nno-engine guard: no throw =', guard.ok, '| status:', guard.msg);
if (!guard.ok) fails.push('export throws when no engine is built');
await page.evaluate(() => applyLang('el')); await page.waitForTimeout(150);
const el = await page.evaluate(() => document.getElementById('btnReportPng').textContent);
console.log('EL button:', el);
if (!/ΑΝΑΦΟΡΑ/.test(el)) fails.push('report buttons not translated');
await page.evaluate(() => applyLang('en'));

console.log('\nERRORS:', errors.length ? errors : 'none');
console.log(fails.length ? 'FAIL:\n  ' + fails.join('\n  ') : '\nPASS');
await browser.close();
process.exit(fails.length || errors.length ? 1 : 0);
