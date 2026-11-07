// Engine friction is derived from the engine's own parts (build 243).
//
// WHY THIS EXISTS. Until build 243 every piston engine's rubbing friction was one fitted curve, (0.55 + 1.8e-8 N²) bar
// times a stroke factor, the same for a pushrod V8 and a twin-cam four. It is now the Patton–Nitschke–Heywood model as
// revised by Sandoval and Heywood (SAE 2003-01-0725), built from bore, stroke, cylinders, valves, lift, compression,
// intake pressure and the valvetrain. What must hold:
//   · the model's terms, computed here by hand from the thesis's equations for the S14, give what the sim gives;
//   · friction rises with rpm, with intake pressure (the rings' gas load) and with stroke at the same rpm;
//   · at the same engine, by the thesis's Table 4.2: twin cams over buckets rub least, then a single cam with rockers,
//     then flat-tappet pushrods; and a roller rubs less than the same layout sliding;
//   · a rotary and a two-stroke keep the old curve (the model is for poppet-valve four-strokes);
//   · VALVETRAIN is on HEAD & VALVES; a factory engine loads its own (the LS3's pushrods with rollers, the B16B's
//     rockers), a design without one follows its valves, and a change moves the scorecard's power the right way;
//   · its labels and help have Greek; no page errors.
import { chromium } from './pw.mjs';
import { fileURLToPath, pathToFileURL } from 'url';
import path from 'path';
const repo = fileURLToPath(new URL('..', import.meta.url));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
const errors = [], fails = [];
page.on('console', m => { if (m.type() === 'error' && !/ERR_FILE_NOT_FOUND/.test(m.text())) errors.push('console: ' + m.text()); });
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
await page.goto(pathToFileURL(path.join(repo, 'index.html')).href, { waitUntil: 'networkidle' });

const r = await page.evaluate(() => {
  const load = (e, name) => { applyBuild({ engine: e, tune: Object.assign({}, STD_TUNE), vehicle: readVehicleFromForm(), name: name || 'test' }); };
  const pr = n => FACTORY_ENGINES.find(p => p.name.includes(n));
  const o = {};
  // the S14 by hand: B 93.4, S 84, 4 cyl, CR 10.5, DOHC buckets, 4 valves
  load(Object.assign({}, pr('S14B23').engine), pr('S14B23').name);
  const N = 6000, B = 93.4, S = 84, nc = 4, Dm = 0.65 * B, Dp = 0.56 * B, Lv = engine.ivLift_mm, Sp = 2 * S * N / 60000, b = 1 + 500 / N;
  const brg = (D, n) => 3.03e-4 * N * D ** 3 * (0.35 * D) * n / (B * B * S * nc);
  const hand = 1.22e5 * Dm / (B * B * S * nc) + brg(Dm, 5) + 1.35e-10 * Dm * Dm * N * N * 5 / nc
    + 294 * Sp / B + 4.06e4 * b / (B * B) + brg(Dp, 4)
    + 6.89 * (0.088 * 10.5 + 0.182 * Math.pow(10.5, 1.33 - 2 * 2.38e-2 * Sp))
    + 244 * N * 10 / (B * B * S * nc) + 4.12 + 133 * b * 16 / (S * nc) + 0.5 * Lv ** 1.5 * Math.sqrt(N) * 16 / (B * S * nc) + 10.7 * b * Lv * 16 / (S * nc)
    + 6.23 + 5.22e-3 * N - 1.79e-7 * N * N;
  o.s14 = { vt: engine.vtMech, sim: mechFrictionMEP(N, 1) * 100, hand, f2: mechFrictionMEP(2000, 1), f7: mechFrictionMEP(7000, 1), boost: mechFrictionMEP(N, 2) };
  o.s14long = (load(Object.assign({}, pr('S14B23').engine, { stroke_mm: 95 })), mechFrictionMEP(N, 1));
  o.byVt = {};
  for (const vt of ['dohc-bucket', 'dohc-finger', 'dohc-roller', 'sohc-rocker', 'sohc-roller', 'ohv', 'ohv-roller']) { load(Object.assign({}, pr('S14B23').engine, { valvetrain: vt })); o.byVt[vt] = { f: mechFrictionMEP(5000, 1), hp: engine.score.peakHP }; }
  const old = (n, s) => (0.55 + 1.8e-8 * n * n) * (1 + (s - 86) / 320);
  for (const k of ['13B-REW', 'RD350LC']) { load(Object.assign({}, pr(k).engine), pr(k).name); o[k] = { sim: mechFrictionMEP(5000, 1), old: old(5000, engine.stroke_mm) }; }
  // the form
  load(Object.assign({}, pr('LS3').engine), pr('LS3').name); setTab('design');
  o.ls3 = { form: document.getElementById('edValvetrain').value, inHead: !!document.querySelector('#icdCard-head #edValvetrain') };
  load(Object.assign({}, pr('B16B').engine), pr('B16B').name); o.b16 = document.getElementById('edValvetrain').value;
  const plain = Object.assign({}, pr('B16B').engine); delete plain.valvetrain; load(plain); o.def4 = document.getElementById('edValvetrain').value;
  load(Object.assign({}, plain, { valves: 2 })); o.def2 = document.getElementById('edValvetrain').value;
  o.labels = [...document.querySelectorAll('#edValvetrain option')].map(x => x.textContent);
  return o;
});
const tr = await page.evaluate(() => ({ missing: ['VALVETRAIN', ...[...document.querySelectorAll('#edValvetrain option')].map(o => o.textContent),
  ICD_FIELDS.edValvetrain.what, ICD_FIELDS.edValvetrain.trade].filter(s => !(I18N[s] && I18N[s].el)) }));
