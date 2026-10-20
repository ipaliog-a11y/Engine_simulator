# Changelog

All notable changes to Pixel Engine Sim.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versions are `MAJOR.MINOR`, and every commit carries a unique **build number** — a counter in the
file that only ever goes up, bumped by `tools/stamp.mjs` and enforced by `--check`.

It was originally the repository's commit count, which broke on the first squash-merge: three
stamped commits collapse into one, so `main`'s count came out *below* the number already written
into the file and `--check` failed on a repository that was perfectly correct. A count that can
shrink cannot carry a number that must never repeat.

This file starts at v0.6. Entries before it were reconstructed from the merged pull requests, so
they are accurate about *what* shipped but not about the day it shipped.

---

## [Unreleased]

Working toward **v1.0 — every number derived, not fitted.**

### A spark engine's torque, from the fuel it burns (build 95)

- **`IMEP_K` no longer sets spark torque.** Spark IMEP was 13.2 × typeImep × map × VE × an anchored
  mixture factor × crFactor. Air density × φ·faEta(φ) is already fuel × an efficiency, so the shape
  was right. What was fitted was the constant carrying the efficiency, and every fuel got the same
  energy per kg of air. It is now `gross IMEP = η × (m_air / AFR_st) × LHV × sparkMixture(λ)`, the
  diesel's form from build 88.
- **The efficiency is Heywood's.** A real engine reaches ~0.8 of the fuel-air cycle, whose efficiency
  at φ 1 is 1 − CR^−0.28 (0.47 at CR 10, fig. 5-9). The old constant implied 0.383 on the MX-5 at λ1;
  this gives 0.373, so spark torque falls ~2.7% across the board — the honest cost of replacing the
  fit. Full-load BSFC at λ0.86 is 280 g/kWh on the MX-5 (real 270–300).
- **Fuels carry their own energy per kg of air**, LHV/AFR_st: methanol +3.1%, race gas −1.1%, E85
  −0.5% against gasoline. So race gas makes slightly *less* power where an engine is not knock-limited.
- Spark timing, ignition health, coolant, engine health and nitrous are unchanged. `IMEP_K` survives
  only to scale the dyno brake's reference torque. Rotary and two-stroke keep their type factors
  (0.70 / 0.60), still fitted.
- Calibration: test41 3.28% → 3.32%, power RMS 8.3% → 8.5%, 0–100 5.2% → 5.1%, torque RMS 9.2% →
  11.0%. The NA engines read 2–3% lower; the turbos are roughly unchanged.
- test36: the Nordschleife challenge's reference build (the 2.0 ITB NA Screamer) was left 0.06 s
  inside 7:00. The target is the challenge's name, so the reference moved to the 2.5 Turbo I5 in
  the same race roadster, which clears it by 6.1 s.
- test59: the fuel-air efficiency against Heywood, the implied gross efficiency equal to 0.8 × fuel-air,
  full-load BSFC in the measured band, and IMEP per kg of air following each fuel's LHV/AFR_st.

### `turboChoke` retired: what rolls a turbo off at the top, derived (build 94)

`turboChoke` was a fitted VE taper, 2.5–10% per frame from the VE peak to the redline, standing in
for boost taper. Removing it on its own put five turbo presets on the limiter. Four pieces of physics
replace it:

- **Turbine efficiency from blade speed ratio U/C** (Watson & Janota): η/η_max = 2x − x², x =
  (U/C)/0.7. With a constant efficiency, a wastegated turbine made its compressor's power from so
  little expansion that manifold pressure sat *below* boost (0.8–1.1 × on the hot hatch). Now, at high
  flow with the gate open, C is small while the shaft still spins fast. Efficiency falls and
  back-pressure rises: 0.93 → 1.36 × boost from 60% to 100% of redline. The shaft speed comes from the
  integrator, or in the steady solves from the compressor's Euler relation for the boost being held.
- **Charge temperature at the compressor's efficiency at the operating point**, not one design figure
  for the whole map. At its redline the 2JZ's frame runs at 0.59 against a design 0.74, and the charge
  arrives 3.5 °C hotter.
- **The knock score's rich step is gone.** `if (lam < 0.87) k *= 0.5` let a 2% mixture change move knock
  by up to 40 points. At high boost the design curve (λ0.88) collapsed into knock retard while the
  scorecard (λ0.86) did not: a 33% torque disagreement between two views of one engine, which made
  any taper measurement meaningless. Its twin in `activeAdvance` (a 0.5 divisor on the retard) went
  with it. The replacement is continuous: knock-limited advance gains ~3° per 0.1 of enrichment, at the
  score's 2.5 points per degree, so `KNOCK_RICH` = 75. That is a measured trend, labelled as such. The
  derivation would be an end-gas autoignition integral.
- **Sequential turbos as two turbines.** 'Sequential' was one turbine for all the exhaust with a
  compressor-flow multiplier. That cost nothing at constant efficiency, and 1.58 × boost in
  back-pressure once efficiency was real. Now the primary runs alone, and the secondary comes in at
  the lowest speed where the pair can hold target: a derived control law. The test48 2JZ-GTE stages at
  **4000 rpm, where the real one does**, and makes 330 hp (real 320, was −10%). The pair shares one
  manifold fed by every cylinder; a compressor's map position is per active wheel.
- **Bug: the spool integrator fed the compressor charge-temperature air as its inlet.** That is the
  air after the compressor and intercooler. With no intercooler it paid ~25% extra compressor work,
  which hid the fill cost of a large core. The inlet is now ambient: 0.29 s with no intercooler
  against 0.36 s with the large core.
- **Results.** No new limiter cases (the hot hatch is a plateau within 1%; the TDI is known). The kei,
  2JZ and I5 now roll off on their own at 90–93% of redline, and the V8 diesel at 84%. Calibration
  (test48), build 93 → 94: power RMS 10.2% → 8.3%, torque 10.4% → 9.2%, 0–100 5.6% → 5.2%; test41
  3.36% → 3.28%.
- Tests:
  - test40's "over-flowing deepens the choke" read the fitted constant; it now measures top-end
    falloff.
  - test49 checks the vane penalty itself (11 points) rather than a net score that power changes also
    move.
  - test56's 13B spool ceiling is ratcheted 8600 → 7500 (it reaches boost at 7400; it never stages).
  - test58 covers the U/C curve, back-pressure above boost and rising with flow, the charge
    temperature following point efficiency, knock continuity in mixture, the staging speed, and fill
    against intercooler size.

### Turbo spool timing from the hardware — and test40 passes (build 93)

- **Bearing drag from Petroff's law.** It was `BEAR_C`, about 5× published cartridge losses with a
  D⁵ borrowed from the inertia scaling. Now it is two floating-ring journals plus a thrust bearing,
  each P = 2π μ r³ L ω²/c, from published geometry and properties: journal 0.11 × wheel, L/d 0.8,
  clearance 0.4% of r, hot 5W-30 μ 0.010 Pa·s, ring speed ratio 0.3. That gives 0.42 kW at 100k and
  0.83 kW at 140k on the reference cartridge (published 0.2–0.8), scaling as D³.
- **Charge-fill energy from the plumbing.** It was `FILL_E`, J per bar attached to the compressor
  wheel. Now it is the air needed to raise the pressure in the real volume between compressor and
  throttle: ducting at ~0.72 of the exducer (a GT28 has a 2-inch outlet on a 71 mm wheel) plus the
  intercooler core. That is 1.2–13.5 L, with dm = V dp/RT at the compressor's specific work.
- **Boost is a state.** It was a readout of shaft speed in both directions, so each dip dumped the
  charge volume instantly and the refill was charged again: with a real-sized volume that burned
  energy in a loop and stalled spool above 1 bar. That is why deriving the fill was blocked before.
  Now boost rises as the shaft can afford the air, and falls only as fast as the engine empties the
  volume, τ = air held / air swallowed.
- **test40 passes in full**, its first time in many builds:
  - Time to 90% boost goes 0.06 s → 0.19 s from 0.5 to 2.5 bar (3.2×).
  - The frame-ordering claim was held up by the oversized bearing constant. With real bearings, a
    small frame at 0.88 of its rated flow on a 7500 rpm 2.0 makes 171 hp against the large frame's
    257, and loses. The claim is now checked where its premise holds: on a 1.4 the small frame can
    feed (load 0.53), it beats the large by 1.5 s (the large spends 9.4 s below boost).
