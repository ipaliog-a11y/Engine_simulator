// The live cutaway's turbo and supercharger, drawn as they are built (build 164).
//
// WHY THIS EXISTS. The boosters were a circle with six spokes hung off the intake pipe: a turbo had no
// turbine and no exhaust reaching it, it spun with the manifold pressure, and a supercharger was the same
// circle in yellow. Now a turbo is two snail housings on one shaft, fed by the manifold and turned by the
// shaft speed the spool model integrates; a supercharger is belted to the crank. What must hold:
//   · the scrolls run the right way: a compressor's passage widens round the wheel to an outlet leaving
//     along the tangent, a turbine's narrows from its inlet, and on one shaft both wheels turn the same way;
//   · the turbo turns with the model's shaft speed, not with the manifold pressure;
//   · the wastegate shows what the model does: open holding the target, shut while spooling or lifted;
//     a variable-geometry turbo has no gate, and its vanes open with the model's own schedule;
//   · a Roots or screw blower turns with the crank at its drive ratio;
//   · the charge pipe's temperatures are the model's (the same compressor rise the intake temperature takes);
//   · every engine preset draws, at full throttle and closed, without an error.
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
  // 1. scroll geometry, on an off-screen pass (the canvas is drawn to and redrawn by the next frame)
  const px = x => x, py = y => y, LW = n => n;
  out.compEnd = vizScroll(px, py, 1, LW, 100, 100, 14, 8, 1, 0, 12, '#000', '#000');
  out.turbEnd = vizScroll(px, py, 1, LW, 100, 100, 15, 8, -1, 0, 16, '#000', '#000');
  // 2. the turbo turns with the shaft speed
  load('3.0 Turbo I6 (2JZ)');
  const spin = E => { state.shaftE = E; state.throttle = 1; const a0 = turboAngle; drawEngine(0.01); return ((turboAngle - a0) + 2 * Math.PI) % (2 * Math.PI); };
  const Emax = 0.5 * engine.shaftJ * Math.pow(engine.shaftMax * 2 * Math.PI / 60, 2);
  out.spinSlow = spin(Emax * 0.04); out.spinFast = spin(Emax * 0.81);
  // the same shaft speed at two manifold pressures turns it the same
  state.boostActual = 0.1; const sA = spin(Emax * 0.25); state.boostActual = 0.9; const sB = spin(Emax * 0.25);
  out.spinMapIndep = Math.abs(sA - sB) < 1e-9;
  // 3. the wastegate: open at target under throttle, shut lifted and while spooling
  const gateAt = (b, thr) => { state.rpm = 5000; state.throttle = thr; state.boostActual = b; drawEngine(0.001); return drawTurbo.gate; };
  out.target = boostTarget(5000);
  out.gateHolding = gateAt(out.target, 1); out.gateSpooling = gateAt(out.target * 0.5, 1); out.gateLifted = gateAt(out.target, 0.05);
  // 4. the charge temperatures: the compressor's outlet is what effIAT starts from
  const m = 1 + out.target;
  out.tOut = compOutletT(m, 5000); out.tIn = effIAT(m, 5000);
  const ic = engine.icEff; state.iat = 20;
  // 5. VGT: no gate, vanes from the model's schedule, more open at the top than low down
  load('2.0 Turbo Diesel I4');
  const vane = rpm => { state.rpm = rpm; state.throttle = 1; state.boostActual = boostTarget(rpm); state.map = 1 + state.boostActual; drawEngine(0.001); return { f: drawTurbo.vane, gate: drawTurbo.gate }; };
  out.vgtLow = vane(1200); out.vgtHigh = vane(engine.redline * 0.95);
  // 6. a Roots blower turns with the crank at its drive ratio
  load('6.2 Supercharged V8');
  state.rpm = 3000; state.throttle = 1;
  const c0 = crankAngle, s0 = scAngle; drawEngine(0.02);
  const dc = ((crankAngle - c0) + 4 * Math.PI) % (4 * Math.PI), ds = scAngle - s0;
  out.scRatio = ds / dc; out.scDrive = SC_SOUND.roots.drive;
  // 7. every preset draws, flat out and closed
  out.drawErr = [];
  for (const p of PRESETS) {
    try { applyEngineToForm(Object.assign({}, DEFAULT_ENGINE, p.engine)); buildEngine(); setTab('engine');
      for (const thr of [1, 0.02]) { state.throttle = thr; state.rpm = engine.redline * 0.7; state.boostActual = thr > 0.5 ? boostTarget(state.rpm) : 0.3; drawEngine(0.016); } }
    catch (e) { out.drawErr.push(p.name + ': ' + e.message); }
  }
  return out;
});

