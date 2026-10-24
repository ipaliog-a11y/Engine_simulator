// A crank-angle engine for sound, on the GasSystem port in gas.mjs: per cylinder an intake runner, the
// cylinder, and an exhaust runner + primary; per bank a collector venting to atmosphere. Topology, flow
// order, velocity handling and the audio pick-off follow engine-sim's CombustionChamber::flow,
// ExhaustSystem::process and PistonEngineSimulator::writeToSynthesizer. Two things are this sim's own:
//   - the crank is driven at the rpm our engine model sets (no torque feedback: the pressures are only
//     listened to), and the plenum is held at the model's manifold pressure;
//   - combustion is a Wiebe heat release in place of engine-sim's flame-front model.
// Port flow is engine-sim's 2JZ flow-bench table (cfm at 28 inH2O vs lift), scaled to this engine's
// valves by area and lift by diameter.
import { Gas, ATM, R, AIR_M, k_28inH2O, k_carb } from './gas.mjs';
const PI = Math.PI, clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const LIFT_THOU = [0, 50, 100, 150, 200, 250, 300, 350, 400, 450];
const IN_CFM = [0, 58, 103, 156, 214, 249, 268, 280, 280, 281], EX_CFM = [0, 37, 72, 113, 160, 196, 222, 235, 245, 246];
const D2JZ_IN = 0.0345, D2JZ_EX = 0.029, N2JZ = 2;
// The share of the fuel's heat that ends up in the gas. The ideal diatomic gas here has no wall loss during
// the burn, no dissociation and too low a heat capacity for burnt gas, so all of it gave twice a real
// engine's IMEP (24 bar flat out on the 1.6 sport four against ~13). A FIT, to that one number; engine-sim
// carries the same gap in its fuel's burning efficiency.
const GAS_HEAT_SHARE = 0.50;
const K28 = k_28inH2O(1);
function table(tab, liftThou) {
  if (liftThou <= 0) return 0;
  const i = Math.min(LIFT_THOU.length - 2, Math.floor(liftThou / 50)), f = clamp((liftThou - LIFT_THOU[i]) / 50, 0, 1);
  return tab[i] + (tab[i + 1] - tab[i]) * f;
}
export class SoundEngine {
  constructor(e, opt = {}) {
    this.e = e; this.simHz = opt.simHz || 10000; this.fluid = opt.fluid || 4;   // engine-sim runs 8; 4 is within 5% rms at half the cost
    const n = e.cylinders, A = PI / 4 * e.bore * e.bore, Vd = A * e.stroke;
    this.A = A; this.Vc = Vd / (e.cr - 1); this.r = e.stroke / 2; this.L = this.r * 2 * 1.6;   // rod/crank-radius 3.2
    this.vd = Vd; this.n = n;
    const exD = 0.84 * e.ivDia;
    // a port's bench flow scales with its valves' area; its lift axis with their diameter
    this.inScale = e.ivCount * e.ivDia ** 2 / (N2JZ * D2JZ_IN ** 2); this.inLiftScale = D2JZ_IN / e.ivDia;
    this.exScale = e.ivCount * exD ** 2 / (N2JZ * D2JZ_EX ** 2); this.exLiftScale = D2JZ_EX / exD;
    const T0 = 298.15, exA = PI / 4 * e.primD ** 2, inA = PI / 4 * e.runnerD ** 2;
    this.exA = exA; this.inA = inA;
    this.cyl = []; this.banks = [];
    const nb = e.banks, colA = PI / 4 * e.sysD ** 2 * Math.max(1, (e.sysPipes || 1) / nb);
    for (let b = 0; b < nb; b++) {
      const c = new Gas(ATM, colA * e.sysL, T0); c.setGeometry(e.sysL, Math.sqrt(colA), 1, 0);
      this.banks.push({ col: c, colA, kOut: k_carb(1000) * colA / (PI / 4 * 0.0508 ** 2) * 0.5 });
    }
    this.atm = new Gas(ATM, 1000, T0); this.atm.setGeometry(10, 10, 1, 0);
    this.plenum = new Gas(ATM, 1000, T0); this.plenum.setGeometry(10, 10, 1, 0);
    for (let i = 0; i < n; i++) {
      const ev = e.events[i];
      const cy = new Gas(ATM, this.Vc, T0); cy.setGeometry(Math.sqrt(A), this.Vc / A, 1, 0);
      const inV = inA * e.runnerL, ir = new Gas(ATM, inV, T0); ir.setGeometry(e.runnerL, Math.sqrt(inA), 1, 0);
      const exV = exA * e.primL + 50e-6 * Vd / 0.5e-3, xr = new Gas(ATM, exV, T0); xr.setGeometry(exV / exA, Math.sqrt(exA), 1, 0);
      // this cylinder fires ev.at of the way through the cycle: its own crank angle lags by that much
      this.cyl.push({ cy, ir, xr, bank: ev.bank, phase: ev.at * 720, lit: false, q: 0, xb: 0, ign: 0,
        kRun: k_carb(200) * Vd / 0.5e-3, kPrim: k_carb(400) * exA / (PI / 4 * 0.0381 ** 2),
        delay: new Float64Array(Math.ceil((e.primL + e.sysL) / 343 * this.simHz) + 2), dIdx: 0, len: e.primL + e.sysL });
    }
    this.theta = 0;
  }
  volume(th) {                                   // crank-slider, th in degrees from firing TDC
    const a = th * PI / 180, s = Math.sin(a), x = this.r * (1 - Math.cos(a)) + this.L - Math.sqrt(this.L ** 2 - (this.r * s) ** 2);
    return this.Vc + this.A * x;
  }
  lift(th, open, dur, Lmax) { let d = ((th - open) % 720 + 720) % 720; return d < dur ? Lmax * Math.sin(PI * d / dur) ** 2 : 0; }
  // one simulation step at the operating point {rpm, map (Pa), fuel (0 = cut), lambda, spark (deg BTDC)}
  step(op) {
    const e = this.e, dt = 1 / this.simHz, df = dt / this.fluid;
    this.theta = (this.theta + op.rpm / 60 * 360 * 2 * dt / 2) % 720;          // 4-stroke: 720 deg per 2 revs
    const evc = 360 + e.overlap / 2, evo = evc - e.camDur, ivo = 360 - e.overlap / 2;
    this.plenum.reset(op.map, 300);
    const out = new Float64Array(this.banks.length);
    for (const c of this.cyl) {
      const th = (this.theta - c.phase + 720) % 720;
      c.cy.setVolume(this.volume(th));
      // valve flow constants at this crank angle
      const li = this.lift(th, ivo, e.camDur, e.ivLift) / 2.54e-5, le = this.lift(th, evo, e.camDur, e.ivLift) / 2.54e-5;
      c.kIn = K28 * table(IN_CFM, li * this.inLiftScale) * this.inScale;     // k_28inH2O is linear in cfm
      c.kEx = K28 * table(EX_CFM, le * this.exLiftScale) * this.exScale;
      // spark: release the charge's fuel energy along a Wiebe curve
      const sparkAt = 720 - op.spark, burn = op.burn || 50;
      const sinceSpark = ((th - sparkAt) % 720 + 720) % 720;
      if (!c.lit && sinceSpark < 3 && op.fuel > 0) {
        const air = c.cy.n * 0.92 * AIR_M;                                   // ~8% residual
        c.q = air / (14.7 * (op.lambda || 1)) * 43e6 * GAS_HEAT_SHARE * op.fuel; c.lit = true; c.xb = 0;
      }
      if (c.lit) {
        const x = 1 - Math.exp(-5 * Math.pow(Math.min(1, sinceSpark / burn), 3));
        c.cy.changeEnergy((x - c.xb) * c.q); c.xb = x; if (sinceSpark >= burn) c.lit = false;
      }
    }
    for (let k = 0; k < this.fluid; k++) {
      for (const b of this.banks) {                                         // ExhaustSystem::process
        this.atm.reset(ATM, 298.15);
        Gas.flow(b.kOut, df, 1, 0, b.colA, 10, this.atm, b.col);
        b.col.dissipateExcessVelocity(); b.col.updateVelocity(df, 1.0);
      }
      for (const c of this.cyl) {                                            // CombustionChamber::flow
        const V = c.cy.V, h = V / this.A, sa = h * PI * e.bore + this.A * 2;
        c.cy.changeEnergy((363.15 - c.cy.temperature()) * sa * 100 * df);
        Gas.flow(c.kRun, df, 1, 0, 10, this.inA, this.plenum, c.ir); c.ir.dissipateExcessVelocity();
        Gas.flow(c.kIn, df, 1, 0, this.inA, this.A, c.ir, c.cy); c.ir.dissipateExcessVelocity(); c.cy.dissipateExcessVelocity();
        Gas.flow(c.kEx, df, 1, 0, this.A, this.exA, c.cy, c.xr); c.cy.dissipateExcessVelocity(); c.xr.dissipateExcessVelocity();
        Gas.flow(c.kPrim, df, 1, 0, this.exA, this.banks[c.bank].colA, c.xr, this.banks[c.bank].col);
        c.ir.updateVelocity(df, 0.25); c.cy.updateVelocity(df, 0.5); c.xr.updateVelocity(df, 1.0);
      }
    }
    // writeToSynthesizer: runner gauge pressure plus a tenth of its dynamic pressure each way, delayed by the
    // run to the tailpipe at 343 m/s, summed per bank, falling off with the square of that run
    for (const c of this.cyl) {
      const s = 1600 * ((c.xr.pressure() - ATM) + 0.1 * c.xr.dynamicPressure(1, 0) + 0.1 * c.xr.dynamicPressure(-1, 0));
      const d = c.delay, j = c.dIdx; const v = d[j]; d[j] = s; c.dIdx = (j + 1) % d.length;
      out[c.bank] += 0.2 * v / this.n / (c.len * c.len);
    }
    return out;
  }
  peakCylinderPressure() { return Math.max(...this.cyl.map(c => c.cy.pressure())); }
}
