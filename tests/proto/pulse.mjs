// Exhaust pulse energy at the turbine — prototype, not wired in.
//
//   node tests/proto/pulse.mjs
//
// Standalone, like slip.mjs and turbo.mjs: no browser, no index.html. The nozzle functions below
// are copied verbatim from the app so the comparison is against the real thing.
//
// ---------------------------------------------------------------------------------------------
// THE GAP THIS IS MEANT TO CLOSE
//
// tests/proto/housing.mjs ends with a measurement rather than a theory: turbine housing sizing was
// built, worked as designed, and was reverted because it only reached real spool points if it was
// allowed to give away 25% of rated power, and because high-boost builds became lag-dominated.
// Both say the same thing — the turbine does not make enough power at low flow.
//
// It cannot, as modelled. The turbine is a fixed-area nozzle fed by the MEAN exhaust manifold
// pressure. A real turbine is fed by each cylinder's blowdown pulse, and the mass arrives WHEN THE
// PRESSURE IS HIGH. That correlation is the whole of pulse turbocharging, and averaging it away is
// exactly what a mean-pressure model does.
//
// ---------------------------------------------------------------------------------------------
// THE MODEL
//
// Treat the flow at the turbine as a square wave over the firing interval: everything passes
// during a blowdown window of duty phi, nothing in between. Then
//     P = phi * [ (mdot/phi) * w(PR(mdot/phi)) ] = mdot * w(PR(mdot/phi))
// The MASS is unchanged — it is the SPECIFIC WORK that rises, because the nozzle needs a higher
// pressure ratio to pass mdot/phi than to pass mdot. That is the entire effect, and it needs no
// efficiency bonus or fudge factor bolted on.
//
// phi comes out of cam geometry the app already carries, with no new constant. The app defines
// overlap as dur - 2*lsa, which fixes the convention: the exhaust lobe centre sits lsa degrees
// BTDC, so the valve cracks at lsa + dur/2 BTDC, and BDC is 180 BTDC on that stroke. So
//     blowdown angle = (lsa + dur/2) - 180        stock 44 deg, sport 46, race 68
//     phi = blowdown angle * cylinders-per-scroll / 720
// Those are real blowdown numbers (40-70 deg BBDC), and the cylinders-per-scroll term is why a
// divided (twin-scroll) housing is worth having at all — something the app does not currently
// reward, because with one undivided manifold the pulses of a four merge into a steady flow.
const GAMMA_EXH = 1.33, CP_EXH = 1150;
const CRIT_RATIO = Math.pow(2 / (GAMMA_EXH + 1), GAMMA_EXH / (GAMMA_EXH - 1));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

function nozzleFlux(prT) {                       // verbatim from index.html
  const rp = 1 / Math.max(1.0001, prT);
  if (rp <= CRIT_RATIO)
    return Math.sqrt(GAMMA_EXH / 287) * Math.pow(2 / (GAMMA_EXH + 1), (GAMMA_EXH + 1) / (2 * (GAMMA_EXH - 1)));
  return Math.sqrt(2 * GAMMA_EXH / (287 * (GAMMA_EXH - 1))
    * (Math.pow(rp, 2 / GAMMA_EXH) - Math.pow(rp, (GAMMA_EXH + 1) / GAMMA_EXH)));
}
function turbineManifoldPR(mdot, area, T0) {     // verbatim from index.html
  if (!(area > 0) || !(mdot > 0)) return 1;
  const f = pr => area * (pr * 101325) / Math.sqrt(Math.max(300, T0)) * nozzleFlux(pr) - mdot;
  let lo = 1.0001, hi = 8;
  if (f(hi) < 0) return hi;
  if (f(lo) > 0) return 1;
  for (let i = 0; i < 60; i++) { const m = (lo + hi) / 2; if (f(m) < 0) lo = m; else hi = m; }
  return lo;
}
// J per kg. The T3 factor is NOT optional — leaving it out (as a first draft of this file did)
// makes every turbine read 2 watts instead of 2 kilowatts and every verdict below read "neither".
// It cancels in the gain RATIO, which is why the ratio table looked sane while the power table
// was nonsense; a reminder that a plausible-looking column is not a checked one.
const turbineWork = (pr, T3) => CP_EXH * Math.max(300, T3) * 0.70 * (1 - Math.pow(Math.max(1.0001, pr), -0.248));

