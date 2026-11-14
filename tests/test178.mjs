// A compound turbo as two stages in series (build 291).
//
// WHY THIS EXISTS. A compound was one frame with 2.30 of its flow (TURBO_CONFIG, plans/fitted-register.json). It is now
// a low-pressure turbo feeding the frame the build chose (compoundStage). What must hold:
//   · the LP wheel is matched to an equal pressure split of the target: D_LP/D_HP = (s/sqrt(T1/T0))^(1/2), s = sqrt(PR);
//     the choke flow is that wheel's, with no multiple;
//   · the shafts: the HP one is tied at (D_LP/D_HP) sqrt(T1/T0) of the LP one, so the HP wheel meets its tip limit at the
//     state's top speed, and the inertia is both cartridges' (heavier than the frame's own);
//   · on the Golf GTI's frame at 2.5 bar, the compound makes more power than the single and pushes against less
//     exhaust pressure at 5500 rpm; it comes on boost later;
//   · a compound with a VGT runs the housing (no ring) without error; a single, twin and sequential have no LP stage.
import { chromium } from './pw.mjs';
import { fileURLToPath, pathToFileURL } from 'url';
import path from 'path';
const repo = fileURLToPath(new URL('..', import.meta.url));
const browser = await chromium.launch();
const page = await browser.newPage();
const errors = [];
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
await page.goto(pathToFileURL(path.join(repo, 'index.html')).href, { waitUntil: 'networkidle' });
await page.waitForTimeout(300);
const fails = [];

const r = await page.evaluate(() => {
  const run = (cfg, bar, x = {}) => {
    loadVehiclePreset(FACTORY_CARS.find(p => p.name.includes('Golf GTI (Mk7')));
    applyEngineToForm(Object.assign({}, engine, { turboConfig: cfg, boost_bar: bar }, x)); buildEngine();
    const e = engine, q = turboReport(e.turboSize);
    return { cfg, bar, exd: e.compExd, lp: e.lpExd, tr: e.lpTr, cap: e.turboCap, one: compChokeFlow(e.compExd), lpCap: e.lpExd ? compChokeFlow(e.lpExd) : 0,
      J: e.shaftJ, J1: wheelInertia(e.compExd, e.turbK * e.compExd), nMax: e.shaftMax, hpMax: maxShaftRpm(e.compExd),
      g: e.lpExd ? compoundRatio(e) : 0, vgtShut: e.vgtShut, hp: q.peakHP, full: q.fullRpm, bp: backPressureBar(5500, 1100) };
  };
  return { s1: run('single', 2.5), c1: run('compound', 2.5), c0: run('compound', 1.0), cv: run('compound', 2.0, { vgt: true }),
    tw: run('twin', 1.0), sq: run('sequential', 1.0), cfgs: Object.values(TURBO_CONFIG).map(c => Object.keys(c).join()) };
});
await browser.close();

const near = (a, b, t = 1e-9) => Math.abs(a - b) <= t * Math.max(1, Math.abs(b));
for (const c of [r.c0, r.c1]) {
  const s = Math.sqrt(1 + c.bar), tr = Math.sqrt(1 + (Math.pow(s, 0.286) - 1) / 0.78), want = c.exd * Math.sqrt(s / tr);
  console.log(`== compound @ ${c.bar} bar: HP ${(c.exd * 1000).toFixed(1)} mm, LP ${(c.lp * 1000).toFixed(1)} mm (matched ${(want * 1000).toFixed(1)}), choke ${c.cap.toFixed(1)} lb/min (one HP wheel ${c.one.toFixed(1)}), J ${(c.J * 1e5).toFixed(2)} x1e-5 (frame ${(c.J1 * 1e5).toFixed(2)}), shafts ${c.g.toFixed(3)} ==`);
  if (!near(c.lp, want)) fails.push(`${c.bar} bar: the LP wheel is not matched to an equal split`);
  if (!near(c.cap, c.lpCap)) fails.push(`${c.bar} bar: the choke flow is not the LP wheel's`);
  if (!near(c.g, (c.lp / c.exd) * tr)) fails.push(`${c.bar} bar: the shafts are not tied by the equal split`);
  if (!near(c.nMax * c.g, c.hpMax)) fails.push(`${c.bar} bar: the HP wheel does not meet its tip limit at the top speed`);
  if (!(c.J > c.J1)) fails.push(`${c.bar} bar: the two cartridges are not heavier than one`);
}
if (!(r.c1.lp > r.c0.lp)) fails.push('a higher target does not take a bigger LP wheel');
const row = c => `${c.cfg.padEnd(9)} ${c.hp} hp, full boost from ${Math.round(c.full)} rpm, exhaust ${c.bp.toFixed(2)} bar at 5500`;
console.log(`== Golf GTI frame @ 2.5 bar:\n   ${row(r.s1)}\n   ${row(r.c1)} ==`);
if (!(r.c1.hp > r.s1.hp)) fails.push('at 2.5 bar the compound does not make more power than the single');
if (!(r.c1.bp < r.s1.bp)) fails.push('at 2.5 bar the compound does not ease the exhaust pressure');
if (!(r.c1.full > r.s1.full)) fails.push('the compound does not come on boost later');
console.log(`== compound + VGT: vanes ${r.cv.vgtShut}, ${r.cv.hp} hp; twin LP ${r.tw.lp}, sequential LP ${r.sq.lp}; layouts carry ${[...new Set(r.cfgs)].join(' | ')} ==`);
if (r.cv.vgtShut !== 0 || !(r.cv.hp > 0)) fails.push('a compound with a VGT does not run its housing');
if (r.tw.lp || r.sq.lp || r.s1.lp) fails.push('a single, twin or sequential has an LP stage');
if (r.cfgs.some(k => /flow/.test(k))) fails.push('TURBO_CONFIG still carries a flow multiple');

if (errors.length) console.log('ERRORS:\n  ' + errors.join('\n  '));
if (fails.length) console.log('\nFAIL:\n  ' + fails.join('\n  '));
else console.log('\nOK: a compound is two matched stages in series, with no flow multiple.');
process.exit(fails.length || errors.length ? 1 : 0);