console.log('== scroll geometry ==');
console.log(`  compressor duct ends at (${r.compEnd.map(v => v.toFixed(0))}), turbine duct at (${r.turbEnd.map(v => v.toFixed(0))}), wheel centre (100,100)`);
// tongue on the right: turning clockwise on screen, the compressor's air leaves downward, the turbine's gas
// arrives from above
if (!(r.compEnd[1] > 110 && r.compEnd[0] > 110)) fails.push('the compressor scroll does not leave along the tangent in the direction the wheel turns');
if (!(r.turbEnd[1] < 90 && r.turbEnd[0] > 110)) fails.push('the turbine scroll is not fed against the direction it narrows');

console.log('\n== the turbo turns with its shaft ==');
console.log(`  per frame: ${r.spinSlow.toFixed(3)} rad at 20% of the shaft limit, ${r.spinFast.toFixed(3)} at 90%; same shaft speed at 0.1 and 0.9 bar: ${r.spinMapIndep ? 'same' : 'different'}`);
if (!(r.spinFast > r.spinSlow * 3)) fails.push('a turbo near its shaft limit does not turn much faster than one barely turning');
if (!r.spinMapIndep) fails.push('the turbo still turns with the manifold pressure, not the shaft');

console.log('\n== wastegate ==');
console.log(`  2JZ target +${r.target.toFixed(2)} bar: holding it ${r.gateHolding ? 'OPEN' : 'shut'}, at half of it ${r.gateSpooling ? 'OPEN' : 'shut'}, lifted ${r.gateLifted ? 'OPEN' : 'shut'}`);
if (!(r.gateHolding && !r.gateSpooling && !r.gateLifted)) fails.push('the wastegate does not open only while the model holds its target');

console.log('\n== charge temperatures ==');
console.log(`  compressor out ${r.tOut.toFixed(0)} C, after the intercooler ${r.tIn.toFixed(0)} C`);
if (!(r.tOut > r.tIn + 30)) fails.push('the compressor outlet is not well above the charge after the intercooler');

console.log('\n== variable geometry ==');
console.log(`  2.0 TDI: vanes ${(r.vgtLow.f * 100).toFixed(0)}% open at 1200 rpm, ${(r.vgtHigh.f * 100).toFixed(0)}% near the limiter; gate ${r.vgtLow.gate || r.vgtHigh.gate ? 'drawn' : 'none'}`);
if (r.vgtLow.gate || r.vgtHigh.gate) fails.push('a variable-geometry turbo shows a wastegate');
if (!(r.vgtLow.f >= 0 && r.vgtLow.f < 0.6 && r.vgtHigh.f <= 1 && r.vgtHigh.f > r.vgtLow.f + 0.3)) fails.push('the vanes do not open towards the top end');

console.log('\n== supercharger ==');
console.log(`  Roots: ${r.scRatio.toFixed(3)} rotor turns per crank turn on screen (drive ${r.scDrive})`);
if (!(Math.abs(r.scRatio - r.scDrive) < 0.01)) fails.push('the Roots blower does not turn with the crank at its drive ratio');

console.log(`\n== every preset draws: ${r.drawErr.length ? r.drawErr.length + ' failed' : 'yes'} ==`);
fails.push(...r.drawErr);

if (errors.length) fails.push(...errors);
await browser.close();
if (fails.length) { console.log('\nFAIL:\n  ' + fails.join('\n  ')); process.exit(1); }
console.log('\nPASS');
