// The live cutaway's head, timed by the model (build 164).
//
// WHY THIS EXISTS. The cutaway's valves opened at fixed angles (intake 20 BTDC to 50 ABDC on every cam) and its
// spark fired at 340 degrees on every engine. Now the head is drawn from the model: valve events from the cam's
// duration and lobe separation with the phaser where the fill table puts it, lift from the cam's L/D on the
// model's valve, the spark at the model's advance and the flame over the Wiebe burn the model's work uses.
// What must hold:
//   · the drawn events are the breathing model's: IVC is ivcAbdc at the phaser's advance, a stock cam has the
//     slightly negative overlap the model gives it, a race cam far more, and VVT moves the intake events;
//   · a valve is at full lift at its lobe's centreline and shut outside its window;
//   · the spark fires at the model's advance, not at a fixed angle, and the burned share follows the Wiebe burn;
//   · two-valve presets draw pushrods, four-valve ones overhead cams;
//   · past the valve-float speed the valves are drawn floating;
//   · every engine preset draws at every quarter of its cycle without an error.
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

const r = await page.evaluate(() => {
  const out = {};
  const load = (nm, patch) => { const p = PRESETS.find(p => p.name.includes(nm));
    applyEngineToForm(Object.assign({}, DEFAULT_ENGINE, p.engine, patch || {})); buildEngine(); setTab('engine'); };
  // draw one frame with the crank at a drawing angle (0 = TDC starting the intake stroke), running at rpm
  const at = (deg, rpm, extra) => { state.rpm = rpm; state.throttle = 1; state.map = 1 + (engine.intake === 'na' ? 0 : boostTarget(rpm));
    state.powerHP = 100; state.torque = 100; state.fuelCut = false; state.blown = false; state.knockRisk = 0;
    if (extra) extra(); crankAngle = deg * Math.PI / 180; drawEngine(0); return Object.assign({}, drawPistonCutaway.dbg); };
  // 1. events: the breathing model's
  out.cams = {};
  for (const cam of ['stock', 'sport', 'race']) {
    load('1.6 Sport NA', { cam, vvt: false });
    const ev = valveEvents(3000);
    out.cams[cam] = { overlap: ev.overlap, ivcAbdc: ev.ivc - 180, model: ivcAbdc(engine.camDur, engine.camLSA, 0), ivoBtdc: -ev.ivo, evcAtdc: ev.evc - 720 };
  }
  load('1.6 Sport NA', { vvt: true });
  const rpmV = engine.fillTable.reduce((a, b) => (b.adv > a.adv ? b : a)).rpm;   // where the phaser advances most
  const evV = valveEvents(rpmV);
  out.vvt = { rpm: rpmV, adv: evV.adv, ivc: evV.ivc - 180, model: ivcAt(rpmV) };
  // 2. lift: full at the centreline, shut outside the window
  load('1.6 Sport NA', { vvt: false });
  const ev = valveEvents(3000), clIn = (ev.ivo + ev.ivc) / 2, clEx = (ev.evo + ev.evc) / 2;
  out.liftCl = { in: at(wrap720(clIn), 3000).lifts.lIn, ex: at(wrap720(clEx), 3000).lifts.lEx };
  out.liftShut = { in: at(wrap720(ev.ivc + 20), 3000).lifts.lIn, ex: at(wrap720(ev.evc + 20), 3000).lifts.lEx };
  // 3. the spark at the model's advance, and the burn
  load('3.0 Turbo I6 (2JZ)');
  const rpmS = 4000; state.rpm = rpmS; const adv = activeAdvance(rpmS, 1 + boostTarget(rpmS));
  out.spark = { adv, before: at(360 - adv - 3, rpmS).sparkNow, after: at(360 - adv + 2, rpmS).sparkNow };
  out.burnHalf = at(360 - adv + SI_BURN_DEG / 2, rpmS).xb;
  out.wiebeHalf = 1 - Math.exp(-WIEBE_A * Math.pow(0.5, WIEBE_M + 1));
  load('1.6 Sport NA'); const adv2 = activeAdvance(3000, 1);
  out.spark2 = { adv: adv2, fires: at(360 - adv2 + 2, 3000).sparkNow };
  // 4. valvetrains
  load('6.2 Supercharged V8'); out.v8 = at(100, 3000).valvetrain;
  load('1.6 Sport NA'); out.i4 = at(100, 3000).valvetrain;
  // 5. float: past the model's float speed
  load('6.2 Supercharged V8', { valveSpring: 'stock' });
  out.floatRpm = engine.floatRpm;
  out.floatAbove = at(100, engine.floatRpm * 1.05).float; out.floatBelow = at(100, engine.floatRpm * 0.9).float;
  // 6. every preset, at every quarter of its cycle
  out.drawErr = [];
  for (const p of PRESETS) {
    try { applyEngineToForm(Object.assign({}, DEFAULT_ENGINE, p.engine)); buildEngine(); setTab('engine');
      for (const deg of [0, 90, 180, 270, 345, 360, 375, 450, 540, 630]) at(deg, engine.redline * 0.6, () => { state.knockRisk = 90; }); }
    catch (e) { out.drawErr.push(p.name + ': ' + e.message); }
  }
  return out;
});

