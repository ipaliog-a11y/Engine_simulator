// WHY THIS EXISTS (build 307): the FAULT lamp is the check-engine lamp, run by OBD-II rules (obd.js). What must hold:
//   · a healthy default engine running on the bench stores no code and the lamp stays dark;
//   · a fault seen in one drive cycle is PENDING (amber); seen again on the next start it is CONFIRMED (red);
//   · three clean drive cycles put the lamp out and keep the code as HISTORY; CLEAR CODES and a rebuild erase it;
//   · a catalyst-damaging misfire flashes the lamp at once; each code keeps a freeze frame;
//   · knock past KNOCK_TARGET sets P0324; a decat build sets P0420; the click opens the list; nothing moves torque.
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
await page.evaluate(() => { applyBuild({ engine: Object.assign({}, DEFAULT_ENGINE), tune: Object.assign({}, STD_TUNE) }); setTab('engine'); });
await page.waitForTimeout(4000);   // the real loop runs the healthy engine
const fails = [];

const r = await page.evaluate(() => {
  const o = { healthy: Object.keys(obd.codes), lamp0: document.getElementById('lampFault').className };
  const tq0 = brakeTorqueRaw(4000, 1, false);
  // Everything below runs synchronously, so the page's own loop cannot step in between.
  const run = (s, hot) => { for (let i = 0; i < s * 20; i++) { if (hot) state.coolant = 120; obdStep(0.05); } };
  const cycle = (s, hot) => { state.firing = false; obdStep(0.05); state.firing = true; run(s, hot); };
  const cls = () => { updateDashLamps(); return document.getElementById('lampFault').className; };
  state.coolant = 90; run(30, true);
  o.c1 = obd.codes.P0217 && obd.codes.P0217.status; o.ff = obd.codes.P0217 && obd.codes.P0217.ff; o.lamp1 = cls();
  cycle(30, true); o.c2 = obd.codes.P0217 && obd.codes.P0217.status; o.lamp2 = cls();
  state.coolant = 90; for (let i = 0; i < 3; i++) cycle(30, false);
  cycle(1, false);   // a cycle counts when it ends: at the next start
  o.c3 = obd.codes.P0217 && obd.codes.P0217.status; o.lamp3 = cls();
  obdClear(); o.cleared = Object.keys(obd.codes).length;
  // misfire: weak 12 V past the dwell limit
  const v = state.systemVoltage, rpm = state.rpm; state.systemVoltage = 9.5; state.rpm = engine.redline * 0.98;
  o.mis = obdMisfire(); obdStep(0.05); obdStep(1.1); o.flash = obdLamp(); o.lampF = cls();
  o.p0300 = obd.codes.P0300 && obd.codes.P0300.status;
  state.systemVoltage = v; state.rpm = rpm; obdStep(0.05);
  // knock and decat, read as conditions
  const k = state.knockRisk; state.knockRisk = KNOCK_TARGET + 5; o.knock = !!obdConditions().P0324; state.knockRisk = k;
  const cc = engine.catConv; engine.catConv = 0; o.decat = !!obdConditions().P0420; engine.catConv = cc;
  o.tq1 = brakeTorqueRaw(4000, 1, false); o.tq0 = tq0;
  obd.codes.P0217 = { status: 'confirmed', clean: 0, newCycle: false, ff: obdFreezeFrame() };
  document.getElementById('lampFault').click();
  o.list = !document.getElementById('obdPanel').hidden && /P0217/.test(document.getElementById('obdPanel').textContent);
  buildEngine(); o.rebuilt = Object.keys(obd.codes).length;
  return o;
});
console.log(`healthy: codes [${r.healthy}] lamp "${r.lamp0}"`);
console.log(`overheat: cycle 1 ${r.c1} (${r.lamp1}), cycle 2 ${r.c2} (${r.lamp2}), 3 clean cycles ${r.c3} (${r.lamp3}); ff ${JSON.stringify(r.ff)}`);
console.log(`misfire ${(r.mis * 100).toFixed(0)}%: lamp ${r.flash} (${r.lampF}), P0300 ${r.p0300}; knock P0324 ${r.knock}; decat P0420 ${r.decat}`);
if (r.healthy.length) fails.push('a healthy engine stored ' + r.healthy);
if (/warn|danger/.test(r.lamp0)) fails.push('the lamp is lit on a healthy engine');
if (r.c1 !== 'pending' || !/\bwarn\b/.test(r.lamp1)) fails.push('one cycle of overheat is not a pending (amber) code');
if (!r.ff || r.ff.coolant < 112) fails.push('no freeze frame of the overheat');
if (r.c2 !== 'confirmed' || !/\bdanger\b/.test(r.lamp2)) fails.push('a second cycle did not confirm the code and light the lamp');
if (r.c3 !== 'history' || /warn|danger/.test(r.lamp3)) fails.push('three clean cycles did not put the lamp out and keep history');
if (r.cleared) fails.push('CLEAR CODES left codes');
if (r.flash !== 'flash' || !/lamp-blink/.test(r.lampF) || r.p0300 !== 'confirmed') fails.push('a heavy misfire does not flash the lamp and confirm P0300');
if (!r.knock) fails.push('knock past the ECU does not set P0324');
if (!r.decat) fails.push('no catalyst does not set P0420');
if (r.tq1 !== r.tq0) fails.push('diagnostics moved the torque');
if (!r.list) fails.push('clicking FAULT does not list the codes');
if (r.rebuilt) fails.push('a rebuild kept the codes');
fails.push(...errors);
await browser.close();
if (fails.length) { console.log('\nFAIL\n' + fails.map(f => '  - ' + f).join('\n')); process.exit(1); }
console.log('\nPASS');
