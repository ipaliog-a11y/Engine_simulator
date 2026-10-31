// The electric drive's sound (prototype, step 4 of plans/hybrid-electric/). A sample at a time from the drive's state:
// motor speed (rpm) and torque (Nm, negative regenerating) per motor group, the bus voltage, and the drive's build
// (dump-drives.mjs). Plain JS with no allocation in the step, to move into the AudioWorklet as GAS did.
//
// Every voice sits at the frequency the build gives it; only the levels are chosen (by ear, named below):
//   electromagnetic  the stator's radial magnetic force, which shakes the core. Two families:
//                    · torque ripple at 6 x the electrical frequency fe = p n/60 (a three-phase machine's force
//                      harmonics are multiples of 6 fe), rising with the current, so with the torque;
//                    · slotting, where the rotor's poles pass the stator's teeth: LCM(slots, poles) x the shaft's
//                      frequency for a magnet motor (54 slots, 6 poles: 54 n/60 = 18 fe), present whenever the
//                      magnets spin, louder with the current; an induction rotor's bars (Qr) pass the teeth at
//                      Qr n/60, and with no torque asked it has no field: silent;
//                    the stator's lowest bending mode (an assumed 2.4 kHz, Q 3) makes each order swell as it
//                    sweeps through it, the "rising whine" of an electric car;
//   inverter         pulse-width modulation leaves current ripple at the switching frequency fc: its strongest
//                    sidebands sit at fc +/- 2 fe (the line currents cancel fc itself), weighted by J2(pi m / 2) for
//                    the modulation depth m (the back-EMF over the bus, which grows with speed to the knee), and
//                    at 2 fc +/- fe. Ripple current is V / (L fc): a SiC inverter at 16 kHz is quieter and higher than
//                    an IGBT one at 10 kHz;
//   gears            the reduction's two meshes, Z1 n/60 and Z3 n/(60 Z2/Z1), with their second harmonics. The tooth
//                    counts are not published: a 19-tooth first pinion and 23-tooth second, the stages split near the
//                    square root of the ratio (assumed). Transmission error grows with the load;
//   windage          bearings and air: broadband, with the speed squared.
// What it leaves out: tyres and road (a bench has neither), the pack's contactors and cooling pump.
export const EV_SOUND = {
  sr: 48000,
  mode: { hz: 2400, q: 3 },                     // the stator's first bending mode (assumed)
  level: { ripple: 0.10, slot: 0.07, pwm: 0.05, gear: 0.08, wind: 0.02 },
  pinions: [19, 23]
};
const gcd = (a, b) => b ? gcd(b, a % b) : a, lcm = (a, b) => a / gcd(a, b) * b;
// Bessel J2, by its series (m up to ~1.2)
function besselJ2(x) { let s = 0, t = (x / 2) ** 2 / 2; for (let k = 0; k < 12; k++) { s += t; t *= -((x / 2) ** 2) / ((k + 1) * (k + 3)); } return s; }
// The two stages of a reduction: tooth counts with the pinions above, the first wheel within 15% of the square-root split,
// the pair whose ratio comes closest to the car's.
export function gearStages(fd, pin = EV_SOUND.pinions) {
  let best = null;
  const mid = pin[0] * Math.sqrt(fd);
  for (let z2 = Math.round(mid * 0.85); z2 <= Math.round(mid * 1.15); z2++) {
    const r1 = z2 / pin[0], z4 = Math.round(pin[1] * fd / r1), ratio = r1 * z4 / pin[1];
    if (!best || Math.abs(ratio - fd) < Math.abs(best.ratio - fd)) best = { z: [pin[0], z2, pin[1], z4], ratio };
  }
  return best;
}
// The orders (frequency per rpm, Hz/rpm) of every tonal voice of one motor group, and its kind.
export function voiceOrders(g, fd) {
  const p = g.poles / 2, Qr = 2 * Math.round(g.slots * 1.23 / 2), st = gearStages(fd);
  return {
    ripple: 6 * p / 60,                                              // 6 fe
    slot: (g.im ? Qr : lcm(g.slots, g.poles)) / 60,                  // slotting
    mesh1: st.z[0] / 60, mesh2: st.z[2] / (60 * st.z[1] / st.z[0]),  // the two gear meshes
    fe: p / 60, stages: st
  };
}
// A resonator's gain at f (the stator mode): a second-order peak, 1 far from it.
const modeGain = f => { const { hz, q } = EV_SOUND.mode, x = f / hz; return 1 + 3 / Math.sqrt(1 + q * q * (x - 1 / x) ** 2); };
// The synth. drive: {groups, fd, nMax, curve}; returns step(rpm, torques[], m) -> sample, m the modulation depth (0..1).
export function makeEvSound(drive, seed = 1) {
  const sr = EV_SOUND.sr, L = EV_SOUND.level, G = drive.groups.map(g => ({ g, o: voiceOrders(g, drive.fd), ph: new Float64Array(10) }));
  let rnd = seed >>> 0 || 1, w1 = 0, w2 = 0;
  const noise = () => { rnd ^= rnd << 13; rnd ^= rnd >>> 17; rnd ^= rnd << 5; return (rnd >>> 0) / 4294967296 * 2 - 1; };
  // a tone fades out over the last 3 kHz below the Nyquist frequency rather than stopping dead (a click)
  const top = sr / 2 - 500, tone = (ph, k, f, a) => { if (a <= 0 || f <= 20 || f >= top) return 0; ph[k] = (ph[k] + f / sr) % 1;
    return a * Math.min(1, (top - f) / 3000) * modeGain(f) * Math.sin(2 * Math.PI * ph[k]); };
  return function step(rpm, torques, m) {
    let y = 0;
    const n = Math.max(0, rpm), sp = n / Math.max(1, drive.nMax);
    for (let i = 0; i < G.length; i++) {
      const { g, o, ph } = G[i], k = g.n, T = Math.abs(torques[i] || 0), tl = T / Math.max(1, g.Tpk);
      const amp = Math.sqrt(k);                                      // k motors of a group, not in phase
      y += tone(ph, 0, o.ripple * n, amp * L.ripple * tl);
      y += tone(ph, 1, o.slot * n, amp * L.slot * (g.im ? tl : 0.35 + 0.65 * tl) * Math.min(1, sp * 4));
      y += tone(ph, 2, 2 * o.slot * n, amp * 0.4 * L.slot * (g.im ? tl : 0.35 + 0.65 * tl) * Math.min(1, sp * 4));
      // the inverter: sidebands at fc +/- 2 fe and 2 fc +/- fe, only while it is switching (current asked)
      if (T > 0.5 || !g.im) {
        const fc = g.fsw, fe = o.fe * n, a = amp * L.pwm * (10000 / fc), j2 = Math.abs(besselJ2(Math.PI * m / 2)) * 6;
        y += tone(ph, 3, fc + 2 * fe, a * (0.15 + j2)) + tone(ph, 4, fc - 2 * fe, a * (0.15 + j2));
        y += tone(ph, 5, 2 * fc + fe, a * 0.5 * m) + tone(ph, 6, 2 * fc - fe, a * 0.5 * m);
      }
    }
    // the gears carry the total torque (one reduction on an electric car)
    const Tall = torques.reduce((s, t) => s + Math.abs(t), 0), Tpk = G.reduce((s, q) => s + q.g.n * q.g.Tpk, 0), te = 0.25 + 0.75 * Tall / Tpk;
    const o = G[0].o, ph = G[0].ph;
    y += tone(ph, 7, o.mesh1 * n, L.gear * te) + tone(ph, 8, o.mesh2 * n, L.gear * 0.8 * te) + tone(ph, 9, 2 * o.mesh1 * n, L.gear * 0.3 * te);
    // windage: noise through two one-pole low-passes, with the speed squared
    w1 += 0.25 * (noise() - w1); w2 += 0.25 * (w1 - w2);
    y += L.wind * sp * sp * w2 * 4;
    return y;
  };
}
