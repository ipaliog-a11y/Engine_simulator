import { chromium } from './pw.mjs';
const repo = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1120, height: 1000 } });
const errors = [];
page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
await page.goto(`file://${repo}/index.html`, { waitUntil: 'networkidle' });
await page.waitForTimeout(300);

const result = await page.evaluate(() => {
  // Build a turbo engine + vehicle
  applyEngineToForm(Object.assign({}, DEFAULT_ENGINE, { cylinders: 6, bore_mm: 84, stroke_mm: 90, intake: 'turbo', boost_bar: 1.0, turboSize: 'medium', cam: 'sport', nitrous: 'large' }));
  buildEngine();
  applyVehicleToForm(Object.assign({}, DEFAULT_VEHICLE, { chassis: 'coupe', drive: 'rwd', tireType: 'sport' }));
  buildVehicle();
  const base = { t100: perf.t100, top: Math.round(perf.topSpeed), q400: perf.q400.t };

  // Now corrupt the LIVE driving state as if the engine had been idled/abused/tuned badly
  const savedHealth = 0.42;
  state.throttle = 0; state.systemVoltage = 10.6; state.batterySOC = 0.15;
  state.engineHealth = savedHealth; state.blown = false;
  state.coolant = 120; state.oil = 40; state.iat = 55; state.afr = 17.5;
  state.nitrousActive = true; state.nitrousCharge = 1;

  // Recompute the vehicle performance
  buildVehicle();
  const after = { t100: perf.t100, top: Math.round(perf.topSpeed), q400: perf.q400.t };

  return {
    base, after,
    identical: base.t100 === after.t100 && base.top === after.top && base.q400 === after.q400,
    healthAfter: state.engineHealth,   // must still be 0.42, NOT healed to 1
    voltageAfter: state.systemVoltage, // must still be 10.6
    afrAfter: state.afr,               // must still be 17.5
    nitrousAfter: state.nitrousActive  // must still be true
  };
});

console.log('base perf: ', JSON.stringify(result.base));
console.log('after perf:', JSON.stringify(result.after));
console.log('IDENTICAL (throttle/temps/battery/nitrous independent):', result.identical);
console.log('live state preserved → health:', result.healthAfter, '(want 0.42)  voltage:', result.voltageAfter, '(want 10.6)  afr:', result.afrAfter, '(want 17.5)  nitrous:', result.nitrousAfter, '(want true)');

console.log('\nERRORS:', errors.length ? errors : 'none');
const ok = result.identical && result.healthAfter === 0.42 && result.voltageAfter === 10.6 && result.afrAfter === 17.5 && result.nitrousAfter === true && errors.length === 0;
console.log(ok ? '\nPASS' : '\nFAIL');
await browser.close();
process.exit(ok ? 0 : 1);
