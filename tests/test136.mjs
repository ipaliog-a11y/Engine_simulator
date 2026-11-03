// The electric drivetrain, locked (plans/hybrid-electric/drivetrain.md, stage 0).
//
// WHY THIS EXISTS. The published-figure tests allow 8–20%, so a drive can drift inside the band and stay
// green. This locks the model's own output, at build 224, before any later stage touches it. What must hold:
//   · the three Teslas: peak power and torque, the knee, the continuous reading, the hold, the best
//     efficiency, the pack's resistance and power, the WLTP Wh/km, the 0-100, the top speed, the centre
//     of gravity, and a torque sample at 1000 rpm, at the knee, at twice the knee and at the redline;
//   · the shape above the knee, on a motor that can actually rev past 4× its knee: power flat through 4×,
//     then 4/5 at 5× and 4/6 at 6× (the rectangle motorMaxTorque imposes, CPSR = 4);
//   · the five factory hybrids' motors, which share this drive;
//   · LAMINATIONS defaults to 0.35 mm (stage 1) and REGENERATION to HIGH (stage 2). Wire and a second gear
//     are not on the form yet. CPSR is 4 (3 for an induction motor).
// A later stage edits a locked value only when drivetrain.md names that stage for that block, in the same
// commit as the physics, with the old number and the new one in the CHANGELOG. A stage marked "still"
// does not edit the numbers. Stage 4 (AC copper) moved the continuous power and the hold, and the Model Y
// and Plaid peaks by 1 kW, and the pack-limited torque at the redline: Model 3 continuous 294 → 288 kW,
// hold 54 → 52 s, 108.36 → 108.06 Nm at 18000 rpm; Model Y peak 358 → 357 kW, hold 116 → 114 s,
// 189.83 → 189.32 Nm; Plaid peak 804 → 803 kW, continuous 817 → 804 kW, 382.34 → 380.65 Nm at 20000 rpm.
// Torque at 1000 rpm, the Wh/km inside the lock's tolerance, the 0-100 and the tail did not.
import { chromium } from './pw.mjs';
import { fileURLToPath, pathToFileURL } from 'url';
import path from 'path';
const repo = fileURLToPath(new URL('..', import.meta.url));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
const errors = [];
page.on('console', m => { if (m.type() === 'error' && !/ERR_FILE_NOT_FOUND/.test(m.text())) errors.push('console: ' + m.text()); });
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
await page.goto(pathToFileURL(path.join(repo, 'index.html')).href, { waitUntil: 'networkidle' });
await page.waitForTimeout(400);
const fails = [];

