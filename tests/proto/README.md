# Prototypes — parked work, not part of the suite

Nothing in here is run by `tests/run.mjs`. It only walks `tests/*.mjs`, and these are one directory
down on purpose: they are **models that have not shipped**, kept because throwing them away would
mean rebuilding them from the write-up when the work resumes.

Same reasoning that put `tests/` itself under version control — a thing that only exists on a scratch
disk is one machine away from not existing.

## `slip.mjs` — the slip-ratio tyre model

Standalone, no browser, no `index.html`: `node tests/proto/slip.mjs`.

Replaces the shipped hard grip clip `F = min(driveF, μ·N)` with force transmitted *through* slip:

```
s  = (ωr − v)/v                              slip ratio, a new state variable
μ  = μ_peak · sin(C · atan(B·s))             Pacejka-lite, B = tan(π/2C)/s_opt puts the peak at s_opt
I_eff · dω/dt = T_axle − F·r                 driven wheels get their own equation of motion
I_eff = I_wheels + I_engine · ratio²         which is why wheelspin is violent in first and tame in fourth
```

`C = 1.4` gives a full-slide plateau at 0.81 of peak; measured tyres sit at 0.75–0.85.

The three things it prints are the three things that had to be checked before touching the app:

1. **Numerical stability.** The slip dynamics are much stiffer than the vehicle dynamics, so the
   worry was that it would need a smaller step than the integrator's existing `dt = 0.005 s`. It
   does not — 0.005/1 and 0.0005/1 agree to 8 ms.
2. **Does gearing finally matter?** With a hard clip a traction-limited car's 0–100 is *identical*
   at every final drive, because the clip binds for the whole run. Here too much torque spins the
   tyres onto the falling branch of the curve and loses time.
3. **Tyre character.** `s_opt` is a real compound property, and a slick peaking early and sharply
   behaves differently from a drag radial that likes to be spun.

**Why it is parked.** Wired into the app it moved the real-car calibration from 2.66 % to 7.79 %
RMS. The investigation is written up in the README (*The inertia investigation*): about half of that
is the slip dynamics and about half is rotational inertia, which the shipped model never charged at
all. Both are correct physics, both make the car slower, and the model was calibrated with neither.
The blocker is the **launch model** — the clutch is currently a kinematic rpm hold rather than a
torque-capacity limit — and until that is reworked there is nothing sensible for the slip curve to
receive at `t = 0`. Then slip, inertia and the launch go in together and the whole set is
recalibrated once.

**Do not resurrect the browser harnesses from that investigation.** They patched the *use site* of
`I_ENGINE` inside copies of `index.html` that lived on a scratch disk, and they hard-code absolute
paths to those copies. The numbers they produced are in the write-up; the copies are gone. Note the
trap they were built to avoid: monkey-patching a script-scope `const` from `page.evaluate` does
nothing at all and silently yields identical rows for every value in a sweep.

## `housing.mjs` — turbine housing sizing

**Not standalone**, unlike the other two: `node tests/proto/housing.mjs` drives the shipped model
through the browser, because the question is what the *app* does, not what a clean-room model would.

`engine.turbineArea = (A/R) × R_wheel`, and A/R comes from the frame size class alone — small 0.42,
medium 0.64, large 0.86. **Nothing about the engine enters.** A 2.0 four and a 6.6 V8 fitted with the
same size class get the same turbine throat, which is not how anyone matches a turbo. The measured
consequence: exhaust flow per mm² of throat spans **202 to 799 g/s** across the presets — a 4×
spread, where a matched set would be roughly constant — and boost thresholds run up to **4275 rpm
late** (the 13B lights at 7275 rpm against a real ~3000). RMS error ~1940 rpm.

Sizing the housing instead to the **tightest that the engine tolerates at rated power** — which is
what a real builder does — takes that to **~700 rpm**, with no per-frame table. And petrol and diesel
split cleanly: petrol is best at a back-pressure ratio of 1.8, diesel is still improving past 3.0.

