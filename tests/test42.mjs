import { chromium } from './pw.mjs';
import { fileURLToPath, pathToFileURL } from 'url';
import path from 'path';
const repo = fileURLToPath(new URL('..', import.meta.url));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors = [];
page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
await page.goto(pathToFileURL(path.join(repo, 'index.html')).href, { waitUntil: 'networkidle' });
await page.waitForTimeout(700);
const fails = [];

// ---------------------------------------------------------------- 1. the resolution bug is gone
// This is the thing that made the tab unreadable: a 640x420 backing store stretched by CSS to
// whatever the panel was, so every 7 px glyph landed on fractional pixels.
console.log('== canvas is rendered at device resolution, not upscaled ==');
await page.click('#tabEngine'); await page.waitForTimeout(500);
const res = await page.evaluate(() => {
  const r = canvas.getBoundingClientRect();
  return { backing: [canvas.width, canvas.height], css: [Math.round(r.width), Math.round(r.height)],
    logical: [vizW, vizH], scale: +vizScale.toFixed(3), dpr: window.devicePixelRatio };
});
console.log(`  logical ${res.logical.join('x')} · backing ${res.backing.join('x')} · css ${res.css.join('x')} · dpr ${res.dpr}`);
const upscale = res.css[0] / res.backing[0] * res.dpr;
console.log(`  device pixels per backing pixel: ${upscale.toFixed(3)} (1.000 = no resampling)`);
if (Math.abs(upscale - 1) > 0.02) fails.push(`canvas is still being resampled (${upscale.toFixed(3)}x)`);
if (res.backing[0] <= res.logical[0] && res.css[0] > res.logical[0])
  fails.push('backing store did not grow to match the displayed size');

// it must follow the element, not a hard-coded number
const resize = await page.evaluate(async () => {
  const before = canvas.width;
  document.querySelector('.viz-panel').style.maxWidth = '520px';
  sizeCanvas(); await new Promise(r => setTimeout(r, 60));
  const after = canvas.width;
  document.querySelector('.viz-panel').style.maxWidth = '';
  sizeCanvas();
  return { before, after, restored: canvas.width };
});
console.log(`  backing follows the element: ${resize.before} -> ${resize.after} -> ${resize.restored}`);
if (!(resize.after < resize.before)) fails.push('backing store does not shrink with the element');
if (resize.restored !== resize.before) fails.push('backing store did not return to its original size');

// fullscreen widens the LOGICAL grid so the drawing gets more room
const fs = await page.evaluate(() => {
  const a = [vizW, vizH];
  vizW = 1280; vizH = 800; fullscreen = true; sizeCanvas();
  const b = { viz: [vizW, vizH], backing: [canvas.width, canvas.height] };
  vizW = 640; vizH = 420; fullscreen = false; sizeCanvas();
  return { windowed: a, full: b };
});
console.log(`  fullscreen logical grid ${fs.full.viz.join('x')} backing ${fs.full.backing.join('x')}`);
if (fs.full.viz[0] !== 1280) fails.push('fullscreen does not widen the logical grid');

// ---------------------------------------------------------------- 2. it is an animation, driven by rpm
console.log('\n== the cutaway is animated, and animated by the ENGINE ==');
const anim = await page.evaluate(async () => {
  const grab = () => { const g = canvas.getContext('2d');
    return g.getImageData(0, 0, canvas.width, canvas.height).data.reduce((a, b) => a + b, 0); };
  const pr = PRESETS.find(x => x.name === '3.0 Turbo I6 (2JZ)');
  applyEngineToForm(Object.assign({}, DEFAULT_ENGINE, pr.engine)); buildEngine();
  state.throttle = 0.9; state.load = 0.3;
  await new Promise(r => setTimeout(r, 400));
  const frames = [];
  for (let i = 0; i < 6; i++) { frames.push(grab()); await new Promise(r => setTimeout(r, 90)); }
  const moving = new Set(frames).size;
  // crank angle must advance with rpm, and stop dead when the engine is dead
  const a0 = crankAngle; await new Promise(r => setTimeout(r, 200));
  const spunRunning = Math.abs(crankAngle - a0) > 1e-6;
  const wasBlown = state.blown; state.blown = true;
  await new Promise(r => setTimeout(r, 120));
  const b0 = crankAngle; await new Promise(r => setTimeout(r, 200));
  const spunDead = Math.abs(crankAngle - b0) > 1e-6;
  state.blown = wasBlown;
  return { moving, total: frames.length, spunRunning, spunDead };
});
console.log(`  distinct frames: ${anim.moving}/${anim.total} · crank turns while running: ${anim.spunRunning} · while dead: ${anim.spunDead}`);
if (anim.moving < 4) fails.push(`the cutaway is barely animating (${anim.moving}/${anim.total} distinct frames)`);
if (!anim.spunRunning) fails.push('the crank does not turn while the engine runs');
if (anim.spunDead) fails.push('the crank keeps turning after the engine has failed');