await browser.close();

const f = (x, d = 1) => (+x).toFixed(d);
console.log(`== S14 at 6000 rpm, full load: sim ${f(r.s14.sim)} kPa, by hand ${f(r.s14.hand)} kPa (${r.s14.vt}); 2000 rpm ${f(r.s14.f2, 2)}, 7000 ${f(r.s14.f7, 2)}, 2 bar ${f(r.s14.boost, 2)}, 95 mm stroke ${f(r.s14long, 2)} bar ==`);
console.log('== at 5000 rpm by valvetrain: ' + Object.entries(r.byVt).map(([k, v]) => `${k} ${f(v.f, 3)} bar ${v.hp} hp`).join(' · ') + ' ==');
console.log(`== 13B ${f(r['13B-REW'].sim, 3)} (old ${f(r['13B-REW'].old, 3)}), RD350 ${f(r.RD350LC.sim, 3)} (old ${f(r.RD350LC.old, 3)}) ==`);
console.log(`== form: LS3 ${r.ls3.form}, B16B ${r.b16}, 4-valve design ${r.def4}, 2-valve ${r.def2}; options ${r.labels.join(' | ')} ==`);

if (r.s14.vt !== 'dohc-bucket') fails.push(`the S14 should be twin cams over buckets, got ${r.s14.vt}`);
if (Math.abs(r.s14.sim - r.s14.hand) > 0.05) fails.push(`the S14's friction is ${f(r.s14.sim)} kPa, the thesis's equations give ${f(r.s14.hand)}`);
if (!(r.s14.f2 < r.s14.sim / 100 && r.s14.sim / 100 < r.s14.f7)) fails.push('friction does not rise with rpm');
if (!(r.s14.boost > r.s14.sim / 100)) fails.push('the rings\' gas load does not rise with intake pressure');
if (!(r.s14long > r.s14.sim / 100)) fails.push('a longer stroke at the same rpm does not rub more');
const v = r.byVt;
if (!(v['dohc-bucket'].f < v['sohc-rocker'].f && v['sohc-rocker'].f < v.ohv.f))
  fails.push('the valvetrains are not in the order twin-cam buckets < single-cam rockers < flat-tappet pushrods');
for (const [roll, flat] of [['dohc-roller', 'dohc-finger'], ['sohc-roller', 'sohc-rocker'], ['ohv-roller', 'ohv']])
  if (!(v[roll].f < v[flat].f)) fails.push(`${roll} does not rub less than ${flat}`);
if (!(v['dohc-bucket'].hp > v.ohv.hp)) fails.push('twin-cam buckets do not give more power than flat-tappet pushrods');
for (const k of ['13B-REW', 'RD350LC']) if (Math.abs(r[k].sim - r[k].old) > 1e-9) fails.push(`${k} should keep the old curve`);
if (r.ls3.form !== 'ohv-roller') fails.push(`the LS3 loads ${r.ls3.form}, not pushrods with rollers`);
if (!r.ls3.inHead) fails.push('VALVETRAIN is not on HEAD & VALVES');
if (r.b16 !== 'dohc-finger') fails.push(`the B16B loads ${r.b16}, not twin cams with rockers`);
if (r.def4 !== 'dohc-bucket' || r.def2 !== 'sohc-rocker') fails.push(`a design without a valvetrain should follow its valves (4: ${r.def4}, 2: ${r.def2})`);
if (tr.missing.length) fails.push('no Greek for: ' + tr.missing.join(' | '));
if (errors.length) fails.push(...errors.slice(0, 5));
if (fails.length) { console.log('\nFAIL\n  ' + fails.join('\n  ')); process.exit(1); }
console.log('\nPASS: friction is built from the engine\'s own bearings, pistons, rings and valvetrain');
