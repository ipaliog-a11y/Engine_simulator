// A real engine's own cam card (build 427, plans/v1-finish.md item 5).
//
// WHY THIS EXISTS. The LS3 and LS7 now run on their makers' cams (ENGINE_CAMS) in place of their class's, and the LS3,
// LT4 and Coyote on their own valves. What must hold:
//   · each card's 0.050 in duration is found on the model's sin^2 lift law: the lift at the card's points is 0.050 in;
//   · a preset's card reaches the physics (camSpec) and survives the ENGINE form's round trip;
//   · picking another cam class drops the card, and an engine without a card keeps its class's cam;
//   · the LT4 is a two-valve head on its sourced valves.
import { chromium } from './pw.mjs';
import { fileURLToPath, pathToFileURL } from 'url';
import path from 'path';
const repo = fileURLToPath(new URL('..', import.meta.url));
const browser = await chromium.launch();
const page = await browser.newPage();
const errors = [];
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
await page.goto(pathToFileURL(path.join(repo, 'index.html')).href, { waitUntil: 'networkidle' });
const r = await page.evaluate(() => {
  const out = {}, P = n => PRESETS.find(p => p.name === n);
  for (const [n, c] of Object.entries(ENGINE_CAMS)) {
    const dur = camCardDur(c), L = c.lift / c.rocker, t = dur - c.d050;   // lift at the card's opening point
    applyEngineToForm(Object.assign({}, DEFAULT_ENGINE, P(n).engine)); buildEngine();
    const s = camSpec(engine), back = readEngineFromForm();
    out[n] = { at050: L * Math.pow(Math.sin(Math.PI * (t / 2) / dur), 2), dur: s.dur, lsa: s.lsa, lift: s.lift_mm,
      want: [+dur.toFixed(1), c.lsa, +(c.lift * 25.4).toFixed(2)], kept: back.camDur_deg };
    document.getElementById('edCam').value = engine.cam === 'race' ? 'sport' : 'race';
    out[n].dropped = readEngineFromForm().camDur_deg;
  }
  const lt = P('GM LT4 6.2 supercharged (Camaro ZL1)');
  applyEngineToForm(Object.assign({}, DEFAULT_ENGINE, lt.engine)); buildEngine();
  out.lt4 = { n: engine.ivCount, iv: engine.ivDia_mm, dur: camSpec(engine).dur, cls: CAM[engine.cam].dur };
  return out;
});
const fails = [];
for (const [n, x] of Object.entries(r)) {
  if (n === 'lt4') continue;
  console.log(`${n}: dur ${x.dur} lsa ${x.lsa} lift ${x.lift} mm; lift at the card's points ${x.at050.toFixed(4)} in`);
  if (Math.abs(x.at050 - 0.050) > 1e-6) fails.push(`${n}: lift at the card's points ${x.at050}, not 0.050 in`);
  if (x.dur !== x.want[0] || x.lsa !== x.want[1] || x.lift !== x.want[2]) fails.push(`${n}: camSpec ${[x.dur, x.lsa, x.lift]} not the card ${x.want}`);
  if (x.kept !== x.want[0]) fails.push(`${n}: the card did not survive the form (${x.kept})`);
  if (x.dropped !== 0) fails.push(`${n}: another cam class kept the card (${x.dropped})`);
}
console.log(`LT4: ${r.lt4.n} intake valve(s) of ${r.lt4.iv} mm, cam ${r.lt4.dur} deg`);
if (r.lt4.n !== 1 || r.lt4.iv !== 54.1) fails.push(`LT4: ${r.lt4.n} x ${r.lt4.iv} mm, not one 54.1 mm intake`);
if (r.lt4.dur !== r.lt4.cls) fails.push('LT4 (no card) does not keep its class cam');
await browser.close();
for (const f of fails.concat(errors)) console.log('FAIL ' + f);
process.exit(fails.length || errors.length ? 1 : 0);