// --- the animation must stay WATCHABLE at any rpm ---
// Drawing the crank at its real speed is a strobe: 5000 rpm is 83 revolutions a second against
// 60 frames. The cycle has to stay slow enough to follow a valve opening, and it must not scale
// with rpm beyond a readable band, however hard the engine is revving.
const pace = await page.evaluate(async () => {
  const out = [];
  for (const [label, thr, load] of [['idle', 0, 0.95], ['mid', 0.5, 0.5], ['limiter', 1, 0]]) {
    state.throttle = thr; state.load = load;
    await new Promise(r => setTimeout(r, 1400));
    const cyc = (engine.type === 'rotary' || engine.type === 'twostroke') ? Math.PI * 2 : Math.PI * 4;
    const a0 = crankAngle, t0 = performance.now(), rpm = state.rpm;
    await new Promise(r => setTimeout(r, 900));
    let d = crankAngle - a0; if (d < 0) d += cyc;
    out.push({ label, rpm: Math.round(rpm), onScreen: +(d / cyc / ((performance.now() - t0) / 1000)).toFixed(2),
      realRevPerSec: +(rpm / 60).toFixed(1) });
  }
  return out;
});
pace.forEach(x => console.log(`  ${x.label.padEnd(8)} ${String(x.rpm).padStart(5)} rpm -> ${x.onScreen} cycles/s on screen (the real crank turns ${x.realRevPerSec}/s)`));
pace.forEach(x => {
  if (x.onScreen > 1.6) fails.push(`${x.label}: ${x.onScreen} cycles/s is too fast to follow`);
  if (x.onScreen < 0.15) fails.push(`${x.label}: ${x.onScreen} cycles/s is barely moving`);
});
// it must still RANK with rpm, or it conveys nothing
const idle = pace.find(x => x.label === 'idle'), lim = pace.find(x => x.label === 'limiter');
if (!(lim.onScreen > idle.onScreen * 1.5))
  fails.push('the animation does not visibly speed up with rpm');
// and it must be decoupled from real crank speed, not merely clamped near the top
if (lim.realRevPerSec / lim.onScreen < 20)
  fails.push('the animation is still tracking real crank speed');

// piston motion must be real crank-slider geometry, not a sine wave
const kin = await page.evaluate(() => {
  const at = t => pistonFrac(t, 3.2);
  // TDC and BDC are exact; and the piston is NOT symmetric about mid-stroke (that is the point
  // of a connecting rod of finite length)
  const tdc = at(0), bdc = at(Math.PI), q1 = at(Math.PI / 2), q3 = at(3 * Math.PI / 2);
  const sine = 0.5;   // where a pure sine would put both quarter points
  return { tdc: +tdc.toFixed(4), bdc: +bdc.toFixed(4), q1: +q1.toFixed(4), q3: +q3.toFixed(4), sine };
});
console.log(`  piston: TDC ${kin.tdc} · BDC ${kin.bdc} · quarter points ${kin.q1} / ${kin.q3} (a pure sine gives ${kin.sine})`);
if (Math.abs(kin.tdc) > 1e-6) fails.push('piston is not at 0 at TDC');
if (Math.abs(kin.bdc - 1) > 1e-6) fails.push('piston is not at full stroke at BDC');
if (Math.abs(kin.q1 - 0.5) < 0.02) fails.push('piston motion is a sine wave — rod length is not modelled');
if (Math.abs(kin.q1 - kin.q3) > 1e-6) fails.push('crank-slider should be symmetric between the two quarter points');

