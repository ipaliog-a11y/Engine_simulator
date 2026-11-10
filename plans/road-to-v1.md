# Plan: the road to v1.0 (draft for the owner)

Written at build 258 (v0.7) from the code, `README.md`'s roadmap, `CHANGELOG.md` and the two existing plans. It is a
proposal: nothing here is decided until the owner says so. Open questions are at the end.

## The vision, as read from the repository

1. **A designer, not a tuner's lookup table.** You design an engine, a car and its parts, and the page works out
   the dyno, the 0–100, the lap and the race from physics. One HTML file, 8-bit look, runs offline from `file://`.
2. **v1.0 = every number derived, not fitted.** A number comes from geometry, a physical law and a sourced input.
   Accuracy is whatever that gives; a miss is named as a known gap, never tuned away.
3. **Parts are real objects.** Each fitted table becomes a part with dimensions (camshaft, chassis, intercooler so
   far), and a factory car is just that part written down from its published spec.
4. **It teaches.** Every model has a guide page (real life → in the game → the physics) and something to look at:
   the cutaway, the compressor map, the lever diagram, the G-G diagram.
5. **Electric and hybrid are powertrain types of the same game** (shipped as v0.7), not a separate one.
6. **Small, cheap, traceable builds.** One change, one build, one PR; short text; few tests.

## Where it stands

- **Done:** the whole original feature plan; the gas-dynamics, friction, knock, brakes, tyre-load, suspension and
  gearbox conversions; electric and all hybrid layouts; 92 real cars; 145 tests.
- **Parts plan** (`plans/parts-design-space.md`): camshaft part (249), chassis (250–253), intercooler (255–256) are
  done. Open: the cam's fitted numbers, cylinder head, turbocharger, wings and brake bias, plenum/flywheel/wheels,
  catalytic converter, rods and pistons.
- **Fitted numbers still in the code** (a quick count, not a full audit): `ampMul`, `loWiden`, `THROAT_RATIO`,
  `TURB_WHEEL`, `TURBO_CONFIG` multipliers, `AERO_FRONT/REAR`, `MAP_K`, `UNSPRUNG_SHARE`, `catRampTop`, `DIFF_ASYM0`,
  `KVCAP`, the rotary and two-stroke VE bell and type factors, and the race's tyre and racecraft constants.

## What stands between here and v1.0

- **There is no finish line written down.** "Every number derived" has no list to tick off, so v1.0 cannot be
  called. The README's roadmap is a 70-row table of finished work; the open work is spread over three files.
- **Accuracy drifts quietly.** Retiring a fitted number honestly costs accuracy (build 256: mean 0–100 error
  7.76 → 8.24%). With per-build checks against real cars paused, nobody sees the running total.
- **Recent builds left tails:** emissions (dyno columns, Zeldovich NOx, cat temperature, g/km), water-to-air
  intercoolers (parked), the cat's double count (parked).
- **Documentation debt grows:** Greek is paused while new text lands every build; `i18n.js` is 608 KB of the 2.5 MB
  page.

## Suggested route

Each line is one build unless it says two (the part, then the retirement, as the parts plan sets).

**A. Draw the finish line (1 build, no physics).**
A register of every fitted number left: name, file, what it stands in for, which part retires it, or "kept as a
rule, owner's decision". A small test checks that the register only shrinks. The README's roadmap is cut to one
screen that points at it; finished rows stay in the CHANGELOG. v1.0 is then "the register is empty or signed off".

**B. Engine parts (about 8 builds).** In this order, because each feeds the next:
1. Camshaft, step 2: retire `ampMul`, `loWiden` and the idle number (moves turbo spool most).
2. Cylinder head and springs (2 builds): valve size, port flow, spring load; retires `THROAT_RATIO` and spring steps.
3. Turbocharger (2 builds): wheels, A/R, wastegate; retires `TURB_WHEEL` and `TURBO_CONFIG` multipliers. This is
   where the largest named gaps live (RS3 and EcoBoost low-rpm torque).
4. Plenum, throttle and flywheel (2 builds): retires `MAP_K`.
5. Catalytic converter: find what the double count hides first; needs the owner before it starts.

**C. Vehicle parts (about 4 builds).** Wings and brake bias (retires `AERO_FRONT/REAR`); wheels and tyre pressure
(retires `UNSPRUNG_SHARE`).

**D. Tails (as the owner picks).** Emissions on the dyno and per km on the WLTP cycle; water-to-air intercoolers;
the ported engines' bell (rotary, two-stroke), if they are in v1.0's scope.

**E. The v1.0 gate (1–2 builds).** One full-suite run and one scoreboard against the real cars (power, 0–100, top
speed, lap), published with the known-gaps list. Guide and README pass. Greek either filled in or formally dropped.
The owner tags the release.

**F. After v1.0 (candidates, not ordered).** Editable spark and VE tables (the parked ECU idea in
`research/similar-projects/`); transient handling (yaw, lift-off oversteer); a derived race tyre; a career or
progression layer on top of the challenges.

**Two suggestions on method, to keep cost and drift down:**
- Keep per-build real-car checks paused, but run the scoreboard once at the end of each phase (B, C, E), so drift is
  seen four times, not never and not every build.
- Stay with one session per PR and two builds per part; batch preset sourcing (as builds 251–253 did) apart from
  physics.

## Questions for the owner

1. **Scope of v1.0.** Combustion engine and car only (as the hybrid plan's decision 4 says), or also the rotary and
   two-stroke bell, the race's tyre and racecraft constants, and the electric side?
2. **The finish line.** Is "every fitted number retired, or listed as a rule you signed off" the right definition?
   Is there an accuracy floor below which v1.0 should not ship?
3. **The pauses.** Should the real-car checks come back only at phase ends, as suggested? Does Greek come back
   before v1.0, after it, or not at all?
4. **Parked work.** Water-to-air intercoolers and the catalytic converter: before v1.0, or after?
5. **After v1.0.** More game (career, progression, tuning maps) or more physics (transient handling)?
6. **Who it is for.** Learners, car enthusiasts, or players? It decides whether the next UI effort goes to the
   guide, to the real-car presets, or to the challenges.
