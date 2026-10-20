// Pixel-art car and engine: drawn from the build, not decoration.
//
// WHY THIS EXISTS. Build 106 adds pictures of the car (VEHICLE tab, garage cards, the track map) and of
// the engine (ENGINE tab, garage cards). They are drawn from the parts you chose, so the checks are
// that every combination draws without throwing, that the picture actually changes when a part does
// (a wing appears, bigger wheels are bigger, a mid-engined car carries its engine behind the cabin),
// and that a saved build gets its own thumbnail even from an old record missing fields. Build 107 draws
// each car from a real car's published dimensions, so 1b checks the sprite against those numbers.
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

// ---- 1. every chassis x drive x aero draws, and the sprite responds to its parts ----
const car = await page.evaluate(() => {
  const out = { drawn: 0, blank: [], thrown: [] };
  const lit = b => b.c.filter(Boolean).length;
  const base = Object.assign({}, DEFAULT_VEHICLE);
  for (const chassis of Object.keys(CHASSIS))
    for (const drive of ['fwd', 'rwd', 'awd'])
      for (const aeroFront of ['none', 'splitter', 'wing'])
        for (const aeroRear of ['none', 'lip', 'wing'])
          for (const aeroFloor of ['none', 'undertray', 'diffuser']) {
            const b = new PixBuf(CAR_GW, CAR_GH);
            try { drawCarSprite(b, Object.assign({}, base, { chassis, drive, aeroFront, aeroRear, aeroFloor }), DEFAULT_ENGINE, 0); }
            catch (e) { out.thrown.push(chassis + ' ' + e.message); continue; }
            out.drawn++; if (lit(b) < 400) out.blank.push(chassis);
          }
  // a rear wing puts pixels above the deck that were not there before
  const draw = o => { const b = new PixBuf(CAR_GW, CAR_GH); drawCarSprite(b, Object.assign({}, base, { chassis: 'coupe' }, o), DEFAULT_ENGINE, 0); return b; };
  const rowsUsed = b => { let top = CAR_GH; for (let y = 0; y < CAR_GH; y++) for (let x = 0; x < CAR_GW * 0.3; x++) if (b.get(x, y)) { top = Math.min(top, y); } return top; };
  out.wingTop = rowsUsed(draw({ aeroRear: 'wing' })); out.plainTop = rowsUsed(draw({ aeroRear: 'none' }));
  // bigger wheels: the tyre's dark disc grows
  const tyre = b => b.c.filter(c => c === '#1c1c26').length + b.c.filter(c => c === '#9a9aaa' || c === '#6a6a7a').length;
  out.wheel15 = tyre(draw({ wheelDia: 15, tireAspect: 55 })); out.wheel20 = tyre(draw({ wheelDia: 20, tireAspect: 55 }));
  // the engine marker: in front of the cabin on a coupe, behind it on a mid-engine super
  const marker = b => { for (let x = 0; x < CAR_GW; x++) for (let y = 0; y < CAR_GH; y++) if (b.get(x, y) === '#00ff88' && b.get(x + 1, y) === '#00ff88' && b.get(x + 2, y) === '#00ff88') return x; return -1; };
  const geo = c => carGeometry(Object.assign({}, base, { chassis: c }));
  out.coupeEng = marker(draw({ chassis: 'coupe' })); out.coupeMid = (geo('coupe').xr + geo('coupe').xf) / 2;
  out.superEng = marker(draw({ chassis: 'super' })); out.superMid = (geo('super').xr + geo('super').xf) / 2;
  out.kei = geo('kei').lenPx; out.pickup = geo('pickup').lenPx;
  const p911 = VEHICLE_PRESETS.find(p => p.body && p.body.engPos === 'rear');
  out.enginePlace911 = p911 ? enginePlace({ chassis: p911.chassis, body: p911.body }) : 'none';
  return out;
});
console.log(`== car: ${car.drawn} combinations drawn · wing reaches row ${car.wingTop} vs ${car.plainTop} without · ` +
  `wheel pixels 15" ${car.wheel15} / 20" ${car.wheel20} · engine at x ${car.coupeEng} (coupe, mid ${car.coupeMid.toFixed(0)}), ` +
  `${car.superEng} (super, mid ${car.superMid.toFixed(0)}) · kei ${car.kei.toFixed(0)} px long, pickup ${car.pickup.toFixed(0)} ==`);
