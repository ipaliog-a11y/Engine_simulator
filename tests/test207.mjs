// The lambda sensor: its reading on the LIVE panel, narrowband against wideband, and the fault a wrong tune sets (build 337).
//
// WHY THIS EXISTS. An engine with a catalyst has a lambda sensor, and the bench showed none. What must hold:
//   · a catalyst with port injection gives a narrowband sensor, with direct injection or a diesel a wideband one, and no
//     catalyst (or a carburettor) none; the LIVE tile says which;
//   · the narrowband reading is a Nernst voltage: above 800 mV rich, below 100 mV lean, 450 mV at lambda 1;
//   · a narrowband engine tuned off lambda 1 at part load stores P0172 (rich) or P0171 (lean); the same lean mixture on
//     the factory map of a wideband engine stores nothing, and no factory engine on its own map does either.
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
  const base = FACTORY_ENGINES.find(p => /4A-GE/.test(p.name));
  const load = over => applyBuild({ engine: Object.assign({}, base.engine, over), tune: Object.assign({}, STD_TUNE),
    vehicle: Object.assign({}, DEFAULT_VEHICLE), name: 'lambda' });
  // part load for 6 s: the codes stored, and the tile
  const run = afr => {
    obdReset(); state.coolant = 90; state.throttle = 0.3; state.load = 0.4; if (afr) state.afr = afr;
    for (let i = 0; i < 120; i++) { stepEngine(0.05); updatePhysics(); obdStep(0.05); }
    updateUI();
    const el = document.getElementById('statLambda');
    return { codes: Object.keys(obd.codes).filter(k => /P017/.test(k)).join(','), lam: +(state.afr / engine.stoichAFR).toFixed(3),
      v: el.querySelector('.value').textContent, u: el.querySelector('.unit').textContent, warn: /warning/.test(el.className) };
  };
  const o = {};
  load({ cat: 'stock', intakeSys: 'efi', injector: 'port', afrMode: 'auto' }); o.narrowKind = engine.lambdaSensor; o.narrowAuto = run();
  load({ cat: 'stock', intakeSys: 'efi', injector: 'port', afrMode: 'fixed' }); o.rich = run(12.5); o.lean = run(16.5); o.stoich = run(14.7);
  load({ cat: 'stock', intakeSys: 'efi', injector: 'direct', afrMode: 'auto' }); o.wideKind = engine.lambdaSensor; o.wideAuto = run();
  load({ cat: 'stock', intakeSys: 'efi', injector: 'direct', afrMode: 'fixed' }); o.wideLean = run(16.5);
  load({ cat: 'none', intakeSys: 'efi', injector: 'port', afrMode: 'fixed' }); o.noneKind = engine.lambdaSensor; o.none = run(12.5);
  load({ cat: 'stock', intakeSys: 'carb2' }); o.carbKind = engine.lambdaSensor;
  const d = FACTORY_ENGINES.find(p => p.engine.type === 'diesel'); applyBuild({ engine: Object.assign({}, d.engine), tune: Object.assign({}, STD_TUNE), vehicle: Object.assign({}, DEFAULT_VEHICLE), name: d.name });
  o.dieselKind = engine.lambdaSensor; o.diesel = run();
  o.mv = [0.9, 1, 1.1].map(l => Math.round(lambdaSensorMv(l)));
  return o;
});

console.log(`== sensor: port + cat ${r.narrowKind}, DI + cat ${r.wideKind}, diesel ${r.dieselKind}, no cat ${r.noneKind}, carburettor ${r.carbKind} ==`);
if (r.narrowKind !== 'narrow' || r.wideKind !== 'wide' || r.dieselKind !== 'wide' || r.noneKind !== 'none' || r.carbKind !== 'none') fails.push('the sensor fitted is not what the catalyst and the injection call for');
console.log(`== Nernst cell: ${r.mv[0]} mV at lambda 0.9, ${r.mv[1]} at 1, ${r.mv[2]} at 1.1 ==`);
if (!(r.mv[0] > 800 && r.mv[1] === 450 && r.mv[2] < 100)) fails.push('the narrowband voltage is not a switch about 450 mV');
const show = (n, x) => console.log(`   ${n.padEnd(28)} lambda ${x.lam}  tile "${x.v} ${x.u}"${x.warn ? ' (amber)' : ''}  codes: ${x.codes || 'none'}`);
show('narrowband, factory map', r.narrowAuto); show('narrowband, AFR 12.5', r.rich); show('narrowband, AFR 16.5', r.lean);
show('narrowband, AFR 14.7', r.stoich); show('wideband, factory map', r.wideAuto); show('wideband, AFR 16.5', r.wideLean);
show('no catalyst, AFR 12.5', r.none); show('diesel, factory map', r.diesel);
if (r.narrowAuto.codes || r.stoich.codes || r.wideAuto.codes || r.diesel.codes) fails.push('a correct tune stores a mixture code');
if (r.rich.codes !== 'P0172' || !r.rich.warn || !/mV/.test(r.rich.u) || !(+r.rich.v > 800)) fails.push('a narrowband engine run rich at part load does not store P0172 and read rich');
if (r.lean.codes !== 'P0171' || !(+r.lean.v < 100)) fails.push('a narrowband engine run lean at part load does not store P0171 and read lean');
if (r.wideLean.codes || Math.abs(+r.wideLean.v - r.wideLean.lam) > 0.006 || !/λ/.test(r.wideLean.u)) fails.push('a wideband engine run lean does not read its lambda, or stores a code');
if (r.none.codes || r.none.v !== '—') fails.push('an engine with no catalyst has a lambda reading or a mixture code');

if (errors.length) console.log('ERRORS:\n  ' + errors.join('\n  '));
if (fails.length) console.log('\nFAIL:\n  ' + fails.join('\n  '));
else console.log('\nOK: the lambda sensor reads, narrowband and wideband differ, and a wrong tune sets its code.');
await browser.close();
process.exit(fails.length || errors.length ? 1 : 0);
