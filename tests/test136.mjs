// The electric drivetrain, locked (plans/hybrid-electric/drivetrain.md, stage 0).
//
// WHY THIS EXISTS. The published-figure tests allow 8–20%, so a drive can drift inside the band and stay
// green. This locks the model's own output, at build 224, before any later stage touches it. What must hold:
//   · the three Teslas: peak power and torque, the knee, the continuous reading, the hold, the best
//     efficiency, the pack's resistance and power, the WLTP Wh/km, the 0-100, the top speed, the centre
//     of gravity, and a torque sample at 1000 rpm, at the knee, at twice the knee and at the redline;
//   · the shape above the knee, on a motor that can actually rev past 4× its knee. Until build 294 a rectangle
//     (flat to 4×, then 4/5 and 4/6, CPSR = 4); since then the d and q axes under the inverter's voltage and current
//     (no CPSR for a magnet motor): power rises past the knee as the current turns to the d-axis, then falls;
//   · the five factory hybrids' motors, which share this drive;
//   · LAMINATIONS defaults to 0.35 mm (stage 1), REGENERATION to HIGH (stage 2), and WINDING and CONDUCTOR to
//     ROUND and COPPER (stage 6). A second gear is not on the form yet. An induction motor's CPSR is 3.
// A later stage edits a locked value only when drivetrain.md names that stage for that block, in the same
// commit as the physics, with the old number and the new one in the CHANGELOG. A stage marked "still"
// does not edit the numbers. Stage 4 (AC copper) moved the continuous power and the hold, and the Model Y
// and Plaid peaks by 1 kW, and the pack-limited torque at the redline: Model 3 continuous 294 → 288 kW,
// hold 54 → 52 s, 108.36 → 108.06 Nm at 18000 rpm; Model Y peak 358 → 357 kW, hold 116 → 114 s,
// 189.83 → 189.32 Nm; Plaid peak 804 → 803 kW, continuous 817 → 804 kW, 382.34 → 380.65 Nm at 20000 rpm.
// Torque at 1000 rpm, the Wh/km inside the lock's tolerance, the 0-100 and the tail did not.
// Build 292 (plans/road-to-v1.md, phase C step 1: the magnets as geometry, through a magnetic circuit with the steel's
// curve) re-locked every block: Model 3 424 → 422 Nm, knee 6671 → 6714, 119.53 → 119.04 Wh/km, motor 56.09 → 55.16 kg;
// Model Y 541 → 538 Nm, 0-100 4.55 → 4.56 s; Plaid 1408 → 1428 Nm, knee 6109 → 6020; the hybrids' motors 3-6% more
// torque at the same turns, so the three whose torque is published were re-matched to it (turns are not published):
// Prius 100 → 95 turns, 163.4 → 164.0 Nm; Qashqai 26 → 24, 335 → 330.4 Nm; 330e 48 → 46, 264.8 → 263.2 Nm. Ioniq
// 166 → 171 Nm (170 published), 918 227 → 238 and 210 → 221 (unpublished). The tail
// motor's thin yoke now saturates, which raised its knee to 7049 rpm, past a sixth of its 40000: it has 55 turns, not 40,
// to put the knee back near 5100 rpm.
// Build 293 (the teeth and yoke sized from the flux, Pyrhonen Table 6.1) re-locked them again. The Teslas' inverter
// currents were re-matched to their published torque (Model 3 1000 → 950 A, Model Y rear 720 → 700 A): Model 3 knee
// 6714 → 6437, continuous 291 → 266 kW, hold 52 → 19 s (its winding has less copper, so it heats faster);
// Model Y hold 114 → 72 s; Plaid 1428 → 1441 Nm, continuous 808 → 745 kW, hold 19 → 12 s. The hybrids' turns
// re-matched to their published torque (Ioniq 33, Prius 103, Qashqai 26, 330e 55); the 918's motors 238 → 221 and
// 221 → 204 Nm. The tail motor's knee 5126 → 3422 rpm.
// Build 294 (saturation, field weakening and the iron loss from the circuit solved under load; SAT_K, V_DROP and CPSR
// retired) re-locked every block. The Teslas' currents re-matched (Model 3 950 → 850 A, 424 Nm; Model Y rear 700 → 640 A)
// and the hybrids' turns (Ioniq 33 → 30, Prius 103 → 92, Qashqai 26 → 23, 330e 55 → 50). Model 3 knee 6437 → 6627,
// continuous 266 → 259 kW, hold 19 → 37 s, 119.72 → 117.56 Wh/km; Model Y 544 → 549 Nm, 141.39 → 139.63 Wh/km; Plaid
// 1441 → 1519 Nm, 802 → 794 kW, 165.7 → 160.22 Wh/km. Past the knee a magnet motor's power now rises as its current
// turns to the d-axis: the hybrids' motors' peaks 86 → 114 kW (Ioniq), 53 → 69 (Prius), 143 → 194 (Qashqai), 80 → 107
// (330e) against their published 32, 53, 140 and 80 (a named gap in the CHANGELOG; the pack caps them in the car).
// The tail motor's knee 3422 → 1784 rpm.
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
    peakKW: 204, peakTQ: 424, knee: 6627, contKW: 259, holdS: 37, best: 0.9765, kWkg: 3.7, redline: 18000,
    motors: 1, massM: 55.18, massP: 440.12, R: 0.066236, Vnom: 340.84, p50: 209737, p10: 202273,
    whkm: 117.56, wall: 138.31, regen: 49.59, range: 459.3, fd: 9.03, drive: 'rwd',
    t100: 6.18, t60: 5.92, top: 225, cg: 0.52,
    pts: { 1000: 424.09, 6627: 291.59, 13254: 145.44, 18000: 105.79 }
  },
  'Model Y': {
    peakKW: 360, peakTQ: 549, knee: 7140, contKW: 316, holdS: 95, best: 0.9745, kWkg: 3.7, redline: 18000,
    motors: 2, massM: 98.3, massP: 424.84, R: 0.05256, Vnom: 352.93, p50: 377316, p10: 294578,
    whkm: 139.63, wall: 164.27, regen: 56.39, range: 502.8, fd: 9.03, drive: 'awd',
    t100: 4.48, t60: 4.31, top: 217, cg: 0.66,
    pts: { 1000: 548.77, 7140: 476.04, 14280: 239.73, 18000: 186.9 }
  },
  Plaid: {
    peakKW: 794, peakTQ: 1519, knee: 5591, contKW: 708, holdS: 12, best: 0.978, kWkg: 4.8, redline: 20000,
    motors: 3, massM: 165.38, massP: 625.78, R: 0.029359, Vnom: 404.4, p50: 824184, p10: 692384,
    whkm: 160.22, wall: 188.49, regen: 59.59, range: 561.7, fd: 7.56, drive: 'awd',
    t100: 2.525, t60: 2.435, top: 322, cg: 0.52,
    pts: { 1000: 1518.53, 5591: 1327.24, 11182: 668.35, 20000: 352.48 }
  }
};
const HYB = {
  'Ioniq': { mode: 'p2', tq: 168.5, kW: 113.68, packKW: 32.33, packR: 0.27024, front: 0 },
  'Prius': { mode: 'ps', tq: 163.05, kW: 69.01, packKW: 29.91, packR: 0.27166, front: 0 },
  'Qashqai': { mode: 'series', tq: 325.17, kW: 194.14, packKW: 43.52, packR: 0.45169, front: 0 },
  '330e': { mode: 'p2', tq: 262.94, kW: 106.8, packKW: 101.51, packR: 0.18635, front: 0 },
  '918': { mode: 'p2', tq: 247.55, kW: 160.06, packKW: 140.92, packR: 0.16371, front: 221.6 }
};
// A sleeve, 4-pole, SiC motor that revs past 4× its knee (build 294: from the d and q axes, no rectangle).
const TAIL = { knee: 1784, nMax: 40000, p1: 30616, p2: 34085, p4: 32740, p5: 30865, p6: 30752 };

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
  const m = motorBuild({ rotorD: 100, stackL: 80, poles: 4, turns: 55, magnet: 'ndfeb', retention: 'sleeve', cooling: 'jacket', inverter: 'sic', invAmps: 200, maxRpm: 40000 });
  const V = 350, psi = motorPsi(m, 60), knee = motorBaseW(m, V, psi) * 30 / Math.PI;
  const P = n => motorMaxTorque(m, n, V, 60) * n * Math.PI / 30;
  // stage 6 (build 236) put WINDING and CONDUCTOR on the form, defaulting to today's round copper
  const absent = ['evGear2'].filter(id => document.getElementById(id));
  const wireEl = document.getElementById('evWire'), condEl = document.getElementById('evConductor');
  const lamEl = document.getElementById('evLamination'), regenEl = document.getElementById('evRegen');
  return { cars, hy, tail: { knee, nMax: m.nMax, p1: P(knee), p2: P(2 * knee), p4: P(4 * knee), p5: P(5 * knee), p6: P(6 * knee) }, absent, wire: wireEl ? wireEl.value : null, cond: condEl ? condEl.value : null, lam: lamEl ? lamEl.value : null, regen: regenEl ? regenEl.value : null, cpsr: typeof CPSR === 'undefined' ? null : CPSR, im: IM_CPSR };
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
if (!(tail.p2 >= tail.p1 && tail.p6 < tail.p4)) fails.push('past the knee the power does not hold, then fall');

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
if (r.wire !== 'round' || r.cond !== 'copper') fails.push(`WINDING and CONDUCTOR are not on the form at ROUND and COPPER (${r.wire}, ${r.cond})`);
if (r.regen !== 'high') fails.push('REGENERATION is not on the form at HIGH');
if (r.absent.length) fails.push('a later field is already on the form: ' + r.absent.join(', '));
exact(r.cpsr, null, 'magnet CPSR retired');
exact(r.im, 3, 'induction CPSR');

if (errors.length) console.log('ERRORS:\n  ' + errors.join('\n  '));
if (fails.length || errors.length) {
  console.log('\nFAIL:\n  ' + fails.concat(errors).join('\n  '));
  process.exit(1);
}
console.log('\nOK: the electric drivetrain matches the lock. A later stage edits it only as plans/hybrid-electric/drivetrain.md allows.');
await browser.close();
