// Challenges: rank several cars on one challenge (build G2).
//
// WHY THIS EXISTS. The CHALLENGES tab solved one car at a time. The ranking runs a list of cars through the
// selected challenge with its own solver and score. What must hold:
//   · every registered kind has a score (RUN_CHALLENGE_SCORES), so the ranking needs no per-challenge code;
//   · a ranked row's score equals the one-car solve of that car (same physics, same settings);
//   · the table is sorted: passes first, then by the challenge's own score direction;
//   · the page yields between cars: the progress bar shows while it runs, and CANCEL stops before the next car;
//   · the loaded car and its challenge result are the same after a ranking as before;
//   · no horizontal scroll at phone width, no page errors.
import { chromium } from './pw.mjs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const repo = fileURLToPath(new URL('..', import.meta.url));
const shot = process.env.SHOT;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: shot ? 2 : 1 });
const errors = [], fails = [];
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
await page.goto(pathToFileURL(path.join(repo, 'index.html')).href, { waitUntil: 'networkidle' });

const r = await page.evaluate(async () => {
  const idx = n => FACTORY_CARS.findIndex(p => p.name.includes(n));
  const out = {};
  out.unscored = [...new Set(RUN_CHALLENGES.map(c => c.kind))].filter(k => !RUN_CHALLENGE_SCORES[k]);
  loadVehiclePreset(FACTORY_CARS[idx('MX-5')]);
  setTab('challenges');
  const sel = document.getElementById('chalSel');
  sel.value = 'stage-alpine'; sel.dispatchEvent(new Event('change'));
  const before = { mass: vehicle.mass, time: chalResult.time, name: loaded.car && loaded.car.name };
  const add = v => { const s = document.getElementById('chalRankAddSel'); s.value = v; document.getElementById('chalRankAddBtn').click(); };
  const picks = ['MX-5', 'Golf GTI', 'Model 3'].map(idx);
  out.picks = picks;
  for (const i of picks) add('p:' + i);
  // one-car reference scores
  const ch = runChallengeById('stage-alpine');
  out.ref = picks.map(i => withBuild(raceEntrantFrom('p:' + i).build, () => runChallengeScore(ch, solveRunChallenge(ch.id))));
  const run = chalRankRun();
  await new Promise(r => setTimeout(r, 0));
  out.progShown = !document.getElementById('chalRankProg').hidden && !document.getElementById('chalRankStop').hidden;
  await run;
  out.rows = chalRank.rows.map(x => ({ name: x.name, s: x.s }));
  out.table = document.querySelectorAll('#chalRankOut tbody tr').length;
  out.after = { mass: vehicle.mass, time: chalResult.time, name: loaded.car && loaded.car.name };
  out.before = before;
  // cancel: stop after the first car
  const run2 = chalRankRun();
  await new Promise(r => setTimeout(r, 0));
  document.getElementById('chalRankStop').click();
  await run2;
  out.cancelled = chalRank.rows.length;
  // moose kind ranks too (higher is better)
  sel.value = 'moose'; sel.dispatchEvent(new Event('change'));
  chalRank.cars.splice(2, 1);
  await chalRankRun();
  out.moose = chalRank.rows.map(x => x.s && { v: x.s.v, pass: x.s.pass, higher: x.s.higher });
  out.scrollW = document.documentElement.scrollWidth, out.w = window.innerWidth;
  document.getElementById('chalRankOut').scrollIntoView();
  return out;
});
if (shot) await page.screenshot({ path: shot, fullPage: false });
await browser.close();

const ok = (c, m) => { if (!c) fails.push(m); };
ok(r.unscored.length === 0, 'kinds without a score: ' + r.unscored);
ok(r.picks.every(i => i >= 0), 'presets not found');
ok(r.progShown, 'progress/cancel not shown while running');
ok(r.table === 3 && r.rows.length === 3, 'table rows ' + r.table);
for (let k = 0; k < r.ref.length; k++) {
  const row = r.rows.find(x => x.s && Math.abs(x.s.v - r.ref[k].v) < 1e-9 && x.s.pass === r.ref[k].pass);
  ok(row, 'ranked score differs from the one-car solve: ' + JSON.stringify(r.ref[k]));
}
const sorted = rows => rows.every((x, i) => i === 0 || !x || !rows[i - 1] || (rows[i - 1].pass && !x.pass) ||
  (rows[i - 1].pass === x.pass && (x.higher ? rows[i - 1].v >= x.v : rows[i - 1].v <= x.v)));
ok(sorted(r.rows.map(x => x.s)), 'stage rows not sorted');
ok(r.moose.length === 2 && r.moose.every(x => x && x.higher) && sorted(r.moose), 'moose rows ' + JSON.stringify(r.moose));
ok(r.cancelled < 3, 'cancel did not stop: ' + r.cancelled + ' rows');
ok(r.after.mass === r.before.mass && r.after.time === r.before.time && r.after.name === r.before.name, 'car changed: ' + JSON.stringify([r.before, r.after]));
ok(r.scrollW <= r.w, 'horizontal scroll ' + r.scrollW + ' > ' + r.w);
console.log('stage-alpine ranking:'); for (const x of r.rows) console.log('  ' + x.name.padEnd(36) + (x.s ? x.s.text + (x.s.pass ? ' PASS' : ' FAIL') : '—'));
console.log('moose:', JSON.stringify(r.moose), ' cancelled after', r.cancelled, 'car(s)');
for (const e of errors) fails.push(e);
if (fails.length) { console.log('FAIL\n  ' + fails.join('\n  ')); process.exit(1); }
console.log('PASS');
