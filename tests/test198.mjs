// The centre coupling of an all-wheel-drive car in the stepped car, by type (build 320).
//
// WHY THIS EXISTS. Every all-wheel-drive car had its two axles locked together off the brakes. The centre is now the
// car's own (centreCoupling, CENTRE_DIFF): an electronically controlled clutch closed on slip ('lock'), an open
// centre with its split, a Torsen ('fric', lock x input torque) or a viscous coupling. What must hold:
//   · the sourced presets get their type (Torsen: Land Cruiser 200, Amarok, Urus; viscous: Delta Integrale, 993 Turbo,
//     Diablo VT, Murciélago; open: Sport quattro), every other all-wheel-drive preset 'lock';
//   · build 404: the clutches with a published limit carry it (GT-R R35 and R34: front at most 50%; Focus RS: rear at
//     most 70%), and a limit the launch exceeds lets the axles part;
//   · on a full-throttle launch of one car (GR Yaris, aids off), the axles' mean speeds part by nothing locked, most
//     open, and in between for a Torsen and a viscous coupling (Torsen < viscous < open);
//   · no page errors.
import { chromium } from './pw.mjs';
import { fileURLToPath, pathToFileURL } from 'url';
import path from 'path';
const repo = fileURLToPath(new URL('..', import.meta.url));
const browser = await chromium.launch();
const page = await browser.newPage();
const errors = [], fails = [];
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
await page.goto(pathToFileURL(path.join(repo, 'index.html')).href, { waitUntil: 'networkidle' });

const R = await page.evaluate(() => {
  const out = { table: {}, launch: {} };
  for (const P of FACTORY_CARS.filter(x => x.fit && x.fit.drive === 'awd')) { loadVehiclePreset(P); const c = driveCar(); out.table[P.name] = c.centre && c.centre.type; if (c.centre && c.centre.type === 'lock' && c.centre.L != null) out.table[P.name] += ' f' + c.centre.f + ' L' + c.centre.L; }
  const types = { lock: { type: 'lock', f: 0.5 }, open: { type: 'open', f: 0.5 }, fric: { type: 'fric', f: 0.5, L: 0.25 }, visc: { type: 'visc', f: 0.5, c: 1500 }, limit: { type: 'lock', f: 1, L: 0.2 } };
  for (const k in types) {
    loadVehiclePreset(FACTORY_CARS.find(x => x.name.startsWith('Toyota GR Yaris')));
    const car = driveCar(); car.tc = false; car.esp = false; car.centre = types[k];
    const s = driveLaunch(car); let d = 0;
    while (s.t < 2) { stepCar(car, s, { steer: 0, throttle: 1, brake: 0 }, 0.005); d = Math.max(d, Math.abs((s.w[0] + s.w[1]) / 2 - (s.w[2] + s.w[3]) / 2) * car.r * 3.6); }
    out.launch[k] = d;
  }
  return out;
});
await browser.close();

const WANT = { 'Toyota Land Cruiser 200 VX 4.5 D-4D (2015)': 'fric', 'Volkswagen Amarok 3.0 V6 TDI (2018)': 'fric', 'Lamborghini Urus (2018)': 'fric',
  'Lancia Delta HF Integrale Evoluzione (1992)': 'visc', 'Porsche 911 Turbo (993, 1995)': 'visc', 'Lamborghini Diablo VT (1993)': 'visc',
  'Lamborghini Murciélago LP640 (2006)': 'visc', 'Audi Sport quattro (1984)': 'open',
  'Nissan GT-R (R35, 2017)': 'lock f0 L0.5', 'Nissan Skyline GT-R V-spec (R34, 1999)': 'lock f0 L0.5', 'Ford Focus RS (Mk3, 2016)': 'lock f1 L0.7' };
for (const [n, t] of Object.entries(R.table)) { const w = WANT[n] || 'lock'; if (t !== w) fails.push(`${n}: centre ${t}, want ${w}`); }
for (const n in WANT) if (!(n in R.table)) fails.push(`${n}: not an all-wheel-drive preset any more`);
console.log(`${Object.keys(R.table).length} all-wheel-drive presets checked`);
const L = R.launch;
console.log('launch, axles apart at most (km/h): ' + Object.entries(L).map(([k, v]) => `${k} ${v.toFixed(2)}`).join(', '));
if (!(L.lock < 0.01)) fails.push('a locked centre lets the axles part');
if (!(L.open > 2)) fails.push('an open centre holds the axles together');
if (!(L.limit > 0.5)) fails.push('a clutch with a 20% limit holds the axles together');
if (!(L.fric < L.visc && L.visc < L.open)) fails.push('want Torsen < viscous < open');
if (errors.length) fails.push(...errors);
if (fails.length) { console.log('\nFAIL\n' + fails.map(f => '  - ' + f).join('\n')); process.exit(1); }
console.log('\nPASS');