- Removed dead code: `spoolK`, and the `k` and `lag` table fields it read.
- test52: an engine whose power peak is AT the redline (the 2.0 TDI's plateau) cannot be held there,
  because the limiter is a fuel cut. It must settle within the last 2.5% below it, with power still
  within 2%.
- Calibration unchanged (test41 3.36%, 0–100 RMS 5.6%). test57: bearing loss against published
  figures and D³, charge volumes, boost holding after a lift, and a bigger charge system filling
  slower. The volume upstream of a closed throttle holds its pressure (1.00 → 0.95 bar in 0.5 s);
  that is what blow-off valves exist to vent, and the model has none.

### The rotary's slow burn, and where its heat goes (build 92)

- **A Wankel burns slowly, and late.** Its long, thin chamber takes 120–140° of eccentric shaft to
  burn, roughly constant from 3000 to 6000 rpm (Vorraro, Turner & Akehurst, SAE 2022-01-0591). It
  makes best torque with CA50 35–40° after TDC. A piston SI engine burns in ~50° with CA50 near 8°.
  A Wiebe burn on each engine's own volume curve gives a phasing efficiency of 0.86 for the rotary
  (TDC to BDC over 270° of shaft, near-sinusoidal) against 0.96 for the piston: about a tenth of the
  expansion work is never done.
- **The torque already carried it; the exhaust did not.** The rotary's low output is part of its
  measured type constant (`imep` 0.70). What was missing was where the heat goes, so the undone work
  is routed to the exhaust, as the diesel's late burn is. Exhaust share 0.316 → 0.351. None of the burn
  outlasts exhaust-port opening, so this is late phasing, not burning in the port.
- **13B turbo:** EGT 775 → 942 °C (real 900+), and it makes boost before its limiter. It peaks at
  8700 of 9000 rpm, so it leaves the limiter lists (test44, test46 budgets 3 → 2). **Renesis:** 807 →
  897 °C, 3 °C short of test46's band, with its floor ratcheted to 890. A Renesis cooler than a
  peripheral-port 13B is the right direction: Mazda retarded its side-port opening for efficiency.
- **Still open:** the 13B reaches 90% boost near 8500 rpm against a real ~3000. Its exhaust is hot
  enough now. What it lacks is pulse energy, which the model times from cam geometry, and a rotary
  has ports. That needs the rotary's port timing from a firmer source than the one found (75° BBDC
  on the 13B-REW, second-hand from the FD shop manual). It is held at a ceiling in test56.
- test56: phasing on both volume curves, the Wankel volume curve itself, slow-burn heat reaching the
  exhaust and only on rotaries, independence from rpm, and the 13B's EGT, spool ceiling and peak.

### Turbo manifolds as short as they can be built; turbine housing as the builder's choice (build 91)

- **A turbo manifold is not a tuned header.** Turbo engines carried the 550–780 mm primaries
  derived for naturally-aspirated wave tuning. Against a turbine the returning wave is a compression,
  which only hurts (the model already flips its sign), and every litre of manifold smooths away the
  blowdown pulse the turbine runs on. So a turbo manifold is now as short as packaging allows: runners
  from each port to a turbine at mid-bank, 0.1 m + (n−1)/2 cylinder pitches (1.15 × bore). That gives
  0.3–2.7 L per turbine instead of 1.3–5.5, and the 2.0 hot hatch keeps 37% of each pulse instead
  of 14%. The kei reaches 90% boost at 2950 rpm (real 2800–3000, was 3875), the 2.5 I5 at 2525 (was
  2750).
- **TURBINE A/R: TIGHT / STOCK / LOOSE**, three catalogue housings per frame (small 0.35/0.42/0.50,
  medium 0.48/0.64/0.82, large 0.63/0.86/1.06). STOCK is the A/R each frame always had, so nothing
  moves unless the build asks. Tight spools earlier and costs top end; on the hot hatch it is 2750 rpm
  and 235 hp, against loose at 3225 rpm and 274 hp.
- **Why not derived.** Two attempts sized the housing per engine. Minimum in-gear sweep time
  improved test41 to 3.05% but gave the GTI 287 hp against the real 220. Average power bought top end
  with spool. Which side of the compromise to take is a design intent: VW fits the GTI a small, tight
  turbine for response. Any objective decides that silently for every engine, so the choice is
  offered, the way a maker offers it.
- Calibration: test48 0–100 RMS 7.0% → 5.6%, torque RMS 11.5% → 10.4%, power RMS 9.1% → 10.2%,
  test41 3.38% → 3.36%. The Alto's 0–100 went from +11% to +1%, so its known-gap cap is retired; its
  gap now shows as power (+17%, named in test48). The cause is the same: the smallest frame (54 mm)
  is too big for 660 cc, so nothing chokes its top end the way the real ~40 mm IHI does.
- test46's buildable-header band applies to headers; a turbo manifold must instead be shorter than
  the header the same engine gets NA. test55 covers the housing choice (ordering, the STOCK = old
  A/R guarantee, the form) and the manifold. The `setTurbineAR` / `buildBoostTable` refactor stays.
- test40's two failures were listed as waiting on housing sizing. They are not: spool to 90% in
  0.06–0.12 s at fixed rpm is far quicker than real turbos manage, so what they wait on is the
  transient shaft model (inertia, fill, bearing drag).

### Exhaust pulse energy at the turbine (build 90)

- **The turbine is fed by blowdowns, not by a mean pressure.** A real turbine is fed by each
  cylinder's blowdown pulse: a large share of the gas arrives in a short, high-pressure burst, and
  nozzle work rises with pressure ratio, so bursts do more work than the same mass delivered steadily.
  The model now uses two states defined by mass, so mass is conserved by construction and neither
  state can fall below ambient:
  - **Blowdown share f_b** comes from the cylinder at exhaust-valve opening: p_EVO from intake
    density and T3, then isentropic expansion to manifold pressure. It is ~0.5–0.7 at full load;
    the prototype assumed a constant 0.5.
  - **Duty φ** comes from cam geometry: (lsa + dur/2 − 180)° × cylinders per turbine / 720.
  - **How much of the pulse survives to the turbine** is a volume ratio, V_b/(V_b + V_m), against
    the derived primaries.
  - Nothing is fitted. Rotaries and two-strokes have no cam to time a blowdown from and stay on the
    mean.
- The prototype's ±A pressure swing about the mean (tests/proto/pulse.mjs) was replaced. Its low
  state clamped at ambient invented mass, and a kei read 0.19 bar at 1500 rpm but 0.12 at 2000.
- **The effect is real and small on these presets.** A kei goes from 0.30 to 0.43 bar at 3500 rpm.
  The petrol presets carry 1.3–5.5 L of long tuned primaries, which keep only ~10–20% of each pulse
  (the 2.0 hot hatch gains at most +1.6% turbine work). Real turbo manifolds are short, which is a
  hardware question for later.
- **Solver speed.** Pulse states cost extra nozzle solves, and a build went from 90 to 1878 ms.
  The choked nozzle is now solved in closed form, sub-choke by bracketed Newton, and the wastegate
  balance reuses the PR it already has. The nozzle matches the old 60-step bisection to 4×10⁻¹¹ in PR
  over 612 cases; a build takes 205 ms and the suite 2 min 19 s. `vgtThroat` brackets the throat
  area, since pulse power has no closed-form inverse, and returns the power it solved for.
- Calibration (test48): 0–100 RMS 8.1% → 7.0% (Alto +16% → +11%), power RMS 8.6% → 9.1%
  (Alto 64 → 72 hp), test41 3.39% → 3.38%.
- test54: solver equality, work only ever added, mass conserved, the gain fading with flow, a tighter
  manifold and divided turbines keeping more pulse, ported engines on the mean, and steady boost never
  falling with rpm below target. test44 now shares test46's named limiter list.
- Housing sizing's first rerun is parked at `tests/proto/housing-sizing-2.diff`, to be redone on top
  of this.

### The tests measure what the engine runs — and two exhaust-temperature bugs they were hiding (build 89)

An audit asked whether the tests still reflected the physics after build 88. Several did not.
- **The EGT checks measured a temperature nothing ran at.** test46, test47 and test49 called
  `exhaustGasT(1.0)`, with no rpm and an assumed mixture. Since build 88 EGT depends on rpm (burn
  time, wall heat), so the checks passed while the engine ran up to 90 °C hotter. There is now one
  function, `egtAt(rpm, map)`: the operating point's speed, boost and the mixture actually burned.
  The engine's own callers and the tests both use it. Real engines' EGT is measured on their own
  ECU, so the tests compare at the full-load mixture the hardware runs (`fullLoadLambda`).
- **Bug: rich mixtures ran hotter.** `exhaustGasT` credited every gram of fuel with heat. Rich of
  stoichiometric the oxygen runs out and the excess leaves as CO and H₂, so the release is now
  capped. Turbo petrols on their ECU map read ~900 °C (real 900–980) instead of 1136 °C. It went
  unseen while the function was only called at one assumed mixture per load.
- **Bug: the dyno's boost table spooled on cold gas.** `steadyBoost` is a wide-open-throttle solve
  but took load = rpm/(0.8 × redline): 550 K gas at 2000 rpm, against ~950 K on the LIVE bench's
  shaft at the same point. Both now use full-load gas. The extra wall-heat time at low rpm is what
  legitimately cools it.
- **Diesel EGT band = the vane rating** (827 °C). It was 800, below the limit the ECU fuels up to.
- **test49 used its own copy of the VGT throat schedule**, which had drifted from the engine. It now
  calls the engine's `turbineThroatAt`, and sweeps from just off idle so it sees the petrol vanes
  move. At wide-open throttle a petrol holds 0.9 bar from ~2000 rpm with the vanes at the open stop.