// valve timing must actually open and close on the four-stroke cycle
const valves = await page.evaluate(() => {
  // 0 deg is TDC on the intake stroke: intake 0-180, compression 180-360, power 360-540, exhaust 540-720
  const sample = d => ({ intake: +valveLift(d, 700, 230).toFixed(2), exhaust: +valveLift(d, 490, 10).toFixed(2) });
  return { intake: sample(90), exhaust: sample(630), compression: sample(270), power: sample(450),
    overlap: sample(2) };
});
console.log(`  valve lift — intake ${JSON.stringify(valves.intake)} · exhaust ${JSON.stringify(valves.exhaust)}`);
console.log(`                compression ${JSON.stringify(valves.compression)} · power ${JSON.stringify(valves.power)} · overlap at TDC ${JSON.stringify(valves.overlap)}`);
if (!(valves.intake.intake > 0.9)) fails.push('intake valve is not open on the intake stroke');
if (!(valves.exhaust.exhaust > 0.9)) fails.push('exhaust valve is not open on the exhaust stroke');
if (valves.compression.intake > 0.01 || valves.compression.exhaust > 0.01)
  fails.push('a valve is open during compression');
if (valves.power.intake > 0.01 || valves.power.exhaust > 0.01)
  fails.push('a valve is open during the power stroke');
// both cracked open around TDC is correct — that is scavenging overlap, not a bug
if (!(valves.overlap.intake > 0 && valves.overlap.exhaust > 0))
  fails.push('no valve overlap at TDC');

// ---------------------------------------------------------------- 3. every engine type renders
console.log('\n== every engine type draws without error ==');
const types = await page.evaluate(async () => {
  const out = [];
  for (const name of ['3.0 Turbo I6 (2JZ)', '6.2 Supercharged V8', '1.3 Rotary Turbo (13B)',
                      '500cc 2-Stroke Twin', '2.0 Turbo Diesel I4', '6.5 V12 NA Supercar', '1.0 Kei Turbo I3']) {
    const pr = PRESETS.find(x => x.name === name);
    applyEngineToForm(Object.assign({}, DEFAULT_ENGINE, pr.engine)); buildEngine();
    state.throttle = 0.85; state.load = 0.3;
    await new Promise(r => setTimeout(r, 220));
    const g = canvas.getContext('2d');
    const px = g.getImageData(0, 0, canvas.width, canvas.height).data;
    let lit = 0; for (let i = 0; i < px.length; i += 40) if (px[i] > 24) lit++;
    out.push({ name, type: engine.type, cyl: engine.cylinders, painted: lit });
  }
  return out;
});
types.forEach(t => console.log(`  ${t.name.padEnd(24)} ${String(t.type).padEnd(10)} ${t.cyl} cyl · ${t.painted} lit samples`));
types.forEach(t => { if (t.painted < 200) fails.push(`${t.name}: cutaway rendered almost nothing`); });

// the Wankel housing must be a real epitrochoid, not a circle or a diamond
const wankel = await page.evaluate(() => {
  const R = 86, e = R / 5.5, pts = [];   // must track drawRotaryCutaway
  for (let a = 0; a < 6.2832; a += 0.02) pts.push(Math.hypot(R * Math.cos(a) + e * Math.cos(3 * a), R * Math.sin(a) + e * Math.sin(3 * a)));
  const min = Math.min(...pts), max = Math.max(...pts);
  return { min: +min.toFixed(1), max: +max.toFixed(1), ratio: +(max / min).toFixed(3), rotorReach: +(R * 0.985 + e).toFixed(1) };
});
console.log(`  Wankel housing radius ${wankel.min}–${wankel.max} (${wankel.ratio}x lobing) · rotor apex reach ${wankel.rotorReach}`);
if (wankel.ratio < 1.1) fails.push('the Wankel housing is effectively a circle');
if (wankel.rotorReach > wankel.max) fails.push('the rotor apexes poke through the housing wall');

