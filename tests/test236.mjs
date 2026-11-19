// Nissan Skyline GT-R (R32, 1989) factory import (build 387).
//
// WHY THIS EXISTS. Batch-2 wave 1's first car: research + presets + showroom art.
// What must hold:
//   · research/vehicles/nissan-skyline-gtr-r32-1989/vehicle.json validates;
//   · the car and its RB26 R32 engine are factory presets with published FS5R30A gears;
//   · CAR_NO 101, CAR_DIMS, CAR_ART + 960×640 WebP exist;
//   · check-accuracy stays inside band (power / matched 0–100 / top).
import { execFileSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const repo = fileURLToPath(new URL('..', import.meta.url));
const fails = [];
const name = 'Nissan Skyline GT-R (R32, 1989)';

try {
  const out = execFileSync('node', [
    path.join(repo, '.cursor/skills/import-vehicle/scripts/check-accuracy.mjs'), name,
  ], { encoding: 'utf8' });
  console.log(out.trim().split('\n').map(l => '== ' + l + ' ==').join('\n'));
  if (!/\bOK:/.test(out)) fails.push('accuracy did not report OK');
} catch (e) {
  fails.push('accuracy: ' + (e.stderr || e.stdout || e.message).toString().slice(0, 600));
}

try {
  const out = execFileSync('node', [
    path.join(repo, '.cursor/skills/vehicle-profile-art/scripts/validate-art.mjs'), name,
  ], { encoding: 'utf8' });
  console.log('== art: ' + out.trim() + ' ==');
} catch (e) {
  fails.push('art: ' + (e.stderr || e.stdout || e.message).toString().slice(0, 400));
}

const page = await (async () => {
  const { chromium } = await import('./pw.mjs');
  const { pathToFileURL } = await import('url');
  const browser = await chromium.launch();
  const p = await browser.newPage();
  const errors = [];
  p.on('pageerror', e => errors.push(e.message));
  await p.goto(pathToFileURL(path.join(repo, 'index.html')).href, { waitUntil: 'networkidle' });
  const r = await p.evaluate((nm) => {
    const car = FACTORY_CARS.find(c => c.name === nm);
    const eng = FACTORY_ENGINES.find(e => e.name === 'Nissan RB26DETT (Skyline GT-R R32)');
    if (!car || !eng) return { ok: false, why: 'missing preset' };
    loadVehiclePreset(car);
    return {
      ok: true,
      no: CAR_NO[nm],
      art: !!CAR_ART[nm],
      gears: !!(GEARSETS[nm] && GEARSETS[nm].r && GEARSETS[nm].r.length === 5),
      fd: GEARSETS[nm] && GEARSETS[nm].fd,
      drive: vehicle.drive || (vehicle.fit && vehicle.fit.drive),
      peak: engine.score.peakHP,
    };
  }, name);
  await browser.close();
  return { r, errors };
})();

console.log('== page:', JSON.stringify(page.r), '==');
if (page.errors.length) fails.push('pageerror: ' + page.errors.join('; '));
if (!page.r.ok) fails.push(page.r.why || 'preset missing');
if (page.r.no !== 101) fails.push('CAR_NO expected 101, got ' + page.r.no);
if (!page.r.art) fails.push('CAR_ART missing');
if (!page.r.gears || page.r.fd !== 4.111) fails.push('gearset missing or wrong fd');

if (fails.length) {
  console.error('FAIL');
  for (const f of fails) console.error('-', f);
  process.exit(1);
}
console.log('OK R32 GT-R import');
process.exit(0);
