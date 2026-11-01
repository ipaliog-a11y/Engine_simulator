// Kerbs (build 217).
//
// WHY THIS EXISTS. A circuit's corners have kerbs, and the FIA's circuit drawing standard puts them outside the track
// edges: a line that uses one gains width, and pays with the car twisted across its diagonal while one axle's wheel is
// on it and the other's is not. What must hold:
//   · every corner has an apex kerb on its inside and an exit kerb on its outside: the FIA's 5 cm Vallelunga and
//     5 cm Melbourne ramps, 0.8 m wide; they cover a part of the lap, not most of it, and their width tapers in;
//   · the racing line uses them: it runs beyond the edge only where a kerb is, never by more than the kerb's width;
//   · with the kerbs a lap is quicker than without them (their width); the twist itself costs time, a little;
//   · the twist: warp stiffness is the front and rear roll stiffness in series; stiffer bars twist harder, stiffer
//     dampers jolt harder; a wheel 5 cm up on its own moves warpK (0.05/t)/t onto or off the outside tyre; with the car
//     turning towards +normal, a positive warp takes load off the front's outside tyre and puts it on the rear's. That
//     evens the front's two tyres and unevens the rear's, and a tyre's grip grows less than its load, so the front grips
//     more and the rear less: the kerb moves the balance towards oversteer (cross-weight, as racers set it);
//   · the 0-100 does not change; the TRACK map draws the kerbs; the guide has a Kerbs page, in Greek too.
import { chromium } from './pw.mjs';
import { fileURLToPath, pathToFileURL } from 'url';
import path from 'path';
const repo = fileURLToPath(new URL('..', import.meta.url));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors = [];
page.on('console', m => { if (m.type() === 'error' && !/ERR_FILE_NOT_FOUND/.test(m.text())) errors.push('console: ' + m.text()); });
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
await page.goto(pathToFileURL(path.join(repo, 'index.html')).href, { waitUntil: 'networkidle' });
await page.waitForTimeout(400);
const fails = [];

const r = await page.evaluate(() => {
  const o = {};
  loadVehiclePreset(VEHICLE_PRESETS.find(x => x.name.includes('BMW M3 (E46'))); buildVehicle();
  o.k = { W: KERB_W, apex: KERB_APEX, exit: KERB_EXIT };
  // 1. the zones, and the line on them
  o.tracks = {};
  for (const t of ['mixed', 'spa']) {
    const T = buildTrack(t); T.lines = {}; delete T.kerbs;
    const lap = simulateLap(t).lap, line = lineFor(T, t), K = T.kerbs, c = T.pts, n = c.length;
    let pts = 0, apexIn = 0, apexOut = 0, exitIn = 0, exitOut = 0, over = 0, overNoKerb = 0, overMax = 0, taperOk = true;
    // which side is the inside: the line's own turn at the point
    for (let i = 0; i < n; i++) {
      const hw = c[i].hw != null ? c[i].hw : T.width / 2, mg = carHalfWidth(), off = line[i].off, turn = line[i].turn;
      if (K.P[i] || K.N[i]) pts++;
      for (const [H, sg] of [[K.P, 1], [K.N, -1]]) { if (!H[i]) continue;
        const inside = sg === turn; if (H[i] > 0) { inside ? apexIn++ : apexOut++; } else { inside ? exitIn++ : exitOut++; } }
      const beyond = Math.max(off - (hw - mg), -(hw - mg) - off);
      if (beyond > 0.01) { over++; overMax = Math.max(overMax, beyond); const side = off > 0 ? K.P[i] : K.N[i]; if (!side) overNoKerb++; }
      const w = Math.max(K.wP[i], K.wN[i]); if ((K.P[i] || K.N[i]) && !(w > 0 && w <= 1)) taperOk = false;
    }
    // without kerbs: the same circuit, the kerbs taken away, the line rebuilt
    const zero = () => new Float64Array(n), keep = T.kerbs;
    T.kerbs = { P: zero(), N: zero(), wP: zero(), wN: zero() }; T.lines = {};
    const bare = simulateLap(t).lap;
    // the kerbs' width without their twist
    T.kerbs = keep; T.lines = {}; const wk = vehicle.warpK, wc = vehicle.warpC; vehicle.warpK = vehicle.warpC = 0;
    const widthOnly = simulateLap(t).lap; vehicle.warpK = wk; vehicle.warpC = wc; T.lines = {}; simulateLap(t);
    o.tracks[t] = { share: pts / n, apexIn, apexOut, exitIn, exitOut, over, overNoKerb, overMax, taperOk, lap, bare, widthOnly };
  }
  // 2. the twist
  const K = rollStiffness(vehicle);
  o.warp = { K: vehicle.warpK, series: K.F * K.R / (K.F + K.R), C: vehicle.warpC };
  const set = (id, v) => { document.getElementById(id).value = String(v); buildVehicle(); };
  set('vhBarF', 2); set('vhBarR', 2); o.warp.Kstiff = vehicle.warpK; set('vhBarF', 0); set('vhBarR', 0);
  set('vhDamperF', 2); set('vhDamperR', 2); o.warp.Cstiff = vehicle.warpC; set('vhDamperF', 0); set('vhDamperR', 0);
  const tF = vehicle.trackF, N = vehicle.mass * G, ay = 0.9 * G;
  const flat = latBalance(N, ay, 0, 0, 0, { kw: 0, kws: 0, turn: 1 }), up = latBalance(N, ay, 0, 0, 0, { kw: 0.05 / tF, kws: 0, turn: 1 });
  o.warp.dF = vehicle.warpK * (0.05 / tF) / tF;
  o.warp.capF = [flat.capF, up.capF]; o.warp.capR = [flat.capR, up.capR];
  // 3. the 0-100, the map, the guide
  const a0 = simulateAccel().t100; o.t100 = a0;
  trackKey = 'mixed'; setTab('track'); refreshLap(); o.map = !!buildTrack('mixed').kerbs;
  applyLang('el'); setTab('guide'); showGuide('kerbs');
  o.el = { title: document.querySelector('#gp-kerbs .guide-title').textContent, body: document.querySelector('#gp-kerbs [data-gk="kerbs"]').textContent.slice(0, 40) };
  applyLang('en'); showGuide(null); setTab('engine');
  return o;
});
await browser.close();

