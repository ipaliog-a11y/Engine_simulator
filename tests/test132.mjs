// Order numbers, the showroom at the top, and COPY FROM (build 221).
//
// WHY THIS EXISTS. Every real car got an order number (001 upward, given once, never changed or reused), shown before
// its name in the lists. A real car's picture took the top of the VEHICLE tab and stays there however the car is
// modified, with the drawn car under it as YOUR BUILD. COPY FROM takes a real car's body and parts, by its number or a
// piece of its name, and keeps the engine you have.
// What must hold:
//   · every factory car has a number, no two share one, and the first numbers stay where they were given (001 is the
//     Alto Works, 010 the S2000, 012 the 911 GT3): a number never moves to another car;
//   · the FACTORY CAR list and the RACE tab's list lead each car with its number;
//   · a real car's picture sits above the drawn car and stays when a part changes (the caption then says it is the car
//     as it left the factory); the drawn car is still drawn, under it, at whole cells; a generic chassis has no picture;
//   · COPY FROM finds a car by number and by name, says what it found before you press it, and refuses a miss;
//   · a copy keeps the engine (the same form, name and power) and takes the car's body and parts (its Cd, frontal area,
//     wheelbase and factory fitment); its mass is the real car's with the engine difference, as an engine swap is; it is
//     labelled as a custom car from that number, has no picture, and the picker no longer claims the real car;
//   · a copy saves and loads as a copy, and its GARAGE card is drawn, not the real car's picture;
//   · the copy reads in Greek.
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

// 1. numbers
const nums = await page.evaluate(() => {
  const o = {};
  o.missing = FACTORY_CARS.filter(p => !(CAR_NO[p.name] > 0)).map(p => p.name);
  const all = FACTORY_CARS.map(p => CAR_NO[p.name]);
  o.dupes = all.filter((n, i) => all.indexOf(n) !== i);
  o.stray = Object.keys(CAR_NO).filter(n => !FACTORY_CARS.some(p => p.name === n));
  o.anchors = { 1: carNoName('Suzuki Alto Works (HA36S, 2015)'), 10: carNoName('Honda S2000 (AP1, 2000)'), 12: carNoName('Porsche 911 GT3 (991.2, 2017)') };
  o.max = Math.max(...all);
  setTab('vehicle');
  o.picker = [...document.querySelectorAll('#vhPreset option')].filter(x => x.value !== '').every(x => /^\d{3} · /.test(x.textContent));
  setTab('race');
  const rs = document.querySelector('#raceAddSel');
  o.race = rs ? [...rs.options].filter(x => /^p:/.test(x.value)).every(x => /^\d{3} · /.test(x.textContent)) : null;
  return o;
});
console.log(`== numbers: ${100 - nums.missing.length} numbered, highest ${nums.max}; ${JSON.stringify(nums.anchors)}; picker ${nums.picker}; race ${nums.race} ==`);
if (nums.missing.length) fails.push('factory cars without a number: ' + nums.missing.join(', '));
if (nums.dupes.length) fails.push('numbers given twice: ' + nums.dupes.join(', '));
if (nums.stray.length) fails.push('numbers for no car: ' + nums.stray.join(', '));
if (nums.anchors[1] !== '001 · Suzuki Alto Works (HA36S, 2015)' || nums.anchors[10] !== '010 · Honda S2000 (AP1, 2000)' || nums.anchors[12] !== '012 · Porsche 911 GT3 (991.2, 2017)')
  fails.push('a number moved to another car: ' + JSON.stringify(nums.anchors));
if (!nums.picker) fails.push('the FACTORY CAR list does not lead each car with its number');
if (nums.race === false) fails.push('the RACE tab list does not lead each factory car with its number');

