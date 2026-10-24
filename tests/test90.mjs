// The live cutaway's tracts to scale, the header's wave, the compressor map (build 166).
//
// WHY THIS EXISTS. The intake was a straight pipe with a throttle and the exhaust a straight pipe ending in mid-air.
// Now the runner and the primaries are drawn at one scale (TRACT_MM), the intake carries its filter, throttle and
// plenum (or trumpets, or a carburettor) and a variable manifold's flap where the model's fill table puts it, the
// exhaust its collector, cat and silencer, and the blowdown pulse runs the primary and comes back as the header
// model times it; a turbo engine gets its compressor map. What must hold:
//   · the runner and the primary are drawn to the same scale as the model's lengths;
//   · the header's return is the model's own sizing: at its target speed and design temperature it lands
//     dur/2 + 90 after the exhaust valve opens, the angle deriveGas cut it for;
//   · SCAVENGING is shown only when the return lands with both valves open: never on a stock cam's negative
//     overlap, and on a race header and cam near its target speed;
//   · a variable manifold's flap follows the fill table's choice;
//   · the compressor map's operating line is the engine's steady boost, inside the map, flow rising with rpm;
//   · the flow density rises with the mass flow;
//   · every intake system and filter draws, on every preset, without an error.
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
  const frame = (rpm, m) => { state.rpm = rpm; state.throttle = 1; state.map = m || 1; state.powerHP = 100; state.blown = false; drawEngine(0); };
  // 1. to scale
  out.scale = {};
  for (const runner of ['short', 'medium', 'long']) {
    load('1.6 Sport NA', { runner }); frame(5000);
    const i = drawIntakeSide.dbg, x = drawExhaustSide.dbg;
    out.scale[runner] = { drawn: i.rPx * TRACT_MM, model: engine.runnerL * 1000 - 0.95 * engine.bore_mm, prim: x.primPx * TRACT_MM, primModel: engine.primL * 1000 };
  }
  // 2. the header's return at its design point
  out.design = [];
  for (const nm of ['1.6 Sport NA', 'F355', 'S2000', 'Huracán']) {
    load(nm);
    const ex = EXHAUST[engine.exhaust], tgt = ex.targetRpm || engine.redline * 0.9, T = exhaustGasT(1.0, tgt);
    if (ex.fixedL || engine.intake === 'turbo') continue;
    const ev = valveEvents(tgt), back = headerReturnAt(tgt, T), theta = engine.camDur / 2 + 90;
    const L = engine.primL, clamped = L <= 0.3501 || L >= 0.8999;
    out.design.push({ nm, k: engine.primK, after: wrap720(back - ev.evo), theta, clamped });
  }
  // 3. scavenging only with both valves open
  const scav = (nm, patch, rpm) => { load(nm, patch); frame(rpm); return drawExhaustSide.dbg.wave; };
  out.stock = [3000, 4500, 5200, 6000, 7000].map(n => scav('1.6 Sport NA', { cam: 'stock', vvt: false }, n));
  out.f355 = scav('F355', null, 8250);
  // 4. the variable flap
  load('Huracán');
  out.varTab = engine.fillTable.map(t => [t.rpm, t.L]);
  out.varDrawn = [3000, 8800].map(n => { frame(n); return { n, drawn: drawIntakeSide.dbg.rLnow, table: runnerLAt(n) }; });
  // 5. the compressor map
  load('3.0 Turbo I6 (2JZ)'); frame(5000, 1.9);
  out.map = { line: drawCompMap.line, boost: engine.boost_bar };
  // 6. density
  load('1.6 Sport NA');
  out.dens = [[1500, 0.5], [3000, 1], [6000, 1]].map(([n, m]) => { state.rpm = n; state.throttle = 1; return vizFlowFrac(m); });
  // 7. every intake system and filter on a few engines, and every preset as it is
  out.drawErr = [];
  for (const sys of Object.keys(INTAKE_SYS)) for (const airFilter of Object.keys(AIR_FILTER)) for (const nm of ['1.6 Sport NA', '1.3 Rotary NA', '3.0 Turbo I6 (2JZ)', '6.2 Supercharged V8'])
    try { load(nm, { intakeSys: sys, airFilter }); for (const deg of [0, 200, 500, 600]) { crankAngle = deg * Math.PI / 180; frame(engine.redline * 0.7, 1.2); } }
    catch (e) { out.drawErr.push(`${nm} ${sys}/${airFilter}: ${e.message}`); }
  for (const p of PRESETS) try { applyEngineToForm(Object.assign({}, DEFAULT_ENGINE, p.engine)); buildEngine(); setTab('engine'); frame(engine.redline * 0.8, 1); }
    catch (e) { out.drawErr.push(p.name + ': ' + e.message); }
  return out;
});