- **test52** reads the mixture burned (not the slider) against `SMOKE_LAMBDA_CI`; test47 rates a
  diesel at `bestPowerLambda()`.
- **The 0–100 run now reports why it takes the time it takes**: `gripT` (traction-limited) and
  `lagT` (below 90% of target boost). test41's kei ladder had assumed the car was still grip-capped
  on slicks. With honest exhaust heat it is boost-limited (1.0 s on the grip limit, 3.5 s below
  boost), so AWD only adds drivetrain loss. The test now checks the claim on its premise. A
  shift-throttle floor in `simulateAccel` had been tuned once before to hold that ordering.
- **Known gaps, now visible and budgeted by name** (each held at a floor so it cannot get worse):
  - Rotary EGT, both rotaries (775–807 °C against a real 900+), and the 13B turbo peaking at its
    limiter. Both come from the trailing combustion pocket still burning at exhaust-port opening,
    which is not modelled. They used to pass only on the rich-mixture bug.
  - Alto Works 0–100 +16% (own cap 20%). Its K6A barely spools because the smallest turbo frame
    (54 mm wheel) is far too big for 660 cc; the real car uses a ~40 mm IHI RHF3. That is
    frame/housing sizing, next in the queue.
- Calibration: test41 3.34% → 3.39%, power RMS 8.6%, 0–100 RMS 7.2% → 8.1%. The spool calibration
  had been sitting on overstated exhaust heat.

### The diesel, from its fuel — the last fitted VE bell on a piston engine is gone (build 88)

- **Diesel torque is computed from the fuel it burns.** It used to come from AIR times a constant
  calibrated on spark engines. To make a real 2.0 TDI's 320 Nm that way the model had to fuel it at
  λ1.02–1.05, about 20% more fuel than a real engine, while its exhaust-temperature model assumed a
  realistic λ1.35. The two never agreed, and BSFC read 120–160 g/kWh. Now gross IMEP is
  η × fuel × LHV / Vd. η is built from compression ratio, the fuel-air cycle and burn phasing around
  one published reference: 0.46 gross for a passenger-car DI diesel at full load. Full-load BSFC reads
  202 g/kWh at 2000 rpm (real 200–215). The smoke limit is λ1.20, the common-rail figure (was 1.02).
- **The burn takes time.** A spark engine's flame rides turbulence that scales with piston speed, so
  its burn takes the same crank angle at every rpm. A diesel's is set by injection and mixing: about
  2.5 ms, which is 30° at 2000 rpm and 72° at 4800. A Wiebe burn from 6° BTDC gives the efficiency
  of each heat increment, and the late heat goes down the exhaust.
- **The ECU will not cook the turbine.** Full-load fuel is capped where the exhaust reaches the
  vane-material limit (`VANE_T_LIMIT`, 1100 K), solved from the exhaust energy balance. On the
  2.0 TDI it leans the engine from λ1.20 to λ1.24 over the last 300 rpm.
- **Wall heat falls with speed and size** (Woschni: the wall share goes as (bore × piston speed)^-0.2).
  It is referenced to the engines whose measured EGT validates the exhaust constants, so those stay put.
- **Gas exchange is signed for the diesel.** With gross IMEP the pumping loop is p_exh − p_int, so
  boost above back-pressure is work given back. That is 0.1 bar at 2000 rpm where 1.25 was charged.
- **The diesel VE bell is retired.** Only ported engines (rotary, two-stroke) keep it.
- Golf 2.0 TDI (test48): 156 hp / 344 Nm / 0–100 8.64 s against a real 150 / 320 / 8.6
  (was 143 / 339 / 9.11). test41 3.41% → 3.34%. Petrol engines: unchanged except through wall heat.
- **Known, and documented in test46:** the 2.0 TDI preset's power is a plateau, within ~4% from
  3500 rpm to the limiter, so it counts as peaking there. A real TDI's sharper fall over its last
  600 rpm is the maker's torque-limit calibration. A 12% droop governor was tried and rejected: it
  put the peak at 4200 but cut torque at 4500 to 114 Nm (real ~212) and slowed the Golf to 9.20 s.
- test53: the bell, burn phasing, the turbine-temperature cap, the smoke limit, BSFC against
  published figures, torque-follows-fuel and signed pumping.

### The 2.0 turbodiesel preset's curve, and a state leak in every turbo curve

- **`engine.boostNow` leaked between calls.** `computeVE` set it only after the overlap term had
  already read it through `backPressureBar`, so every turbo VE used the PREVIOUS call's boost — the
  previous sweep point, or at the start of a sweep whatever ran last. The same point read 150.8 or
  180.2 Nm on the 2.0 hot hatch depending on call order. It also made the 6% step in the diesel at
  1600–1800 rpm. Set first now; test52 checks call-order independence on every turbo preset.
- **The diesel ECU map fuelled a floored engine lean.** It measured load as MAP over best-case boost,
  so below the boost threshold full pedal read as ~30% load and was fuelled at λ2.7. Load is now the
  share of the air available at that rpm, and a diesel's editable fuel-map rows are load (15–100%)
  rather than absolute MAP, which also stops the grid smearing λ through the spool-up. test52 checks
  that every preset floored on the ECU map makes ≥85% of its best-power torque at every rpm.
- **The 2.0 Turbo Diesel I4 preset carried a medium turbo frame**, which on a 2.0 L does not reach
  full boost until 2800 rpm. Now the small VGT a real 2.0 TDI uses: full torque from 2000 rpm.
- The diesel top end that collapsed to 45 Nm at the redline was fixed in build 88 (above).

### Dyno result sheet, track zoom, operating-point buttons, Wankel cutaway, mixture curve

- **DYNO RESULT** panel under the chart: peak power and torque in hp/kW/Nm/lb-ft with their rpm, and
  a run-data table, in real text. It names the two pulls the tab has always mixed: the **best-power
  pull** (what the grade and objectives use) and **your pull as tuned** (the curve drawn, and what the
  PDF tabulates).
- **Track map zoom and pan**: scroll or pinch to zoom about the cursor (to 16×), drag to pan,
  double-click to fit. Resets when the circuit changes; the title and legend stay put.
- **Operating-point buttons.** OPTIMAL / MAX POWER / ECO were three fixed slider sets shared by every
  engine; MAX POWER held 50% load (not the power peak), used a petrol AFR on diesels, and cooled the
  intake to 15 °C. Now MAX POWER and **PEAK TORQUE** (was OPTIMAL) hold wide open throttle at this
  engine's scorecard peaks, at the scorecard's mixture and conditions, with the brake target offset
  so each settles on its rpm; ECO searches speed × load × mixture for minimum BSFC. Verified on the
  live bench (`test52`): MAX POWER lands within 2% of the scorecard on six engines including a diesel,
  a rotary and E85.
- **Mixture → torque from the fuel-air cycle.** `afrPowerFactor` was a fitted Gaussian 0.19 wide
  that put stoich 41% below best power (real: ~3%), made rich the most economical mixture, and ran
  every light-load AUTO-map point ~37% weak. Now imep ∝ φ·η(φ) with η from Heywood's fuel-air cycle,
  anchored at the scorecard's best-power mixture so no scorecard figure moves. Best economy is now
  λ≈1.1 petrol, λ≈1.8 diesel. Calibration: test41 3.34 → 3.41%, aero 6.4 → 6.5%.
- **VGT holds its target on the live bench.** The vanes were scheduled to the compressor alone, so
  bearing drag left a VGT diesel at 1.05 bar against 1.20; they now cover the drag too.
- **Wankel cutaway at parity with the piston view**: ports at the housing's top waist and plugs at the
  bottom one (they were at the long axis, where the chamber is largest), chambers coloured by phase,
  phase labels where they happen, the same instruments as the piston view, and a rotor bank. The
  cutaway's EGT readout now comes from `exhaustGasT` instead of a display formula.
- **Caps**: Wankels to 4 rotors, two-strokes to 6 cylinders, with higher counts disabled in the list
  rather than silently clamped.

Found, not fixed: absolute BSFC reads optimistic (diesel 120–160 g/kWh against a real ~200–230;
petrol at full load ~240 against ~270–300). That is the combustion model, conversion 5.

### The VE bell comes off every poppet-valve petrol engine

The fitted VE "bell" (`vePeakRpm`, widths, shoulder) had resisted two removal attempts. The third
found it was covering for two errors, both now fixed, and with them fixed it is not needed:

1. **Intake valve closing was in the wrong place.** `trappedFraction` put the intake lobe centre at
   90° ATDC while `overlapDeg` (`dur − 2·lsa`) puts it at LSA, so every intake closed 16–24° early
   (stock 20° ABDC instead of 44°; a real B6 MX-5 closes at 51°) and low-rpm backflow was
   understated. A cam phaser also moved IVC by half its authority instead of all of it.
