// RACE tab (build 136), in the page: set a race up the way a person would, start it, watch it to the flag.
// The race engine has its own test (test71); this one is about the page around it: the setup, the
// computation, the timing tower, the telemetry, the map and the result, with no errors on the way, and
// the build on the VEHICLE tab untouched at the end.
import { chromium } from './pw.mjs';
import { fileURLToPath, pathToFileURL } from 'url';
import path from 'path';
const repo = fileURLToPath(new URL('..', import.meta.url));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 950 } });
const errors = [];
page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
await page.goto(pathToFileURL(path.join(repo, 'index.html')).href, { waitUntil: 'networkidle' });
await page.waitForTimeout(600);
const fails = [];

// the spec only: the tune record also carries the live bench's coolant and oil temperatures, which the
// running engine moves while the race plays
const spec = () => page.evaluate(() => { const b = serializeBuild('x', ''); return JSON.stringify({ e: b.engine, v: b.vehicle, m: b.fuelMap || null }); });
const before = await spec();
await page.click('#tabRace');
await page.waitForTimeout(200);
const setup = await page.evaluate(() => ({
  panel: getComputedStyle(document.getElementById('racePanel')).display,
  options: document.querySelectorAll('#raceAddSel option').length,
  start: document.getElementById('raceStart').disabled
}));
console.log(`== setup: panel ${setup.panel}, ${setup.options} cars to pick from, START disabled with no cars: ${setup.start}`);
if (setup.panel === 'none') fails.push('the RACE panel is not shown on the RACE tab');
if (setup.options < 20) fails.push('the car picker is missing the factory cars');
if (!setup.start) fails.push('START RACE is enabled with no cars');

// three cars: the current build, and two factory cars picked by name
const pick = async name => {
  const v = await page.evaluate(n => { const o = [...document.querySelectorAll('#raceAddSel option')].find(o => o.textContent.includes(n)); return o && o.value; }, name);
  if (!v) { fails.push('no ' + name + ' in the picker'); return; }
  await page.selectOption('#raceAddSel', v); await page.click('#raceAddBtn');
};
await page.selectOption('#raceAddSel', 'cur'); await page.click('#raceAddBtn');
await pick('Civic Type R');
await pick('911 GT3');
await page.selectOption('#raceTrk', 'tech');
await page.fill('#raceLaps', '3');
await page.fill('#raceSeed', '42');
const ents = await page.$$eval('#raceEntrants .race-ent', e => e.length);
console.log(`   ${ents} entrants listed`);
if (ents !== 3) fails.push(`expected 3 entrants, got ${ents}`);

const t0 = Date.now();
await page.click('#raceStart');
await page.waitForFunction(() => raceUI.phase === 'live', null, { timeout: 120000 });
console.log(`== computed in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
await page.selectOption('#raceSpeed', '30');
await page.waitForTimeout(2500);
const mid = await page.evaluate(() => ({
  rows: document.querySelectorAll('#raceTower tr[data-car]').length,
  cards: document.querySelectorAll('#raceTele .rt-card').length,
  tyres: document.querySelectorAll('#raceTele .rt-t').length,
  head: document.getElementById('raceHead').textContent,
  t: raceUI.t
}));
console.log(`== racing: t ${mid.t.toFixed(1)} s · tower rows ${mid.rows} · telemetry cards ${mid.cards} (${mid.tyres} tyres) · "${mid.head}"`);
if (mid.rows !== 3) fails.push('the timing tower does not list three cars');
if (mid.cards !== 3 || mid.tyres !== 12) fails.push('the telemetry does not show four tyres for each car');
if (!(mid.t > 10)) fails.push('the race clock is not running');

// the README's picture: the race under way
await page.screenshot({ path: path.join(repo, 'docs', 'race.png'), clip: { x: 0, y: 0, width: 1280, height: 950 } });

// follow a car from the tower
await page.click('#raceTower tr[data-car]');
const follow = await page.evaluate(() => raceUI.follow);
if (follow < 0) fails.push('clicking a row in the tower does not follow that car');

await page.click('#raceSkip');
await page.waitForTimeout(400);
const end = await page.evaluate(() => ({
  results: document.querySelectorAll('#raceResults tbody tr').length,
  text: document.getElementById('raceResults').textContent,
  done: raceUI.t >= raceUI.run.t - 1e-6,
  laps: raceUI.run.cars.map(c => c.laps.length)
}));
console.log(`== at the flag: ${end.results} result rows, laps ${end.laps.join('/')}`);
if (end.results !== 3) fails.push('the result table does not list three cars');
if (!end.done) fails.push('FINISH did not take the replay to the flag');
if (!end.laps.some(n => n === 3)) fails.push('nobody completed the race distance');

// scrub back to half distance: the tower follows the clock
await page.evaluate(() => { const s = document.getElementById('raceScrub'); s.value = 500; s.dispatchEvent(new Event('input')); s.dispatchEvent(new Event('change')); });
const half = await page.evaluate(() => ({ t: raceUI.t, T: raceUI.run.t, res: document.getElementById('raceResults').textContent.length }));
if (Math.abs(half.t / half.T - 0.5) > 0.01) fails.push('the scrubber does not move the race clock');
if (half.res > 0) fails.push('the result is still shown half way through the race');

await page.click('#raceNew');
const back = await page.evaluate(() => ({ setup: !document.getElementById('raceSetup').hidden, ents: raceUI.entrants.length }));
if (!back.setup || back.ents !== 3) fails.push('NEW RACE does not return to the setup with the same cars');

const after = await spec();
if (after !== before) fails.push('running a race changed the build on the VEHICLE tab');

console.log('\nERRORS:', errors.length ? errors : 'none');
console.log(fails.length ? 'FAIL:\n  ' + fails.join('\n  ') : '\nPASS');
await browser.close();
process.exit(fails.length || errors.length ? 1 : 0);
