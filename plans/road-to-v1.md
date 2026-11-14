# Plan: the road to v1.0

Written at build 258 (v0.7) from the code, `README.md`'s roadmap, `CHANGELOG.md` and the two existing plans, then
revised with the owner's answers (see *Owner's decisions*). The order of the phases is still a proposal.

## The vision

1. **A designer, not a tuner's lookup table.** You design an engine, a car and its parts, and the page works out
   the dyno, the 0–100, the lap and the race from physics. One HTML file, 8-bit look, runs offline from `file://`.
2. **v1.0 = every number derived, not fitted**, for every powertrain: piston, rotary, two-stroke, diesel, electric
   and every hybrid layout. A miss is named as a known gap, never tuned away.
3. **A fun, educational game first.** Accuracy is not chased: within 10% of known values is enough.
4. **Parts are real objects.** Each fitted table becomes a part with dimensions, and a factory car is that part
   written down from its published spec.
5. **Two kinds of player.** A learner puts guided values together and has a car that works. An enthusiast tunes
   every part to get the best out of it. The same parts serve both.
6. **v1.0 is the base of a driving game.** It must already simulate every value a playable driving game needs;
   the game itself, and 3D 8-bit cars matching the still profile images, come after v1.0.
7. **Small, cheap, traceable builds.** One change, one build, one PR; short text; few tests.

## Owner's decisions (November 2026)

| # | Question | Decision |
|---|---|---|
| 1 | Scope of v1.0 | **Everything, all drivetrain types.** |
| 2 | Finish line and accuracy | Definition not fixed yet. No chase for high accuracy; if a number is needed, **under 10% against known values**. |
| 3 | Checks against real cars | **Back after each big phase**, not per build. |
| 4 | Greek | **Decided after v1.0.** Text stays wrapped in `tr()`. |
| 5 | Parked work (water-to-air intercoolers, catalytic converter) | **Before v1.0.** |
| 6 | After v1.0 | 3D 8-bit graphics matching the car profiles; a playable driving game; more game and more physics. |
| 7 | Audience | **Learners and car enthusiasts**, both. |
| 8 | What 10% applies to | **Each car.** A car that fails hard is first suspected of wrong parts or tune in its preset, not of wrong physics. |
| 9 | Depth of the driving model | **Four wheels.** |
| 10 | Where the driving game lives | **It may be a separate app.** v1.0 must not constrain it. |

| 11 | How the work runs | **Through the phases without stopping**, except for a major decision. Builds stack on one branch. |
| 12 | Screens | **Phone and desktop alike**; nothing that stops it becoming a mobile app later (touch first, no hover-only controls, layout from the width). |
| 13 | Interface | **Declutter freely.** Fewer on-screen explanations, more pictures: a part is shown, not described. Long text belongs in the guide. |

## Where it stands

- **Done:** the whole original feature plan; the gas-dynamics, friction, knock, brakes, tyre-load, suspension and
  gearbox conversions; electric and all hybrid layouts; 92 real cars; 145 tests.
- **Parts plan** (`plans/parts-design-space.md`): camshaft part (249), chassis (250–253), intercooler (255–256) are
  done. Open: the cam's fitted numbers, cylinder head, turbocharger, wings and brake bias, plenum/flywheel/wheels,
  catalytic converter, rods and pistons.
- **Fitted numbers still in the code** (a quick count, not a full audit): `ampMul`, `loWiden`, `THROAT_RATIO`,
  `TURB_WHEEL`, `TURBO_CONFIG` multipliers, `AERO_FRONT/REAR`, `MAP_K`, `UNSPRUNG_SHARE`, `catRampTop`, `DIFF_ASYM0`,
  `KVCAP`, the rotary and two-stroke VE bell and type factors, and the race's tyre and racecraft constants. The
  electric and hybrid side has not been audited for fitted numbers at all.
