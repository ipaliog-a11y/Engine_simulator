// Slip-ratio tyre model — the last piece of the tyre conversion.
// Prototyped standalone first, because this adds a STATE VARIABLE to the acceleration integrator
// and the slip dynamics are much stiffer than the vehicle dynamics. If it needs a smaller step
// than dt = 0.005 s, better to find that out here than by destabilising the app.
//
// Today: F = min(driveF, mu*N). A hard clip. Grip is either available or it is not, the tyre never
// spins, and gearing is invisible whenever the clip binds — which for a powerful car is the whole
// 0-100 run. Real tyres transmit force THROUGH slip, and past the peak the coefficient FALLS, so a
// wheel that breaks away keeps breaking away. That falling branch is the missing mechanism.

// mu(s): Pacejka-lite. Rises steeply, peaks at s_opt, settles to a sliding plateau.
//   mu = mu_peak * sin(C * atan(B*s)),  B = tan(pi/(2C))/s_opt puts the peak exactly at s_opt.
// C sets how far it falls off: sin(C*pi/2) is the full-slide fraction. C = 1.4 gives 0.81, which
// matches the usual measured slide/peak ratio of about 0.75-0.85.
const C_SHAPE = 1.4;
const muCurve = (s, muPeak, sOpt) => {
  const B = Math.tan(Math.PI / (2 * C_SHAPE)) / sOpt;
  return muPeak * Math.sin(C_SHAPE * Math.atan(B * Math.abs(s))) * Math.sign(s || 1);
};

console.log('mu(s)/mu_peak for a road tyre, s_opt = 0.13');
for (const s of [0.02, 0.05, 0.10, 0.13, 0.2, 0.4, 0.8, 1.5])
  console.log(`  slip ${String(s).padStart(4)} -> ${(muCurve(s, 1, 0.13)).toFixed(3)}` +
    (Math.abs(s - 0.13) < 1e-9 ? '   <- peak' : ''));
console.log(`  full slide settles at ${Math.sin(C_SHAPE * Math.PI / 2).toFixed(3)} of peak (real: 0.75-0.85)\n`);

// ---------------------------------------------------------------- the launch, integrated
// Driven-wheel side: I_eff * dw/dt = T_axle - F_tyre * r
// Vehicle side:      m * dv/dt      = F_tyre - drag - roll
// I_eff includes the ENGINE reflected through the gearing, which is why wheelspin is violent in
// first and tame in fourth: engine inertia scales with the square of the total ratio.
function launch({ mass, muPeak, sOpt, r, totalRatio, axleTq, Ieng = 0.15, Iwheels = 4.6,
                  cdA = 0.65, crr = 0.013, dt, subSteps }) {
  const Ieff = Iwheels + Ieng * totalRatio * totalRatio;
  let v = 0, w = 0, t = 0, x = 0, peakSlip = 0, spun = false;
  const N = mass * 9.81 * 0.5;                       // rough driven-axle load, RWD, no transfer
  const h = dt / subSteps;
  while (t < 12 && v < 100 / 3.6) {
    for (let k = 0; k < subSteps; k++) {
      // Slip is undefined at rest; a floor speed keeps it finite without changing the answer once
      // the car is rolling. This is the standard fix for the v -> 0 singularity.
      const vFloor = Math.max(v, 1.0);
      const s = (w * r - v) / vFloor;
      const F = muCurve(Math.max(-1, Math.min(3, s)), muPeak, sOpt) * N;
      const drag = 0.5 * 1.2 * cdA * v * v, roll = crr * mass * 9.81;
      w += (axleTq - F * r) / Ieff * h;
      v += (F - drag - roll) / mass * h;
      if (v < 0) v = 0;
      if (w < 0) w = 0;
      peakSlip = Math.max(peakSlip, s);
      if (s > sOpt * 1.5) spun = true;
    }
    x += v * dt; t += dt;
  }
  return { t100: t, peakSlip, spun, v: v * 3.6 };
}

// ---------------------------------------------------------------- 1. is it numerically stable?
console.log('numerical stability — same case, different step sizes (must converge):');
const base = { mass: 1450, muPeak: 1.24, sOpt: 0.13, r: 0.34, totalRatio: 12.4, axleTq: 4200 };
for (const [dt, sub] of [[0.005, 1], [0.005, 4], [0.005, 10], [0.001, 1], [0.0005, 1]]) {
  const r = launch({ ...base, dt, subSteps: sub });
  console.log(`  dt=${String(dt).padEnd(7)} sub=${String(sub).padStart(2)} -> 0-100 in ${r.t100.toFixed(3)} s` +
    `  peak slip ${r.peakSlip.toFixed(2)}${r.spun ? '  (spun)' : ''}`);
}

// ---------------------------------------------------------------- 2. does gearing now matter?
// The whole point. With a hard clip, a traction-limited car's 0-100 is identical at every final
// drive. With a falling mu past the peak, too much torque spins the tyres and LOSES time.
console.log('\ndoes short gearing now cost time on a powerful car? (axle torque scales with ratio)');
for (const ratio of [8, 10, 12.4, 16, 20, 26]) {
  const r = launch({ ...base, totalRatio: ratio, axleTq: 4200 * ratio / 12.4, dt: 0.005, subSteps: 4 });
  console.log(`  total ratio ${String(ratio).padStart(4)} -> 0-100 in ${r.t100.toFixed(2)} s` +
    `   peak slip ${r.peakSlip.toFixed(2)}${r.spun ? '   SPUN' : ''}`);
}

// ---------------------------------------------------------------- 3. tyre character
console.log('\ns_opt is a real tyre property — a slick peaks earlier and sharper than a drag radial:');
for (const [name, muP, so] of [['eco', 0.90, 0.14], ['sport', 1.15, 0.13], ['semi', 1.35, 0.11],
                               ['slick', 1.55, 0.09], ['drag radial', 1.70, 0.20]]) {
  const r = launch({ ...base, muPeak: muP, sOpt: so, dt: 0.005, subSteps: 4 });
  console.log(`  ${name.padEnd(12)} mu ${muP} s_opt ${so} -> 0-100 in ${r.t100.toFixed(2)} s   peak slip ${r.peakSlip.toFixed(2)}`);
}
