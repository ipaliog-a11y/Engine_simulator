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

### The plug-in hybrid (build 194)

- **Step 3.5a of the plan** (decision 13's second half). **PLUG-IN** on any hybrid: the pack starts at the charge
  window's HIGH and is driven down to its LOW before the hybrid sustains it.
- WLTP the regulation's way for a plug-in (UN R154 / EU 2017/1151): the cycle driven again and again from a full pack
  until the pack reaches the charge it sustains, with no warm-up running of the engine (a plug-in drives away on its
  pack; the engine starts cold when it is asked for); the **all-electric range** (where the engine first starts), the
  depleting cycles' fuel and electricity (at the socket, over a 90% charger), and the **weighted** figure, each
  depleting cycle by the EU utility factor's step over it and the sustaining test by what is left. While it depletes
  the energy manager prices the pack's energy at 2% of a charge-sustaining hybrid's. The VEHICLE tab gives the weighted
  L/100 km and CO2, the electric range, kWh/100 km and the sustaining figure.
- On the LIVE bench, AUTO drives a plug-in electric while it has charge to spare (up to all the motor and pack give).
- The CHARGE TARGET can now go down to 10% (a plug-in sustains near the bottom of its pack).
- **The BMW 330e (2020)**: B48 2.0 turbo (193 hp as built, 184 PS published) with an 80 kW / 265 Nm P2 motor in its
  eight-speed automatic and a 12 kWh pack (charge window 12-95%, sustained at 15%). WLTP electric range 55 km against
  BMW's 59-66, weighted 1.71 L/100 km against 1.6-1.9, 15.6 kWh/100 km; 0-100 km/h 5.80 s with the engine matched
  against 5.9 (XtraBoost), 230 km/h governed.

### The series hybrid (build 193)

- **Step 3.4 of the plan.** HYBRID gets its third layout, **SERIES** (`src/js/series.js`): the engine turns a generator
  on its crank and nothing else; the traction motor alone drives the wheels through one reduction, as an electric
  car's. The engine's speed is free of the road's: the energy manager, the lap's fuel and the bench hold it on its best
  line, and every kilowatt reaches the wheels through both machines' losses. The generator is built from the traction
  motor's design for 110% of the engine's peak torque and 105% of its peak power. It shares the power-split's code:
  `hybGear` says how the engine reaches the shaft (a planetary's split, or a generator taking it all).
- The LIVE bench runs it (MANUAL holds the engine at ENGINE SPEED whatever the shaft does); the power-flow diagram has
  its own layout (engine, generator, bus, motor, brake, pack); the lever is a power-split's only; the gear window and
  the VEHICLE tab say SINGLE-SPEED (SERIES).
- **The Nissan Qashqai e-POWER (2022)**: KR15DDT 1.5 turbo three (153 hp as built, 158 PS published), a 140 kW / 330 Nm
  motor, 2.1 kWh, 1612 kg, Cd 0.32, its reduction matched (8.3:1; Nissan does not publish it). 0-100 km/h 7.38 s
  against 7.9 (the motor sets a series car's flat-out pace: the engine and pack out-give it), 170 km/h governed. WLTP
  6.16 L/100 km against Nissan's 5.3: the model's KR15 burns 254 g/kWh at its best (the engine model's efficiency gap,
  the Prius's too); the engine off 56% of the cycle; the same engine through a six-speed gearbox 7.54.

### The hybrid tune (build 192)

- **Step 3.6c of the plan.** A **HYBRID TUNE** section on the ENGINE tab for any hybrid, saved with the build and read
  by the 0-100, the lap, the race, the WLTP cycle and the LIVE bench:
  - **ASSIST** (was DEPLOY): FULL, ECO (TORQUE FILL), ABOVE or BELOW an **ASSIST RPM**; a power-split is FULL;
  - the **ASSIST MAP**: the share of the motor's help over shaft speed (0-100% of its top) and pedal (25-100%),
    clicked down in 25% steps; flat out reads its 100% row;
  - **REGENERATION** OFF / LOW / HIGH; **LOAD-POINT SHIFTING** on or off;
  - **EV UP TO** (km/h) and **EV POWER** (kW): how far the energy manager drives on the motor alone;
  - the **CHARGE** window: LOW (the engine starts), TARGET (held), HIGH (no more charge taken).
- Untouched, the tune is the controller of builds 186-191: every earlier hybrid figure is unchanged.
- A tune that cannot sustain the charge over the WLTP cycle has its fuel **charge-corrected** as the regulation
  corrects such a hybrid (the energy borrowed, priced at the engine's best BSFC through a 90% electrical path), and
  the VEHICLE tab says so.
- `tests/test109.mjs` on the Ioniq: ABOVE 4500 rpm 7.75 -> 8.09 s to 100; the map at 50% halves the help (8.61 s);
  REGENERATION OFF takes nothing back and the lap has nothing to deploy; EV UP TO 30 km/h 5.05 -> 5.37 L/100 km;
  LOAD-POINT SHIFTING OFF can no longer sustain the charge (5.31 L/100 km charge-corrected); on the bench it stops
  the engine charging; a 75% target is held.

### How the controller thinks: the lever and the BSFC map (build 191)

- **Step 3.6b of the plan.** The hybrid panel's VIEW selector adds two views beside the power flow
  (`src/js/hybrid-views.js`):
  - **LEVER** (power-split only): Toyota's nomograph of the planetary, three bars for MG1 (sun), the engine (carrier,
    1/(1+rho) of the way along) and the ring (MG2's speed over 65:17), their speeds on one straight line, with the
    engine's torque, MG1's reaction and MG2's drawn as arrows. With the engine stopped the line passes through zero
    and MG1 runs backwards.
  - **BSFC MAP**: the engine's fuel per kWh over speed and torque, off its own map, with its full-load curve, its best
    line, its best point, and the point the controller holds it at with a trail of the last few seconds.
- `tests/test108.mjs`: the lever's speeds lie on Willis's line in every mode; the map's best is the best line's, no
  cell beats it, nothing past full load; on the Ioniq at a light pedal CHARGE moves the engine from 318 to 253 g/kWh
  (load-point shifting, made visible).

### The hybrid on the LIVE bench (build 190)

- **Step 3.6a of the plan** (decisions 16-19, chosen in a brainstorm on the hybrid's UI). A hybrid's motor, pack and
  controller now run with its engine on the LIVE bench, second by second (`src/js/hybrid-bench.js`): a P2's motor on
  the dyno's shaft with the engine's clutch (the engine stops and the clutch opens in electric drive), a power-split's
  eCVT with MG1 setting the engine's speed and the brake on MG2's shaft. The engine is the bench's own engine at the
  throttle the controller gives it; THROTTLE is the driver's pedal. The charge drains and refills through the pack's
  model, the motor and pack heat.
- A **HYBRID** panel beside the live readouts, for a hybrid only: a **power-flow diagram** (engine, clutch or
  planetary, motor or MG1 and MG2, the 600 V bus, the pack and the brake; each path as wide as its power, orange the
  engine driving, blue the pack, green regeneration, purple the engine charging), a **battery gauge** (the charge in
  its 35-85% window, the pack's power and temperature), and **DRIVE MODE**: AUTO (charge-sustaining towards 60%), EV,
  HOLD, CHARGE, SPORT, ENGINE ONLY (the pack does nothing) and MANUAL (MOTOR COMMAND from -100% regenerating to +100%
  helping, and a power-split's ENGINE SPEED). BATTERY CHARGE sets the charge. The status line says when the engine
  is off; the engine's sound stops with it.
- `tests/test107.mjs` drives the Ioniq Hybrid and the Prius through every mode: ENGINE ONLY leaves the pack alone,
  EV stops the engine (MG1 spinning backwards on the Prius) and starts it again at 35%, CHARGE and AUTO move the
  charge the right way, the planetary obeys Willis's equation, no more leaves the shaft than the engine and pack put in.

### The power-split hybrid (build 189)

- **Step 3.3 of the plan.** HYBRID gets a second layout, **POWER-SPLIT (eCVT)** (`src/js/power-split.js`): Toyota's
  planetary, the engine on the carrier, MG1 on the sun, the ring to the wheels where MG2 drives through one reduction.
  The planetary's laws (Willis's speeds, the ring's 1/(1+rho) of the engine's torque, MG1 holding the rest) and each
  machine's losses on the electrical path are derived; the rules are named: the P610's gears (30/78, MG2 65:17), a
  600 V boost converter, MG1 built from MG2's design for 110% of the engine's peak reaction torque and 31% of its
  peak power. No clutch and no gearbox: the vehicle sees one reduction from MG2, as an electric car does; at full
  throttle the engine runs at the speed that gives the most at the wheels within MG1's torque, speed and power.
- On the cycle the energy manager drives MG2 alone or puts the engine on its best line (the speed that burns least
  for each power) with MG1 and MG2 carrying the difference, and can charge standing still. The lap and the race burn
  fuel on that line for the engine's share. **NiMH (HYBRID CELLS)** join the chemistries.
- A hybrid's warm-up: both validation cars recover exhaust heat into the coolant until it is warm (Toyota's EHR,
  Hyundai's EHRS): 15% of the fuel's energy more to the coolant while it is under 50 C. The Ioniq Hybrid's WLTP moves
  from 5.23 to 5.05 L/100 km (Hyundai 4.4-5.2).
- **The Toyota Prius (2016)**: 2ZR-FXE, 53 kW / 163 Nm MG2, 1.31 kWh NiMH, 10.84:1, 1375 kg, Cd 0.24. Its engine
  matched to the published 72 kW: 83 kW together (Toyota 90), 0-100 km/h 11.18 s (10.6), 180 km/h. WLTP 5.12 L/100 km
  as built; 4.44 at the real engine's 40% peak efficiency against Toyota's 4.14 (68.3 mpg); the engine off 57% of
  the cycle; the same engine through a gearbox 6.42. TURNS PER PHASE now goes to 120 (a 600 V machine's winding).

### A hybrid's energy manager, and the Atkinson cam (build 188)

- **Step 3.2b of the plan.** A charge-sustaining hybrid on the WLTP cycle (`hybridCycle` in `src/js/fuel-cycle.js`):
  each second the equivalent-consumption minimisation (ECMS) every production controller is a version of, choosing
  electric only (engine off, clutch open), the engine in a gear with the motor helping or charging (load-point
  shifting over five splits), or regeneration within the motor's and the pack's limits. The pack's energy is priced
  at the one equivalence factor that leaves it where it started (a bracketed secant over whole cycles), so the
  controller's only parameter comes from the cycle. Rules: the engine runs until its coolant reaches 50 C, then stops
  at a standstill; the pack stays between 35% and 85%; the 12 V load comes from the pack.
- **The Hyundai Ioniq Hybrid**: 5.23 L/100 km, 124 g/km, against Hyundai's WLTP 4.4-5.2; the same car without its
  hybrid 6.66 (27% more); the engine off 53% of the cycle; the factor comes out at 268 g/kWh. ~1.2 s, so the VEHICLE
  tab draws first and fills the line in.
- **ATKINSON (LATE IVC)** cam: the intake held ~75 degrees past BDC, its phaser limited to 15 degrees of advance so it
  still closes 60 degrees late flat out. The breathing and cycle models take it from the closing angle: part-load
  BSFC 314 -> 310 g/kWh on the Kappa. It does **not** reproduce the Kappa's 105 PS (the model gives 126 hp: its intake
  ram rewards a late closing at high rpm) or its ~40% peak efficiency (the model's best is 249 g/kWh, ~34%: no cooled
  EGR). That gap, not the energy manager, is why the Ioniq lands at the top of Hyundai's range; the Ioniq preset keeps
  the stock cam with its power matched.
- `tests/test105.mjs` (new).

### An engine's fuel over the WLTP cycle (build 187)

- **Step 3.2a of the plan.** `src/js/fuel-cycle.js` (new): the WLTC class 3b trace driven second by second with an
  engine, as the electric cars' is. Each second in the gear that burns least (economy shifting: the engine 15% over
  idle and the torque with 10% in hand), the fuel read off the engine's own steady-state map (`steadyBSFC`) between 18
  speeds and 12 loads, the Willans line below its lightest load; idling at a stop, injectors cut on the overrun.
- **The cold start is derived**: the model's friction knows the oil's temperature, so the engine and its fluids warm
  from 23 C on 30% of the fuel's energy until the thermostat opens (~850 s on the cycle), and each second reads maps
  taken at its temperature. It costs the GR Yaris 10.9% against a hot start.
- **Against WLTP** (`tests/test104.mjs`), nothing fitted: GR Yaris 7.85 L/100 km (8.2), Civic Type R FK8 8.24
  (8.2-8.8), RS3 8V 9.30 (8.3-8.5), McLaren 720S 10.63 (12.2): 8.8% RMS.
- The VEHICLE tab gives an engine its WLTP L/100 km and CO2 (an electric car keeps its Wh/km).

### The parallel (P2) hybrid (build 186)

- **Step 3.1 of the hybrid plan; decisions 12-15** (recorded in `plans/hybrid-electric/`: a HYBRID field on every
  engine, charge-sustaining first, the Ioniq, Prius, 330e/Cayenne E-Hybrid and 918 to check against, hybrids racing
  on fuel). `src/js/hybrid.js` (new).
- **HYBRID** on the ENGINE tab: NONE is the engine exactly as it was; PARALLEL (P2) adds a motor on the gearbox's input
  shaft and a pack, designed in the electric drive's MOTOR / INVERTER / BATTERY fields (starting from an Ioniq-sized
  200 x 40 mm, 12-pole motor and a 1.56 kWh pack). New **Li-ION (HYBRID CELLS)** chemistry: ~25C, little energy.
- **The HYBRID powertrain**: the motor's torque added to the engine's at every engine speed (cut to the pack's power),
  its regeneration added to the engine's overrun, its motor and pack added to the mass. Over a lap it is
  charge-sustaining: the engine does everything it can, the motor fills only what the engine cannot, and the deploy is
  cut until the pack gives no more than braking returns. The race burns fuel for the engine's share of the power.
- **DEPLOY**: FULL, or ECO, an efficiency-first calibration where the motor only fills the engine's curve up to its
  peak torque.
- **The Hyundai Ioniq Hybrid (2016)** as a factory engine and car: 1.6 GDi + 32 kW / 170 Nm P2 + 1.56 kWh, ECO. Its
  engine matched to its published 105 PS (the model has no Atkinson cam yet and makes 115 hp), it runs 0-60 mph in
  9.72 s, the quarter mile in 17.41 s at 81.1 mph against MotorWeek's measured 9.6 / 17.4 / 81, and 0-100 in 10.27 s
  against Hyundai's 10.8. On FULL the same hardware would do 7.70 s: the real car's controller does not use it.
- `tests/test103.mjs` (new).

The model currently reaches its accuracy partly through lumped coefficients that were tuned until
the outputs matched reality (`CAM{peakShift, ampMul, scav}`, `EXHAUST{topGain, lowLoss}`,
`TURBO{spool, choke, k, flow}`, `IMEP_K`, `DIFF_ASYM0`, `KVCAP`). v1.0 replaces them with quantities
derived from geometry and physical law, component by component, and accepts whatever accuracy that
produces rather than tuning toward a target.

Planned order: valvetrain and port flow → tyre → turbo maps → combustion cycle.

---

## [0.7] — 2026-10

The electric release (`plans/hybrid-electric/`, decision 4): battery-electric cars in the same game as the engines,
through the same vehicle, lap and race code, with every combustion number unchanged (`tools/fingerprint.mjs`).

- **The source split and the powertrain interface** (builds 176-177): `src/` joined into the one `index.html`, and the
  0-100, the lap, the race and the gear window reading whatever drives the wheels through `powertrain()`.
- **The electric drive** (178-179): a permanent-magnet motor, IGBT or SiC inverter and a battery of four chemistries
  by year, derived from what they are built of and checked against the measured Model 3 motor and the 2012 Leaf;
  ELECTRIC in the engine-type list, with MOTOR / INVERTER / BATTERY, a bench, a dyno and saves.
- **On the road** (180): one reduction, regenerative braking, motor and pack heat over a lap.
- **In a race** (181): the pack's energy instead of fuel, no charging mid-race, an energy manager, OUT OF CHARGE.
- **The induction motor** (182), checked against the Tesla Model S 60's published geometry.
- **The three Teslas** (183): more than one motor per car, power cells, the Model 3 RWD, Model Y Long Range and
  Model S Plaid against their published 0-100 and top speeds.
- **Consumption over the WLTP cycle** (184): the three Teslas within 5% of their homologated Wh/km.
- It also carries the v1.0 conversions made since 0.6 (below the electric builds).

### Consumption over the WLTP cycle (build 184)

- **Step 2.5c of the electric plan.** `src/js/electric-cycle.js` (new) drives the WLTC class 3b cycle (1800 s, 23.27 km,
  to 131.3 km/h; the UNECE GTR 15 table as the JRC extracted it, checked against its checksum) second by second
  through the electric drive: the force the trace asks for, the motor's torque and losses through the reduction,
  regeneration where the motor and pack can take it back, the cells' own loss. Rules, not fits: the test mass (+100
  kg), a 250 W 12 V load with the climate off, 85% from the socket to the cells.
- **Against the WLTP figures** (`tests/test102.mjs`): from the pack 119.5 / 141.3 / 166.3 Wh/km for the Model 3 RWD,
  Model Y Long Range and Model S Plaid against the vehicle-side 117 / 138 / 158; at the socket 141 / 166 / 196
  against the rated 142 / 169 / 187. Nothing was set from a consumption figure.
- The VEHICLE tab shows the cycle's Wh/km, at the socket, what regeneration takes back, and the range.
- **Fix:** a drive held to its pack's power is flat on top; its scorecard's peak-power speed is now where that plateau
  starts, not whichever point of it rounding favoured (test97's MAX POWER check failed one run in two on it).

### The three Teslas (build 183)

- **Step 2.5b of the electric plan; decision 10.** The Model 3 RWD (2021, LFP), the Model Y Long Range (2022, a magnet
  motor at the rear and an induction motor at the front) and the Model S Plaid (2021, three carbon-sleeved magnet
  motors) as factory engines and cars, in their own tables (`src/js/electric-presets.js`) joined to the combustion
  ones only in the pickers and the race, so the suite's combustion sweeps are untouched.
- **More than one motor.** MORE MOTORS on the ENGINE tab: REAR MOTORS 1 or 2 (one per wheel) and a FRONT MOTOR (magnet
  or induction, its own size, turns and current). The drive's torques add; the controller splits the torque asked to
  lose the least (at a cruise the induction front motor carries nothing: no field, no drag); one lumped thermal network.
  A front motor makes the car all-wheel drive, and taking it off gives the drivetrain back.
- **NCA (POWER CELLS)**, a chemistry built for current: 10C against 6C, less energy per kg. The Plaid's 110s72p pack of
  18650s sustains ~2300 A.
- **Matched on the hardware**: mass, drag, area, tyres, the owner's manuals' reductions (9.03, and 7.56 on all three of
  the Plaid's units), the pack, and each motor's published torque or power (the Model 3's 420 Nm; the Model Y's 326 Nm
  rear and the front unit's 219 Nm, which with 137 kW at 6380 rpm on 320 V sizes it; the Plaid's 295 kW a motor).
- **Derived and checked** (`tests/test101.mjs`): 0-100 6.18 s for the Model 3 RWD against 6.1; the Model Y's 0-60 mph
  less the one-foot rollout 4.06 s against the 4.3 s its hardware does unlocked (the stock 4.8 s is a software limit
  on launch torque); the Plaid 2.52 s without rollout against 2.52-2.56 s measured, 2.29 s with it against Tesla's
  2.1; all three reach their governed top speeds. The acceleration run reports 0-60 mph and the rollout time.

### The induction motor (build 182)

- **Step 2.5a of the electric plan.** MOTOR TYPE on the ENGINE tab: PERMANENT MAGNET or INDUCTION (COPPER CAGE). The
  induction motor has no magnets (their grade and retention are disabled): the stator's own current magnetises the
  rotor and the torque current induces the cage's. From the build, as the magnet motor is: the flux from a design
  air-gap flux density (0.8 T) bought with magnetising current, the cage's resistance from its bars and end rings,
  the leakage drop that raises the voltage at full current, field weakening to ~3x the knee (breakdown torque).
- **What it trades.** Less torque per amp and a lower best efficiency (95.8% against 96.9% for a magnet motor of the
  same size and current); the cage's slip loss heats the rotor, which sheds it only across the air gap; and at no
  torque there is no field, so no iron loss and no drag (164 W coasting at 8000 rpm against 2 kW): why a secondary
  axle carries one. Its cost is about a magnet motor's: the copper cage costs what the NdFeB it replaces does.
- **Checked against the Tesla Model S 60's rear motor**, built from its published geometry (4 poles, 60 slots, 74 bars,
  156.8 mm bore, 152 mm stack, 0.5 mm gap) with its turns taken from its measured 4.35 mOhm phase resistance: 430 Nm
  at 1060 A, 259 kW against the published 225, a knee at 5700 rpm (~5000 implied), and 90.9% copper-only efficiency at
  225 kW against the finite-element 93.4%. `tests/test100.mjs` (new). Saves carry the motor type; an old save is a
  magnet motor.

### The electric car in a race (build 181)

- **Step 2.4 of the electric plan** (`plans/hybrid-electric/`). An electric car enters a race beside engines (decision
  8); `src/js/electric-race.js` (new) holds what its race does differently.
- **Energy in the tank's place.** The store is the pack's usable energy: charged to 95%, the battery management holding
  back the last 5%, counted in kWh. It weighs the same full or empty, so the pace grid's second axis is not the tank's
  mass but the battery power the car runs at: full, 65% and 30% of what the rated curve draws at its peak, each a lap
  solved through the same solver with the torque curve cut to that power.
- **Every point priced in kWh.** The shaft power, the motor's and the inverter's losses and the cells' own (I²R, about
  12% flat out), less what regeneration takes back braking. At full power the race's lap is the TRACK tab's to 0.05 s.
- **No charging mid-race.** An electric car stops only for tyres. Its energy manager plans the most power that lasts the
  distance with 3% in hand, chooses again at every crossing of the line for the laps that are left, and learns what the
  car actually spends against the prediction (laps the battery management cut are no lesson). A car that empties its
  pack retires: **OUT OF CHARGE**.
- **Heat lap to lap.** The pack and the motor are carried through the race; the battery management cuts the power as
  the pack's charge falls and as it heats past 50 °C, the controller as the winding and the magnets heat. A road car's
  pack runs into its temperature before its energy: 30 laps of the technical circuit on the default 75 kWh car, the
  pack reaches 50 °C by lap 10 and is held at 57 °C, the laps slip from 75 s to 80 s, and 12 of 67.5 kWh are left.
- **The RACE tab and the race report** show ENERGY in kWh, the pack and motor temperatures, and kWh in the results, with
  litres for the engines beside it; the pit-lane line leaves out the fuel for a car that takes none.
- `tests/test99.mjs` (new): the model, a short race, a race only the manager finishes (flat out the car runs out after
  18 of 24 laps), one no power lasts, and the heat over 30 laps. Combustion fingerprint identical to build 177.

### The electric car on the road (build 180)

- **Step 2.3 of the electric plan** (`plans/hybrid-electric/`). The electric drive runs the 0-100, the top speed and the
  lap through the same solvers as an engine; `src/js/electric-car.js` (new) holds what an electric car does differently.
- **One reduction.** No gearbox, no shifts, no clutch, no launch speed. The reduction is matched so the motor's top speed
  falls where drag meets the drive's peak power (as an engine's final drive is matched to its power peak), GEARING
  biases it, a hand-set one is kept (4-14:1); a reduction and differential lose 3% (5% AWD). The VEHICLE tab hides the
  gearbox type, speeds and spacing and shows the reduction and the regeneration in their place.
- **Regeneration.** Lifting off, the motor brakes the car as a generator through the lap's engine-braking path (builds
  149-150): on the driven axle, never past the tyres, the lower of the motor's torque and what the pack takes back
  (new per chemistry: NCA ~1C, LFP 1.5C, hybrid NiMH 5C, lead-acid 0.3C). On the technical circuit it takes the hottest
  rotor from 620 to 588 C and 0.23 kWh back; the lap is no slower.
- **Heat over a lap.** The winding, rotor and a lumped pack (cells' heat capacity, a cooling plate to 30 C coolant, the
  battery management cutting from 50 C to nothing at 60 C) are walked round a preparation lap and the timed one, the
  controller cutting the current as they heat; the cut is the drive's share, and the lap is solved again (the turbo's
  boostShare). Where the car is on power the driver asks for full torque, so a lap slowed by the heat cannot read as a
  cool one and the solve settles. A timed lap starts on a pre-conditioned pack. Round the Nordschleife the default drive
  holds its pack at 56 C and is cut back over 47% of the lap: 8:03 against 7:47 with the heat ignored; air-cooled, the
  winding limits it to 9:23. The TRACK tab shows MOTOR, BATTERY and ENERGY.
- An electric car still does not race (the race spends fuel; energy is 2.4): the RACE tab and a garage entry say so.
- **Tests:** `tests/test98.mjs` (new) for the driveline, the 0-100 against its bounds, GEARING, regeneration, heat by
  cooling and the panels; `test97` now expects the car to drive. Greek for the 13 new words on the VEHICLE and TRACK tabs.
- Combustion unchanged: `tools/fingerprint.mjs` identical to build 177 in all 2494 values (an engine's lap result
  carries no new field).

### ELECTRIC on the ENGINE tab, the bench and the dyno (build 179)

- **Step 2.2 of the electric plan** (`plans/hybrid-electric/`). ELECTRIC (BATTERY) is a fifth engine type (decision 6):
  choosing it swaps the combustion sections for MOTOR, INVERTER and BATTERY, 14 fields that each act through the
  physics of build 178. `src/js/electric-ui.js` (new) builds the drive, rates it, runs it on the bench and the dyno.
- **The scorecard, in a motor's terms**: peak and continuous power (the most the cooling holds for good at 1.5x the
  knee), how long the peak lasts before the winding reaches 150 C, the knee, the best efficiency, kW per kg of motor.
  The grade weighs power density, the constant-power range, efficiency, continuous over peak and the peak's hold;
  tailpipe emissions are nil and not scored. The cost is the motor and inverter's plus the pack's.
- **The bench**: the throttle asks for a share of the torque the drive can give at that speed, cut to what the pack
  supplies; the pack sags and drains; the motor heats through its winding, core and rotor; the controller derates the
  current from 150 C in the winding (none at 180) and over the magnets' last 20 C; magnets past their grade's limit
  and a winding past 200 C are damaged for good. The dyno brake is the engine's law, stepped finely enough for a
  rotor's small inertia. PEAK TORQUE, MAX POWER and ECO find the drive's own points.
- **The dyno**: torque, power and the drive's efficiency at the pack's charge and the magnets' heat right now, the knee
  marked, the winding and magnet temperatures; the result table in kW, hp, Nm and efficiency. No cutaway (decision 7):
  the LIVE view is the bench's instruments and the motor end-on. The engine's sound is muted (a motor's is step 4) and
  the printable report says it comes later.
- **The car waits for 2.3**: `powertrain()` is electric for an electric build and carries the motor and pack's mass
  into the car, but is not ready to drive; VEHICLE, TRACK, RACE and the GEAR RATIOS window say so rather than run a
  motor through a combustion gearbox.
- **Saves** carry the powertrain type (decision 5); a save without one is combustion. Chemistries are offered by the
  technology year (NiMH from 1996, LFP 2005, NCA 2008). New words are English for now (decision 11), except what every
  player sees (the ELECTRIC choice, the build message); test87 holds the 64 electric-only words as a budget that may
  only come down, as it holds the guide's, and every other word to the full rule.
- **Tests**: `tests/test97.mjs` (new): the sections swap both ways; the scorecard, cost and mass are the motor's and
  pack's; the bench settles (no swing), drains and heats, and held at peak torque reaches the controller's 150 C and is
  cut back; the dyno's torque is flat to the knee and falls with a drained pack and hot magnets; the operating points;
  the car refuses with its reason; saves, share links and old saves; chemistry by year; petrol after a round trip is
  the same engine with its tiles and controls back; Greek keeps the motor's tiles; no tab throws.
- Combustion unchanged: `tools/fingerprint.mjs` identical to build 177 in all 2494 values.

### The electric drive's physics (build 178)

- **Step 2.1 of the electric plan** (`plans/hybrid-electric/`). `src/js/electric.js` (new): the motor, its inverter
  and the battery, derived from what they are built of. Nothing calls it yet; the ENGINE tab, the dyno and
  `powertrain()` take it up in 2.2, so nothing a player sees changes.
- **The motor** (permanent magnet): torque T = 3/2 p psi I from the rotor's diameter and stack, the poles, the turns
  and the magnets, losing torque per amp to saturation as the electric loading rises; the knee where the back-EMF meets
  the inverter's voltage, then constant power over a field-weakening range of 4x; the top speed the lowest of the
  design speed, the rotor's surface speed (iron bridges ~150 m/s, a carbon sleeve ~220) and the inverter's frequency.
  Losses: copper I²R from the slot copper (rising 0.393%/K), iron by Steinmetz on the lamination thickness, friction
  and windage, and the inverter's conduction and switching (silicon IGBT or SiC). Heat: winding, core and rotor
  nodes and the coolant (air, water jacket, oil spray, direct slot cooling); a point the cooling cannot hold runs away
  and is reported so.
- **Three constants are measured, all on one motor**: the Tesla Model 3 rear motor as taken apart by MotorXP (2020):
  the air gap's flux over the magnets' remanence (0.85, from its 42 V/krpm back-EMF), the torque lost to saturation
  (8.5% at its 430 Nm, 953 A) and the voltage drop at full current (1.29). Everything else is geometry, a datasheet
  figure or a textbook rule, named where it is used.
- **The battery**: cells in series and parallel, four chemistries (lead-acid, NiMH, LFP, NCA/NMC), open-circuit
  voltage by charge, internal resistance, the discharge rate and cut-off, mass and cost. Technology follows the year
  (decision 9): specific energy and pack price between anchor years (lithium ~$1100/kWh in 2010, ~$160 in 2019), each
  chemistry available from when it reached cars.
- **Checked against what set nothing** (`tests/test96.mjs`, new): the Model 3's phase resistance from the slot copper
  (3.08 mOhm against a measured 4.75: the leads and real slot shape are not modelled, a known gap); the 2012 Leaf
  from ORNL's geometry alone, turned to Nissan's 2730 rpm knee on 375 V: 307 Nm (280), 87 kW (80), 80 kW held at
  7000 rpm with the winding settling at 110 C (ORNL ~135), 97.0% peak at 6750 rpm (ORNL >97% at 5000-9000); the
  Model 3 Long Range pack 353 V / 228 Ah (350 / 230), the LFP RWD pack 347 V (340). Every field acts through its
  mechanism and costs something.
- Combustion unchanged: `tools/fingerprint.mjs` identical to build 177 in all 2494 values.

### The powertrain interface; every number unchanged (build 177)

- **Step 1 of the electric plan** (`plans/hybrid-electric/`). The 0-100 run, the lap, the race and the GEAR RATIOS
  window reached into the engine wherever they needed something: its redline and idle, its rating, its inertia and
  mass, the torque curve and the rpm × boost grid, a turbo's shaft, a block of overrun torque built inline in the
  lap, and the race's BSFC map and idle flow. Each of those now goes through `powertrain()` (`src/js/powertrain.js`),
  and the combustion engine is its one implementation. An electric drive (step 2) is a second object with the same
  members, not a thread through every simulator.
- **Moved, not rewritten.** Each member is the expression its callers used to write, moved unchanged; the overrun
  table and the race's fuel-rate model moved whole. Members read the engine when called, so a rebuilt engine, or a
  test that swaps `buildTorqueCurve` or `buildTorqueGrid`, is seen exactly as before.
- **Bit-identical, and shown to be:** `tools/fingerprint.mjs` (new) records the full 0-100 / top-speed result of all
  42 real cars and 15 archetypes, a SHA-256 of every real car's whole solved lap of the technical circuit (flying and
  from rest), six cars round Spa, four race models and a seeded three-lap race. Build 176 and this build compare
  identical in every value. `--compare` lists anything that moved, for any later change that claims the same.
- Still read directly, on purpose: the live-timing gauges (boost needle, rev counter), which step 2 changes where an
  electric display differs, and saving and loading builds.

### The source split into files; the page shipped unchanged (build 176)

- **Step 0 of the electric plan** (`plans/hybrid-electric/`). `index.html` had reached 1.6 MB and 16,400 lines in
  one file. Its source now lives in `src/`: `shell.html` (the page, with an `@include` line for each part), the
  styles, the in-app guide, and the script in 32 files cut along the sections already marked in it (fuels and
  engine types, valvetrain, gas dynamics, i18n, vehicle presets, tyres and brakes, engine physics, the lap
  solver, the race, sound, saves, reports, the views, the guide, controls).
- **`tools/build.mjs`** joins them back into `index.html` byte for byte: no transforms, no minifying, no
  modules (blocked from `file://`), still one classic script. The joined file is identical to build 175's apart
  from the build stamp. `--check` fails when the committed `index.html` is not exactly `src/` joined, and a file
  in `src/` that nothing includes fails the build.
- **`index.html` stays committed**, so GitHub Pages, the tests and `tools/stamp.mjs` work as before. The stamp is
  now written to `src/shell.html` too. `tests/run.mjs` refuses to run on an `index.html` out of step with `src/`,
  and a new **Check** workflow does the same on every pull request.
- No physics, no numbers, no behaviour changed: the freeze on changes that move a number holds until the
  powertrain interface (step 1) merges.

### The plan for electric, then hybrids (build 175)

- **No app change.** A plan in `plans/hybrid-electric/`: electric and hybrid cars go into this simulator as
  powertrain types beside petrol, diesel, 2-stroke and rotary, not into a fork. Most of the simulator (vehicle,
  tyres, brakes, aero, the lap and the race) does not care what drives the wheels, and a hybrid needs the
  combustion model anyway.
- **Build order:** split the source (step 0), a powertrain interface with bit-identical results (step 1), battery
  electric (step 2, as v0.7), hybrids after electric is validated (step 3), electric sound (step 4).
- **The motor designer** (`motor-design.md`): the fields an electric drive needs so that choices change the
  result (rotor size, poles, turns, magnets, cooling, inverter, battery, reduction), each with a cost, and the
  physics each is derived from.
- **Decided:** the split with the joined `index.html` committed; a freeze on changes that move a number from step 0
  until step 1 merges; electric as v0.7; a powertrain type in saves (old saves read as combustion); electric in the
  engine-type dropdown; a motor dyno without a cutaway; mixed race fields with no charging mid-race.

### Springs and anti-roll bars per axle (build 174)

- **FRONT SPRINGS, REAR SPRINGS, FRONT ANTI-ROLL BAR, REAR ANTI-ROLL BAR** on VEHICLE, each SOFT −2 … STIFF +2 about
  the kit, in place of ROLL BALANCE. Off STANDARD they are new parts ($400 an axle for springs, $250 for a bar) and
  the car reads *(modified)*; REFIT puts them back.
- **The roll is the car's own.** Until now each kit rolled a fixed 6 / 4 / 2.5 / 1.5 deg/g on every car. The kit is
  now a ride frequency (COMFORT 1.0 Hz, SPORT 1.25, COILOVERS 1.6, RACE 2.0; passenger cars 0.5-1.5 Hz, OptimumG),
  which gives each wheel's rate k = (m_axle/2)(2πf)² and each axle's springs a roll stiffness m_axle (2πf)² t²/4. A
  bar adds 55% of that at STANDARD, a third of the total, the one figure that brings a typical car (roll arm 0.40 m,
  track 1.55 m) to the old skidpad numbers: 6.1 / 3.9 / 2.4 / 1.5 deg/g. The body rolls by its roll moment over the
  roll axis, m g (h − z_axis), over both axles' stiffness: the tall, narrow Alto Works rolls 9.2 deg/g on COMFORT,
  a 911 GT3 2.1 on COILOVERS, and stage 1's high roll centres now roll a car less.
- **The balance from the stiffness.** The elastic part of the load transfer splits by each axle's share of the roll
  stiffness: at STANDARD m t², the weight split on equal tracks (build 157's NEUTRAL), and a wider axle is stiffer.
  A spring step is 1.3× the rate, a bar step 1.5× the bar: about 4% of the transfer, the old ROLL BALANCE step.
- In a steady corner springs and bars both just add roll stiffness, so here they do the same job; the springs also
  set the ride frequency the dampers (stage 3) will work against.
- **Effect:** laps −0.3% to +1.0% against build 173. Kei and city cars on COMFORT roll more and lose most; low,
  wide supercars roll less and gain a little. The summary shows the car's roll in deg/g; the guide's *Suspension,
  roll & camber* page explains it, in Greek too.
- Saves from before carry ROLL BALANCE: it becomes the front bar.
- Fixed from build 173: the Greek label for a MacPherson strut was half in Latin letters (ΓΟΝΑΤΟ ΜΑΚΦΕΡΣΟΝ now).
- **Tests:** test95 (new): the kits on a typical car within 10% of the old figures; STANDARD splits by the weight on
  equal tracks; the M3's roll and split are the formula; a bar step moves 2-6% of the transfer, front forward and
  rear back; stiffening reduces roll; the steps are the factory fit, cost and reach the line cache; the lap balance
  follows the front bar; a kei car rolls more than a 911; an old ROLL BALANCE becomes the front bar; REFIT; Greek.
  test85 uses the front bar.

### Suspension geometry per axle (build 173)

- **FRONT GEOMETRY and REAR GEOMETRY** on VEHICLE: MacPherson strut, double wishbone, multi-link, twist beam (rear
  only, it cannot steer) or solid axle. Until now the setup (COMFORT … RACE) was the whole suspension, the camber
  the geometry won back from the roll was half for every car (`CAMBER_RECOVERY`), and front and rear shared one
  track. Fitting a geometry the car was not built with is a conversion: it costs, and the car reads *(modified)*.
- **Camber recovery from the geometry.** An independent wheel swings about its front-view instant centre, so
  rolling the body by φ lifts the outside wheel φ·t/2 into bump and turns it back by that over the swing-arm length:
  recovery = (t/2)/fvsa, from the axle's own track (Milliken & Milliken, *RCVD* ch. 17). A strut's instant centre
  is far out (~3 m: about a quarter back), unequal wishbones bring it in (~1.6 m: about half), a road multi-link
  sits between (~2 m). A solid axle keeps both wheels square to the road (all of it, and no static camber, the axle
  sets it); a twist beam is two trailing arms tied by a beam about 40% of the way back (0.4).
- **Roll centres split the load transfer** (*RCVD* ch. 18). Each axle's own mass at its own roll centre pushes on
  its tyres through the links; the rest, the body rolling about the line between the roll centres, goes through the
  springs and bars by the roll balance as before. Strut, wishbone and multi-link sit at 60-100 mm and a twist beam
  at 125 (rear independents 80-150 mm, twist beams 100-150 mm: Wang et al., VEHITS 2019); a solid axle's Panhard rod, Watt's link or leaf springs put
  its roll centre at its wheel centre. With both roll centres on the ground this is build 157's split exactly. A
  solid rear axle moves the transfer rearward: the AE86 53% → 42% front, the Silverado 62% → 50%.
- **Each axle's transfer over its own track.** The 42 real cars carry their published front and rear tracks and
  their suspension (maker sheets where found: BMW, Porsche, GM, Nissan; spec databases otherwise; eight marked
  unsure). The archetypes keep one track for both ends and take their class's geometry (a hot hatch strut and twist
  beam, a muscle car wishbones and a live axle, a supercar wishbones all round).
- **Effect:** laps −0.3% to +0.6%. Strut-front cars lose a little front grip in roll and are slowest to change;
  wishbone cars barely move. The AWD Diablo VT's narrow front track (1.54 m against 1.64) turns it from oversteer to
  understeer; the 812's multi-link rear tips it the other way.
- The VEHICLE summary shows the geometry, both tracks and the front's share of the load transfer; the spec sheet
  lists the geometry; the guide's *Suspension, roll & camber* page explains it. Greek throughout.
- The racing-line cache key now includes the roll balance, the front tyres' rating and the geometry; changing
  ROLL BALANCE alone used to reuse the old line.
- Saves from before carry no geometry and take the factory's (a real car's from its name).
- **Next:** springs and anti-roll bars front and rear as soft-to-stiff steps, giving the roll gradient and the
  roll-stiffness split; dampers wait for a transient or roughness model.
