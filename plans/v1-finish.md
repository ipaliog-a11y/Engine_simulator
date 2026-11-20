# Plan: from build 405 to the v1.0 gate

Written at build 407 for the groups of *Leftovers to v1.0* in `plans/road-to-v1.md` that are still open: 1 (engine),
2 (vehicle parts), 7 (data), 8 (known gaps) and 10 (the gate). Groups 4–6 were done in `plans/small-physics.md`
(builds 364–405). Group 9 (game) ends with the guided build's three builds (G8–G10), already running.

**Group 3 (driving sim H′ and I) moves after v1.0** (owner, build 407; reverses decision 23). Tyre heat, pressure and
wear in `stepCar`, brake fade in time, aero by ride height and pitch, and the wake per axle wait with phase J. Group 2
below therefore ships its aero parts as static (steady-state) numbers only.

One line is one build unless it says otherwise. About 20 builds. Each build follows `AGENTS.md`; any build that moves
recorded numbers reports its range and the mean error against the real cars.

## Order and what can run side by side

- Group 1 (engine: `gas-dynamics.js`, engine presets) and group 2 (vehicle: aero, tyres, springs) touch different
  files and run side by side. Inside each group, builds are serial.
- Group 7 is sourcing only and runs whenever a slot is free.
- Group 8 comes after 1 and 2, because their builds move the numbers the known gaps are judged on.
- Group 10 is last.

## Group 1: engine (register `EV_RATIO`, `catRampTop`; decisions 16, 22)

1. **Valves, batch 1 of 4** (`EV_RATIO`). Each engine's intake and exhaust valve diameters from the maker, a workshop
   manual or a parts catalogue (10 of 93 sourced today). About 20 engines per build, the most-used first. Each build
   reports peak power and torque moves per engine. An engine with no source stays on the ratio and is listed.
2. **Valves, batch 2 of 4.**
3. **Valves, batch 3 of 4.**
4. **Valves, batch 4 of 4.** The register entry closes when every engine is sourced or named.
5. **The four V8s over 10%** (LS7, LS3, LT4, Coyote; decision 16): chase the cam timing and the intake, not the valves.
   Published cam cards (GM, Ford Performance) and intake runner lengths. Report each against its published power.
6. **Water-to-air intercoolers, the model** (decision 22; register B4). The charge-air cooler as a coolant loop: the
   core's effectiveness from its NTU (Kays & London), the pump's flow, the front low-temperature radiator, and the
   loop's heat soak in time on a lap. Effectiveness and pressure drop beside the air-to-air part (builds 255–256).
7. **Water-to-air intercoolers, per car.** Each preset whose maker publishes a water-to-air charge cooler moves to the
   new part (the build lists which, with sources). Report each car's power and lap moves.
8. **`catRampTop`: a research build.** A measured back pressure for a catalyst brick and a silencer together (SAE
   papers, catalyst makers' flow data). If a source is found, the cat and silencer are derived and the entry closes;
   if not, the build says so and the owner rules (see questions).

## Group 2: vehicle parts (register `AERO_FRONT/REAR`, `AERO_FLOOR`, `TYRE_KZ`, `SPRING_STEP/BAR_STEP/DAMPER_STEP`)

9. **A wing as a part** (`AERO_FRONT/REAR`). Each kit car's wing from its span, chord, profile and angle (thin-aerofoil
   lift slope with the finite-span correction; Katz, *Race Car Aerodynamics*). Steady-state only (group 3 is after
   v1.0).
   *Build 415:* the kit wing is a wing part (`kitWing`); the STO, the Radical and the proto class carry rear wings
   (PROBABLE, angles unsourced). Known gaps (owner, `test116` `AERO_KNOWN`): Radical 1.93 g against 2 g, and STO
   ~361 kg against 420 kg. Open: the splitter and lip rows, and the Radical's `body.aero` (now the diffuser's alone),
   both for build 10.
