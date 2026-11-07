// A carburettor's restriction is its venturi; the induction systems' fitted ramps are gone (build 244).
//
// WHY THIS EXISTS. Until build 244 every induction system scaled the charge by a fitted ramp from idle to the redline:
// individual throttle bodies +8% at the redline, mechanical injection +5%, sidedraft carburettors +6%, a 4-barrel −3%,
// a 1-barrel −16%. The ramps that rose with rpm were part of why engines like the E30 M3's kept climbing to their
// limiter. Carburettors are rated by the air they pass at a set pressure drop (1.5 inHg), and a venturi's drop goes
// with the square of the flow. What must hold:
//   · an engine on a carburettor loses, at each rpm below the inlet Mach knee, 5.08 kPa × (Q / Q_rated)² of 101.3 kPa of its charge, against the
//     same engine on injection, with Q_rated from the makers' rule (CFM = CID × rpm × 0.85 / 3456 at the redline);
//   · the loss grows with rpm (under 2% at a third of the redline, about 5% at the redline);
//   · ITBs, a single throttle and mechanical injection breathe the same at full throttle, within 0.1% (no fitted bonus;
//     their idle speeds differ, which the runner's tuning reads);
//   · the four carburettor types breathe the same at full throttle (one sizing rule);
//   · the catalyst's fitted ramp is still there (named, for the audit of fitted parts);
//   · no page errors.
import { chromium } from './pw.mjs';
import { fileURLToPath, pathToFileURL } from 'url';
import path from 'path';
const repo = fileURLToPath(new URL('..', import.meta.url));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors = [], fails = [];
page.on('console', m => { if (m.type() === 'error' && !/ERR_FILE_NOT_FOUND/.test(m.text())) errors.push('console: ' + m.text()); });
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
await page.goto(pathToFileURL(path.join(repo, 'index.html')).href, { waitUntil: 'networkidle' });

const r = await page.evaluate(() => {
  const base = { cylinders: 6, bore_mm: 86, stroke_mm: 86, compression: 10, redline: 7000, cat: 'none', airFilter: 'none', runner: 'medium', exhaust: 'sport' };
  const ve = (sys, rpm, extra) => { applyBuild({ engine: Object.assign({}, base, { intakeSys: sys }, extra || {}), tune: Object.assign({}, STD_TUNE), vehicle: readVehicleFromForm(), name: 'test' });
    const v = computeVE(rpm, 1), Qref = engine.carbQref;
    engine.carbQref = 0; const open = computeVE(rpm, 1); engine.carbQref = Qref;   // the same build without its venturi
    return { ve: v, open, Qref, disp: engine.displacement_L }; };
  const o = { pts: [] };
  for (const rpm of [2300, 4500, 7000]) {
    const carb = ve('carb4', rpm);
    const Q = airFlowM3s(rpm, 1, carb.open / (1 - (carb.open > 0 ? 0 : 0)));
    o.pts.push({ rpm, inj: carb.open, carb: carb.ve, loss: 1 - carb.ve / carb.open, expect: 5080 * (Q / carb.Qref) ** 2 / 101325,
      Qref: carb.Qref, rule: carb.disp * 61.0237 * 7000 * 0.85 / 3456 * 0.000471947 });
  }
  o.inj = ['efi', 'itb', 'mech'].map(s => ve(s, 6500).ve);
  o.carbs = ['carb1', 'carb2', 'carb4', 'sidedraft'].map(s => ve(s, 6500).ve);
  o.cat = { none: ve('efi', 6500).ve, stock: ve('efi', 6500, { cat: 'stock' }).ve };
  return o;
});
await browser.close();

const f = (x, d = 4) => (+x).toFixed(d);
for (const p of r.pts) console.log(`== ${p.rpm} rpm: without its venturi VE ${f(p.inj)}, 4-barrel ${f(p.carb)}: loss ${f(100 * p.loss, 2)}% (venturi ${f(100 * p.expect, 2)}%); rated ${f(p.Qref * 2118.88, 0)} cfm, rule ${f(p.rule * 2118.88, 0)} ==`);
console.log(`== at 6500 rpm: EFI/ITB/mech ${r.inj.map(x => f(x)).join(' / ')}; 1-bbl/2-bbl/4-bbl/sidedraft ${r.carbs.map(x => f(x)).join(' / ')}; no cat ${f(r.cat.none)}, stock cat ${f(r.cat.stock)} ==`);

// The venturi is charged on the flow at that stage of computeVE, before the inlet Mach index and valve float trim it.
// Below the Mach knee (2300 and 4500 rpm here) that is the final flow, so the loss must be the venturi's drop exactly;
// at the redline the flow there is a little higher than the final one, so the loss is at least the drop on the final.
for (const p of r.pts) {
  if (p.rpm === 7000 ? p.loss < p.expect : Math.abs(p.loss - p.expect) > 0.0005) fails.push(`${p.rpm} rpm: the carburettor costs ${f(100 * p.loss, 2)}%, its venturi drop gives ${f(100 * p.expect, 2)}%`);
  if (Math.abs(p.Qref / p.rule - 1) > 1e-4) fails.push(`the carburettor is not sized by the makers' rule (${f(p.Qref, 5)} vs ${f(p.rule, 5)} m3/s)`);
}
const [lo, , hi] = r.pts;
if (!(lo.loss < 0.02 && hi.loss > 0.04 && hi.loss < 0.07)) fails.push(`the venturi's loss should grow from under 2% to about 5% at the redline (${f(100 * lo.loss, 2)}% → ${f(100 * hi.loss, 2)}%)`);
if (Math.max(...r.inj) / Math.min(...r.inj) - 1 > 1e-3) fails.push('ITBs, a single throttle and mechanical injection should breathe the same at full throttle (a fitted bonus is left)');
if (Math.max(...r.carbs) / Math.min(...r.carbs) - 1 > 1e-3) fails.push('the carburettor types should breathe the same at full throttle');
if (!(r.cat.stock < r.cat.none * 0.97)) fails.push('the catalyst\'s fitted ramp (named, for the audit) is gone');
if (errors.length) fails.push(...errors.slice(0, 5));
if (fails.length) { console.log('\nFAIL\n  ' + fails.join('\n  ')); process.exit(1); }
console.log('\nPASS: a carburettor costs what its venturi drops, and no induction system gets a fitted ramp');