- **What a driving game would miss today.** The car is solved as a lap (quasi-steady, on one line), not stepped in
  time from a driver's inputs. There is no yaw, no slip angle that builds, no transient load transfer, no force per
  wheel under combined slip, and the tyre past its limit is a launch-only model. A car cannot slide or spin.

## Route

Each line is one build unless it says two (the part, then the retirement, as the parts plan sets).

**A. Draw the finish line (1 build, no physics). Done, build 259:** `plans/fitted-register.json`, `tests/test166.mjs`.
A register of every fitted number left, across all powertrains and the race: name, file, what it stands in for,
which part retires it, or "kept as a rule, owner's decision". A small test checks it only shrinks. The README's
roadmap is cut to one screen that points at it. v1.0 is then "the register is empty or signed off, and the
scoreboard holds (phase H)".

**B. Combustion engine parts (about 10 builds).**
1. Camshaft, step 2: retire `ampMul`, `loWiden` and the idle number.
2. Cylinder head and springs (2): retires `THROAT_RATIO` and the spring steps.
3. Turbocharger (2): wheels, A/R, wastegate; retires `TURB_WHEEL` and `TURBO_CONFIG` multipliers. The largest named
   gaps live here (RS3 and EcoBoost low-rpm torque).
   *Build 288:* the part (compressor and turbine wheels, housing A/R; `tests/test177.mjs`); no factory car moved. Next:
   each turbo of a twin, sequential or compound layout its own wheel and shaft in place of `TURBO_CONFIG`'s flow
   multiples, and the shaft's inertia from both wheels.
   *Build 290:* a twin or sequential pair is two turbos on their own shafts; the inertia is both wheels'. Open: a
   compound's two stages (2.30), `TURB_WHEEL` per real car.
   *Build 294:* a compound is two stages in series, its low-pressure wheel sized for an equal split of the target
   (`compoundStage`); `TURBO_CONFIG` retired. Open: `TURB_WHEEL` per real car; the split held off-design.
4. Water-to-air and twin intercoolers, per car from published specs.
5. Plenum, throttle and flywheel (2): retires `MAP_K`.
6. Catalytic converter: find what the double count hides, then the part (2).
7. Rotary and two-stroke breathing: ports as geometry, in place of the VE bell and type factors.

*Scoreboard run at the end of B.*

**C. Electric and hybrid audit (2–4 builds).** The same register, applied to the motor, inverter, battery and the
hybrid controllers; each fitted number found gets a part or a cited rule.
*Build 284:* `electric.js` read: 15 entries (phase C in the register), 10 files left. In the order they would retire:
1. The magnets as geometry and the d and q inductances (2): retires `FLUX_KM`, `V_DROP`, `CPSR` and the 0.7 field-weakening
   current together, and gives an interior-magnet rotor its reluctance torque.
2. The stator's teeth and yoke from the flux, with the steel's B-H curve: `SPLIT`, `SLOT_SHARE`, `SAT_K`, the iron's 80/20.
3. Heat paths from correlations: `MOTOR_COOLING`, the friction and windage coefficients, the pack's `PACK_C` and plate.
4. The cell as a part, from named datasheets: `CHEM`, `PACK_FACTOR`, the 10% for busbars.
5. Cited or signed off, no new physics: `INVERTER` (named modules), `RETENTION`, `ACTIVE_TO_MOTOR`, `EV_BMS`, the cage's
   leakage.
