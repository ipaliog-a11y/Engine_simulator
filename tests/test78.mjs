// Fuel on track against the real world (build 146).
//
// The race burns fuel as the power the lap spends at each point times that engine's own BSFC at its rpm and boost.
// Real figures are owners' and magazines', not controlled tests: an FK8 Civic Type R emptied its tank in 84 track
// miles (Autocar, ~35 L/100 km), an E46 M3 ~35 L/100 km, a stock 1.6 Miata ~9 mpg (~26 L/100 km), a Mustang GT
// 5.0 ~6 mpg (~39 L/100 km), and the rules of thumb are "road consumption x 3" or 8-10 L per 20-minute session.
// Those drivers are below the limit and the lap is at it, so the bands are wide (+-35%); what is pinned hard is the
// physics: the fuel against the engine's work over the lap is a real engine's BSFC under hard use.
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
  for (const n of ['MX-5', 'Golf GTI', 'GR Yaris', 'Civic Type R', 'M3 (E46', 'Mustang GT', '911 GT3', 'Corvette Z06', 'Huracán', 'Hellcat']) {
    const e = rec(n), M = raceCarModel(e, 'spa');
    const R = raceInit([M], { track: 'spa', laps: 3, seed: 1, cars: [{ stops: 'none' }] }); raceRun(R);
    const lap = R.cars[0].laps[2], litres = lap.fuelKg / M.fuelRho, km = M.L3 / 1000;
    // the engine's work over the nominal lap against the fuel the race model burns along it
    const P = M.prof[(M.grips.length - 1) * RACE_FUEL.length + 1];
    let W = 0, F = 0, t = 0, wot = 0, hp = 0;
    withBuild(e.build, () => {
      hp = engine.score.peakHP;
      const L = simulateLap('spa', { line: lineFor(buildTrack('spa'), 'spa') }), line = L.track.line, nP = line.length;
      for (let i = 0; i < nP; i++) {
        const j = (i + 1) % nP, dt = line[i].ds3 / Math.max(2, (L.v[i] + L.v[j]) / 2);
        W += L.replay.pwr[i] * dt; F += P.fr[i] * dt; t += dt; if (L.replay.thr[i] > 0.95) wot += dt;
      }
    });
    out.push({ name: M.name, hp, perLap: litres, per100: litres / km * 100, perHour: litres / (lap.t / 3600),
      bsfc: F / (W / 3.6e6), eff: W / (F / 1000 * 44e6), wot: wot / t });
  }
  RACE.pace = sv; RACE.mistake = sm;
  return out;
});

console.log('== Spa, at the limit: fuel, and the engine behind it ==');
for (const x of rows) console.log(`  ${x.name.padEnd(40)} ${String(x.hp).padStart(3)} hp  ${x.per100.toFixed(0)} L/100 km  ${x.perHour.toFixed(0)} L/h  BSFC ${x.bsfc.toFixed(0)} g/kWh  ${(x.eff * 100).toFixed(1)}%  full throttle ${(x.wot * 100).toFixed(0)}%`);
for (const x of rows) {
  if (!(x.bsfc >= 240 && x.bsfc <= 360)) fails.push(`${x.name}: a lap-average BSFC of ${x.bsfc.toFixed(0)} g/kWh is outside a petrol engine's 240-360 under hard use`);
  if (!(x.eff >= 0.22 && x.eff <= 0.33)) fails.push(`${x.name}: ${(x.eff * 100).toFixed(1)}% overall engine efficiency is not a real engine's`);
  if (!(x.wot >= 0.40 && x.wot <= 0.70)) fails.push(`${x.name}: full throttle ${(x.wot * 100).toFixed(0)}% of a Spa lap (real fast-circuit laps 50-70%)`);
}
const band = { 'M3 (E46': [23, 48], 'Civic Type R': [23, 48], 'MX-5': [15, 35], 'Mustang GT': [25, 60], 'Corvette Z06': [30, 65] };
for (const [k, [lo, hi]] of Object.entries(band)) {
  const x = rows.find(r => r.name.includes(k));
  if (!(x.per100 >= lo && x.per100 <= hi)) fails.push(`${x.name}: ${x.per100.toFixed(0)} L/100 km on track, outside ${lo}-${hi} (real figures +-35% for pace)`);
}
for (const k of ['Golf GTI', 'Civic Type R']) {
  const x = rows.find(r => r.name.includes(k)), session = x.perHour / 3;
  if (!(session >= 8 && session <= 22)) fails.push(`${x.name}: ${session.toFixed(1)} L in a 20-minute session (rule of thumb 8-10, more at the limit)`);
}
// more power, more fuel
const rank = a => { const s = a.map((v, i) => [v, i]).sort((p, q) => p[0] - q[0]), r = []; s.forEach(([, i], k) => r[i] = k); return r; };
const rh = rank(rows.map(x => x.hp)), rf = rank(rows.map(x => x.perLap)), nR = rows.length;
const rho = 1 - 6 * rh.reduce((s, v, i) => s + (v - rf[i]) ** 2, 0) / (nR * (nR * nR - 1));
console.log(`\n  fuel against power, rank correlation ${rho.toFixed(3)}`);
if (!(rho >= 0.9)) fails.push(`fuel does not follow power (rank correlation ${rho.toFixed(2)})`);
const most = rows.reduce((a, b) => b.perLap > a.perLap ? b : a), least = rows.reduce((a, b) => b.perLap < a.perLap ? b : a);
if (!/Hellcat/.test(most.name) || !/MX-5/.test(least.name)) fails.push(`the thirstiest is ${most.name} and the frugalest ${least.name}`);

console.log('\nERRORS:', errors.length ? errors : 'none');
console.log(fails.length ? 'FAIL:\n  ' + fails.join('\n  ') : '\nPASS');
await browser.close();
process.exit(fails.length || errors.length ? 1 : 0);
