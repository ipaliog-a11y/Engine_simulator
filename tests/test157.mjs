// RACE in 3D (build 247): the recorded race drawn as an 8-bit 3D world, from behind a car or from above.
//
// WHY THIS EXISTS. The 3D view is a second way of drawing the race the map already draws. It must show the same race
// (nothing in it may be worked out again or differently), and the car it draws must be the car's own numbers. What
// must hold:
//   · RACE has a view picker, MAP / 3D CHASE / 3D OVERHEAD, on MAP the first time; the choice is kept (pes.raceView);
//   · on either 3D view the picture is drawn with WebGL and shows a scene (many colours, not a blank), and the map's
//     overlay (the order, the events) is still drawn over it;
//   · each car is where the recording puts it: on its racing line, at the circuit's height there, 2.5 m to the side
//     when passing, as the map draws a pass;
//   · each car's size is its own: wheelbase and track are the race model's, the length is the profile's (a real car's
//     brochure length), the wheel radius is the tyre's;
//   · the front wheels steer by atan(wheelbase x curvature) and the body rolls by the car's own roll gradient x v²κ/g;
//   · the overhead camera reads like the map, not its mirror: east is to the right and the map's down is down;
//   · without WebGL the page says so once and stays on the map, with no error;
//   · the picker is in Greek with the interface, the race page has no horizontal scroll at phone width, and no page
//     errors anywhere.
import { chromium } from './pw.mjs';
import { fileURLToPath, pathToFileURL } from 'url';
import path from 'path';
const repo = fileURLToPath(new URL('..', import.meta.url));
const url = pathToFileURL(path.join(repo, 'index.html')).href;
const fails = [], errors = [];
const browser = await chromium.launch();

async function openRace(page) {
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  await page.click('#tabRace');
  await page.waitForTimeout(200);
}
async function startRace(page) {
  for (const name of ['911 GT3', 'Civic Type R']) {
    const v = await page.evaluate(n => { const o = [...document.querySelectorAll('#raceAddSel option')].find(o => o.textContent.includes(n)); return o && o.value; }, name);
    if (!v) { fails.push('no ' + name + ' in the picker'); continue; }
    await page.selectOption('#raceAddSel', v); await page.click('#raceAddBtn');
  }
  await page.selectOption('#raceTrk', 'tech');
  await page.fill('#raceLaps', '1');
  await page.fill('#raceSeed', '11');
  await page.click('#raceStart');
  await page.waitForFunction(() => raceUI.phase === 'live', null, { timeout: 180000 });
  // stop the clock part-way round, so every frame draws the same moment
  await page.evaluate(() => { raceUI.playing = false; raceUI.t = Math.min(raceUI.run.t * 0.5, 45); });
}

