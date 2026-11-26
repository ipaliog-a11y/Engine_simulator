// Water-to-air intercoolers per car (build 478).
//
// WHY THIS EXISTS. Presets whose maker fits a water-to-air charge cooler take the water-to-air part (build 429).
// What must hold:
//   · every ENGINE_W2A entry names a factory engine, is boosted, and carries a source;
//   · each such engine, loaded from the picker, runs with a water-type intercooler part and a sane power figure;
//   · no other factory engine has a water-to-air part.
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
  const out = [], bad = [];
  for (const [name, s] of Object.entries(ENGINE_W2A)) {
    const i = FACTORY_ENGINES.findIndex(p => p.name === name);
    if (i < 0) { bad.push('no engine ' + name); continue; }
    const p = FACTORY_ENGINES[i];
    if (!(p.engine.intake === 'turbo' || p.engine.intake === 'supercharger')) bad.push(name + ': not boosted');
    if (!s.src || s.src.length < 20) bad.push(name + ': no source');
    applyBuild({ engine: Object.assign({}, p.engine), tune: Object.assign({}, STD_TUNE), vehicle: readVehicleFromForm(), name });
    const t = engine.icPart && engine.icPart.type;
    if (t !== 'water') bad.push(name + ': part ' + t);
    const hp = engine.score && engine.score.peakHP;
    out.push(name + ': ' + t + ', ' + Math.round(hp) + ' hp (real ' + p.real.hp + ')');
    if (!(hp > 0.5 * p.real.hp && hp < 1.5 * p.real.hp)) bad.push(name + ': power ' + hp);
  }
  for (const p of FACTORY_ENGINES) if (!ENGINE_W2A[p.name] && p.engine.icPart && p.engine.icPart.type === 'water') bad.push(p.name + ': unlisted W2A');
  return { out, bad };
});
console.log(r.out.join('\n'));
const fails = r.bad.concat(errors);
await browser.close();
if (fails.length) { console.log('FAIL\n' + fails.join('\n')); process.exit(1); }
console.log('PASS: ' + r.out.length + ' water-to-air presets');
