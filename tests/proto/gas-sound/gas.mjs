// Lumped gas volumes and the compressible flow between them: a JavaScript port of GasSystem from
// Ange Yaghi's engine-sim (src/gas_system.cpp, include/gas_system.h), MIT licence, reproduced below.
// The fuel/oxygen mix bookkeeping is left out: this port only needs the pressure waves, and the
// energy released by combustion is added directly by the caller.
//
// Copyright 2022 AngeTheGreat (Ange Yaghi)
// Permission is hereby granted, free of charge, to any person obtaining a copy of this software and
// associated documentation files (the "Software"), to deal in the Software without restriction,
// including without limitation the rights to use, copy, modify, merge, publish, distribute,
// sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions: The above copyright notice and this
// permission notice shall be included in all copies or substantial portions of the Software.
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT
// NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
// NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT
// OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
export const R = 8.31446261815324, AIR_M = 0.02897, ATM = 101325;
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
// k for a port that flows `scfm` at a 28 inH2O test depression (the flow-bench standard), and at 1.5 inHg
// (the carburettor rating), as engine-sim's k_28inH2O / k_carb.
const SCFM = 0.002641 * 453.59237 / 60, IN_HG = 3386.3886666666713, IN_H2O = IN_HG * 0.0734824;   // engine-sim's units.h
export function flowConstant(target, P, drop, T, hcr) {
  const pr = (P - drop) / P, lim = Math.pow(2 / (hcr + 1), hcr / (hcr - 1));
  let f;
  if (pr <= lim) f = Math.sqrt(hcr) * Math.pow(2 / (hcr + 1), (hcr + 1) / (2 * (hcr - 1)));
  else f = Math.sqrt((2 * hcr) / (hcr - 1) * (1 - Math.pow(pr, (hcr - 1) / hcr))) * Math.pow(pr, 1 / hcr);
  return target / (f * P / Math.sqrt(R * T));
}
export const k_28inH2O = scfm => flowConstant(scfm * SCFM, ATM, 28 * IN_H2O, 298.15, 1.4);
export const k_carb = scfm => flowConstant(scfm * SCFM, ATM, 1.5 * IN_HG, 298.15, 1.4);

