import { chromium } from './pw.mjs';
const repo = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 1050 } });
const errors = [];
page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
await page.goto(`file://${repo}/index.html`, { waitUntil: 'networkidle' });
await page.waitForTimeout(500);
const fails = [];

const fit = (nm, ch) => `(()=>{const pr=PRESETS.find(x=>x.name===${JSON.stringify(nm)});
  applyEngineToForm(Object.assign({},DEFAULT_ENGINE,pr.engine));buildEngine();engine.name=${JSON.stringify(nm)};
  applyChassisFit(${JSON.stringify(ch)});buildVehicle();})()`;

// ---------------------------------------------------------------- 1. round trip
// The claim is that a saved build restores the WHOLE car, engine included — so compare the full
// serialised spec, not just a couple of headline numbers.
console.log('== save/load round trip ==');
const trip = await page.evaluate(({ a, b }) => {
  localStorage.removeItem('pes.garage'); loadGarage(); renderGarage();
  eval(a);
  const wanted = JSON.parse(JSON.stringify({ engine: readEngineFromForm(), vehicle: readVehicleFromForm() }));
  const before = { hp: engine.score.peakHP, kg: Math.round(vehicle.mass), ch: vehicle.chLabel, t100: +perf.t100.toFixed(2) };
  document.getElementById('garageName').value = 'Track coupe'; garageSave();
  // wander away: different engine AND different chassis
  eval(b);
  const away = { hp: engine.score.peakHP, kg: Math.round(vehicle.mass), ch: vehicle.chLabel };
  garageLoad(garage.find(g => g.name === 'Track coupe').id);
  const got = JSON.parse(JSON.stringify({ engine: readEngineFromForm(), vehicle: readVehicleFromForm() }));
  const after = { hp: engine.score.peakHP, kg: Math.round(vehicle.mass), ch: vehicle.chLabel, t100: +perf.t100.toFixed(2) };
  const diff = [];
  for (const part of ['engine', 'vehicle'])
    for (const k of new Set([...Object.keys(wanted[part]), ...Object.keys(got[part])]))
      if (JSON.stringify(wanted[part][k]) !== JSON.stringify(got[part][k])) diff.push(`${part}.${k}`);
  return { before, away, after, diff, nameRestored: document.getElementById('garageName').value };
}, { a: fit('3.0 Turbo I6 (2JZ)', 'coupe'), b: fit('1.0 Kei Turbo I3', 'kei') });
console.log(`  saved  ${trip.before.hp} hp ${trip.before.kg} kg ${trip.before.ch} 0-100 ${trip.before.t100}s`);
console.log(`  wandered to  ${trip.away.hp} hp ${trip.away.kg} kg ${trip.away.ch}`);
console.log(`  loaded ${trip.after.hp} hp ${trip.after.kg} kg ${trip.after.ch} 0-100 ${trip.after.t100}s`);
console.log(`  spec fields differing after the round trip: ${trip.diff.length ? trip.diff.join(', ') : 'none'}`);
if (trip.diff.length) fails.push(`round trip lost ${trip.diff.length} spec fields: ${trip.diff.slice(0, 6).join(', ')}`);
if (JSON.stringify(trip.before) !== JSON.stringify(trip.after)) fails.push('performance did not come back identical');
if (trip.away.ch === trip.after.ch) fails.push('the test never actually left the saved build');
if (trip.nameRestored !== 'Track coupe') fails.push('loading a build did not restore its name into the box');

// a hand-tuned fuel map is part of the car and must survive too
const fm = await page.evaluate(({ a }) => {
  eval(a);
  fuelMap = fuelMap.map(r => r.map(v => +(v * 0.93).toFixed(3))); fuelMapCustom = true;
  const wanted = JSON.stringify(fuelMap);
  document.getElementById('garageName').value = 'Rich map'; garageSave();
  applyEngineToForm(Object.assign({}, DEFAULT_ENGINE)); buildEngine();   // regenerates a factory map
  const wiped = JSON.stringify(fuelMap) !== wanted;
  garageLoad(garage.find(g => g.name === 'Rich map').id);
  return { wiped, restored: JSON.stringify(fuelMap) === wanted, custom: fuelMapCustom };
}, { a: fit('2.0 Turbo Hot-Hatch I4', 'hatch') });
console.log(`  hand-tuned fuel map: wiped in between ${fm.wiped}, restored ${fm.restored}, still flagged custom ${fm.custom}`);
if (!fm.wiped) fails.push('fuel map test never wiped the map, so it proves nothing');
if (!fm.restored || !fm.custom) fails.push('a hand-tuned fuel map does not survive the garage');

