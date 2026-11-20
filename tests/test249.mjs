// Coast ramps of the factory clutch-plate LSD where the maker publishes them (build 405). A test only.
//
// WHY THIS EXISTS. The friction pack locks by L x the input torque on drive and Lc x it on the coast (the two ramp
// angles); DIFF_CLSD_RAMPS holds the presets whose maker publishes both. What must hold:
//   · the 718 Cayman GT4 (manual) reads Porsche's 22% on drive and 27% on overrun;
//   · every other factory clutch-LSD preset stays a 2-way at 0.37, and a designed diff (PARTS) is a 2-way;
//   · the stepped car uses Lc on the coast: the GT4's ISO 9816 lift-off differs from the same car with Lc set to L;
//   · its stepped 0-100 and lift-off are reported, before (2-way 0.37) and after; no page errors.
import { chromium } from './pw.mjs';
import { fileURLToPath, pathToFileURL } from 'url';
import path from 'path';
const repo = fileURLToPath(new URL('..', import.meta.url));
const browser = await chromium.launch();
const page = await browser.newPage();
const errors = [], fails = [];
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
await page.goto(pathToFileURL(path.join(repo, 'index.html')).href, { waitUntil: 'networkidle' });
await page.waitForTimeout(300);
const R = await page.evaluate(() => {
  const GT4 = 'Porsche 718 Cayman GT4 (2020)';
  const mk = (n, d) => { loadVehiclePreset(FACTORY_CARS.find(x => x.name === n)); const c = driveCar(); if (d) c.diff = Object.assign({}, c.diff, d); return c; };
  const lift = car => {   // ISO 9816 power-off in a turn, as test204: 40 m, 4 m/s2, steering held, read at 1 s
    const Rc = 40, v = Math.sqrt(4 * Rc), line = [];
    for (let i = 0; i < 1440; i++) { const a = i * Math.PI / 720; line.push({ x: Rc * Math.sin(a), y: Rc * (1 - Math.cos(a)), v, grade: 0, kv: 0 }); }
    const s = driveState(car), d = { i: 0 };
    s.vx = v; s.w = s.w.map(() => v / car.r); s.gear = 2; s.we = v / car.r * car.ratios[1] * car.fd;
    let st = 0, n = 0;
    for (let i = 0; i < 2000; i++) { const u = driveDriver(car, s, line, d); stepCar(car, s, u, 0.01); if (i >= 1700) { st += u.steer; n++; } }
    const kap = s => s.yaw / Math.hypot(s.vx, s.vy), k0 = kap(s), u = { steer: st / n, throttle: 0, brake: 0, gear: s.gear };
    for (let i = 0; i < 100; i++) stepCar(car, s, u, 0.01);
    return kap(s) / k0;
  };
  const others = FACTORY_CARS.filter(c => c.fit && c.fit.diff === 'clsd' && c.name !== GT4).map(c => { const d = mk(c.name).diff; return { n: c.name, d }; });
  const g = mk(GT4).diff;
  const part = diffCoupling(diffSpec({ ramp_deg: 45, faces: 6, rFace_mm: 40, rRamp_mm: 50, preload_Nm: 60 }));
  return { g, part, others: others.filter(o => o.d.type === 'fric' && !(o.d.L === 0.37 && o.d.Lc === 0.37)).map(o => o.n + ' ' + JSON.stringify(o.d)),
    nOthers: others.filter(o => o.d.type === 'fric').length,
    lift: lift(mk(GT4)), liftCoastAsDrive: lift(mk(GT4, { Lc: 0.22 })), lift2way: lift(mk(GT4, { L: 0.37, Lc: 0.37 })),
    t100: driveSprint(mk(GT4)).t, t100_2way: driveSprint(mk(GT4, { L: 0.37, Lc: 0.37 })).t };
});
await browser.close();
const f = x => x.toFixed(3);
console.log(`GT4 coupling: ${JSON.stringify(R.g)}; designed part: L ${f(R.part.L)}, Lc ${f(R.part.Lc)}`);
console.log(`other factory clutch LSDs checked: ${R.nOthers}`);
console.log(`GT4 ISO 9816 lift-off curvature at 1 s: x${f(R.lift)} (published 22/27); x${f(R.lift2way)} (2-way 0.37, before); x${f(R.liftCoastAsDrive)} (2-way 0.22)`);
console.log(`GT4 stepped 0-100: ${f(R.t100)} s (before, 2-way 0.37: ${f(R.t100_2way)} s)`);
if (!(R.g.type === 'fric' && R.g.L === 0.22 && R.g.Lc === 0.27)) fails.push('GT4 does not read 22% drive / 27% overrun');
for (const o of R.others) fails.push('not a 2-way at 0.37: ' + o);
if (!(R.nOthers > 30)) fails.push('too few clutch-LSD presets found: ' + R.nOthers);
if (!(R.part.Lc === R.part.L)) fails.push('a designed diff is not a 2-way');
if (!(Math.abs(R.lift - R.liftCoastAsDrive) > 1e-4)) fails.push('the coast lock Lc is not used on lift-off');
if (!(R.t100 > 0)) fails.push('GT4 0-100 not reached');
for (const e of errors) fails.push(e);
if (fails.length) { console.log('\nFAIL'); for (const x of fails) console.log('  - ' + x); process.exit(1); }
console.log('\nPASS');