const f = (x, d = 2) => (+x).toFixed(d), pc = x => f((x - 1) * 100, 2) + '%';
console.log(`== kerbs: ${r.k.W} m wide, apex +${r.k.apex} m, exit ${r.k.exit} m ==`);
if (r.k.W !== 0.8 || r.k.apex !== 0.05 || r.k.exit !== -0.05) fails.push('the kerbs are not the FIA 5 cm Vallelunga / Melbourne at 0.8 m');
for (const [t, x] of Object.entries(r.tracks)) {
  console.log(`== ${t}: kerbs on ${f(x.share * 100, 0)}% of the points; apex kerbs inside ${x.apexIn} / outside ${x.apexOut}, exit kerbs outside ${x.exitOut} / inside ${x.exitIn}; the line beyond the edge on ${x.over} points (${x.overNoKerb} with no kerb), at most ${f(x.overMax)} m ==`);
  console.log(`   laps: no kerbs ${f(x.bare, 3)} -> kerbs' width alone ${f(x.widthOnly, 3)} (${pc(x.widthOnly / x.bare)}) -> with their twist ${f(x.lap, 3)} (${pc(x.lap / x.bare)})`);
  if (!(x.share > 0.05 && x.share < 0.45)) fails.push(`${t}: kerbs on ${f(x.share * 100, 0)}% of the lap`);
  if (!(x.apexIn > 5 * x.apexOut && x.exitOut > 5 * x.exitIn)) fails.push(`${t}: apex kerbs are not on the inside and exit kerbs on the outside`);
  if (!(x.over > 0)) fails.push(`${t}: the line never uses a kerb`);
  if (x.overNoKerb > 0) fails.push(`${t}: the line leaves the track where there is no kerb (${x.overNoKerb} points)`);
  if (!(x.overMax <= r.k.W + 1e-6)) fails.push(`${t}: the line runs ${f(x.overMax)} m past the edge, beyond the kerb`);
  if (!x.taperOk) fails.push(`${t}: a kerb's usable width is out of 0-1`);
  if (!(x.lap < x.bare)) fails.push(`${t}: a lap with the kerbs is not quicker than without`);
}
const w = r.warp;
console.log(`== twist: warp stiffness ${f(w.K, 0)} N m/rad (front and rear in series ${f(w.series, 0)}); stiffer bars ${f(w.Kstiff, 0)}; damping ${f(w.C, 0)}, stiffer dampers ${f(w.Cstiff, 0)}; one wheel 5 cm up moves ${f(w.dF, 0)} N ==`);
console.log(`   cornering grip: front ${f(w.capF[0], 0)} -> ${f(w.capF[1], 0)} N, rear ${f(w.capR[0], 0)} -> ${f(w.capR[1], 0)} N`);
if (Math.abs(w.K / w.series - 1) > 1e-9) fails.push('the warp stiffness is not the roll stiffnesses in series');
if (!(w.Kstiff > w.K)) fails.push('stiffer bars do not twist the car harder');
if (!(w.Cstiff > w.C)) fails.push('stiffer dampers do not jolt harder');
if (!(w.dF > 300 && w.dF < 700)) fails.push(`a wheel 5 cm up moves ${f(w.dF, 0)} N, out of scale`);
if (!(w.capF[1] > w.capF[0] && w.capR[1] < w.capR[0])) fails.push('the twist does not even the front (more grip) and load the rear (less grip) as load sensitivity says');
console.log(`== 0-100 ${f(r.t100, 3)} s; map draws kerbs: ${r.map}; Greek: ${r.el.title} · ${r.el.body} ==`);
if (!r.map) fails.push('the TRACK map has no kerbs to draw');
if (r.el.title !== 'Κερμπ' || /Every corner/.test(r.el.body)) fails.push('the Kerbs page is not in Greek');

if (errors.length) console.log('ERRORS:\n  ' + errors.join('\n  '));
if (fails.length) console.log('\nFAIL:\n  ' + fails.join('\n  '));
else console.log('\nOK: corners have FIA kerbs outside their edges; the line uses their width and pays for the twist they put across the car.');
process.exit(fails.length || errors.length ? 1 : 0);