// Locked at build 224. See plans/hybrid-electric/drivetrain.md for which stage may change which block.
const CARS = {
  'Model 3': {
    peakKW: 205, peakTQ: 424, knee: 6671, contKW: 288, holdS: 52, best: 0.9768, kWkg: 3.7, redline: 18000,
    motors: 1, massM: 56.09, massP: 440.12, R: 0.066236, Vnom: 340.84, p50: 209737, p10: 202273,
    whkm: 119.53, wall: 140.63, regen: 49.64, range: 451.8, fd: 9.03, drive: 'rwd',
    t100: 6.185, t60: 5.925, top: 225, cg: 0.52,
    pts: { 1000: 424.46, 6671: 289.05, 13342: 146.72, 18000: 108.06 }
  },
  'Model Y': {
    peakKW: 357, peakTQ: 541, knee: 6859, contKW: 288, holdS: 114, best: 0.9788, kWkg: 3.6, redline: 18000,
    motors: 2, massM: 99.24, massP: 424.84, R: 0.05256, Vnom: 352.93, p50: 377316, p10: 294578,
    whkm: 141.33, wall: 166.27, regen: 56.44, range: 496.7, fd: 9.03, drive: 'awd',
    t100: 4.55, t60: 4.375, top: 217, cg: 0.66,
    pts: { 1000: 540.52, 6859: 492.32, 13718: 249.23, 18000: 189.32 }
  },
  Plaid: {
    peakKW: 803, peakTQ: 1408, knee: 6109, contKW: 804, holdS: 19, best: 0.9752, kWkg: 4.8, redline: 20000,
    motors: 3, massM: 168.27, massP: 625.78, R: 0.029359, Vnom: 404.4, p50: 824184, p10: 692384,
    whkm: 166.27, wall: 195.61, regen: 59.69, range: 541.3, fd: 7.56, drive: 'awd',
    t100: 2.525, t60: 2.435, top: 322, cg: 0.52,
    pts: { 1000: 1407.64, 6109: 1218.13, 12218: 628.36, 20000: 380.65 }
  }
};
const HYB = {
  'Ioniq': { mode: 'p2', tq: 166, kW: 87.9, packKW: 32.33, packR: 0.27024, front: 0 },
  'Prius': { mode: 'ps', tq: 163.4, kW: 53.27, packKW: 29.91, packR: 0.27166, front: 0 },
  'Qashqai': { mode: 'series', tq: 335, kW: 143.31, packKW: 43.52, packR: 0.45169, front: 0 },
  '330e': { mode: 'p2', tq: 264.8, kW: 81.39, packKW: 101.51, packR: 0.18635, front: 0 },
  '918': { mode: 'p2', tq: 227.1, kW: 121.6, packKW: 140.92, packR: 0.16371, front: 210.4 }
};
// A sleeve, 4-pole, SiC motor that revs past 4× its knee. Power is flat, then falls as CPSR / (speed/knee).
const TAIL = { knee: 5108, nMax: 40000, p1: 60247, p2: 60247, p4: 60247, p5: 48198, p6: 40165 };

const r = await page.evaluate(() => {
  const cars = [];
  for (const preset of EV_VEHICLE_PRESETS) {
    loadVehiclePreset(preset);
    const e = engine, V = motorRatedV(e), tc = e.motor.cool.tCool, cool = { w: tc, c: tc, r: 60 };
    const knee = e.score.knee;
    const at = rpm => driveTorqueRated(e, Math.max(1, rpm), V, cool, Infinity);
    const cyc = evCycle(e, vehicle);
    const m0 = e.motor.parts ? e.motor.parts[0].m : e.motor;
    cars.push({
      name: preset.name,
      peakKW: e.score.peakKW, peakTQ: e.score.peakTQ, knee, contKW: e.score.contKW, holdS: e.score.holdS,
      best: e.score.bestEff.e, kWkg: e.score.kWkg, redline: e.redline,
      motors: e.motor.count || 1, massM: e.motor.mass, massP: e.pack.mass,
      R: e.pack.R, Vnom: e.pack.Vnom, p50: packMaxPower(e.pack, 0.5), p10: packMaxPower(e.pack, 0.1),
      whkm: cyc.whkm, wall: cyc.wall, regen: cyc.regen, range: cyc.range,
      fd: vehicle.finalDrive, drive: vehicle.drive,
      t100: perf.t100, t60: perf.t60, top: perf.topSpeed, cg: vehicle.cg,
      pts: { 1000: at(1000), [knee]: at(knee), [Math.round(knee * 2)]: at(knee * 2), [e.redline]: at(e.redline) },
      lam: m0.s.lamination ?? null
    });
  }
  const hy = [];
  for (const preset of HYB_VEHICLE_PRESETS) {
    loadVehiclePreset(preset);
    const h = engine.hy, V = hybBusV(h);
    const ns = [1500, 3000, 5000, 8000];
    hy.push({
      name: preset.name, mode: h.mode,
      tq: motorMaxTorque(h.motor, 1500, V, 60),
      kW: Math.max(...ns.map(n => { const rpm = Math.min(n, h.motor.nMax - 1); return motorMaxTorque(h.motor, rpm, V, 60) * rpm * Math.PI / 30 / 1000; })),
      packKW: packMaxPower(h.pack, HYB_SOC) / 1000, packR: h.pack.R,
      front: h.front ? motorMaxTorque(h.front.motor, 1500, V, 60) : 0
    });
  }
  const m = motorBuild({ rotorD: 100, stackL: 80, poles: 4, turns: 40, magnet: 'ndfeb', retention: 'sleeve', cooling: 'jacket', inverter: 'sic', invAmps: 200, maxRpm: 40000 });
  const V = 350, psi = motorPsi(m, 60), knee = motorBaseW(m, V, psi) * 30 / Math.PI;
  const P = n => motorMaxTorque(m, n, V, 60) * n * Math.PI / 30;
  const absent = ['evWire', 'evGear2'].filter(id => document.getElementById(id));
  const lamEl = document.getElementById('evLamination'), regenEl = document.getElementById('evRegen');
  return { cars, hy, tail: { knee, nMax: m.nMax, p1: P(knee), p2: P(2 * knee), p4: P(4 * knee), p5: P(5 * knee), p6: P(6 * knee) }, absent, lam: lamEl ? lamEl.value : null, regen: regenEl ? regenEl.value : null, cpsr: CPSR, im: IM_CPSR };
});

