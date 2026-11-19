// A compound turbo's split off its design point (build 375).
//
// WHY THIS EXISTS. Since build 294 a compound's two stages held their equal design split at every point, the HP shaft
// tied to the LP one. Each shaft now balances on its own map (compoundNet, compoundSplit). On a designed compound (the
// Golf GTI's frame, large, 2.5 bar) what must hold:
//   · below the target, at the LP shaft's own balance, the LP stage makes well under half the ratio (in log terms),
//     and less at low flow than where the target is held at high flow;
//   · the engine holds its target from where it first reaches it to the redline (the total holds);
//   · at the design ratio and the redline's flow, the steady split makes the design total with both wheels inside
//     their tip limits.
import { chromium } from './pw.mjs';
import { fileURLToPath, pathToFileURL } from 'url';
import path from 'path';
const repo = fileURLToPath(new URL('..', import.meta.url));
const browser = await chromium.launch();
const page = await browser.newPage();
const errors = [];
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
await page.goto(pathToFileURL(path.join(repo, 'index.html')).href, { waitUntil: 'networkidle' });
await page.waitForTimeout(300);
const fails = [];

const r = await page.evaluate(() => {
  loadVehiclePreset(FACTORY_CARS.find(p => p.name.includes('Golf GTI (Mk7')));
  applyEngineToForm(Object.assign({}, engine, { turboConfig: 'compound', boost_bar: 2.5, turboSize: 'large' })); buildEngine();
  const e = engine, rows = [];
  for (const rpm of [1000, 1500, 2500, 4000, 5000, 6000, e.redline]) {
    const b = steadyBoost(rpm), tgt = boostTarget(rpm), T3 = exhaustGasT(1, rpm), m = airFlowAt(rpm, 1 + b), row = { rpm, b, tgt };
    if (b < tgt - 1e-3) {                    // spooling: the LP shaft where its own net is zero
      let lo = 0, hi = e.shaftMax;
      for (let i = 0; i < 40; i++) { const n = (lo + hi) / 2; if (shaftNetPower(n, m, T3, 313, rpm).net > 0) lo = n; else hi = n; }
      const q = shaftNetPower(lo, m, T3, 313, rpm); row.sL = q.sLP; row.sH = q.sHP;
    } else { const sp = compoundSplit(m, m * 1.06, 1 + b, T3, 298, compFlowFrac(rpm, m)); row.sL = sp.sL; row.sH = sp.sH; }
    rows.push(row);
  }
  const red = e.redline, m = airFlowAt(red, 3.5), ff = compFlowFrac(red, m), T3 = exhaustGasT(1, red);
  const sp = compoundSplit(m, m * 1.06, 3.5, T3, 298, ff);
  const T1 = 298 * (1 + (Math.pow(sp.sL, 0.286) - 1) / compIslandEff(ff, sp.sL));
  return { rows, d: { sL: sp.sL, sH: sp.sH, lpMax: compressorPR(e.lpExd, e.shaftMax, ff, 298).pr,
    hpMax: compressorPR(e.compExd, maxShaftRpm(e.compExd), compoundHpFrac(ff, sp.sL, T1, 298), T1).pr } };
});
await browser.close();

const share = x => Math.log(x.sL) / Math.log(x.sL * x.sH);
for (const x of r.rows) console.log(`${String(x.rpm).padStart(5)} rpm: boost ${x.b.toFixed(3)} of ${x.tgt.toFixed(3)} bar, LP ${x.sL.toFixed(3)} x HP ${x.sH.toFixed(3)}, LP share ${(share(x) * 100).toFixed(0)}%`);
const below = r.rows.filter(x => x.b < x.tgt - 1e-3), held = r.rows.filter(x => x.b >= x.tgt - 1e-3);
if (below.length < 2 || !held.length) fails.push('the sweep does not cover both spooling and held points');
const top = held[held.length - 1];
for (const x of below) {
  if (!(share(x) < 0.4)) fails.push(`${x.rpm} rpm: the LP stage makes ${(share(x) * 100).toFixed(0)}% of the ratio while spooling`);
  if (top && !(share(x) < share(top))) fails.push(`${x.rpm} rpm: the LP share is not below the one at ${top.rpm} rpm`);
}
const first = r.rows.findIndex(x => x.b >= x.tgt - 1e-3);
if (first >= 0 && r.rows.slice(first).some(x => x.b < x.tgt - 1e-3)) fails.push('the target is not held to the redline once reached');
console.log(`design ratio 3.5 at the redline: LP ${r.d.sL.toFixed(3)} (limit ${r.d.lpMax.toFixed(3)}) x HP ${r.d.sH.toFixed(3)} (limit ${r.d.hpMax.toFixed(3)})`);
if (Math.abs(r.d.sL * r.d.sH / 3.5 - 1) > 1e-6) fails.push('the steady split does not make the design total');
if (r.d.sL > r.d.lpMax + 1e-9 || r.d.sH > r.d.hpMax + 1e-9) fails.push('a wheel passes its tip limit at the design point');

if (errors.length) console.log('ERRORS:\n  ' + errors.join('\n  '));
if (fails.length) console.log('\nFAIL:\n  ' + fails.join('\n  '));
else console.log('\nOK: the LP stage lags the HP one off the design point, and the total holds.');
process.exit(fails.length || errors.length ? 1 : 0);