// 2. the showroom at the top, staying when modified
const top = await page.evaluate(async () => {
  setTab('vehicle');
  const i = FACTORY_CARS.findIndex(p => /F40/.test(p.name));
  const fam = document.getElementById('vhFamily'), sel = document.getElementById('vhPreset');
  fam.value = FACTORY_CARS[i].cat; fam.dispatchEvent(new Event('change')); sel.value = String(i); sel.dispatchEvent(new Event('change'));
  const fig = document.getElementById('vhShowroom'), cv = document.getElementById('carPreview');
  const o = { above: !!(fig.compareDocumentPosition(cv) & Node.DOCUMENT_POSITION_FOLLOWING), shown: !fig.hidden, cap: document.getElementById('vhArtCap').textContent };
  const r = document.getElementById('vhAeroR'); r.value = [...r.options].pop().value; r.dispatchEvent(new Event('input'));
  await new Promise(res => requestAnimationFrame(() => requestAnimationFrame(res)));
  o.modShown = !fig.hidden; o.modCap = document.getElementById('vhArtCap').textContent;
  o.under = cv.classList.contains('under-art'); o.buildCap = !document.getElementById('vhBuildCap').hidden;
  o.cssW = Math.round(cv.getBoundingClientRect().width);
  const g = cv.getContext('2d'), d = g.getImageData(0, 0, cv.width, cv.height).data;
  let lit = 0; for (let k = 0; k < d.length; k += 4) if (d[k] + d[k + 1] + d[k + 2] > 120) lit++;
  o.lit = lit;
  const c = document.getElementById('vhChassis'); c.value = 'coupe'; c.dispatchEvent(new Event('input'));
  o.genShown = !fig.hidden; o.genUnder = cv.classList.contains('under-art'); o.genCap = !document.getElementById('vhBuildCap').hidden;
  return o;
});
console.log(`== top: picture above the drawn car ${top.above}; "${top.cap}"; modified: shown ${top.modShown} "${top.modCap}", drawn under it ${top.under} (${top.cssW}px, ${top.lit} lit); generic: picture ${top.genShown} ==`);
if (!top.above || !top.shown) fails.push('a real car\'s picture is not at the top of the VEHICLE tab');
if (top.cap !== '058 · Ferrari F40 (1987)') fails.push('the caption is not the number and name: ' + top.cap);
if (!top.modShown || !/as it left the factory/.test(top.modCap)) fails.push('the picture does not stay, so marked, when the car is modified');
if (!top.under || !top.buildCap || top.lit < 300) fails.push('the drawn car is not kept under the picture as YOUR BUILD');
if (top.cssW !== 340) fails.push('the drawn car under the picture is not at whole cells: ' + top.cssW + 'px');
if (top.genShown || top.genUnder || top.genCap) fails.push('a generic chassis still shows a picture');

// 3. COPY FROM: finding
const find = await page.evaluate(() => {
  const q = document.getElementById('vhCopyQ'), out = document.getElementById('vhCopyHit'), btn = document.getElementById('btnCopyFrom');
  const at = v => { q.value = v; q.dispatchEvent(new Event('input')); return { hit: out.textContent, off: btn.disabled }; };
  return { empty: at(''), num: at('12'), num3: at('012'), name: at('gt3'), many: at('ferrari'), miss: at('999'), junk: at('zzz') };
});
console.log(`== find: 12 "${find.num.hit}"; gt3 "${find.name.hit}"; ferrari "${find.many.hit}"; 999 "${find.miss.hit}" ==`);
if (!find.empty.off) fails.push('COPY FROM is offered with nothing typed');
if (!/^> 012 · Porsche 911 GT3/.test(find.num.hit) || find.num.off || find.num3.hit !== find.num.hit) fails.push('COPY FROM does not find a car by its number');
if (!/^> 012 · Porsche 911 GT3/.test(find.name.hit) || find.name.off) fails.push('COPY FROM does not find a car by its name');
if (!/\(\+\d+ more\)/.test(find.many.hit)) fails.push('COPY FROM does not say when a name matches more than one car');
if (!find.miss.off || !find.junk.off || !/no such car/.test(find.miss.hit)) fails.push('COPY FROM does not refuse a number or name that is no car');

