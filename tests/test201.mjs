// The bench holds its speed at any frame rate (build 326).
//
// WHY THIS EXISTS. The dyno brake pulls brakeGain Nm per rpm over its hold target, and the bench took one explicit step
// per frame. Below ~32-59 frames a second (by engine) that step overshot by more than it corrected and the RPM jumped
// for good: at 30 frames an RS3 swung 660 rpm, an MX-5 1700. It must hold that:
//   · at 60, 30 and 20 frames a second the settled speed swings by under 2 rpm;
//   · the settled speed is the same at every frame rate, within 2 rpm.
import { chromium } from './pw.mjs';
import { fileURLToPath, pathToFileURL } from 'url';
import path from 'path';
const repo = fileURLToPath(new URL('..', import.meta.url));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
const errors = [];
page.on('console', m => { if (m.type() === 'error' && !/ERR_FILE_NOT_FOUND/.test(m.text())) errors.push('console: ' + m.text()); });
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
await page.goto(pathToFileURL(path.join(repo, 'index.html')).href, { waitUntil: 'networkidle' });
await page.waitForTimeout(400);
const fails = [];

const r = await page.evaluate(() => ['Audi RS3', 'MX-5 1.6'].map(nm => {
  const p = VEHICLE_PRESETS.find(x => x.name.includes(nm)); loadVehiclePreset(p);
  const row = { car: p.name, runs: [] };
  for (const fps of [60, 30, 20]) {
    state.throttle = 0.85; state.load = 0.4; state.rpm = 4000; state.firing = true; state.ignOn = true;
    const a = []; for (let i = 0; i < fps * 15; i++) { stepEngine(1 / fps); updatePhysics(); if (i > fps * 12) a.push(state.rpm); }
    row.runs.push({ fps, lo: Math.min(...a), hi: Math.max(...a) });
  }
  return row;
}));
for (const c of r) {
  console.log(`== ${c.car}: ` + c.runs.map(x => `${x.fps} fps ${x.lo.toFixed(1)}-${x.hi.toFixed(1)} rpm`).join(' • ') + ' ==');
  for (const x of c.runs) {
    if (!(x.hi - x.lo < 2)) fails.push(`${c.car}: the speed swings ${(x.hi - x.lo).toFixed(0)} rpm at ${x.fps} frames a second`);
    if (!(Math.abs(x.hi - c.runs[0].hi) < 2)) fails.push(`${c.car}: settles at ${x.hi.toFixed(0)} rpm at ${x.fps} fps, ${c.runs[0].hi.toFixed(0)} at 60`);
  }
}

await browser.close();
if (errors.length) console.log('ERRORS:\n  ' + errors.join('\n  '));
if (fails.length) console.log('\nFAIL:\n  ' + fails.join('\n  '));
else console.log('\nOK: the bench holds its speed at 60, 30 and 20 frames a second.');
process.exit(fails.length || errors.length ? 1 : 0);