- **Tests:** test94 (new): every real car loads its own geometry and tracks and is its own factory fit; recovery is
  (t/2)/fvsa; the split is the roll centres plus the roll stiffness and reduces to build 157's on the ground; a
  solid rear axle moves the transfer rearward, has no static camber, costs and is a modification; strut < wishbone
  < solid axle in camber kept at 1 g; a wider front track helps the front alone; old saves; archetypes; the twist
  beam only at the rear; Greek. test85's symmetric car is now symmetric in track and geometry too.

### The diesel governor (build 172)

- **A diesel made its peak power at its redline.** It was fuelled at its smoke limit (or its turbine's temperature
  limit) all the way up, which no diesel does: the Cummins's 400 hp at 2800 rpm came out as 546 hp at 3500, and the
  other diesels carried boost tapers, solved to their ratings, in place of what was missing.
- **Every diesel has a governor.** From its rated speed (the breakpoint, where it makes its rated power) to its
  governed maximum (high idle) the full-pedal fuel is taken away in proportion to the speed, until what is left only
  holds the engine there unloaded (Bosch, Governors for Inline Injection Pumps; Cummins: the breakpoint is where the
  governor begins to reduce torque below rated power, the span to high idle its droop). The share left at the
  maximum is solved on the engine's own torque, which is zero there. The ECU's boost target follows the fuel it
  injects (Bosch, Diesel-Engine Management), so it falls with the governor to none at the maximum; held at full-load
  boost the lean, cold exhaust needed a closed turbine and the pumping loss ate the work.
- **New design field DIESEL RATED SPEED (rpm, 0 = off)**; the governed maximum is the redline. The real diesels take
  their makers' rated speeds: TDI 4000 (110 kW at 3500-4000), N57 4000, Duramax 2800 with GM's maximum powered speed
  3450 as its redline (it was 3800, unsure), Cummins 2800. The archetypes take 0.81 of their limit, the L5P's ratio.
  The diesel redline range now starts at 2000 rpm (truck diesels govern near 2100), in 50 rpm steps.
- **Tapers re-solved** under the same rule as before (the gentlest from the torque peak that meets the rating): TDI
  54 -> 44%, N57 58 -> 54%, Duramax 26 -> 51% (half the boost it threw away before). Each peaks at its rated speed
  now: Duramax 445 hp at 2800 (real 445 at 2800), N57 254 at 3900 (254 at 4000), TDI 149 at 3600 (148 at 3500).
- **The Cummins** peaks at its rated 2800 rpm (it was 3500) and makes 471 hp (546). No taper reaches its 400: its
  1356 Nm is 25.4 bar BMEP, above the soft ceiling dieselImepLimit puts on a diesel (about 22-24 bar, from passenger
  and built diesels), so its midrange is short (1219 Nm) and its top end high. A peak-cylinder-pressure limit derived
  for heavy-duty engines is the next item.
- **Tests:** test93 (new): the law (proportional to speed, the leaner mixture, the cooler exhaust, zero torque at the
  maximum), every real diesel's peak at its rated speed, nothing changed below it, the field and the save.
  test47 (torque steps), test52 (map against best-power torque) and test54 (boost never falls) stop at a diesel's rated
  speed: past it the torque and the boost go to nothing on purpose, and a step or a ratio against a torque near zero
  means nothing.

### Automatic and dual-clutch shifts keep the drive; the 6.6 V8 diesel's turbo (build 171)

- **The drive was cut on every upshift, whatever the gearbox**, for its shift time: right for a manual (clutch out)
  and a sequential (ignition cut), wrong for a dual-clutch box and a planetary automatic. Those shift clutch to clutch:
  the oncoming clutch takes the torque as the off-going one lets go (the torque phase), then slips while it pulls the
  engine down to the new gear's speed, the ECU trimming the engine's torque to keep it smooth (the inertia phase). The
  output never drops below the next gear's (GM's power-on upshift patents US 5046383, US 7762925, US 9327733; Goetz,
  Levesley & Crolla, Proc IMechE D 219, 2005). GEARBOX.powershift marks them; their shift time stays as how long the
  change takes, and they cut no drive, in the 0-100 and on the lap. The turbo no longer lifts through their shifts.
- **The 13 automatic and dual-clutch real cars:** 330d 6.63 -> 5.94 s (real 5.6), Duramax 8.96 -> 7.81 (8.0), Hellcat
  5.14 -> 4.69 (3.9; the rest of its gap is not the gearbox), the dual-clutch cars 0.04-0.12 s quicker. Across all 42
  cars the 0-100 error is 10.6% -> 9.4%.
- **test41 (calibration):** the M2's eight-speed is 21.6% -> 3.9% off, the GTI's DCT 9.8 -> 7.8%, the RMS 12.3% ->
  8.3%. Both cars return to the default 8% cap and the budget comes down from 12.5 to 9.
- **The driver at an apex.** Where the solve asks for a hair of slowdown on the grip limit (122-123-123 km/h), the
  pedal target is zero for a point; the foot's corner averaging left those out and snapped the pedal shut. A drive cut
  hid it on the 720S at Spa. Corner points asking for no drive are averaged in unless the brakes are working there.
- **The 6.6 V8 Turbodiesel archetype** carried the medium frame (71 mm), the same as the 3.0 BMW six: at the limiter it
  asked 111% of that compressor's choke flow. It now carries the large frame, as the Duramax of the same size does:
  548 hp (468), the compressor at 76% of choke, the expansion ratio at the limiter 3.2 (4.7), half boost at 2167 rpm
  (1605).
- **Tests restated:** test82 finds a shift from the gear changing where the box keeps the drive (it looked for the
  cut), judging those made while accelerating; test76's heavy-car line 900 -> 950 C (the Hellcat reaches Spa's braking
  zones faster now: 886 -> 911 C).