That split must **not** be asserted as a per-type constant. What stops a petrol engine going tighter
is **knock**: back-pressure raises the trapped residual fraction, and hot residual brings knock on. A
diesel has no spark-knock limit at all, which is precisely why real turbodiesel housings are tight
and why they make boost at 1600 rpm. The split should fall out of the knock model.

**Why it is parked.** Two prerequisites, both found by measurement:

1. ✅ **Pumping work** — `pumpFrictionMEP` charged only for intake depression against atmosphere, i.e.
   the pumping loop with `p_exhaust` assumed to be 1 bar. A tight housing therefore cost *nothing* at
   the top end, so nothing pushed back on tightening it. **Shipped in build 70.**
2. ⬜ **Residual-gas knock** — `knockAt()` carries boost, compression, IAT, coolant, rpm, timing,
   lambda, octane, DI and nitrous, and **no residual term**. Conversion 3 already computes residual
   fraction from `(p_exh/p_int)^(1/γ)` for VE, but it never reaches knock, so the petrol limit does
   not exist. This is the next step.

**Anchor quality — read before tuning anything to these numbers.** Solid and published: VW 2.0 TDI
~1750, Duramax 1600, Focus RS 2.5T ~2000, kei turbos ~2800–3000. Interpretation-dependent, weight
lightly: the 2JZ 3600 (a big single behaves nothing like the factory sequential) and the 13B 3000
(primary rotor only). Tuning to a number someone invented is the trap `test46`'s bands already fell
into once.

**Re-measured in build 151 — not built.** Since this was parked, the throat moved to the volute centroid
(build 133), the compressor's island follows its speed line (133), pulse energy is in (90), turbo
manifolds are packaging-short (91), and real presets carry the makers' wheels (133, 136). On the archetypes
above, against the same anchors, boost thresholds are now **775 rpm RMS** (it was ~1940; the back-pressure
sizing proposed here reached ~700), with errors either side: kei 1925 (2800), 1.5 eco 1750 (1600), hot-hatch
2650 (1900), I5 2375 (2000), 2JZ 2125 (3600, the anchor flagged above), 2.0 TDI 1300 (1800), 6.6 V8 800 (1600),
13B 2500 (3000). Across the real turbo presets exhaust flow per mm² of throat at rated power spans 1.9×
(340-653 g/s per 1000 mm²), and where the maker quotes a torque plateau ("350 Nm from 1500 rpm", the
start of full boost) the 90%-boost point is ~620 rpm RMS from it; the late two are the RS3 and the
EcoBoost, whose compressor wheels are not published. Exhaust over intake pressure at rated power is ~1.1
on most presets (real petrol turbos ~1.5-2): the turbines are generous, so sizing to a back-pressure
target would make them spool earlier still. Matching the housing would now be fitting to anchors.

## `pulse.mjs` — exhaust pulse energy at the turbine

Standalone: `node tests/proto/pulse.mjs`. The nozzle functions are copied verbatim from the app so
the comparison is against the real thing.

**Why it was written.** `housing.mjs` ends on a measurement: turbine housing sizing worked as
designed and was reverted anyway, because it only reached real spool points if allowed to give away
25% of rated power, and because high-boost builds went lag-dominated. Both said the turbine does not
make enough power at low flow, and the suspected reason was that it is modelled as a fixed-area
nozzle fed by the **mean** manifold pressure, while a real one is fed by each cylinder's blowdown
pulse — mass arriving *when the pressure is high*. Averaging that correlation away is exactly what a
mean-pressure model does.

**The model, and it needs no new constant.** The duty cycle falls out of cam geometry the app
already carries. The app defines overlap as `dur − 2·lsa`, which fixes the convention: the exhaust
lobe centre sits `lsa` degrees BTDC, so the valve cracks at `lsa + dur/2` BTDC and BDC is 180 BTDC
on that stroke — giving a blowdown angle of `(lsa + dur/2) − 180`, which is 44° on a stock cam and
68° on a race one. Real numbers. The pressure swing is then a volume ratio: what the blowdown
delivers, against the manifold volume one scroll sees. That ratio is also what separates **pulse**
turbocharging (short, small, often divided runners) from **constant-pressure** turbocharging (a big
plenum), which is why a twin-scroll housing is worth having — something the app does not currently
reward at all.