// ---- 1. the picker, the views and the car's numbers
{
  const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
  await openRace(page);
  const pick = await page.evaluate(() => {
    const s = document.getElementById('raceView');
    return s && { opts: [...s.options].map(o => o.value + '=' + o.textContent), value: s.value };
  });
  console.log(`== picker: ${pick ? pick.opts.join(', ') + ' (on ' + pick.value + ')' : 'missing'}`);
  if (!pick) fails.push('no view picker on the RACE tab');
  else {
    if (pick.opts.join('|') !== 'map=MAP|chase=3D CHASE|top=3D OVERHEAD') fails.push('the picker should offer MAP, 3D CHASE, 3D OVERHEAD');
    if (pick.value !== 'map') fails.push('the view should start on MAP');
  }
  await startRace(page);

  // a hash of the map region, to tell the views apart
  const regionSig = () => page.evaluate(() => {
    const d = ctx.getImageData(0, Math.round(60 * vizScale), Math.round(vizW * vizScale), Math.round((vizH - 120) * vizScale)).data;
    const cols = new Set(); let h = 0;
    for (let i = 0; i < d.length; i += 4 * 37) { cols.add((d[i] >> 3) + ',' + (d[i + 1] >> 3) + ',' + (d[i + 2] >> 3)); h = (h * 31 + d[i] + d[i + 1] * 7 + d[i + 2] * 13) | 0; }
    return { cols: cols.size, h };
  });
  await page.waitForTimeout(300);
  const mapSig = await regionSig();
  const views = {};
  for (const m of ['chase', 'top']) {
    await page.selectOption('#raceView', m);
    await page.waitForTimeout(400);
    const st = await page.evaluate(() => {
      const gl = R3D.gl, cv = R3D.cv, px = new Uint8Array(cv.width * cv.height * 4);
      gl.readPixels(0, 0, cv.width, cv.height, gl.RGBA, gl.UNSIGNED_BYTE, px);
      const cols = new Set();
      for (let i = 0; i < px.length; i += 4 * 7) cols.add(px[i] + ',' + px[i + 1] + ',' + px[i + 2]);
      return { mode: R3D.mode, failed: R3D.failed, w: cv.width, h: cv.height, cols: cols.size, tris: R3D.track && R3D.track.buf.n / 3,
        tower: document.querySelectorAll('#raceTower tr[data-car]').length };
    });
    const sig = await regionSig();
    views[m] = sig;
    console.log(`== ${m}: WebGL ${st.w}×${st.h}, ${st.cols} colours in the 3D picture, track ${st.tris} triangles; map region ${sig.cols} colours`);
    if (st.mode !== m || st.failed) fails.push(`${m}: the 3D view did not draw (mode ${st.mode}, failed ${st.failed})`);
    if (st.cols < 12) fails.push(`${m}: the 3D picture has only ${st.cols} colours: nothing drawn`);
    if (sig.h === mapSig.h) fails.push(`${m}: the canvas looks the same as the map`);
    if (st.w > 460 || st.w < 150) fails.push(`${m}: rendered ${st.w} px wide, not a low resolution`);
  }
  if (views.chase && views.top && views.chase.h === views.top.h) fails.push('3D CHASE and 3D OVERHEAD draw the same picture');
  const kept = await page.evaluate(() => { try { return localStorage.getItem('pes.raceView'); } catch (e) { return 'blocked'; } });
  console.log(`   the choice is kept as pes.raceView = ${kept}`);
  if (kept !== 'top') fails.push('the view choice is not kept in pes.raceView');

  // the cars: where they are, their size, the wheels and the roll
  const cars = await page.evaluate(() => {
    const R = raceUI.run, t = raceUI.t, S = raceStandings(R, t), T = buildTrack(R.cfg.track), looks = r3dCars(R);
    return S.map(x => {
      const M = x.c.M, C = looks[x.k], lk = C.look, e = raceUI.entrants[x.c.id], v = e.build.vehicle;
      const G = carGeometry(Object.assign({}, DEFAULT_VEHICLE, v)), prof = v.body && CAR_PROFILES[v.body.name];
      const P = r3dCarPose(R, T, Object.assign({ rg: C.rollGrad }, x), t), A = r3dLineAt(M, T, x.s.pos);
      const want = [A.x, A.z, A.y], off = Math.hypot(P.p[0] - want[0], P.p[1] - want[1], P.p[2] - want[2]);
      // the roll the body shows: the angle between its up and the road's up
      const upB = [P.body[4], P.body[5], P.body[6]], roll = Math.acos(Math.min(1, upB[0] * P.up[0] + upB[1] * P.up[1] + upB[2] * P.up[2])) * 180 / Math.PI;
      const kap = Math.abs(M.kap[A.i]), wantRoll = Math.min(8, C.rollGrad * x.s.v * x.s.v * kap / 9.81);
      return { name: M.name, pass: x.s.pass > 0.5, off, wb: lk.wb, Mwb: M.wb, track: lk.track, Mtrack: M.track, len: lk.len, profLen: prof && prof.len,
        rT: lk.rT, gT: G.rTyre, steer: Math.abs(P.steer), wantSteer: Math.atan(M.wb * kap), roll, wantRoll, rollGrad: C.rollGrad, v: x.s.v };
    });
  });
  for (const c of cars) {
    console.log(`   ${c.name}: ${c.off.toFixed(2)} m from its line point${c.pass ? ' (passing)' : ''}; wheelbase ${c.wb.toFixed(3)} / model ${c.Mwb.toFixed(3)} m, ` +
      `track ${c.track.toFixed(3)} / ${c.Mtrack.toFixed(3)} m, length ${c.len.toFixed(3)} / profile ${c.profLen} m, tyre radius ${c.rT.toFixed(3)} / ${c.gT.toFixed(3)} m; ` +
      `steer ${(c.steer * 180 / Math.PI).toFixed(2)}° / ${(c.wantSteer * 180 / Math.PI).toFixed(2)}°, roll ${c.roll.toFixed(2)}° / ${c.wantRoll.toFixed(2)}° (${c.rollGrad.toFixed(2)}°/g at ${(c.v * 3.6).toFixed(0)} km/h)`);
    if (Math.abs(c.off - (c.pass ? 2.5 : 0)) > 0.01) fails.push(`${c.name}: drawn ${c.off.toFixed(2)} m from where the recording puts it`);
    if (Math.abs(c.wb - c.Mwb) > 1e-6 || Math.abs(c.track - c.Mtrack) > 1e-6) fails.push(`${c.name}: wheelbase or track is not the race model's`);
    if (c.profLen && Math.abs(c.len - c.profLen) > 0.01) fails.push(`${c.name}: drawn ${c.len.toFixed(3)} m long, its profile says ${c.profLen} m`);
    if (Math.abs(c.rT - c.gT) > 1e-9) fails.push(`${c.name}: the wheel is not the tyre's radius`);
    if (Math.abs(c.steer - c.wantSteer) > 1e-6) fails.push(`${c.name}: the front wheels do not steer by atan(wheelbase x curvature)`);
    if (!(c.rollGrad > 0)) fails.push(`${c.name}: no roll gradient from its build`);
    if (Math.abs(c.roll - c.wantRoll) > 0.05) fails.push(`${c.name}: the body rolls ${c.roll.toFixed(2)}°, its roll gradient gives ${c.wantRoll.toFixed(2)}°`);
  }
  // the overhead camera reads like the map
  const ori = await page.evaluate(() => {
    R3D.mode = 'top';
    const R = raceUI.run, S = raceStandings(R, raceUI.t), T = buildTrack(R.cfg.track), V = r3dVP(R, T, S, 1.6);
    const M = V.x.c.M, A = r3dLineAt(M, T, V.x.s.pos), P = [A.x, A.z, A.y];
    const at = d => r3dProject(V.VP, [P[0] + d[0], P[1], P[2] + d[1]]), c = at([0, 0]), e = at([10, 0]), s = at([0, 10]);
    return { east: e[0] - c[0], south: s[1] - c[1] };
  });
  console.log(`== overhead: 10 m east moves ${ori.east > 0 ? 'right' : 'LEFT'} on screen, 10 m down the map moves ${ori.south < 0 ? 'down' : 'UP'}`);
  if (!(ori.east > 0 && ori.south < 0)) fails.push('the overhead view is a mirror of the map');

  // Greek
  const el = await page.evaluate(() => { applyLang('el'); const o = [...document.getElementById('raceView').options].map(o => o.textContent); applyLang('en'); return o; });
  console.log(`== Greek picker: ${el.join(' / ')}`);
  if (el.some(t => /^(MAP|3D CHASE|3D OVERHEAD)$/.test(t))) fails.push('the view picker has no Greek');
  // kept across a reload
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  const after = await page.evaluate(() => ({ sel: document.getElementById('raceView').value, mode: R3D.mode }));
  console.log(`   after a reload the picker is on ${after.sel}`);
  if (after.sel !== 'top' || after.mode !== 'top') fails.push('the view choice is not restored after a reload');
  await page.close();
}