// Mass-weighted specific work across the two states of the wave. prMean is the steady answer; the
// wave swings about it by +/-A, and more mass goes through while the pressure is up because nozzle
// flow rises with pressure. That correlation IS pulse turbocharging.
function pulseWork(prMean, amp, phi, T3) {
  if (!(amp > 0.01)) return turbineWork(prMean, T3);
  // The swing is a fraction of the ABSOLUTE manifold pressure, not of the gauge excess above
  // atmosphere. Applying it to (PR-1) was wrong and made a 27% pressure swing worth 1% of work —
  // at PR 1.03 the gauge excess is 0.03 bar, so nothing could come of scaling that.
  const hi = Math.max(1.0001, prMean * (1 + amp * (1 - phi)));
  const lo = Math.max(1.0001, prMean * (1 - amp * phi));
  const fHi = phi * nozzleFlux(hi) * hi, fLo = (1 - phi) * nozzleFlux(lo) * lo;   // mass shares
  const tot = fHi + fLo;
  return tot > 0 ? (fHi * turbineWork(hi, T3) + fLo * turbineWork(lo, T3)) / tot : turbineWork(prMean, T3);
}

const blowdownDeg = (dur, lsa) => Math.max(10, (lsa + dur / 2) - 180);
const dutyOf = (dur, lsa, cylPerScroll) => clamp(blowdownDeg(dur, lsa) * cylPerScroll / 720, 0.08, 1);

// ---- the limiter the first attempt was missing: the manifold is a plenum -----------------------
// A square wave carrying ALL the flow in the blowdown window gave 13x the specific work at 1500
// rpm and drove instantaneous PR to the solver's ceiling of 8. That is not pulse turbocharging,
// it is an unphysical model: it assumes the pipe between valve and turbine has no volume, so the
// pulse arrives undamped. Real manifolds smooth it, and how much they smooth it is precisely the
// difference between PULSE turbocharging (short, small-volume, often divided runners — pulses
// survive) and CONSTANT-PRESSURE turbocharging (a big plenum — they do not). Large marine diesels
// are built the second way on purpose.
//
// The amplitude is a volume ratio, and both volumes come from geometry the app already has:
//     V_b  the gas DELIVERED per blowdown, at manifold conditions
//     V_m  the manifold volume one scroll sees
//     A = V_b / V_m        fractional pressure swing about the mean
// Then the turbine sees a two-state wave of mean p: high for the duty phi, low for the rest, with
// the mass split by nozzle flow at each state. Mass is conserved; only its TIMING changes.
const BLOWDOWN_MASS = 0.5;   // share of the charge that leaves before the piston starts pushing
function pulseAmplitude(e, rpm, pr) {
  const c = CAM[e.cam];
  const vCyl = (e.disp / 1000) / e.cyl;                       // swept volume of one cylinder, m3
  const rhoMan = (pr * 101325) / (287 * e.T3);                // manifold gas density
  const mCharge = vCyl * e.ve * (pr * 101325 / (287 * 313));  // charge trapped per cycle
  const vB = (mCharge * BLOWDOWN_MASS) / rhoMan;              // what it occupies once in the pipe
  const vM = e.manifoldL / 1000;                              // litres -> m3, per scroll
  return clamp(vB / Math.max(1e-6, vM), 0, 3);
}

// --------------------------------------------------------------------------------- the engines
const CAM = { stock: { dur: 220, lsa: 114 }, sport: { dur: 252, lsa: 110 }, race: { dur: 284, lsa: 106 } };
const ENGINES = [
  // manifoldL = volume one scroll sees, litres: runners plus their share of the collector.
  { n: '2.0 TDI  4-cyl', disp: 2.0, cyl: 4, cam: 'stock', scrolls: 1, T3: 873, area: 5.47e-4, ve: 0.92, manifoldL: 2.4, realSpool: 1750 },
  { n: '2.0 petrol 4-cyl', disp: 2.0, cyl: 4, cam: 'sport', scrolls: 1, T3: 1223, area: 5.46e-4, ve: 0.90, manifoldL: 2.4, realSpool: 1900 },
  { n: '2.0 petrol twin-scroll', disp: 2.0, cyl: 4, cam: 'sport', scrolls: 2, T3: 1223, area: 5.46e-4, ve: 0.90, manifoldL: 1.2, realSpool: 1700 },
  { n: '3.0 I6  (2JZ)', disp: 3.0, cyl: 6, cam: 'sport', scrolls: 1, T3: 1223, area: 6.43e-4, ve: 0.90, manifoldL: 3.4, realSpool: 3600 },
  { n: '1.0 kei  3-cyl', disp: 1.0, cyl: 3, cam: 'stock', scrolls: 1, T3: 1223, area: 1.82e-4, ve: 0.88, manifoldL: 1.1, realSpool: 2800 },
];

