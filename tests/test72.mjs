// RACE tab (build 137; its own page, weather, per-car plans and the report, build 141), in the page: set a race up the way a person would, start it, watch it to the flag.
// The race engine has its own test (test71); this one is about the page around it: the setup, the
// computation, the timing tower, the telemetry, the map and the result, with no errors on the way, and
// the build on the VEHICLE tab untouched at the end.
import { chromium } from './pw.mjs';
import { fileURLToPath, pathToFileURL } from 'url';
import path from 'path';
import fs from 'fs';
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
  page: !document.getElementById('racePage').hidden,
  canvasIn: document.getElementById('raceStage').contains(canvas),
  panelIn: document.getElementById('raceSide').contains(document.getElementById('racePanel')),
  stage: Math.round(document.getElementById('raceStage').getBoundingClientRect().width),
  panel: getComputedStyle(document.getElementById('racePanel')).display,
  options: document.querySelectorAll('#raceAddSel option').length,
  start: document.getElementById('raceStart').disabled
}));
console.log(`== setup: panel ${setup.panel}, ${setup.options} cars to pick from, START disabled with no cars: ${setup.start}`);
if (setup.panel === 'none') fails.push('the RACE panel is not shown on the RACE tab');
console.log(`   race page open: ${setup.page}, map in its stage (${setup.stage} px wide): ${setup.canvasIn}, panel beside it: ${setup.panelIn}`);
if (!setup.page || !setup.canvasIn || !setup.panelIn) fails.push('RACE does not open its own page with the map and the panel in it');
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
await page.fill('#raceLaps', '6');
await page.fill('#raceSeed', '42');
await page.selectOption('#raceWeather', 'rain');
await page.selectOption('#raceEntrants select[data-k="2"][data-f="stops"]', '1');   // the GT3 stops once
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
  tyreCol: [...document.querySelectorAll('#raceTower th')].some(th => /TYRE/.test(th.textContent)),
  badges: document.querySelectorAll('#raceTower .race-ty').length,
  top: document.getElementById('raceTopInfo').textContent,
  t: raceUI.t
}));
console.log(`== racing: t ${mid.t.toFixed(1)} s · tower rows ${mid.rows} · telemetry cards ${mid.cards} (${mid.tyres} tyres) · "${mid.head}"`);
if (mid.rows !== 3) fails.push('the timing tower does not list three cars');
if (mid.cards !== 3 || mid.tyres !== 12) fails.push('the telemetry does not show four tyres for each car');
if (!(mid.t > 10)) fails.push('the race clock is not running');
if (!mid.tyreCol || mid.badges !== 3) fails.push('the tower does not show each car\'s tyres');
if (!/LAP/.test(mid.top)) fails.push('the page\'s top bar does not carry the lap and clock');

// the README's picture: the race under way
await page.screenshot({ path: path.join(repo, 'docs', 'race.png') });

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
if (!end.laps.some(n => n === 6)) fails.push('nobody completed the race distance');
const plan = await page.evaluate(() => { const c = raceUI.run.cars.find(c => /911/.test(c.M.name)); return { planned: c.plan.stops.length, rain: raceUI.run.events.some(e => e.type === 'rain') }; });
console.log(`   the GT3's plan: ${plan.planned} stop · it rained: ${plan.rain}`);
if (plan.planned !== 1) fails.push('the GT3 was told to stop once and planned ' + plan.planned);
if (!plan.rain) fails.push('RAIN LATER never rained');
// the report: a download from the button, and the sheet itself for the README
const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 30000 }), page.click('#raceRptPng')]);
console.log(`== report: ${dl.suggestedFilename()}`);
if (!/_race_.*\.png$/.test(dl.suggestedFilename())) fails.push('REPORT PNG did not save a race report');
const rpt = await page.evaluate(() => { const cv = raceReportCanvas(raceUI.run, 1); return { w: cv.width, h: cv.height, url: cv.toDataURL('image/png') }; });
if (rpt.w !== 1240 || rpt.h !== 1754) fails.push('the race report is not an A4 sheet');
fs.writeFileSync(path.join(repo, 'docs', 'race-report.png'), Buffer.from(rpt.url.split(',')[1], 'base64'));

// scrub back to half distance: the tower follows the clock
await page.evaluate(() => { const s = document.getElementById('raceScrub'); s.value = 500; s.dispatchEvent(new Event('input')); s.dispatchEvent(new Event('change')); });
const half = await page.evaluate(() => ({ t: raceUI.t, T: raceUI.run.t, res: document.getElementById('raceResults').textContent.length }));
if (Math.abs(half.t / half.T - 0.5) > 0.01) fails.push('the scrubber does not move the race clock');
if (half.res > 0) fails.push('the result is still shown half way through the race');

await page.click('#raceNew');
const back = await page.evaluate(() => ({ setup: !document.getElementById('raceSetup').hidden, ents: raceUI.entrants.length }));
if (!back.setup || back.ents !== 3) fails.push('NEW RACE does not return to the setup with the same cars');

// ◀ SIM: back to where we came from, with the map back in the sim's own panel
await page.click('#raceBack');
await page.waitForTimeout(200);
const shut = await page.evaluate(() => ({ hidden: document.getElementById('racePage').hidden, home: document.querySelector('.viz-panel').contains(canvas), vizW, mode: vizMode }));
console.log(`== back to the sim: page hidden ${shut.hidden}, map home ${shut.home}, ${shut.vizW} wide, on ${shut.mode}`);
if (!shut.hidden || !shut.home || shut.vizW !== 640 || shut.mode === 'race') fails.push('◀ SIM does not close the race page cleanly');

// a phone: the page stacks, map over panel, and nothing scrolls sideways
{
  const ph = await browser.newPage({ viewport: { width: 390, height: 844 } });
  ph.on('pageerror', e => errors.push('phone pageerror: ' + e.message));
  await ph.goto(pathToFileURL(path.join(repo, 'index.html')).href, { waitUntil: 'networkidle' });
  await ph.waitForTimeout(400);await ph.click('#tabRace');await ph.waitForTimeout(300);
  const m = await ph.evaluate(() => ({ sw: document.documentElement.scrollWidth, bw: document.querySelector('.race-body').scrollWidth,
    stage: document.getElementById('raceStage').getBoundingClientRect().bottom, side: document.getElementById('raceSide').getBoundingClientRect().top }));
  console.log(`== phone: page ${m.sw} px, race body ${m.bw} px wide, map ends ${Math.round(m.stage)} px, panel starts ${Math.round(m.side)} px`);
  if (m.sw > 390 || m.bw > 390) fails.push('the race page scrolls sideways on a phone');
  if (m.side < m.stage - 1) fails.push('on a phone the panel does not sit under the map');
  await ph.close();
}

const after = await spec();
if (after !== before) fails.push('running a race changed the build on the VEHICLE tab');

console.log('\nERRORS:', errors.length ? errors : 'none');
console.log(fails.length ? 'FAIL:\n  ' + fails.join('\n  ') : '\nPASS');
await browser.close();
process.exit(fails.length || errors.length ? 1 : 0);