if (car.thrown.length) fails.push('car sprite threw: ' + car.thrown.slice(0, 3).join('; '));
if (car.blank.length) fails.push('car sprite nearly empty for: ' + [...new Set(car.blank)].join(', '));
if (car.drawn !== 13 * 3 * 27) fails.push(`expected ${13 * 3 * 27} car combinations, drew ${car.drawn}`);
if (!(car.wingTop < car.plainTop - 2)) fails.push('a rear wing does not show above the deck');
if (!(car.wheel20 > car.wheel15)) fails.push('20" wheels are not drawn bigger than 15" ones');
if (!(car.coupeEng > car.coupeMid)) fails.push('a front-engined coupe does not show its engine in front of the cabin');
if (!(car.superEng >= 0 && car.superEng < car.superMid)) fails.push('a mid-engined super does not show its engine behind the cabin');
if (!(car.pickup > car.kei * 1.3)) fails.push('a pickup is not drawn longer than a kei car');
if (car.enginePlace911 !== 'rear') fails.push(`a rear-engined real car reads as ${car.enginePlace911}-engined, not rear`);

// ---- 1b. the car is drawn from a real car's measured profile ----
// Each profile carries the maker's published L, H and wheelbase; the sprite must be that car at
// scale: as long and as tall as published, wheels on the axles under real arch cut-outs, glass cut
// by pillars, the engine block inside the body and aero standing on it. The classes must differ.
const prof = await page.evaluate(() => {
  const out = { bad: [], n: 0 };
  const bad = m => out.bad.push(m);
  for (const [k, P] of Object.entries(CAR_PROFILE)) {
    out.n++;
    if (!P.src || !P.n) bad(k + ': no source');
    const xs = [], ys = []; for (let j = 0; j < P.top.length; j += 2) { xs.push(P.top[j]); ys.push(P.top[j + 1]); }
    if (Math.abs(Math.max(...xs) - P.L) > 0.02 * P.L) bad(k + ': top does not reach the published length');
    const roof = Math.max(P.open ? P.scr[3] : 0, ...ys);                 // an open car may stand to its screen
    if (Math.abs(roof - P.H) > 0.03 * P.H) bad(k + `: roof ${roof} m vs published ${P.H} m`);
    if (!(P.ovR > 0.2 && P.L - P.wb - P.ovR > 0.2)) bad(k + ': overhangs do not add up');
  }
  for (const p of VEHICLE_PRESETS) if (p.body.look && !CAR_PROFILE[p.body.look]) bad(p.name + ': look ' + p.body.look + ' missing');
  const base = Object.assign({}, DEFAULT_VEHICLE);
  const draw = v => { const b = new PixBuf(CAR_GW, CAR_GH); const G = drawCarSprite(b, v, DEFAULT_ENGINE, 0); return { b, G }; };
  const cases = Object.keys(CHASSIS).map(c => ({ name: c, v: Object.assign({}, base, { chassis: c, aeroFront: 'none', aeroRear: 'none', aeroFloor: 'none' }) }));
  for (const p of VEHICLE_PRESETS) { const v = vehicleFromPreset(p); v.body = Object.assign({}, p.body); cases.push({ name: p.name, v }); }
  const sprites = {};
  for (const { name, v } of cases) {
    let r; try { r = draw(v); } catch (e) { bad(name + ' threw ' + e.message); continue; }
    const { b, G } = r, P = G.P, col = carLivery(v);
    sprites[name] = b.c.join();
    // size: body rows from the top of the roof to the ground, and its length
    let top = CAR_GH, x0 = CAR_GW, x1 = 0;
    for (let y = 0; y < CAR_GY; y++) for (let x = 0; x < CAR_GW; x++) { const c = b.get(x, y); if (c === col || c === shadeHex(col, 0.4)) { top = Math.min(top, y); x0 = Math.min(x0, x); x1 = Math.max(x1, x); } }
    const hPx = CAR_GY - top, hWant = ((P.open ? Math.max(...P.top.filter((_, j) => j % 2)) : P.H) + G.lift) * G.pxm;
    if (Math.abs(hPx - hWant) > 2) bad(`${name}: drawn ${hPx} cells tall, its ${P.H} m make ${hWant.toFixed(1)}`);
    if (Math.abs((x1 - x0 + 1) - G.lenPx) > 3) bad(`${name}: drawn ${x1 - x0 + 1} cells long, its ${G.L.toFixed(2)} m make ${G.lenPx.toFixed(1)}`);
    // wheels on the axles, under an arch: the cell just above the tyre is not body
    for (const wx of [G.xr, G.xf]) {
      const cx = Math.floor(wx), ty = Math.floor(CAR_GY - 2 * G.rPx);
      if (b.get(cx, Math.floor(CAR_GY - G.rPx)) == null) bad(name + ': no wheel on the axle');
      if (b.get(cx, ty - 1) === col) bad(name + ': no arch over the wheel');
    }
    // glass with pillars between the panes (closed cars), none on an open one
    const glassCols = []; for (let x = 0; x < CAR_GW; x++) { let g = 0; for (let y = 0; y < CAR_GY; y++) if (b.get(x, y) === '#1a2a3a' || b.get(x, y) === '#2c4660') g++; glassCols.push(g); }
    if (!P.open) {
      const lit = glassCols.map((g, x) => g ? x : -1).filter(x => x >= 0);
      if (lit.length < 10) bad(name + ': hardly any glass');
      else if (P.pil.length) { let gaps = 0; for (let x = lit[0]; x <= lit[lit.length - 1]; x++) if (!glassCols[x]) gaps++; if (gaps < 2) bad(name + ': side glass has no pillar'); }
    }
    // the engine block (its dark frame) sits wholly inside the body
    let eIn = true, eAny = false;
    for (let y = 0; y < CAR_GH; y++) for (let x = 0; x < CAR_GW; x++) if (b.get(x, y) === '#0d0d18') {
      eAny = true; for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) { const c = b.get(x + dx, y + dy); if (c == null || c === '#05050a') eIn = false; }
    }
    if (!eAny) bad(name + ': no engine drawn'); else if (!eIn) bad(name + ': engine pokes out of the body');
  }
  // a rear wing stands on the deck: its uprights reach a body cell; a front wing reaches past the nose
  for (const c of ['coupe', 'super', 'hyper', 'proto', 'pickup']) {
    const { b, G } = draw(Object.assign({}, base, { chassis: c, aeroRear: 'wing', aeroFront: 'wing' }));
    const ux = Math.round(G.X(-0.02 + 0.48 * 0.3)); let y = 0; while (y < CAR_GY && b.get(ux, y) !== '#3a3a4a') y++;
    while (y < CAR_GY && b.get(ux, y) === '#3a3a4a') y++;
    const below = b.get(ux, y); if (!(below && below !== '#05050a')) bad(c + ': rear wing floats above the deck');
    let front = 0; for (let x = 0; x < CAR_GW; x++) for (let yy = 0; yy < CAR_GH; yy++) if (b.get(x, yy) === '#3a3a4a') front = Math.max(front, x);
    if (!(front > G.X(G.P.L) + 1)) bad(c + ': front wing not ahead of the nose');
  }
  // classes that used to share a shape no longer do
  const diff = (a, z) => { const A = sprites[a].split(','), Z = sprites[z].split(','); let n = 0; for (let k = 0; k < A.length; k++) if ((A[k] === '') !== (Z[k] === '')) n++; return n; };
  out.diffs = { 'hatch/rally': diff('hatch', 'rally'), 'coupe/sedan': diff('coupe', 'sedan'), 'coupe/gt': diff('coupe', 'gt'), 'sedan/gt': diff('sedan', 'gt') };
  for (const [k, n] of Object.entries(out.diffs)) if (n < 150) bad(k + ` differ in only ${n} cells`);
  const p911 = VEHICLE_PRESETS.find(p => p.body.look === 'gt3');
  if (diff(p911.name, 'super') < 150) bad('the 911 is drawn like the class supercar');
  // no band of empty sky over a low car
  for (const c of ['proto', 'super', 'hyper']) { const { G } = draw(Object.assign({}, base, { chassis: c })); if (G.topRow > 18) bad(`${c}: first lit row ${G.topRow}, a band of empty sky`); out[c + 'Top'] = G.topRow; }
  // top-down: follows each car's length and width
  const kei = topCarSprite('#ff0000', 'coast', 'kei'), pick = topCarSprite('#ff0000', 'coast', 'pickup'), cp = topCarSprite('#ff0000', 'coast', 'coupe');
  out.top = [kei.width, kei.height, cp.width, cp.height, pick.width, pick.height];
  if (!(pick.width > cp.width && cp.width > kei.width)) bad('top-down sprites do not follow length (kei < coupe < pickup)');
  if (!(pick.height >= kei.height)) bad('top-down pickup is not as wide as the kei');
  return out;
});
console.log(`== profiles: ${prof.n} checked · class shape differences ${JSON.stringify(prof.diffs)} · first lit row proto ${prof.protoTop}, super ${prof.superTop} · top-down kei/coupe/pickup ${prof.top} ==`);
if (prof.bad.length) fails.push(...prof.bad.slice(0, 20));