**The result is real, and negative.** Pulse energy is worth **+20% to +45%** of turbine work at the
boost threshold, concentrated at low rpm and fading to nothing by 6000 — the right size, in the
right place, with the right rpm shape. It still does **not** close the diesel gap:

| engine | compressor needs | mean-pressure | with pulse |
|---|---|---|---|
| 2.0 TDI @ 1750 | 5.5 kW | 1.7 | **2.1** — still 2.6× short |
| 2.0 petrol @ 1900 | 5.9 kW | 3.9 | **4.6** |
| 2.0 twin-scroll @ 1700 | 5.2 kW | 2.9 | **4.2** |

**So the diesel spool gap is a VGT gap, not a pulse gap.** Shrinking the diesel's effective throat
at 1750 rpm reaches the compressor's 5.5 kW at **0.45× open area**, and a real variable-geometry
turbine closes its vanes to roughly 30–50% at low speed. That is the one piece of hardware every
modern turbodiesel has and this model has no concept of, and it is why a 2.0 TDI makes full boost at
1750 rpm where a fixed-geometry petrol turbo of similar size does not.

**Two bugs worth recording**, because both produced plausible-looking output. The pressure swing was
first applied to the gauge excess `(PR − 1)` rather than to absolute manifold pressure, which made a
27% swing worth 1% of work. And `turbineWork` omitted the `T3` factor, so every turbine read 2 watts
instead of 2 kilowatts and every verdict read "neither" — it cancels in the gain *ratio*, which is
why the ratio table looked sane while the power table was nonsense. A plausible column is not a
checked one.

**Status.** Not wired in. Pulse energy is worth adding on its own merits — it is real, derived, and
rewards divided manifolds — but it is not the fix for diesel spool, and shipping it as if it were
would have been the wrong conclusion drawn from a right measurement.

**Status (build 90): wired in, reformulated.** The ±A swing about the mean pressure was replaced by
two states defined by mass (blowdown share f_b in duty φ, the rest in 1 − φ), because the low state
clamped at ambient invented mass: a kei read 0.19 bar at 1500 rpm and 0.12 at 2000. `BLOWDOWN_MASS`
is derived from the cylinder at EVO instead of assumed, and the amplitude became the share of the
pulse that survives the manifold volume, V_b/(V_b + V_m). Guarded by `tests/test54.mjs`.

**Housing sizing, second attempt (build 89, parked at `housing-sizing-2.diff`).** Sized per engine by
the minimum in-gear sweep time ∫dN/T(N): no tolerance constant. It improved test41 (3.39% → 3.06%),
but sized housings landed at poor compromises, because the turbine could not spool early and breathe
at the top at the same time: the 2.5 I5 still chose the loosest housing, peaks sat on the boost
threshold, and the 2JZ and the V8 diesel peaked at the limiter. Average power as the objective was
worse still, buying top end with spool. Redo on top of pulse energy.

**Housing sizing, third attempt (build 91) — concluded: a choice, not a derivation.** Rerun on top of
pulse energy, it still chose loose housings for the high-boost petrols. The diagnosis was the
manifold: turbo engines carried tuned NA headers (550–780 mm, 1.3–5.5 L), which smooth away the
pulse. Making turbo manifolds packaging-short fixed spool by itself (kei 3875 → 2950 rpm, real
2800–3000). With that in, sweep-time sizing still put the GTI at 287 hp against 220. The real GTI
is not limited by physics there; VW chose a small, tight turbine for response. So the objective IS
the design intent, and the housing became a user option (TIGHT/STOCK/LOOSE per frame) instead of a
derived value.

## VGT — shipped, and what it uncovered

