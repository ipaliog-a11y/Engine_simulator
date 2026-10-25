// The turbine housing as the builder's choice, and the turbo manifold as short as it can be built.
//
// WHY THIS EXISTS. Two attempts at deriving the housing A/R per engine (tests/proto/README.md) showed
// that which side of the compromise to take — spool or top end — is a design intent, and any objective
// decides it silently: minimum sweep time handed the GTI 287 hp against the 220 VW chose to make with
// a small turbine. So the housing is a hardware option, three catalogue steps per frame, and these
// checks are about what the choice must DO, not about which one is best. The physics win found on the
// way is the manifold: turbo engines were carrying a tuned NA header's 550-780 mm primaries, which
// smooth away the blowdown pulse the turbine runs on.
import { chromium } from './pw.mjs';
import { fileURLToPath, pathToFileURL } from 'url';
import path from 'path';
const repo = fileURLToPath(new URL('..', import.meta.url));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
const errors = [];
page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
await page.goto(pathToFileURL(path.join(repo, 'index.html')).href, { waitUntil: 'networkidle' });
await page.waitForTimeout(400);
const fails = [];

const r = await page.evaluate(() => {
  const build = (nm, over) => { applyEngineToForm(Object.assign({}, DEFAULT_ENGINE, PRESETS.find(p => p.name === nm).engine, over || {})); buildEngine(); };
  const r90 = () => { for (let n = 800; n <= engine.redline; n += 25) if (boostAvail(n) >= 0.9 * engine.maxBoost) return n; return Infinity; };
  const out = {};
  // 1. the choice does what it says, on a fixed housing and on a vane ring
  out.ladder = [['2.0 Turbo Hot-Hatch I4', {}], ['1.0 Kei Turbo I3', {}], ['2.0 Turbo Diesel I4', {}]].map(([nm, o]) => ({
    nm, vgt: !!PRESETS.find(p => p.name === nm).engine.vgt,
    steps: ['tight', 'stock', 'loose'].map(h => { build(nm, Object.assign({ housing: h }, o));
      return { h, ar: engine.turbineAR, r90: r90(), hp: engine.score.peakHP, form: document.getElementById('edHousing').value }; })
  }));
  // 2. STOCK is the A/R each frame always had, so no existing build moved by being given the option
  out.stock = Object.entries(TURBO).map(([k, t]) => ({ k, ar: t.ars[TURBINE_HOUSING.stock] }));
  // 3. a turbo manifold is short, and keeps more of the pulse than the tuned header would
  build('2.0 Turbo Hot-Hatch I4');
  const e = engine, at = 2500, map = 1 + boostAvail(at), mEx = airFlowAt(at, map) * 1.06, T = egtAt(at, map);
  const kept = pulseShape(mEx, e.turbineArea, T, map).keep, Lturbo = e.primL;
  build('2.0 Turbo Hot-Hatch I4', { intake: 'na' });
  out.manifold = { Lturbo, Lna: engine.primL, kept };
  // 4. the option is greyed out where there is no turbine
  build('1.6 Sport NA I4');
  out.disabledNA = document.getElementById('edHousing').disabled;
  // and on a vane ring, which sets its own throat (build 168)
  build('2.0 Turbo Diesel I4');
  out.disabledVGT = document.getElementById('edHousing').disabled;
  return out;
});

console.log('== the housing choice does what it says ==');
for (const l of r.ladder) {
  console.log(`  ${l.nm}${l.vgt ? ' (VGT)' : ''}`);
  for (const s of l.steps) console.log(`    ${s.h.padEnd(5)} A/R ${s.ar.toFixed(2)}  90% boost @ ${s.r90} rpm  ${s.hp} hp  (form: ${s.form})`);
  const [t, s, o] = l.steps;
  // build 168: a vane ring sets its own throat, so the A/R choice is a fixed housing's and leaves a VGT as it is
  if (l.vgt) {
    if (!(t.r90 === o.r90 && t.hp === o.hp)) fails.push(`${l.nm}: the housing A/R still changes a vane ring (${t.r90}/${o.r90} rpm, ${t.hp}/${o.hp} hp)`);
    for (const x of l.steps) if (x.form !== x.h) fails.push(`${l.nm}: the form shows ${x.form} for a ${x.h} housing`);
    continue;
  }
  if (!(t.ar < s.ar && s.ar < o.ar)) fails.push(`${l.nm}: housing A/R does not step tight < stock < loose`);
  if (!(t.r90 <= s.r90 && s.r90 <= o.r90)) fails.push(`${l.nm}: a tighter housing must not spool later (${t.r90} / ${s.r90} / ${o.r90})`);
  if (!(t.r90 < o.r90)) fails.push(`${l.nm}: tight and loose spool at the same speed — the choice does nothing`);
  if (!(o.hp >= t.hp)) fails.push(`${l.nm}: a looser housing must not cost top-end power (${t.hp} -> ${o.hp} hp)`);
  for (const x of l.steps) if (x.form !== x.h) fails.push(`${l.nm}: the form shows ${x.form} for a ${x.h} housing`);
}
const was = { small: 0.42, medium: 0.64, large: 0.86 };
for (const s of r.stock) if (Math.abs(s.ar - was[s.k]) > 1e-9) fails.push(`${s.k} frame: STOCK housing is ${s.ar}, it was ${was[s.k]}`);

console.log(`\n== the turbo manifold: ${Math.round(r.manifold.Lturbo * 1000)} mm runners against a ${Math.round(r.manifold.Lna * 1000)} mm tuned header; ${(r.manifold.kept * 100).toFixed(0)}% of each pulse reaches the turbine ==`);
if (!(r.manifold.Lturbo < r.manifold.Lna)) fails.push('a turbo manifold should be shorter than the tuned header the same engine gets NA');
if (!(r.manifold.kept > 0.2)) fails.push(`only ${(r.manifold.kept * 100).toFixed(0)}% of the pulse survives a packaging-length manifold`);

console.log(`== the option is disabled on an NA build: ${r.disabledNA} ==`);
if (!r.disabledNA) fails.push('TURBINE A/R should be disabled without a turbo');
console.log(`== and on a vane ring: ${r.disabledVGT} ==`);
if (!r.disabledVGT) fails.push('TURBINE A/R should be disabled on a VGT, whose vane ring sets its own throat');

if (errors.length) fails.push(...errors);
console.log(fails.length ? '\nFAIL:\n  ' + fails.join('\n  ') : '\nPASS');
await browser.close();
process.exit(fails.length ? 1 : 0);