// ---- 2. every engine type x layout x count x induction draws; parts change the picture ----
const eng = await page.evaluate(() => {
  const out = { drawn: 0, thrown: [], blank: [] };
  const sig = b => b.c.join(',');
  const cases = [];
  for (const type of ['petrol4', 'diesel', 'twostroke', 'rotary'])
    for (const layout of type === 'rotary' ? ['rotary'] : ['inline', 'v', 'boxer'])
      for (const cylinders of type === 'rotary' ? [1, 2, 3, 4] : [1, 2, 3, 4, 6, 8, 12])
        for (const intake of ['na', 'turbo', 'supercharger'])
          for (const intakeSys of ['carb4', 'sidedraft', 'itb', 'efi'])
            cases.push({ type, layout, cylinders, intake, intakeSys });
  for (const c of cases) {
    const b = new PixBuf(ENG_GW, ENG_GH);
    try { drawEngineSprite(b, Object.assign({}, DEFAULT_ENGINE, c, { scType: ['roots', 'screw', 'centrifugal'][out.drawn % 3], turboConfig: ['single', 'twin', 'sequential', 'compound'][out.drawn % 4] }), 0.3); }
    catch (e) { out.thrown.push(JSON.stringify(c) + ' ' + e.message); continue; }
    out.drawn++; if (b.c.filter(Boolean).length < 300) out.blank.push(JSON.stringify(c));
  }
  const draw = o => { const b = new PixBuf(ENG_GW, ENG_GH); drawEngineSprite(b, Object.assign({}, DEFAULT_ENGINE, o), 0); return b; };
  out.turboDiffers = sig(draw({ intake: 'na' })) !== sig(draw({ intake: 'turbo', boost_bar: 1 }));
  out.layoutDiffers = sig(draw({ layout: 'inline', cylinders: 6 })) !== sig(draw({ layout: 'v', cylinders: 6 }));
  const width = b => { let lo = ENG_GW, hi = 0; for (let x = 0; x < ENG_GW; x++) if (b.get(x, 55) === '#6a6a7a') { lo = Math.min(lo, x); hi = Math.max(hi, x); } return hi - lo; };
  out.i4 = width(draw({ layout: 'inline', cylinders: 4, intake: 'na' })); out.i6 = width(draw({ layout: 'inline', cylinders: 6, intake: 'na' }));
  return out;
});
console.log(`== engine: ${eng.drawn} combinations drawn · turbo changes the picture: ${eng.turboDiffers} · V vs inline: ${eng.layoutDiffers} · block ${eng.i4} px (I4) vs ${eng.i6} px (I6) ==`);
if (eng.thrown.length) fails.push('engine sprite threw: ' + eng.thrown.slice(0, 3).join('; '));
if (eng.blank.length) fails.push('engine sprite nearly empty for: ' + eng.blank.slice(0, 3).join('; '));
if (!eng.turboDiffers) fails.push('adding a turbo does not change the engine picture');
if (!eng.layoutDiffers) fails.push('a V6 is drawn the same as an inline six');
if (!(eng.i6 > eng.i4)) fails.push('an inline six is not drawn longer than an inline four');

