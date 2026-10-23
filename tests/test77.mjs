// Tyre temperatures against the real world (build 145).
//
// Pit-lane pyrometer guidance puts street tyres at their best around 60-77 C, UHP summer tyres (the sim's SPORT)
// 66-88 C and race tyres 77-104 C; Michelin gives its Cup 2 R 70-100 C (90 ideal) and Toyo its R888R 71-104 C.
// A pit reading is 10-20 C under the tyre on track (the tread sheds heat fast on the in-lap). Front-heavy cars run
// hotter fronts, the outside tyre runs hottest, track tyres come in over the first laps, and road tyres on a
// heavy car overheat. The race model was already consistent with all of that; this pins it.
import { chromium } from './pw.mjs';
import { fileURLToPath, pathToFileURL } from 'url';
import path from 'path';
const repo = fileURLToPath(new URL('..', import.meta.url));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors = [];
page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
await page.goto(pathToFileURL(path.join(repo, 'index.html')).href, { waitUntil: 'networkidle' });
await page.waitForTimeout(600);
const fails = [];

const rows = await page.evaluate(() => {
  const rec = n => {
    const v = VEHICLE_PRESETS.find(x => x.name.includes(n)), ep = PRESETS.find(x => x.name === v.engine);
    return { name: v.name, build: { engine: Object.assign({}, ep.engine), tune: Object.assign({}, STD_TUNE), vehicle: vehicleFromPreset(v), name: v.name } };
  };
  const out = [];
  const sv = RACE.pace, sm = RACE.mistake; RACE.pace = 0; RACE.mistake = 0;
  for (const n of ['GR Yaris', 'Golf GTI', 'Civic Type R', 'M3 (E46', 'Corvette Z06', 'Mustang GT', 'Hellcat', '911 GT3']) {
    const M = raceCarModel(rec(n), 'tech');
    const R = raceInit([M], { track: 'tech', laps: 6, seed: 1, cars: [{ stops: 'none' }] });
    const peak = [0, 0, 0, 0], atLine = [];let done = 0;
    while (!R.done) {
      raceStepOnce(R);
      const c = R.cars[0];
      for (let q = 0; q < 4; q++) peak[q] = Math.max(peak[q], c.T[q]);
      if (c.lapsDone > done) { done = c.lapsDone; atLine.push(Math.max(...c.T)); }
    }
    // which way the circuit mostly turns: the lap's signed cornering load (+ = right-handers, left tyres outside)
    let turn = 0; const P = M.prof[(M.grips.length - 1) * RACE_FUEL.length + 1];
    for (let i = 0; i < M.n; i++) { const ds = M.cum[i + 1] - M.cum[i]; turn += M.kap[i] * P.v[i] * ds; }
    out.push({ name: M.name, tyre: M.tyre.key, tOpt: M.tyre.tOpt, tWin: M.tyre.tWin, drive: M.drive, fWt: M.fWt, mass: M.mass,
      peak, atLine, wear: Math.max(...R.cars[0].W), turn });
  }
  RACE.pace = sv; RACE.mistake = sm;
  return out;
});

console.log('== six laps of Ashdown Park, alone: tyre peaks FL/FR/RL/RR (C) ==');
for (const x of rows) console.log(`  ${x.name.padEnd(40)} ${x.tyre.padEnd(6)} ${x.drive}  ${x.peak.map(Math.round).join('/')}  line ${x.atLine.map(Math.round).join(' ')}  wear ${x.wear.toFixed(2)}`);
const mean = a => a.reduce((s, v) => s + v, 0) / a.length;
for (const x of rows) {
  const hot = Math.max(...x.peak), front = mean(x.peak.slice(0, 2)), rear = mean(x.peak.slice(2));
  if (x.tyre === 'sport' && !(hot >= 75 && hot <= 112)) fails.push(`${x.name}: hottest sport tyre ${Math.round(hot)} C, outside 75-112 (UHP 66-88 in the pits, +10-20 on track)`);
  if (x.tyre === 'semi' && !(hot >= 85 && hot <= 115)) fails.push(`${x.name}: hottest semi-slick ${Math.round(hot)} C, outside 85-115 (makers' 70-100+)`);
  if (hot > x.tOpt + 1.5 * x.tWin) fails.push(`${x.name}: ${Math.round(hot)} C is far past its compound's window`);
  if (x.drive === 'fwd' && !(front >= rear + 15)) fails.push(`${x.name}: a front-driver's fronts (${Math.round(front)}) are not clearly hotter than its rears (${Math.round(rear)})`);
  if (x.drive !== 'fwd' && x.fWt <= 0.53 && !(rear >= front - 3)) fails.push(`${x.name}: a rear-biased car's rears (${Math.round(rear)}) run cooler than its fronts (${Math.round(front)})`);
  // the outside tyre: right-handers load the left side
  const left = x.peak[0] + x.peak[2], right = x.peak[1] + x.peak[3];
  if (Math.sign(left - right) !== Math.sign(x.turn)) fails.push(`${x.name}: the inside of the circuit's turns runs hotter than the outside`);
  if (x.tyre === 'sport' && !(Math.abs(x.atLine[2] - x.atLine[5]) <= 10)) fails.push(`${x.name}: the tyres are not near working temperature by lap 3 (${Math.round(x.atLine[2])} against ${Math.round(x.atLine[5])})`);
  if (!(x.wear <= 0.2)) fails.push(`${x.name}: wear ${x.wear.toFixed(2)} after six laps; a set should last a track day`);
}
const hc = rows.find(x => /Hellcat/.test(x.name)), gti = rows.find(x => /Golf GTI/.test(x.name));
if (!(Math.max(...hc.peak) > Math.max(...gti.peak))) fails.push('a 2-tonne car does not work the same road tyres harder than a light hatch');

console.log('\nERRORS:', errors.length ? errors : 'none');
console.log(fails.length ? 'FAIL:\n  ' + fails.join('\n  ') : '\nPASS');
await browser.close();
process.exit(fails.length || errors.length ? 1 : 0);
