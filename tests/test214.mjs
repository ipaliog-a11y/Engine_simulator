// Challenges: eco driver, fixed-time stages, moose free-body labels (build 352).
//
// WHY THIS EXISTS. Build 352 adds an eco driver to the economy run, a fixed-time stage kind and a labelled
// front-axle diagram for the moose run. What must hold:
//   · the eco driver never spends more than the plain speed cap it replaced (blend 100% only), and saves on the
//     MX-5 at Alpine Pass and the Model 3 on the Dragon; it still finishes on the target;
//   · stages: the Golf GTI Mk7 (the reference) finishes every stage; an NA MX-5 is a DNF on Alpine; the head says DNF;
//   · the moose result carries the diagram's scale (track, CG height, tyre radius) and the canvas draws without error.
import { chromium } from './pw.mjs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const repo = fileURLToPath(new URL('..', import.meta.url));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
await page.goto(pathToFileURL(path.join(repo, 'index.html')).href, { waitUntil: 'networkidle' });
const fails = [];

const r = await page.evaluate(async () => {
  const load = n => loadVehiclePreset(FACTORY_CARS.find(p => p.name.includes(n)));
  const pair = road => {
    const eco = simulateEconomyChallenge(road, 1.25);
    const keep = ECO_BLENDS.slice(); ECO_BLENDS.splice(0, ECO_BLENDS.length, 1);
    const cap = simulateEconomyChallenge(road, 1.25);
    ECO_BLENDS.splice(0, ECO_BLENDS.length, ...keep);
    const q = R => R.ev ? R.kWh : R.fuelL;
    return { eco: q(eco), cap: q(cap), t: eco.time, target: eco.target, blend: eco.ecoBlend };
  };
  const out = {};
  load('MX-5'); out.mx5 = pair('alpine');
  out.mx5Stage = solveRunChallenge('stage-alpine');
  out.mx5Stage = { dnf: out.mx5Stage.dnf, margin: out.mx5Stage.margin };
  const m = simulateMooseChallenge();
  out.moose = { ok: m.ok, track: m.track, cgH: m.cgH, rT: m.rT, x0: m.samples[0].x };
  load('Model 3 RWD'); out.m3 = pair('dragon');
  load('Golf GTI (Mk7'); out.golf = RUN_CHALLENGES.filter(c => c.kind === 'stage').map(c => { const R = solveRunChallenge(c.id); return { id: c.id, dnf: R.dnf, margin: R.margin }; });
  load('MX-5');
  setTab('challenges');
  const sel = document.getElementById('chalSel');
  sel.value = 'stage-alpine'; sel.dispatchEvent(new Event('change'));
  out.head = document.getElementById('chalHead').textContent;
  sel.value = 'moose'; sel.dispatchEvent(new Event('change'));
  await new Promise(z => setTimeout(z, 300));
  return out;
});
console.log(JSON.stringify(r, null, 2));
for (const [k, p] of [['MX-5 Alpine', r.mx5], ['Model 3 Dragon', r.m3]]) {
  if (!(p.eco <= p.cap * 1.0005)) fails.push(`${k}: eco ${p.eco} spends more than the plain cap ${p.cap}`);
  if (!(p.eco < p.cap * 0.99)) fails.push(`${k}: eco ${p.eco} saves under 1% on the plain cap ${p.cap}`);
  if (!(Math.abs(p.t - p.target) <= Math.max(2, 0.02 * p.target))) fails.push(`${k}: off target ${p.t} vs ${p.target}`);
}
for (const g of r.golf) if (g.dnf) fails.push('Golf GTI (reference) DNF on ' + g.id + ' by ' + g.margin.toFixed(1) + ' s');
if (!r.mx5Stage.dnf) fails.push('MX-5 should DNF the Alpine stage');
if (!/DNF/.test(r.head)) fails.push('stage head lacks DNF: ' + r.head);
if (!(r.moose.ok && r.moose.track > 1 && r.moose.cgH > 0.2 && r.moose.rT > 0.2)) fails.push('moose diagram scale missing');
if (!(r.moose.x0 >= -10.5)) fails.push('moose replay starts before the cones: x ' + r.moose.x0);

console.log(fails.length ? 'FAIL:\n  ' + fails.join('\n  ') : 'PASS');
console.log('ERRORS:', errors.length ? errors : 'none');
await browser.close();
process.exit(fails.length || errors.length ? 1 : 0);