const f = (x, d = 2) => (+x).toFixed(d);
const near = (got, want, rel, abs, label) => {
  if (!Number.isFinite(got)) { fails.push(`${label}: not a number`); return; }
  const d = Math.abs(got - want);
  if (d > abs && d > Math.abs(want) * rel) fails.push(`${label}: ${f(got, 4)} against the locked ${f(want, 4)}`);
};
const exact = (got, want, label) => { if (got !== want) fails.push(`${label}: ${got} against the locked ${want}`); };

for (const [key, want] of Object.entries(CARS)) {
  const c = r.cars.find(x => x.name.includes(key));
  if (!c) { fails.push(`no factory car matching ${key}`); continue; }
  console.log(`== ${c.name}: ${c.peakKW} kW, ${c.peakTQ} Nm, knee ${c.knee}, cont ${c.contKW} kW, hold ${c.holdS} s, ` +
    `${f(c.whkm)} Wh/km, 0-100 ${f(c.t100, 3)} s, top ${f(c.top, 0)}, cg ${c.cg} ==`);
  exact(c.peakKW, want.peakKW, `${key} peak kW`);
  exact(c.peakTQ, want.peakTQ, `${key} peak Nm`);
  exact(c.knee, want.knee, `${key} knee`);
  exact(c.contKW, want.contKW, `${key} continuous kW`);
  exact(c.holdS, want.holdS, `${key} hold`);
  exact(c.redline, want.redline, `${key} redline`);
  exact(c.motors, want.motors, `${key} motors`);
  exact(c.drive, want.drive, `${key} drive`);
  exact(c.kWkg, want.kWkg, `${key} kW/kg`);
  exact(c.lam, 0.35, `${key} lamination`);
  near(c.best, want.best, 0.002, 0.0005, `${key} best efficiency`);
  near(c.massM, want.massM, 0.002, 0.05, `${key} motor mass`);
  near(c.massP, want.massP, 0.002, 0.05, `${key} pack mass`);
  near(c.R, want.R, 0.002, 1e-5, `${key} pack resistance`);
  near(c.Vnom, want.Vnom, 0.002, 0.05, `${key} pack voltage`);
  near(c.p50, want.p50, 0.002, 50, `${key} pack power at 50%`);
  near(c.p10, want.p10, 0.002, 50, `${key} pack power at 10%`);
  near(c.whkm, want.whkm, 0.002, 0.05, `${key} Wh/km`);
  near(c.wall, want.wall, 0.002, 0.05, `${key} socket Wh/km`);
  near(c.regen, want.regen, 0.002, 0.05, `${key} regen Wh/km`);
  near(c.range, want.range, 0.002, 0.2, `${key} range`);
  near(c.fd, want.fd, 0, 0.005, `${key} reduction`);
  near(c.t100, want.t100, 0, 0.01, `${key} 0-100`);
  near(c.t60, want.t60, 0, 0.01, `${key} 0-60`);
  near(c.top, want.top, 0, 0.05, `${key} top speed`);
  near(c.cg, want.cg, 0, 0.001, `${key} centre of gravity`);
  for (const [rpm, tq] of Object.entries(want.pts)) near(c.pts[rpm], tq, 0.002, 0.3, `${key} torque at ${rpm} rpm`);
  const pKnee = c.pts[want.knee] * want.knee, p2 = c.pts[Math.round(want.knee * 2)] * Math.round(want.knee * 2);
  if (!(p2 > 0) || Math.abs(p2 / pKnee - 1) > 0.04) fails.push(`${key}: power at 2× the knee is not flat (${f(p2 / pKnee)})`);
}

