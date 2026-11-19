#!/usr/bin/env node
// Accuracy check for one factory car (import-vehicle skill).
// Usage: node .cursor/skills/import-vehicle/scripts/check-accuracy.mjs "Exact Preset Name"
// Bands match tests/test115.mjs: power ±25%, matched 0-100 ±35%, top ±35%.
// Exit 0 when inside band (or confidence is low / gross rating). Exit 1 on miss or load error.
import { chromium } from '../../../../tests/pw.mjs';
import { fileURLToPath, pathToFileURL } from 'url';
import path from 'path';

const name = process.argv[2];
if (!name) {
  console.error('Usage: check-accuracy.mjs "Exact Preset Name"');
  process.exit(2);
}

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const fails = [];
const f = (x, d = 0) => (+x).toFixed(d);
const pc = (a, b) => (a / b - 1) * 100;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
const errors = [];
page.on('console', m => { if (m.type() === 'error' && !/ERR_FILE_NOT_FOUND/.test(m.text())) errors.push('console: ' + m.text()); });
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
await page.goto(pathToFileURL(path.join(repo, 'index.html')).href, { waitUntil: 'networkidle' });
await page.waitForTimeout(400);

const r = await page.evaluate(name => {
  const p = (typeof FACTORY_CARS !== 'undefined' ? FACTORY_CARS : VEHICLE_PRESETS).find(x => x.name === name);
  if (!p) return { missing: true };
  const ep = (typeof FACTORY_ENGINES !== 'undefined' ? FACTORY_ENGINES : PRESETS).find(e => e.name === p.engine);
  const o = { name: p.name, conf: p.confidence || 'medium', real: p.real, chassis: p.chassis };
  if (!ep) return Object.assign(o, { noEngine: true });
  try {
    loadVehiclePreset(p);
    setTab('vehicle');
    o.factory = isFactoryFit(readVehicleFromForm());
    const gs = typeof GEARSETS !== 'undefined' ? GEARSETS[p.name] : null;
    o.published = !!gs;
    o.gearsOk = !gs || JSON.stringify(vehicle.ratios) === JSON.stringify(gs.r);
    o.hp = engine.score.peakHP;
    o.rhp = ep.real && ep.real.hp;
    o.gross = !!(ep.real && ep.real.gross);
    o.taper = ep.engine.taperRpm ? ep.engine.taperRpm + '/' + ep.engine.taperPct : '';
    o.t100 = perf.t100;
    o.top = perf.topSpeed;
    if (ep.real && ep.real.hp > 0) {
      const k = ep.real.hp / Math.max(1, engine.score.peakHP);
      const c0 = buildTorqueCurve, g0 = buildTorqueGrid;
      window.buildTorqueCurve = () => c0().map(q => ({ rpm: q.rpm, tq: q.tq * k }));
      window.buildTorqueGrid = () => { const G = g0(); return Object.assign({}, G, { tq: G.tq.map(row => row.map(t => t * k)) }); };
      try { buildVehicle(); o.mT100 = perf.t100; o.mTop = perf.topSpeed; }
      finally { window.buildTorqueCurve = c0; window.buildTorqueGrid = g0; buildVehicle(); }
    }
  } catch (e) { o.err = String(e).slice(0, 200); }
  return o;
}, name);
await browser.close();

if (r.missing) { console.error(`FAIL: not a factory car: ${name}`); process.exit(1); }
if (r.noEngine) { console.error(`FAIL: no engine preset for ${name}`); process.exit(1); }
if (r.err) { console.error(`FAIL: ${r.err}`); process.exit(1); }

const scored = r.conf !== 'low';
const ep = r.rhp ? pc(r.hp, r.rhp) : NaN;
const et = r.mT100 != null ? pc(r.mT100, r.real.t100) : NaN;
const ev = r.top != null ? pc(r.top, r.real.top) : NaN;

console.log(`== ${r.name} (${r.conf}, ${r.chassis}) ==`);
console.log(`power   ${f(r.hp)} / ${f(r.rhp)}${r.gross ? 'g' : ''}  ${Number.isFinite(ep) ? ((ep >= 0 ? '+' : '') + f(ep) + '%') : 'n/a'}  taper ${r.taper || 'off'}`);
console.log(`0-100   as-built ${f(r.t100, 2)} s; matched ${f(r.mT100, 2)} / ${f(r.real.t100, 1)}  ${Number.isFinite(et) ? ((et >= 0 ? '+' : '') + f(et) + '%') : 'n/a'}`);
console.log(`top     ${f(r.top)} / ${r.real.top}${r.real.limited ? 'L' : ''}  ${Number.isFinite(ev) ? ((ev >= 0 ? '+' : '') + f(ev) + '%') : 'n/a'}`);
console.log(`factory fit ${r.factory}; published gears ${r.published} ok ${r.gearsOk}`);

if (!r.factory) fails.push('does not load as factory fit');
if (!r.gearsOk) fails.push('published gearbox not applied');
if (scored && !r.gross && Number.isFinite(ep) && Math.abs(ep) > 25) fails.push(`power ${f(ep)}% off rating (band ±25%)`);
if (scored && Number.isFinite(et) && Math.abs(et) > 35) fails.push(`0-100 matched ${f(et)}% off (band ±35%)`);
if (scored && Number.isFinite(ev) && Math.abs(ev) > 35) fails.push(`top speed ${f(ev)}% off (band ±35%)`);
if (!scored) console.log('(confidence low: reported only, not scored)');
if (r.gross) console.log('(SAE gross rating: power not scored)');

for (const e of errors) fails.push(e);
if (fails.length) {
  console.error('\nFAIL:\n  ' + fails.join('\n  '));
  console.error('See references/gap-report.md — fix inputs only, or file a gap.');
  process.exit(1);
}
console.log('\nOK: inside tolerance (or unscored by rule).');
process.exit(0);
