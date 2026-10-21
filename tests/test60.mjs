// Real engines: the model against the maker's figures.
//
// WHY THIS EXISTS. Build 96 added presets built from published specifications of real engines, so the
// model can be compared with them. This test is that comparison. It does NOT pass or fail on accuracy —
// nothing is tuned to land on a rating, and the gap IS the content. It reports the error on every real
// engine and the RMS across them, and it runs the sanity checks the archetype budgets run (test40, 44,
// 46, 47, 54) with a NAMED list of the anomalies real engines show today, each traced to the model
// limit behind it. A new anomaly fails; one that disappears is reported so its entry can be removed.
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

const rows = await page.evaluate(() => PRESETS.filter(p => p.real).map(pr => {
  applyEngineToForm(Object.assign({}, DEFAULT_ENGINE, pr.engine)); buildEngine();
  const e = engine, s = e.score, c = buildTorqueCurve();
  const hp = q => q.tq * q.rpm, pk = c.reduce((a, b) => (hp(b) > hp(a) ? b : a));
  let step = 0;
  for (let i = 1; i < c.length; i++) step = Math.max(step, Math.abs(c[i].tq - c[i - 1].tq) / Math.max(1, c[i - 1].tq));
  let boostFalls = null;
  if (e.intake === 'turbo') { let prev = -1;
    for (let n = 1000; n <= e.redline; n += 250) { const b = steadyBoost(n); if (b < prev - 1e-3 && prev < e.maxBoost - 1e-3) { boostFalls = n; break; } prev = b; } }
  const anomalies = [];
  if (pk.rpm >= e.redline * 0.985) anomalies.push('limiter');
  if (step > 0.15) anomalies.push(e.intake === 'na' ? 'na-step' : 'cliff');
  if (boostFalls) anomalies.push('boost-falls');
  // read off the scorecard: the peak-torque rpm the player sees
  if (e.intake === 'na' && !e.ci && s.peakTQrpm <= 1500) anomalies.push('flat-low-end');
  return { n: pr.name, cat: pr.cat, real: pr.real, note: pr.note || '', unsure: pr.unsure || [],
    hp: s.peakHP, hpRpm: s.peakHPrpm, tq: s.peakTQ, tqRpm: s.peakTQrpm, anomalies, step: +(step * 100).toFixed(0) };
}));

// What real engines show today, and why. Each entry is a model limit, not a preset to fix by tuning.
const KNOWN = {
  // the derived diesel's power is a plateau to the governed speed (build 88); a maker's torque limit
  // is what really rolls it off (the N57 left this list in build 121: it now peaks at 4900 of 5000)
  'VW EA288 2.0 TDI (Golf 150)': ['limiter'],
  'Cummins 6.7 (Ram HD 2019 HO)': ['limiter', 'boost-falls'],
  // large truck diesels on the large frame: the VGT's open stop cannot hold target at the top
  // build 121: with the intake stroke integrated the Duramax's power climbs to the 3800 limiter too (532 hp at
  // 3600, 542 at 3800), the same missing diesel fade as the two above
  'GM Duramax L5P 6.6 (Silverado HD)': ['boost-falls', 'limiter'],
  // build 121: the integrated intake stroke put its torque peak on the real one (149 Nm at 4600-5200, real 149
  // at 5200); power then creeps up ~1 hp per 200 rpm to the 7600 limiter (139 hp) where the real engine falls
  // from 128 at 6600. The same missing top-end fade as the F140 below.
  'Toyota 4A-GE (AE86)': ['limiter'],
  // build 122: the Aygo's 1KR-FE likewise, 75 hp at its 6500 limiter (real 68 at 6000): the same missing top-end fade
  'Toyota 1KR-FE (Aygo 1.0)': ['limiter'],
  // a flat plateau; the scorecard's conditions put the peak at the limiter, the design curve's not
  'Toyota 2JZ-GTE (Supra A80)': ['limiter'],
  // build 116: with the overlap's reverse flow derived from the cam (it was a fixed 15% lift on every cam,
  // and grew with back-pressure), the F140's power is flat over the top: 825 hp at 8500, 831 at the 8900
  // limiter (real 789 at 8500). Within 1%; the top-end breathing (port Mach index) bites only at 8900.
  'Ferrari F140 V12 (812 Superfast)': ['limiter'],
  // (Coyote, F140 and 4A-GE showed 'flat-low-end', torque peaks at 1000-1400 rpm, until build 98 put
  // the walls' extra heat at low speed into the work: peaks now 4700, 4900 and 5600 rpm.)
  // the two-stroke's fitted type factor and no expansion-chamber tuning
  'Yamaha RD350LC (2-stroke twin)': ['na-step'],
};
const CLIFF_OK = new Set(['cliff']);   // turbo boost-threshold steps: the known archetype budget defect (test47)

const pc = (a, b) => (a / b - 1) * 100, sg = x => (x >= 0 ? '+' : '') + x.toFixed(0) + '%';
let cat = '';
for (const r of rows) {
  if (r.cat !== cat) { cat = r.cat; console.log(`\n== ${cat} ==`); }
  console.log(`  ${r.n.padEnd(38)} ${String(r.hp).padStart(4)} hp vs ${String(r.real.hp).padStart(4)} ${sg(pc(r.hp, r.real.hp)).padStart(5)} @${r.hpRpm}/${r.real.hpRpm}   ` +
    `${String(r.tq).padStart(4)} Nm vs ${String(r.real.tq).padStart(4)} ${sg(pc(r.tq, r.real.tq)).padStart(5)} @${r.tqRpm}/${r.real.tqRpm}` +
    (r.anomalies.length ? `   [${r.anomalies.join(', ')}]` : '') + (r.note ? `   (${r.note})` : '') + (r.unsure.length ? `   unsure: ${r.unsure.join(', ')}` : ''));
}
const rms = a => Math.sqrt(a.reduce((s, x) => s + x * x, 0) / a.length);
const capped = r => !!r.note;   // gentlemen's-agreement ratings are not what the engine makes
const fair = rows.filter(r => !capped(r));
console.log(`\n  RMS power error ${rms(fair.map(r => pc(r.hp, r.real.hp))).toFixed(1)}%, torque ${rms(fair.map(r => pc(r.tq, r.real.tq))).toFixed(1)}% across ${fair.length} engines (capped ratings excluded)`);

for (const r of rows) {
  // sanity, not accuracy: an engine within a factor of 1.6 of its rating is being modelled; one
  // outside it is a broken preset
  for (const [k, m, rv] of [['power', r.hp, r.real.hp], ['torque', r.tq, r.real.tq]])
    if (!(m / rv > 0.45 && m / rv < 1.6)) fails.push(`${r.n}: ${k} ${m} against a real ${rv} — the preset is broken, not just inaccurate`);
  const known = new Set(KNOWN[r.n] || []);
  for (const a of r.anomalies) if (!known.has(a) && !CLIFF_OK.has(a)) fails.push(`${r.n}: new anomaly '${a}'${a.endsWith('step') || a === 'cliff' ? ` (${r.step}% in 100 rpm)` : ''}`);
  for (const a of known) if (!r.anomalies.includes(a)) console.log(`  RESOLVED: ${r.n} no longer shows '${a}' — remove it from KNOWN`);
}
for (const n of Object.keys(KNOWN)) if (!rows.find(r => r.n === n)) fails.push(`KNOWN names a preset that does not exist: ${n}`);

if (errors.length) fails.push(...errors);
console.log(fails.length ? '\nFAIL:\n  ' + fails.join('\n  ') : '\nPASS');
await browser.close();
process.exit(fails.length ? 1 : 0);