### The GEAR RATIOS window (build 170)

- **A window over the vehicle tab**, opened by GEAR RATIOS… beside GEAR SPACING: the spacing as buttons, a slider per
  gear (its ratio and its road speed at the limiter, on a log scale), the final drive with AUTO (published or
  matched) or set by hand, RESET to the stock box, and where the ratios come from. Every change is the car's own: it
  goes into the form as CUSTOM ratios or a hand-set final drive and the car is rebuilt, so the read-out (0-100, 0-200,
  top speed, an Ashdown Park lap) is the model's. A moved gear stays at least 1% from its neighbours; the GEARING
  slider is off while a final drive is set by hand.
- **Engine rpm against road speed:** each gear a ray to its limiter, and over them the path the 0-100 run takes: its
  launch revs, its own shift points (simulateAccel now records them) and the drop at each; the band from peak torque
  to peak power, the limiter, the top speed.
- **Drive at the wheels against road speed:** T(N)·i·i_f·η/r in each gear, the best of them, the ideal of a gearbox
  with infinitely many gears (P·η/v, from the same torque curve), the space between the two (what the gaps cost),
  drag plus rolling, and the driven tyres' grip at rest.
- Gears are told apart by their number on each line, not by colour (ten are more than colour carries); one accent
  marks what the car does. The gear under the pointer or the keyboard is lit in both graphs; both have a hover
  read-out. On a phone the panels stack and the graphs are 4:3. Greek throughout.
- **Tests:** test92 (new): opening and closing, the controls are the car's, the path is the run's own shifts (each drop
  the next ratio over this one), the force graph is T·i·i_f·η/r and never above the ideal, every real car opens it,
  a phone, Greek.

### Gear spacing from real gearboxes, and the real cars' own ratios (build 169)

- **One box for every car.** Every car with the same number of gears ran the same ratios: an even progression from
  3.35 to 0.82, stretched a little by the gearbox type (sequential 0.88, auto 1.10, numbers with no source). A
  4-speed spanned what an 8-speed did, the steps never shrank towards the top, and a Golf shared its box with a 911.
- **The textbook's progressive design** (Naunheimer et al., *Automotive Transmissions*, §6.3):
  i_j = i_n · φ1^(n−j) · φ2^((n−j)(n−j−1)/2). Fitted to the 30 distinct published boxes now in the file, the span
  grows with the gear count as ln(span) = 0.065 + 0.910·ln(n−1). φ2 falls as gears are added (about 1.1 on a
  five-speed, 1.02 on the ten-speed Allison), so a fixed φ2 turned a ten-speed's top gears back on themselves; what
  holds steady is the share of the span the progression makes (the middle half of the boxes
  between 0.28 and 0.45, with no trend in the gear count), and that is what the model keeps.
- **GEAR SPACING: CLOSE RATIO / STANDARD / WIDE RATIO** are the lower quartile, median and upper quartile of those
  boxes, in span and in progression. A six-speed spans 4.2 / 4.8 / 5.1. The gearbox type no longer spaces the
  ratios; test28's check that it did is restated.
- **The real cars' own boxes.** 33 of the 42 presets carry their published ratios and final drive, each with its
  source (Toyota, Audi, Porsche, GM and BMW sheets where found, spec databases and owners' forums where not, the
  weaker ones marked). Boxes with two final drives (GR Yaris, RS3) are stated against one. The McLaren F1's quoted
  2.37 final drive leaves out a drop gear: Autocar's measured 8.71 mph per 1000 rpm in 1st gives 2.98. The other 9
  take the average spacing of the published boxes in their family, with the final drive matched to the engine as
  before; the 330d and 500 TwinAir use their published ratios with a matched final drive. The GEARING slider biases
  a published final drive just as it biases a matched one.
- **Up to 10 speeds**, so the Duramax runs its ten-speed (its note that the model stopped at 8 is gone).
- **CUSTOM ratios and a hand-set final drive** are in the model and saved with the car; the window to set them is
  the next build. A custom set out of order is refused.
- **Against the published figures** (all 42 cars): 0-100 mean error 10.5% -> 10.6%, top speed 3.1% -> 2.8%. The F1
  now tops out at 365 km/h on its 7500 rpm limiter against the 386 quoted; the measured gearing says the limiter,
  not the air, stops it there.
- **The driver through a sweeper.** The 720S's real box put it in 3rd near the limiter through the mixed circuit's
  long double-apex sweeper, where the line's corner speed flickers point to point (150, 211, 158, 205 km/h). The
  foot's corner averaging took only the corner's own points, so two points between the apexes asked for full
  throttle between two holds: three stabs. It now averages every driving point in the steering window.
- **Tests:** test91 (new) checks the spacing, recomputes the constants from the published boxes, every published
  set against its preset, the real cars, custom ratios, and the save. Restated, each with its reason in the file:
  - test28: the gearbox type no longer spaces the ratios (its spread multipliers had no source).
  - test41 (calibration): the gearbox is matched to the real car where it is known, as power, mass and driveline
    already were: the Supra, STI and Alto run their published boxes, the GTI and M2 their real gear counts. RMS
    11.6% -> 12.3% (budget 12.5). The M2 is 16.5 -> 21.6% (cap 17 -> 22): its eight-speed makes seven shifts to 100,
    and the model cuts the drive for a fitted 0.20 s on every automatic shift, where a ZF hands the torque between
    clutches under load. That shift is the next item it exposes.
  - test83: the Hellcat's own box has an 18% shorter 1st; held at the best slip through it, the spin is 2nd gear's
    alone, so traction control off now costs 0.5%, not 5%. The bar is that it is slower, with the spin still checked.
  - test76: the GTI's Spa rotor peak is 701 C against a 700 C line it sat 1 C under; the line is now 710.

### The VGT's vane ring sized by its own geometry, and paying its efficiency (build 168)

- **The ring was the fixed housing's size.** The vane ring's throat was A(beta) = h(2 pi r2 sin beta - Z t) in the
  comment, but in the code it was the frame's fixed-housing volute throat (from its A/R) scaled by sin beta: a VGT
  could never pass more than a fixed housing of the same A/R. On a VGT the volute only feeds the ring; the throat
  is the vane passages. Sized off the A/R, the 2.0 TDI's ring opened to 327 mm2, and wide open it still made 2.2x
  the power its compressor needed at the limiter: an expansion ratio of 5, the exhaust manifold near 5 bar where
  TDI owners measure about 3, and the vanes pinned open from 2000 rpm.
- **Now the formula, with the ring's own proportions** scaled to the turbine wheel: the vanes' trailing edges at
  1.22 x the wheel's tip radius (1.2-1.25 in a variable-geometry turbine patent, US 12055050) and a nozzle height
  of 0.07 x its diameter (GT2011-46148; 0.057 in the ETN D1.8 radial-turbine design; 0.07-0.1 for rotor inlet
  widths), the middle of the published range. The 21-60 degree sweep and 12 vanes of 1.5 mm are as they were. The
  small frame's ring opens to 487 mm2 (165 shut, 2.9:1); the large one's is nearly unchanged (1294 against 1183).
- **The ring pays in efficiency.** Its vanes need running clearance at their ends, and the leakage and the vanes'
  own losses cost a VGT about 2 points against a fixed nozzle (Jiang et al. 2024), ~1 as the vanes open and ~5 as
  they close (Gao et al. 2018): 5 points shut to 1 open, linear in the vane position (vgtEtaFactor). That and the
  petrol vanes' creep limit are its price; it was "it flows less at the top", which was the A/R sizing.
- **The A/R choice is a fixed housing's**: with the vane ring setting its own throat the TURBINE A/R selector
  is disabled on a VGT.
- Result (expansion ratio at the limiter, before -> after): EA288 2.0 TDI 3.59 -> 2.41 (vanes 62% open at 2000
  rpm, were 100%), N57 3.0d 2.93 -> 2.36, the 2.0 TDI archetype 5.03 -> 3.37; power EA288 149 -> 154 hp (real 148),
  N57 255 -> 258 (254), Duramax 445 -> 446 (445). The 6.6 V8 archetype (4.73) and the Cummins (4.24) still run
  their manifolds hard at the top: their frames look small for their flow, a hardware question left open.
- Tests: test49's price is restated (the vane ring's efficiency loss at one throat, 1.4% of the power open and
  7.1% shut, instead of a top-end comparison against a volute the ring was sized off; the ring's radius in the
  published range); test55 has the A/R choice leave a VGT alone and greyed out.

### A lap result no longer turns into the next one (build 167)

- **The bug.** About one run in forty, a car's lap of one circuit came back as its lap of another: a Golf's
  technical-circuit lap read 196.38 s, its Spa time to fifteen digits, with Spa's brake temperature (test76
  failed on it at random). The lap was right when simulateLap returned it; it changed while the next lap was
  being solved, and only its numbers changed (lap, lengths, average and top speed), never its arrays or its
  track. That is a V8 bug, not the model: in code compiled by Maglev's on-stack replacement, object literals
  returned by a function with hot loops can share the boxes behind their number fields, so a later result's
  stores write through to an earlier one (nodejs/node#66457, V8 issue 547819997; fixed in V8 15.2, Chrome 152;
  the suite's Chromium is 141, and browsers before 152 have it).
- **The repair.** simulateLap and simulateAccel are thin wrappers now: the solve runs in simulateLapRun /
  simulateAccelRun, and its result is copied (detachResult: the result and the plain objects inside it, such as
  the balance and the 0-100 run's marks; arrays and the track stay shared) outside the loops, into objects of
  its own, before anyone holds it. A race, a comparison, the garage: anything that keeps one result while
  solving another now keeps the right one. Nothing the model computes changed.
- Checked on the sequence that failed (MX-5, GR Yaris and Golf GTI, each the technical circuit then Spa, a fresh
  browser each run, the first lap's numbers read again after the second is solved): before, 5 wrong in about 180
  runs; after, 0 in 100. No test can catch it on demand (it needs Maglev to compile, deoptimise and land on the
  same site at the right moment), so the wrapper is the guard, and this note is why it is there.

### The live cutaway's tracts to scale, the header's wave, the compressor map (build 166)

- **The intake was a straight pipe with a throttle, the exhaust a straight pipe ending in mid-air.** Now the runner
  and the exhaust primary are drawn at one scale, 4.5 mm to a drawing unit (TRACT_MM), so a torque manifold's 460 mm
  runner and a race header's 750 mm primaries look as long as they are against short ones. The intake carries the
  air filter (by its grade, or an open bellmouth), the throttle body and a plenum; individual throttles are a
  trumpet, a sock and a butterfly on each runner; a carburettor sits on the plenum with its air cleaner, and no
  injector is drawn (the carb meters the fuel). A variable manifold shows its second plenum and the flap, open or
  shut as the fill table chose (it now remembers which runner length won, runnerLAt). The exhaust: the primary (a
  stock cast manifold short and fat), the collector, the cat and the silencer; a turbo's cat and silencer sit on
  the downpipe.
- **The header's wave.** The blowdown pulse leaves the port at EVO, runs the primary at the speed of sound in the
  gas and comes back, flipping to a suction at the open collector, for the primK round trips the header model cut
  it for (headerReturnAt: at the header's target speed and design temperature it lands exactly theta = dur/2 + 90
  after EVO). The readout says where it comes back, and turns green, SCAVENGING, when both valves are open then: an
  F355 at 8250 rpm, never a stock cam's negative overlap.
- **Compressor map** for turbo engines: the model's efficiency islands (compIslandEff), its choke line, the
  engine's full-throttle operating line (the steady boost at each rpm) and the compressor's live point with its
  trail. The model has no surge line, so none is drawn. A **boost bar** with the target marked, turbo or blower.
- **Flow** dashes pack with the mass flow (vizFlowFrac), sparse at idle and dense flat out at the limiter.
- Finding, not changed: the fill table keeps a variable manifold on its long runner almost everywhere (a Huracan
  to 8800 rpm), later than a real switching manifold changes over.
- Tests: new test90 (runner and primary to the model's lengths, the header's return at its design angle on four
  headers, scavenging only with both valves open, the flap against the fill table, the map's operating line, the
  flow density, every intake system and filter drawn).

### The live cutaway's head, timed by the model (build 165)

- **The valves opened at fixed angles** on the LIVE cutaway, intake 20 BTDC to 50 ABDC on every cam, and the spark
  fired at 340 degrees on every engine. Now the events are the breathing model's: duration and lobe separation from
  the cam profile, the intake lobe advanced as far as the fill table puts the phaser at this rpm (camAdvAt, which
  ivcAt now reads too), lift from the cam's L/D on the model's valve, drawn to the bore's scale. The left column
  lists them: a stock cam's slightly negative overlap, a race cam's 72 degrees, the phaser's advance, the lift.
- **The valvetrain is drawn.** Four- and five-valve heads get two overhead cams over bucket followers; two-valve
  engines get pushrods (the two-valve presets are the American V8s): one cam in the block, pushrods up the wall to
  rockers under a cover. The lobes are ground to the same half-sine the valves follow and point at their followers
  at full lift; springs, ports curving down to the seats, and a pent-roof chamber with the plug at its peak.
- **The spark fires at the model's advance**, and the flame spreads from the plug over the same Wiebe burn
  (SI_BURN_DEG, WIEBE_A/M) the model's work uses. On the share of cycles the knock model detonates, the end gas
  at the bore wall goes off ahead of the flame, with its pressure waves. A diesel's sprays go in just before TDC
  (SOC_CI) and burn over BURN_T_CI. Injection is drawn at a typical calibration's timing (port: on the shut
  intake valve; direct: early in the intake stroke), its length growing with the fuel per cycle.
- **Valve float**: past the model's float speed the valves bounce off their seats instead of following the cam.
- The stroke name and the knock flag moved to the title bar (the cam cover sits where the stroke name was; the
  knock flag ran over the crank's output); the turbo's AIR IN label moved clear of the block.
- Tests: new test89 (the events against the breathing model with and without VVT, full lift at the centreline,
  the spark at the model's advance on two engines, the Wiebe burn, OHV against DOHC, float exactly past the float
  speed, every preset drawn round its cycle with knock on).

### The live cutaway's turbo and supercharger, drawn as they are built (build 164)

- **The turbo was a fan.** On the LIVE cutaway it was a circle with six spokes hung off the intake pipe: no turbine,
  no exhaust reaching it, spun by the manifold pressure. Now it is two snail housings on one shaft, end-on. The
  exhaust manifold feeds the turbine through its inlet duct and the scroll narrows as the gas spirals onto the
  wheel; the compressor's scroll widens round its wheel (backward-swept blades and splitters) to an outlet along
  the tangent, and on one shaft both turn the same way. The charge pipe runs under the engine, up through the
  intercooler to the throttle, coloured by its temperature (the compressor's outlet temperature, now one function
  that the intake temperature also takes its rise from).
- **Turned by the model.** The wheels spin with the shaft speed the spool model integrates (they followed the
  manifold pressure), at a readable pace, with the speed in the readout. The wastegate opens when the model holds
  its target and shuts while spooling or lifted; a variable-geometry turbo has no gate and its vane ring opens as
  the model schedules the throat; the blow-off valve vents once on a lift; anti-lag pops at the turbine inlet. The
  readout's compressor flow is live (share of choke flow), not the design point's.
- **Superchargers** are belted to the crank, the pulleys sized by the drive ratio: Roots rotors (3 lobes, a
  figure-eight casing) and twin-screw rotors (4 lobes driving 6 flutes) turn with the crank at their ratio, a
  centrifugal is a compressor scroll on a 12:1 step-up.
- **Layout.** VE and cam moved to the left column, fuel & spark to the bottom right, the rotary's labels clear of
  the turbo; the turbo's pipe no longer runs over the MAP/IAT labels, and a motored engine no longer reads "-0 HP".
- Tests: new test88 (scroll directions, spin with the shaft and not the manifold pressure, the wastegate and the
  vanes against the model, the Roots ratio, the charge temperatures, every preset drawn open and closed).
### Circuits, messages and the DYNO chart in Greek (build 163)

- **The 22 real circuits' descriptions** were English under the map on TRACK: only the four test circuits had Greek, and
  the Greek sweep only ever looked at the default circuit. Each now names its place in Greek and its sources (TUM,
  f1-circuits or OpenStreetMap, the terrain model, the fit) as the English does. The GPX import's description too.
- **The status messages** (about 30: saving, loading, opening and sharing builds, reports, GPX import, nitrous, wear,
  logged pulls) go through `tr()`, with file and car names kept as they are.
- **The DYNO chart**: its title, the peak labels, the grade, the scorecard line, the cost and lap, the LOG PULL hint and
  the objective verdict, which also used the objective's English name. Its verdict sat at a fixed spot that the cost
  line ran into once it carried the lap and the circuit (in English too); it is now right-aligned to the chart's edge
  and drops to the next line when the two do not fit.
- A race names your car by its chassis in the interface's language (ΣΠΟΡ ΚΟΥΠΕ, not SPORTS COUPE).
- `trIn(context, text)` generalises the dropdown lookup: the same English can need other Greek in another place
  (`opt:RACE`, `msg:IMPORTED` beside the circuit list's IMPORTED group, `dyno:NOT MET` where the chart has less room).
- Still English: the labels painted inside the guide's pictures, and the PNG/PDF reports.
- Tests: test87 also checks every circuit's description and every `trIn()` lookup has Greek, and that no status message
  is an untranslated literal; run against build 162 it fails on both, as it should.

### The guide in Greek (build 162)

- **All 60 guide pages have Greek.** The 184 blocks that were English (37 pages entirely, and the real-car and
  physics levels of the other 23) are translated, each saying what its English says: the same links, tables,
  formulas and limit notes, with the words inside formulas in Greek too. The interface's own words are used where
  the guide names a control (ΚΑΤΑΣΚΕΥΗ & ΔΥΝΑΜΟ, ΣΤΟΧΟΣ BOOST, ΤΕΛΙΚΗ ΣΧΕΣΗ), so the guide matches the screen.
  The glossary keeps each English term beside its Greek one.
- **The rest of the guide's text:** its 62 picture captions and every "See also" line (each link named by the page
  it opens). The OPTIONS page no longer says that new pages appear in English.
- **Still English:** the labels drawn inside the guide's pictures (TURBINE, COMPRESSOR...), which are painted on a
  canvas.
- Tests: test87's guide budget is 0, and it checks every picture caption has Greek. test73's fallback check (a block
  with no Greek shows its English) took its untranslated block from the guide; with none left, it removes one
  block's Greek for the check.

### The Greek interface, finished (build 161)

- **Everything outside the guide now has Greek.** A sweep of the app in Greek found the interface had grown in
  English since the translation was made: 9 `tr()` calls with no Greek (the tyre speed-rating warning and the
  variable-geometry turbine readouts among them), every dropdown on ENGINE and VEHICLE, the newer ENGINE fields
  (eccentricity, intake runner, valves, valve float, cam overlap), the speed limiter and tyre rating, the design and
  vehicle summaries, the status bar and the help lines, the knock and health readings, ~30 tooltips and
  screen-reader labels, and 39 of the guide's 60 page titles. All have Greek now. Terms Greek enthusiasts use in
  English (BOOST, ECU, LSD, VVT, ROOTS), units, and the names of real cars, engines and circuits stay as they are,
  as the existing translation already did.
- **Switching language mid-session refreshes everything.** The top bar, the engine and car pickers, the subtitle,
  the design summary and the runner and scavenge readouts kept the old language until something else redrew them.
  Dropdowns translate in place; the pickers filled from data re-label themselves rather than have their Greek
  cached as the English.
- **Words that read differently by context.** "RACE" is the RACE tab (ΑΓΩΝΑΣ) and a cam or spring grade
  (ΑΓΩΝΙΣΤΙΚΟ), so a dropdown choice looks up `opt:` + its text first. The table carried `'LOAD'` twice, so the
  diesel fuel map's load axis read ΦΟΡΤΩΣΗ (loading, the button's word); it now uses the load key. "Induction" was
  ΥΠΕΡΤΡΟΦΟΔΟΤΗΣΗ (forced induction), which beside "naturally aspirated" said the opposite; it is ΤΡΟΦΟΔΟΣΙΑ ΑΕΡΑ.
  The sound option's note sent Greek players to the DYNO and TRACK tabs, which in Greek are ΔΥΝΑΜΟ and ΠΙΣΤΑ.
- **What builds 156-159 added** is in too: the ROLL BALANCE choices (ΜΑΛΑΚΗ / ΣΚΛΗΡΗ ΕΜΠΡΟΣ). SYNTH and GAS stay as the
  sound models' names.
- **The guide followed in build 162.**
- Tests: test87 sweeps every tab in Greek, on a load in Greek and after switching mid-session, and fails on any
  English word outside the kept terms, units and names; checks every `tr()` literal, guide title and category has
  Greek and that no key is in the table twice; checks switching back to English leaves no Greek; and holds the
  guide's untranslated blocks to a budget (184) that may only go down.
### Turbo sounds by size, anti-lag bangs, the supercharger whine reworked (build 160)

- **Turbo by size.** The whine's power goes with the air through the compressor, so its amplitude scales
  with the exducer against the medium frame's 71 mm; a blow-off valve is sized to its compressor, its bore
  (and jet noise's amplitude) with the exducer, and its hiss lasts the charge volume over that bore. Two
  turbos add their power. The Fiat 0.9 TwinAir's 40 mm wheel now blows off 18 dB under its exhaust, a
  71 mm one 8 dB under.
- **Anti-lag bangs.** On a lift above 2500 rpm anti-lag keeps the fuel and fires late, so the charge burns on
  in the manifold: a `bang` voice in the pulse worklet, bigger and longer than a crackle (3 ms) and deeper
  (low-passed, so the exhaust system rings), a third of the firings, with crackle between. A cat takes less
  of the edge off it than a crackle (it goes off before the cat). The turbo keeps whining on the lift.
  About 18 dB over a plain overrun; heard in GAS mode too.
- **Supercharger reworked.** It sang three pure sines at 0.10 from idle (0.35 of it with no boost) and covered
  everything. The whine is now mostly noise in a narrow band at the lobe/blade pass with a little tone
  (blowers whirr), rolled off where the intake ducting soaks it up (2.5 kHz for a Roots or screw, 6 kHz for
  a centrifugal). A Roots or screw's bypass is open off boost, so its whine comes in with the boost squared
  (20 dB down off boost); a centrifugal's goes with its impeller speed squared. A twin-screw is a 4-lobe male
  rotor on 2.4:1; a centrifugal counts its 7 full blades. Flat out a Roots sits 17 dB under the exhaust, a
  screw 19, a centrifugal 24.
- test86 pins all three; test69's whine check now asks for a whine concentrated at its pitch, not pure.

### The sound no longer cuts out on a lift (build 159)

- On an injected engine a lift cuts the fuel (DFCO), and the exhaust's pulse strength fell to a tenth of a
  near-empty charge (0.014 on a closed throttle): both sound models dropped 31-35 dB within a few tenths of
  a second. The cylinders still pump the air they draw down the pipe, fired or not; the gas model with the
  fuel off puts 7-17% of its flat-out signal there at 60% of the redline. `exhaustStrength` now floors the
  exhaust at 0.2 x rpm/redline under both models, so an overrun sits about 10-15 dB under the pull and
  fades with the revs. soundDrive's own strength is unchanged: the crackle's pipe heat and the knock read it.
- The GAS leveller came back up over 0.3 s, leaving a hole after every lift as its gain lagged the falling
  signal; it now recovers in 60 ms.
- test84: a pull and a lift through the real sim and both chains; the overrun within 25 dB of the pull, fading.

### GAS for two-strokes and rotaries (build 158)

- The GAS sound model now covers every type the designer builds. Two new kinematics share the gas
  volumes, collectors and audio pick-off with the four-stroke:
  - **Two-stroke**: a piston-ported cylinder on a 360 deg cycle, scavenged by its own crankcase (the
    piston's underside pumps it, crankcase compression 1.35). A reed valve admits charge from the runner
    only while the runner is above the crankcase, the transfers carry it to the cylinder, the exhaust port
    lets it out into the expansion chamber. Port area is width x the height the piston has uncovered:
    exhaust 0.70 bore, transfers 1.1 bore in all, reed 0.45 of the piston area. The breathing model has no
    port timing, so `TWO_STROKE_PORTS` states it by cam choice (exhaust 180/190/198 deg, transfers
    120/126/132). The 500cc twin makes 4.0 bar IMEP flat out: an untuned pipe, since a lumped volume cannot
    carry an expansion chamber's returning wave (bigger ports moved it only to 4.5).
  - **Rotary**: three chambers per rotor, each through its four strokes over 1080 deg of the eccentric shaft,
    a chamber 360 deg behind the next, volume Vmin + Vd (1 - cos(2 pi phi / 540)) / 2 with
    Vd = 3 sqrt(3) R e B (654 cc on a 13B). The chambers share the rotor's side intake ports and peripheral
    exhaust port at the 13B's published timing (exhaust 75 deg BBDC to 48 ATDC, intake 32 ATDC to 50 ABDC),
    with a 40 deg ramp as an apex crosses an edge; ports 0.07 and 0.09 R B. The Renesis makes 10.3 bar
    IMEP at 4000 rpm (real: ~11-12 from its 211 Nm).
- Port flow constants come from area: engine-sim's k is Cd A / sqrt(molar mass), which puts its 2JZ bench at
  13 cm2 of effective area against ~20 cm2 of valve curtain. Spark and burn by kind (`gasTiming`): a rotary
  burns over 100-130 shaft deg, its chamber long and thin.
- The per-build calibration averages six speeds instead of two: what the recorded exhaust passes swings
  about 2.5x with the firing frequency, and two points at 35%/70% of a 9000 rpm redline both sat in holes,
  leaving the rotary 3x too loud. Every type now lands within about 2.5x of the synth's level flat out.
- test84: every type can use GAS; a rotary plays through it live; the two-stroke and rotary IMEP, the 13B
  chamber volume, part throttle and finiteness.

### Axle balance (build 157)

- **The gap.** The lap pooled all four tyres' lateral grip into one number for the car, so no car could understeer
  or oversteer: the front and rear always ran out together. This was the biggest piece missing for handling (see
  the handling-dynamics review: full transient dynamics would cost the size of everything since build 97 and buy
  1-3% in chicanes; balance buys most of what matters inside the quasi-steady lap).
- **Each axle now has:**
  - its own normal load (its weight share, and its downforce share by the aero balance)
  - its own share of the lateral load transfer, the roll-stiffness split: **ROLL BALANCE** on VEHICLE, −2 to +2, 4%
    of the transfer a step, neutral at the weight split
  - its own tyres: **FRONT WIDTH**, entered for 23 staggered real cars (M3 E46, S2000, Supra, Corvettes, Mustang,
    911s and the supercars)
  - its own job: in a steady corner each axle must make the side force for the mass it carries
- **The car corners as hard as the axle that runs out first.**
  - A front-heavy car's front tyres carry more load each and grip less per kilo (load sensitivity), so hatches
    understeer.
  - Rear-engined 911s oversteer.
  - Staggered mid-engined cars land near neutral, as their narrow fronts intend.
- **Braking and power, per axle.**
  - Braking moves load forward, so into a corner the rear runs out first. The lap brakes no harder there than the
    rear can hold the corner, iterated until the deceleration and the load transfer it makes agree.
  - On power, the drive takes what the driven axle's own lateral use leaves.
- **TRACK** shows the balance (UNDERSTEER / OVERSTEER / NEUTRAL, which axle limits and by how much).

| Car | Balance | Riverside GP | Spa |
|---|---|---|---|
| VW Golf GTI | understeer 7% | +0.71% | +0.45% |
| Honda Civic Type R | understeer 8% | +0.94% | +0.73% |
| Mazda MX-5 NA | understeer 1% | +0.19% | +0.01% |
| BMW M3 E46 | understeer 3% | +0.41% | +0.17% |
| Porsche 911 GT3 991.2 | oversteer 6% | +1.03% | +0.76% |
| Dodge Challenger Hellcat | understeer 4% | −0.01% | −0.13% |
| McLaren F1 | neutral | +1.02% | +0.70% |
| McLaren 720S | oversteer 2% | +1.03% | +0.65% |
| Porsche 911 Turbo S 992 | oversteer 4% | +1.08% | +0.81% |

- **Laps run 0-1.2% slower.** Pooled grip was always the best case, and the axle that runs out first now sets the
  corner. Braking into corners is held back where the rear would let go.
- **What is still missing.** No yaw inertia, slip-angle build-up or transient load transfer: a car never slides or
  spins, and its balance is a limit, not a motion. Every car starts at NEUTRAL roll balance (a real road car's
  factory setup understeers a little more).
- `test85`:
  - a hatch understeers and a 911 oversteers
  - stiffer front bars move the balance toward understeer
  - narrow fronts move a mid-engined car toward understeer
  - braking moves grip from the rear axle to the front
  - a symmetric car is balanced
  - roll balance is part of the factory fit
  - TRACK shows the balance
- **Other tests updated:**
  - `test81` asks no axle for more than its grip, and its gear readout keeps every downshift run.
  - `test63` judges braking at the limit by the lap's own per-axle grip use, and counts the tyres' cornering drag
    with drag and the hill.
  - `test30`/`32`/`38` count the new BALANCE cell.
- **Speed.** The tyre's load-sensitivity curve is tabulated (16384 steps, within 2 parts in a million of the power
  law). It was a third of the lap solver's time on a long circuit, and the per-axle grip calls it more often.
  - **The 20 km import and solve:** 4.9-6.3 s on this machine, against main's 4.4-6.0 s.
  - **`test35`'s limit is now 6.5 s.** The 5 s it had was failing three times in four on main itself here.
### GAS: an engine sound simulated as gas, after engine-sim (build 156)

- **ENGINE SOUND MODEL** in OPTIONS: SYNTH (the default, unchanged) or GAS, remembered per browser.
- GAS ports the gas dynamics of Ange Yaghi's engine-sim (MIT; notice in `index.html` as `SOUND_GAS_LICENCE`):
  per cylinder an intake runner, the cylinder and an exhaust runner + primary, per bank a collector,
  each a lumped gas volume; compressible orifice flow between them (choked or subsonic) with bulk
  momentum and dynamic pressure; 10 kHz with 4 fluid substeps (engine-sim runs 8; 4 is within 5% rms).
  Built from the presets' own geometry: bore, stroke, compression, cam duration, overlap and lift, valve
  size (engine-sim's 2JZ flow bench scaled by area and lift), runner and header length, system pipe.
  The crank turns at our model's rpm and the plenum sits at its manifold pressure; the burn is a Wiebe
  curve whose heat share (0.50) is fitted to 13 bar IMEP flat out on the 1.6 sport four.
- The sound is engine-sim's: exhaust-runner gauge pressure delayed down the pipe, its audio chain
  (1.9 kHz band limit, jitter, DC removal, derivative, flow-modulated noise) and two of its recorded
  impulse responses (mild exhaust; minimal muffling for a race system) in a ConvolverNode, then the
  silencer, cat and turbine as a low-pass and a level, and a limiter.
- Loudness: the worklet levels the gas model's own swings (it is ~300x quieter at idle than flat out,
  on no single power law) and the loudness follows the synth's pulse strength instead; each build's
  impulse-response coupling is measured offline once (two short renders) so engines land within about
  2x of the synth's level. The turbo whine, blow-off, intake roar, knock and crackle keep playing from
  the synth, whose exhaust is muted. Rotaries and two-strokes stay on SYNTH.
- The prototype it grew from stays in `tests/proto/gas-sound/`. test84 pins the physics, the option and
  the live switch.

### The driver holds the launch slip; every car gets its best launch rpm (build 155)

- **The fastest launch is a small slip, and the driver finds it.** A sweep of the launch at fixed slip targets
  (best launch rpm each) puts the quickest 0-100 at ~10% slip on every car: 2% leaves most of the grip unused (a
  Hellcat 10.7 s), 25-50% slides the tyre (5.7-5.8 s), 10% gives 5.14 s, and 8-12% are within 0.5% of each other.
  The optimum is flat, so a driver feeling for it with the clutch and the throttle gets it. Without traction
  control the driver now holds that slip through the launch, in first gear; from the first upshift the run is flat
  out, and a car with the power for it spins in second (a Hellcat 0.6 s of wheelspin, 5.40 s against 5.14 with
  traction control). No new number: the driver holds the tyre's own optimum, the one traction control holds.
- **The launch rpm is the best of five for every car.** It was the driver's only, without traction control; a car
  with it launched at a fixed 55% of the limiter, which is no launch control's setting (a GT3 now launches at 6750
  rpm, not 4950). A torque converter still launches at its stall speed.
- **Result.** F355 5.48 -> 4.72 s (real 4.7), McLaren F1 3.78 -> 3.62 (3.2), MX-5 NA 8.48 -> 8.14, R34 4.56;
  0-100 RMS over the 42 real cars 16.1% -> 14.7%.
- Tests: test83 checks the driver's launch (an Aygo is as quick without traction control as with it, no
  wheelspin), the Hellcat's wheelspin after the launch, and a GT3 with traction control launched at its best rpm.

### The launch through tyre slip; traction control as a car's equipment (build 154)

- **The tyre slips.** The 0-100 run clipped the drive at the tyre's grip: a tyre held or it did not, it never spun,
  and at the clip the car got the tyre's whole force while its wheels and engine spun up for free. Now the driven
  wheels turn at their own speed and the tyre pushes through slip: sin(C atan(B s)), the shape of Pacejka's Magic
  Formula, peaking at ~10% slip (dry asphalt; 6-15% measured, one figure for every compound) and falling past it
  to 0.82 of the peak in a full slide (measured tyres 0.75-0.85). The wheels, and the engine through the gearing
  when the clutch is locked, are turned by the drive and held back by the tyre; the car is pushed by the tyre. The
  tyre is stiff against the wheel's inertia at walking pace, so the wheel is stepped implicitly. The engine revs
  with the wheels, so wheelspin shows on the rev counter and in the shift points.
- **TRACTION CONTROL (on/off), a new vehicle input.** On, the ECU trims the torque to hold the optimum slip. Off, the
  run is flat out after the clutch and the slip dynamics decide: the car on its own. A tester feathering the
  throttle by feel lands between the two, and how well is the driver; modelling that means tuning a controller to
  the magazines (a delayed lift-and-reapply driver was tried: it oscillated, McLaren F1 +40%), so it is not done.
  The tester's one skill credited is the launch rpm: without traction control the run is made from five launch
  speeds and the quickest kept.
- **Presets carry what the car had.** Without traction control: MX-5 NA, AE86, S2000 AP1, Supra A80 (unsure),
  R34 GT-R, Impreza STI GD, Evo IX, F355, Diablo VT, McLaren F1, 993 Turbo, RX-7 FD, Murcielago LP640 (unsure).
  The rest have it. The summary shows it, and the wheelspin time to 100 where there is any.
- **Result.** With traction control every car is ~2% slower (the engine's and wheels' inertia charged at the traction
  limit, and the shifts a little earlier by road speed), the cost the parked slip model measured. Without it the
  powerful rear-drivers spin: a Hellcat 5.14 s on, 6.40 s off (3.4 s of wheelspin); an Aygo 10.94 / 11.50 s. The old
  rear-drivers without traction control read slower than magazine testers, who feather the throttle (F355 4.79 ->
  5.5 s against 4.7, McLaren F1 3.8 s against 3.2): stated, not tuned. 0-100 RMS over the 42 real cars 14.1% -> 16%.
- Tests: new test83 (the curve, traction control on and off, the launch rpm, the setting as equipment and through a
  save). test41's caps and budget follow the ~2% (GTI Mk8 8 -> 10%, Supra A80 17 -> 20%, M2 14 -> 17%, RMS 11 ->
  12.5%), each by name with the reason; test61 retires the 750S from its slow cars (build 153's tyre review) and
  names the C8 Z06, whose 2.8 s reference reads as a rollout-timed claim (the one rollout-free figure is 3.54 s).

### Tyre review: each car's factory tyre, against its own skidpad and braking (build 153)

- **Why.** The fleet's 0-100 errors were worst on modern high-power rear-drivers (720S, 812, 750S, both Z06s,
  Hellcat: 18-30% slow, traction-limited for 3-4.6 s), and a car on the wrong compound class is the first thing
  to rule out. The classes are build 111's road-asphalt figures: SPORT is a summer UHP tyre (skidpads 0.90-0.98
  g), SEMI the Cup 2 class (a 911 GT3 on Cup 2s ~1.10 g).
