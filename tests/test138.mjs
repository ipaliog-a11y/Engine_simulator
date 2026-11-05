// Regeneration on an electric car (plans/hybrid-electric/drivetrain.md, stage 2).
//
// WHY THIS EXISTS. An electric car always regenerated at whatever the motor and the pack could take back.
// REGENERATION is now HIGH, LOW or OFF, the same three steps a hybrid already has. What must hold:
//   · HIGH is the default and matches a table with no setting: the locked Model Y consumption, and the
//     torque the table gives at 500 rpm and above;
//   · LOW is half of HIGH at every point, OFF is nothing, and the table still starts at 500 rpm;
//   · OFF raises the Model Y's Wh/km by more than 15%, and LOW sits between OFF and HIGH;
//   · on a lap, less regeneration puts more heat in the brakes and puts less energy back;
//   · a build with no evRegen key still reads as HIGH.
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
  loadVehiclePreset(EV_VEHICLE_PRESETS.find(p => /Model Y/.test(p.name)));
  const bare = evRegenTable(Object.assign({}, engine, { evRegen: undefined }), engine.redline);
  const at = k => { document.getElementById('evRegen').value = k; buildEngine(); engine._cycle = null; return evCycle(engine, vehicle); };
  const high = at('high'), low = at('low'), off = at('off');
  const table = k => { document.getElementById('evRegen').value = k; buildEngine(); return evRegenTable(engine, engine.redline); };
  const tH = table('high'), tL = table('low'), tO = table('off');
  const lapOf = k => {
    document.getElementById('evRegen').value = k; buildEngine();
    for (const name of Object.keys(TRACKS)) if (TRACKS[name] && TRACKS[name].lines) TRACKS[name].lines = {};
    const L = simulateLap('tech');
    return { regen: L.ev.regenKWh, rotor: Math.max(...L.replay.tF) };
  };
  const lapH = lapOf('high'), lapL = lapOf('low'), lapO = lapOf('off');
  const old = Object.assign({}, engine); delete old.evRegen; applyElectricToForm(old);
  return {
    wh: { high: high.whkm, low: low.whkm, off: off.whkm },
    back: { high: high.regen, low: low.regen, off: off.regen },
    t0: { bare: bare[0], high: tH[0], low: tL[0], off: tO[0] },
    half: tL.every((x, i) => Math.abs(x - tH[i] * 0.5) < 1e-6) && tO.every(x => x === 0) && tH.length === tL.length,
    lap: { high: lapH, low: lapL, off: lapO },
    old: document.getElementById('evRegen').value
  };
});
const f = (x, d = 1) => (+x).toFixed(d);
console.log(`== Model Y Wh/km: HIGH ${f(r.wh.high)} (regen ${f(r.back.high)}), LOW ${f(r.wh.low)} (${f(r.back.low)}), OFF ${f(r.wh.off)} (${f(r.back.off)}) ==`);
console.log(`== table at 500 rpm: unset ${f(r.t0.bare, 0)} Nm, HIGH ${f(r.t0.high, 0)}, LOW ${f(r.t0.low, 0)}, OFF ${f(r.t0.off, 0)}; half everywhere ${r.half} ==`);
console.log(`== tech lap: regen ${f(r.lap.high.regen, 3)} / ${f(r.lap.low.regen, 3)} / ${f(r.lap.off.regen, 3)} kWh, front rotor ${f(r.lap.high.rotor, 0)} / ${f(r.lap.low.rotor, 0)} / ${f(r.lap.off.rotor, 0)} °C; old save ${r.old} ==`);
if (Math.abs(r.t0.bare - r.t0.high) > 1e-6) fails.push('HIGH is not the table a build with no setting gives');
if (!(r.t0.high > 1)) fails.push('the regeneration table is empty at 500 rpm');
if (!r.half) fails.push('LOW is not half of HIGH, or OFF is not zero, at every point');
if (!(r.wh.off > r.wh.high * 1.15)) fails.push(`OFF is ${f(r.wh.off)} Wh/km against HIGH ${f(r.wh.high)}: not more than 15%`);
// The WLTP stops ask for less than half this motor, so LOW barely moves the cycle. The lap is where half shows.
if (!(r.wh.low < r.wh.off && r.wh.low + 1 >= r.wh.high)) fails.push('LOW is not between HIGH and OFF on the cycle');
if (!(r.back.low <= r.back.high + 0.05 && r.back.off < 0.5)) fails.push('the cycle does not give regeneration back in that order');
if (!(r.lap.low.regen < r.lap.high.regen * 0.7 && r.lap.low.regen > r.lap.high.regen * 0.3 && r.lap.off.regen < 0.01)) fails.push('on a lap LOW is not about half of HIGH');
if (!(r.lap.off.rotor > r.lap.high.rotor && r.lap.low.rotor > r.lap.high.rotor && r.lap.off.rotor >= r.lap.low.rotor)) fails.push('the brakes do not run hotter as regeneration is turned down');
if (r.old !== 'high') fails.push('a build with no evRegen key does not come back as HIGH');

if (errors.length) console.log('ERRORS:\n  ' + errors.join('\n  '));
if (fails.length || errors.length) {
  console.log('\nFAIL:\n  ' + fails.concat(errors).join('\n  '));
  process.exit(1);
}
console.log('\nOK: HIGH is today\'s regeneration, LOW is half, OFF is none, and the brakes take what the motor no longer does.');
await browser.close();
