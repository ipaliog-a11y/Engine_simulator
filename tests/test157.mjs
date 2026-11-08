// RACE in 3D (build 247): the recorded race drawn as an 8-bit 3D world, in a view of its own beside the map.
//
// WHY THIS EXISTS. The 3D view is added to RACE; it must not change or replace anything that was there. What must hold:
//   · 3D CHASE / 3D OVERHEAD open a 3D view in its own canvas under the race controls (closed the first time); pressing
//     the same button again closes it; the choice is kept in pes.raceView;
//   · the map draws exactly the same pixels with the 3D view open or closed, and stays in its place;
//   · the 3D view shows a scene drawn with WebGL (many colours, not a blank);
//   · each car is where the recording puts it, at its own wheelbase, track, profile length and tyre radius; the fronts
//     steer by atan(wheelbase x curvature) and the body rolls by the car's roll gradient x v²κ/g;
//   · the overhead camera reads like the map, not its mirror;
//   · without WebGL the view closes, says why, and the map is untouched; no horizontal scroll at phone width; no errors.
import { chromium } from './pw.mjs';
import { fileURLToPath, pathToFileURL } from 'url';
import path from 'path';
const url = pathToFileURL(path.join(fileURLToPath(new URL('..', import.meta.url)), 'index.html')).href;
const fails = [], errors = [];
const browser = await chromium.launch();

async function race(vp, init) {
  const page = await browser.newPage({ viewport: vp, deviceScaleFactor: 1 });
  if (init) await page.addInitScript(init);
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  await page.click('#tabRace');
  for (const name of ['911 GT3', 'Civic Type R']) {
    const v = await page.evaluate(n => { const o = [...document.querySelectorAll('#raceAddSel option')].find(o => o.textContent.includes(n)); return o && o.value; }, name);
    await page.selectOption('#raceAddSel', v); await page.click('#raceAddBtn');
  }
  await page.selectOption('#raceTrk', 'tech');
  await page.fill('#raceLaps', '1');
  await page.fill('#raceSeed', '11');
  await page.click('#raceStart');
  await page.waitForFunction(() => raceUI.phase === 'live', null, { timeout: 180000 });
  await page.evaluate(() => { raceUI.playing = false; raceUI.t = Math.min(raceUI.run.t * 0.5, 45); });
  await page.waitForTimeout(300);
  return page;
}
// the map canvas, every pixel, as one hash
const mapHash = page => page.evaluate(() => {
  const d = ctx.getImageData(0, 0, canvas.width, canvas.height).data; let h = 0;
  for (let i = 0; i < d.length; i += 3) h = (h * 31 + d[i]) | 0;
  return { h, inStage: document.getElementById('raceStage').contains(canvas) };
});

