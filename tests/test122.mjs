// Real cars are drawn from their own side profile, and the picture still follows the build.
//
// A 911 used to be the same wedge as a Countach, because both are chassis 'super'. CAR_PROFILES
// gives each preset its own height, overhangs and silhouette. Colour, the pickup bed and a stripe
// stay on the archetype. An open-wheeler is a pontoon and a hoop. A car that does not fit the
// 168-wide grid shrinks, wheels included, instead of being clipped.
import { chromium } from './pw.mjs';
import { fileURLToPath, pathToFileURL } from 'url';
import path from 'path';
const repo = fileURLToPath(new URL('..', import.meta.url));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
const errors = [];
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
await page.goto(pathToFileURL(path.join(repo, 'index.html')).href, { waitUntil: 'networkidle' });
const fails = [];

const out = await page.evaluate(() => {
  const lit = b => b.c.filter(Boolean).length;
  const names = FACTORY_CARS.map(p => p.name);
  const keys = Object.keys(CAR_PROFILES);
  const missing = names.filter(n => !CAR_PROFILES[n]);
  const extra = keys.filter(n => !names.includes(n));
  const bad = [], blank = [], thrown = [];
  let minLit = 1e9, maxLen = 0, scaled = [];
  const shapes = {};
  for (const p of FACTORY_CARS) {
    const spec = CAR_PROFILES[p.name];
    if (!spec) continue;
    const u = [spec.bk, spec.rr, spec.rf, spec.ws];
    if (!(spec.bk >= 0.05 && u[0] < u[1] && u[1] < u[2] && u[2] < u[3] && u[3] <= 0.92)) bad.push(p.name + ' order');
    for (const k of ['nose', 'hood', 'deck', 'tail']) if (!(spec[k] >= 0.12 && spec[k] <= 0.85)) bad.push(p.name + ' ' + k);
    if (spec.col || spec.bed || spec.stripe) bad.push(p.name + ' overrides livery');
    const v = vehicleFromPreset(p);
    let G;
    try { G = carGeometry(v); }
    catch (e) { thrown.push(p.name + ' geo ' + e.message); continue; }
    if (!(G.lenPx <= CAR_GW - 12 + 0.01)) bad.push(p.name + ' length ' + G.lenPx.toFixed(1));
    if (CAR_GY - G.L.h * G.pxm < 1) bad.push(p.name + ' roof');
    if (!(G.L.ovR > 0 && G.L.ovF > 0)) bad.push(p.name + ' overhang');
    if (Math.abs(G.lenPx / G.pxm - spec.len) > 0.02) bad.push(p.name + ' length drifted');
    if (G.L.col !== (CAR_LOOK[v.chassis] || CAR_LOOK.coupe).col) bad.push(p.name + ' colour');
    maxLen = Math.max(maxLen, G.lenPx);
    if (G.pxm < CAR_PXM - 0.01) scaled.push(p.name);
    const b = new PixBuf(CAR_GW, CAR_GH);
    try { drawCarSprite(b, v, DEFAULT_ENGINE, 0); }
    catch (e) { thrown.push(p.name + ' ' + e.message); continue; }
    const n = lit(b);
    minLit = Math.min(minLit, n);
    if (n < 250) blank.push(p.name + ' ' + n);
    shapes[p.name] = [G.L.bk, G.L.rr, G.L.rf, G.L.ws, G.L.h, G.L.ovF, G.L.ovR].join(',');
  }
  const arch = chassis => carGeometry(Object.assign({}, DEFAULT_VEHICLE, { chassis }));
  const v911 = vehicleFromPreset(FACTORY_CARS.find(p => p.name.startsWith('Porsche 911 Carrera RS')));
  const cayman = vehicleFromPreset(FACTORY_CARS.find(p => p.name.startsWith('Porsche 718 Cayman')));
  const g911 = carGeometry(v911), gCay = carGeometry(cayman);
  const countach = carGeometry(vehicleFromPreset(FACTORY_CARS.find(p => /Countach/.test(p.name))));
  const cruiser = carGeometry(vehicleFromPreset(FACTORY_CARS.find(p => /Land Cruiser 200/.test(p.name))));
  const etype = carGeometry(vehicleFromPreset(FACTORY_CARS.find(p => /E-Type/.test(p.name))));
  const trab = carGeometry(vehicleFromPreset(FACTORY_CARS.find(p => /Trabant/.test(p.name))));
  const atom = vehicleFromPreset(FACTORY_CARS.find(p => /Atom/.test(p.name)));
  const elise = vehicleFromPreset(FACTORY_CARS.find(p => /Elise/.test(p.name)));
  const hilux = carGeometry(vehicleFromPreset(FACTORY_CARS.find(p => /Hilux/.test(p.name))));
  const fill = v => { const b = new PixBuf(CAR_GW, CAR_GH); drawCarSprite(b, v, DEFAULT_ENGINE, 0); return b.c.filter(Boolean).length; };
  // a wing and a bigger wheel still change a real car
  const draw = o => { const b = new PixBuf(CAR_GW, CAR_GH); drawCarSprite(b, Object.assign({}, v911, o), DEFAULT_ENGINE, 0); return b.c.join(','); };
  const tyre = o => { const b = new PixBuf(CAR_GW, CAR_GH); drawCarSprite(b, Object.assign({}, v911, o), DEFAULT_ENGINE, 0); return b.c.filter(c => c === '#1c1c26').length; };
  const marker = () => {
    const b = new PixBuf(CAR_GW, CAR_GH); drawCarSprite(b, v911, DEFAULT_ENGINE, 0);
    for (let x = 0; x < CAR_GW; x++) for (let y = 0; y < CAR_GH; y++) if (b.get(x, y) === '#00ff88' && b.get(x + 2, y) === '#00ff88') return x;
    return -1;
  };
  const supers = FACTORY_CARS.filter(p => p.chassis === 'super').map(p => shapes[p.name]);
  return {
    n: names.length, keys: keys.length, missing, extra, bad, blank, thrown, minLit, maxLen, scaled,
    rsRear: g911.L.ovR, cayRear: gCay.L.ovR, rsBk: g911.L.bk, cayBk: gCay.L.bk,
    countachH: countach.L.h, cruiserH: cruiser.L.h, etypeWs: etype.L.ws,
    trabLen: trab.lenPx / trab.pxm, trabBk: trab.L.bk, keiBk: arch('kei').L.bk,
    atomFill: fill(atom), eliseFill: fill(elise), atomTub: carGeometry(atom).L.tub,
    hiluxBed: hilux.L.bed, hiluxCol: hilux.L.col,
    wing: draw({ aeroRear: 'wing' }) !== draw({ aeroRear: 'none' }),
    wheels: tyre({ wheelDia: 20, tireAspect: 40 }) > tyre({ wheelDia: 15, tireAspect: 40 }),
    engX: marker(), midX: (g911.xr + g911.xf) / 2,
    superShapes: new Set(supers).size, superN: supers.length,
    archKei: arch('kei').lenPx, archPickup: arch('pickup').lenPx
  };
});