2. **The intake ram was tuned 22–57% too high in rpm.** The model put the main Helmholtz peak where
   one oscillation fits in the intake event (f_H/(N/60) = 360/duration: 1.64 stock, 1.27 race).
   Engelman's experiments, the source of the model's effective-volume formula, put it near 2; a
   later SAE study measured 2.42. Every runner was ringing at the redline, which is why removing the
   bell put peak power on the limiter, and why removing it from turbos looked like missing boost
   taper: the bell's right side had been rolling torque off to hide the misplaced resonance.

Results: test41 **4.02% → 3.34%** (all turbos, shape only); test48 power RMS **15.8% → 8.6%**, no
car more than 11% off (was 30%), torque RMS 14.6% → 11.9%, 0–100 on own power 10.2% → 7.1%, top
speed 3.5% → 1.8%; boost-threshold torque cliffs 5 → 4; aero unchanged at 6.4%. One number got
worse: test48's car-only 0–100 (power matched) 7.8% → 9.7%, because the S2000 and S54 curves are now
fuller than the real engines'. Kept, recorded, and next in line.

Kept fitted: the bell for diesels, rotaries and two-strokes, and `CAM.ampMul`.

Test inputs corrected to factory hardware, each noted in place: no VVT on the 1989 MX-5 or the C6
LS3, the LS3 on its real ~400 N spring (the stock spring floated it at 5500 rpm, inside its
redline), and the S2000 and S54 on short runners and high-rpm headers (the S54 was specified with
individual throttle bodies AND a 320 mm runner at once). test47's NA BMEP ceiling grounded at 15 bar
by real engines (S54 14.1, Ferrari 458 15.1); its diesel-cliff cap 40 → 42, because correct IVC
lowers pre-boost diesel torque. test45's fixture now searches for a gearing where top gear itself
holds top speed, after the kei became over-geared at the old fixed setting.

### UI: tab names, firing order, Greek font, and a guide you can read

- **Tabs renamed.** DESIGN → **ENGINE**, ENGINE → **LIVE**, everywhere they are referred to.
- **Firing order on the LIVE bank.** Every engine used to fire 1-2-3-…-n (backwards, as it
  turned out) under a caption reading "FIRING ORDER 1-4". Each layout and cylinder count now has
  its production order (I4 1-3-4-2, I6 1-5-3-6-2-4, V8 1-5-4-8-6-3-7-2, V12 1-7-5-11-3-9-6-12-2-8-4-10,
  flat-6 1-6-2-4-3-5), numbered bank by bank as BMW/Audi/Ferrari/Porsche do. That is also what
  makes the drawing's crank geometry right: pistons 1 and 4 of a four now move together. Every
  cylinder is numbered, and the number lights while it fires.
- **Greek font.** The bundled pixel font was the latin subset only, so Greek fell back to the
  system monospace and rendered far smaller. The Greek subset of the same font is now bundled.
- **The guide is paged.** One 8 px sheet became an index of 28 pages in 7 sections, with
  prev/next/index on every page, at 16 px, full width, remembering where you were. New pages:
  the tabs, a first-build walkthrough, the firing order, the bottom end (bore/stroke, piston speed,
  compression), options, and known limits. Two stale passages were corrected rather than carried:
  the gearing slider is a bias about the derived final drive (since build 74), and turbo lag has
  reached the 0–100 since build 66; their old Greek was dropped. Greek is kept per paragraph
  wherever it still says what the English says; newer pages are English in Greek mode.
- **Live builds actually reach you.** The service worker was cache-first for everything with a
  cache name that never changed, so a browser that had opened the page kept serving that copy and
  never saw a new build. The page is now network-first (cache only when offline).
- New `tests/test51.mjs`: tab names, firing orders and inline-four crank geometry, every guide page
  reachable and only one shown at a time, and the Greek face actually loaded.

### Shift at the wheel-torque crossover, not the limiter

`simulateAccel` upshifted on one condition, `rpm >= redline`, in every gear of every car. It now
shifts where the next gear gives more wheel force at the current road speed (or at the limiter),
the rule `simulateLap`'s `bestGear` already used. No new constant.

- Golf TDI 0–100: **13.75 → 9.03 s** (real 8.6). test48 0–100 RMS **24.4% → 10.2%**; vehicle-only
  (power-matched) 22.2% → 7.8%. "Right power, wrong car": 1 → 0.
- The ±1.4 s sawtooth of 0–100 against final drive is gone. What remains is one step per extra
  shift (~0.45 s on a manual), which is real.
- Peaky petrol engines are unchanged: their crossover is at the limiter.
- test41 3.99% → 4.02%, aero unchanged at 6.4%.
- New `tests/test50.mjs`: cutting the redline must not make a car quicker, and 0–100 may only step
  by one shift against final drive. Both fail on the old rule (27% and 1.13 s).
- test48 budgets ratcheted: 0–100 RMS 28 → 13, worst 65 → 26, misattributed 1 → 0.

### Variable-geometry turbine — the diesel spool gap, closed

New **TURBINE** option: FIXED HOUSING or VARIABLE GEOMETRY. A ring of pivoting nozzle vanes makes the
turbine throat a control input; the ECU schedules the *widest* throat that still supplies the
compressor at target boost, so the vanes sit shut through every spool-up and open once target is
made. Nothing fitted:

- **Sweep and top-end loss are vane geometry**, `A(β) = h·(2πr₂·sinβ − Z·t)`, from 12 vanes of
  1.5 mm swept 21–60°: a 2.8–3.1:1 range, and 8–13% blockage at full open, so a VGT flows *less* than
  the plain housing of the same frame at the top.
- **The petrol/diesel split is derived.** Vanes creep above ~1100 K; `exhaustGasT` gives a lean
  diesel ~880 K and a rich petrol engine ~1235 K. A petrol VGT loses ~19 reliability points, a
  diesel none. A vane ring costs 1.7× a plain housing.
- 2.0 diesel: full boost **2575 → 1800 rpm**, torque peak 2700 → 1900 rpm, worst torque step
  21.2% → 16%, −2 hp at the top. Both diesel presets and test48's Golf TDI (factory VTG) now use it.
- New `tests/test49.mjs` pairs every gain with its price, and checks no build that did not ask for
  a VGT has changed.

Known limit, labelled in code: the throat convention (`A/R × R_wheel` instead of the centroid
radius) undersizes every turbine, so the VGT still needs a wastegate at its open stop.

### Found: `simulateAccel` upshifts at the redline

Golf TDI 0–100 got *slower* with VGT (13.29 → 13.75 s) on a strictly better engine. Cause: every car
upshifts only at the redline. Shifting the same TDI at 3800 rpm instead of 4800 gives **9.80 s vs
13.75 s** (real 8.6 s) while giving up 12 hp. 0–100 also saw-tooths ±1.4 s with final drive.
Measured and written up in `tests/proto/README.md`; the fix (shift at the wheel-torque crossover)
is its own change. test48's 0–100 RMS moves 22.8% → 24.4%, inside budget and traced to this.

### Turbo transient losses — integrated, and audited against real magnitudes

Two transient shaft losses were added to `advanceShaft` (and deliberately **not** to the steady boost
search, so a wastegated frame still holds target once lit): plumbing/intercooler **fill energy**
while boost is rising, and **bearing drag**. Both are real effects. Both were also still fitted, so
they were measured rather than taken on trust — by instrumenting the live model, not by reasoning
about the constants.

**Bearing drag is roughly 5× real, and its exponent is borrowed from the wrong argument.** On a 2.0
four at 1.0 bar:

| frame | shaft rpm | turbine kW | bearing kW | as % of turbine |
|---|---|---|---|---|
| small 54 mm | 183,900 | 46.8 | 1.42 | 3% |
| medium 71 mm | 139,900 | 29.0 | 3.22 | 11% |
| large 86 mm | 39,900 | 3.11 | 0.68 | 22% |

Published journal-bearing cartridges run 0.2–0.8 kW at 100–150k rpm; the large frame here is paying
0.68 kW at *40k*. And the `D⁵` came from the inertia scaling, which is a mass-distribution argument —
Petroff's law gives friction power as `ω²·D³`.

**That oversized term is exactly what buys `test40`'s frame-ordering assertion.** At 0.8 bar, small
vs large 0–100: as committed 6.44 s vs 6.56 s, small quicker by **0.12 s**; with bearing drag at
published magnitude and `D³`, 6.44 s vs 6.39 s, small **slower by 0.05 s**. A 0.17 s swing on a model
whose calibration RMS is ~3% — about 0.2 s on a 6 s car. The claim is true of real turbos, but it
currently sits **inside this model's noise floor**. Note the t90 boost ladder survives that
correction: it is carried by the fill term, not by bearing drag.

**The fill term is attached to the wrong variable.** It scales 6.4× across frame size and only 1.36×
across intercooler size. The charge system that has to be pressurised is the core and the piping, so
the physical dependence is the other way round. Deriving it (`dm = V·dp/RT` times compressor work per
kg) gives 248 J for 2.5 L of plumbing and 894 J for 9 L, against the 280–381 J charged — but
substituting that outright **stalls spool above 1.0 bar**, because the turbine cannot fill a
realistically sized charge system. Same finger the diesel spool cliff pointed at: turbine housing
sizing.

