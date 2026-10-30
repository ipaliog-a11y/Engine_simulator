// How the controller thinks: the lever diagram and the BSFC map (build 191, step 3.6b of plans/hybrid-electric/).
//
// WHY THIS EXISTS. The LIVE tab's hybrid panel gets two more views (src/js/hybrid-views.js): the power-split's lever
// (its nomograph: MG1, the engine and the ring as three bars, their speeds on one straight line) and the engine's BSFC
// map with its best line and the point the controller holds it at. What must hold:
//   · the lever is the planetary's: the carrier stands 1/(1+rho) of the way from the sun to the ring, and the three
//     speeds lie on one line (Willis) in every mode; with the engine stopped the line passes through zero and MG1 runs
//     backwards; only a power-split offers the view (a P2 falls back to the power flow);
//   · the map is the engine's own: its best figure is the best line's, no cell beats it, the cells above the full-load
//     curve are empty, and the best line lies under the full-load curve;
//   · load-point shifting shows: at a light pedal, CHARGE holds the engine at a lower BSFC than ENGINE ONLY (the
//     extra load the pack takes moves it towards the best line);
//   · the views draw, and the VIEW selector switches them.
import { chromium } from './pw.mjs';
import { fileURLToPath, pathToFileURL } from 'url';
import path from 'path';
const repo = fileURLToPath(new URL('..', import.meta.url));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1300, height: 1000 } });
const errors = [];
page.on('console', m => { if (m.type() === 'error' && !/ERR_FILE_NOT_FOUND/.test(m.text())) errors.push('console: ' + m.text()); });
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
await page.goto(pathToFileURL(path.join(repo, 'index.html')).href, { waitUntil: 'networkidle' });
await page.waitForTimeout(400);
const fails = [];

const r = await page.evaluate(() => {
  const step = s => { const dt = 1 / 60; for (let i = 0; i < s / dt; i++) { stepThermal(dt); stepEngine(dt); stepElectrical(dt); updatePhysics(); stepWear(dt); } };
  const lit = () => { const cv = document.getElementById('hyFlow'), d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data; let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i] + d[i + 1] + d[i + 2] > 120) n++; return n / (d.length / 4); };
  const o = {};
  // the Prius: the lever in three modes
  loadVehiclePreset(HYB_VEHICLE_PRESETS.find(x => /Prius/.test(x.name))); setTab('engine');
  let H = hybBenchState(); state.load = 0.5;
  o.lever = {};
  for (const m of ['auto', 'ev', 'charge', 'sport']) {
    H.mode = m; H.soc = 0.6; state.throttle = 0.5; step(5);
    const L = psLever(H); o.lever[m] = { ns: L.ns, ne: L.ne, nr: L.nr, xc: L.xc, on: H.engOn };
  }
  const sel = document.getElementById('hyView');
  sel.value = 'lever'; sel.dispatchEvent(new Event('change')); updateUI(); o.leverView = H.view; o.leverLit = lit();
  sel.value = 'map'; sel.dispatchEvent(new Event('change')); updateUI(); o.mapView = H.view; o.mapLit = lit();
  // the map against the best line
  const M = hybBsfcMap(), O = psOol();
  let oolBest = Infinity, oolOver = 0; O.P.forEach((P, i) => { oolBest = Math.min(oolBest, O.gs[i] * 3.6e6 / P); const T = P / (O.ne[i] * Math.PI / 30); if (T > hybEngTq(O.ne[i]) * 1.001) oolOver++; });
  let below = 0, aboveFull = 0, filledAbove = 0;
  for (let i = 0; i < M.NR; i++) for (let j = 0; j < M.NT; j++) {
    const b = M.g[i * M.NT + j], rpm = M.r0 + (M.r1 - M.r0) * i / (M.NR - 1), T = M.T1 * (j + 0.5) / M.NT;
    if (b < M.best.b - 1e-6) below++;
    if (T > hybEngTq(rpm)) { aboveFull++; if (isFinite(b)) filledAbove++; }
  }
  o.map = { best: M.best.b, oolBest, below, aboveFull, filledAbove, oolOver };
  // load-point shifting on the Ioniq: a light pedal, ENGINE ONLY against CHARGE
  loadVehiclePreset(HYB_VEHICLE_PRESETS.find(x => /Ioniq/.test(x.name))); setTab('engine');
  H = hybBenchState(); state.load = 0.5;
  H.mode = 'engine'; H.soc = 0.5; state.throttle = 0.25; step(6); o.lps = { engine: { bsfc: state.bsfc, Te: H.Te, rpm: state.rpm } };
  H.mode = 'charge'; H.soc = 0.5; state.throttle = 0.25; step(6); o.lps.charge = { bsfc: state.bsfc, Te: H.Te, rpm: state.rpm, Pb: H.Pb };
  H.view = 'lever'; updateUI(); o.p2Lever = { view: H.view, disabled: sel.querySelector('option[value="lever"]').disabled };
  H.view = 'map'; updateUI(); o.p2MapLit = lit();
  applyBuild({ engine: Object.assign({}, DEFAULT_ENGINE), tune: Object.assign({}, STD_TUNE) });
  return o;
});
const f = (x, d = 1) => (+x).toFixed(d);
const rho = 30 / 78;

