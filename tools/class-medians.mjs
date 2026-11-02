// Derive each body class in CHASSIS from the real cars in it (build 223).
//
//   node tools/class-medians.mjs           prints the derived values beside the ones in the code
//   node tools/class-medians.mjs --check   fails if CHASSIS is not what its real cars give
//   node tools/class-medians.mjs --json f  also writes the derived values to f
//
// A class is the median real car of that class (the combustion cars in VEHICLE_PRESETS): numbers are medians, choices
// are the most common choice. A class with fewer than MIN_CARS real cars keeps its hand-set values (a known gap,
// named in KEPT_CLASSES). Fields no real car publishes stay hand-set in every class (KEPT_FIELDS).
//
// The platform mass is the curb mass with the factory engine taken out (body.mass, as buildVehicle computes it when
// the car is loaded with its own engine), so a class's mass is a rolling chassis like the hand-set ones were.
import { chromium } from '../tests/pw.mjs';
import { fileURLToPath, pathToFileURL } from 'url';
import path from 'path';

export const MIN_CARS = 3;
// fewer than MIN_CARS real cars: GT has 2 (an 812 Superfast and a 1968 Daytona), the prototype 1 (a Radical SR3), the
// open-wheeler 1 (a BAC Mono). Their hand-set values stand until more real cars of the class are added.
export const KEPT_CLASSES = ['gt', 'proto', 'openwheel'];
// not published car by car, so the class supplies them to its real cars too: CG height, track width, the aero factor,
// the chassis price, the default gearing slider and the suspension geometry (every real combustion car carries its own,
// and each derived class's most common geometry equals its hand-set one; changing it would move the eight electric and
// hybrid cars that take theirs from the class).
export const KEPT_FIELDS = ['cg', 'track', 'aero', 'cost', 'label', 'fit.gearing', 'fit.geoF', 'fit.geoR'];

// One row per real combustion car, read from the car as the sim builds it with its own engine.
export async function collectRows(page) {
  const n = await page.evaluate(() => VEHICLE_PRESETS.length);
  const rows = [];
  for (let i = 0; i < n; i++) rows.push(await page.evaluate(i => {
    const pr = VEHICLE_PRESETS[i];
    applyBuild({ engine: Object.assign({}, FACTORY_ENGINES.find(x => x.name === pr.engine).engine), tune: Object.assign({}, STD_TUNE), vehicle: vehicleFromPreset(pr), name: pr.name });
    const v = vehicle, bd = v.body;
    return { k: pr.chassis, n: pr.name, mass: bd.mass, cd: bd.cd, area: bd.area, wb: bd.wb, fWt: bd.fWt,
      drive: v.drive, tire: v.tireType, tw: v.tireWidth, ta: v.tireAspect, wheel: v.wheelDia, brake: v.brakeType, rotor: v.rotor, susp: v.suspension,
      aF: v.aeroFront, aR: v.aeroRear, aFl: v.aeroFloor, weight: v.weightRed, gears: v.gears, gearbox: v.gearbox, diff: v.diff };
  }, i));
  return rows;
}

// The orders the part tables list their choices in, to break a tie the same way every time.
export async function tableOrders(page) {
  return page.evaluate(() => ({ drive: ['fwd', 'rwd', 'awd'], tire: Object.keys(TIRE_TYPE), brake: Object.keys(BRAKE_TYPE), susp: Object.keys(SUSPENSION),
    gearbox: Object.keys(GEARBOX), diff: Object.keys(DIFF), aF: Object.keys(AERO_FRONT), aR: Object.keys(AERO_REAR), aFl: Object.keys(AERO_FLOOR), weight: Object.keys(WEIGHT_RED),
    chassis: JSON.parse(JSON.stringify(CHASSIS)) }));
}

const median = a => { a = a.slice().sort((x, y) => x - y); const m = a.length >> 1; return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2; };
const r = (x, dp) => +x.toFixed(dp);
const step = (x, s) => Math.round(x / s) * s;
// the most common choice; a tie keeps the class's current choice if it is among the tied, else the first in table order
function mode(vals, current, order) {
  const c = {}; vals.forEach(x => c[x] = (c[x] || 0) + 1);
  const top = Math.max(...Object.values(c)), tied = Object.keys(c).filter(k => c[k] === top);
  if (tied.includes(String(current))) return current;
  return tied.sort((a, b) => order.indexOf(a) - order.indexOf(b))[0];
}