10. **A splitter and the floor** (`AERO_FLOOR`). The splitter's lift from its area and height; the floor's downforce
    from its length, diffuser angle and ride height at the static height (Zhang, Toet & Zerihan, ground-effect
    measurements). Ride height in motion stays after v1.0.
11. **Tyre pressure into grip, rated load and stiffness** (`TYRE_KZ`). Vertical stiffness from pressure and size
    (Rhyne; Pacejka, *Tyre and Vehicle Dynamics*), rated load from the ETRTO load index, grip's load sensitivity at
    the set pressure.
    *Build 417:* Rhyne's stiffness (via Chalmers 2014:24; footprint 0.7 PROBABLE) replaces `TYRE_KZ`. The ETRTO
    capacity is (p + 44.5)/(250 + 44.5) of the load index, fitted to the standard-load table. Each axle's `FzRef`
    follows it from 230 kPa. Laps moved −0.21% to +0.10%; 0–100, 100–0 and skid-pad did not move. Open: the
    friction's own pressure term (tyre-dependent, Schmeitz et al. 2005), cornering stiffness against pressure, and
    XL tyres.
12. **Spring, bar and damper rates from their parts** (`SPRING_STEP/BAR_STEP/DAMPER_STEP`). A coil spring's rate from
    wire diameter, coil diameter and active coils; a bar's from its diameter, arms and length; a damper's from its
    valve (the damper part's ratio, build 364). Presets keep their published rates where they exist.

## Group 7: data (sourcing only)

13. **83 overhang splits** (front/rear overhang from the maker's dimension drawing), in one or two builds.
    *Build 416:* five splits from a same-body auto-data.net page (M3 E46, Golf TDI Mk7, 330d, 911 RS 2.7, 330e).
    Open: 78 cars. auto-data.net (whole generations swept) and conceptcarz have no overhangs for them; the second
    build needs the makers' own drawings (press kits, workshop manuals), one car at a time.
14. **26 tyre sizes and the two missing widths** (`NO_WIDTH_KNOWN` closes).
15. **Each real circuit's pit-lane length** (FIA circuit sheets, the circuits' own data).

## Group 8: known gaps to rule on or close (after groups 1 and 2)

16. **One review build.** For each of `ACC_KNOWN` (Supra A80, WRX STI), `RATING_KNOWN` (Dino 246), `GAP_KNOWN` (Model
    3 torque, Leaf), `AT_LIMITER_KNOWN` and the moose run (~10 km/h under the magazines): rerun on the latest `main`,
    find the cause, and propose close, fix or rule. The owner rules on each; fixes follow as their own builds.

## Group 10: the gate

17. **The full suite green** on `main` (~80 min, locally), every failure fixed or explained.
18. **The real-car scoreboard** (decision 18): every preset against its published power, torque, 0–100, top speed,
    mass and lap time, with the mean error and the cars over 10%.
19. **The sweep for absurd builds**: random and extreme designs through every simulator, nothing NaN, negative or
    impossible.
20. **The guide and README pass**: every page matches what the code does at that build.

Then the owner checks the finish line and tags v1.0.

## Owner's answers (build 413)

- The plan's builds run autonomously: a new session per build, merged when green, stopping for the owner when numbers
  move beyond the plan.
- `test56`: the 13B's 90% boost at 3175 rpm (real ~3000; since build 290) stays a named gap until after v1.0
  (`SPOOL_KNOWN` in the test). Group 8's review build lists it.
- A build that lets the scope's signals be chosen and plots the simulated lambda sensor runs alongside.

## Open questions for the owner

1. **The finish line's wording** (open since build 363). Proposed: register empty or signed off, every car under 10%
   or on the named list with its reason.
2. **`catRampTop`** (build 8): if no measured back pressure is found, does it stay a rule until after v1.0?
3. **Valves** (builds 1–4): may an engine with no source stay on the ratio, named, at v1.0?
4. **Group 2's aero**: with group 3 after v1.0, is a static floor and splitter enough for v1.0?