console.log('=== duty cycle from cam geometry (no new constant) ===');
console.log('  engine                     cam     blowdown   cyl/scroll   duty phi   flow x1/phi');
for (const e of ENGINES) {
  const c = CAM[e.cam], cps = e.cyl / e.scrolls, phi = dutyOf(c.dur, c.lsa, cps);
  console.log(`  ${e.n.padEnd(24)} ${e.cam.padEnd(6)} ${String(blowdownDeg(c.dur, c.lsa).toFixed(0) + ' deg').padStart(8)}` +
    `   ${String(cps).padStart(8)}   ${phi.toFixed(3).padStart(8)}   ${(1 / phi).toFixed(1).padStart(8)}x`);
}

// mass flow of exhaust at a given engine speed, naturally aspirated breathing (pre-boost)
const exFlow = (e, rpm, pr) => (e.disp / 1000) * e.ve * (rpm / 120) * (pr * 101325 / (287 * 313)) * 1.06;

console.log('\n=== specific turbine work: mean-pressure model vs pulse (unboosted, cold start of spool) ===');
console.log('  engine                     rpm    mdot g/s   PR mean  PR pulse    W/kg mean   W/kg pulse   gain');
for (const e of ENGINES) {
  const c = CAM[e.cam], phi = dutyOf(c.dur, c.lsa, e.cyl / e.scrolls);
  for (const rpm of [1500, 2500, 4000, 6000]) {
    const m = exFlow(e, rpm, 1.0);
    const prM = turbineManifoldPR(m, e.area, e.T3);
    const amp = pulseAmplitude(e, rpm, 1.0);
    const prP = prM;
    const wM = turbineWork(prM, e.T3), wP = pulseWork(prM, amp, phi, e.T3);
    console.log(`  ${e.n.padEnd(24)} ${String(rpm).padStart(5)}   ${(m * 1000).toFixed(1).padStart(7)}   ` +
      `${prM.toFixed(2).padStart(7)}  ${prP.toFixed(2).padStart(8)}   ${wM.toFixed(0).padStart(9)}   ${wP.toFixed(0).padStart(10)}   ${(wP / Math.max(1, wM)).toFixed(2)}x`);
  }
  console.log('');
}

console.log('=== does the gain land WHERE IT IS NEEDED? ===');
console.log('  Pulse separation is a crank-angle property, so phi does not move with rpm — but the');
console.log('  nozzle is non-linear, so the GAIN does. It should be large at low flow and fade as');
console.log('  the mean pressure ratio rises on its own, which is exactly the rpm dependence the');
console.log('  housing work was missing.\n');
console.log('  engine                     gain@1500  gain@2500  gain@4000  gain@6000');
for (const e of ENGINES) {
  const c = CAM[e.cam], phi = dutyOf(c.dur, c.lsa, e.cyl / e.scrolls);
  const g = rpm => {
    const m = exFlow(e, rpm, 1.0), pr = turbineManifoldPR(m, e.area, e.T3);
    return pulseWork(pr, pulseAmplitude(e, rpm, 1.0), phi, e.T3) / Math.max(1, turbineWork(pr, e.T3));
  };
  console.log(`  ${e.n.padEnd(24)} ${g(1500).toFixed(2).padStart(8)}x ${g(2500).toFixed(2).padStart(9)}x ` +
    `${g(4000).toFixed(2).padStart(9)}x ${g(6000).toFixed(2).padStart(9)}x`);
}