console.log('== to scale (1.6 NA) ==');
for (const [k, v] of Object.entries(r.scale)) console.log(`  ${k.padEnd(6)} runner drawn ${v.drawn.toFixed(0)} mm (model ${v.model.toFixed(0)}), primary drawn ${v.prim.toFixed(0)} mm (model ${v.primModel.toFixed(0)})`);
for (const [k, v] of Object.entries(r.scale)) {
  if (Math.abs(v.drawn - v.model) > 1) fails.push(`${k} runner drawn ${v.drawn.toFixed(0)} mm, the model's is ${v.model.toFixed(0)}`);
  if (Math.abs(v.prim - v.primModel) > 1) fails.push(`primary drawn ${v.prim.toFixed(0)} mm, the model's is ${v.primModel.toFixed(0)}`);
}
if (!(r.scale.long.drawn > 2 * r.scale.short.drawn)) fails.push('a long runner is not drawn much longer than a short one');

console.log('\n== the header\'s return at its design point ==');
for (const d of r.design) console.log(`  ${d.nm.padEnd(14)} ${d.k} round trips, back ${d.after.toFixed(1)} deg after EVO (cut for ${d.theta.toFixed(1)})${d.clamped ? ' [length at its limit]' : ''}`);
for (const d of r.design) if (!d.clamped && Math.abs(d.after - d.theta) > 0.5) fails.push(`${d.nm}: the drawn return lands ${d.after.toFixed(1)} deg after EVO, the header was cut for ${d.theta.toFixed(1)}`);
if (r.design.filter(d => !d.clamped).length < 2) fails.push('fewer than two headers checked at their design point');

console.log('\n== scavenging ==');
console.log('  1.6 on a stock cam: ' + r.stock.map(w => `${w.t}${w.ok ? ' SCAV' : ''}`).join(' | '));
console.log(`  F355 at 8250 rpm: ${r.f355.t}${r.f355.ok ? ' • SCAVENGING' : ''}`);
if (r.stock.some(w => w.ok)) fails.push('a stock cam with negative overlap is shown scavenging');
if (!r.f355.ok) fails.push('the F355 race header and cam near the limiter do not scavenge');

console.log('\n== variable intake (Huracán) ==');
console.log('  fill table: ' + r.varTab.filter((t, i) => i % 4 === 0).map(([n, L]) => `${n}:${Math.round(L * 1000)}`).join(' '));
console.log('  drawn: ' + r.varDrawn.map(v => `${v.n} rpm ${Math.round(v.drawn * 1000)} mm`).join(', '));
for (const v of r.varDrawn) if (v.drawn !== v.table) fails.push(`the flap at ${v.n} rpm is not the fill table's choice`);

console.log('\n== compressor map (2JZ) ==');
const ln = r.map.line;
console.log(`  operating line: ${ln.length} points, flow ${ln[0][0].toFixed(2)} -> ${ln[ln.length - 1][0].toFixed(2)} of choke, PR up to ${Math.max(...ln.map(p => p[1])).toFixed(2)} (boost ${r.map.boost})`);
if (!ln.every(([f, pr]) => f > 0 && pr >= 1 && pr <= 1 + r.map.boost + 0.01)) fails.push('the operating line leaves the map or exceeds the boost target');
if (!(ln[ln.length - 1][0] > ln[0][0] * 2)) fails.push('the operating line\'s flow does not rise with rpm');

console.log(`\n== flow density: ${r.dens.map(d => d.toFixed(2)).join(' < ')} ==`);
if (!(r.dens[0] < r.dens[1] && r.dens[1] < r.dens[2])) fails.push('the flow density does not rise with the mass flow');

console.log(`\n== every intake system, filter and preset draws: ${r.drawErr.length ? r.drawErr.length + ' failed' : 'yes'} ==`);
fails.push(...r.drawErr.slice(0, 10));
if (errors.length) fails.push(...errors);
await browser.close();
if (fails.length) { console.log('\nFAIL:\n  ' + fails.join('\n  ')); process.exit(1); }
console.log('\nPASS');