// ---------------------------------------------------------------- 2. several builds side by side
console.log('\n== several builds kept side by side ==');
const many = await page.evaluate(({ specs }) => {
  localStorage.removeItem('pes.garage'); loadGarage();
  specs.forEach(s => { eval(s.code); document.getElementById('garageName').value = s.label; garageSave(); });
  return garage.map(g => ({ name: g.name, engine: g.stats.engine, chassis: g.stats.chassis, hp: g.stats.hp,
    kg: g.stats.kg, t100: g.stats.t100, lap: g.stats.lap == null ? null : +g.stats.lap.toFixed(2), cost: g.stats.cost }));
}, {
  specs: [{ code: fit('3.0 Turbo I6 (2JZ)', 'coupe'), label: 'Track coupe' },
          { code: fit('3.0 Turbo I6 (2JZ)', 'kei'), label: 'Silly kei' },
          { code: fit('6.2 Supercharged V8', 'muscle'), label: 'Drag muscle' }]
});
many.forEach(m => console.log(`  ${m.name.padEnd(13)} ${m.engine} in ${m.chassis.padEnd(13)} ${m.hp} hp · ${m.kg} kg · 0-100 ${m.t100}s · lap ${m.lap}s · $${m.cost}`));
if (many.length !== 3) fails.push(`expected 3 saved builds, got ${many.length}`);
if (many[0].name !== 'Drag muscle') fails.push('newest build is not listed first');
// the same engine in two chassis must produce two DISTINCT entries — that is the whole point
const coupe = many.find(m => m.name === 'Track coupe'), kei = many.find(m => m.name === 'Silly kei');
if (!(coupe && kei && coupe.engine === kei.engine && coupe.chassis !== kei.chassis))
  fails.push('the same engine in two chassis did not produce two distinct entries');
if (coupe.kg === kei.kg || coupe.t100 === kei.t100) fails.push('two chassis with one engine stored identical stats');

// ---------------------------------------------------------------- 3. overwrite, delete, persist
const ops = await page.evaluate(({ a }) => {
  const n0 = garage.length;
  window.confirm = () => true;                        // accept the overwrite prompt
  eval(a);
  // Compare against the engine actually on the bench, not a hard-coded number — this is a
  // storage test and must not fail when the physics is retuned.
  const nowHp = engine.score.peakHP;
  document.getElementById('garageName').value = 'Track coupe'; garageSave();
  const afterOverwrite = { n: garage.length, nowHp, hp: garage.find(g => g.name === 'Track coupe').stats.hp };
  const id = garage.find(g => g.name === 'Silly kei').id;
  garageDelete(id);
  const afterDelete = garage.length;
  window.confirm = () => false;                       // decline it
  const id2 = garage[0].id; garageDelete(id2);
  const afterDecline = garage.length;
  // what actually reached storage
  const raw = JSON.parse(localStorage.getItem('pes.garage'));
  garage = []; loadGarage();
  return { n0, afterOverwrite, afterDelete, afterDecline, stored: raw.length, reloaded: garage.length,
    names: garage.map(g => g.name) };
}, { a: fit('1.0 Kei Turbo I3', 'kei') });
console.log(`\n${ops.n0} builds -> overwrite "Track coupe" -> ${ops.afterOverwrite.n} (now ${ops.afterOverwrite.hp} hp, the kei that replaced it)`);
console.log(`  delete -> ${ops.afterDelete} · declined delete -> ${ops.afterDecline} · reloaded from storage -> ${ops.reloaded} ${JSON.stringify(ops.names)}`);
if (ops.afterOverwrite.n !== ops.n0) fails.push('saving over an existing name added a duplicate instead of replacing');
if (ops.afterOverwrite.hp !== ops.afterOverwrite.nowHp) fails.push('overwrite kept the old build');
if (ops.afterDelete !== ops.n0 - 1) fails.push('delete did not remove the build');
if (ops.afterDecline !== ops.afterDelete) fails.push('declining the confirm still deleted the build');
if (ops.reloaded !== ops.afterDecline) fails.push('the garage does not survive a reload from localStorage');

// really survive a page reload
await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(500);
const survived = await page.evaluate(() => ({ n: garage.length, names: garage.map(g => g.name),
  html: document.getElementById('garageList').innerHTML }));
console.log(`after a real page reload: ${survived.n} builds ${JSON.stringify(survived.names)}`);
if (survived.n !== ops.reloaded) fails.push('garage did not survive a page reload');
if (!/Track coupe/.test(survived.html)) fails.push('reloaded garage did not render');