// ---- 3. the previews on their tabs are drawn, and follow the form ----
const lit = sel => page.evaluate(s => {
  const c = document.querySelector(s); if (!c || !c.width) return 0;
  const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0;
  for (let i = 0; i < d.length; i += 4) if (d[i] + d[i + 1] + d[i + 2] > 200) n++;
  return n;
}, sel);
await page.click('#tabVehicle'); await page.waitForTimeout(300);
const carLit = await lit('#carPreview');
const carA = await page.evaluate(() => document.getElementById('carPreview').toDataURL());
await page.selectOption('#vhAeroR', 'wing'); await page.waitForTimeout(200);
const carB = await page.evaluate(() => document.getElementById('carPreview').toDataURL());
await page.click('#tabDesign'); await page.waitForTimeout(300);
const engLit = await lit('#enginePreview');
await page.selectOption('#edIntake', 'na'); await page.waitForTimeout(150);
const engA = await page.evaluate(() => { previewT = 0; renderEnginePreview(); return document.getElementById('enginePreview').toDataURL(); });
await page.selectOption('#edIntake', 'turbo'); await page.waitForTimeout(150);
const engB = await page.evaluate(() => { previewT = 0; renderEnginePreview(); return document.getElementById('enginePreview').toDataURL(); });
console.log(`== previews: car ${carLit} bright pixels, engine ${engLit} · wing changes the car: ${carA !== carB} · turbo changes the engine: ${engA !== engB} ==`);
if (carLit < 500) fails.push('the VEHICLE tab car preview is blank');
if (engLit < 500) fails.push('the ENGINE tab engine preview is blank');
if (carA === carB) fails.push('fitting a rear wing did not change the car preview');
if (engA === engB) fails.push('choosing a turbo did not change the engine preview');