- **Checked against each car's own measurements, not tyre names alone:**

  | car | factory tyre | measured | model, before | model, now |
  |---|---|---|---|---|
  | McLaren 720S | bespoke Pirelli P Zero Corsa | skidpad ~1.10 g | sport: 1.00 g, 143 ft | **semi: 1.12 g, 128 ft** |
  | McLaren 750S | P Zero Corsa (Trofeo R optional) | ~1.13 g; 70-0 129-136 ft | sport: 1.00 g, 142 ft | **semi: 1.12 g, 127 ft** |
  | Corvette Z06 C8 | Michelin Pilot Sport 4S (Cup 2 R with Z07) | 1.12 g, 144 ft (Z07: 1.16 g, 139 ft) | sport: 1.00 g, 143 ft | unchanged |

  The McLarens move to SEMI: their factory tyres are the Cup 2 class and their measurements agree. 0-100: 720S
  3.55 -> 3.07 s (real 2.9), 750S 3.54 -> 3.05 s (2.8). The Z06 C8 stays on SPORT: its braking matches it exactly.
- **What the review found besides.** The rest of the slow rear-drivers are on the right class, and the trace shows
  why they are slow: on the traction limit from 0 to ~90 km/h (the C8 at a steady 0.83 g), with the clutch phase
  and the shift costing little. That is the launch, the next build. And one reference is optimistic: the C8 Z06's
  2.8 s (already marked unsure) reads as GM's 0-60 claim with the 1 ft rollout US magazines subtract; the one
  rollout-free 0-100 km/h found is 3.54 s (AutoTopNL, on the road), against the model's 3.48. Noted in the preset.
- The C8's skidpad (1.00 against 1.12 g) with its braking matching says the lateral side is short on a modern car
  while the longitudinal is right; the suspension geometry (camber recovery, roll stiffness) is the on-hold item.
- 0-100 RMS over the 42 real cars 15.0% -> 14.1%.
### The driver's foot (build 152)

- **The problem.** The lap's throttle was read straight off the speed solve, point by point: full wherever the engine
  or the driven tyres were the limit, the drive the profile needed elsewhere, nothing mid-shift. Every 1-0-1 step
  happened within one 5 m point (~0.07 s). Three things made it pump:
  - the line's radius flickers point to point, so the corner throttle did too (1.00 → 0.39 → 1.00)
  - a hairpin exit's grip and traction limits trade places point to point
  - every upshift lifted, on every gearbox
- **Why it matters for the turbo.** The turbo shaft ran on that throttle, so the pumping cost boost.
- **What a driver does instead:**
  - holds a steady throttle through a corner (the ±10 m the steering is averaged over)
  - once driving out of a corner, does not back off again
  - stays flat through an upshift on a gearbox that cuts the spark for it (dual-clutch, sequential, automatic), which
    keeps the exhaust hot and the turbo spun up (flat-shift and no-lift-shift systems work the same way)
  - lifts for an H-pattern shift
  - moves the pedal no faster than a foot: fully off in 0.10 s, fully on in 0.25 s
- **Where the pedal goes.** The trace on TRACK and the race HUD, the manifold pressure, and the turbo shaft all use
  the pedal. The speed solve is unchanged.

| Spa, hot lap | Full-off-full stabs inside 0.4 s, no braking | Boost through corners (MAP, bar abs) | Lap |
|---|---|---|---|
| McLaren 720S (DCT) | 94 → 2 | 0.91 → 1.04 | ±0.00% |
| Porsche 911 Turbo S 992 (DCT) | 104 → 1 | 1.43 → 1.53 | +0.01% |
| Toyota GR Yaris (manual) | 14 → 1 | 1.46 → 1.43 | +0.01% |
| BMW M3 E46 (manual, NA) | 11 → 2 | — | ±0.00% |

- **Lap times barely move.** The speed solve already had full drive at the limit, so the speeds are its as before.
  The extra boost a flat shift keeps arrives where the car is grip- or traction-limited, so it is not used.
- `test82`:
  - no pedal step faster than a foot
  - at most one stab a lap
  - every H-pattern upshift lifts; no spark-cut shift does
  - a turbo keeps 90%+ of its boost through a flat shift
- `test62` now allows the pedal to be rising off a lift on an engine-limited point, and flat through a cut shift
  while the car slows.
- `test79` now counts dives over twelve seeds instead of three, and asks that a third of them (not half) end in the
  place being taken.
  - **Why the sample was too small.** Over three seeds it rested on one to four dives, so it was a coin flip. Main
    itself sat exactly on the line (2 of 4).
  - **What the rate really is.** Across 48 seeds it is 42-63%, depending on the build. This build moves the race pace
    grid by under 0.03 s a lap, which is enough to re-roll which dives happen.

### The README says what the model does now (build 151)

- The known-limits list, the racing-line section and the working queue had fallen behind the builds: they still
  said the turbine throats were taken at the wheel's radius (fixed in 133), that turbo lag did not reach the lap
  (118), that the racing line was minimum curvature with a fitted late-apex bias (115: each car's own minimum-time
  line), that rotational inertia was free (107), that spark engines took their IMEP from air (95), that the knock was a
  points score (131; the ported engines keep it) and that the Alto's turbo frame was far too big (136). Each now
  says what the code does, and the open gaps are the current ones: the RS3's and EcoBoost's unpublished wheels,
  the older turbos' mid-range, engine braking at the limiter, the ported engines' exhaust share.
- The lap report's footer described the old line too; it now says each car's own minimum-time line.
- **Turbine housing matching: re-measured, not built.** The known limit it was parked for (a 4× spread in
  exhaust flow per mm² of throat, boost thresholds ~1940 rpm RMS off) has mostly closed with the throat
  convention, the compressor island, pulse energy, short turbo manifolds and the makers' wheels: 1.9×, and
  775 rpm RMS on the prototype's anchors (the proposed back-pressure sizing reached ~700). On the presets with
  a quoted torque plateau the 90%-boost point is ~620 rpm RMS from its start; the late two are the RS3 and
  EcoBoost (unpublished wheels). The turbines run generous at rated power (exhaust/intake pressure ~1.1), so
  sizing to a back-pressure target would spool them earlier still: building it now would be fitting to
  anchors. Recorded in the README and tests/proto/README.md; VGT ring sizing stays open.

### The braking split between the axles (build 150)

- **Each axle stops with its own grip.** The lap pooled all four tyres' grip under braking, whatever the brakes'
  split. Now braking moves load forward (m a h/L) and the downforce splits by the aero balance, so each axle has its
  own grip, reduced by the cornering it is also doing (trail braking); the hydraulics give each axle its share of the
  brakes at full line pressure (the calipers and rotors, brakeFrontShare), ABS/EBD easing an axle's pressure once it
  reaches its grip; the engine brakes the driven axle (shared by weight on four-wheel drive). The car slows with the
  sum of each axle's lesser of grip and what its brakes and the engine give it. Every factory car's hydraulics reach
  both axles' grip (the 911 GT3's rear just: 0.99), so lap times move by under 0.1 s; a build with brakes too small
  for an axle's grip now pays for it.
- **The rotors' heat follows the split.** Front-drivers' engine braking is on the fronts, so ABS eases the front
  brakes by as much and the rears take more; on the brakes into a corner the loaded fronts reach their grip first
  and EBD moves work to the rears. Rears now run 60-90% of the fronts (50-60% before); fronts 10-45 C cooler on the
  short circuit.
- **Engine braking and stability.** ABS can ease the brakes but not the engine. A downshift whose engine braking
  alone is more than the driven tyres can hold is not made yet, and once in gear, where the driven tyres have less
  grip left along the road than the engine's braking (deep into a corner on the brakes, a rear-driver's rear steps
  out on a closed throttle), the engine is held to what they can carry: the drag-torque control cars carry for it
  (a slipper clutch or a blip does the same). Where it bites is reported (engTrimM): on the technical circuit a front-
  driven Alto never, a Hellcat 4 m, a 911 GT3 20 m, an Enzo 64 m. The replay carries each axle's share of its grip in
  use (useF, useR).
- **Each axle fades with its own rotors.** The lap faded the whole brake capacity by the fronts' temperature; with
  the work split by axle the rears heat on their own, so the rear capacity now fades by the rears'. (A small solid
  steel rear behind a hot front no longer fades with it, and one that runs hot itself now does.)
- **The race heats its rotors as the lap does**: the engine's share of the slowing (carried per point from the
  lap, replay.eb) is not the rotors', and the brakes split by axle as the lap found (replay.frB).
- Tests: test81 adds each axle within its grip and the engine's braking within the driven axle's. test30 measures
  undersized brakes on the technical circuit (74.29 against 74.06 s), where the brakes decide the lap: on 'mixed'
  they land within 0.07 s of stock either way, the steel car's earlier braking points changing the driver's
  hold-or-upshift choice (build 121), which is worth as much. test76's floors
  lowered with the reason (300 -> 250 C on the short circuit, 700 -> 650 C at Spa): builds 149-150 take the engine's
  braking out of the rotors and move work to the rears, which real readings include and build 144's pooled model did
  not; the model sits 1-11% under the old floors.

### Downshifting through the braking zones; the engine brakes the car (build 149)

- **What was wrong.** Under braking the lap's gear was read off the speed point by point (the most wheel force
  there), so it dropped a gear the instant the next one stopped over-revving, took no time to do it and gave no
  engine braking. And the readout merged any gear held for under 40 m into the one before (meant for on-power
  flicker): a hard stop passes through 3rd and 2nd in ~24 m and ~14 m, so an M3 into Monza's first chicane showed
  4th from 166 to 77 km/h at 3,600 rpm, then 1st.
