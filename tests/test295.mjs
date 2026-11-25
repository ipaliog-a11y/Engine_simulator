// WHY THIS EXISTS: build 475 (G3), engine braking at the limiter. Past the limiter in every gear the fuel is cut,
// and the lap solver gave the drive as zero, so on a descent past the top-gear redline speed only the air held the
// car back. A fuel cut is not a free wheel: the engine, still in gear, brakes the car with the overrun torque the
// braking zones already use (overrunTable: brakeTorqueRaw with the fuel cut). What must hold:
//   · the lap solver (accFrom) past the limiter on the flat slows the car by the engine's drag at the limiter,
//     overrunTable(rl) × ratio / (rTire × eff), over the effective mass, beyond the air and the tyres;
//   · on a descent past the limiter the car gains less speed with that drag than without it, in the lap solver and
//     in the open-road solver (ecoMinTime);
//   · no console or page errors.
import { chromium } from './pw.mjs';
import { fileURLToPath, pathToFileURL } from 'url';
import path from 'path';

const repo = fileURLToPath(new URL('..', import.meta.url));
const browser = await chromium.launch();
const page = await browser.newPage();
const errors = [];
page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
await page.goto(pathToFileURL(path.join(repo, 'index.html')).href, { waitUntil: 'networkidle' });
const fails = [];

const r = await page.evaluate(() => {
  loadVehiclePreset(FACTORY_CARS.find(x => x.name.startsWith('Volkswagen Golf GTI (Mk1')));
  vehicle.governor = 0;
  const pt = powertrain(), rl = pt.maxRpm(), top = vehicle.ratios.length - 1, tot = vehicle.ratios[top] * vehicle.finalDrive;
  const vLim = rl / 60 * 2 * Math.PI * vehicle.rTire / tot, v = 1.05 * vLim;
  const real = COMBUSTION.overrunTable, tab = real.call(COMBUSTION, rl), x = (rl - 500) / 250, k = Math.floor(x);
  const ovLim = tab[k] + (tab[k + 1] - tab[k]) * (x - k);
  const Fov = ovLim * tot / (vehicle.rTire * vehicle.driveEff), mE = vehicleMassEff(tot);
  const pt0 = (sinT, ds3 = 5) => ({ r: 1e6, ds3, cosT: Math.sqrt(1 - sinT * sinT), sinT, kv: 0, kw: 0, kws: 0, turn: 1 });
  const accel = (sinT) => {
    const pr = simulateLapRun('tsukuba', { quick: true, probe: true, line: buildTrack('tsukuba').centre });
    const q = pt0(sinT), cap = pr.accFrom(q, v).cap;
    return (cap * cap - v * v) / (2 * q.ds3);
  };
  const line = []; for (let i = 0; i < 200; i++) line.push(pt0(-0.2, 10));   // 2 km at 20% down: past what the air alone holds
  const run = () => { const L = ecoMinTime(line, 0); return L && L.v ? Math.max(...L.v) : null; };
  const a = accel(0), aDown = accel(-0.2), ecoTop = run();
  COMBUSTION.overrunTable = rl2 => tab.map(() => 0);   // the same solvers without the engine's drag
  let a0, aDown0, ecoTop0;
  try { a0 = accel(0); aDown0 = accel(-0.2); ecoTop0 = run(); } finally { COMBUSTION.overrunTable = real; }
  return { vLim, ovLim, Fov, mE, a, a0, aDown, aDown0, ecoTop, ecoTop0 };
});

console.log(`Golf GTI Mk1: top-gear limiter speed ${(r.vLim * 3.6).toFixed(1)} km/h, engine drag at the limiter ${r.ovLim.toFixed(1)} Nm`);
console.log(`  flat, 5% past it:  a ${r.a.toFixed(3)} m/s2 (without the drag ${r.a0.toFixed(3)}); expected difference ${(-r.Fov / r.mE).toFixed(3)}`);
console.log(`  20% descent:       a ${r.aDown.toFixed(3)} m/s2 (without ${r.aDown0.toFixed(3)})`);
console.log(`  open road, 2 km at 20% down: top ${(r.ecoTop * 3.6).toFixed(1)} km/h (without ${(r.ecoTop0 * 3.6).toFixed(1)})`);

if (!(r.ovLim > 1)) fails.push(`engine drag at the limiter is ${r.ovLim} Nm`);
const d = r.a - r.a0, want = -r.Fov / r.mE;
if (!(Math.abs(d - want) <= 0.01 * Math.abs(want))) fails.push(`lap: drag at the limiter slows by ${d.toFixed(4)} m/s2, not ${want.toFixed(4)}`);
if (!(r.aDown < r.aDown0 - 0.5 * Math.abs(want))) fails.push(`lap descent: ${r.aDown} not below ${r.aDown0}`);
if (!(r.ecoTop < r.ecoTop0 - 0.1)) fails.push(`open road descent: top ${r.ecoTop} not below ${r.ecoTop0}`);
fails.push(...errors);
await browser.close();
if (fails.length) { console.log('FAIL\n  ' + fails.join('\n  ')); process.exit(1); }
console.log('PASS');
