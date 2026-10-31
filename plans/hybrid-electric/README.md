# Plan: electric, then hybrids

**Status:** steps 0-2 done: battery electric shipped as **v0.7** (builds 176-184). Step 3, hybrids, under way. Written at build 175.

Should hybrid and electric cars become a new game built from this one, or live in this one? This
document answers that, lists what would have to change, and gives an order to build it in.

---

## The decision: same game, new powertrain types

Electric and hybrid go into this repository as **powertrain types**, alongside petrol, diesel,
2-stroke and rotary. Not a fork.

### Why not a separate game

1. **Most of the simulator already is the other game.** Roughly half of `index.html` does not care
   what turns the wheels: the vehicle model, tyres (slip, temperature, camber), brakes and their
   heat, aero, differentials, the lap simulator, the race simulator with racecraft and drivers, the
   real circuits, the Greek interface, the PWA, and the validation suite against real cars. An
   electric game needs every one of those. A fork means every tyre or brake fix lands twice, and the
   two copies drift apart within a few builds.

2. **A hybrid needs the combustion model.** A hybrid is a combustion engine plus a motor plus a
   battery. Putting electric in a new game means copying the engine model across for hybrids anyway,
   which is the two-copies problem again.

3. **The seam already exists.** The 0–100 run, the lap and the race do not call the engine physics
   directly. They read a torque surface built once per engine — `lapTorqueGrid()` /
   `gridTorque(g, rpm, boost)` and a 1-D `tqAt(rpm)` from `buildTorqueCurve()` — and, for the race,
   a fuel map over speed and load from `steadyBSFC()`. That fuel map is exactly what a hybrid's
   energy manager needs to decide when the engine should run and when the motor should.

4. **It fits the v1.0 principle.** An electric drive is simpler and better documented than a
   combustion engine: constant torque to a base speed, constant power above it, copper and iron
   losses, a battery with internal resistance. It can be *derived, not fitted* from the first
   build, which is the rule the rest of the model is being converted to.

### When a new game would be right

Only if the product itself changes — an electric-motor and battery-chemistry *designer* as deep as
the engine designer, under another name, for a different player. Even then the right shape is one
shared core with two front ends, not a fork. "Pixel Engine Sim" can hold a motor.

---

## What changes, area by area

| area | today | with electric and hybrid |
|---|---|---|
| **Engine → wheels** | `tqAt` / `gridTorque` read straight off the global `engine` | One **powertrain interface**: force available at this road speed and state, energy drawn per step. The combustion engine becomes one implementation, with identical numbers. |
| **Gearbox** | `GEARBOX` = manual, sequential, DCT, torque-converter auto; shift at the torque crossover | Add a **single fixed reduction** for electric. Ratio spacing and crossover shifting stay for combustion and hybrid. |
| **Brakes** | Friction brakes, heat and fade, split between axles (build 150) | **Regenerative braking** on the driven axle(s), limited by motor power and battery charge acceptance; friction brakes take the rest. Less heat, less fade. |
| **Fuel → energy** | Fuel flow, BSFC, race fuel load and strategy | Battery **state of charge**, power limits, **thermal derating** of battery and motor. The race fuel strategy becomes an energy strategy (F1 / LMP-style deployment). |
| **Mass** | `engineMass()` + body | Motor, inverter and battery mass by capacity. A battery is heavy and low; that feeds the existing axle balance and weight transfer. |
| **Sound** | GAS — an engine simulated as gas (builds 156–160), combustion only | A separate **motor / inverter whine** (switching frequency, gear mesh). The combustion sound stays for hybrids with the engine running. |
| **Designer UI** | ENGINE tab, fields enabled and disabled by engine type | A **MOTOR / BATTERY** panel shown for electric and hybrid, the same way the type switch already disables cam and VVT for 2-strokes and rotaries. |
| **Cost / challenges** | `computeCost()`, challenge metrics | Battery cost per kWh, motor cost per kW; range and efficiency as challenge metrics. |

### Where the coupling actually is