`pulse.mjs` ends on a prediction: the diesel spool gap is a VGT gap, and 0.45× throat closes it.
That is now in the app as **TURBINE → VARIABLE GEOMETRY**, covered by `tests/test49.mjs`. The
prediction held — a 2.0 diesel goes from full boost at 2575 rpm to **1800 rpm**, its torque peak
from 2700 to 1900, and the worst 100-rpm torque step from 21.2% to 16%. Nothing was fitted: the
sweep (2.8–3.1:1) and the top-end blockage (8–13%) both come out of vane count, vane thickness and
the two end-stop angles, and the petrol/diesel split comes out of `exhaustGasT` and `residualKnock`
rather than out of an `if (ci)`.

**Two limits recorded in the code rather than papered over.** The throat convention is
`A/R × R_wheel`, where `R` should be the radius to the volute throat *centroid* — roughly 1.5–1.8×
further out — so every turbine here is smaller than the frame it names. That is why the VGT still
needs a wastegate at the open end, where a properly sized real ring swallows the lot, and why the
vanes reach their open stop by about 2250 rpm instead of modulating across the range. Correcting
the convention recalibrates the whole turbo side, so it is a change of its own.

## `simulateAccel` upshifts at the redline — and it is the biggest calibration defect left

Found while checking that VGT had not made anything worse. It had: the Golf TDI's 0–100 went
13.29 s → 13.75 s *while the engine got strictly better* (1500 rpm 206→266 Nm, 2000 rpm 230→338 Nm,
−5% at 4500). A better engine cannot be a slower car, so the car model was the suspect.

`simulateAccel` upshifts on one condition: `rpm >= redline` (index.html, in the step loop). Every
gear, every car, every engine. For a 4800 rpm diesel whose torque peaks at 1900 and has collapsed to
96 Nm by 4500, that is the worst possible shift point, and the run spends nearly all its time in the
part of the curve a VGT makes *worse*.

Measured by using the redline as a proxy for the shift point (which also truncates the curve, so the
test is conservative):

| shift at | peak power | 0–100 |
|---|---|---|
| 3400 rpm | 130 hp | 10.13 s |
| 3800 rpm | 134 hp | **9.80 s** |
| 4200 rpm | 139 hp | 10.45 s |
| 4800 rpm (current) | 146 hp | **13.75 s** |

Real car: 150 hp, 8.6 s. **Shifting 1000 rpm earlier is worth 3.95 s while giving up 12 hp** — a car
with 8% less power is 29% quicker to 100 km/h, which no real car does. Roughly four of the TDI's
5.1 s error is the shift rule, not the engine.

A second symptom confirms it: 0–100 is non-monotonic in final drive with a ±1.4 s sawtooth
(fd 3.0 → 13.97 s, 3.5 → 12.91, 4.0 → 14.36, 4.4 → 13.39, 4.8 → 13.49). A time that jumps around
like that with gearing is a quantisation artefact — whether the gear spacing happens to force an
extra shift just before the 100 km/h mark.

**The fix needs no constant.** The optimal upshift point is where the next gear's wheel torque
equals the current gear's: `tq(rpm) × ratio[g] = tq(rpm × ratio[g+1]/ratio[g]) × ratio[g+1]`. Pure
geometry over a curve the model already has, and it is what every real driver and every real
automatic does. It will move every 0–100, every quarter mile and every lap time in the suite, so it
is its own change — but on this evidence it is the largest single source of error left in the
vehicle model.

**Status (build 81): fixed.** `simulateAccel` now shifts at that crossover. TDI 13.75 s → 9.03 s,
test48 0–100 RMS 24.4% → 10.2%, and the sawtooth is down to one shift's worth. Guarded by
`tests/test50.mjs`.

## `vePeakRpm`, attempt 3 — the bell is doing two jobs (build 82, measured, nothing changed)

Re-measured after derived gearing (74) and crossover shifting (81), since both changed how torque
shape turns into 0–100. The experiment was simply to remove the bell, nothing else, from:

| | with bell | no bell anywhere | no bell, NA only |
|---|---|---|---|
| test41 (shape, power-matched) | **4.02%** | 9.51% | 4.02% (unchanged) |
| test48 power RMS | 15.8% | 14.2% | **11.7%** |
| test48 0–100, vehicle only | 7.8% | 10.4% | **6.7%** |
| test47 NA presets over BMEP band | 1 | — | 2 |