const tail = r.tail;
console.log(`== tail: knee ${f(tail.knee, 0)} rpm, nMax ${f(tail.nMax, 0)}, power ${[tail.p1, tail.p2, tail.p4, tail.p5, tail.p6].map(x => f(x, 0)).join(' / ')} W at 1× 2× 4× 5× 6× ==`);
near(tail.knee, TAIL.knee, 0, 1, 'tail knee');
exact(Math.round(tail.nMax), TAIL.nMax, 'tail redline');
near(tail.p1, TAIL.p1, 0.002, 2, 'tail power at the knee');
near(tail.p2, TAIL.p2, 0.002, 2, 'tail power at 2×');
near(tail.p4, TAIL.p4, 0.002, 2, 'tail power at 4×');
near(tail.p5, TAIL.p5, 0.002, 2, 'tail power at 5×');
near(tail.p6, TAIL.p6, 0.002, 2, 'tail power at 6×');
if (Math.abs(tail.p5 / tail.p1 - 0.8) > 0.005) fails.push(`at 5× the knee power is ${f(tail.p5 / tail.p1)} of the knee, not 4/5`);
if (Math.abs(tail.p6 / tail.p1 - 4 / 6) > 0.005) fails.push(`at 6× the knee power is ${f(tail.p6 / tail.p1)} of the knee, not 4/6`);

for (const [key, want] of Object.entries(HYB)) {
  const h = r.hy.find(x => x.name.includes(key));
  if (!h) { fails.push(`no factory hybrid matching ${key}`); continue; }
  console.log(`== ${h.name}: ${h.mode}, ${f(h.tq, 1)} Nm, ${f(h.kW)} kW, pack ${f(h.packKW)} kW, R ${f(h.packR, 5)}` +
    (h.front ? `, front ${f(h.front, 1)} Nm` : '') + ' ==');
  exact(h.mode, want.mode, `${key} hybrid layout`);
  near(h.tq, want.tq, 0.002, 0.2, `${key} motor torque`);
  near(h.kW, want.kW, 0.002, 0.1, `${key} motor kW`);
  near(h.packKW, want.packKW, 0.002, 0.1, `${key} pack kW`);
  near(h.packR, want.packR, 0.002, 1e-5, `${key} pack resistance`);
  near(h.front, want.front, 0.002, 0.2, `${key} front motor torque`);
}

console.log(`== LAMINATIONS ${r.lam}; REGENERATION ${r.regen}; later fields still absent (${r.absent.join(', ') || 'none'}); CPSR ${r.cpsr}, induction ${r.im} ==`);
if (r.lam !== '0.35') fails.push('LAMINATIONS is not on the form at 0.35 mm');
if (r.regen !== 'high') fails.push('REGENERATION is not on the form at HIGH');
if (r.absent.length) fails.push('a later field is already on the form: ' + r.absent.join(', '));
exact(r.cpsr, 4, 'magnet CPSR');
exact(r.im, 3, 'induction CPSR');

if (errors.length) console.log('ERRORS:\n  ' + errors.join('\n  '));
if (fails.length || errors.length) {
  console.log('\nFAIL:\n  ' + fails.concat(errors).join('\n  '));
  process.exit(1);
}
console.log('\nOK: the electric drivetrain matches the lock. A later stage edits it only as plans/hybrid-electric/drivetrain.md allows.');
await browser.close();