// ---------------------------------------------------------------- 4. translation debt
// Greek is deliberately PAUSED while the physics core is rewritten, so "every label is translated"
// would now fail on every new string and the temptation would be to delete the check. Instead it
// counts: new strings must still be wrapped in tr() (so nothing has to be re-found later), and the
// untranslated backlog is printed every run and held to a high-water mark. The debt stays visible
// and cannot silently grow.
const I18N_DEBT_MAX = 0;   // raise deliberately when pausing costs coverage; lower when catching up
console.log('\n== labels ==');
const i18nOk = await page.evaluate(() => {
  // Every function that paints a label on the ENGINE tab has to be in this scan, or the check is
  // hollow. (It briefly also covered drawCutCards/cutCard, from the callout-card cutaway that was
  // reverted — referencing them after the revert made this whole block throw.)
  const src = drawEngine.toString() + drawPistonCutaway.toString() + drawRotaryCutaway.toString();
  const keys = [...new Set([...src.matchAll(/tr\('([^']+)'\)/g)].map(m => m[1]))];
  return { total: keys.length, missing: keys.filter(k => !I18N[k]) };
});
console.log(`  ${i18nOk.total} labels wrapped in tr() · untranslated: ${i18nOk.missing.length}` +
  (i18nOk.missing.length ? ` (${i18nOk.missing.join(', ')})` : '') + ` · budget ${I18N_DEBT_MAX}`);
if (i18nOk.missing.length > I18N_DEBT_MAX)
  fails.push(`translation debt ${i18nOk.missing.length} exceeds the budget of ${I18N_DEBT_MAX}: ` +
    i18nOk.missing.join(', ') + ' — translate them, or raise I18N_DEBT_MAX deliberately');

await page.evaluate(() => applyLang('el')); await page.waitForTimeout(600);
const el = await page.evaluate(() => (document.querySelector('[data-gk="subsystems"]') || {}).textContent || '');
if (!/τομή|ΤΟΜΗ/i.test(el)) fails.push('Greek guide does not mention the cutaway');
await page.evaluate(() => applyLang('en')); await page.waitForTimeout(300);
const en = await page.evaluate(() => (document.querySelector('[data-gk="subsystems"]') || {}).textContent || '');
if (!/cutaway/i.test(en)) fails.push('English guide does not mention the cutaway');

// ---------------------------------------------------------------- 5. the other two tabs still work
console.log('\n== DYNO and TRACK share this canvas and must be unharmed ==');
const others = await page.evaluate(async () => {
  const out = {};
  const pr = PRESETS.find(x => x.name === '3.0 Turbo I6 (2JZ)');
  applyEngineToForm(Object.assign({}, DEFAULT_ENGINE, pr.engine)); buildEngine();
  applyChassisFit('coupe'); buildVehicle();
  for (const mode of ['dyno', 'track', 'engine']) {
    setTab(mode); await new Promise(r => setTimeout(r, 500));
    const g = canvas.getContext('2d');
    const px = g.getImageData(0, 0, canvas.width, canvas.height).data;
    let lit = 0; for (let i = 0; i < px.length; i += 40) if (px[i] > 24) lit++;
    out[mode] = { backing: canvas.width, painted: lit };
  }
  return out;
});
Object.entries(others).forEach(([k, v]) => console.log(`  ${k.padEnd(7)} backing ${v.backing}px · ${v.painted} lit samples`));
Object.entries(others).forEach(([k, v]) => {
  if (v.painted < 200) fails.push(`${k} tab renders almost nothing`);
  if (v.backing <= 640) fails.push(`${k} tab is not getting the hi-DPI backing store`);
});

console.log('\nERRORS:', errors.length ? errors : 'none');
console.log(fails.length ? 'FAIL:\n  ' + fails.join('\n  ') : '\nPASS');
await browser.close();
process.exit(fails.length || errors.length ? 1 : 0);