export class Gas {
  constructor(P, V, T, dof = 5) {
    this.dof = dof; this.n = P * V / (R * T); this.V = V; this.E = T * (0.5 * dof * this.n * R);
    this.px = 0; this.py = 0;
    const hcr = 1 + 2 / dof;
    this.hcr = hcr;
    this.chokeLim = Math.pow(2 / (hcr + 1), hcr / (hcr - 1));
    this.chokeRate = Math.sqrt(hcr) * Math.pow(2 / (hcr + 1), (hcr + 1) / (2 * (hcr - 1)));
    this.w = 0; this.h = 0; this.dx = 0; this.dy = 0;
  }
  setGeometry(w, h, dx, dy) { this.w = w; this.h = h; this.dx = dx; this.dy = dy; }
  reset(P, T) { this.n = P * this.V / (R * T); this.E = T * (0.5 * this.dof * this.n * R); this.px = this.py = 0; }
  pressure() { return this.V ? this.E / (0.5 * this.dof * this.V) : 0; }
  temperature() { return this.n ? this.E / (0.5 * this.dof * this.n * R) : 0; }
  mass() { return AIR_M * this.n; }
  ekPerMol() { return this.n ? this.E / this.n : 0; }
  c() { if (!this.n || !this.E) return 0; return Math.sqrt(this.pressure() * this.hcr / (this.mass() / this.V)); }
  bulkKE() { const m = this.mass(); if (!m) return 0; const vx = this.px / m, vy = this.py / m; return 0.5 * m * (vx * vx + vy * vy); }
  totalEnergy() { return this.n ? this.E + this.bulkKE() : 0; }
  dynamicPressure(dx, dy) {
    if (!this.n || !this.E) return 0;
    const v = (dx * this.px + dy * this.py) / this.mass();
    if (v <= 0) return 0;
    const P = this.pressure(), c2 = P * this.hcr / (this.mass() / this.V), x = 1 + ((this.hcr - 1) / 2) * v * v / c2;
    const xd = this.dof === 5 ? x * x * x * x * x * x * x : this.dof === 3 ? x * x * x * x * x : x;
    return P * (Math.sqrt(xd) - 1);
  }
  setVolume(V) {                     // adiabatic work on a cube of the volume's own size, as engine-sim
    const dV = V - this.V, L = Math.cbrt(V), sa = L * L, dL = -dV / sa;
    this.E += dL * this.pressure() * sa; this.V = V;
  }
  changeEnergy(dE) { this.E += dE; }
  loseN(dn, e) { this.E -= e * dn; this.n -= dn; if (this.n < 0) this.n = 0; }
  gainN(dn, e) { this.E += dn * e; this.n += dn; }
  dissipateExcessVelocity() {
    const m = this.mass(); if (!m) return;
    const vx = this.px / m, vy = this.py / m, v2 = vx * vx + vy * vy, c = this.c(), c2 = c * c;
    if (c2 >= v2 || v2 === 0) return;
    const k = Math.sqrt(c2 / v2); this.px *= k; this.py *= k;
    this.E += 0.5 * m * (v2 - c2); if (this.E < 0) this.E = 0;
  }
  updateVelocity(dt, beta = 1) {
    if (!this.n) return;
    const depth = this.V / (this.w * this.h), dx = this.dx, dy = this.dy;
    const p0 = this.dynamicPressure(dx, dy) * this.h * depth, p1 = this.dynamicPressure(-dx, -dy) * this.h * depth;
    const p2 = this.dynamicPressure(dy, dx) * this.w * depth, p3 = this.dynamicPressure(-dy, -dx) * this.w * depth;
    const dmx = p0 * dx - p1 * dx + p2 * dy - p3 * dy, dmy = p0 * dy - p1 * dy + p2 * dx - p3 * dx;
    const m = this.mass(), v0x = this.px / m, v0y = this.py / m;
    this.px -= dmx * dt * beta; this.py -= dmy * dt * beta;
    const v1x = this.px / m, v1y = this.py / m;
    this.E -= 0.5 * m * (v1x * v1x - v0x * v0x) + 0.5 * m * (v1y * v1y - v0y * v0y);
    if (this.E < 0) this.E = 0;
  }
  static rate(k, P0, P1, T0, T1, hcr, lim, choke) {
    if (!k) return 0;
    let dir, T, p0, pT;
    if (P0 > P1) { dir = 1; T = T0; p0 = P0; pT = P1; } else { dir = -1; T = T1; p0 = P1; pT = P0; }
    const pr = pT / p0;
    let f;
    if (pr <= lim) f = choke / Math.sqrt(R * T);
    else { const s = Math.pow(pr, 1 / hcr); f = Math.sqrt(Math.max((2 * hcr) / (hcr - 1) * s * (s - pr), 0) / (R * T)); }
    return f * dir * p0 * k;
  }
  // Flow between two volumes through an orifice of flow constant k; a0/a1 are the cross sections the
  // gas leaves and enters, (dirx, diry) the direction from 0 to 1. Returns moles moved 0 -> 1.
  static flow(k, dt, dirx, diry, a0, a1, s0, s1) {
    const P0 = s0.pressure() + s0.dynamicPressure(dirx, diry), P1 = s1.pressure() + s1.dynamicPressure(-dirx, -diry);
    let src, snk, dx, dy, aSrc, aSnk, dir, Ps, Pk;
    if (P0 > P1) { src = s0; snk = s1; dx = dirx; dy = diry; aSrc = a0; aSnk = a1; dir = 1; Ps = P0; Pk = P1; }
    else { src = s1; snk = s0; dx = -dirx; dy = -diry; aSrc = a1; aSnk = a0; dir = -1; Ps = P1; Pk = P0; }
    let f = dt * Gas.rate(k, Ps, Pk, src.temperature(), snk.temperature(), src.hcr, src.chokeLim, src.chokeRate);
    f = clamp(f, 0, 0.9 * src.n);
    const frac = src.n ? f / src.n : 0, fracV = frac * src.V, fracM = frac * src.mass();
    if (f !== 0) {
      const b0 = src.bulkKE() + snk.bulkKE(), e = src.ekPerMol();
      snk.gainN(f, e); src.loseN(f, e);
      const dpx = src.px * frac, dpy = src.py * frac;
      src.px -= dpx; src.py -= dpy; snk.px += dpx; snk.py += dpy;
      snk.E -= (src.bulkKE() + snk.bulkKE()) - b0;
    }
    const mS = src.mass(), mK = snk.mass(), cS = src.c(), cK = snk.c();
    const sx0 = src.px, sy0 = src.py, kx0 = snk.px, ky0 = snk.py;
    if (aSnk) { const v = clamp((fracV / aSnk) / dt, 0, cK); snk.px += v * dx * fracM; snk.py += v * dy * fracM; }
    if (aSrc && mS) { const v = clamp((fracV / aSrc) / dt, 0, cS); src.px += v * dx * fracM; src.py += v * dy * fracM; }
    if (mS) { const a = sx0 / mS, b = sy0 / mS, c = src.px / mS, d = src.py / mS; src.E -= 0.5 * mS * (c * c - a * a) + 0.5 * mS * (d * d - b * b); }
    if (mK > 0) { const a = kx0 / mK, b = ky0 / mK, c = snk.px / mK, d = snk.py / mK; snk.E -= 0.5 * mK * (c * c - a * a) + 0.5 * mK * (d * d - b * b); }
    if (snk.E < 0) snk.E = 0; if (src.E < 0) src.E = 0;
    return f * dir;
  }
  // Flow to or from a boundary at fixed pressure and temperature (the atmosphere, or a plenum held at MAP).
  flowEnv(k, dt, Penv, Tenv) {
    const maxF = this.pressure() > Penv
      ? -(Penv * (0.5 * this.dof * this.V) - this.E) / this.ekPerMol()
      : -(Penv * (0.5 * this.dof * this.V) - this.E) / (0.5 * Tenv * R * this.dof);
    let f = dt * Gas.rate(k, this.pressure(), Penv, this.temperature(), Tenv, this.hcr, this.chokeLim, this.chokeRate);
    if (Math.abs(f) > Math.abs(maxF)) f = maxF;
    if (f < 0) { const b0 = this.bulkKE(); this.gainN(-f, 0.5 * Tenv * R * this.dof); this.E += this.bulkKE() - b0; }
    else { const n0 = this.n; this.loseN(f, this.ekPerMol()); if (n0) { this.px -= (f / n0) * this.px; this.py -= (f / n0) * this.py; } }
    return f;
  }
}