- **The gearbox, in time order.** After the lap is solved the driver works down the box: one gear at a time (a
  sequential's drum cannot skip, a twin-clutch's alternating shafts make a skip slower than going through; with an
  H-pattern or an automatic a driver on the limit goes down one at a time anyway, blipping each to match the revs),
  each taking the gearbox's own shift time (H-pattern 0.35 s, sequential 0.06, twin-clutch 0.03, automatic 0.20),
  each only when the revs after it are inside the limiter (the box's over-rev protection), and never below the gear
  the corner's slowest point wants. The M3 into the chicane now goes 6-5-4-3-2-1, each change just under 8,000 rpm.
- **Engine braking.** In gear the engine brakes the car with its own overrun torque: friction and pumping against a
  closed throttle with the fuel cut (brakeTorqueRaw, the engine the dyno runs; no throttle plate on a diesel), back
  through the gearing and the driveline. Mid-shift the clutch is open and there is none. It adds to the brakes and
  cannot take the tyres past their grip, so on a hot lap, where the tyres are the limit, it mostly takes work off
  the rotors; it shortens a stop only where the brakes are the limit (the lap is re-solved with it when they are).
- Result: lap times unchanged on tyre-limited laps, a little quicker where the brakes bite (Nordschleife: Hellcat
  -0.19 s, M3 -0.10 s); front rotors 15-70 C cooler at their peak; the engine does 6-12% of the braking in the
  braking zones. Shift counts now count every downshift. The replay's brake pedal is the brakes' share only.
- **The live engine's lift-off braking** is the engine's own: a fitted 0.14-0.44 x the reference torque was taken
  off on top of it, 2-6 times the engine's figure, and on a turbo engine it scaled with the boosted torque (a 2.0
  turbo braked with ~14 bar). A Civic Type R on a closed throttle at 5000 rpm now brakes with 1.84 bar, a motored
  engine's figure (Heywood: friction ~1.5-3 bar at speed, plus closed-throttle pumping).
- Not modelled yet: braking split between the axles, so the model cannot show engine braking unsettling a
  rear-driver (the reason for slipper clutches and ECU blip control). That is its own build.
- New test81: on one car of each gearbox type, no downshift skips a gear, none comes sooner than the shift time,
  none lands over the limiter, and the pedal asks the brakes for less than the car slows by.
### Supercar category (build 148)

- **Exotic becomes Supercar**, with four popular cars from each decade since the 90s, each a real car on its factory
  engine. The Huracán LP610-4 and 812 Superfast are two of the 2010s four. In the car and engine pickers the family
  is grouped by decade.
  - 1990s: Ferrari F355 Berlinetta, Lamborghini Diablo VT, McLaren F1, Porsche 911 Turbo (993)
  - 2000s: Ferrari Enzo, Porsche Carrera GT, Ford GT, Lamborghini Murciélago LP640
  - 2010s: Ferrari 458 Italia, Lamborghini Huracán LP610-4, McLaren 720S, Ferrari 812 Superfast
  - 2020s: Porsche 911 Turbo S (992), Lamborghini Huracán STO, Chevrolet Corvette Z06 (C8), McLaren 750S
- The 2020s are the combustion-only cars: the decade's flagships are mostly hybrids (SF90, 296, Artura, Revuelto)
  and the model has no electric motor. The 992's turbines are variable-geometry; the model's VGT is the diesel's,
  so it runs a plain twin.
- Bodies are curb masses (the makers' dry figures are noted beside them). Inputs from secondary sources are marked
  unsure. The boosts of the 720S, 750S and 992 Turbo S are not published; they are set, with a factory taper over
  the top, to the rated torque and power. The Ford GT's blower makes 0.83 bar, from which the model makes 30% more
  than the rating, so its boost is set lower and it is noted and kept out of the error summary.
- Against the makers (test60, test61): power within 13% on every engine; top speed within 7% on every car; 0-100
  within 10% on 12 of the 16. The 720S, Z06 C8, 750S and 812 are 22-29% slow to 100: the same grip-limited launch on
  two rear road tyres the 812 already showed. Eight engines join the known 'limiter' list: their power is still
  climbing at the limiter, where the real ones peak 100-500 rpm short of it (the missing top-end fade).
- The model has no active aero and one generation of tyre per type, so lap times do not fall decade on decade as
  the real cars' do: at Spa the light McLaren F1 out-laps the 720S.
- `test80`: Supercar has replaced Exotic, four cars a decade inside their years, each on a supercar engine of its
  decade, loading as factory spec at its curb mass, power within 15%; power-to-weight and 0-100 improve from the
  90s to the 2020s; the pickers group by decade and other families do not; one car from each decade races Spa.

### Racecraft and drivers (build 147)

- **A tow that grows as the gap closes.** The flat +1.5% within 40 m is now the drag lost behind a car,
  0.45 e^(-gap/25 m), turned into speed on a straight: 2.6% at 5 m, 2.1% at 10 m, 0.6% at 40 m. Cars nose to tail
  pull each other along; a lone leader is caught.
- **Defending.** With a quicker car within ~20 m behind on a straight, the car ahead may move to the inside line
  for ~6 s (then not again for 8): the car behind needs 1.5-4 km/h more to pass, and the defender is 1% slower
  through the next corner.
- **Late-braking moves.** Held up within 10 m into a braking zone, a car may dive, once a zone. It sticks with
  0.4 + 2 (grip difference) + 1.5 (brake fade difference) + 0.3 (aggression difference) - 0.15 against a defending
  car, 8-85%: the attacker brakes 6% later for 60 m and exits 2% slower, and the car passed concedes the line and
  has 6 s of easier repassing (the switchback). If it does not stick, the attacker runs wide and loses 15% for 80 m.
- **Drivers.** Each car has one: BALANCED (the old average), AGGRESSIVE, SMOOTH, RAIN MASTER, ROOKIE, from four traits
  (aggression, consistency, tyre care, wet skill) that set the lap-to-lap spread, mistakes, the pass threshold and
  rate, how often they defend and dive, tyre slip and wear, and pace in the rain. A car with no driver set is
  BALANCED and races exactly as before the traits.
- Passes are now counted when the car being passed changes before the move is confirmed (in a crowd), which they
  were not.
- `test79`: the tow by distance; aggressive fields dive more than smooth ones, dives that stick take the place,
  some go wide, cars defend; a rookie is less consistent and makes more mistakes than a smooth driver; a smooth
  driver saves the tyres; wet skill orders the drivers in the rain; no driver = balanced.

### Fuel against the real world (build 146)

After the brakes and the tyres, the same check on fuel. Real figures are owners' and a magazine's, not controlled
tests: an FK8 Civic Type R emptied its tank in 84 track miles (Autocar, ~35 L/100 km); an E46 M3 ~35 L/100 km; a
stock 1.6 Miata ~9 mpg (~26 L/100 km), about 16 L/h; a Mustang GT 5.0 ~6 mpg (~39 L/100 km), ~38 L/h; a C7 Z06
2-4.2 mpg (56-118 L/100 km); and "road consumption x 3" or 8-10 L per 20-minute session as rules of thumb.

- Spa at the limit, alone (L/100 km): MX-5 19, Golf GTI 32, GR Yaris 36, Civic Type R 43, E46 M3 40, Mustang GT 50,
  911 GT3 51, Corvette Z06 54, Huracan 59, Hellcat 71; a Nordschleife lap 3.8 L (MX-5) to 13.3 L (Hellcat).
- The engines behind it: lap-average BSFC 265-323 g/kWh, 25-31% efficient, full throttle 45-62% of the lap, mean
  power 48-62% of peak - a real petrol engine worked hard on a fast circuit.
- Verdict: no change. Mid-size cars match; big-power cars burn 20-40% more than owners report and the small NA
  MX-5 ~20% less, which is the pace (the lap is at the limit, owners mostly are not). The race page's limit note
  and the README say so; `test78` pins the BSFC, the efficiency, the full-throttle share, the real figures within
  +-35%, the 20-minute rate and fuel following power.

### Tyres against the real world (build 145)

After the brakes, the same check on the race's tyre temperatures. Real figures: pit-lane pyrometer guidance puts
street tyres at 60-77 C, UHP summer tyres 66-88 C and race tyres 77-104 C; Michelin rates the Cup 2 R at 70-100 C
(90 ideal), Toyo the R888R at 71-104 C; a Trofeo R owner saw 70-80 C by lap 10; PS4S-type road tyres go greasy
after 3-5 hard laps; front-heavy cars run hotter fronts and the outside tyre hottest; and a pit reading is 10-20 C
under the tyre on track.

- Six laps of Ashdown Park, alone, hottest tyre: GR Yaris 91, Golf GTI 94, Civic Type R 98, E46 M3 88, Corvette
  Z06 83, Mustang GT 96, Hellcat 110 (sport); 911 GT3 107 at the rear (semi-slick). A front-driver's rears 46-63;
  the left tyres hottest on a circuit of right-handers; within a few degrees of working temperature by lap 3;
  wear 0.08-0.18. Consistent with all of the above, so no change to the model.
- Unverified, and stated: an eco tyre on a light car runs cool (MX-5 45-62 C), and Spa reads a little cooler
  than a short circuit.
- `test77` pins the ranges, the axle and side differences, the warm-up, the heavy car's overheating and the wear.

### Brakes against the real world (build 144)

Asked whether street cars' rotors really reach 800+ C in two laps. The rise is right (a rotor's time constant is
two to three minutes, so it reaches working temperature in two or three laps, as drivers see), but the level was
200-350 C too hot on long fast circuits. Real figures: DBA puts track-day rotor cores at 450-600 C with surface
peaks to ~800 C; temperature paint at VIR read 460-550 C; a Cayman on R-compounds ~540 C; an M2 on a small track
~300 C; a road-type disc under a 5.5 t race truck 735 C.

- **Vented fronts on every brake type.** The basic disc was solid all round; nearly every road car's fronts are
  vented (an NA MX-5's are). `BRAKE_TYPE` gains `ventR` for the rears, solid on the plainer kits.
- **The hat in the rotor's mass.** The one-piece iron rotor's bell (0.3 to 0.6 D, 6 mm, plus its cylinder) is
  about a fifth of the part. The E46 M3's front rotor is now 10.3 kg, the MX-5's 4.7.
- **Vane heat transfer from a measurement.** The developed-turbulent duct correlation gave ~25 W/m2K in the vanes
  at 800 rpm, where they run at Re ~1e3. A radial-vane rotor measures 27.0, 52.7 and 78.3 W/m2K at 342, 684 and
  1025 rpm (J. Applied Sciences 8 (2008) 3583): the coefficient is now at least 0.076 per rpm.
- Front rotor, hot-lap peak, Spa / Nordschleife (C), before -> after: MX-5 841/942 -> 570/626, Civic Type R
  671/731 -> 636/700, Golf GTI 768/823 -> 658/711, GR Yaris 570/618 -> 536/591, 911 GT3 727/772 -> 685/748,
  Mustang GT 752/820 -> 712/795, E46 M3 877/953 -> 767/839, Corvette Z06 815/867 -> 777/839, Hellcat 876/945 ->
  840/919. Ashdown Park: every iron brake 315-411 C. Lap times unchanged.
- **What is left is the driver.** An energy count of the Spa lap puts ~8 MJ into each of a Hellcat's front rotors
  (45 kW on average), 4.7 MJ into an M3's, 1.7 MJ into an MX-5's, and the cooling balances it: the lap brakes at
  the limit into every corner, as a professional's would. Heavy fast cars driven that hard do cook their brakes;
  the guide and the README now say so. `test76` pins the ranges, the fade, the rotor masses and the two-to-three
  lap rise.

### A full-screen track view for phones (build 143)

- **⛶ in TRACK's live timing** moves the map canvas and the replay controls (pause, restart, speed, gauges) into
  a page that fills the screen, asks for real full screen and a landscape lock, and sizes the drawing to the
  screen's shape with at least 380 units of height for the live instruments. Where the lock is refused (iOS) and
  the phone is upright, an inner box turns a quarter (the browser will not transform a full-screen element), and
  pointer positions are mapped through the turn, so drag and pinch still pan and zoom the right way.
  ✕, Esc, leaving the browser's full screen, or another tab puts everything back.
- `test75`: an upright phone, a sideways phone and a desktop: landscape drawing, controls in the bar and none cut
  off, the replay running, panning through the turn, and ✕ restoring the page.

### The ⛶ FULL button is gone (build 142)

- It sat on the LIVE, DYNO and TRACK canvas and, once pressed, drew the engine cutaway whatever tab was open, and the
  "detailed" view it promised drew nothing extra (`drawPistonCutaway` took the flag and never read it). The button,
  its `fullscreen` state, its CSS and translation are removed. The RACE page keeps its own ⛶, which goes full
  screen as the race page.

### RACE: weather, brakes that carry their heat, a plan per car, the race report, a page of its own (build 141)

- **Weather** (`raceWetAt`): dry, damp, wet, rain later (the start drawn from the seed) or drying, and the air
  temperature; the track runs ~14 C above the air in the sun, at it when wet. Each `TIRE_TYPE` compound gains
  `wetKeep`, the share of its grip it keeps on a wet track (a road tyre ~0.7, a slick 0.36), and the race has two
  rain tyres of its own (`RACE_RAIN_TYRES`: intermediates, full wets) that overheat and wear on a drying line.
  Water and a cool surface take heat out of the tyres (`TYRE_RACE.hWet`, `hTrack`). A wet race also solves the
  pace grid down to grip 0.42 (`RACE_GRIP_WET`). Wet laps run 9-22% slower, the grippiest dry compounds losing most.
- **Tyre calls from the car's own laps** (`raceBestCompound`, `raceTyreCallPays`): a car changes to the compound
  that leaves it most grip when the time that wins back on its solved laps (`raceLapAtGrip`), over the laps
  left, beats the stop. A late shower can leave a car out on the wrong tyres on purpose.
- **Brakes carry their heat.** `brakeHeatStep` takes the car as an argument and `rotorCooling` the day's air,
  so the race runs the lap solver's rotor model all race long, and in the pit box. Fade feeds pace: a braking
  zone stretches toward its apex by fade now against fade on the solved lap. A Civic's fronts climb from 169 to
  475 C over ten laps of Ashdown Park, past the hot lap's 392; on pads that fade from 300 C it loses 0.8 s a lap.
- **A plan per car**: stops (auto, 0-3, none), push / normal / fuel save, the starting tyres, and the wet call.
- **The race report** (`raceReportCanvas`): classification with stints, a lap chart, lap times with the
  wetness shaded in, stints by compound, key moments. PNG and PDF, on the hot lap report's paper.
- **RACE has a page of its own**: the map and the panel move into a window-filling page (`openRacePage`,
  `closeRacePage`), sized to it (`sizeRaceStage`); ◀ SIM or Esc goes back, ⛶ goes full screen as the race
  page rather than the engine view. On a phone it stacks, map over panel.
- Tests: `test71` adds weather, carried brake heat and per-car strategy; `test72` the page, the report and a phone.
### The engine sound on the dyno and round the lap (build 140)

- The sound played on every tab, always from the live engine, so the TRACK tab's car went round to the
  sound of the dyno controls. `soundSource()` now picks what is heard: the live engine on **DYNO**, the
  lap replay on **TRACK** (quiet while it is paused), nothing elsewhere (the LIVE cutaway included).
- `trackSoundState()` turns the replay into an engine state: its recorded rpm, manifold pressure and
  throttle, with what a driven lap implies (DFCO on a lift, the limiter at the redline, a calibrated
  mixture, a warm engine, a turbo shaft spun to the recorded boost). `soundDrive()` takes that state
  instead of reading the live one.
- Blow-off is now the charge pipe venting: it holds the boost made while the throttle was open and vents
  once when the throttle shuts, however gently, instead of needing a 0.3 -> 0.1 snap in one frame. On the
  lap the boost is taken at the throttle's own recorded point (the manifold is interpolated toward the
  next one and had already fallen by the lift). A turbo hot-hatch blows off 18 times round the default lap.
- test74: the source per tab and the live level falling to zero off them; the replay's rpm, throttle vs
  braking and fuel cut in the sound; blow-offs round a turbo lap and none on an NA one.

### The GUIDE becomes a wiki (build 139)