// ---- 1. the view, the map beside it, the cars' numbers
{
  const page = await race({ width: 1280, height: 860 });
  const closed = await page.evaluate(() => ({ mode: R3D.mode, hidden: document.getElementById('race3dView').hidden }));
  if (closed.mode !== 'off' || !closed.hidden) fails.push('the 3D view should start closed');
  const map0 = await mapHash(page);
  for (const [btn, m] of [['#race3dChase', 'chase'], ['#race3dTop', 'top']]) {
    await page.click(btn);
    await page.waitForTimeout(400);
    const st = await page.evaluate(() => {
      const gl = R3D.gl, cv = R3D.cv, px = new Uint8Array(cv.width * cv.height * 4);
      gl.readPixels(0, 0, cv.width, cv.height, gl.RGBA, gl.UNSIGNED_BYTE, px);
      const cols = new Set(); for (let i = 0; i < px.length; i += 28) cols.add(px[i] + ',' + px[i + 1] + ',' + px[i + 2]);
      return { mode: R3D.mode, shown: !document.getElementById('race3dView').hidden, cols: cols.size, w: cv.width };
    });
    const map = await mapHash(page);
    console.log(`== ${m}: view shown ${st.shown}, WebGL ${st.w} px wide, ${st.cols} colours; map unchanged ${map.h === map0.h}, in its stage ${map.inStage}`);
    if (st.mode !== m || !st.shown || st.cols < 12) fails.push(`${m}: the 3D view did not draw a scene`);
    if (map.h !== map0.h || !map.inStage) fails.push(`${m}: the map changed when the 3D view opened`);
  }
  await page.click('#race3dTop');
  const shut = await page.evaluate(() => ({ mode: R3D.mode, hidden: document.getElementById('race3dView').hidden, kept: localStorage.getItem('pes.raceView') }));
  if (shut.mode !== 'off' || !shut.hidden || shut.kept !== 'off') fails.push('pressing the open camera again should close the 3D view');

  const cars = await page.evaluate(() => {
    const R = raceUI.run, t = raceUI.t, S = raceStandings(R, t), T = buildTrack(R.cfg.track), looks = r3dCars(R);
    return S.map(x => {
      const M = x.c.M, C = looks[x.k], lk = C.look, v = raceUI.entrants[x.c.id].build.vehicle;
      const G = carGeometry(Object.assign({}, DEFAULT_VEHICLE, v)), prof = v.body && CAR_PROFILES[v.body.name];
      const P = r3dCarPose(R, T, Object.assign({ rg: C.rollGrad }, x), t), A = r3dLineAt(M, T, x.s.pos);
      const off = Math.hypot(P.p[0] - A.x, P.p[1] - A.z, P.p[2] - A.y), kap = Math.abs(M.kap[A.i]);
      const roll = Math.acos(Math.min(1, P.body[4] * P.up[0] + P.body[5] * P.up[1] + P.body[6] * P.up[2])) * 180 / Math.PI;
      return { name: M.name, pass: x.s.pass > 0.5, off, dwb: lk.wb - M.wb, dtr: lk.track - M.track, len: lk.len, plen: prof && prof.len,
        drT: lk.rT - G.rTyre, dSteer: Math.abs(P.steer) - Math.atan(M.wb * kap), roll, want: Math.min(8, C.rollGrad * x.s.v ** 2 * kap / 9.81), rg: C.rollGrad };
    });
  });
  for (const c of cars) {
    console.log(`   ${c.name}: ${c.off.toFixed(2)} m off its line point, ${c.len.toFixed(3)} m long (profile ${c.plen}), roll ${c.roll.toFixed(2)}° / ${c.want.toFixed(2)}°`);
    if (Math.abs(c.off - (c.pass ? 2.5 : 0)) > 0.01) fails.push(`${c.name}: not where the recording puts it`);
    if (Math.abs(c.dwb) > 1e-6 || Math.abs(c.dtr) > 1e-6 || Math.abs(c.drT) > 1e-9) fails.push(`${c.name}: wheelbase, track or tyre radius is not its own`);
    if (c.plen && Math.abs(c.len - c.plen) > 0.01) fails.push(`${c.name}: length is not its profile's`);
    if (Math.abs(c.dSteer) > 1e-6) fails.push(`${c.name}: the fronts do not steer by atan(wheelbase x curvature)`);
    if (!(c.rg > 0) || Math.abs(c.roll - c.want) > 0.05) fails.push(`${c.name}: the body roll is not its roll gradient's`);
  }
  const ori = await page.evaluate(() => {
    R3D.mode = 'top';
    const R = raceUI.run, S = raceStandings(R, raceUI.t), T = buildTrack(R.cfg.track), V = r3dVP(R, T, S, 1.6);
    const A = r3dLineAt(V.x.c.M, T, V.x.s.pos), at = (dx, dz) => r3dProject(V.VP, [A.x + dx, A.z, A.y + dz]);
    const c = at(0, 0), e = at(10, 0), s = at(0, 10); R3D.mode = 'off';
    return { east: e[0] - c[0], south: s[1] - c[1] };
  });
  if (!(ori.east > 0 && ori.south < 0)) fails.push('the overhead view is a mirror of the map');
  await page.close();
}

// ---- 2. no WebGL: the view closes, the user is told, the map is untouched
{
  const page = await race({ width: 1280, height: 860 }, () => {
    const g = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (k, o) { return /webgl/.test(k) ? null : g.call(this, k, o); };
  });
  const map0 = await mapHash(page);
  await page.click('#race3dChase');
  await page.waitForTimeout(400);
  const st = await page.evaluate(() => ({ mode: R3D.mode, hidden: document.getElementById('race3dView').hidden, warned: R3D.warned }));
  const map = await mapHash(page);
  console.log(`== without WebGL: view ${st.mode}, told the user ${st.warned}, map unchanged ${map.h === map0.h}`);
  if (st.mode !== 'off' || !st.hidden || !st.warned || map.h !== map0.h) fails.push('without WebGL the view should close and say why, leaving the map');
  await page.close();
}

// ---- 3. a phone
{
  const page = await race({ width: 390, height: 844 });
  await page.click('#race3dChase');
  await page.waitForTimeout(400);
  const ph = await page.evaluate(() => ({ mode: R3D.mode, sw: document.documentElement.scrollWidth, iw: innerWidth }));
  console.log(`== phone: ${ph.mode}, page ${ph.sw} px in ${ph.iw} px`);
  if (ph.mode !== 'chase' || ph.sw > ph.iw + 1) fails.push('phone: the 3D view did not draw, or the page scrolls sideways');
  await page.close();
}

await browser.close();
fails.push(...errors);
console.log(fails.length ? '\nFAIL:\n  ' + fails.join('\n  ') : '\nPASS');
process.exit(fails.length ? 1 : 0);