console.log('== valve events (1.6 NA, no VVT) ==');
for (const [cam, c] of Object.entries(r.cams))
  console.log(`  ${cam.padEnd(5)} IVO ${c.ivoBtdc.toFixed(0)} BTDC, IVC ${c.ivcAbdc.toFixed(0)} ABDC (model ${c.model.toFixed(0)}), EVC ${c.evcAtdc.toFixed(0)} ATDC, overlap ${c.overlap.toFixed(0)} deg`);
for (const [cam, c] of Object.entries(r.cams)) if (Math.abs(c.ivcAbdc - c.model) > 0.01) fails.push(`${cam}: the drawn IVC is not the breathing model's`);
if (!(r.cams.stock.overlap < 0 && r.cams.race.overlap > r.cams.sport.overlap && r.cams.sport.overlap > 0)) fails.push('the overlap does not run negative (stock) to large (race) as the model has it');
console.log(`  VVT: at ${r.vvt.rpm} rpm the phaser advances ${r.vvt.adv.toFixed(0)} deg: IVC ${r.vvt.ivc.toFixed(0)} ABDC (model ${r.vvt.model.toFixed(0)})`);
if (!(r.vvt.adv > 0 && Math.abs(r.vvt.ivc - r.vvt.model) < 0.01)) fails.push('the drawn intake events do not follow the phaser where the fill table puts it');

console.log('\n== lift ==');
console.log(`  at the centrelines: intake ${r.liftCl.in.toFixed(3)}, exhaust ${r.liftCl.ex.toFixed(3)}; 20 deg after closing: ${r.liftShut.in.toFixed(3)}, ${r.liftShut.ex.toFixed(3)}`);
if (!(r.liftCl.in > 0.99 && r.liftCl.ex > 0.99)) fails.push('a valve is not at full lift at its lobe centreline');
if (!(r.liftShut.in === 0 && r.liftShut.ex === 0)) fails.push('a valve is open outside its window');

console.log('\n== spark and burn ==');
console.log(`  2JZ at 4000 rpm: advance ${r.spark.adv.toFixed(1)} deg; 3 deg before it the plug is ${r.spark.before ? 'FIRING' : 'dark'}, 2 deg after ${r.spark.after ? 'firing' : 'DARK'}`);
console.log(`  halfway through the burn: ${(r.burnHalf * 100).toFixed(1)}% burned (Wiebe ${(r.wiebeHalf * 100).toFixed(1)}%); 1.6 NA advance ${r.spark2.adv.toFixed(1)}: ${r.spark2.fires ? 'fires' : 'DOES NOT FIRE'} there`);
if (r.spark.before || !r.spark.after || !r.spark2.fires) fails.push('the spark does not fire at the model\'s advance');
if (Math.abs(r.spark.adv - r.spark2.adv) < 0.5) fails.push('two different engines fire at the same advance (the check needs them apart)');
if (Math.abs(r.burnHalf - r.wiebeHalf) > 1e-6) fails.push('the burned share is not the Wiebe burn the model uses');

console.log('\n== valvetrain and float ==');
console.log(`  6.2 V8 (2 valves): ${r.v8}; 1.6 I4 (4 valves): ${r.i4}; V8 on stock springs floats at ${Math.round(r.floatRpm)} rpm: drawn floating above it ${r.floatAbove}, below it ${r.floatBelow}`);
if (r.v8 !== 'OHV' || !/^DOHC/.test(r.i4)) fails.push('the valvetrain is not drawn as the valve count says');
if (!r.floatAbove || r.floatBelow) fails.push('valve float is not drawn exactly past the model\'s float speed');

console.log(`\n== every preset draws round its cycle: ${r.drawErr.length ? r.drawErr.length + ' failed' : 'yes'} ==`);
fails.push(...r.drawErr);
if (errors.length) fails.push(...errors);
await browser.close();
if (fails.length) { console.log('\nFAIL:\n  ' + fails.join('\n  ')); process.exit(1); }
console.log('\nPASS');
