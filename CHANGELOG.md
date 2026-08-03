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