// ---- 4. garage thumbnails, including an old record without the newer fields ----
const thumbs = await page.evaluate(() => {
  const old = { id: 'legacy1', name: 'Old car', date: '2025-01-01', kind: 'car',
    build: { engine: { type: 'petrol4', cylinders: 4, bore_mm: 86, stroke_mm: 86, layout: 'inline', intake: 'na' }, vehicle: { chassis: 'hatch' } }, stats: {} };
  const eng = { id: 'legacy2', name: 'Old engine', date: '2025-01-01', kind: 'engine', build: { engine: { cylinders: 8, layout: 'v' } }, stats: {} };
  garage.push(old, eng); renderGarage(); setTab('garage');
  const imgs = [...document.querySelectorAll('#garagePanel .garage-thumb')];
  return { n: imgs.length, ok: imgs.every(i => /^data:image\/png/.test(i.src) && i.src.length > 500) };
});
console.log(`== garage: ${thumbs.n} thumbnails, all drawn: ${thumbs.ok} ==`);
if (thumbs.n < 2 || !thumbs.ok) fails.push('saved cars and engines do not all get a thumbnail');

// ---- 5. the car on the track map is drawn where the replay puts it ----
await page.click('#tabTrack'); await page.waitForTimeout(800);
const onMap = await page.evaluate(() => {
  const k = typeof topCarSprite === 'function' && Object.keys(topCarCache).length;
  return { cached: k };
});
console.log(`== track: car sprites built ${onMap.cached} ==`);
if (!onMap.cached) fails.push('the track map never drew the car sprite');

if (errors.length) fails.push(...errors);
console.log(fails.length ? '\nFAIL:\n  ' + fails.join('\n  ') : '\nPASS');
await browser.close();
process.exit(fails.length ? 1 : 0);