The lap, race and acceleration code (roughly `buildVehicle` through `simulateRace`) reads the
global `engine` directly — mostly `engine.score` (the cache key), `engine.redline`, `engine.ci`,
`engine.afrMode`, `engine.stoichAFR`, `engine.maxBoost`, `engine.idleRpmEff`. That is a short list,
which is good news: those are the reads the powertrain interface has to absorb. Redline and idle
become "speed limits of the prime mover"; boost and AFR become implementation details of the
combustion powertrain; `score` becomes the powertrain's own cache key.

---

## The real risk: the file size

`index.html` is about 1.6 MB and 16,000 lines. The project README says the single file is "worth
revisiting past ~600 KB". It is now well past that, and a second and third powertrain will push it
further.

The reasons for one file still hold — opens from `file://`, no server, no dependencies, one artefact
to share. They can be kept without one *source* file: a small build script that concatenates
`src/*.js` back into a single `index.html`. The shipped artefact stays identical in kind; only the
editing changes. Deciding this **before** step 1 is cheaper than after, because step 1 is the point
where a `powertrain/` folder starts to pay.

**Decided: split.** The sources move into separate files; a build script joins them into one
`index.html`, and the joined file is **committed**, so GitHub Pages, the tests (which load
`index.html` from `file://`) and `tools/stamp.mjs` keep working unchanged. A `--check` mode fails when
the committed `index.html` does not match the sources. This is step 0 below.

---

## Build order

Each step is one PR, validated the way the rest of the model is: against `tests/test41.mjs`
(0–100 vs real cars), `aero.mjs` (top speed) and `tests/test43.mjs` (the two simulators agree).

**Decided: electric first, hybrids after.** A hybrid is the combustion engine plus the electric
drive, so it is built from parts that already exist and are already validated: the motor, battery,
regen and thermal model of step 2, and the engine of today. Building hybrids first would mean
designing the electric half and the energy manager at the same time, with no pure electric car to
check the electric half against.

### 0. Split the source — no change in the shipped file (✅ build 176)

- Move the contents of `index.html` into separate source files along the seams already marked in it
  (styles, markup, physics, vehicle and lap, race, sound, UI, translations).
- A build script joins them back into `index.html`; `--check` verifies the committed file matches.
- **Acceptance:** the joined `index.html` is byte-identical to the one it replaced (apart from the
  build stamp), and the full test suite passes.

### 1. The powertrain interface — no change in results (✅ build 177)

- Define the interface: `force(v, demand, st)`, `step(dt, st)`, `energyUsed`, limits.
- Wrap the existing engine, torque grid and gearbox behind it as the combustion powertrain.
- Replace the direct `engine.*` reads in the lap, race and acceleration code with interface calls.
- **Acceptance:** every existing test passes with bit-identical lap times, 0–100 and top speeds.
  A refactor that moves a number is not a refactor.

### 2. Battery electric (✅ v0.7, builds 178-184)

The design fields, their trade-offs and the physics behind them are in
[motor-design.md](motor-design.md).

- **Motor:** peak torque to base speed, peak power above it, a maximum speed; efficiency from
  copper loss (∝ torque²) and iron loss (∝ speed), so the efficiency map is derived, not drawn.
- **Battery:** capacity (kWh), open-circuit voltage against state of charge, internal resistance —
  power available falls as charge falls and as current rises.
- **Driveline:** single fixed reduction; no shifts, no launch rpm search.
- **Regen:** on the driven axles, capped by motor power and charge acceptance, blended with friction
  brakes through the existing axle split.
- **Thermal:** a lumped battery and motor temperature; derating when hot. This is what makes a
  long track different from a 0–100.
- **Validation:** a new real-world test, in the style of the brakes / tyres / fuel builds
  (144–146): 0–100 and top speed of the three Teslas (decision 10) with power, mass and gearing
  matched, plus consumption in Wh/km against published figures.

Step 2 lands in parts, one PR each:

| part | what | state |
|---|---|---|
| 2.1 | **The physics**: motor (permanent magnet), inverter (IGBT / SiC) and battery (four chemistries by year) as pure functions in `src/js/electric.js`; checked against the measured Model 3 rear motor and ORNL's 2012 Leaf (`tests/test96.mjs`). Nothing calls it yet. | ✅ build 178 |
| 2.2 | **The design and the bench**: ELECTRIC in the engine-type dropdown, the MOTOR / BATTERY fields, the dyno's torque, power and efficiency curves with the temperatures, the powertrain type in saves, and the electric `powertrain()`. | ✅ build 179 |
| 2.3 | **The car**: single fixed reduction, regenerative braking through the axle split, motor and battery heat over a lap. | ✅ build 180 |
| 2.4 | **The race**: the pack's usable energy in the tank's place, the pace grid over battery power, every point of a lap priced in kWh (shaft, motor and inverter, cells), an energy manager that plans the power to last and learns lap by lap, the pack and motor heat carried through the race, OUT OF CHARGE; no charging in the pit lane (`src/js/electric-race.js`, `tests/test99.mjs`). | ✅ build 181 |
| 2.5a | **The induction motor**: MOTOR TYPE, a copper-cage rotor magnetised by the stator's own current, derived from the build like the magnet motor; checked against the Tesla Model S 60's published geometry and figures (`tests/test100.mjs`). | ✅ build 182 |
| 2.5b | **The three Teslas**: presets and the real-world test (0-100, top speed), with more than one motor per car (front and rear axles); the Model 3 / Y front induction unit checked against 219 Nm, 137 kW at 6380 rpm on 320 V (`src/js/electric-presets.js`, `tests/test101.mjs`). | ✅ build 183 |
| 2.5c | **Consumption**: the WLTC class 3b cycle driven second by second through the electric drive, Wh/km against the three Teslas' WLTP figures, from the pack and at the socket (`src/js/electric-cycle.js`, `tests/test102.mjs`). | ✅ build 184 |

### 3. Hybrids — after electric is shipped and validated

In order of complexity, each built on the last:

1. **Mild / parallel (P2):** a motor between engine and gearbox, small battery, torque fill and
   regen. Uses the existing gearbox unchanged.
2. **Full parallel / power-split:** electric-only driving at low load, engine on at high load. The
   energy manager uses the `steadyBSFC()` map to run the engine at its efficient points.
3. **Series:** the engine only charges; the wheels see an electric drive.
4. **Racing energy recovery:** deploy and harvest per lap under a regulation limit (MJ per lap),
   wired into the race simulator's strategy the way fuel and tyres are now.

- **Validation:** real hybrids where the figures are published (e.g. a Prius for consumption, a
  Porsche 918 or similar for performance).

Step 3 lands in parts, one PR each (decisions 12-15):