console.log('\n=== the question that decides it: can the turbine now drive the compressor at the real');
console.log('    boost threshold, where before it could not? ===');
console.log('  Compressor power needed for 1.0 bar of boost against what the turbine can supply.\n');
console.log('  engine                   real spool   mdot g/s   P comp kW   P turb mean   P turb pulse   verdict');
for (const e of ENGINES) {
  const c = CAM[e.cam], phi = dutyOf(c.dur, c.lsa, e.cyl / e.scrolls);
  const rpm = e.realSpool;
  const mAir = exFlow(e, rpm, 2.0) / 1.06;                       // air at 1 bar boost
  const pComp = mAir * 1005 * 298 * (Math.pow(2.0, 0.286) - 1) / 0.72 / 1000;
  const mEx = mAir * 1.06;
  const prM2 = turbineManifoldPR(mEx, e.area, e.T3);
  const pMean = mEx * turbineWork(prM2, e.T3) / 1000;
  const pPulse = mEx * pulseWork(prM2, pulseAmplitude(e, rpm, 2.0), phi, e.T3) / 1000;
  const v = pPulse >= pComp ? (pMean >= pComp ? 'both reach it' : 'PULSE REACHES IT, mean does not') : 'neither';
  console.log(`  ${e.n.padEnd(24)} ${String(rpm).padStart(8)}   ${(mEx * 1000).toFixed(1).padStart(8)}   ` +
    `${pComp.toFixed(1).padStart(9)}   ${pMean.toFixed(1).padStart(11)}   ${pPulse.toFixed(1).padStart(12)}   ${v}`);
}
console.log('\n  "PULSE REACHES IT" on the diesel is the result this was built to test: a 2.0 TDI makes');
console.log('  boost at 1750 rpm in the real world and could not here. Anything still reading');
console.log('  "neither" needs more than pulse energy and should be said so out loud.');

// ---------------------------------------------------------------------------------------------
// PULSE IS NOT ENOUGH ON ITS OWN — so what else is missing?
//
// The verdict table above is the real result of this prototype, and it is a negative one: pulse
// energy is worth +20% to +45% at the boost threshold, which is a genuine effect of the right
// size and in the right place, but a 2.0 TDI at 1750 rpm still comes up 2.6x short of the power
// its compressor needs. Something bigger is missing for diesels specifically.
//
// The obvious candidate is the one piece of hardware every modern turbodiesel has and this model
// has no concept of: VARIABLE GEOMETRY. A VGT closes its nozzle vanes at low speed, shrinking the
// effective throat and forcing the expansion ratio up long before mass flow could do it. That is
// exactly why a 2.0 TDI makes full boost at 1750 rpm and a fixed-geometry petrol turbo of similar
// size does not. Test it the cheap way: shrink the throat and see what it takes.
console.log('\n=== what effective throat WOULD the diesel need at 1750 rpm? (the VGT question) ===');
console.log('  throat x   effective A   PR mean   P turb pulse kW   vs the 5.5 kW the compressor wants');
{
  const e = ENGINES[0], c = CAM[e.cam], phi = dutyOf(c.dur, c.lsa, e.cyl / e.scrolls);
  const rpm = e.realSpool, mAir = exFlow(e, rpm, 2.0) / 1.06, mEx = mAir * 1.06;
  const need = mAir * 1005 * 298 * (Math.pow(2.0, 0.286) - 1) / 0.72 / 1000;
  for (const f of [1.0, 0.8, 0.6, 0.45, 0.35, 0.25]) {
    const A = e.area * f, pr = turbineManifoldPR(mEx, A, e.T3);
    const P = mEx * pulseWork(pr, pulseAmplitude(e, rpm, 2.0), phi, e.T3) / 1000;
    console.log(`  ${f.toFixed(2)}       ${(A * 1e6).toFixed(0).padStart(5)} mm2   ${pr.toFixed(2).padStart(6)}   ` +
      `${P.toFixed(1).padStart(13)}   ${P >= need ? 'ENOUGH' : 'short'}`);
  }
  console.log(`\n  Compressor needs ${need.toFixed(1)} kW. If a plausible VGT closing ratio reaches it, the`);
  console.log('  diesel spool gap is a VGT gap and not a pulse gap — and pulse energy, while real,');
  console.log('  should be added for its own sake rather than as the fix for this.');
}
