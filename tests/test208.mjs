// The page's columns, put back (build 338).
//
// WHY THIS EXISTS. Build 312 left the PARTS brake block unclosed. The browser then nested the right column inside the
// left panel and put the footer in the right column, so every tab showed an empty column on the right. What must hold:
//   · the right column is a child of .main, not of the tab panel, and each part designer is a child of the PARTS panel;
//   · LIVE and DYNO show ENGINE CONTROLS in the right column; TRACK shows the lap dashboard there;
//   · VEHICLE takes the whole width, with its PERFORMANCE panel below;
//   · there is no footer; its text is under OPTIONS > ABOUT, with the build number.
import { chromium } from './pw.mjs';
import { fileURLToPath, pathToFileURL } from 'url';
import path from 'path';
const repo = fileURLToPath(new URL('..', import.meta.url));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
await page.goto(pathToFileURL(path.join(repo, 'index.html')).href, { waitUntil: 'networkidle' });
const fails = [];
const r = await page.evaluate(() => {
  const side = document.querySelector('.side-panel'), out = {};
  out.sideParent = side.parentElement.className;
  out.loose = [...document.querySelectorAll('[id^="parts"][hidden],#partsExhaust')].filter(e => e.parentElement.id !== 'partsPanel').map(e => e.id);
  out.footer = !!document.querySelector('footer');
  const box = id => { const b = document.getElementById(id).getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width }; };
  for (const t of ['engine', 'dyno', 'track', 'vehicle']) {
    setTab(t);
    const v = document.querySelector('.viz-panel').getBoundingClientRect();
    const id = t === 'track' ? 'trackPanel' : t === 'vehicle' ? 'vehiclePanel' : 'controlsPanel';
    const p = box(id);
    out[t] = { right: p.w > 0 && p.x >= v.right, below: p.w > 0 && p.y >= v.bottom && Math.abs(p.w - v.width) < 2 };
  }
  setTab('options');
  out.about = (document.getElementById('aboutText') || {}).textContent || '';
  out.ver = (document.getElementById('aboutVer') || {}).textContent || '';
  return out;
});
console.log(JSON.stringify(r));
if (r.sideParent !== 'main') fails.push('right column sits inside ' + r.sideParent);
if (r.loose.length) fails.push('part designers outside the PARTS panel: ' + r.loose.join(', '));
if (r.footer) fails.push('the footer is still on the page');
for (const t of ['engine', 'dyno', 'track']) if (!r[t].right) fails.push(t + ': its panel is not in the right column');
if (!r.vehicle.below) fails.push('vehicle: PERFORMANCE is not below at full width');
if (!/Inspired by Automation/.test(r.about)) fails.push('OPTIONS > ABOUT lacks the old footer text');
if (!/build \d+/.test(r.ver)) fails.push('OPTIONS > ABOUT lacks the build number');
await browser.close();
for (const e of errors) fails.push(e);
if (fails.length) { console.log('FAIL\n  ' + fails.join('\n  ')); process.exit(1); }
console.log('PASS');