| part | what | state |
|---|---|---|
| 3.1 | **Parallel (P2)**: a HYBRID field on any combustion engine; a motor on the gearbox's input shaft at engine speed, a small pack of hybrid cells; its torque added to the engine's in the 0-100, the lap and the race, regeneration added to the engine's overrun; charge-sustaining over a lap (the deploy is cut to what braking takes back); the race burns fuel for the engine's share only. DEPLOY: FULL, or ECO (torque fill up to the engine's peak torque, the Ioniq's calibration). Checked: the Hyundai Ioniq Hybrid against MotorWeek's measured run and Hyundai's 0-100 (`src/js/hybrid.js`, `tests/test103.mjs`). | ✅ build 186 |
| 3.2a | **An engine's consumption**: the WLTP cycle for every combustion car, each second in the gear that burns least, the fuel off the engine's own map, the cold start derived from its warm-up (`src/js/fuel-cycle.js`). Checked: four cars' WLTP figures, 8.8% RMS (`tests/test104.mjs`). | ✅ build 187 |
| 3.2b | **A hybrid's consumption**: the energy manager on the cycle (the engine off at low load and at a stop, load-point shifting, the charge balanced over the cycle) and an ATKINSON cam (late inlet closing: the Ioniq's engine is ~12% over its rating without one). Checked: the Ioniq's WLTP fuel, 5.23 L/100 km against Hyundai's 4.4-5.2 (`tests/test105.mjs`). The cam closes late but does not yet give the Kappa's 105 PS or its ~40% peak efficiency: the engine's breathing and combustion work for v1.0 (cooled EGR, the ram at late closing). | ✅ build 188 |
| 3.3 | **Power-split**: HYBRID POWER-SPLIT (eCVT), the planetary of Toyota's P610 (30/78 teeth, MG2 65:17 to the ring) on a 600 V bus; MG1 sized from the engine (its reaction torque and 31% of its power), MG2 and the pack from the form; one reduction to the wheels, no clutch; at full throttle the engine at the speed that gives most at the wheels, on the cycle on its best line with MG1 and MG2 carrying the difference (`src/js/power-split.js`). NiMH hybrid cells. Hybrids on the cycle now recover exhaust heat into the coolant while it warms (Toyota's EHR, Hyundai's EHRS). Checked: the 4th-generation Prius, matched to its 72 kW engine: 0-100 11.18 s against 10.6, 180 km/h; WLTP 4.44 L/100 km at the real engine's 40% efficiency against Toyota's 4.14 (5.12 as built) (`tests/test106.mjs`). | ✅ build 189 |
| 3.4 | **Series**: HYBRID SERIES, the engine only charges: a generator on its crank (built from the traction motor's design for 110% of the engine's peak torque and 105% of its power), the traction motor alone to the wheels through one reduction; it shares the power-split's code (the engine on its best line, free of the road's speed; MG1's place taken by the generator with all the engine's torque and none to the wheels). Checked: the Nissan Qashqai e-POWER (2022): 0-100 7.38 s against 7.9 (motor-limited), 170 km/h, WLTP 6.16 L/100 km against 5.3 (the engine model's efficiency gap, as the Prius's); the same engine through a gearbox 7.54 (`src/js/series.js`, `tests/test110.mjs`). | ✅ build 193 |
| 3.5a | **Plug-in**: PLUG-IN on any hybrid; the pack starts at the charge window's HIGH and is driven down to its LOW before the hybrid sustains it; WLTP the regulation's way for a plug-in (the cycle driven from a full pack until it sustains, the all-electric range, the depleting cycles' fuel and electricity, weighted with the sustaining test by the EU utility factor); the bench's AUTO drives a plug-in electric while it has charge to spare. Checked: the BMW 330e (2020): electric range 55 km against 59-66, weighted 1.71 L/100 km against 1.6-1.9, 0-100 5.80 s (matched) against 5.9 (`tests/test111.mjs`). | ✅ build 194 |
| 3.5b | **A front axle motor**: a hybrid can carry the electric car's FRONT MOTOR, on its own reduction to the front wheels (FRONT REDUCTION, or matched so its top speed falls at the car's; declutched past it), the car all-wheel drive; its force added in the 0-100, the top speed and the lap, the pack shared with the main motor, its draw counted in the lap's charge balance. Checked: the Porsche 918 Spyder, its engine matched to 447 kW: 0-100 2.39 s against 2.6, 0-200 7.35 s against 7.2, 338 km/h against 345 (`tests/test112.mjs`). | ✅ build 195 |
| 3.5c | **Racing energy**: DEPLOY LIMIT and HARVEST LIMIT (MJ a lap) in the HYBRID TUNE, held by the lap's charge balance; a plug-in starts a race on a full pack and spends its own charge on top of what braking returns: a second pace grid of depleting laps, a share between the two chosen so the charge lasts the distance and chosen again at every crossing of the line; qualifying on a full pack. Checked: the Porsche 918 Spyder on the technical circuit spends it flat out over 5 laps, spreads it at a 35% share over 30 (20 kJ of 18,360 left at the flag), 3.0 s ahead of the same car not plugged in (`tests/test113.mjs`). | ✅ build 196 |

**Hybrid on the bench, and its tune** (decisions 16-19), built before 3.4 so the series and plug-in layouts add their
modes to UI that already exists:

| part | what | state |
|---|---|---|
| 3.6a | **The hybrid on the LIVE bench**: the motor (P2) or the eCVT (power-split) run second by second with the engine, a state of charge that drains and refills, the pack's heat. DRIVE MODE (AUTO / EV / HOLD / CHARGE / SPORT / ENGINE ONLY / MANUAL), a starting-charge slider, and in MANUAL a motor command (-100% regenerating to +100% assisting) and, on a power-split, an engine-speed target. The bench drawing becomes a **power-flow diagram** (engine, motor(s), pack, wheels or brake; arrows in kW coloured by drive, boost, regeneration, charging), and a **battery gauge** (charge in its 35-85% window, kW in or out, pack temperature). (`src/js/hybrid-bench.js`, `tests/test107.mjs`). | ✅ build 190 |
| 3.6b | **How the controller thinks**: the power-split's **lever diagram** (MG1, engine and ring speeds on one line, live) and the engine's **BSFC map** with its best line and the point the controller holds it at (load-point shifting made visible). A VIEW selector on the panel: POWER FLOW, LEVER, BSFC MAP (`src/js/hybrid-views.js`, `tests/test108.mjs`). | ✅ build 191 |
| 3.6c | **HYBRID TUNE** on the ENGINE tab, saved with the build and read by the 0-100, the lap, the race and the WLTP cycle: assist strategy (FULL, TORQUE FILL, ABOVE an rpm, LAUNCH ONLY; it replaces DEPLOY), an assist map over rpm x throttle edited like the fuel map, electric-driving limits (speed, power), engine-start rules (demand, charge), regeneration (OFF / LOW / HIGH, coast regen), the charge window and target, an ECO-PERFORMANCE bias on the pack's energy price, load-point shifting on or off. Racing deploy and harvest limits joined it in 3.5c (build 196). Built: ASSIST (FULL, TORQUE FILL, ABOVE or BELOW an rpm) with ASSIST RPM, the ASSIST MAP (shaft speed x pedal), REGENERATION, LOAD-POINT SHIFTING, EV UP TO (km/h) and EV POWER (kW), the CHARGE window; the ECO-PERFORMANCE bias is left out (it would only restate the EV limits and the assist map) and coast regeneration with it (the lap has no lift without braking to give it to). A cycle that cannot sustain its charge is charge-corrected as WLTP corrects a hybrid's (`tests/test109.mjs`). | ✅ build 192 |

### 4. Electric sound

A motor and inverter synth beside GAS: an inverter switching tone, motor whine rising with speed,
gear mesh from the reduction. Built standalone in `tests/proto/` first, the way GAS was.