// 4. COPY FROM: the copy
const copy = await page.evaluate(() => {
  const o = {};
  const alto = FACTORY_CARS.find(p => /Alto Works/.test(p.name)), gt3 = FACTORY_CARS.find(p => /911 GT3 \(991/.test(p.name));
  // the GT3 as it comes, with its own engine: its mass and its engine's
  loadVehiclePreset(gt3); o.realMass = vehicle.mass; o.realEng = vehicle.engineMass; o.realCd = vehicle.body.cd; o.realChassis = vehicle.chassis; o.realArea = vehicle.area; o.realWb = vehicle.wb;
  o.realTyre = vehicle.tireWidth + '/' + vehicle.tireAspect + 'R' + vehicle.wheelDia; o.realBrake = vehicle.brakeType + ' ' + vehicle.rotor;
  // now the Alto, its engine to keep
  loadVehiclePreset(alto); engine.name = 'My kei motor';
  const form = JSON.stringify(readEngineFromForm()), hp = engine.score.peakHP, myEng = vehicle.engineMass;
  const q = document.getElementById('vhCopyQ'); q.value = '012'; q.dispatchEvent(new Event('input'));
  document.getElementById('btnCopyFrom').click();
  o.sameEngine = JSON.stringify(readEngineFromForm()) === form; o.name = engine.name; o.hp = engine.score.peakHP; o.hp0 = hp;
  o.cd = vehicle.body.cd; o.area = vehicle.area; o.wb = vehicle.wb; o.chassis = vehicle.chassis;
  o.tyre = vehicle.tireWidth + '/' + vehicle.tireAspect + 'R' + vehicle.wheelDia; o.brake = vehicle.brakeType + ' ' + vehicle.rotor;
  o.mass = vehicle.mass; o.want = o.realMass - o.realEng + myEng;
  o.label = vehicle.chLabel; o.copyOf = vehicle.body.copyOf;
  o.pic = !document.getElementById('vhShowroom').hidden; o.picker = document.getElementById('vhPreset').value;
  o.strip = document.getElementById('bsCar').textContent;
  // save and load it back
  const saved = JSON.parse(JSON.stringify(serializeBuild('T132 copy', '')));
  loadVehiclePreset(gt3); applyBuild(saved);
  o.reCopy = vehicle.body && vehicle.body.copyOf; o.reLabel = vehicle.chLabel; o.reMass = vehicle.mass;
  garage.push({ id: 't132', kind: 'car', name: 'T132 copy', date: '2026-11-02', stats: {}, build: saved }); renderGarage();
  const card = [...document.querySelectorAll('#garageList .garage-item')].find(c => c.textContent.includes('T132 copy'));
  const th = card && card.querySelector('.garage-thumb');
  o.thumb = ((th && th.getAttribute('src')) || '').slice(0, 22);
  garage = garage.filter(g => g.id !== 't132'); renderGarage();
  // Greek
  applyLang('el'); o.el = vehicle.chLabel; q.value = 'ferrari'; q.dispatchEvent(new Event('input')); o.elHit = document.getElementById('vhCopyHit').textContent;
  o.elBtn = document.getElementById('btnCopyFrom').textContent; applyLang('en');
  return o;
});
console.log(`== copy: engine kept ${copy.sameEngine} (${copy.name}, ${copy.hp} hp); Cd ${copy.cd} / ${copy.realCd}, area ${copy.area} / ${copy.realArea}, wb ${copy.wb} / ${copy.realWb}; ` +
  `tyres ${copy.tyre} / ${copy.realTyre}; brakes ${copy.brake} / ${copy.realBrake}; mass ${copy.mass.toFixed(1)} (GT3 ${copy.realMass.toFixed(1)} − its engine + this one = ${copy.want.toFixed(1)}) ==`);
console.log(`   "${copy.label}"; picture ${copy.pic}; picker "${copy.picker}"; strip "${copy.strip}"; reloaded: copyOf ${copy.reCopy} "${copy.reLabel}"; garage ${copy.thumb}…`);
console.log(`   Greek: "${copy.el}" · "${copy.elHit}" · ${copy.elBtn}`);
if (!copy.sameEngine || copy.name !== 'My kei motor' || copy.hp !== copy.hp0) fails.push('COPY FROM did not keep the engine');
if (copy.cd !== copy.realCd || Math.abs(copy.area - copy.realArea) > 1e-9 || copy.wb !== copy.realWb || copy.chassis !== copy.realChassis)
  fails.push('COPY FROM did not take the car\'s body');
if (copy.tyre !== copy.realTyre || copy.brake !== copy.realBrake) fails.push('COPY FROM did not take the car\'s factory parts');
if (Math.abs(copy.mass - copy.want) > 0.5) fails.push(`the copy's mass is not the real car's with the engine difference: ${copy.mass} against ${copy.want}`);
if (copy.label !== 'Custom (from 012)' || copy.copyOf !== 12) fails.push('the copy is not labelled as a custom car from 012: ' + copy.label);
if (copy.pic) fails.push('a copy still shows the real car\'s picture');
if (copy.picker !== '') fails.push('the picker still claims the real car after a copy');
if (copy.reCopy !== 12 || copy.reLabel !== 'Custom (from 012)' || Math.abs(copy.reMass - copy.mass) > 0.5) fails.push('a copy does not save and load as a copy');
if (!/^data:image\/png/.test(copy.thumb)) fails.push('a copy\'s garage card shows the real car\'s picture, not the drawn car');
if (copy.el !== 'Προσαρμοσμένο (από 012)' || !/ακόμη/.test(copy.elHit) || copy.elBtn !== 'ΑΝΤΙΓΡΑΦΗ') fails.push('COPY FROM is not in Greek');

if (errors.length) fails.push(...errors);
console.log(fails.length ? '\nFAIL:\n  ' + fails.join('\n  ') : '\nPASS');
await browser.close();
process.exit(fails.length ? 1 : 0);