for (const [m, L] of Object.entries(r.lever)) {
  const err = rho * L.ns + L.nr - (1 + rho) * L.ne;
  console.log(`== lever, ${m}: MG1 ${f(L.ns, 0)}, engine ${f(L.ne, 0)}, ring ${f(L.nr, 0)} rpm; off the line by ${f(err, 1)} rpm; carrier at ${f(L.xc, 3)} ==`);
  if (Math.abs(err) > 2) fails.push(`the lever's three speeds do not lie on one line in ${m}`);
  if (Math.abs(L.xc - 1 / (1 + rho)) > 1e-9) fails.push('the carrier does not stand 1/(1+rho) of the way from the sun');
}
if (r.lever.ev.on || Math.abs(r.lever.ev.ne) > 1 || !(r.lever.ev.ns < 0)) fails.push('in EV the lever does not pass through a stopped engine with MG1 backwards');
console.log(`== views: lever ${r.leverView} (${f(r.leverLit * 100)}% drawn), map ${r.mapView} (${f(r.mapLit * 100)}% drawn); on a P2 the lever falls back to "${r.p2Lever.view}" (offered: ${!r.p2Lever.disabled}), map ${f(r.p2MapLit * 100)}% drawn ==`);
if (r.leverView !== 'lever' || r.mapView !== 'map' || !(r.leverLit > 0.02) || !(r.mapLit > 0.3) || !(r.p2MapLit > 0.3)) fails.push('the VIEW selector does not draw the lever and the map');
if (r.p2Lever.view !== 'flow' || !r.p2Lever.disabled) fails.push('a P2 is offered the power-split\'s lever');
const P = r.map;
console.log(`== Prius map: best ${f(P.best, 0)} g/kWh, the best line's ${f(P.oolBest, 0)}; cells under the best ${P.below}; ${P.aboveFull} cells above full load, ${P.filledAbove} filled; best-line points over full load ${P.oolOver} ==`);
if (Math.abs(P.best / P.oolBest - 1) > 0.03) fails.push('the map\'s best is not the best line\'s');
if (P.below || P.filledAbove || !P.aboveFull || P.oolOver) fails.push('the map is not the engine\'s own (cells past the best or past full load)');
const E = r.lps.engine, C = r.lps.charge;
console.log(`== Ioniq at 25% pedal: ENGINE ONLY ${f(E.Te, 0)} Nm at ${f(E.rpm, 0)} rpm, ${f(E.bsfc, 0)} g/kWh; CHARGE ${f(C.Te, 0)} Nm, ${f(C.bsfc, 0)} g/kWh, pack ${f(C.Pb)} kW ==`);
if (!(C.Te > E.Te && C.bsfc < E.bsfc && C.Pb < 0)) fails.push('charging does not move the engine to a better BSFC (load-point shifting)');

await browser.close();
if (errors.length) console.log('ERRORS:\n  ' + errors.join('\n  '));
if (fails.length) console.log('\nFAIL:\n  ' + fails.join('\n  '));
else console.log('\nOK: the lever is the planetary\'s, the map is the engine\'s, and load-point shifting shows on it.');
process.exit(fails.length || errors.length ? 1 : 0);
