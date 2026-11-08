// Low against high in a field's help (build 251).
//
// WHY THIS EXISTS. A generated set of "value diagrams" looked right and showed the wrong things: identical panels,
// curves nobody computed. Build 251 draws them in code instead: "?" on a number shows the part at the lowest and the
// highest real example (the slider's ticks), drawn and worked out by the form's own code. What must hold:
//   · BORE, STROKE and COMPRESSION draw two cylinders and two power curves; REDLINE draws the curves only;
//   · WHEEL DIA, TYRE WIDTH and TYRE ASPECT draw two tyre sections;
//   · the two values are the first and last ticks, and the two results differ (the panels are never the same);
//   · each result is the preview's own (icdCompute) with the field at that value, and the text says so;
//   · working it out leaves the form, the live engine and the state as they were;
//   · a rotary shows no cylinders; no page errors.
import { chromium } from './pw.mjs';
import { fileURLToPath, pathToFileURL } from 'url';
import path from 'path';
const repo = fileURLToPath(new URL('..', import.meta.url));
const url = pathToFileURL(path.join(repo, 'index.html')).href;
const browser = await chromium.launch();
const errors = [], fails = [];
const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
await page.goto(url, { waitUntil: 'networkidle' });
const load = re => page.evaluate(async re => {
  const pr = FACTORY_ENGINES.find(q => new RegExp(re).test(q.name));
  applyBuild({ engine: Object.assign({}, pr.engine), tune: Object.assign({}, STD_TUNE), vehicle: readVehicleFromForm(), name: pr.name });
  setTab('design'); await new Promise(r => setTimeout(r, 150)); ICD.update();
}, re);
// press "?" on a field and read what the comparison drew: inked pixels in each half of the picture, the curve, the text
const probe = (dc, id) => page.evaluate(async ([dc, id]) => {
  const D = dc === 'ICD' ? ICD : VCD, box = D.box(), q = box.querySelector('.evd-q[data-f="' + id + '"]');
  if (D.st.help === id) q.click();
  // the run itself, synchronously (the live sim moves the state between frames): form, engine and state as they were
  const ctl = document.getElementById(id), before = ctl.value, live = engine, st = JSON.stringify(state), score = JSON.stringify(live.score);
  D.st.cmp = null; D.cmpRun(id);
  const restored = ctl.value === before, liveKept = engine === live && JSON.stringify(live.score) === score, stateKept = JSON.stringify(state) === st;
  q.click(); await new Promise(r => setTimeout(r, 50));
  const help = D.el('Help'), pic = help.querySelector('canvas[data-cmp=pic]'), cur = help.querySelector('canvas[data-cmp=curve]');
  const ink = (cv, x0, x1) => { const d = cv.getContext('2d').getImageData(x0, 0, x1 - x0, cv.height).data; let n = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i] + d[i + 1] + d[i + 2] > 120) n++; return n; };
  const run = D.st.cmp, t = D.cfg.ticks(id);
  return { pic: pic ? [ink(pic, 0, pic.width / 2), ink(pic, pic.width / 2, pic.width)] : null, curve: cur ? ink(cur, 0, cur.width) : null,
    txt: (help.querySelector('[data-cmp=txt]') || {}).textContent || '', vals: run && run.id === id ? run.vals : null,
    ticks: t.length ? [t[0].v, t[t.length - 1].v] : null, res: run && run.id === id ? run.res.map(r => JSON.stringify(Object.assign({}, r, { pts: 0 }))) : null,
    hp: run && run.id === id && run.res[0].hp != null ? run.res.map(r => r.hp) : null,
    restored, liveKept, stateKept };
}, [dc, id]);
const check = (dc, id, want) => probe(dc, id).then(r => {
  console.log(`${id}: ${r.vals ? r.vals.join(' → ') : 'none'} · picture ${r.pic ? r.pic.join('/') : '-'} · curve ${r.curve ?? '-'} · ${r.txt.replace(/\s+/g, ' ').slice(0, 110)}`);
  if (!r.vals) { fails.push(id + ': no comparison'); return r; }
  if (r.ticks && r.vals.join() !== r.ticks.join()) fails.push(`${id}: values ${r.vals} are not the first and last ticks ${r.ticks}`);
  if (want.pic && !(r.pic && r.pic[0] > 50 && r.pic[1] > 50)) fails.push(id + ': a picture is empty');
  if (!want.pic && r.pic) fails.push(id + ': a picture that would not change');
  if (want.curve && !(r.curve > 100)) fails.push(id + ': no curve');
  if (r.res[0] === r.res[1]) fails.push(id + ': both results are the same');
  if (!r.restored || !r.liveKept || !r.stateKept) fails.push(`${id}: the comparison disturbed the form (${r.restored}), the live engine (${r.liveKept}) or the state (${r.stateKept})`);
  return r;
});

// ---------- the engine ----------
await load('EA888');
for (const id of ['edBore', 'edStroke', 'edCR']) await check('ICD', id, { pic: 1, curve: 1 });
await check('ICD', 'edRedline', { curve: 1 });
// each result is the preview's own with the field at that value
const own = await page.evaluate(() => {
  const ctl = document.getElementById('edBore'), keep = ctl.value, run = ICD.st.cmp && ICD.st.cmp.id === 'edBore' ? ICD.st.cmp : ICD.cmpRun('edBore');
  const out = run.vals.map((v, i) => { ctl.value = v; const r = icdCompute(); return r.hp === run.res[i].hp && r.tq === run.res[i].tq; });
  ctl.value = keep; return out.every(Boolean);
});
if (!own) fails.push('the bore comparison is not the preview at those bores');
// a rotary has no cylinder to draw
await load('13B|Renesis|RX');
const rot = await page.evaluate(() => document.getElementById('edType').value === 'rotary' ? !!ICD.cmpSpec('edBore') : null);
if (rot === null) console.log('(no rotary preset found: rotary check skipped)'); else if (rot) fails.push('a rotary offers a cylinder comparison');

// ---------- the tyres ----------
await page.evaluate(async () => { setTab('vehicle'); await new Promise(r => setTimeout(r, 300)); document.getElementById('vcdRb-tyres').click(); });
for (const id of ['vhWheel', 'vhTireW', 'vhTireA']) await check('VCD', id, { pic: 1 });

console.log(errors.length ? 'page errors:\n  ' + errors.join('\n  ') : 'no page errors');
if (errors.length) fails.push('page errors');
await browser.close();
if (fails.length) { console.log('FAIL:\n  ' + fails.join('\n  ')); process.exit(1); }
console.log('PASS');