One hypothesis checked and **disproved**: `dB = max(0, b2 − b)` looked like it might ratchet, charging
the plumbing repeatedly on boost ripple. It does not — boost rises monotonically at constant engine
speed, inflation 1.0× at 0.5, 1.0 and 2.0 bar.

Also removed a dead housing heat-soak hook (`HEAT_SOAK` and `HEAT_PR` were both zero, so the term
always evaluated to nothing). A term that can never do anything is not a placeholder; it reads like
modelled physics.

### The pumping loop now includes the exhaust side

`pumpFrictionMEP` charged only for intake depression against atmosphere — the pumping loop
`PMEP = p_exhaust − p_intake` with `p_exhaust` **assumed to be 1 bar**. On a boosted engine the
piston is not pushing against the atmosphere, it is pushing against the turbine, and
`backPressureBar` has computed that since the gas-dynamics conversion. The term was simply never
connected to the work balance.

The consequence was not a small error in a corner of the model, it was a **missing constraint**: a
tighter turbine housing cost nothing at the top end, so nothing pushed back on making one tighter.
That is why turbine housing sizing could not be derived, and it is why the housing has been picked
from a frame size class — small 0.42, medium 0.64, large 0.86 — independent of the engine bolted to
it. Measured across the presets, that gives a **4× spread in exhaust flow per mm² of throat**, and
boost thresholds up to **4275 rpm late** (the 13B lights at 7275 rpm against a real ~3000).

What it costs, peak power, against the same build without the term:

| preset | before | after | |
|---|---|---|---|
| 1.0 Kei Turbo I3 | 114 | 106 | −7.0% |
| 1.5 Turbo Eco I4 | 167 | 152 | −9.0% |
| 2.0 Turbo Hot-Hatch I4 | 240 | 218 | −9.2% |
| 2.5 Turbo I5 (RS) | 303 | 270 | −10.9% |
| 3.0 Turbo I6 (2JZ) | 329 | 290 | −11.9% |
| 2.0 Turbo Diesel I4 | 136 | 123 | −9.6% |
| 6.6 V8 Turbodiesel | 476 | 402 | −15.5% |
| 1.3 Rotary Turbo (13B) | 159 | 149 | −6.3% |

Naturally aspirated engines lose only their pipe back-pressure (0.02–0.19 bar), so the NA
calibration is untouched. Real-car acceleration RMS moves **3.02% → 3.19%** — a regression, and an
explainable one: it is the cost of adding a term that was missing, and the housing sizing it unlocks
is expected to take it back.

Two consequences worth stating rather than hiding:

- **The Grand Prix Pace power target moved 300 → 285 hp.** The reference 2JZ build went from 325 hp
  to 290, so the challenge became unreachable by the build it was authored around. Authored content
  tracks the physics, not the other way round — the same call already made when its lap target moved
  60.0 → 60.6 s. (290 hp is not obviously wrong for the engine it models; a JDM 2JZ-GTE was 276.)
- **A grossly over-flowed frame can now choke an engine into not reaching 100 km/h at all.** A 2.0
  four asked for 2.5 bar on a small frame reaches **7.4 bar** of exhaust manifold pressure against
  2.3 bar of boost; PMEP of 6.4 bar eats the entire bmep and torque falls to 24 Nm at 7000 rpm. The
  car covers 400 m in 19.5 s and asymptotes at 97 km/h. Verified as a real collapse and not a NaN —
  no non-finite cells in the torque grid, and the zero-boost column stays healthy at 176 Nm. `test40`
  threw on the resulting `null`; it now carries it through, because "cannot reach 100 km/h" is a
  legitimate model output and a harness that crashes on one turns a result into an error.

  Not modelled, and flagged: at 7.4 bar expansion that turbine would be far past its 184k rpm limit.
  The real outcome of that build is a **destroyed turbo**, not steady gutlessness.

The intake half of the loop keeps its `ci` reduction, and that factor is **not** physics — it
compensates for `mapTarget()` giving a diesel a throttle plate it should not have. A real diesel is
quality-governed: the intake sits at ambient+boost at every load and torque is set by fuel quantity,
which is also why a diesel has so little engine braking that trucks need exhaust brakes. Fixing it
means re-plumbing diesel load through fuelling rather than through map, which is its own change.
Labelled in place rather than quietly carried.

### Racing line — an honest claim instead of an unachievable one

`test38` asserted the late-apex line **never** costs time on any circuit. That is a claim of
*optimality*, and minimum-curvature-plus-an-exit-bias cannot make it: only a true minimum-lap-time
line could. On a circuit of fast sweepers that only want minimum curvature, a geometric heuristic
can give a little back. It now asserts what such a heuristic can honestly promise — **pays on
balance, and never loses more than 0.5% anywhere**: −0.39 / +0.25 / −1.10 / −0.39 s, net **−1.63 s**.

**Tried first, and reverted: making the line car-aware.** Whether a late apex pays genuinely depends
on the car — a friction-circle argument, since on exit grip is shared between turning and
accelerating, so straightening the exit only helps a car that can demand more than the leftover grip
allows. Deriving the bias that way works and is properly selective (apex 10.8 m later onto a
straight against 4.1 m into more corners), and it would have retired the README's *"the racing line
does not know what car is driving it"*.

It was reverted for two reasons. It did **not** fix the failure — Cape still cost 0.24 s, because
the problem is the shape of the objective rather than the value of the bias. And it invalidated
three test harnesses that manipulate `T.line` directly, `test32` among them, which went from a
passing racing-line-beats-centreline check to failing on all four circuits. The known limit stands,
and a minimum-time line is what would actually retire it.

Third harness-versus-model mismatch in this stretch, and the same shape each time: a comparison that
quietly compares something against itself. `test38`'s first attempt seeded a line cache under a key
the lookup never read and reported 0.00 s deltas — a clean pass on a measurement of nothing.

### Conversion 4 of 5 — turbo, part 4: lag reaches the acceleration solver

`simulateAccel` took torque from a 1-D `tqAt(rpm)` curve built once before the run. That stopped
being valid the moment boost became a state with history: at 4000 rpm a turbo might be at 0.1 bar
because you just floored it or at full boost because you have been flat for two seconds, and a 1-D
curve holds only the fully-spooled case. Every acceleration run started with the turbo already lit.

Now a **2-D grid over rpm × boost**, built once and bilinearly interpolated — `computeVE` carries two
wave solves and a nozzle bisection and is far too expensive per step. Shaft energy is a state
variable in the run, advanced by the same `advanceShaft` the live engine uses so the two cannot
drift apart. NA and supercharged engines keep a single boost row: a belt-driven blower has no shaft
of its own to spin up.

**Result:** lag is real. A large frame on a 2.0 L at 0.8 bar went 5.71 s → **6.39 s** to 100 km/h —
0.68 s of lag that the steady curve could never show. Calibration unchanged at **3.19%**.

Two wiring errors on the way, both worth recording because neither was in the physics:

- **The shaft started from rest at launch.** A standing start is made with the engine already held
  at its launch speed on a slipping clutch or stalled converter at full throttle — brake-boosting.
- **A lift braked the shaft instead of letting it coast.** Closing the throttle cooled the exhaust
  but left the compressor swallowing full airflow, so every upshift dumped all the boost. A throttle
  plate throttles *both* sides.

**And a harness artifact that looked exactly like a physics regression.** Calibration appeared to
blow out to 24% with the turbo cars far too slow and the kei car *faster*. `test41` matches each car
to its real power by monkey-patching `buildTorqueCurve`; the run now goes through `buildTorqueGrid`,
which was not patched, so every car silently ran the unscaled base engine. The kei getting quicker
was the tell — a lag model cannot make a car faster. Second time this session the harness, not the
model, was the thing that had fallen behind.

**Still failing:** `test40`'s frame comparison. The small frame is now only 0.13 s behind the large
one rather than 0.68 s ahead of where it was, and what remains between them is `turboChoke` — the
last fitted turbo number, docking the small frame 18% of its top end at 88% of choke flow, where
nothing is actually choking. Removing it makes the small frame win (6.17 s vs 6.30 s) but costs
calibration (3.19% → 3.44%) and puts the 2JZ back on the rev limiter. The shaft solver says the 2JZ
genuinely holds boost flat to redline, which is honest for a medium frame at 0.9 bar, so what should
roll its power off is VE falling up top — `vePeakRpm`, not turbo work. `turboChoke` stays until that
lands, at which point it should come out with nothing left to paper over.

### Conversion 4 of 5 — turbo, part 3: the shaft equation of motion

**Steady boost is now solved, not asserted.** `spool50` and `spoolWidth` are gone. Where a turbo
comes on song is where its turbine can finally supply what its compressor is drawing, which depends
on the wheel, the housing A/R, the exhaust energy available and the engine's own swallowing
capacity. `boostAvail` bisects the shaft power balance instead of reading a logistic curve in rpm.
Calibration **3.19% → 3.17%**, the best since before conversion 3.