| Step | What | Status |
|---|---|---|
| 4a | **The prototype** (`tests/proto/ev-sound/`): torque ripple at 6 fe and slotting at LCM(slots, poles) × the shaft speed (an induction motor's bars, silent with no torque), the stator mode they sweep through, the inverter's sidebands at fc ± 2 fe and 2 fc ± fe weighted by the modulation depth, the reduction's two gear meshes, windage. Checked on its output: every voice to the FFT bin on its predicted frequency, the whine an order, louder with the load, an idle induction motor 77 dB down, SiC higher and quieter than IGBT, 6–8% of real time. | ✅ build 197 |
| 4b | **In the app**: the synth in the sound worklet beside GAS, driven by the LIVE bench (an electric car, and a hybrid's motor with its engine) and the TRACK tab's replay; a level against GAS set by ear. | |

---

## Decisions

| # | question | decision |
|---|---|---|
| 1 | One source file or split? | **Split**, joined output committed (step 0). |
| 2 | Does electric work pause the v1.0 queue? | **A freeze, not a pause**: from the start of step 0 until step 1 merges, no change that moves a number lands; work that touches only tests, docs or the UI continues. After step 1, v1.0 and electric run side by side. Reason: step 0 moves every line of `index.html`, step 1 rewrites the lap, race and acceleration code, and step 1's bit-identical check is only meaningful against a baseline that is not moving underneath it. |
| 3 | How exact must step 1 be? | **Bit-identical** 0–100, top speeds and lap times on every preset. A number that moves is fixed before merging, not explained. |
| 4 | Version | Electric ships as **v0.7**. v1.0 keeps its meaning: every combustion number derived. |
| 5 | Saved builds and share links | Saves gain a **powertrain type**; a save without one is read as `combustion`, so every existing save, garage entry and share link still loads. |
| 6 | Where electric appears | A new type in the **engine-type dropdown**; choosing it swaps the ENGINE tab for MOTOR / BATTERY. |
| 7 | The live dyno for a motor | **Torque, power and efficiency curves**, with winding and magnet temperatures. No cutaway in the first version. |
| 8 | Electric against combustion in a race | **Mixed fields allowed, no charging mid-race**: an electric car manages its energy. Categories unchanged. |
| 9 | Is battery and motor technology tied to the decade? | **Yes, by decade**, like the Supercar category: at least battery energy per kg and cost per kWh, so a 1990s challenge cannot be won with a 2020s battery. |
| 10 | Which real electric cars to validate against (and ship as presets) | **Tesla Model 3, Model Y and the new Model S** (the 2021 refresh). Variants to be fixed in step 2; see the note below. |
| 11 | Greek translation | **Falls back to English for now.** New electric strings need no Greek in the same PR; `tr()` shows the English where a translation is missing, and the Greek is filled in later. |
| — | Electric or hybrid first | **Electric first** (see *Build order*). |
| 12 | Where a hybrid lives in the designer | A **HYBRID field on every combustion engine** (none / parallel P2 / later full, series); choosing one adds the MOTOR, INVERTER and BATTERY sections under the engine. *None* is exactly today's engine, so a petrol, diesel or rotary can each be hybridised. |
| 13 | Plug-in | **Charge-sustaining first** (the pack is charged by the engine and braking only); plug-in comes in 3.5. |
| 14 | Validation | The **Hyundai Ioniq Hybrid** (P2, 3.1-3.2), the **Toyota Prius**, 4th generation (power-split, 3.3), the **BMW 330e or Cayenne E-Hybrid** and the **Porsche 918 Spyder** (plug-in, 3.5). |
| 15 | Hybrids in a race | **On fuel, charge-sustaining** from 3.1: the battery deploys and harvests within each lap; regulation energy limits come in 3.5. |
| 16 | Where the hybrid tune lives | A **HYBRID TUNE section on the ENGINE tab**, under the HYBRID fields, saved with the build like the cam and the ECU settings. |
| 17 | Live diagrams first | The **power-flow diagram**, the **battery gauge**, the power-split's **lever diagram** and the **BSFC map** with the controller's operating point (stacked dyno curves and a strip chart later). |
| 18 | Driving a hybrid on the bench | **Drive modes and manual**: AUTO / EV / HOLD / CHARGE / SPORT / ENGINE ONLY, and MANUAL with a motor command and (power-split) an engine-speed target. |
| 19 | When | **Now, before 3.4**: 3.6a-c on the P2 and the power-split, then series and plug-in add their modes. |

**On the three Teslas (decision 10).** Tesla publishes 0–100 / 0–60, top speed, mass and WLTP/EPA
consumption, which the 0–100, top-speed and Wh/km checks need. It does **not** publish continuous
(30-minute) power, so the heat model's peak-hold check needs another source: sustained-lap tests
where the cars' power derating has been measured. The variants proposed for step 2 span one, two
and three motors: Model 3 RWD (single motor), Model Y Long Range AWD (dual motor), Model S Plaid
(three motors, the 2021 refresh).

## Open questions

- **The three Teslas' variants:** proposed above (Model 3 RWD, Model Y Long Range, Model S Plaid).
- **Motor designer depth:** proposed in [motor-design.md](motor-design.md), a first set of about
  12 geometric fields, more later.
- **Name and identity:** stays "Pixel Engine Sim", or becomes "powertrain" in the UI?
