// WHY THIS EXISTS (build 298): the pit lane's cost is derived per car and circuit, no longer one 20 s for all.
//   - every car's loss comes from the lane's length, its limit, and the car's own speed, braking and launch;
//   - a longer lane costs more; a circuit with its own published length uses it (Albert Park 281 m), others 400 m;
//   - the loss sits in a sane range (5-30 s at a 60 km/h limit) and is split into entry, box and exit;
//   - the race reads it: no RACE.pitLoss is left.
import { chromium } from './pw.mjs';
import { fileURLToPath, pathToFileURL } from 'url';
import path from 'path';
const repo = fileURLToPath(new URL('..', import.meta.url));
const browser = await chromium.launch();
const page = await browser.newPage();
const errors = [];
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
await page.goto(pathToFileURL(path.join(repo, 'index.html')).href, { waitUntil: 'networkidle' });
await page.waitForTimeout(500);
const fails = [];
const r = await page.evaluate(() => {
  const rec = n => { const v = VEHICLE_PRESETS.find(x => x.name.includes(n)), ep = PRESETS.find(x => x.name === v.engine);
    return { name: v.name, build: { engine: Object.assign({}, ep.engine), tune: Object.assign({}, STD_TUNE), vehicle: vehicleFromPreset(v), name: v.name } }; };
  const rows = [];
  for (const n of ['Civic Type R', '911 GT3'])for (const k of ['spa', 'melbourne', 'tech']) {
    const M = raceCarModel(rec(n), k), P = M.pit;
    rows.push({ n, k, Lp: P.Lp, loss: P.loss, parts: P.entry + P.box + P.exit, longer: racePitLoss(M, P.Lp + 200, 9.81).loss, same: racePitLoss(M, P.Lp, 9.81).loss, pitLoss: M.pitLoss });
  }
  return { rows, old: 'pitLoss' in RACE };
});
for (const x of r.rows) {
  console.log(`${x.n.padEnd(14)} ${x.k.padEnd(10)} lane ${x.Lp} m  loss ${x.loss.toFixed(1)} s`);
  if (!(x.loss > 5 && x.loss < 30)) fails.push(`${x.n} at ${x.k}: loss ${x.loss}`);
  if (Math.abs(x.parts - x.loss) > 1e-9 || x.pitLoss !== x.loss) fails.push(`${x.n} at ${x.k}: parts do not add up`);
  if (!(x.longer > x.same)) fails.push(`${x.n} at ${x.k}: a longer lane does not cost more`);
  if (x.Lp !== (x.k === 'melbourne' ? 281 : 400)) fails.push(`${x.k}: lane ${x.Lp} m`);
}
if (r.old) fails.push('RACE.pitLoss is still there');
await browser.close();
for (const f of [...fails, ...errors]) console.log('FAIL', f);
console.log(fails.length + errors.length ? 'test182 FAILED' : 'test182 passed');
process.exit(fails.length + errors.length ? 1 : 0);
