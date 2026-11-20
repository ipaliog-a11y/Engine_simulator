// The kit wing as a wing part (build 415).
//
// WHY THIS EXISTS. The FRONT and REAR AERO kit WING was a fitted ClA and ΔCd times the class's aero factor. It is now a
// wing (wingAero, the lifting line of build 291) from a span, chord, angle, camber and end plates. What must hold:
//   · the kit tables carry no fitted lift or drag for the wing;
//   · a car with its own wing (Huracán STO, Radical SR3) wears exactly that wing's ClA and CdA, on its axle;
//   · a car without one takes its class's (the TRACK PROTOTYPE's rear), else the PARTS page's starting wing as wide as
//     its track, and the PARTS page starts from the same wing;
//   · nothing else in the car moves: the rest of its ClA and CdA is the splitter, lip and floor kits as before.
import { chromium } from './pw.mjs';
import { fileURLToPath, pathToFileURL } from 'url';
import path from 'path';
const repo = fileURLToPath(new URL('..', import.meta.url));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors = [];
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
await page.addInitScript(() => { try { localStorage.removeItem('pes.parts'); } catch (e) {} });
await page.goto(pathToFileURL(path.join(repo, 'index.html')).href, { waitUntil: 'networkidle' });
await page.waitForTimeout(400);
const fails = [];

const r = await page.evaluate(() => {
  const o = { cars: [] };
  o.kit = [AERO_FRONT.wing, AERO_REAR.wing];
  for (const n of ['Huracán STO', 'Radical SR3']) {
    loadVehiclePreset(FACTORY_CARS.find(p => p.name.includes(n)));
    const v = vehicle, af = AERO_FRONT[v.aeroFront], al = AERO_FLOOR[v.aeroFloor] || AERO_FLOOR.none;
    const W = wingAero(v.body.fit.wingR), F = v.aeroFront === 'wing' ? wingAero(kitWing(v, true)) : { clA: 0, cdA: 0 };
    const clA = (af.cl + al.cl) * v.aeroK + W.clA + F.clA, cdA = (v.body.cd + af.cd + al.cd) * v.area + W.cdA + F.cdA;
    o.cars.push({ n, wing: W.clA, fwing: F.clA, dCl: v.clA - clA, dCd: v.cdA - cdA, same: v.wing.clA === W.clA,
      kg280: 0.5 * AIR_RHO * (280 / 3.6) ** 2 * v.clA / G, start: partFromFactory('wing', 'wing').chord_mm === v.body.fit.wingR.chord_mm });
  }
  o.proto = kitWing({ chassis: 'proto', track: 1.75 }, false) === CHASSIS.proto.fit.wingR;
  o.plain = kitWing({ chassis: 'coupe', track: 1.55 }, false).span_mm;
  o.plainF = kitWing({ chassis: 'coupe', track: 1.55, trackF: 1.5 }, true);
  return o;
});
await browser.close();

const near = (a, b, e = 1e-9) => Math.abs(a - b) <= e;
console.log(`== kit tables: ${JSON.stringify(r.kit)} ==`);
if (r.kit.some(k => k.cl !== 0 || k.cd !== 0 || !k.part)) fails.push('the kit WING still carries a fitted lift or drag');
for (const c of r.cars) {
  console.log(`== ${c.n}: rear wing ClA ${c.wing.toFixed(3)}, front ${c.fwing.toFixed(3)}; car off by ${c.dCl.toExponential(1)} / ${c.dCd.toExponential(1)}; ${c.kg280.toFixed(0)} kg at 280 km/h ==`);
  if (!c.same || !near(c.dCl, 0) || !near(c.dCd, 0)) fails.push(`${c.n} does not wear exactly its own wing`);
  if (!c.start) fails.push(`the PARTS page does not start from ${c.n}'s own wing`);
}
console.log(`== proto takes its class's wing: ${r.proto}; a coupe's starting wing ${r.plain} mm, front ${JSON.stringify(r.plainF)} ==`);
if (!r.proto) fails.push("a car with no wing of its own does not take its class's");
if (r.plain !== 1550 || r.plainF.span_mm !== 1500 || r.plainF.height_mm !== 100) fails.push("the fallback is not the starting wing as wide as the track");

if (errors.length) console.log('ERRORS:\n  ' + errors.join('\n  '));
if (fails.length) console.log('\nFAIL:\n  ' + fails.join('\n  '));
else console.log('\nOK: the kit wing is a wing part: the car\'s own, else its class\'s, else the starting wing.');
process.exit(fails.length || errors.length ? 1 : 0);