// ---------------------------------------------------------------- 4. refusals and safety
const guard = await page.evaluate(() => {
  const out = {};
  const n = garage.length;
  document.getElementById('garageName').value = '   ';
  garageSave(); out.blankRefused = garage.length === n;
  // a name with markup in it must not be able to inject anything
  document.getElementById('garageName').value = '<img src=x onerror=alert(1)>';
  garageSave();
  out.injected = document.getElementById('garageList').querySelectorAll('img').length;
  out.escaped = /&lt;img/.test(document.getElementById('garageList').innerHTML);
  garage = garage.filter(g => !/img/.test(g.name)); persistGarage(); renderGarage();
  // corrupt storage must not throw or wipe the app
  localStorage.setItem('pes.garage', '{not json');
  loadGarage(); out.corruptHandled = Array.isArray(garage) && garage.length === 0;
  localStorage.setItem('pes.garage', JSON.stringify([{ id: 'x', name: 'junk' }]));   // no build payload
  loadGarage(); out.junkFiltered = garage.length === 0;
  localStorage.removeItem('pes.garage'); loadGarage(); renderGarage();
  out.emptyState = /garage-empty/.test(document.getElementById('garageList').innerHTML);
  return out;
});
console.log(`\nblank name refused: ${guard.blankRefused} · markup escaped: ${guard.escaped} (${guard.injected} injected nodes)`);
console.log(`corrupt storage handled: ${guard.corruptHandled} · junk entries filtered: ${guard.junkFiltered} · empty state shown: ${guard.emptyState}`);
if (!guard.blankRefused) fails.push('a blank name was accepted');
if (guard.injected) fails.push('a build name injected live DOM nodes');
if (!guard.escaped) fails.push('build names are not HTML-escaped');
if (!guard.corruptHandled) fails.push('corrupt garage data was not handled');
if (!guard.junkFiltered) fails.push('entries with no build payload were not filtered out');
if (!guard.emptyState) fails.push('empty garage shows no empty state');

// ---------------------------------------------------------------- 5. UI + i18n
await page.click('#tabVehicle'); await page.waitForTimeout(400);
const ui = await page.evaluate(({ a }) => {
  eval(a); document.getElementById('garageName').value = 'UI check';
  document.getElementById('btnGarageSave').click();
  const item = document.querySelector('.garage-item');
  return { visible: !!document.getElementById('garageList').offsetParent, saved: garage.length,
    hasLoad: !!item.querySelector('[data-gload]'), hasDel: !!item.querySelector('[data-gdel]'),
    current: item.classList.contains('current'), btn: document.getElementById('btnGarageSave').textContent };
}, { a: fit('2.0 ITB NA Screamer I4', 'roadster') });
console.log(`\nUI: panel visible ${ui.visible} · saved via the button ${ui.saved} · LOAD ${ui.hasLoad} · DELETE ${ui.hasDel} · current card highlighted ${ui.current}`);
if (!ui.visible) fails.push('garage is not visible on the VEHICLE tab');
if (ui.saved !== 1) fails.push('the SAVE TO GARAGE button did not save');
if (!ui.hasLoad || !ui.hasDel) fails.push('cards are missing their LOAD/DELETE buttons');
if (!ui.current) fails.push('the card matching the typed name is not highlighted');

// clicking LOAD through the delegated handler, not by calling the function
const clicked = await page.evaluate(({ a }) => { eval(a); return { hp: engine.score.peakHP, ch: vehicle.chLabel }; },
  { a: fit('6.5 V12 NA Supercar', 'hyper') });
await page.click('.garage-item [data-gload]'); await page.waitForTimeout(300);
const back = await page.evaluate(() => ({ hp: engine.score.peakHP, ch: vehicle.chLabel }));
console.log(`clicked LOAD: ${clicked.hp} hp ${clicked.ch} -> ${back.hp} hp ${back.ch}`);
if (back.ch !== 'LIGHT ROADSTER') fails.push('clicking LOAD on a card did not load that build');

await page.evaluate(() => applyLang('el')); await page.waitForTimeout(300);
const el = await page.evaluate(() => ({
  section: [...document.querySelectorAll('.design-section')].map(e => e.textContent).join('|'),
  btn: document.getElementById('btnGarageSave').textContent,
  label: document.querySelector('label[for="garageName"]').textContent,
  ph: document.getElementById('garageName').placeholder,
  card: document.querySelector('.garage-item').textContent,
  guide: (document.querySelector('[data-gk="vehicle"]') || {}).textContent || ''
}));
console.log(`EL: section "${/ΓΚΑΡΑΖ/.test(el.section)}" · button "${el.btn}" · label "${el.label}" · card "${el.card.replace(/\s+/g, ' ').slice(0, 60)}"`);
if (!/ΓΚΑΡΑΖ/.test(el.section)) fails.push('Garage section heading not translated');
if (!/ΓΚΑΡΑΖ/.test(el.btn)) fails.push('SAVE TO GARAGE not translated');
if (!/ΟΝΟΜΑ/.test(el.label)) fails.push('BUILD NAME not translated');
if (!/ΦΟΡΤΩΣΗ|ΔΙΑΓΡΑΦΗ/.test(el.card)) fails.push('card buttons not translated');
if (!/ΓΚΑΡΑΖ/.test(el.guide)) fails.push('Greek guide does not cover the garage');
await page.evaluate(() => applyLang('en'));
const en = await page.evaluate(() => (document.querySelector('[data-gk="vehicle"]') || {}).textContent || '');
if (!/SAVE TO GARAGE/.test(en)) fails.push('English guide does not cover the garage');

console.log('\nERRORS:', errors.length ? errors : 'none');
console.log(fails.length ? 'FAIL:\n  ' + fails.join('\n  ') : '\nPASS');
await browser.close();
process.exit(fails.length || errors.length ? 1 : 0);
