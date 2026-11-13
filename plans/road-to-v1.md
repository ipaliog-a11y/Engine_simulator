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
4. Water-to-air and twin intercoolers, per car from published specs.
5. Plenum, throttle and flywheel (2): retires `MAP_K`.
6. Catalytic converter: find what the double count hides, then the part (2).
7. Rotary and two-stroke breathing: ports as geometry, in place of the VE bell and type factors.

*Scoreboard run at the end of B.*

**C. Electric and hybrid audit (2–4 builds).** The same register, applied to the motor, inverter, battery and the
hybrid controllers; each fitted number found gets a part or a cited rule.

**D. Vehicle parts (about 4 builds).** Wings and brake bias (retires `AERO_FRONT/REAR`); wheels and tyre pressure
(retires `UNSPRUNG_SHARE`); the differential (`DIFF_ASYM0`).

*Scoreboard run at the end of D.*

**E. Driving-ready values (about 6–8 builds, the largest new piece).** *Started, build 263: `src/js/drive-model.js` (`driveCar`, `stepCar`), `tests/test168.mjs`; steps 1, 2, 4 and the first half of 3 are in their first form.* No graphics and no game: the numbers only,
behind one function a game can call, `stepCar(dt, steer, throttle, brake, clutch, gear)`. Four wheels. The physics
it needs must load without the page (no DOM, no canvas), so a separate game app can take the same source files.
1. The tyre as one model: force from slip ratio and slip angle together (combined slip), per wheel, with its load.
   The launch's slip curve and the lap's grip limit become two readings of it.
2. The car's motion in the plane: yaw inertia from the car's own mass and dimensions, four wheel loads with
   transient load transfer through the springs, dampers and bars already modelled.
3. The powertrain in time: the engine, turbo, clutch, gearbox and differential stepped from pedal inputs (the LIVE
   bench and the lap's turbo walk already do most of this), the motor and hybrid controllers the same way.
   *Build 274:* the turbo's shaft is stepped, from tables read off the engine (`car.turbo`, `driveShaft`).
4. Brakes, ABS and traction control per wheel, in time.
5. *Tried at build 264, not kept.* A pure-pursuit driver holding the lap solver's speeds lapped the WRX STI 9-11% off
   the solver, and slid the rear-drivers off at the first fast corner, even at 94% of the speeds. Two causes found:
   the circuit has crests and dips that load the tyres and the stepped car's road is flat; and with the lap's
   cornering stiffness (0.2/deg of the load) the brush tyre peaks at 13.7 deg of slip, where a road tyre peaks at 6-8,
   so the car is soft and draggy at the limit. *Build 266:* the cornering stiffness is per compound (a measured road tyre 0.28/deg, a race tyre 0.54; sport
   and semi set between them, in the register as `TYRE_CC`). *Build 267:* it falls with load, by the measured road tyre's
   own curve. *Build 268:* `stepCar` takes the road's grade and vertical
   curvature. *Build 269:* `driveDriver` takes five cars round the line within 4% of the
   solver, no spins, and catches a slide (`tests/test170.mjs`). Left: a lane change, and the 2-4% (the driver follows
   the plan, it does not look for the limit).
   The original aim: the stepped car, driven round the solved racing line by a simple driver, laps within a few percent of
   the lap solver; a skidpad and a lane change give sensible numbers. One headless test.
6. The body's dimensions every preset needs for 3D later (length, width, height, overhangs, wheel and tyre size)
   recorded with their sources.
   *Done, build 272:* `src/js/car-dimensions.js` (`CAR_DIMS`, `carDims`), `tests/test171.mjs`. Open: 83 overhang
   splits and 26 tyre sizes still want the maker's sheet; two cars have no width.

**F. The race's rules (2–4 builds).** Tyre heat, wear and wet grip from the tyre model of E; the tow and dirty air
from the cars' own aero. Overtaking decisions and weather stay rules, signed off in the register.

**G. For both players (2–3 builds).** A guided build for the learner: a few questions (what kind of car, what
budget) give a complete, working car with each choice explained, then every part stays open on its card for the
enthusiast. The guide pages for the new parts.

**H. The v1.0 gate (1–2 builds).** Full-suite run; the scoreboard against the real cars (power, torque, 0–100, top
speed, lap, consumption): every car under 10% on each, or named with its reason (unsourced part, missing physics); guide and README pass. The owner
tags the release.

**After v1.0.** 3D 8-bit cars from the profile images and the recorded dimensions; the driving game on `stepCar`;
the Greek decision; editable spark and VE tables; a career layer.

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
