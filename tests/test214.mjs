// Challenges: eco driver, fixed-time stages, moose free-body labels (build 352).
//
// WHY THIS EXISTS. Build 352 adds an eco driver to the economy run, a fixed-time stage kind and a labelled
// front-axle diagram for the moose run. What must hold:
//   · the eco driver never spends more than the plain speed cap it replaced (blend 100% only), and saves on the
//     MX-5 at Alpine Pass and the Model 3 on the Dragon; it still finishes on the target;
//   · stages: the Golf GTI Mk7 (the reference) finishes every stage; an NA MX-5 is a DNF on Alpine; the head says DNF;
//   · the moose result carries the diagram's scale (track, CG height, tyre radius) and the canvas draws without error;
//   · moose failure modes: a fixed entry speed (72, 77) gives an outcome; BEST says how it fails one step up; a Land
//     Cruiser with its CG raised to 1.1 m (t/2h 0.74) rolls over at 77 km/h (72 until build 353), tipping to atan(t/2h), while the stock one
//     (t/2h 1.09) does not;
//   · the replay (build 353) runs from 25 m before the cones to 100 m, 20 m past the judged end, without changing the
//     score (MX-5 still 68 km/h, as on main since build 353); REPLAY offers 1, 0.5 and 0.25 and 0.25 plays a quarter as fast.
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
  out.moose = { ok: m.ok, track: m.track, cgH: m.cgH, rT: m.rT, x0: m.samples[0].x, x1: m.samples[m.samples.length - 1].x, best: m.speedKmh };
  out.mooseFail = { failBy: m.failBy, failAt: m.failAt, best: m.speedKmh };
  const f72 = simulateMooseChallenge(72); out.m72 = { outcome: f72.outcome, v: f72.speedKmh };
  load('Land Cruiser'); const lcS = simulateMooseChallenge(77);   // 77 since build 353: at 72 the better driver finds a line that only clips a cone
  vehicle.cg = 1.1; const lcH = simulateMooseChallenge(77);
  out.lc = { stock: lcS.outcome, high: lcH.outcome, tip: lcH.tipMax, ssf: lcH.ssf, tH: lcH.track / 2, h: lcH.cgH };
  load('Model 3 RWD'); out.m3 = pair('dragon');
  load('Golf GTI (Mk7'); out.golf = RUN_CHALLENGES.filter(c => c.kind === 'stage').map(c => { const R = solveRunChallenge(c.id); return { id: c.id, dnf: R.dnf, margin: R.margin }; });
  load('MX-5');
  setTab('challenges');
  const sel = document.getElementById('chalSel');
  sel.value = 'stage-alpine'; sel.dispatchEvent(new Event('change'));
  out.head = document.getElementById('chalHead').textContent;
  sel.value = 'moose'; sel.dispatchEvent(new Event('change'));
  await new Promise(z => setTimeout(z, 300));
  const rs = document.getElementById('chalMooseRate');
  out.rates = rs ? [...rs.options].map(o => +o.value) : [];
  rs.value = '0.25'; rs.dispatchEvent(new Event('change'));
  const t0 = performance.now(); await new Promise(z => setTimeout(z, 400));
  out.rateRatio = chalMooseNow() / ((performance.now() - t0) / 1000);
  out.rateShown = rs.closest('.field').style.display !== 'none';
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
if (!(r.mooseFail.failBy && r.mooseFail.failBy !== 'CLEAR' && r.mooseFail.failAt === r.mooseFail.best + 1)) fails.push('BEST should say how it fails one step up: ' + JSON.stringify(r.mooseFail));
if (!(r.m72.v === 72 && ['CLEAR', 'CONE', 'SPIN', 'ROLLOVER'].includes(r.m72.outcome))) fails.push('fixed 72 km/h run: ' + JSON.stringify(r.m72));
if (r.lc.stock === 'ROLLOVER') fails.push('stock Land Cruiser rolls over at 77 km/h');
if (r.lc.high !== 'ROLLOVER') fails.push('Land Cruiser with a 1.1 m CG should roll over at 77 km/h, got ' + r.lc.high);
else if (!(Math.abs(r.lc.tip - Math.atan(r.lc.tH / r.lc.h)) < 0.03)) fails.push('rollover tip ' + r.lc.tip + ' rad, want atan(t/2h) ' + Math.atan(r.lc.tH / r.lc.h));
if (!(r.moose.x0 >= -25.5 && r.moose.x0 < -20)) fails.push('moose replay should start ~25 m before the cones: x ' + r.moose.x0);
if (!(r.moose.x1 >= 95)) fails.push('moose replay should run on to ~100 m: last x ' + r.moose.x1);
if (r.moose.best !== 68) fails.push('MX-5 best clear speed moved: ' + r.moose.best + ' (the replay must not change the score)');
if (JSON.stringify(r.rates) !== '[1,0.5,0.25]') fails.push('REPLAY options ' + JSON.stringify(r.rates));
if (!r.rateShown) fails.push('REPLAY hidden on the moose run');
if (!(r.rateRatio > 0.2 && r.rateRatio < 0.3)) fails.push('0.25x replay runs at ' + r.rateRatio.toFixed(2) + ' of real time');

console.log(fails.length ? 'FAIL:\n  ' + fails.join('\n  ') : 'PASS');
console.log('ERRORS:', errors.length ? errors : 'none');
await browser.close();
process.exit(fails.length || errors.length ? 1 : 0);