- The 29-page manual is rebuilt as a **60-page wiki in 9 sections**: Getting started, How an engine works (new),
  Designing the engine, Breathing & boost, Knock, heat & wear (new), The car, The track, Scoring & career,
  Options & reference. Thirty-one pages are new, among them the four strokes, torque vs power, why engines have a
  redline, VVT, ignition, combustion, heat and EGT, friction, wastegates, superchargers, intercoolers, nitrous,
  fuels and octane, wear, emissions, the race (wrapping build 137's race page in the three levels), tyres, aero, brakes, suspension, elevation, a glossary and a calibration page.
- **Three levels on every page**: LV1 · REAL LIFE (how the part works on a real car, no maths), LV2 · IN THE GAME
  (the controls), LV3 · THE PHYSICS (the equations the code solves, with sources, and an orange limit note where a
  quantity is still fitted). The LV3 text was written from the simulation code and its figures re-measured, not
  carried over.
- **8-bit pictures drawn in code** (`GUIDE_ART`): 62 drawings on a 160 x 72 cell grid through `fitPixCanvas`, 53
  of them animated at 12 frames a second (the four strokes, cam and follower, header pulse and its reflection,
  turbo, wastegate, VGT vanes, Roots rotors, knock, friction circle, roll, racing line, crest). The loop runs only
  for the page in view while the GUIDE tab is open, and draws a still under `prefers-reduced-motion`. Each index
  entry carries its page's first picture as an icon.
- **Search** (every word must appear in a page's title, tags or text) and **cross-links** between pages
  (`<a data-gp>`), 261 of them.
- Two kept blocks had gone stale and were re-measured: the front-driver launch figures (a 215 hp kei: 7.48 s, then
  6.32 / 5.86 / 4.99 / 4.12 s with an LSD, sport tyres, slicks, AWD) and the diff trade (spool 0.1 s quicker to 100
  and 1.5 s slower a lap than a clutch LSD). They moved to new blocks with fresh Greek, as the block-per-paragraph
  rule requires, and `test41` now checks that the guide quotes the launch ceiling it measures (it pinned the stale
  0.33 g; the model gives 0.38). Retired with them: the old lap-lag limit (the lap has integrated the turbo shaft since build 118) and the old
  Known-limits list. New text is English for now and falls back cleanly in Greek; the level labels are translated.
- Pages that builds 136–138 changed were written against them: intercooler effectiveness from NTU, the ECU
  torque limit on the wastegate page, the race tyre windows and wear on the tyres page, the RACE tab.
- `tests/test73.mjs`: every page has its three levels and a picture, every picture draws and every animated one
  moves, every link lands, search narrows and says when nothing matches, the animation stops off the tab, Greek
  keeps its blocks and falls back to English, and nothing scrolls sideways at phone width (it caught wide tables
  doing exactly that: the wide column is now `minmax(0, 1fr)`).


### The ECU's torque limit as a tune point (build 138)

- **ECU TORQUE LIMIT (Nm, 0 = off)**, a new input on boosted engines. A torque-based ECU holds the engine to a
  calibrated torque (for the gearbox, the driveline, the clutch) by asking for less boost where the engine would
  make more: the flat plateaus makers quote across thousands of rpm are this, not the engine's own curve. Solved
  once per engine: at each rpm the boost at which the engine makes the limit, bisected on its own torque there; the
  wastegate, the vanes, a supercharger's bypass, the bench and the lap are all asked for no more than that. Like
  the boost taper it is a calibration, not physics: the engine below it is unchanged and only meets a lower target.
- **Factory presets carry it where the maker quotes torque as a plateau** over a speed range: GTI 350 Nm
  (1500-4400), FK8 400 (2500-4500), GR Yaris 360 (3000-4600), EcoBoost 170 (1400-4500), RS3 480 (1700-5850),
  TDI 320 (1750-3000), N57 560 (1500-3000). Engines quoted at a single peak (2JZ, EJ257, 4G63, RB26, the kei and
  city turbos, the truck diesels) carry none, and their mid-range over the makers' (Supra +14%, STI +10%, Evo +8%)
  is left showing.
- Result: the FK8 holds 400 Nm from 3000 to 5000 rpm (was 454 at 2500, +14%), the GR Yaris 360 at 3000 (was +3%),
  the RS3 480 from 3000 to 5000, the TDI 320 from 1500 to 3000. Factory tapers re-solved with the limits in place;
  every preset within 1% of its rating. The GTI's plateau still falls off from ~3500 rpm (330 Nm at 4000, the maker
  holds 350 to 4400): its taper starts at the maker's 1500 rpm torque peak by the calibration rule, which now has a
  limit doing the plateau's work; starting tapers at the plateau's end would need the plateau's end in the data.
- test48's GTI and TDI carry their limits, and its Supra and TDI tapers follow the presets.

### RACE: two to eight builds on one circuit, nobody driving (build 137)

- **A RACE tab.** Pick the cars (the build on the VEHICLE tab, garage cars, factory cars), the circuit, the laps,
  the grid (qualifying or reversed), the pit strategy (automatic or none), tyre warmers and a seed, then watch:
  the cars on the map, a timing tower, and each car's four tyre temperatures and wear, fuel and brakes. 1-100x,
  scrubbing, follow-a-car. A guide page, *The race*, says what is physics and what is a rule.
- **The race is computed, then watched.** Each car is loaded (`withBuild`, which puts the user's own build back
  exactly), its line optimised once, and its lap solved on that line at grip 0.72-1.00 x fuel empty/half/full
  (`raceCarModel`). The race loop (`raceInit`/`raceStepOnce`) runs every car on a 50 ms clock reading its speed
  off that grid, needs no globals, and records a timeline the page plays back. Solving on a fixed line takes
  11-60 ms; the line optimisation (0.6-3.5 s a car) is the cost, so 8 cars on the Nordschleife take ~1 min.
- **A standing start in the lap solver** (`simulateLap(key,{fromRest:true})`): the forward pass leaves point 0
  from rest and does not wrap. +3.3 s on a GT3 at Ashdown Park. Opt-in; no existing lap moves.
- **Tyre temperature and wear** (`raceTyreStep`): one lump per tyre, the loads from weight, downforce and
  lateral and longitudinal transfer, heat from slip work and rolling hysteresis, convective cooling. Each
  compound in `TIRE_TYPE` now carries a working window (`tOpt`, `tWin`) and a wear rate. Grip falls with the
  square of the distance from the window, twice as fast hot as cold, and with wear past a 70% knee. All fitted.
- **Fuel from the engine's own BSFC map.** Flow at each point = the power the lap spends there x BSFC at that
  rpm and MAP; idle flow off the throttle, more for a carburettor. The tank is per body class (`RACE_TANK_L`);
  the car sheds the fuel's mass as it burns.
- **Strategy, traffic, the driver.** Stops are planned from a solo practice run (the fewest the tank and tyres
  allow, or more if fresher tyres pay for the pit lane). A car is held up until it has a few km/h on a straight
  or into a braking zone; tow, dirty air, blue flags, pit loss, up to 0.6% lap-to-lap variation and mistakes are
  seeded rules.
- **The map drawing is shared** (`trackMapView`, `drawTrackSurface`), so TRACK and RACE zoom and pan the same way.
- Tests: `test71` (the engine: solo laps match the solver to 0.4%, fuel = power x BSFC, tyres from cold, seeds,
  traffic, pits, the user's build restored) and `test72` (the tab, end to end).
### The intercooler's effectiveness follows the charge flow; the small turbos' wheels (build 136)

- **Intercooler.** It took off the core's quoted share of the compressor's heat (small 0.62, large 0.82) at every
  flow. A heat exchanger's effectiveness rises as the flow through it falls, since each kilogram meets the same
  surface for longer: eps = 1 - exp(-NTU), NTU = UA/(m cp), with the cooling air's capacity large against the
  charge's. The quoted figure is read at the engine's peak revs at 1 bar of boost (the reference the turbo frames
  are characterised at), which fixes NTU there: not at the build's own boost, since the core is hardware and more
  boost runs it past its rating; UA is the two sides in series, the charge side's film coefficient following the flow as m^0.8
  (Dittus-Boelter) and the cooling side's not, balanced at the reference (the design rule for a gas-to-gas core,
  Shah & Sekulic). At a fifth of peak flow a small core takes off 0.88 of the heat, a large one 0.97.
- At the makers' torque peaks the charge arrives at ~30 C on the large-core cars (was ~50) and ~55 C on the
  small-core ones (TwinAir 95 -> 57, Alto 80 -> 56). With the wheels below, low-rpm torque against the makers':
  GTI -12% -> -2%, TwinAir -32% -> -11%, Alto -19% -> -5%. The Civic, at 1.6 bar on its core, runs it past its
  rating over the top: 308 hp (rated 316; it carries no taper).
- **The small turbos' wheels.** The 'small' class is a 54 mm wheel, a 2.0 L's (the GTI's IS20). The TwinAir's
  turbo is Mitsubishi's TD02H2 (49373-03000), whose compressor wheel the replacement catalogues list at 40 mm
  exducer and 29 mm inducer (the 0.72 ratio this model assumes). The Alto takes the same 40 mm, the size of IHI's
  RHF3, the frame of kei engines (marked unsure: which turbo this engine carries is not confirmed). The EcoBoost keeps its class: no
  published wheel was found, and it is the one most sensitive to it (96-158 Nm at 1400 rpm across 54-36 mm).
- **What the cooler charge shows on the bigger engines:** mid-range torque now reads over the makers' on the
  Civic (+14%), Supra (+14%), STI (+10%) and Evo (+8%). The hotter charge was hiding it; much of it is the ECU's
  torque limit (the FK8's 400 Nm is flat from 2500 to 4500 rpm, a calibration), which the model does not have.
- Factory tapers re-solved; test48's GTI, Supra, TDI and Alto (and its 40 mm wheel) follow.

### The lap is a hot lap: the brakes get one preparation lap (build 135)

- The lap solver's brake temperatures ran the lap over and over (up to six times) until the rotors' temperature at
  the line repeated: a race stint's rotors. The lap is a single hot lap, and the tyres are taken at the working
  temperature an out-lap gives them, so the rotors now get the same: they start from ambient, run one preparation
  lap at the hot lap's pace, and the hot lap is the second (BRAKE_PREP_LAPS).
- Short circuits: the front rotors start the hot lap ~270 C where they started at ~600 (a GT3 on the technical
  circuit 265 C and 451 C at most, against 639 and 702). Lap times move by at most 0.03 s (an E46 M3, 74.83 ->
  74.80 s on the technical circuit): settled, these rotors only just crossed their fade onset. The Nordschleife
  is unchanged (a V12 GT on steel still fades, 448.7 s against 445.3 unfaded): one lap there is long enough for
  the rotors to reach their working temperature within it.

### Knock compresses the charge the engine trapped, from where the valve closes (build 134)

- **The end gas's compression starts at IVC.** The knock trace compressed a cylinder full at intake pressure from
  BDC through the whole geometric ratio, whatever the engine had breathed. At low speed a late-closing intake valve
  has let part of the charge back out before compression starts (the integrated intake stroke, build 121, already
  charged the torque for it), and at the tuned peak the column has packed in more. Now the trace starts at the
  intake valve's closing, at the phase the cam phaser's full-load table chose, on the charge the torque is made
  from (computeVE's fresh air plus the residual mixed into it). One charge for the torque and the knock; nothing
  new fitted. Ported engines and the rotary keep BDC and a full cylinder.
- Result: retard at the makers' torque peaks GTI 16 -> 12 deg, Civic 15 -> 11, GR Yaris 11 -> 7, EcoBoost 6 -> 2,
  TwinAir 31 -> 29; low-rpm torque GTI -17% -> -12%, GR Yaris -6% -> -3%; the Civic reaches its rating on the hardware alone (305 -> 315 hp, rated
  316). NA engines run 0-3 deg retard at 2000 rpm (was 1-5) and their peak power is unchanged. Every factory taper
  still meets its rating within 1%.
- test40, with its reason: 2.5 bar on an over-flowed small frame now buys a little on a lap (61.04 -> 60.82 s; the
  choked compressor delivers less than its target, and the knock now reads the charge it delivers). Asserted
  instead: it gains under a third of what a frame that can feed the engine does (the medium frame, 0.74 s).
- **What is left on the small turbos, found and not yet fixed:**
  - the EcoBoost is now short on spool, not knock: 90% boost at 2200 rpm against Ford's 170 Nm from 1400;
  - the TwinAir still runs 29 deg retard at 1900 rpm, on a charge that arrives at 95 C;
  - two causes, both measured. The 'small' class is a 54 mm wheel, a 2.0 L's (the GTI's IS20); a 0.66-1.0 L engine
    runs at ~14% of its choke flow at the torque peak, at the island's 0.35 floor. IHI's RHF3 frame, the size
    kei and sub-1.4 L engines use, is ~40 mm (replacement-wheel listings), but which turbo each of these presets
    carries is not confirmed.
  - And the intercooler is a fixed effectiveness per core (0.62 / 0.82) at every flow; a heat exchanger's rises as
    the flow through it falls (more transfer units per kilogram).

### The turbine throat where A/R puts it; the compressor's island follows its speed line (build 133)

- **Turbine throat.** A/R is the volute throat's area over the radius to its centroid, and the throat was taken at
  the wheel's radius, so every turbine was 1.5-1.8x smaller than the frame it names. Now R = r_tip + sqrt(A/pi),
  the centroid of the section just outside the wheel tip. On its own this spools every turbo 200-600 rpm later:
  the bigger throat holds less back-pressure at low flow.
- **Compressor island.** It was an ellipse fixed at 62% of choke flow whatever the pressure ratio, so a turbo
  asked for low boost at low flow (spooling at low rpm) always read as the edge of its map, at the 0.35 floor,
  and drew about twice the power from its turbine. A wheel is most efficient at its design incidence, a fixed
  flow coefficient Q/(U D^2): the velocity triangles are similar, so the best flow and the island's width scale
  with the tip speed, and the island runs diagonally up the map as on a real one, up to the design speed (PR 2.2,
  where the model already starts its pressure losses); above it the inducer nears sonic, the speed lines steepen
  into choke instead of moving right, and the island stays as it was. This gives back the throat's spool delay
  (GTI low-rpm torque as before) and leaves the top of the map, and an over-flowed frame's penalty, unchanged.
- **The makers' compressor wheels** where a size is published: GR Yaris 56 mm, Civic Type R FK8 58 mm, and from
  forum figures (marked unsure) the Supra's CT12B pair 2 x 58 mm and the Evo IX's 16G 68 mm. The GTI's IS20
  (54 mm) is already its class. The FK8 on its 58 mm wheel makes 305 hp (rated 316) and holds 1.31 of its 1.6 bar
  at the limiter: it is now at its rating on the hardware alone and carries no taper (it was 413 hp).
- **RS3: no published stock wheel.** The 86 mm class was too big: the Stage 1 upgrade built on the stock
  turbo's footprint uses a 71 mm wheel, so the stock wheel is smaller. The preset takes the 71 mm class as that
  bound (marked unsure). It still makes ~255 Nm at 1700 rpm against the real 480: at that speed the exhaust
  manifold sits below boost pressure, so the frame is too big for 2.5 L there. That is the unknown wheel, not
  missing physics, and no size is fitted to close it.
- Factory tapers re-solved by the same rule; test48's GTI, Supra (and its 58 mm wheel), TDI and Alto follow.
- Tests, each with its reason: test49's petrol VGT left its known list (its vanes move again, the gap was the
  throat convention); its diesel step check is bounded at 22% instead of "no sharper than fixed" (12.4% ->
  20.3%): the ring is defined from the volute, so it is now 1.5-1.8x larger at both stops, the size class's
  shut ring is bigger than a TDI's, and the boost loop crosses unity gain later and steeper (test47's known
  threshold cliff, waiting on rings sized for the engine); test60 knows the FK8's 'boost-falls' (its 58 mm wheel at
  choke over the top; the wheel is from tuners' listings and the boost is unsure).
- The VGT note: with the throat corrected, the presets' open vane rings still have power to spare from mid-range,
  so the wastegate stays in the loop (the rings are the size class's, not the makers').

### The fuel's octane sensitivity; the end gas loses heat to the walls (build 132)

- **Octane index.** Douaud & Eyzat's delay correlation was fitted on the RON test, so it read a fuel's RON as if
  every engine ran the RON test's conditions. A fuel's resistance in a given engine is its octane index,
  OI = RON - K S (Kalghatgi, SAE 2005-01-0239): S = RON - MON is the fuel's sensitivity, and K is set by how hot the
  gas is when compressed, K = 0.0056 T_comp15 - 4.68, with T_comp15 the unburned gas's temperature at 15 bar on its
  own compression from the start of the stroke. K is 0 at the RON test (~836 K), positive in a hotter engine (the
  MON test, K = 1), negative in a cooler, boosted or direct-injected one (Kalghatgi measures -0.4 to -0.74 in DI
  engines), where a sensitive fuel beats its RON. S: pump and race petrol 10, E85 17, methanol 20.
- **The end gas loses heat to the walls.** The integral compressed the unburned gas adiabatically; it now loses
  Woschni's wall heat (the same correlation and wall temperature the intake stroke uses) over the chamber's surface
  (piston crown, pent-roof head, the liner swept so far), and so does the bulk gas that compresses it. Slowest at low
  rpm, where the gas has the most time, which is where knock was hardest.
- Result: boosted petrol engines run 10-25 deg less retard at low rpm. Low-rpm torque against the maker's: Civic -4%,
  RB26 -1%, STI 0%, Evo -1%, GR Yaris -9%, GTI -16%, Alto -21%, Supra +8% (before: -28% to -48%). Still short: the
  TwinAir (-36%, still knock-limited) and the EcoBoost (-40%), and the RS3 (-50%), whose large frame does not spool
  below 3300 rpm (next item). NA engines run 1-5 deg retard at 2000 rpm; their peak power is unchanged.
- **Factory tapers re-solved** by the same rule (gentlest taper from the maker's torque peak that meets the rating):
  peak power moved with the knock limit. The GTI and the Hellcat now exceed their ratings on the hardware alone and
  carry a taper (1500 rpm / 78%, 4000 / 85%).
- Not used: the lambda-dependent form of K (0.00497 T_comp15 - 0.135 lambda - 3.67) (the model's knock already carries the
  measured trend per unit of enrichment).

### Knock from the end gas's chemistry; the ECU's boost taper as a tune point (build 131)

- **Knock.** It was a points score set by hand (30 a bar of boost, 8 a unit of compression, 0.8 a degree of
  charge, -2.2 an octane, -12 for direct injection, more for rpm, coolant and alcohol), which left a 10:1 engine at
  2.4 bar on 98 RON at its best spark. Now it is the end gas's own autoignition: the integral of dt / tau over the
  unburned gas's life on this model's cycle (Livengood & Wu), tau from Douaud & Eyzat's published correlation
  17.68 (ON/100)^3.402 p^-1.7 exp(3800/T), unadjusted; the gas starts as the fresh charge mixed by enthalpy with the
  exhaust's residual, cooled by the fuel's latent heat under direct injection, and is compressed by the piston and
  the burn behind it until 90% has burned. The score the rest of the model reads is 40 x the integral: 40 is onset.
  The ECU runs best-torque spark where the gas survives it, and otherwise the most advance at which it just does, as
  far back as 37 deg past best-torque phasing (CA50 ~45 deg ATDC on a piston; it stopped at a fitted 6 deg BTDC,
  which at full load under ~2000 rpm left the end gas knocking at any spark). Kept: the measured trend of ~3 deg of
  knock margin per 0.1 of enrichment, the ignition system's margin, nitrous. Rotaries and two-strokes keep the
  previous score and spark law: the integral is a four-stroke poppet engine's cycle, and a Wankel's trailing pocket
  or a two-stroke's scavenged charge is not that gas.
- **What spark costs** is now the Wiebe burn's cycle efficiency at the phasing it gives (wiebePhasingEff), not a
  fitted 1 - 0.004 x (degrees off MBT)^2.
- Result: NA engines are knock-limited at full load low down and run best spark from mid revs (as real calibrations
  do); boosted engines are knock-limited across their range, which costs the midrange most (the gas has more time to
  ignite at low speed). Peak NA power is unchanged.
- **The ECU's boost taper**, two new tune inputs: BOOST TAPER FROM (rpm, 0 = off) and BOOST AT LIMITER (%). The
  wastegate target falls linearly between them; the steady boost solve, the turbo's shaft (0-100, the bench, the lap)
  and a supercharger's bypass all hold it. Reliability now counts half its boost stress where boost is still held at
  the limiter, so a taper buys reliability. Real ECUs pull boost back near the limiter for the rods, bearings, turbine
  and end gas: a calibration, not physics, and now one the user can change.
- **Factory presets carry their factory calibration**: the taper solved so peak power meets the maker's rating,
  starting no earlier than the maker's peak-torque rpm (marked in the preset; set BOOST TAPER FROM to 0 to see the
  hardware alone). Left off where the hardware is at or below the rating, or no taper from the torque peak reaches
  it (the RB26's 280 PS is a voluntary cap). test48's power RMS 15.4% -> 5.3%.
- **COMPRESSOR WHEEL (mm)** input: the maker's wheel instead of the size class, its housings scaled with it. Presets
  keep their size classes for now (see the open item).
- **Held back, with the reason:** the turbine throat taken at the volute centroid radius (it is taken at the wheel's,
  1.5-1.8x too small) and the presets' real wheel sizes. With the back-pressure that removes, the model's weak low-rpm
  spool shows through (an RS3 makes ~245 Nm at 2000 rpm on any frame, against a real 480 from 1700): low-rpm spool
  (pulse energy, twin-scroll housings, small modern turbines) is the next item, and the two return with it.
- The torque grid is shared between the 0-100 run and the lap (keyed on the builder, so a test harness's scaled one
  is its own); the knock search is remembered per operating point.
- Tests, each with its reason: test60's boost-falls compares with the ECU's target, and the 2JZ, TDI and Duramax left its known list;
  tests 44/46/60 do not count boosted engines with no taper at the limiter (full boost to the limiter is their
  calibration); test40 reads knock at best-torque spark (the ECU holds the controlled score at its target); test58's
  continuity is a rate per unit lambda; test63 asks the lap solver's braking step directly instead of sampling a lap;
  test62's gauge to 0.005 bar; test48's power budget 15.5 -> 10; test41 bands Supra 15 -> 17, STI 11 -> 13, M2 13 -> 14, RMS 9.5 -> 11 (the generic turbo's midrange).

### Live steering and power (build 130)

- **Steering wheel in live timing.** The front wheels' angle is kinematic (Ackermann) steering on the racing
  line, `atan(wheelbase / r)`, signed by the way the line turns and averaged over ±10 m so the 5 m radius
  does not jitter it. The wheel in the driver's hands is that times the **steering ratio**, a new VEHICLE
  input (8-22:1, default 15:1, saved with the car; older saves load as 15). Geometry only: no slip angle,
  so no understeer correction. A 911 GT3 at La Source: 7.4° at the road wheels, 111° at the wheel.
- **Engine power in live timing.** Crank power at each point: the drive force the lap spends, times speed,
  back through the driveline efficiency, capped at full-throttle power at that rpm (with the boost built);
  zero coasting, braking and mid-shift. Shown in hp and kW with a bar against the peak of the curve the lap
  drives (best-power mixture, a little above the as-tuned DYNO figure: 494 against 487 hp on the GT3).
- Both instrument sets, digital and analog, carry the wheel and the power. **test70** pins the steering
  against a known circle, its sign against lateral g, the ratio and its save, and power within the engine.

### The engine sound without the hiss (build 129)

- Most engines sounded like noise, the V12 and the turbo diesel worst. Measured by muting one voice at a
  time, it was three things:
  - **The intake roar was five times the exhaust** at full throttle (V12: 0.202 rms with it, 0.038
    without), mostly its broadband hiss. Build 127 scaled it against the wrong reference. Now about 13x
    lower, with less hiss in it; open stacks still roar louder than an airbox.
  - **Pulses ran together at high rpm.** Each one decayed over a fixed 4 ms, so a V12 at 7000 rpm made a
    steady pressure that the DC block removed, leaving only the noise riding on it: the V12 was quieter
    flat out than at cruise. Blowdown lasts a crank angle, not a time, so the decay now shrinks with rpm
    (its length at 2000 rpm, as before). The V12 flat out is now louder than its cruise and tonal.
  - **The diesel was all knock and whistle.** The live manifold reads low at a diesel idle, but a diesel
    has no throttle and traps atmosphere plus boost, so its pulses were far too weak and the 6 kHz knock
    ring (also now a fifth as loud) was most of what you heard. The turbo whine also passes 10 kHz near
    full shaft speed, where it is a squeal; ducting and bonnet lining absorb that range, so it now rolls
    off above 6 kHz. Turbo whine level 0.05 -> 0.03.
- With the roar no longer making up most of the level, the overall gain doubles to keep the loudness.
- test69's whine check now compares 20% and 40% shaft speed (the audible range) and also checks the roll-off.

### A soft limiter on the engine sound (build 128)

- With all the voices together, a race header on open stacks flat out (the ITB screamer) peaked at 1.27
  and would clip. The worklet's output now runs linear to 0.7 and eases into 1 above it.

### Whine, blow-off, intake roar and knock in the engine sound (build 127)

- Four voices that do not go through the exhaust, each from hardware the sim already models:
  - **Turbo whine** at the compressor's blade-pass frequency (6 full blades) from the live shaft speed
    (`shaftE`), its level with tip speed squared and lower on a closed throttle. **Supercharger whine**
    from the crank through a stated drive ratio and lobe/blade count (`SC_SOUND`: a Roots blower buzzes,
    a centrifugal whistles).
  - **Blow-off** when the throttle shuts on more than 0.15 bar: a 2.6 kHz hiss that lasts as long as the
    charge volume (`chargeVol`) takes to vent through a 25 mm valve, so a front-mount core hisses about
    2.5x longer than a small one. Never on a diesel: with no throttle there is nothing to surge against.
  - **Intake roar** at the runner's Helmholtz frequency (the one the breathing model tunes), excited by
    each induction pulse and scaled by flow (MAP x rpm); open stacks and ITBs loudest, an airbox or a
    compressor in the way much less.
  - **Knock** rings at the chamber's first circumferential mode, Draper's 1.84 c / pi B in burnt gas
    (6.1 kHz in an 86 mm bore). It replaces the diesel's generic click: a diesel rings on every pulse,
    twice as hard from cold and harder at light load (longer ignition delay); a petrol engine rings on a
    share of cycles that grows past `KNOCK_TARGET`.
- test69: each voice at the pitch its hardware sets, BOV length vs charge volume, runner and bore
  direction, shaft- and crank-following pitch, BOV only on a real lift from boost, knock thresholds.

### Load, lope and overrun crackle in the engine sound (build 126)

- Load only turned the volume up. `soundDrive()` now sets each pulse's strength from the blowdown at
  exhaust-valve opening: manifold pressure × the charge's heating (1/lambda, capped at stoich). A fuel cut
  leaves 12% (compressed air only); a diesel's unthrottled manifold makes a soft pulse at idle because it
  is lean (lambda ~4), not because it is starved. A stronger pulse is also raspier (a finite-amplitude
  wave steepens faster), so the tone changes with load. Level now scales with cylinder size instead.
- The lope is cycle-to-cycle variation from overlap, with an occasional partial burn, and it fades with
  load as well as revs: residual gas needs manifold vacuum to flow back into the charge.
- Overrun crackle: a carburetted engine (no DFCO) on a closed throttle above idle misfires its thin
  charge into the pipe, and while the pipe is still hot from the pull (an exhaust-heat envelope, ~1.5 s)
  the fuel lights there: a weak pulse, then a pop past the header that the system, the cat (a working one
  oxidises most of the fuel) and the silencer shape like any other sound. Injected engines stay quiet;
  anti-lag pops on any lift.
- test68: harder pulses louder and brighter, pops above the pulses and softer through a cat; full throttle
  vs idle, fuel cut, lean diesel idle, lope fading with load, DFCO quiet, carb crackle dying as the pipe
  cools, anti-lag from cold.

### The exhaust in the engine sound (build 125)

- Build 124 rang every petrol engine at one fixed pipe tone. Each bank's pulses now run the build's own
  exhaust: the primary rings at its quarter wave, c/4L at the gas's sound speed, from the `primL` the
  breathing model already tunes (so a race header cut for 8800 rpm, 500 mm, sings at 309 Hz where one cut
  for 6600, 659 mm, sings at 231 Hz). Its Q comes from the header's path-length spread `exhSigma`: 1.4 for
  a cast log, 4.2 for a sport header, 10 for a race one. The system behind the collector (`sysL`, open at
  the tailpipe, gas at about 0.65 of port temperature) adds its half-wave drone.
- The silencer is not in the breathing model (it only sees back-pressure), so `SILENCER` states it: a
  chambered can on a stock system, a straight-through one on sport, next to nothing on race. A cat
  absorbs the top end in proportion to its restriction, and a turbine muffles both top end and level.
- Stock systems, cats and turbos are now quieter than before and race headers louder; the overall gain
  is recalibrated so a sport system matches the old loudness.
- test67: the primary rings at c/4L and its harmonic stands out of the spectrum, a header cut for higher
  revs is shorter and higher, ring follows path spread, and stock < race, cat < decat, turbo < NA in
  level and brightness.

### Engine sound from the firing pulses (build 124)

- The note was one sawtooth at the firing frequency, so every engine with the same firing rate sounded
  the same. It is now an AudioWorklet that keeps its own crank clock and fires each cylinder at its slot in
  `firingOrder()` (the order the LIVE bank draws), sending the pulse into its bank's exhaust: one channel
  for an inline engine, two, panned left and right, for a V or a boxer. Each bank rings its own resonator
  and saturates on its own. Nothing knows what a V8 is: 1-5-4-8-6-3-7-2 fires the banks A-B-A-B-B-A-B-A,
  and the burble falls out of that. Diesel, 2-stroke and rotary get their own pulse shape; the lope
  jitters pulse timing and strength at idle instead of wobbling the volume.
- The worklet is inline (blob: URL, falling back to data: from a file:// page) so the app stays one file;
  a browser without AudioWorklet keeps the old note.
- test66 renders it offline: every preset audible and unclipped, the pulse rate is the firing rate, a
  cross-plane V8's banks are uneven while an I4, I6, even-fire V6, V12 and rotary are even, and a V or a
  boxer is stereo while an inline engine is not.

### Real circuits (build 123)

- **22 real circuits** under a new REAL CIRCUITS group in the circuit menu: COTA, Brands Hatch GP,
  Hungaroring, Catalunya, Hockenheim, the Indianapolis oval, Albert Park, Hermanos Rodríguez, Gilles
  Villeneuve, Monza, Nürburgring GP, Bahrain, Interlagos, Sepang, Shanghai, Silverstone, Sochi, Spa,
  Red Bull Ring, Suzuka, Yas Marina and Zandvoort.
- `tools/import-real-tracks.mjs` builds them offline from three open sources: the TUM racetrack
  database (centreline and **measured** width, LGPL-3.0), georeferenced by a rigid fit onto
  bacinger/f1-circuits or OpenStreetMap (1.2-7.4 m RMS; Yas Marina 13 m), with heights from EU-DEM /
  USGS 10 m / SRTM through OpenTopoData, median-filtered and smoothed over ~60 m. The output,
  `tracks/real-circuits.js` (~200 KB), is loaded as its own file and cached by the service worker
  (cache v4); the app runs without it.
- Width comes through the existing `wprof` path, one multiplier per control point, so the physics is
  unchanged. The circuits are not passed through the GPS denoiser: TUM's centreline is already smooth,
  and denoising it again cut 1.3 % from every lap. Lengths land within 0.3 % of the official figures;
  Spa rises 103 m (real 104), Red Bull Ring 68 m (65), Interlagos 41 m (43), Suzuka 42 m (40).
- **test65** checks every real circuit: official length within 1 %, closed centreline, measured width,
  published elevation changes, flat circuits flat, and a lap that solves (Monza the fastest road circuit,
  the oval faster still). test32/38 accept a measured constant width (the oval), and test34 accepts a
  real circuit that is genuinely flat.

### The charge heated as it is drawn in; the valve's flow coefficient from Taylor (build 122)

- **The first law in the cylinder.** Build 121 integrated the intake stroke with the cylinder compressed as a
  fixed mass (p ~ rho^gamma) while gas poured in. Filling a volume from a plenum heats what is in it by the flow
  work (a vessel charged from a reservoir ends at gamma x its temperature), so the fill was overstated 5-10%.
  Now d(m cv T) = cp T_in dm - p dV + Q, starting from the residual the exhaust stroke left in the clearance
  volume at the temperature the cycle trace gives it after blowdown (~1150 K), and the walls' heat in at
  Woschni's gas-exchange flux (C1 6.18) to his 450 K wall. The heating itself is small (0-2%); the flow work
  is the large term.
- **Two stand-ins removed** where the stroke is integrated: veAmp's flat 0.95 ceiling and CAM.ampMul's fitted
  +4%/+8% cam bonus (the late-IVC charge it stood for is in the integration since build 121). Rotaries and
  two-strokes keep both.
- **The curtain's discharge coefficient** was a flat 0.6 at every lift, which averages ~0.3 over the event
  against the 0.42 mean flow coefficient the model takes from Taylor for the same valve (inletMachZ). Now it is
  the coefficient whose average over each cam's lift event, on the curtain-or-throat area, is Taylor's
  min(0.42, 1.5 L/D): one published figure for the valve, used the same way twice.
- **Result:** NA power RMS ~7% (F20C -8%, S54 +7%, GT3 -1%, Coyote +1%, F140 -3%, Huracan -8%, LS7 +8%); the
  runner's tuning orders again (long 5300, medium 5800, short 6050 rpm on the 1.6 archetype). Turbo engines are
  back near their build-121 overshoot (Supra +34%, RB26 +36%, GR Yaris +25%): the open boosted top end.
- **Known gaps, named:** the Aygo's 1KR-FE joins the limiter list in test60 (75 hp at its 6500 limiter, real 68
  at 6000), and the 1.6 Sport NA archetype test44's (as test46's); test48's Supra cap 33 -> 35.

### The intake stroke integrated; the driver holds a gear into the brakes (build 121)

- **The charge's momentum.** A late-closing intake valve was charged as pure crank-slider geometry (everything
  displaced after BDC pushed back out), repaid only by the tuned wave. The air in the runner has mass: it is
  still moving at BDC and keeps filling the cylinder until the cylinder's pressure stops it, more so the faster
  the engine turns, which is why race cams close late. Now the stroke from TDC to IVC is integrated as a lumped
  column, valve and cylinder (rho L du/dt = p0 - p_cyl - Borda loss at the curtain, Cd 0.6, sin^2 lift - the
  damping a flow rig measures on an intake tract, Q 4; the cylinder filled adiabatically). The same column and
  cylinder are the Helmholtz resonator, so tuning comes out of it too. A cam phaser takes, at full load, the
  phase that fills best. Tabulated once per engine.
- **NA engines:** power RMS vs the makers ~10% -> ~6%. LS7 (Z06) -17% -> +8%, 4A-GE -16% -> +7% (torque peak
  4600-5200, real 5200), S54 +17% -> +9%, Coyote +12% -> +2%, B6 exact. Turbo engines +3-5%; the RB26 and the
  diesels (no cam phaser, so the old geometric loss hit them hardest) +15-20%.
- **Inputs fixed:** the intake runner type where the hardware is known and the 320 mm default was wrong: the
  diesels' compact manifolds and the RB26's individual throttles short, the EJ257's boxer manifold long (marked
  unsure). The compact turbo petrols' runners were left at the default: not known well enough to set. The 1993
  2JZ-GTE has no VVT-i (Toyota added it for MY1998); it changes nothing at peak power.