console.log(`== profiles: ${out.keys} for ${out.n} cars · sparsest sprite ${out.minLit} px · longest ${out.maxLen.toFixed(0)} px · scaled: ${(out.scaled || []).join(', ') || 'none'} ==`);
console.log(`== 911 rear overhang ${out.rsRear.toFixed(2)} vs Cayman ${out.cayRear.toFixed(2)} · Countach h ${out.countachH} · Land Cruiser h ${out.cruiserH} · E-Type screen at ${out.etypeWs} ==`);
if (out.missing.length) fails.push('no profile for ' + out.missing.join(', '));
if (out.extra.length) fails.push('profile for an unknown car ' + out.extra.join(', '));
if (out.keys !== out.n) fails.push(`expected ${out.n} profiles, found ${out.keys}`);
if (out.bad.length) fails.push(out.bad.slice(0, 6).join('; '));
if (out.blank.length) fails.push('nearly empty: ' + out.blank.join(', '));
if (out.thrown.length) fails.push('threw: ' + out.thrown.slice(0, 3).join('; '));
if (!(out.rsRear > out.cayRear + 0.05)) fails.push('a 911 is not longer behind the rear axle than a Cayman');
if (!(out.rsBk < out.cayBk - 0.05)) fails.push('a 911 fastback and a Cayman share a tail');
if (!(out.countachH < 1.12)) fails.push('the Countach is not its own low height');
if (!(out.cruiserH > 1.80)) fails.push('the Land Cruiser is not taller than a crossover');
if (!(out.etypeWs < 0.52)) fails.push('the E-Type cabin has not moved back');
if (!(out.trabLen > 3.4 && out.trabBk > out.keiBk + 0.1)) fails.push('the Trabant is still drawn as a short kei');
if (!out.atomTub || !(out.atomFill < out.eliseFill * 0.85)) fails.push('the Atom is drawn as a closed roadster');
if (out.hiluxBed !== 1) fails.push('a pickup lost its open bed');
if (out.hiluxCol !== '#a0603a') fails.push('a pickup lost its archetype colour');
if (!out.wing) fails.push('a rear wing does not show on a real car');
if (!out.wheels) fails.push('bigger wheels do not show on a real car');
if (!(out.engX >= 0 && out.engX < out.midX)) fails.push('a 911 does not carry its engine behind the cabin');
if (!(out.superShapes >= 6)) fails.push('super cars still share one silhouette (' + out.superShapes + ')');
if (!(out.archPickup > out.archKei * 1.3)) fails.push('a generic pickup is no longer longer than a generic kei');
if (errors.length) fails.push(...errors);
console.log(fails.length ? '\nFAIL:\n  ' + fails.join('\n  ') : '\nPASS');
await browser.close();
process.exit(fails.length ? 1 : 0);