Solving costs a few thousand iterations and `boostAvail` is called for every rpm of every torque
curve build, so it is sampled once per engine into a 26-point table and interpolated — the same
reason a compressor map is a map rather than a formula evaluated at runtime.

**The transient is the energy ODE**, replacing `spoolK`. `dω/dt = P/(J·ω)` is singular at rest — at
500 shaft rpm a 5 kW imbalance is 3×10⁶ rad/s² — so it integrates `E = ½Jω²`, giving `dE/dt = P_net`
and `ω = √(2E/J)` with no division by ω anywhere, sub-stepped at 2 ms inside the caller's step.

**A bug worth recording.** `shaftNetPower` returned the *wastegated* pressure ratio, and the search
in `steadyBoost` asks "can the shaft reach this PR". At the wastegate setting itself the capped value
can never exceed the target, so the search answered no for a frame that had 40 kW of turbine power
spare to make it. Now it reports the raw ratio for the search and the capped one for the result.
Same family as the earlier traps: a cap silently turning into an answer.

**The transient/steady disagreement is fixed, and it was two bugs stacked.**

The first was another **bootstrap failure**, the same shape as setting the turbine's expansion from
the compressor's pressure ratio. `stepBoost` took exhaust temperature from `state.map / mapMax` — so
a turbo at wide open throttle that has not spooled yet reads `1.0 / 3.5` and is treated as **29%
load**. Cold exhaust, weak turbine, never spools: the thing needed to start the process was being
derived from the process having already started. Load for exhaust *temperature* is how hard the
engine is working per unit of charge, which is **throttle**; total exhaust energy still scales with
mass flow, which is handled separately.

The second was in the harness. `test40` measured spool by setting rpm and stepping the integrator
without ever opening the throttle. That was harmless when spool was a logistic curve in rpm that
ignored throttle entirely, and became a real error once spool became the shaft power balance — a
turbo at part throttle genuinely does not spool. The test was measuring a part-throttle spool and
reporting it as lag.

Traced by instrumenting rather than guessing, after a first guess at the cause turned out to be
wrong: the fix appeared to change nothing because the *diagnostic script* had the same missing
throttle as the test. Steady and transient now agree, and spool time lengthens monotonically with
boost (0.05 → 0.07 → 0.08 → 0.09 → 0.10 s) as it should.

**What is still wrong:** those times are too short. The investigation predicted this — bearing drag
and heat soak into the housing are both missing, and both slow a real turbo. `test40` fails on
`2.5 bar should take far longer to build`, which is now a statement about absolute spool time rather
than about the solvers contradicting each other.

**Not yet done:** the acceleration solver still consumes a 1-D `tqAt(rpm)` curve, so `simulateAccel`
has no transient and `test40`'s third assertion — a small frame should be quicker off the line —
still fails. That needs the 2-D rpm × boost grid the investigation identified.

### Conversion 4 of 5 — turbo, part 2: the compressor efficiency island

**Efficiency is a position on the map, not a formula in pressure ratio.** A compressor has an
efficiency *island*: it peaks near 62% of choke flow and falls away in every direction — toward
surge if you starve it, toward choke if you shove too much through, and with pressure ratio as the
losses grow. The old form fell monotonically with PR by construction, which is not what a real map
does. Calibration **3.20% → 3.19%**.

**This is what makes `test40`'s over-flow penalty land.** Asking a small frame for too much now
collapses its efficiency, and the charge arrives hot — paid in physics rather than by a `choke`
constant. That failure is gone.

**And it corrected a test.** `test40` asserted compressor efficiency must fall monotonically with
boost. It does not: the kei car it sweeps starts at **32% of the frame's choke flow**, deep on the
surge side, so raising boost walks it *toward* the island centre before it walks off the far side —
0.56 → 0.69 → 0.76 → 0.76 → 0.69. The assertion encoded the old fitted formula. Replaced with what
must actually hold: efficiency ends below its peak, starts below its peak, and the charge gets
hotter the whole way. Changed because it was wrong, not to go green.

**Also derived: the choke ceiling.** A frame running out of breath up top is the compressor
choking — past the inducer's sonic limit it cannot pass more air however hard it is driven. Now a
hard airflow cap taken from the same inducer area as the flow rating, so the rating and the limit
cannot disagree.

**One thing tried and put back.** Removing `turboChoke` at the same time looked right — it is the
symptom the choke ceiling explains — but it put the 2JZ back on the rev limiter, because choke only
bites on a frame that actually chokes. What rolls off a turbo that *never* chokes is **boost taper**,
the compressor running out of shaft speed as the wastegate closes, and that needs the shaft power
balance still to come. `turboChoke` stays for that one job and is now labelled as the stand-in it is.
The lesson is the ordering: do not remove a fitted term until the mechanism replacing it exists.

**Still failing:** `test40`'s last assertion, that a small frame should be quicker off the line at
low boost. It spools at 1711 rpm against the large frame's 3554 and is still slower to 100, because
the acceleration solver uses **steady boost per rpm and models no transient at all** — the README
has listed that as a known limit from the start. It is the shaft equation of motion, and it is the
next piece.

### Conversion 4 of 5 — turbo, part 1: the turbine as a nozzle

The first piece of the turbo conversion, and the one that unlocks the rest. Chosen first because it
also repays conversion 3.

**A frame is a wheel.** Solving the old fitted flow ratings (32 / 55 / 82 lb/min) for the exducer
diameter that would produce them gives **54, 71 and 86 mm** — standard real wheel sizes (GT2554R,
GT2871R, GT3586R). Those fitted numbers were consistent with real hardware all along, so `flow` is
now derived from the wheel and lands on the old values to within 1%. `TURBO` gains `exd` and `ar`,
the turbine housing A/R that people agonise over when choosing a turbo and that has been buried
inside the lumped `spool50` until now.

**A turbine is a nozzle of fixed effective area.** Exhaust cannot leave the manifold except through
it, so manifold pressure rises until the flow fits: `ṁ = A·f(PR)`. Throat area comes straight from
the A/R definition — volute throat over the radius to its centroid, so `A = (A/R)·R_wheel`, with no
fudge factor. Getting this wrong makes spool impossible by construction, which is how the
investigation found it: setting the turbine's expansion equal to the *compressor's* pressure ratio
means no boost gives no expansion gives no power gives no boost, and a turbo could never start.

**And a wastegate, because without one the model is wrong by 3×.** Routing every gram of exhaust
through a fixed throat gave 3.5–4.5 bar of manifold pressure on the presets against a real 0.5–1.5.
Holding boost is the gate's whole job, and the steady state is a power balance: the turbine only has
to supply what the compressor draws, and the surplus goes around it. Solving `P_turbine(PR) =
P_compressor` puts the presets at **0.4–1.65 bar**, where real boosted engines measure.

**Residual gas is a pressure RATIO, not a back-pressure.** What decides how much burnt gas stays in
the clearance volume is `p_exhaust/p_intake`, not exhaust against atmosphere. The distinction does
not matter on an NA engine and matters enormously on a boosted one — the old absolute form would
have charged a turbo running 2 bar intake against 3 bar exhaust a **38% VE loss**. This is the
conversion-3 defect the investigation predicted: every turbo engine had been missing most of its
back-pressure, and the fix needed both halves.

**Result: real-car acceleration RMS 3.38% → 3.20%**, the first conversion to *improve* the
calibration rather than cost it. Top speed unchanged at 6.7%.

**One piece of authored content had to move.** The Grand Prix Pace challenge target was written when
turbo engines carried no manifold back-pressure; its reference build now clears 60.0 s by only
0.29 s, inside `test36`'s 0.5 s margin requirement. Target moved to 60.6 s. Challenge targets are
content and have to track the physics, which is exactly what that test exists to catch.

**Still to come in this conversion:** the compressor map proper (Euler tip-speed relation, the
efficiency island, choke), and the shaft equation of motion for real transient spool. `test40` stays
failing until those land — its over-flow penalty needs the efficiency island.

### Conversion 3 of 5 — gas dynamics, round 2

Two corrections, both omissions rather than tuning, and one experiment rejected on measurement.

- **Finite-aperture averaging.** Both waves were sampled at an *instant*, and neither valve event is
  one. The cylinder sees the wave averaged over the window the valve is open for, which multiplies
  it by `sinc(π·Δn/2)` — fast oscillations damp far more than slow ones, and it needs no new constant
  because the crank angles are already in the model. Leaving it out let the ram and scavenge troughs
  coincide at 6000 rpm on the ITB screamer and dig a 15% hole in the VE curve. Calibration 3.38% →
  **3.33%**.
- **Back-pressure belongs in the overlap driving pressure.** Flow across the overlap window is driven
  by the difference between the ports, and the exhaust port does not sit at atmosphere — it sits at
  atmosphere plus back-pressure, with the wave on top. Adding the steady term makes a big cam lope
  and refuse to pull cleanly, which is reversion, and it **fixed `test28`**. Calibration 3.33% →
  **3.78%**, still inside the 5% threshold. Worth noting the prediction that motivated it was wrong:
  I expected reversion to grow as revs fell, and it comes out flat, because `u ∝ √(bp) ∝ N` while
  the overlap window goes as `1/N`, so the product is rpm-independent. Right mechanism, wrong
  reasoning about its shape.

