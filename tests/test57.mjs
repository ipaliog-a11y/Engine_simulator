// Turbo spool timing from the hardware: Petroff bearings, a real charge volume, boost as its state.
//
// WHY THIS EXISTS. The two transient losses on the turbo shaft were fitted until build 93: bearing drag
// at ~5x published cartridge losses with a D^5 borrowed from the inertia scaling, and a charge-fill cost
// per bar attached to the compressor wheel. test40's "small frame quicker off the line" stood on the
// first, and its "2.5 bar takes far longer than 0.5" on the second. Both are now derived, and boost is
// the pressure in a volume: it rises as the shaft can afford the air, and falls only as fast as the
// engine empties the volume.
import { chromium } from './pw.mjs';
import { fileURLToPath, pathToFileURL } from 'url';
import path from 'path';
const repo = fileURLToPath(new URL('..', import.meta.url));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
const errors = [];
page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
await page.goto(pathToFileURL(path.join(repo, 'index.html')).href, { waitUntil: 'networkidle' });
await page.waitForTimeout(400);
const fails = [];

const r = await page.evaluate(() => {
  const w = n => n * 2 * Math.PI / 60, out = {};
  // 1. bearings against published cartridge losses, and Petroff's D^3
  out.brg = { at100: bearingCoeff(0.071) * w(100000) ** 2, at140: bearingCoeff(0.071) * w(140000) ** 2,
    d3: bearingCoeff(0.142) / bearingCoeff(0.071) };
  // 2. charge volumes are the size real plumbing is
  out.vol = [];
  for (const sz of ['small', 'medium', 'large']) for (const ic of ['none', 'small', 'large']) {
    applyEngineToForm(Object.assign({}, DEFAULT_ENGINE, { intake: 'turbo', boost_bar: 1.0, turboSize: sz, intercooler: ic })); buildEngine();
    out.vol.push({ sz, ic, L: engine.chargeVol * 1000 });
  }
  // 3. the volume holds its pressure: lift at full boost and boost decays, it does not vanish
  applyEngineToForm(Object.assign({}, DEFAULT_ENGINE, PRESETS.find(p => p.name === '2.0 Turbo Hot-Hatch I4').engine)); buildEngine();
  let E = 0, b = 0;
  for (let t = 0; t < 3; t += 1 / 240) { const a = advanceShaft(E, 5000, b, 1, 1 / 240); E = a.shaftE; b = a.boost; }
  const lit = b, a1 = advanceShaft(E, 5000, b, 0.0, 0.02);
  let E2 = a1.shaftE, b2 = a1.boost;
  for (let t = 0; t < 0.5; t += 1 / 240) { const a = advanceShaft(E2, 5000, b2, 0.0, 1 / 240); E2 = a.shaftE; b2 = a.boost; }
  out.lift = { lit, after20ms: a1.boost, after520ms: b2 };
  // 4. a bigger charge system costs spool time: same engine, no intercooler vs the large core
  const t90 = ic => { applyEngineToForm(Object.assign({}, DEFAULT_ENGINE, PRESETS.find(p => p.name === '2.0 Turbo Hot-Hatch I4').engine, { intercooler: ic })); buildEngine();
    let E = 0, b = 0, t = 0; while (t < 10 && b < 0.9 * engine.maxBoost) { const a = advanceShaft(E, 4500, b, 1, 1 / 240); E = a.shaftE; b = a.boost; t += 1 / 240; } return t; };
  out.fill = { none: t90('none'), large: t90('large') };
  return out;
});

console.log(`== bearings: ${(r.brg.at100 / 1000).toFixed(2)} kW at 100k, ${(r.brg.at140 / 1000).toFixed(2)} kW at 140k (published 0.2-0.8); doubling D scales it x${r.brg.d3.toFixed(2)} ==`);
if (!(r.brg.at100 > 200 && r.brg.at140 < 900)) fails.push('bearing loss is outside published cartridge losses');
if (Math.abs(r.brg.d3 - 8) > 1e-6) fails.push(`Petroff gives D^3 (x8 for double the size), not x${r.brg.d3.toFixed(2)}`);

console.log('\n== charge volume (compressor to throttle) ==');
for (const v of r.vol) console.log(`  ${v.sz.padEnd(6)} frame, ${v.ic.padEnd(5)} intercooler: ${v.L.toFixed(1)} L`);
for (const v of r.vol) if (!(v.L > 0.8 && v.L < 15)) fails.push(`${v.sz}/${v.ic}: ${v.L.toFixed(1)} L is not a real charge system`);
const byIc = ic => r.vol.filter(v => v.ic === ic).map(v => v.L);
if (!(Math.min(...byIc('large')) > Math.max(...byIc('none')))) fails.push('a front-mount core must hold more air than bare ducting');

console.log(`\n== lift at full boost: ${r.lift.lit.toFixed(2)} bar -> ${r.lift.after20ms.toFixed(2)} after 20 ms -> ${r.lift.after520ms.toFixed(2)} after 520 ms ==`);
if (!(r.lift.after20ms > 0.5 * r.lift.lit)) fails.push('boost vanished the instant the throttle closed — the charge volume holds pressure');
if (!(r.lift.after520ms < r.lift.after20ms)) fails.push('boost should bleed away through the engine after a lift');

console.log(`== time to 90% boost at 4500 rpm: no intercooler ${r.fill.none.toFixed(2)} s, large core ${r.fill.large.toFixed(2)} s ==`);
if (!(r.fill.large > r.fill.none)) fails.push('a larger charge system must take longer to fill');

if (errors.length) fails.push(...errors);
console.log(fails.length ? '\nFAIL:\n  ' + fails.join('\n  ') : '\nPASS');
await browser.close();
process.exit(fails.length ? 1 : 0);
