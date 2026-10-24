// Export the geometry the gas model needs, for a few presets, from the real index.html.
import { chromium } from '../../pw.mjs';
import { writeFileSync } from 'fs';
import { fileURLToPath, pathToFileURL } from 'url';
import path from 'path';
const repo = fileURLToPath(new URL('../../..', import.meta.url));
const b = await chromium.launch(); const p = await b.newPage();
await p.goto(pathToFileURL(path.join(repo, 'index.html')).href); await p.waitForTimeout(400);
const out = await p.evaluate(() => {
  const names = ['1.6 Sport NA I4', '3.0 Turbo I6 (2JZ)', '5.0 V8 NA Muscle', '6.5 V12 NA Supercar', '2.0 ITB NA Screamer I4'];
  const r = {};
  for (const n of names) {
    applyEngineToForm(Object.assign({}, DEFAULT_ENGINE, PRESETS.find(x => x.name === n).engine)); buildEngine();
    const e = engine, cfg = soundConfig(e);
    r[n] = { cylinders: e.cylinders, layout: e.layout, type: e.type, bore: e.bore_mm / 1000, stroke: e.stroke_mm / 1000, cr: e.compression,
      ivDia: (e.ivDia_mm || 0.45 * e.bore_mm) / 1000, ivCount: e.ivCount || 2, ivLift: (e.ivLift_mm || 0) / 1000, camDur: e.camDur, overlap: e.overlap,
      primL: e.primL, primD: e.primD, sysL: e.sysL, sysD: e.sysD, sysPipes: e.sysPipes, runnerL: e.runnerL, runnerD: (e.runnerD_mm || 40) / 1000,
      idle: e.idleRpmEff, redline: e.redline, events: cfg.events, banks: cfg.banks, exhaust: e.exhaust, cat: e.cat, intake: e.intake };
  }
  return r;
});
writeFileSync(new URL('./engines.json', import.meta.url), JSON.stringify(out, null, 1));
for (const [k, v] of Object.entries(out)) console.log(k, JSON.stringify({ cyl: v.cylinders, bore: v.bore, ivDia: v.ivDia, ivCount: v.ivCount, ivLift: v.ivLift, camDur: v.camDur, overlap: v.overlap, primL: +v.primL.toFixed(3), primD: v.primD, sysL: v.sysL, sysD: v.sysD, runnerL: v.runnerL, runnerD: v.runnerD }));
await b.close();