**Rejected: removing the base VE bell.** The plan said the fix for `vePeakRpm` was not a better bell
but no bell — a flat, port-flow-limited envelope with the Mach term providing the fall and wave
action providing the structure. Built and measured: real-car calibration **3.33% → 10.89%**, every
car slower. Removing the bell exposed two mechanisms the model does not have — low-rpm charge
short-circuiting through a big overlap, and whatever caps peak VE below the 1.2 clamp, which the
screamer now pins against from 7500 rpm up. The thesis still looks right; it needs those two first.
Reverted, and the base envelope it was replaced with (charge heating on the port walls, density
following `T0/(T0+ΔT)` with ΔT ∝ 1/N) is recorded here because it is the right starting point when
this is retried.

**Test movement.** `test28` fixed. `test38` now fails: on the *fast* circuit the late-apex racing
line costs 0.24 s where it gains 0.39–0.99 s on the other three. That is not a gas-dynamics defect —
it says the late-apex bias is not universally beneficial and the heuristic needs a per-corner test
rather than a blanket shift. `test40` still fails and is still turbo-map physics: a small frame
159% over-flowed at 2.5 bar is not being penalised.

### Conversion 3 of 5 — gas dynamics  *(round 1)*

Retires **five** fitted numbers at once — `CAM{peakShift, scav, lowLoss}` and `EXHAUST{topGain,
lowLoss}` — and replaces them with wave action derived from pipe geometry. `topGain` and `scav` had
to go together: they were two knobs describing one event, the rarefaction returning from the
collector during overlap, so deriving either alone would have left the other double-counting it.

**Two mechanisms, because they really are different.** The intake is a **Helmholtz resonator**
during induction — runner as neck, cylinder as volume — which is the textbook treatment with
published experimental backing. The exhaust is a **reflection comb**: the blowdown pulse leaves at
EVO, inverts off the collector, and must arrive back during overlap. Neither is a free bonus; both
swing *both ways*, so a badly matched pipe costs VE, which is why an over-sized header guts the
bottom end.

**New inputs.** Intake runner length (LONG / MEDIUM / SHORT / **VARIABLE** — a variable-length
manifold is just two lengths and a flap, which is all a DISA or VarioRam is). Exhaust grade is now
geometry rather than a bonus: bore-scaled primary diameter, system pipe **sized from the engine's
own flow**, and `sigma`, the path-length spread — literally what "equal-length header" claims.

**Derived and shown in the DESIGN panel:** cam overlap (from duration and LSA, and correctly
*negative* on a stock cam), runner length and where it rams, primary length with its tuning order,
and where it scavenges. A header is **cut for the engine**: the tuning relation is solved for length
at the lowest buildable order, which produces 525–768 mm primaries at k=3 — what people actually build.

**Also now derived:** exhaust gas temperature, from the energy balance rather than assumed. Petrol
743–828 °C, diesel 369 °C, rotary and two-stroke over 1150 °C — all correct, and it feeds back into
the speed of sound and so into where the header tunes. Late intake valve closing too: a 284° cam
closes 52° after BDC and traps ~13% less charge at low rpm, which is what `CAM.lowLoss` stood for and
why VVT exists (modelled as 45° of phaser authority moving IVC, not as a recovery percentage).

**Results.** Presets making peak power at the exact rev limiter: **2 → 0**, the target this
conversion existed to hit. Real-car acceleration RMS 2.66% → **3.38%** (threshold 5%), top speed
6.5% → **6.7%**. The acceleration regression is real and is not hidden: removing a fitted top-end
bonus costs absolute output on several presets, and their specs were chosen when that bonus existed.

**Unresolved, and left failing rather than papered over:** `test28` (a torque converter should hurt
a peaky engine) and `test40` (an over-flowed turbo frame should be penalised on a lap). Both encode
behaviour calibrated against the old fitted curve shape, and both now disagree with the derived one.
They are honest disagreements, not crashes, and weakening them to go green is exactly what this
project's rules forbid. Second round needed.

**What was tried and rejected.** Deriving the base VE peak from Taylor's Mach knee. It is the wrong
quantity — Z = 0.5 marks where the ports start to choke, which is near the *power* peak, not where
volumetric filling peaks. It put the peak at 0.92–0.97 of redline on every engine and blew the
calibration out to **54% RMS**. `vePeakRpm` stays asserted for now; what should replace it is not a
better bell but *no bell* — a rising, port-flow-limited envelope with the Mach term providing the
fall and wave action providing the structure.

### Investigation — the slip-ratio model, rotational inertia, and a defect in the shipped physics

Not a release entry: nothing here shipped. It is recorded because the experiment **found a real
defect in the model that is on `main`**, and because the failures are part of the finding.

Wiring up the slip-ratio curve — `μ = μ_peak·sin(C·atan(B·s))` with a wheel-speed state variable and
`I_eff = I_wheels + I_engine·ratio²` — moved the real-car 0–100 calibration from **2.66 % to 7.79 %
RMS**, past the suite's 5 % threshold, with every car coming out slow.

Isolating it: inertia alone costs **16.27 %**; inertia plus slip costs **7.78 %**; slip with engine
inertia set to literally zero still costs **5.37 %**. So the regression is about half slip dynamics
(≈2.7 pp) and half engine inertia (≈2.4 pp) — an early reading of "inertia dominates, the slip model
is fine" was wrong and is corrected here.

Three explanations were tested and all three are dead. **Driveline efficiency** would need 0.972 on
an RWD manual against a real 0.88–0.93. **Engine inertia** would need 0.03 kg·m² against a real
0.10–0.20. **Tyre grip** is backwards — cutting μ made it monotonically worse (7.22 → 9.08 → 14.10 %)
because the cars are already too slow.

What is left is the AWD WRX at **+5.9 %**, unmoved by a 15 % grip swing, which traction cannot
explain. Reflected engine inertia in first gear is ≈21.6 kg·m² ≈ 190 kg of apparent mass on 1470 kg —
**+13 % effective mass, ≈+5 % on 0–100.** The inertia term is right; **the shipped model has been
giving every car a free ~6 % by never charging rotational inertia**, and the 2.66 % calibration was
reached with that discount in place, against a hard grip clip that flatters the launch in the same
direction. Two compensating errors reading as accuracy.

Reverted rather than shipped. The fix is the **launch model** — the clutch as a torque-capacity limit
rather than a kinematic rpm hold — after which slip and inertia go in together and the set is
recalibrated once. Documented in full in the README, including two harness failures of the same kind
(monkey-patching a script-scope `const`, which silently produced identical sweep rows and was briefly
reported as a null result). **Rim material/weight** is deferred behind the same work.

### Changed — the conversion plan

Now **five** steps, not four. Exhaust is folded into a **gas dynamics** step rather than standing
alone: `EXHAUST{topGain, lowLoss}` and `CAM{scav}` are separate fitted knobs for one physical
effect — the pressure wave returning down the primary during overlap — so deriving either alone
leaves the other double-counting it. That same step covers intake ram and wave tuning, and is what
should finally retire `CAM{peakShift}` and roll off the two presets that still peak at the limiter.

Order: valvetrain ✅ → tyre ◐ → **gas dynamics** → turbo maps → combustion cycle.

### Conversion 2 of 5 — tyre  *(partly done)*

Unlike the valvetrain, this mostly **adds physics that was missing** rather than replacing fitted
coefficients — "identify the reason and add the functionality".

- **Rolling resistance now rises with speed.** Hysteresis grows with how fast the carcass is
  deformed, so Crr climbs roughly with v². Checked against Michelin passenger-tyre data (0.010 at
  80 km/h, 0.013 at 160, 0.016 at 200); a fixed Crr was understating resistance by 60% at the speeds
  a fast car actually reaches. Wired into the acceleration run, the top-speed scan and the lap solver.
  **Top-speed accuracy against real cars: RMS 9.3% → 6.5%, mean bias +5.3% → +1.8%.** The Hellcat —
  the one reference car that is genuinely neither governed nor rev-limited — went from +4.1% to +0.6%.
- **Tyre speed rating** is now a spec you choose (T/H/V/W/Y/(Y)), defaulted per compound, shown in
  the VEHICLE panel and flagged red when the build out-runs it. A drag radial rates below a touring
  tyre, so fitting one for the strip caps what the car can safely do.

**What it deliberately does not do.** The rating does *not* cap top speed. Four of the reference
cars stop short of their drag-limited speed because of a manufacturer governor, and capping them
with a tyre rating would produce the right number through the wrong mechanism — the residual +3 to
+8% on those four is a missing ECU limiter, not a missing tyre model.

**What was tried and rejected.** Deriving the rating from tyre dimensions. Sidewall height is the
obvious proxy and it is confidently wrong: it rates a McLaren F1's tall 315/45R17 at 170 km/h when
the real tyre is good for 390. Rating comes from the belt package and materials, which the model
does not represent, so it is an input rather than a bad derivation.