**test41's reference set is entirely turbocharged** (GTI, Type R, Supra, M2, STI, Alto), and every
one slows without the bell. Above `vePeakRpm` the bell is quietly supplying the turbo's top-end
taper: without it a wastegated frame holds target to the limiter, torque stays flat and peak power
lands on the redline. So the bell does two jobs, NA breathing shape and turbo boost taper, and that
is why both earlier attempts failed on the calibration.

For NA engines alone, removing it is right for the high-revvers and wrong for the rest. S54
−22% → −3%, S2000 −30% → −16%, but MX-5 −1% → +14% and the V12 preset 867 hp (14.05 bar BMEP,
133 hp/L, against a real 6.5 V12's ~750). A high-rpm loss mechanism is missing. This is the
"whatever caps peak VE" already named above.

Two more things found in the decomposition:
- `scavengeGain` charges race-cam engines **−15% to −19% at every rpm**, including 8000, where real
  race-cam overlap helps. The steady term is the cycle-MEAN back-pressure, mostly the cat. At the
  overlap instant the piston is at TDC, so the cylinder's own primary flow is near zero. The cat
  and system pipe carry the other cylinders' merged flow, though, so the steady term does not
  simply vanish. Needs its own measurement.
- test48's LS3 runs the STOCK spring (250 N seat). A real LS3 is ~400 N, and with the stock spring
  the model floats its valves from 5500 rpm, inside the real 6600 rpm redline (VE ×0.66 at 6500).
  That is a test-input fidelity issue, like the TDI's VGT.

### Attempt 3, continued — built, measured, parked (patch: `vebell-attempt3.diff`)

The patch does three things:
1. **Fixes a real geometry bug.** `trappedFraction` put the intake lobe centre at 90° ATDC while
   `overlapDeg` (`dur − 2·lsa`) puts it at LSA. So every intake closed 16–24° early (stock at 20°
   ABDC instead of 44°; a real B6 MX-5 closes at 51°). VVT also moved IVC by half its authority.
2. **Removes the bell for non-turbo, non-diesel, poppet-valve engines.**
3. **Corrects test48's factory inputs** (no VVT on the 1989 MX-5 or the LS3; LS3 on its real
   ~400 N spring), and grounds test47's NA BMEP ceiling at 15 bar (S54 14.1, 458 15.1).

Measured: test48 power RMS 15.8% → 11.4%, 0–100 car-only 7.8% → 6.8%, test41 3.97% (unchanged).

**Why it is parked.** test44 and test46 fail: the 1.6 Sport, ITB screamer, supercharged V8 and V12
presets (and the S2000 and S54 in test48) make peak power AT the limiter. The cause is precise: the
intake ram term is still rising at the redline, because every runner's main Helmholtz resonance
(nH = 1) lands at or just past it. Runner lengths are fixed (~400 mm including the port), not sized
to the engine, and for these engines that puts nH = 1 at 7200, 8840, 6570 and 9190 rpm against
redlines of 7200, 8800, 6400 and 8500. With the bell gone, nothing rolls the top end off. Two
further things to check when this resumes: (a) as nH falls below 0.5 the Helmholtz term's cosine
turns POSITIVE again, which is unphysical far above tuning (a column driven above its natural
frequency cannot ram; its inertia costs filling); (b) whether runner length should follow the
designer's target rpm, the way the final drive now follows the engine.

### Attempt 3 — landed (build 84)

The runner was not the problem; the TUNING CONDITION was. The model put the main ram peak where one
Helmholtz oscillation fits in the intake event (f_H/(N/60) = 360/dur), and Engelman's experiments
put it near 2. With `ENGELMAN_K = 2.0` no preset peaks on the limiter, and the bell can come off
turbos too: test41 4.02% → 3.34%, test48 power 15.8% → 8.6%. Note (b) above, sizing runners to a
target rpm, is not needed and was not done; runner lengths stay absolute geometry. `vebell-attempt3.diff`
is removed because it is applied.