// The class values its real cars give. Returns {key: {n, cars, values}} for every class with MIN_CARS or more.
export function deriveClasses(rows, T) {
  const out = {};
  for (const key of Object.keys(T.chassis)) {
    if (KEPT_CLASSES.includes(key)) continue;
    const L = rows.filter(x => x.k === key);
    if (L.length < MIN_CARS) continue;
    const ch = T.chassis[key], f = ch.fit, col = k => L.map(x => x[k]);
    out[key] = { n: L.length, cars: L.map(x => x.n), values: {
      mass: Math.round(median(col('mass'))), cd: r(median(col('cd')), 3), area: r(median(col('area')), 3), wb: r(median(col('wb')), 3), fWt: r(median(col('fWt')), 3),
      drive: mode(col('drive'), ch.drive, T.drive),
      fit: { tire: mode(col('tire'), f.tire, T.tire), tw: step(median(col('tw')), 5), ta: step(median(col('ta')), 5), wheel: Math.round(median(col('wheel'))),
        brake: mode(col('brake'), f.brake, T.brake), rotor: step(median(col('rotor')), 5), susp: mode(col('susp'), f.susp, T.susp),
        aF: mode(col('aF'), f.aF, T.aF), aR: mode(col('aR'), f.aR, T.aR), aFl: mode(col('aFl'), f.aFl, T.aFl), weight: mode(col('weight'), f.weight, T.weight),
        gears: Math.round(median(col('gears'))), gearbox: mode(col('gearbox'), f.gearbox, T.gearbox), diff: mode(col('diff'), f.diff, T.diff) } } };
  }
  return out;
}

// Every derived value that differs from the code's: [{key, field, code, derived}].
export function compare(derived, chassis) {
  const diffs = [];
  for (const [key, d] of Object.entries(derived)) {
    const ch = chassis[key];
    for (const [k, v] of Object.entries(d.values)) {
      if (k === 'fit') { for (const [fk, fv] of Object.entries(v)) if (ch.fit[fk] !== fv) diffs.push({ key, field: 'fit.' + fk, code: ch.fit[fk], derived: fv }); }
      else if (ch[k] !== v) diffs.push({ key, field: k, code: ch[k], derived: v });
    }
  }
  return diffs;
}

export async function deriveFromPage(page) {
  const T = await tableOrders(page), rows = await collectRows(page);
  const derived = deriveClasses(rows, T);
  return { derived, diffs: compare(derived, T.chassis), chassis: T.chassis };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const repo = fileURLToPath(new URL('..', import.meta.url));
  const browser = await chromium.launch(); const page = await browser.newPage();
  await page.goto(pathToFileURL(path.join(repo, 'index.html')).href, { waitUntil: 'networkidle' });
  await page.evaluate(() => setTab('garage'));      // nothing on screen redraws while the cars load
  const { derived, diffs } = await deriveFromPage(page);
  await browser.close();
  for (const [key, d] of Object.entries(derived)) console.log(`${key} (${d.n}): ${JSON.stringify(d.values)}`);
  console.log(`kept by hand: ${KEPT_CLASSES.join(', ')} (fewer than ${MIN_CARS} real cars); fields ${KEPT_FIELDS.join(', ')}`);
  if (diffs.length) {
    console.log(`\n${diffs.length} value(s) in CHASSIS differ from what the real cars give:`);
    for (const x of diffs) console.log(`  ${x.key}.${x.field}: code ${x.code}, cars ${x.derived}`);
  } else console.log('\nOK: CHASSIS is what its real cars give.');
  const j = process.argv.indexOf('--json');
  if (j > 0 && process.argv[j + 1]) (await import('fs')).writeFileSync(process.argv[j + 1], JSON.stringify(derived, null, 1));
  if (process.argv.includes('--check') && diffs.length) process.exit(1);
}