- **Known gaps, named:** turbo engines still read high at the top (item under investigation: compressor sizes
  looked up, GR Yaris 56 mm, FK8 58 mm, CT12B 2x58 mm, IS20 54 mm, 16G ~68 mm; on their own they do not close
  it); the 4A-GE, the 1.6 Sport NA archetype and the Duramax now peak at the limiter, power creeping ~1% over the
  last 10% where real engines fade; the V12 archetype reaches 15.8 bar BMEP against a real-engine ceiling of 15.
  The heat the charge takes from the ports and valves as it is drawn in is not modelled yet and would take some
  of the new fill back from every engine: next. Re-baselined, each with its reason: test48 power RMS 14 -> 15.5,
  Supra cap 30 -> 33, Alto 20 -> 22; test47 NA BMEP budget 1 -> 2, the 2.5 Turbo I5 archetype held at 26.5 bar;
  test46 limiter budget 2 -> 3; test60's known list (the N57 left it). test62's boost gauge may read under full
  boost at full throttle where the shaft is spooling back (since build 118).
- **Upshift look-ahead.** Before changing up the driver runs on both ways, holding the gear or shifting, to the
  braking envelope, and takes the quicker. Laps up to 0.08 s quicker, never slower (Hellcat on Cape 15 -> 11
  shifts). The replay shows the held gear.

### Turbo lag at a fifth of the cost; re-baselined checks (build 120)

- The lap's turbo walk (build 118) added 1.3 s to a Nordschleife solve: it re-ran the shaft from rest and
  stepped it every 2 ms. Now the shaft starts settled where the car is fastest (flat for a while, so spun
  up to what the revs support) and one walk is the lap-to-lap state: identical laps on all 15 turbo
  presets. And the lap steps it every 10 ms (no lap moves by more than 0.01 s against 2 ms; the 0-100 run
  and the bench keep 2 ms). A turbo Nordschleife solve 1.36 -> 0.27 s; GPX import + solve 3.8 s.
- **Lap per Dollar** target 73.0 -> 70.0 s: build 117 took the flat shift charge out (laps 1-2 s
  quicker) and a 112 hp kei car got under 73.0 at 72.7 s. The reference build does 65.9 s.
- test34: on the 150 m circle with 40 m hills (grades to 53%) the vertical load is past the bump-stop
  cap, the slope itself takes load (cos 28 deg) and tyre drag slows each descent, so the fastest point is
  3.5% under the 20 m case; it still has to beat the flat circle.

### Tyre cornering drag (build 119)

- A tyre makes its side force by running at a slip angle, so the force leans back against the travel by
  that angle: drag Fy alpha = Fy^2/(CC Fz), summed over the tyres (m ay)^2/(CC N), with the cornering
  coefficient CC 0.2 per degree (Gillespie, ch. 10), linear to the limit (the least it can cost). It is a
  resistance on the power, in a shift's coast and in the throttle the replay and the turbo's shaft read,
  and it helps the brakes into a corner. At the limit it is about 0.09 g, several times the aero drag at
  corner speeds. The racing line's optimiser solves with it too.
- Laps 0.3-0.8 s slower (911 GT3 Cape 64.71 -> 65.00 s, MX-5 Ashdown 80.72 -> 81.50 s).

### Turbo lag on the lap (build 118)

- The lap gave a turbo its full boost wherever it was flat, as if the shaft were always spun up. Now the
  shaft (advanceShaft, the one the 0-100 run and the bench integrate) is run along the solved lap in time
  order, at each point's revs and throttle, until it repeats lap to lap: boost bleeds off on a lift, under
  braking and through a shift, and builds back on the power. The torque the boost there gives, against
  full boost, scales the drive and the forward pass is solved again (twice: the throttle depends on the
  drive available). The replay's boost gauge shows the boost the shaft has built.
- **Result:** these turbos spool fast (a Supra's shaft is 3.2e-5 kg m^2) and the corner exits where the
  boost is still building are mostly traction-limited, so lag costs 0-0.08 s a lap on the technical
  circuit (WRX STI 0.08, GR Yaris 0.07). A shift skipped because the braking point came first can make a
  lap up to 0.04 s quicker: the driver upshifts at the best-force point even just before braking, where a
  real one holds the gear to the limiter (open).
- The torque grid is built once per engine (0.15 s) and reused by every lap.
- Fixed in build 117's shifts: the forward pass's second time round (for the lap's wrap) saw every point as
  off the power, so it dropped the replay's shift marks and the gear state across the line.

### Brake heat split from the hydraulics; gear shifts in the lap solve (build 117)

- **Brake heat split.** The heat each axle's rotors took was the ideal load split at every deceleration,
  floored at 50/50, so a light lift on a rear-engined car put half the heat into its small rear rotors: the
  911 GT3's rears ran hotter than its fronts (650 vs 512 C on Cape), the Huracan's too. Now the hydraulics
  set it: both axles see the same line pressure, so the pistons and rotor radii fix the front share (GT3
  0.73, Huracan 0.64), until one axle's tyres reach their grip at the load the transfer leaves them; ABS
  holds that axle there and the other takes the rest. GT3 fronts 653 / rears 416 C, Huracan 659 / 600 C.
- **Gear shifts.** Every gear change, up or down, was charged half a shift time after the lap was solved,
  and the clock spread it over the replay. Now the forward pass carries the gear: an upshift on the power
  cuts the drive for the gearbox's shift time and the car coasts against drag, rolling resistance and the
  slope for as far as it travels meanwhile (the last step only for the share of it the shift lasts); a
  downshift, made braking or lifting, costs nothing, and on the power the driver keeps the gear just
  selected. The SHIFTS cell shows the difference to the same lap with instant shifts: a 2JZ coupe on
  Riverside 2.45 -> 0.54 s, a PDK 911 GT3 0.25 s. The replay's throttle reads zero mid-shift.
- The manual's 0.35 s shift time is a driver's figure (a quick hand shift, clutch to clutch), not derived:
  it stays an input.
- test62's replay clock is the plain integral now.

### Engine breathing: valve overlap and exhaust waves (build 116)

Found checking why the Lancer Evo IX felt lethargic (0-100 6.8 s against a real 5.0): its engine made
242 hp of its 286.
- **A turbo's boost was read as reverse flow.** The flow across the valve overlap was driven by the exhaust
  wave less the exhaust back-pressure, leaving out that a boosted intake sits at the boost: an Evo at
  1.3 bar, its turbine holding about that in the manifold, lost a quarter of its charge. Now the intake's
  pressure is in the balance, and what blows through can at most refill the clearance volume (1/(CR-1)).
- **The overlap's flow area was a constant.** OVERLAP_LIFT held both valves at 15% of full lift across the
  whole window on every cam: a 72-degree race cam's lift at TDC, four times a road cam's. Now the mean of the
  smaller curtain over the window, from each cam's duration and overlap (sin^2 lift), with a curtain's
  discharge coefficient 0.6 (Heywood). It had cost every NA engine 10-12% to reverse flow.
- **The exhaust wave's pipe friction was a constant.** 0.35 per metre, about 20x what the boundary layers
  take (Kirchhoff: sqrt(omega nu/2)(1 + (gamma-1)/sqrt Pr)/(r c)); a tuned header's suction now arrives
  at 0.13-0.16 bar.
- **Result:** Evo IX 290 hp (real 286), 0-100 5.2 s; Huracan 625/602, GT3 529/493, 812 831/789, LS3 408/430,
  S2000 237/240. Still short: Z06 417/505, 4A-GE 108/128, the rotaries (port breathing, queued). Turbo
  engines now read high at the top (Supra 410/320): they hold full boost to the limiter, where real ECUs
  taper it.
- Tests re-baselined with reasons: test46 (scavenging floor 2%), test40 (over-flowed frame against one that
  feeds), test43, test35, test48 (power RMS 14, Supra and S54 named), test60 (812 flat top), test61 (812
  launch listed; RS3 and Duramax fixed), test63, Club Sprint reliability 50.

### Each car's own minimum-time racing line (build 115)

From the driving review. The line was one minimum-curvature shape for every car, bent by a fitted late-apex
bias (3 x how open the next 90 m were), and the review found the geometry under it was not sound either.
- **The car's width:** its centre now comes no closer to an edge than half the width over its tyres.
- **The curvature it minimised was not curvature.** Sum |Q''|^2 is ~ length^2 x turn per node, so a shorter
  line scored better: a 150 m circle was driven at 145 m, on the inside. Now sum kappa^2 l.
- **The centreline had kinks.** A uniform Catmull-Rom through unevenly spaced control points overshoots and
  nearly cusps (a 25 m corner carried 4 m kinks), and stepping it evenly in its parameter bunched the
  samples. Now a centripetal Catmull-Rom (cannot cusp; Yuksel et al. 2011), resampled every 5 m.
- **The line's radius** is now the offset curve's own (from the centreline's curvature and the offset's
  slope and bend), not a circle through points 3 either side: that 30 m chord rounded off curvature peaks
  the car still has to drive, and through the neighbouring points instead the radius was all noise.
- **GPS traces** (the Nordschleife, imported tracks) are smoothed only within the receiver's 2.5 m accuracy,
  so their noise stops inventing corners.
- **Minimum time, for each car:** from minimum curvature, the line is moved by smooth bumps; the car's speed
  is re-solved only where a move can change it (out until the speeds rejoin the solved ones), with the lap
  solver's own per-point physics, and every move that makes the lap quicker is kept. Late apexes come out
  of it where a corner opens onto a straight (2.3 m later onto the long side of a test rectangle, 2.3 m
  earlier onto the short one) and the fitted bias is gone. 0.2-0.4 s per car per circuit, ~3 s on the
  Nordschleife, cached per car.
- **Laps:** 911 GT3 Nordschleife 7:25 -> 7:01 (real 7:12.7 on the 20.6 km layout; this trace is 20.2 km), Riverside 63.5 -> 59.5 s.
- **The lap solver's steps are functions of a point** (ceilAt, brakeFrom, accFrom) so the optimiser runs the
  same physics; the gear search is tabulated per 0.05 m/s.
- **GT3 preset:** a splitter and lip for the real car's wing and lip (aero marked unsure).
- **The live engine readout is hidden on the TRACK tab**, which has its own instruments.
- Tests: test32 (centreline comparison on the car's line; each car its own line), test38 (late apex on a
  controlled rectangle; never slower than minimum curvature), test34 (top speed may plateau at the bump
  stop), test36 (Ring reference on semi-slicks), guide text in both languages.

### The lap brakes at the limit (build 114)

- **A solver bug, found reviewing the driving model.** The lap's backward (braking) pass read the
  friction circle at each point's cornering ceiling instead of at the speed it was solving for. At the
  ceiling the tyre is all used sideways, so almost no braking was left, the pass fell back to its
  0.1 m/s2 floor, and the car crept into corners. On the Nordschleife a 911 GT3 rolled 250 m at 82 km/h
  down a 13% hill into a 42 m corner; on a test, 281 of 486 braking points used under 90% of the grip
  there was. Now it iterates the grip at the speed being solved.
- **Laps 6-22% faster:** 911 GT3 Nordschleife 8:22 -> 7:25 (real 7:12.7 on the 20.6 km layout),
  Riverside 78.4 -> 63.5 s.
- test63 checks that inside every braking zone the car slows at 90%+ of what the tyres and brakes allow
  at its speed (fails 281/486 on the old solver). Challenge targets re-set with the reference margins
  (Club Sprint 80.5 s, Grand Prix Pace 61.2 s, Lap per Dollar 73.0 s; Under Seven back on the supercar
  body). test30/32: the authored "light car wins the technical circuit" dropped (the bug had held it up;
  the relative claim stays), the spool's lap loss checked as 1% not 1 s.

### Brakes from the hydraulics, and pressure build-up (build 113)

- **The brakes' peak deceleration was a fitted figure** (1.05-1.95 g per kit, x a rotor factor). It held
  every steel-braked small car at 0.89 g, short of its own tyres, so they stopped in 43 m against a
  real ~37-42, and it gave kits a single-stop advantage real road brakes do not have.
- **Now from the hydraulics:** per wheel, 2 pads x pad mu x line pressure x piston area x the friction
  ring's effective radius (0.4 D), over the tyre radius. Catalogue caliper sizes per kit (a sliding
  54-57 mm single piston, an opposed 4-pot, a 6-pot), pad mu 0.38-0.45, ~100 bar of line pressure in
  an emergency stop. Every factory car's brakes out-pull its tyres (1.3-2.9 g of brake against
  1.0-1.4 g of tyre), as road brakes do; kits differ by heat, fade headroom and pad.
- **New HEAVY-DUTY brakes** (twin 60 mm pistons) for the pickups: car calipers gave a 3.4 t Silverado
  HD 0.60 g.
- **Pressure build-up:** the stop's deceleration rises over 0.2 s (Limpert: 0.2-0.3 s with a booster),
  ~2.8 m from 100 km/h. 100-0 now: Aygo 39.1 m, Fiesta 40.4, GTI 36.0, M3 35.7, GT3 31.1, Silverado
  39.5. (On a lap the build-up costs ~0.01 s a braking zone and is left out.)
- test63 checks every factory car's brakes reach its tyres, and small cars / the GT3 against published
  100-0 ranges. The replay's brake bar is the share of the system's line pressure.

### Analog gauges and a boost gauge in live timing (build 112)

- **GAUGES: DIGITAL / ANALOG** beside the replay controls (remembered). Analog draws a rev counter
  (thousands, red from the redline, gear in its face), a speedometer scaled to the car's top speed,
  vertical pedals, the g-meter and the brake temperatures.