**Still to do in this conversion:** the slip-ratio curve, replacing the hard `min(driveF, mu·N)` grip
clip. It was built, and it is **parked** — see the investigation above. It needs a wheel-speed state
variable in the acceleration integrator, and it cannot land until the launch model is reworked.

### Conversion 1 of 5 — valvetrain and port flow  *(done)*

The head is now modelled from geometry and mechanics rather than assumed. New inputs: **valves per
cylinder** (2/4/5), **valve material** (steel/titanium), **valve springs** (stock/performance/race).
Everything else is derived:

- **Intake valve diameter** from a packing limit measurable off a real head (2-valve canted 0.50 of
  bore, 4-valve pent-roof 0.39 each, 5-valve 0.31). Total intake area over bore area comes out
  0.250 / 0.304 / 0.288 — five valves are *worse* than four, which is why the industry dropped them.
- **Valve mass** from its own geometry: a head disc that scales with diameter on a stem that does
  not, since stem length is set by deck height. Derived masses land inside real published bands
  from 31 mm to 52 mm — a 3× mass range. (Scaling the stem too, the obvious mistake, put a 52 mm
  valve at 227 g against a real 152 g and predicted a big V8 floating at 3800 rpm.)
- **Valve float** from the spring/inertia balance: `m_eff·accel·(L/2)·(2π/θ)²·ω² ≤ F_seat + k·L`.
  Shown in the DESIGN panel and flagged red when it falls below the redline, because then the
  engine cannot use the rev range it claims.
- **Port choking** from Taylor's inlet Mach index. The loss grows with the square of the excess
  over Z = 0.5, which is what a dynamic-pressure loss does; the constants reproduce Taylor's
  published curve and are not fitted to these engines.

**What it fixed.** Presets making peak power at the exact rev limiter: **4 → 2**. The 5.0 V8 Muscle
(peak 100% → 81% of redline) and the 6.2 S/C V8 (100% → 95%) are both big-bore two-valve engines,
and both now roll off for a stated reason — Z = 0.69 and 0.58 at the limiter. Real-car acceleration
calibration **unchanged at 2.66% RMS**.

**What it did not fix, and why.** The ITB Screamer and the V12 still peak at the limiter. Both are
well-designed four-valve high-revvers that genuinely are neither port-choked (Z = 0.54, 0.47) nor
float-limited (16124, 14686 rpm). Their peak position is set by intake wave tuning and charge
trapping — the next conversion. `test44` records this as a budget of 2 that cannot silently grow.

**Still fitted, marked for removal:** `CAM{peakShift, ampMul, loWiden, lowLoss, scav}` still shapes
the base VE bell curve. When wave tuning and trapping are derived, the powerband position will
emerge from cam duration instead of being asserted by `peakShift`.

The model currently reaches its accuracy partly through lumped coefficients that were tuned until
the outputs matched reality (`CAM{peakShift, ampMul, scav}`, `EXHAUST{topGain, lowLoss}`,
`TURBO{spool, choke, k, flow}`, `IMEP_K`, `DIFF_ASYM0`, `KVCAP`). v1.0 replaces them with quantities
derived from geometry and physical law, component by component, and accepts whatever accuracy that
produces rather than tuning toward a target.

Planned order: valvetrain and port flow → tyre → turbo maps → combustion cycle.

---

## [0.6] — 2026-08

The housekeeping release: versioning, a changelog, and the test suite finally under version control.

### Added
- **`CHANGELOG.md`** — this file.
- **Build numbers.** Every commit is stamped `v0.6 build N`, where N is the commit count.
  `node tools/stamp.mjs` writes it, `--check` proves a committed stamp matches its history.
- **`tests/` is now in the repository.** The entire suite — 18 files including the real-car
  acceleration calibration and the internal-consistency checks — had existed only on a scratch disk
  and would have been lost with the machine it sat on. It is the ground truth the v1.0 rewrite will
  be judged against, so it belongs in the repo.
- **`tests/run.mjs`** — a runner that reports by **exit code**. The ad-hoc runner it replaces
  grepped stdout for "FAIL", which meant a test that *crashed* was reported as passing; `test42` sat
  broken and green that way.
- **`tests/aero.mjs`** — the first check of the drag model against real cars. Nothing previously
  tested it: the existing calibration only covers 0–100, which is traction-limited and says nothing
  about aerodynamics.

### Fixed
- **The lap solver and the acceleration run now have a rev limiter.** `bestGear()` skipped every
  gear that would over-rev except the top one, then returned torque clamped to the redline — so past
  its gearing's own ceiling a car kept making peak wheel torque and only aerodynamic drag stopped
  it. A 6.2 supercharged V8 coupe geared for 259 km/h was reaching **372 km/h on the Nordschleife —
  9184 rpm, 43% past its 6400 redline** — and its 1000 m trap read 366 km/h.

  This gave backwards tuning advice, not merely a wrong number: with no limiter, short gearing cost
  nothing on a straight, so the app rated the *shortest* final drive as the fastest way round the
  Nordschleife. Corrected, short gearing costs 17 s and the optimum moves to a tall setting.

  Cars whose top speed is drag-limited rather than rev-limited are bit-identical, and the real-car
  calibration is unchanged at 2.66% RMS.

### Changed
- **Greek translation paused** while the physics core is rewritten. New strings must still be
  wrapped in `tr()`; the untranslated backlog is counted, printed on every test run, and held to a
  budget that has to be raised deliberately. The debt stays visible instead of being hidden by
  deleting the check.

### Known limits (documented, not hidden)
- No engine braking above the limiter, so a steep descent can carry a car a km/h or so past it.
- Power peaks *exactly at the rev limiter* on four presets (2.0 ITB Screamer, 5.0 V8 Muscle,
  6.2 S/C V8, 6.5 V12) — `computeVE`'s valve-float term only bites *above* the redline, so those
  curves never roll off inside their own rev range. Real engines peak at 90–98% of redline. Fixing
  this properly needs a valvetrain model, which is the first v1.0 conversion.
- Turbo lag does not reach the performance numbers; both solvers use steady boost per rpm.
- The racing line does not know what car is driving it.

---

## [0.5] — earlier

Everything below shipped under the v0.5 label, which was set at PR #9 and never moved again through
28 further merged pull requests. The list is grouped by area rather than by release.

### Vehicle and track
- Vehicle layer: chassis, drivetrain, tyres, aero → acceleration and top speed (#22), corrected so
  performance no longer depended on live driving state (#23).
- Brakes and suspension, with 100–0 and 0–200–0 tests (#24).
- Chassis-linked factory fitment, and the gearing number explained (#29).
- Launch clutch model and top-speed search fixed — peaky engines were being penalised (#30).
- Gearbox types: manual, sequential, DCT, torque-converter automatic (#31).
- Differentials: open, viscous LSD, clutch-plate LSD, spool (#32).
- Test track: three circuits, a lap solver, a limit-coloured map (#33).
- Racing-line optimisation and a hot-lap report with corner speed traps (#35).
- Track elevation, GPX circuit import, and the Nordschleife (#36).
- Track objectives, with lap time on the scorecard (#37).

### Engine
- Configurable engine designer (#2) — the v0.3 milestone.
- Cooling subsystem (#3).
- Turbo spool and lag, plus a power-calibration and curve-shape fix (#4).
- Dynamic throttle and load driveline — drive it, rather than setting rpm (#5).
- Cam profiles and VVT (#6).
- Fuel types: pump and race gas, E85, methanol (#7).
- Electrical subsystem: alternator, battery, ignition misfire (#8).
- Auto ignition timing, induction and metering systems (#9) — the v0.5 milestone.
- Reliability and wear simulation (#10).
- Load model fixed (a torque-valley trap), slow deceleration fixed, DFCO added (#13).
- Engine presets, a 1.6 sport default, cylinder dropdown (#15).
- Forced-induction depth: turbo configurations, supercharger types, anti-lag, nitrous (#16).
- Emissions and sound: CO/HC/NOx, catalytic converter, engine-note character (#17).
- New engine types: diesel, two-stroke, rotary (#20).
- Diesel realism: cylinder-pressure cap and top-end falloff, 6.6 preset retuned (#25).
- AUTO fuel mixture — a 3D ECU AFR map over load × rpm (#26), made the default with a live
  visualiser (#27), then made editable cell by cell (#28).

### Interface
- Offline support, PWA, sound, thermal model, repo hygiene (#1).
- Engine view reworked into a test-bench schematic; WEAR toggle and full-screen (#11).
- Scoring, dyno-pull logging, file save/open/share (#12).
- Intercooler sizes, in-app Guide and Options tabs, tab-aware side panel (#18).
- Strategy layer: parts cost, budget, reliability, objective challenges (#19).
- Portrait-friendly responsive layout and Greek localisation (#21).
- Printable dyno report: PNG and library-free PDF export (#34).

[Unreleased]: https://github.com/ipaliog-a11y/Engine_simulator/compare/main...HEAD
[0.6]: https://github.com/ipaliog-a11y/Engine_simulator/releases/tag/v0.6