*Build 292 (owner's choice: steps 1 and 2 together):* the magnets are bars in a V and their flux comes from a magnetic
circuit through M270-35A's curve; `FLUX_KM` retired, the Model 3's back-EMF lands at 41.8 V/krpm against 42. *Build 293:* the
teeth and yoke sized from that flux at the top of Pyrhonen's Table 6.1 (tooth 2.0 T, yoke 1.5 T); the slot is what is left.
Left in `MOTOR.statorShape`: the outside diameter (bore over 0.67), which Table 6.2's current densities would set. Next:
`SAT_K` from the same curve under load, the iron loss on each part's own density (`MOTOR.ironShare`), then the d and q
inductances (`MOTOR.fieldWeakening`).

Beyond the register (not started, the owner's choice): a fast-charge curve from the charge-voltage and plating limits
the pack already has; the pack's temperature in the lap, cycle and race (they still read the 25 °C resistance); a
cell's sag and recovery (one RC pair), which is the 1 s against 10 s power the Prius cells were re-rated for; ageing;
an inverter junction temperature; wound-rotor, reluctance and axial-flux motors. Readouts the model already computes
and the bench could show: the loss split (copper, iron, friction, inverter), the pack's current as a C-rate, its sag
and its heat, an induction motor's slip.

**D. Vehicle parts (about 4 builds).** Wings and brake bias (retires `AERO_FRONT/REAR`); wheels and tyre pressure
(retires `UNSPRUNG_SHARE`); the differential (`DIFF_ASYM0`).
*Build 291:* the rear wing as a part (span, chord, angle, camber, end plates; lifting line; `tests/test178.mjs`); no
factory car moved. Next: the front wing and splitter the same way, then each kit car's wing written as one, and brake bias.

*Scoreboard run at the end of D.*

**E. Driving-ready values (about 6–8 builds, the largest new piece).** *Done in its first form, builds 263-277: `src/js/drive-model.js` (`driveCar`, `stepCar`, `driveDriver`), `tests/test168.mjs`, `170`-`173`. What it leaves open is listed in the CHANGELOG under build 277.* No graphics and no game: the numbers only,
behind one function a game can call, `stepCar(dt, steer, throttle, brake, clutch, gear)`. Four wheels. The physics
it needs must load without the page (no DOM, no canvas), so a separate game app can take the same source files.
1. The tyre as one model: force from slip ratio and slip angle together (combined slip), per wheel, with its load.
   The launch's slip curve and the lap's grip limit become two readings of it.
2. The car's motion in the plane: yaw inertia from the car's own mass and dimensions, four wheel loads with
   transient load transfer through the springs, dampers and bars already modelled.
3. The powertrain in time: the engine, turbo, clutch, gearbox and differential stepped from pedal inputs (the LIVE
   bench and the lap's turbo walk already do most of this), the motor and hybrid controllers the same way.
   *Build 274:* the turbo's shaft is stepped, from tables read off the engine (`car.turbo`, `driveShaft`).
   *Build 275:* the pack's charge is a state and a hybrid's controller runs in time (`car.el`, `driveCharge`,
   `tests/test172.mjs`). Open: a power-split's engine speed, heat.
   *Build 289:* a P2's engine stops and starts, by the LIVE bench's AUTO rule (`driveStartStop`).
   *Build 276:* all-wheel drive's axles turn together, and the launch is the solver's (`driveLaunch`): 0-100 within
   6% on the test's five cars.
   *Build 279:* a plug-in sets off full, the help is cut to the pack's own power at its charge, the front motor's
   losses are its own, and the gearbox's axle is remembered beside a front motor.
4. Brakes, ABS and traction control per wheel, in time.
   *Build 281:* ABS, traction control and stability control are a tune the car carries (`car.aids`, `DRIVE_AIDS`,
   `tests/test174.mjs`). *Build 282:* the card, ECU: DRIVER AIDS on the VEHICLE tab, with the sine with dwell, a stop and a
   standing start as its readout (`tests/test175.mjs`). Open: the lap and the 0-100 do not read the aids.
5. *Tried at build 264, not kept.* A pure-pursuit driver holding the lap solver's speeds lapped the WRX STI 9-11% off
   the solver, and slid the rear-drivers off at the first fast corner, even at 94% of the speeds. Two causes found:
   the circuit has crests and dips that load the tyres and the stepped car's road is flat; and with the lap's
   cornering stiffness (0.2/deg of the load) the brush tyre peaks at 13.7 deg of slip, where a road tyre peaks at 6-8,
   so the car is soft and draggy at the limit. *Build 266:* the cornering stiffness is per compound (a measured road tyre 0.28/deg, a race tyre 0.54; sport
   and semi set between them, in the register as `TYRE_CC`). *Build 267:* it falls with load, by the measured road tyre's
   own curve. *Build 268:* `stepCar` takes the road's grade and vertical
   curvature. *Build 269:* `driveDriver` takes five cars round the line within 4% of the
   solver, no spins, and catches a slide (`tests/test170.mjs`). *Build 277:* an ISO 3888-2 lane change at 63-75 km/h
   (`tests/test173.mjs`). Left: the 2-4% (the driver follows the plan, it does not look for the limit).
   The original aim: the stepped car, driven round the solved racing line by a simple driver, laps within a few percent of
   the lap solver; a skidpad and a lane change give sensible numbers. One headless test.
6. The body's dimensions every preset needs for 3D later (length, width, height, overhangs, wheel and tyre size)
   recorded with their sources.
   *Done, build 272:* `src/js/car-dimensions.js` (`CAR_DIMS`, `carDims`), `tests/test171.mjs`. Open: 83 overhang
   splits and 26 tyre sizes still want the maker's sheet; two cars have no width.

**F. The race's rules (2–4 builds).** Tyre heat, wear and wet grip from the tyre model of E; the tow and dirty air
from the cars' own aero. Overtaking decisions and weather stay rules, signed off in the register.
*Planned at build 290.* Today the race steps each tyre's tread temperature and wear with its own constants
(`TYRE_RACE` in `race.js`; `tOpt`, `tWin`, `wear`, `wetKeep` in `TIRE_TYPE`) and the tow and dirty air as speed
multipliers (`RACE.slip*`, `RACE.dirty`). Three builds (2-4), each moving only the race (the lap, 0-100 and dyno must keep an
identical fingerprint):
1. **The tread's heat: a rule until after v1.0** (owner's decision, November 2026). Tried at build 295, not kept:
   the slip work from `driveTyre` with convection, conduction and the tread's own heat capacity took the Civic's
   hottest tyre in `test71` from 92 C to 329 C and wore a set out in 4 laps. The slip work is right (it matches the
   cornering drag); what cannot be derived is where its heat goes. Rubber's grip is mostly hysteresis in a thin
   surface layer, and how much of that the road takes back depends on the share of the patch truly in contact,
   which no handbook gives. One lump cannot hold it: it needs a surface and a bulk, and that share. `TYRE_RACE`'s
   heat constants (`slip`, `roll`, `H0`, `H1`, `hTrack`, `cp`) go into the register as a rule, signed off.
2. **Grip and wear from the rubber: with the heat, after v1.0** (owner's decision, November 2026). Both read the
   tread's temperature, which is now a rule, and their inputs are not published: a compound's Tg (racing at -10 to
   -15 C and road at -40 C for Persson; a measured pair the other way, -26 and -22) and an abrasion rate per joule.
3. **Wet grip.** The water film's depth from the rain rate and the road's texture and drainage (Gallaway 1979, in mm,
   in place of `RACE.wetFull`), the tread's grooves clearing it, and grip falling towards the hydroplaning speed
   (Horne and Dreher, NASA TN D-2056, from the tyre's pressure) (retires `wetKeep`, `hWet`). The tyre's pressure is a
   phase D part not built yet: until then each compound carries its maker's usual pressure, cited, and D's part
   replaces it. The rain's arrival and amount stay a weather rule.
4. **The wake and the pit lane.** *Build 295: the wake (`RACE_WAKE`, `raceWake`, `tests/test79.mjs`). Next: the pit lane.* Behind a car, its follower's drag and downforce fall with the gap in car lengths, from
   measured data (Zabat et al. 1995, PATH platoon tests; for downforce, published wind-tunnel and CFD wake figures).
   The speed then comes from the car's own balance: on a straight its power against its reduced drag, in a corner its
   grip at its reduced downforce. A road car barely feels dirty air and a winged car does (retires `slipGap`,
   `slipDrag`, `slipK`, `dirty`). The pit loss from the lane's length and limit, with the slowing and the pull away
   (retires `pitLoss`; each circuit gets a pit-lane length, cited for a real one, from its main straight for a
   drawn one). The racecraft numbers (`follow`, `close`, `defend*`, `dive*`, `passKmh`, `pace`, `mistake`), the crew's
   `tyreChange` and `refuelLps`, and the drivers go into the register as rules.
Checks: `tests/test71.mjs` and `79` cover the race; each build adds one test that its numbers come from the parts
(a slick's window sits above a road tyre's, a winged car loses more behind another).
No real-car check per build (decision 3); the race is checked at H.

**G. For both players (2–3 builds).** A guided build for the learner: a few questions (what kind of car, what
budget) give a complete, working car with each choice explained, then every part stays open on its card for the
enthusiast. The guide pages for the new parts.
Editable spark and VE tables (owner's decision, November 2026): an rpm × load grid for ignition advance and one for
volumetric efficiency on the ECU card, beside the fuel map that is already editable. Each opens filled with what the
model derives (the MBT-tracking, knock-limited timing; the VE from the cam, ports, runners and plenum), so an untouched
table changes no number. RESET returns the derived table.
- Spark: an edited cell is the advance the engine runs, and the physics answers it (too little loses torque, past the
  knock limit it knocks).
- VE, as in a real ECU (owner's choice): the table is the ECU's *estimate* of VE, used only to meter fuel. The engine's
  real VE stays derived from its parts and is never edited. A wrong cell gives a lean or rich mixture, with the power,
  exhaust temperature and knock that follow. No fitted number enters. Decide with it how the table and the existing
  fuel map relate (one built from the other, or merged).

**H. The v1.0 gate (1–2 builds).** Full-suite run; the scoreboard against the real cars (power, torque, 0–100, top
speed, lap, consumption): every car under 10% on each, or named with its reason (unsourced part, missing physics); guide and README pass.
A check for irrational builds: sweep the inputs a player can set (bore, stroke, rpm limit, boost, compression,
spark cells, cam, gearing, tyre, mass, motor and pack sizes) to find the values and combinations that give
absurd results (power with no air to make it, a piston speed or BMEP no material holds, a pack that cannot supply its
motor). For each, decide whether to restrict it: a fixed limit, or a dynamic one that follows from the rest of the
build (the rpm limit from piston speed and the valve springs, boost from the compressor map and knock). Each limit cited, as the physics rules ask; a limit the physics already enforces
(knock, a failure, a lean mixture) stays a consequence, not a lock. The owner tags the release.

**After v1.0.** The tyre's heat as a surface and a bulk (phase F, build 1); 3D 8-bit cars from the profile images and the recorded dimensions; the driving game on `stepCar`;
the Greek decision; a career layer.
An electric drivetrain with four motors, one in each wheel hub: each wheel's torque its own, the unsprung mass the
hub motors add, and torque vectoring explored (yaw moment from the left-right split, in place of braking a wheel),
on the four-wheel `stepCar`.

## Method

- Real-car checks stay off per build and run at the ends of B, D and H.
- One session per PR; two builds per part; preset sourcing batched apart from physics (as builds 251–253 did).
- **A car past 10% gets a preset review before anything else**: its parts and tune against the maker's published
  spec (cam, turbo wheel, intercooler, gearing, tyres, ECU limits), each correction cited. A value with no source
  stays on the preset's `unsure` list. Only if the sourced car still misses is the physics suspected; if several
  cars miss the same way, it is one missing piece of physics. A preset is never changed just to pass.

## Still open

1. **The finish line's exact wording** (owner undecided). Proposed: register empty or signed off, every car under
   10% or on the named list with its reason.
