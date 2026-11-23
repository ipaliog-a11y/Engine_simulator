// Challenges: AWD power-over on the S-route powerslide (build 379).
//
// WHY THIS EXISTS. AWD takes the RWD power-over path; whether the rear slides is up to the centre coupling stepCar
// models. What must hold:
//   · a single-speed AWD car (Tesla Model Y) drives the course: it was put in gear 2, which it lacks, and STALLed;
//     it now CLEARs on power-over;
//   · the result names the AWD centre coupling (type and front share), null for a two-wheel-drive car;
//   · the 993 Turbo (viscous coupling, rear driven) does not CLEAR: the coupling sends torque forward as the rear slips;
//   · the DRIVE cell shows the coupling and split, with no page errors and no horizontal scroll at phone width.
import { chromium } from './pw.mjs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const repo = fileURLToPath(new URL('..', import.meta.url));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = [], fails = [];
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
await page.goto(pathToFileURL(path.join(repo, 'index.html')).href, { waitUntil: 'networkidle' });
const r = await page.evaluate(() => {
  const load = n => loadVehiclePreset(FACTORY_CARS.find(p => p.name.startsWith(n)));
  const pick = R => ({ outcome: R.outcome, init: R.init, b1: R.beta1, b2: R.beta2, centre: R.centre, drive: R.drive });
  const out = {};
  load('Tesla Model Y'); out.modelY = pick(simulateDriftChallenge());
  load('Porsche 911 Turbo (993'); out.p993 = pick(simulateDriftChallenge());
  load('Subaru Impreza WRX STI'); out.sti = pick(simulateDriftChallenge());
  vehicle.awdMode = 'sport'; out.stiSport = driveCar().centre;
  load('Mitsubishi Lancer Evolution IX'); out.evo = pick(simulateDriftChallenge());
  load('Mazda MX-5'); out.mx5 = pick(simulateDriftChallenge());
  // Pre-run TC / ESP / AWD DIFF selectors across Track, Race, and Challenges (build 440)
  out.toggles = ['trkTc', 'trkEsp', 'trkAwdMode', 'raceTc', 'raceEsp', 'raceAwdMode', 'chalTc', 'chalEsp', 'chalAwdMode']
    .every(id => !!document.getElementById(id));
  load('Tesla Model Y'); setTab('challenges');
  const sel = document.getElementById('chalSel'); sel.value = 'drift-s'; sel.dispatchEvent(new Event('change'));
  out.awdShown = document.getElementById('chalAwdMode').closest('.field').style.display !== 'none';
  out.driftAidsDefaultOff = document.getElementById('chalTc').value === 'off' && document.getElementById('chalEsp').value === 'off';
  const btn = document.getElementById('btnChalSolve'); if (btn) btn.click();
  out.grid = document.getElementById('chalGrid') ? document.getElementById('chalGrid').textContent : document.body.textContent;
  out.scroll = document.documentElement.scrollWidth > window.innerWidth + 1;
  return out;
});
await browser.close();
console.log('Model Y', r.modelY); console.log('993 Turbo', r.p993); console.log('STI', r.sti, 'sport', r.stiSport); console.log('Evo IX', r.evo); console.log('MX-5', r.mx5);
if (r.modelY.outcome !== 'CLEAR') fails.push('Model Y expected CLEAR, got ' + r.modelY.outcome);
if (!r.modelY.centre || r.modelY.centre.type !== 'lock' || r.modelY.centre.f !== 0.5) fails.push('Model Y centre ' + JSON.stringify(r.modelY.centre));
if (!r.p993.centre || r.p993.centre.type !== 'visc' || r.p993.centre.f !== 0) fails.push('993 centre ' + JSON.stringify(r.p993.centre));
if (r.p993.outcome === 'CLEAR') fails.push('993 Turbo CLEARed: the viscous coupling should hold the rear');
if (r.sti.outcome !== 'CLEAR' || r.evo.outcome !== 'CLEAR') fails.push('STI/Evo IX expected CLEAR: STI ' + r.sti.outcome + ', Evo ' + r.evo.outcome);
if (!r.stiSport || r.stiSport.type !== 'fric' || Math.abs(r.stiSport.f - 0.30) > 0.01) fails.push('AWD SPORT mode centre ' + JSON.stringify(r.stiSport));
if (r.mx5.centre !== null) fails.push('MX-5 (RWD) has a centre: ' + JSON.stringify(r.mx5.centre));
if (!r.toggles) fails.push('missing TC/ESP/AWD DIFF toggles on Track/Race/Challenges');
if (!r.awdShown) fails.push('chalAwdMode hidden on AWD car');
if (!r.driftAidsDefaultOff) fails.push('powerslide TC/ESP did not default off');
if (!/CLUTCH 50:50/.test(r.grid)) fails.push('DRIVE cell lacks the coupling: ' + r.grid.slice(0, 200));
if (r.scroll) fails.push('horizontal scroll at phone width');
fails.push(...errors);
if (fails.length) { console.log('FAIL\n  ' + fails.join('\n  ')); process.exit(1); }
console.log('PASS');