- **Boost gauge** on turbo and supercharged engines, in both sets: manifold pressure against atmosphere,
  vacuum below zero. The replay records it per point (steadyMapAt): a share of full-throttle drive wants
  that share of full-throttle pressure, 1 + boostAvail(rpm), no lower than a closed throttle holds
  (mapTarget's own throttle law, floor 0.12 bar abs); a diesel has no throttle plate. Steady boost:
  the lap has no turbo lag yet (queued).
- The digital set's g readout no longer overlaps the brake line. test62 checks the gauge reads the
  engine's own boost at full throttle, pulls vacuum on a closed throttle, stays at zero on an NA engine,
  and that the option switches.

### Tyre grip on asphalt, and the friction ellipse (build 111)

- **Cornering read 10-20% high.** On sport tyres the cars pulled 1.02-1.11 g on a skidpad against the
  published 0.87-1.00 (an E46 M3: 1.09 g against Car and Driver's 0.87), and the 911 GT3 on Cup 2s
  1.31 g against ~1.10. Eco tyres already matched. The sport, street, semi and slick figures had been
  set nearer test-rig values (abrasive belts grip ~15% harder than road asphalt).
- **But lowering them slowed every launch** (Corvette 0-100 +32%), while braking and acceleration had
  matched. That is a real mechanism the model lacked: **a tyre grips harder along its length than
  across it**, peak longitudinal force 10-20% over peak lateral (Milliken & Milliken, RCVD ch. 2).
- **Now:** the compound mu is the lateral figure, on asphalt: eco 0.90, street 0.95, sport 1.00,
  semi 1.13, slick 1.30 (drag radial unchanged at a prepared strip's 1.70). Braking and traction take
  1.15 of it, and combined use follows the ellipse.
- **Result:** sport-tyre skidpads 0.90-0.98 g, the GT3 1.11 g; sport cars' 0-100 and 100-0 unchanged;
  laps ~6% slower. Challenge targets re-set with the reference builds' margins (Club Sprint 94.5 s,
  Grand Prix Pace 70.5 s, Lap per Dollar 83.5 s); Under Seven keeps 7:00 with the reference V8 moved
  to the hypercar body (6:54). test41: M2 cap 11 -> 13%, RMS budget 9 -> 9.5, the kei grip ladder
  checked as shares of its time.

### Brake cooling from the rotor's real airflow (build 110)

- **The rotors cooled too slowly.** A 911 GT3's front rotor took 200 s to go from 600 to 300 C at
  150 km/h, and carbon-ceramics ~100 s. The cooling had three faults: the faces saw half the car's
  speed in a flat-plate correlation; the vanes were counted as 0.8 of extra face area in the outside
  air (and radiated, though they face each other); and no car had brake ducts.
- **Now, from Limpert (Brake Design and Safety):**
  - faces and rim at the car's speed, h = 0.04 (k/D) Re^0.8 (laminar 0.70 (k/D) Re^0.55 below Re 2.4e5);
  - the vanes as a centrifugal pump, 0.0158 n sqrt(Do² − Di²) m/s at wheel rpm n, losing heat as a
    short duct does, h = 0.023 [1 + (dh/l)^0.67] Re^0.8 Pr^0.33 (k/dh), capped by what the air passing
    through can carry (NTU);
  - radiation from the outside surfaces only;
  - big-brake and carbon kits bring a 76 mm duct to the front rotors, its flow from the car's dynamic
    pressure against the hose's standard losses (K 2.5).
- **Result:** 911 GT3 600→300 C at 150 km/h in 99 s (was 200), Huracán 52 s (was 100), MX-5 77 s
  (was 158). Peak front temperatures on a Nordschleife lap: 911 GT3 483 C (was 736), Huracán 577 C
  (was 792), M3 741 C (was 857). test63 checks the vanes, the duct and the 911's cooling time.

### Tyre grip from load, not from three multipliers (build 109)

- **Grip was a stack of fitted factors:** the compound's μ × a chassis grip factor (0.92-1.30) × a
  suspension factor (0.95-1.10) × a width bonus (up to +7.5%). They stacked to μ ~1.7 on a supercar on
  semi-slicks (a 23 m 100-0 against a real ~31) and pulled economy cars down (48 m against ~41).
- **Now it is the tyre and the load on it.** Load sensitivity: μ = μ_ref (Fz/Fz_ref)^−0.15, about 10%
  less per doubling of load. The reference load is 60% of the tyre's rating, and the rating follows the
  tyre's air volume (π/4 (D² − d²) w at ~16,300 kg/m³, within 3% of real load indices). So a bigger
  tyre, a lighter car, and less weight thrown onto the outside tyres grip harder, by one mechanism.
- **Cornering:** lateral load transfer m·a_y·h/t over the axle's **track width** (new, per chassis), and
  **camber**: the outside tyre's static camber plus the body roll the geometry does not recover, against
  a best angle of −1.5° at 1.5% per degree. Suspensions are now a roll gradient and a static camber
  (comfort 6°/g at −0.5° … race 1.5°/g at −2.5°). The lap solver iterates cornering speed and grip.
- **Effect:** 100-0 coherent (GT3 27 m, Aygo 43 m, 812 32 m against ~31, ~41, ~31.5). Skidpad grip is
  still 5-15% above published figures, and 0-100 slower for rear-drivers that lean on traction
  (test48 8.7% own power). Race-prepared builds lost 5-8% of lap time; the challenge targets were set
  under the old grip and are re-set with the margins they had (Club Sprint 89 s, Grand Prix Pace 66.0 s,
  Lap per Dollar 78.4 s); Under Seven at the Ring keeps 7:00 with a 600 hp supercar as its reference.
  The fast-circuit check is now relative, and the Supra, M2 and Hellcat are named for traction.
- Next for grip: the compound μ values against skidpad data, and the brake pressure build-up.

### Brake temperature, live on the track (build 108)

- **Brakes have a temperature now, and fade comes from it.** Each rotor is sized from its diameter
  (friction ring 0.6-1.0 D, ~9% of D thick vented and 70% solid, ~4.5% solid; rears 0.9 of the fronts)
  in grey iron or carbon-ceramic. It is heated by what the brakes take out of the car (m·a·v, shared by
  the axle loads while braking, 90% into the rotor) and cooled by convection (turbulent flat plate,
  Nu = 0.037 Re^0.8 Pr^⅓, air at half the car's speed; vanes add 80% area) and radiation. Pads lose
  friction above their onset: street 400 °C, performance 550, track 650, carbon-ceramic 1000, to the
  same 35% the stops always allowed. This replaces the fitted fade budget (1.1 MJ × a factor).
- **On the lap** the solved profile runs through the rotors lap after lap until the temperature at the
  line repeats (sustained running), fade feeds back into the lap, and the replay carries it.
- **Live:** the instruments show front and rear rotor temperature, blue cold, green working, yellow near
  the pads' onset, red past it with the fade in %; the brake bar turns orange while fading. The lap panel
  shows the lap's peak and the worst fade.
- A single stop from 100 km/h no longer fades (it never should have), which exposes the fitted grip
  multipliers: the archetype supercars on semi-slicks (μ ~1.7) stop in ~24 m, named in test47; the
  tyre item is the fix. test63's diff check now compares the straight-line braking ceiling with fade
  off, which is what it is about.

### Spinning parts, and the energy a launch takes from the flywheel (build 107)

- **The car now spins up its engine and wheels as it accelerates.** The effective mass in a gear is
  m + [I_wheels + I_engine·(gear × final)²·η]/r² (Gillespie): 15-40% more than the car in first, ~10%
  in third. It applies while the tyres hold; when they slip the surplus only spins the wheels and the
  car gets the tyre's force over its own mass. The engine counts only while coupled (not mid-shift,
  not on a slipping clutch or a converter below stall). Same in the lap solver.
- **Engine inertia is derived.** It was a feel for how the live bench revs (a 6.2 V8 got ~1.0 kg·m²,
  about three times real). The flywheel is now sized by the clutch, and the clutch by the torque it
  carries (1.3× peak; two faces, μ 0.3, 0.25 MPa, inner/outer 0.65), plus cover and crank shares:
  ~0.10 kg·m² for a 2.0, ~0.23 for a V8. **Wheel and tyre inertia** come from the fitted tyre size.
- **The clutch launch draws on the flywheel.** The clutch passes what the tyres can take up to its
  capacity, and where that is more than the engine makes the flywheel slows and gives up its energy
  until the clutch locks.
- **Effect:** 0-100 is honestly slower. test48 RMS 4.8% → 6.2% (power-matched 7.7% → 9.2%); real cars
  in test61 21.1% on own power, 11.4% power-matched (the car alone, unchanged). test41's harness now
  gives each power-matched car the flywheel of its matched torque (a 64 hp kei was spinning a 3.0 six's
  flywheel), and its budgets are set at today's state with the Supra and STI named: the 5% it met
  before was met with no spinning mass, so another term was compensating. Candidates: the manual
  gearbox's fitted 0.35 s drive cut and the traction multipliers. The RS3 is back on test61's list
  (its engine's late boost; the added mass takes it over 25% again).
### Pixel-art car and engine (build 106)

- **The car, side on**, at the top of the VEHICLE tab, drawn from the build rather than chosen from a
  gallery:
  - each of the 13 chassis has its own silhouette
  - the length comes from the wheelbase, and a real car uses its own wheelbase
  - the wheels come from the rim and tyre sizes, and the ride height from the suspension
  - the splitter, front wing, lip, rear wing, undertray and diffuser are drawn when fitted
  - the brake calipers are coloured by brake type, and the driven wheels have green hubs
  - a green block marks the engine in front of the cabin, behind it, or behind the rear axle, from
    the same engine position the weight split uses
- **The engine, from outside**, at the top of the ENGINE tab, following the form as you edit:
  - an inline is drawn side on and a V or boxer from the front, so the bank angle shows; a rotary is
    drawn as its stack of housings
  - bore and stroke set the block's proportions, and the cam sets the valve-cover colour
  - induction: carbs, sidedrafts, ITBs, mechanical injection or EFI; single, twin, sequential or
    compound turbos, with VGT; roots, twin-screw or centrifugal blowers
  - the intercooler and the radiator are drawn to size, and the nitrous bottle, headers by exhaust
    grade, the cat and the fuel are shown too
- **GARAGE thumbnails**: every saved car and engine card shows its picture. It is drawn from the
  saved record, so an old record with missing fields falls back to the defaults.
- **TRACK**: the arrow on the map is now a top-down car in the chassis livery. It glows green on the
  throttle, and on the brake it glows red with lit brake lamps.
- Everything is drawn into a grid of whole cells and scaled up with smoothing off, so the pixels stay
  crisp at any size. The animation stops when the system asks for reduced motion.
- `tests/test64.mjs`:
  - every chassis × drive × aero combination and every engine type × layout × count × induction
    combination draws
  - a wing, bigger wheels, a turbo and a mid-engine layout each change the picture the right way
  - the tab previews follow the form, and saved builds get thumbnails

### Vehicle dynamics: five inconsistencies fixed (build 105)

From the vehicle review: places where the straight-line run and the lap solver, two integrations of
one car, disagreed, or where a part did something it physically cannot.

- **Load transfer on the lap.** The lap gave the driven axle its static share and nothing more, so a
  rear-driver got no exit traction from squat and a front-driver lost none. It now carries the weight
  acceleration moves onto the rear, m·a·h/L, solved in closed form because grip depends on the load and
  the load on the acceleration. The 0-100 run already had it.
- **Aero balance.** Downforce went 50/50 to the axles whatever was fitted, so a rear wing helped a
  front-driver's traction as much as a rear-driver's. Front parts now load the front axle, rear parts
  the rear, an undertray mid-wheelbase and a diffuser 35/65; both the run and the lap use it.
- **Brake fade on the lap.** Brakes faded on the 100-0 stop but never on a lap. The lap now uses the same
  per-stop fade, heat counted from the start of each braking zone, and solves again where it bites.
- **A locked diff scrubs in corners, not under straight braking.** Its cornering penalty was cutting
  the braking budget too; braking now uses the tyre's own μ, with the scrub on the lateral side only.
- **An engine swap moves the weight split,** by the change in engine mass at the engine's position
  (front-engined ~0.9 of it on the front axle, mid ~0.3, rear ~−0.1). Real cars only, whose factory
  engine is known; the factory engine still gives the published split exactly.
- Effect on the real cars at Riverside GP: rear-drivers 0.2-0.6 s quicker, front-drivers 0.2-0.3 s
  slower, 0-100 unchanged; on the Nordschleife a car on slotted steel loses ~4 s to fade. test63.

### Live timing on the track (build 104)

- **The solved lap, replayed in real time** on the track map: the car runs along the racing line with a
  two-second trail, green on the throttle, red on the brake. 1×, 2× or 4×, PAUSE and RESTART in the
  track panel; it loops, and starts again whenever the lap is recomputed.
- **Live clock and sector splits** at the top of the map, beside the solved lap time.
- **Instruments:** speed, gear and rpm with a rev bar to the redline; throttle and brake bars; a
  g-meter (lateral across, braking up) with rings at 1 g and at the tyre's grip.
- **No new physics:** the lap solver now records what the car does at each point (its clock, the
  pedals, signed lateral and longitudinal g, rpm), from the terms it already uses. Throttle is full
  where the car accelerates as hard as it may; on the cornering ceiling it is the drive force needed to
  hold speed against drag and slope, against what the gear has; brake is the deceleration beyond what
  drag and slope give, against what the brakes command. Where drag alone slows the car, the driver lifts.
- The map fits the space beside the instruments. test62 checks the replay against the lap on every
  circuit, for a light and a heavy car, and the controls.

### A GARAGE tab, for engines and cars (build 103)

- **The garage has its own tab** instead of a strip at the bottom of the vehicle tab: CARS and ENGINES
  as two walls of cards, each with its headline numbers, **VIEW** (the spec it will load: engine,
  bore and stroke, compression, induction, fuel, output, and for a car its body, drivetrain, tyres and
  limiter), **LOAD** and **DELETE**.
- **Engines can be saved on their own:** SAVE ENGINE at the bottom of the engine tab. Loading one drops it
  into the car you have now. SAVE CAR (at the bottom of the vehicle tab) keeps the whole car as before.
- Saves made before this build carry no kind and are listed as cars, which is what they are. 24 of each.
- The loaded-build strip shows a garage name after loading. Greek translations and the guide cover it.
- **Phones:** eight tabs no longer fit one row, so they wrap to two rows of four.

### UI: compact forms, two-step presets, what is loaded, tyre rating fixes (build 102)

- **Fields are a size, not half the panel.** The design forms were a fixed two-column grid, so every
  select and number box stretched to ~600 px. They now pack as 170-220 px cells, four to a row on a
  desktop and two on a phone.
- **Presets in two steps:** pick a family (the categories), then a build in it, on both the engine and
  the vehicle tab. The chosen build stays selected after loading.
- **What is loaded, on every tab:** a strip under the title shows the engine and the car (with peak hp
  and 0-100), marks them "(modified)" once you change them, and takes you to their tab when clicked.
  Loading an engine still opens the dyno, and the strip says what it was. An engine build now drops into
  the car you have instead of resetting it to the default coupe.
- **Tyre speed rating:** changing the rating now re-checks the warning (the select was never wired to a
  rebuild), and a new compound raises the rating to the one it is sold in. "(Y)" was stored as a 340
  km/h ceiling, so it warned on every faster car; it means above 300, tested to the car, and no longer
  has a ceiling. test45 checks both through the UI.

### The exhaust share from the energy balance, read as a thermocouple reads it (build 101)

- **The exhaust's share of the fuel's heat is what the balance leaves**, for every poppet-valve engine:
  1 − gross indicated work − heat to the cylinder walls − heat to the exhaust port − fuel left unburned.
  It replaces "roughly a third" (0.40 − 0.24·η on a brake efficiency of 0.36 × crFactor), two hand-set
  rules checked against measured EGT while the wall split did not conserve energy.
  - **Work:** the same gross efficiency the torque uses, by speed and mixture.
  - **Wall heat:** Woschni (3.26, his combustion term included) over a traced, closed-loop cycle, tabulated
    by rpm, on the wall the gas really touches: a pent-roof head tilted by half the valve angle, a DI
    diesel's bowl. ~0.10-0.12 of the heat at rated speed, ~0.3 at 1000 rpm. Build 98's low-end torque
    loss now uses this table; the curves barely move.
  - **Port:** Caton & Heywood's exhaust-port correlation, Nu = 0.0483 Re^0.783: ~3-4%.
  - **Unburned fuel:** Heywood's 2-5% (spark) and ~2% (diesel), midpoints.
  - **The heated gas is air and fuel** (afr + 1), not air alone. The exhaust cp of 1150 was checked against
    product composition (~1160 over 300-1100 K) and stands.
- **Two temperatures, because there are two:** the balance gives the MASS-averaged gas temperature, which
  drives the turbine and heats its vanes (h ~ Re^0.8 weights the blowdown hard), so the vane limit and
  the diesel's fuel cap stay on it. A thermocouple reads close to the TIME average (Caton 1982), lower
  because the hottest gas passes fastest; derived from the blowdown (isentropic from p_EVO, a share
  1 − r^(−1/γ) of the gas in the cam's blowdown duty) and the displacement phase. Reported EGT and the
  tests' measured bands use that.
- **Results:** NA engines 818-938 C, turbo petrols 880-1048 C, diesels held at the vane limit as before.
  The RS3's 'slow-car' and the Evo IX's 'short' resolve (test61). Named: the 1.6 NA reads 818 against a
  band from 820 and the 2JZ archetype 1001 against a 1000 ceiling (the turbo manifold's heat loss is not
  counted yet); the ported engines, still on the old hand-set share, cool with the air + fuel mass; the
  petrol VGT now holds boost from idle (realistic low-rpm gas; the turbine throat convention makes every
  turbine smaller than its frame).

### Rotary geometry, and a charge every turn (build 100)

- **Wankel displacement is a Wankel's.** A chamber sweeps 3√3·e·R·W (e the eccentricity, R the
  generating radius, W the rotor width), and each rotor fills one chamber per shaft turn. It was the
  piston formula on R and W, π/4·R²·W, which has no eccentricity at all. New input: ECCENTRICITY e
  (rotary only; builds saved without it take R/7, Mazda's ratio on every production rotor). The
  archetype rotaries now carry the real 13B rotor (e 15, R 105, W 80): 1308 cc, where they were 804.
- **Ported engines draw a charge every shaft turn, in every air-flow rate.** Every flow (turbo,
  compressor choke, exhaust pulses, header sizing, fuel flow, BSFC) counted one charge per two turns,
  a four-stroke's, while the torque already counted one per turn. A rotary and a two-stroke were
  breathing half their air everywhere except the torque.
- **The rotary's thirst factor goes from 1.48 to 1.** It offset the half-rate air; with the rate right,
  a side-ported rotor has almost no overlap to lose fresh charge through, so it burns what it traps.
  Rotary full-load BSFC 400-423 g/kWh. (The two-stroke's 1.45 is short-circuited charge, 1/0.69, and
  now applies to the right air; its BSFC, 700-800 against a real 450-600, exposes its fitted 0.60.)
- **The 13B spools like an FD:** 90% boost at ~2400 rpm, where it was ~7400 (real ~3000). test56
  carried this as a known gap blamed on missing pulse energy; the cause was half the exhaust flow.
- **Real rotaries, in a new Rotary category:** 13B-REW (RX-7 FD, 1993 US rating) and 13B-MSP Renesis
  (RX-8), with the RX-7 FD and RX-8 cars. They read −32% and −45% on power: the rotary's IMEP factor
  (0.70) is still fitted, and a rotary's port breathing is not modelled. That is the next rotary item.

### Speed limiter, removable (build 99)

- **A road-speed governor on the vehicle tab:** SPEED LIMITER on/off and its km/h. When on, the engine
  gives only the force that holds the set speed once the car reaches it, as a fuel-cut governor does,
  so it shapes the run, the trap speeds and the track lap (a lower speed ceiling), not only the top-speed
  figure. It cannot add speed the car does not have. Turn it OFF to remove it; the summary then shows
  the car's free top speed, and the car reads as modified.
- **Real cars arrive with their factory governor** (GTI 246, M3 250, Alto 140, …); archetype chassis
  arrive without one. The setting travels with saved builds.
- **test61:** a governed car holds exactly its governor, removing it frees the car (M3 E46 250 → 289
  km/h) without touching the 0-100, and top-speed error is now reported over all 26 cars: RMS 4.0%. The
  "reaches its governor" check is now 97%, which names the R34, STI and Evo IX (233-242 km/h): their
  engines are the three already 17-26% short of their ratings.

### Wall heat comes out of the work, not only the exhaust (build 98)

- **A slow engine is no longer as efficient as a fast one.** The model already said the walls take more
  of the fuel's heat at low speed (Woschni, (B·Sp)^−0.2), but it took all of that heat from the exhaust
  and none from the work, which did not conserve energy. NA spark engines therefore breathed and burned
  as well at 1000 rpm as at 4000, and the Coyote, F140 and 4A-GE peaked at 1000–1400 rpm.
- **How much comes out of the work is derived from when the walls take it.** One full-load cycle is
  traced at the anchor speed: compression, the model's own Wiebe burn, expansion, blowdown and the
  exhaust stroke, with Woschni's heat-transfer coefficient (including its combustion term) on the wall
  area the gas touches. A joule lost before the exhaust valve opens would have earned the expansion
  still ahead of it, 1 − (V/V_EVO)^(γ−1); one lost after earns nothing. The flux-weighted average,
  κ ≈ 0.25 for spark engines and 0.36 for diesels, is the work's share; the exhaust takes the rest.
- **Anchored where each efficiency figure was measured,** so the anchors still hold: a spark engine's
  0.8 × fuel-air cycle at the reference rated speed, a diesel's 0.46 at 2000 rpm on a 2.0 TDI.
- **Results:** torque peaks Coyote 4700 rpm (real 4600), F140 4900 (7000), 4A-GE 5600 (5200); test60
  retires all three 'flat-low-end' entries. Real-engine RMS 15.6% power, 14.7% torque.
- **Named with floors, each traced to one cause:** the 1.6 NA's full-load EGT reads 816 C against a
  band from 820, and the petrol VGT's vane penalty is 9 points (was 10). Conserving energy took ~14 K
  off the top-end gas; the base exhaust share ("roughly a third") was set under the old split and is
  the next thing to derive. The 2.0 TDI in test48 reads +16% (cap 15): it already peaked at its limiter,
  and above its 2000 rpm anchor the walls take less.
- **Test fixes found on the way:** test45's car search accepted a car rev-limited a gear down (no slack
  now); test49's vane sweep starts at idle, below any boost threshold; test59's fuel check allows the
  1e-4 the fuel's flame temperature now moves the wall-heat timing.

### Real cars as presets, with their own bodies (build 97)

- **A real car is one member of its chassis class, with its own body.** Each car carries its curb mass,
  measured Cd, frontal area, wheelbase and front weight share over its archetype; the archetype still
  supplies CG height and mechanical grip, which are not published car by car. The platform mass is curb
  mass less the factory engine, so an engine swap moves the mass by the difference between the engines.
  The body is saved with every build, and picking a generic chassis drops it.
- **26 cars, paired with their factory engines** from build 96, in the same categories: Alto Works,
  Aygo, 500 TwinAir, Fiesta EcoBoost, GTI Mk7, GR Yaris, Civic Type R, MX-5 NA, AE86, S2000, E46 M3,
  911 GT3, Supra A80, R34 GT-R, Impreza STI, Evo IX, RS3, Corvette C6 and Z06, Mustang GT, Challenger
  Hellcat, Huracán, 812 Superfast, Golf TDI, 330d, Silverado HD Duramax. Each arrives on its factory
  fitment (tyres, brakes, gearbox, diff) with tyres rated for its top speed. A FACTORY CAR picker sits
  at the top of the vehicle tab.
- **How the model compares** (test61): 0-100 RMS 13.9% on the model's own power, 11.6% with power
  matched to the rating; top speed RMS 5.1% over the 14 ungoverned cars. Close: Fiesta −1%, Civic Type R
  −1%, MX-5 −2%, GR Yaris +2%, Corvette C6 −3%. The cars that are far off are mostly the engines already
  off in build 96 (R34, STI, Evo IX, Z06). Two are slow with the right power, each traced: the RS3 holds
  boost only high up (torque peak 5500 rpm against a real 1700), and the Duramax pickup is
  traction-limited for 9.2 of its 10.3 s.
- **Not included:** the rotaries (RX-7, RX-8) wait for the rotary displacement fix; the RD350LC is a
  motorcycle; the Cummins Ram lacks a solid road-test figure. Governed cars run past their governor,
  since the model has no speed limiter.

### Real engines as presets, in categories (build 96)

- **28 presets modelled on real engines**, from published geometry and hardware, each carrying the
  maker's rating (hp and Nm, with rpm) for comparison. Categories: Kei & City, Compact Turbo, NA Sports,
  Turbo Performance, American V8, Exotic, Diesel, Two-Stroke. The 15 original presets are grouped as
  Archetypes. The preset dropdown groups by category as a stopgap until the UI pass.
- **Nothing is tuned to land on a rating; the gap is the content.** Inputs that are not in the maker's
  data are marked `unsure` (mostly boost pressure). Gentlemen's-agreement ratings (JDM 280 PS, kei
  64 PS) are marked with a `note` and left out of the error summary.
- **How the model compares** (test60): RMS 15.8% on power and 14.5% on torque across 25 engines.
  - Close: EA888 +3%, 1KR-FE +1%, Coyote −1%, Hellcat −3%, S54 +2%, EcoBoost −1%, MX-5 −5%.
  - Far off, each traced: the 2-stroke −48% (fitted type factor, no expansion-chamber tuning); the LS7
    −28% and 4A-GE −27%; the EJ257 −26% and Evo IX −17% (boost estimated).
- **A model gap the real engines exposed:** an NA spark engine breathes as well at 1000 rpm as at
  4000. The Coyote, F140 and 4A-GE report peak torque at 1000–1400 rpm. Nothing models the low-speed
  losses a real engine has (charge heating over long residence times, off-tune intakes). Queued.
- **A model fix this needs, not done here:** rotary displacement uses the piston formula (π/4 R² W
  per rotor). The real 13B (R 105, W 80 mm) is 654 cc per rotor by the Wankel formula 3√3·e·R·W.
  The rotary's fitted type factor was calibrated against the understated figure, so real rotaries
  are left out until the geometry is corrected.
- Bore and stroke now go to 110 / 130 mm (a Cummins 6.7 is 107 × 124).
- **The per-preset budget tests now run on the archetypes only** (test40, 44, 46, 47, 54). Their budgets
  and named lists were written for that set. Real engines run the same sanity checks in test60 against
  a named list of today's anomalies, each traced to a model limit: diesel plateaus at the limiter,
  big diesels' boost falling at the top, the low-speed gap above, and the 2-stroke. A new anomaly fails;
  a resolved one is reported.

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

[Unreleased]: https://github.com/ipaliog-a11y/Engine_simulator/compare/v0.7...HEAD
[0.7]: https://github.com/ipaliog-a11y/Engine_simulator/releases/tag/v0.7
[0.6]: https://github.com/ipaliog-a11y/Engine_simulator/releases/tag/v0.6
