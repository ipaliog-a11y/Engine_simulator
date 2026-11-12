// Stalling and starting (build 265).
//
// WHY THIS EXISTS. The bench held the engine at its idle speed whatever happened, so it could not stop, and the
// STARTER and POWER OFF buttons did nothing on a combustion engine. A driving game needs an engine that stalls.
// What must hold:
//   · left alone the engine idles as before, burning fuel, and the idle valve brings it back from a dip;
//   · POWER OFF: the burning stops at once, the engine coasts down to rest on its own friction, no fuel flows, the
//     battery is not drained, and the status line says it is stopped;
//   · STARTER: it cranks on the battery, fires once past the firing speed and settles at idle; the crank costs charge;
//   · a flat battery cannot crank it; a blown engine does not start;
//   · the stepped car stalls when the clutch is dumped in a high gear at idle, restarts on its starter with the clutch
//     down, and bump-starts when rolling; the automatic clutch never stalls it;
//   · the buttons work from the page; no page errors.
import { chromium } from './pw.mjs';
import { fileURLToPath, pathToFileURL } from 'url';
import path from 'path';
const repo = fileURLToPath(new URL('..', import.meta.url));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors = [], fails = [];
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
await page.goto(pathToFileURL(path.join(repo, 'index.html')).href, { waitUntil: 'networkidle' });
await page.waitForTimeout(300);

const R = await page.evaluate(() => {
  const run = t => { for (let i = 0; i < t / 0.01; i++) { stepThermal(0.01); stepEngine(0.01); stepElectrical(0.01); updatePhysics(); stepWear(0.01); } };
  const snap = () => ({ rpm: state.rpm, firing: state.firing, fuel: state.fuelFlowLph, soc: state.batterySOC, health: state.engineHealth });
  const o = { idle: engine.idleRpmEff, fire: FIRE_RPM };
  state.throttle = 0; state.load = 0; run(4); o.running = snap();
  state.rpm = 500; run(2); o.dip = snap();
  engineOff(); run(0.05); o.justOff = snap(); let t = 0; while (state.rpm > 0 && t < 20) { run(0.05); t += 0.05; } o.coast = t;
  const soc0 = state.batterySOC; run(5); o.off = snap(); o.offDrain = soc0 - state.batterySOC;
  engineStart(); let peakCrank = 0; t = 0; while (!state.firing && t < 5) { run(0.02); t += 0.02; peakCrank = Math.max(peakCrank, state.rpm); } o.fireT = t; o.crankCost = soc0 - state.batterySOC;
  run(4); o.restarted = snap();
  engineOff(); run(3); state.batterySOC = 0.05; engineStart(); run(4); o.flat = snap();
  state.batterySOC = 1; state.blown = true; engineStart(); run(4); o.blown = snap(); state.blown = false;
  engineStart(); run(4);
  // ---- the stepped car
  loadVehiclePreset(VEHICLE_PRESETS.find(x => x.name.startsWith('Mazda MX-5')));
  const car = driveCar(); let s = driveState(car);
  for (let i = 0; i < 100; i++) stepCar(car, s, { clutch: 1, gear: 4 }, 0.01);
  for (let i = 0; i < 200; i++) stepCar(car, s, { clutch: 0, gear: 4 }, 0.01);            // dumped in fourth at idle
  o.dump = { rpm: s.rpm, firing: s.firing, v: s.vx };
  for (let i = 0; i < 150; i++) stepCar(car, s, { clutch: 1, gear: 1, starter: true }, 0.01);
  o.restart = { rpm: s.rpm, firing: s.firing };
  s = driveState(car); s.firing = false; s.we = 0; s.vx = 8; s.w = s.w.map(() => 8 / car.r);     // rolling at 29 km/h, engine dead
  for (let i = 0; i < 150; i++) stepCar(car, s, { clutch: i < 30 ? 1 : 0, gear: 2 }, 0.01);
  o.bump = { rpm: s.rpm, firing: s.firing };
  s = driveState(car); let low = 1e9; for (let i = 0; i < 600; i++) { stepCar(car, s, { throttle: i < 300 ? 0.3 : 0, brake: i > 400 ? 1 : 0 }, 0.01); low = Math.min(low, s.rpm); }
  o.auto = { firing: s.firing, low };
  return o;
});
// the buttons
await page.evaluate(() => setTab('engine'));
await page.click('#btnPowerOff'); await page.waitForTimeout(1500);
const offRpm = await page.evaluate(() => state.rpm);
await page.click('#btnStarter'); await page.waitForTimeout(2500);
const onState = await page.evaluate(() => ({ rpm: state.rpm, firing: state.firing }));
await browser.close();

const f = x => Math.round(x);
console.log(`idle ${R.idle} rpm; running ${f(R.running.rpm)} rpm, ${R.running.fuel.toFixed(2)} L/h; from a dip to 500: ${f(R.dip.rpm)} rpm`);
console.log(`power off: firing ${R.justOff.firing}, at rest after ${R.coast.toFixed(2)} s, fuel ${R.off.fuel}, battery drained ${(R.offDrain * 100).toFixed(3)}% in 5 s`);
console.log(`starter: fires after ${R.fireT.toFixed(2)} s for ${(R.crankCost * 100).toFixed(3)}% of the battery, then ${f(R.restarted.rpm)} rpm`);
console.log(`flat battery: ${f(R.flat.rpm)} rpm, firing ${R.flat.firing}; blown engine: firing ${R.blown.firing}`);
console.log(`stepped car: clutch dumped in 4th -> ${f(R.dump.rpm)} rpm, firing ${R.dump.firing}; starter -> ${f(R.restart.rpm)} rpm, firing ${R.restart.firing}; bump start -> firing ${R.bump.firing}; automatic clutch lowest ${f(R.auto.low)} rpm`);
console.log(`buttons: POWER OFF -> ${f(offRpm)} rpm; STARTER -> ${f(onState.rpm)} rpm, firing ${onState.firing}`);
if (!R.running.firing || R.running.rpm < R.idle - 5 || !(R.running.fuel > 0)) fails.push('the engine does not idle when left alone');
if (R.dip.rpm < R.idle - 20) fails.push(`the idle valve did not bring it back from 500 rpm (${f(R.dip.rpm)})`);
if (R.justOff.firing || R.off.rpm !== 0 || R.off.fuel !== 0) fails.push('POWER OFF did not stop the engine and its fuel');
if (!(R.coast > 0.2 && R.coast < 8)) fails.push(`coast-down took ${R.coast.toFixed(2)} s`);
if (Math.abs(R.offDrain) > 1e-9) fails.push('the battery drains with everything switched off');
if (!(R.fireT > 0.05 && R.fireT < 3) || !R.restarted.firing || R.restarted.rpm < R.idle - 5) fails.push('the starter did not bring it back to idle');
if (!(R.crankCost > 0)) fails.push('cranking cost no charge');
if (R.flat.firing || R.flat.rpm > 1) fails.push('a flat battery cranked the engine');
if (R.blown.firing) fails.push('a blown engine started');
if (R.dump.firing || R.dump.rpm > R.fire) fails.push('dumping the clutch in fourth at idle did not stall it');
if (!R.restart.firing) fails.push('the stepped car did not restart on its starter');
if (!R.bump.firing) fails.push('no bump start');
if (!R.auto.firing) fails.push('the automatic clutch let it stall');
if (offRpm > 1 || !onState.firing) fails.push('the buttons do not stop and start the engine');
if (errors.length) fails.push(...errors);
if (fails.length) { console.log('\nFAIL\n' + fails.map(x => '  - ' + x).join('\n')); process.exit(1); }
console.log('\nPASS');