// ---- 2. no WebGL: the map, a message, no error
{
  const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
  await page.addInitScript(() => {
    const g = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (k, o) { return /webgl/.test(k) ? null : g.call(this, k, o); };
  });
  await openRace(page);
  await startRace(page);
  await page.selectOption('#raceView', 'chase');
  await page.waitForTimeout(400);
  const st = await page.evaluate(() => ({ mode: R3D.mode, sel: document.getElementById('raceView').value, warned: R3D.warned }));
  console.log(`== without WebGL: view ${st.mode}, picker ${st.sel}, told the user: ${st.warned}`);
  if (st.mode !== 'map' || st.sel !== 'map' || !st.warned) fails.push('without WebGL the page should go back to the map and say why');
  await page.close();
}

// ---- 3. a phone: the 3D view fits, no horizontal scroll
{
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
  await openRace(page);
  await startRace(page);
  await page.selectOption('#raceView', 'chase');
  await page.waitForTimeout(500);
  const ph = await page.evaluate(() => ({ mode: R3D.mode, w: R3D.cv.width, sw: document.documentElement.scrollWidth, iw: innerWidth }));
  console.log(`== phone: ${ph.mode}, WebGL ${ph.w} px wide, page ${ph.sw} px in a ${ph.iw} px window`);
  if (ph.mode !== 'chase') fails.push('phone: the 3D view did not draw');
  if (ph.sw > ph.iw + 1) fails.push(`phone: horizontal scroll (${ph.sw} > ${ph.iw})`);
  await page.close();
}

await browser.close();
if (errors.length) fails.push(...errors);
console.log(fails.length ? '\nFAIL:\n  ' + fails.join('\n  ') : '\nPASS');
process.exit(fails.length ? 1 : 0);
