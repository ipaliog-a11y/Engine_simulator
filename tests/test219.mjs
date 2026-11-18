// Challenges: S-route powerslide (build 358).
//
// WHY THIS EXISTS. A controlled powerslide needs yaw, combined slip and a driver that holds body slip — not the
// grip-limit lap solver. Build 358 adds an S-route challenge (straight, left, short straight, right, straight)
// and named failure modes. What must hold:
//   · both RWD cars (MX-5 and Mustang) finish CLEAR: both corners past the rear peak with body slip;
//   · (build 359) the course is continuous: no gap over 1 m between line points;
//   · a FWD car (Civic Type R) finishes NO_SLIDE (handbrake not modelled — power-over alone does not initiate);
//   · outcomes are only CLEAR / FADE / NO_SLIDE / STALL / OFF / SPIN;
//   · (build 360) each METHOD runs its own initiation on the MX-5 (power, kick, flick), a fixed ENTRY is the
//     entry speed, FWD with FLICK runs a flick plan, and the i button shows and hides the explanation;
//   · the Challenges UI lists S-Route Powerslide and shows the outcome without page errors.
import { chromium } from './pw.mjs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const repo = fileURLToPath(new URL('..', import.meta.url));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [], fails = [];
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
await page.goto(pathToFileURL(path.join(repo, 'index.html')).href, { waitUntil: 'networkidle' });

const r = await page.evaluate(() => {
  const load = n => loadVehiclePreset(FACTORY_CARS.find(p => p.name.includes(n) || p.name.startsWith(n)));
  const out = { outcomes: DRIFT_RANK ? Object.keys(DRIFT_RANK) : null };
  const L = driftSCourse(20, 12, 34).line;
  out.gap = Math.max(...L.slice(1).map((p, k) => Math.hypot(p.x - L[k].x, p.y - L[k].y)));
  load('MX-5');
  const mx = simulateDriftChallenge();
  out.mx5 = { ok: mx.ok, outcome: mx.outcome, drive: mx.drive, b1: mx.beta1, b2: mx.beta2, past1: mx.past1, past2: mx.past2, n: mx.samples && mx.samples.length };
  load('Mustang GT');
  const mu = simulateDriftChallenge();
  out.mustang = { outcome: mu.outcome, drive: mu.drive, b1: mu.beta1, b2: mu.beta2 };
  load('Civic Type R (FK8');
  const ci = simulateDriftChallenge();
  out.civic = { outcome: ci.outcome, drive: ci.drive, past1: ci.past1, past2: ci.past2, fin: ci.samples && ci.samples.length > 10 };
  out.methods = {};
  load('MX-5');
  for (const m of ['power', 'kick', 'flick']) { chalDriftMethod = m; chalDriftEntry = 40; const R = simulateDriftChallenge(); out.methods[m] = { init: R.init, kmh: R.speedKmh, out: R.outcome }; }
  load('Civic Type R (FK8'); chalDriftMethod = 'flick'; chalDriftEntry = 40; out.civicFlick = simulateDriftChallenge().init;
  chalDriftMethod = 'auto'; chalDriftEntry = 0; load('MX-5');
  setTab('challenges');
  const sel = document.getElementById('chalSel');
  sel.value = 'drift-s'; sel.dispatchEvent(new Event('change'));
  out.head = document.getElementById('chalHead').textContent;
  const nb = document.getElementById('chalNote'), ib = document.getElementById('chalInfoBtn');
  out.info = [nb.hidden, (ib.click(), nb.hidden), nb.textContent.includes('FLICK'), (ib.click(), nb.hidden)];
  out.driftFields = ['chalDriftEntry', 'chalDriftMethod'].every(id => document.getElementById(id).closest('.field').style.display !== 'none');
  out.has = !!RUN_CHALLENGES.find(c => c.id === 'drift-s');
  out.rateShown = (() => { const el = document.getElementById('chalMooseRate'); return el && el.closest('.field').style.display !== 'none'; })();
  return out;
});
await browser.close();

const OK = new Set(['CLEAR', 'FADE', 'NO_SLIDE', 'STALL', 'OFF', 'SPIN']);
console.log('MX-5', r.mx5);
console.log('Mustang', r.mustang);
console.log('Civic', r.civic);
console.log('max line gap', r.gap, 'm');
console.log('UI', r.head, 'rate', r.rateShown);

if (!r.has) fails.push('drift-s missing from RUN_CHALLENGES');
if (!r.mx5 || !OK.has(r.mx5.outcome)) fails.push('MX-5 bad outcome');
if (r.mx5.outcome !== 'CLEAR' || r.mustang.outcome !== 'CLEAR') fails.push('RWD not both CLEAR (MX-5 ' + r.mx5.outcome + ', Mustang ' + r.mustang.outcome + ')');
if (!(r.gap < 1)) fails.push('course gap ' + r.gap + ' m');
for (const k of OK) if (!r.outcomes.includes(k)) fails.push('DRIFT_RANK missing ' + k);
if (r.civic.drive !== 'fwd') fails.push('Civic not FWD');
if (r.civic.outcome !== 'NO_SLIDE') fails.push('Civic expected NO_SLIDE, got ' + r.civic.outcome);
if (!(r.mx5.n > 20)) fails.push('MX-5 replay samples missing');
if (!/POWERSLIDE|CLEAR|NO_SLIDE|FADE|OFF|SPIN/i.test(r.head || '')) fails.push('UI head missing outcome: ' + r.head);
if (!r.rateShown) fails.push('replay rate hidden on drift');
console.log('methods', r.methods, 'civic flick', r.civicFlick, 'info', r.info);
for (const m of ['power', 'kick', 'flick']) { const x = r.methods[m]; if (x.init !== m || x.kmh !== 40 || !OK.has(x.out)) fails.push('method ' + m + ': ' + JSON.stringify(x)); }
if (r.civicFlick !== 'flick') fails.push('Civic FLICK ran ' + r.civicFlick);
if (r.info.join() !== 'true,false,true,true') fails.push('i button: ' + r.info.join());
if (!r.driftFields) fails.push('drift ENTRY/METHOD hidden');
for (const e of errors) fails.push(e);

if (fails.length) { console.error('FAIL', fails); process.exit(1); }
console.log('PASS');
process.exit(0);
