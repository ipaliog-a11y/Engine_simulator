# Plan: from build 405 to the v1.0 gate

> **Superseded at build 474 by [plans/v1-scope.md](v1-scope.md)**, which recalibrates what is left for v1.0.

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
   *Build 419:* 17 engines sourced (27 of 93 now), all shipped on the owner's ruling (a sourced valve is used whichever
   way it moves). Peak hp −18.2% (Rover K) to +3.7%; mean hp error of the 17: 8.2% → 7.1%, torque 7.9% → 8.0%. Left on the
   ratio, no usable source or sources disagree: Toyota FA24D, 4A-GE, G16E; Mazda Skyactiv-G 2.0, B6-ZE; BMW S55; Porsche 911/83.
   Known gaps added (owner): test60 Hellcat 'limiter'; test76 Golf GTI Mk7 at 711 °C at Spa.
2. **Valves, batch 2 of 4.**
   *Build 425:* 16 engines sourced (43 of 93 now), all shipped. Peak hp −7.9% (B48 in the 330e) to +4.0% (BAC Mono's
   Duratec); mean hp error of the 16: 5.8% → 4.8%, torque 7.9% → 7.9%. Left on the ratio, no usable source found or sources
   disagree: Toyota 1GD-FTV, 1KR-FE; Ford 1.0 EcoBoost, Cosworth YB; Jaguar XK 3.8; VW EA827 1.6, EA288; BMW N57;
   Alfa 690T; McLaren M840T; Porsche 4.0 GT3; Renault M5Pt; Suzuki K14C; Hyundai Kappa 1.6. GM LS3, LT4 and Ford Coyote
   stay held back for item 5. Owner's rulings: test60 `KNOWN` gains the RS3's 2.5 TFSI and the BAC Mono's Duratec ('limiter');
   test93's governor-off check moves from the Cummins to the EA288, which is still on the ratio.
3. **Valves, batch 3 of 4.**
   *Build 428:* 3 engines sourced (49 of 93 now), all shipped: Honda S07A (Honda), the Radical RPE 1500 (Hayabusa stock-size
   valves, `unsure`) and the F355's F129B (Supertech stock-size, `unsure`; a forum post swaps intake and exhaust). Peak hp
   S07A 68 → 68, RPE 203 → 207, F129B 385 → 386; mean hp error of the 3: 4.1% → 3.5%, torque 4.3% → 4.1%. Left on the
   ratio, no usable source found or sources disagree: Suzuki K6A, F6A; Fiat TwinAir; Honda E07A; Nissan KR15DDT; VW 3.0 V6
   TDI (EA897 sources give 27.5 and 28.7 mm intakes); Audi 2.1 20V; Lamborghini 3.9 (LP400), 5.7 (Diablo), 6.5 (Murciélago),
   4.0 TT (Urus: one unopened paper gives the EA824's 33.85 / 28 mm); BMW S70/2; Ferrari Dino 135, F120A, Colombo 4.4,
   F140B, F140; Porsche 5.7 V10, 3.7 TT (992), 4.8 TT (958), 4.0 (GT4), 4.6 V8 (918).
4. **Valves, batch 4 of 4.** The register entry closes when every engine is sourced or named.
5. **The four V8s over 10%** (LS7, LS3, LT4, Coyote; decision 16): chase the cam timing and the intake, not the valves.
   Published cam cards (GM, Ford Performance) and intake runner lengths. Report each against its published power.
   *Build 427:* LS3 and LS7 on GM's cam cards (0.050" duration on the model's sin² lift law); LS3, Coyote and LT4 on
   their real valves; the LT4 a two-valve head. Peak hp LS3 +7.9 → +22.1%, LS7 +15.6 → +17.0%, Coyote −1.7 → +3.7%,
   LT4 −6.6 → −7.4% (mean 8.0 → 12.6%); torque mean 7.3 → 6.1%. Owner's ruling: test60 `KNOWN` gains the LS3 and Coyote
   ('limiter'). Open: the model's missing top-end fade (LS3 and LS7 stay over 10%; item 5b). No full cam card for
   the Coyote or LT4 (no separation found), no stock runner length or plenum volume for any of the four, and all four keep an unsourced `exhaust:'sport'`.
5b. **Top-end fade** (owner, build 427): the model's power keeps rising to the limiter on six engines (Hellcat, LS7, RS3
   2.5 TFSI, BAC Mono Duratec, LS3, Coyote; test60 KNOWN 'limiter'). Derive the high-rpm loss from physics (friction
   mean effective pressure against piston speed, e.g. Chen–Flynn / Patton–Nitschke–Heywood; valve-train and breathing
   limits: port Mach index, valve float), no fitting. Report every engine's peak-power move; the KNOWN 'limiter'
   entries should shrink.
6. **Water-to-air intercoolers, the model** (decision 22; register B4). The charge-air cooler as a coolant loop: the
   core's effectiveness from its NTU (Kays & London), the pump's flow, the front low-temperature radiator, and the
   loop's heat soak in time on a lap. Effectiveness and pressure drop beside the air-to-air part (builds 255–256).
   *Build 429:* the model, as a type of the intercooler part (PARTS). Core and radiator ε from NTU, settled loop
   (a/Cc)/(1 + a/b − a/Cw), dyno on the cold loop, the lap walks the loop in time. No preset moved (fingerprint identical).
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
    **Moved after v1.0** (owner, build 417): the ground-effect measurements could not be reached (every copy returned
    403) and no preset's floor or splitter geometry is sourced, so a model would have to pick geometry. `AERO_FLOOR`,
    the splitter row and the Radical SR3's fitted `body.aero` 1.09 (now its diffuser only) stay named gaps at v1.0,
    and come back with group 3's ride height in motion.
11. **Tyre pressure into grip, rated load and stiffness** (`TYRE_KZ`). Vertical stiffness from pressure and size
    (Rhyne; Pacejka, *Tyre and Vehicle Dynamics*), rated load from the ETRTO load index, grip's load sensitivity at
    the set pressure.
    *Build 418:* Rhyne's stiffness (via Chalmers 2014:24; footprint 0.7 PROBABLE) replaces `TYRE_KZ`. The ETRTO
    capacity is (p + 44.5)/(250 + 44.5) of the load index, fitted to the standard-load table. Each axle's `FzRef`
    follows it from 230 kPa. Laps moved −0.21% to +0.10%; 0–100, 100–0 and skid-pad did not move. Open: the
    friction's own pressure term (tyre-dependent, Schmeitz et al. 2005), cornering stiffness against pressure, and
    XL tyres.
12. **Spring, bar and damper rates from their parts** (`SPRING_STEP/BAR_STEP/DAMPER_STEP`). A coil spring's rate from
    wire diameter, coil diameter and active coils; a bar's from its diameter, arms and length; a damper's from its
    valve (the damper part's ratio, build 364). Presets keep their published rates where they exist.
    *Build 420:* a SPRINGS, BARS & DAMPERS part replaces the six SOFT/STIFF steps: coil k = G d⁴/(8 D³ n), bar
    (GJ/L)(MR t/a)², the damper's bound slope and rebound ratio, each at the wheel by MR². No preset carries a published
    rate or the part, so unfitted cars keep the kit's and nothing moves (fingerprint identical). Open: hollow bars, arm
    bending and bushes, progressive springs, the damper's valve (shims, blow-off).

## Group 7: data (sourcing only)

13. **83 overhang splits** (front/rear overhang from the maker's dimension drawing), in one or two builds.
    *Build 416:* five splits from a same-body auto-data.net page (M3 E46, Golf TDI Mk7, 330d, 911 RS 2.7, 330e).
    *Build 423:* five from the makers' own sheets (Aygo, Land Cruiser 200, GR86, Ioniq Hybrid, Prius), after ~1.5 h
    of searching. Open: 73 cars. Most makers' press data (VW, Porsche, Ferrari, Lamborghini, Honda, Mazda, Suzuki,
    Ford, GM, Stellantis, Nissan) gives length and wheelbase but no overhangs; BMW Canada's product guides give them
    for the X5 M and M2, but on North-American bodies 14-15 mm longer, so they were not used.
14. **26 tyre sizes and the two missing widths** (`NO_WIDTH_KNOWN` closes).
    *Build 422:* 20 sizes sourced (6 from the maker, 14 probable), both widths (probable); six presets' fits follow,
    and the Beat's top speed is a named gap (157→165 km/h, real 140). Open: Aygo, Golf TDI Mk7, Land Cruiser 200, Golf
    GTI Mk1, Amarok (unsourced), E-Type and Mustang 1965 (cross-ply sizes), Radical (slicks).
15. **Each real circuit's pit-lane length** (FIA circuit sheets, the circuits' own data).
    *Build 424:* 20 of the 32 real circuits get a sourced lane (pit-in to pit-out), mostly from SRO and WEC briefings
    and TSL timing maps; 13 are unsure. Spa takes F1's 653 m (owner's ruling; SRO's endurance lane is 994 m). Bahrain
    426 -> 441 m. Open: shanghai, mexico, interlagos, yasmarina, hockenheim, spielberg, sochi, moscow, oschersleben,
    norisring, vir, road_atlanta (no source; FIA event notes give no length), and seven SRO/WEC values read only as
    quoted by a search index.

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
- Sourcing builds ship the sourced values with their gaps named, whichever way they move the numbers. They stop for
  the owner only if a test needs a known-gap list widened or a limit loosened (build 422).
- A build that lets the scope's signals be chosen and plots the simulated lambda sensor runs alongside.

## Open questions for the owner

1. **The finish line's wording** (open since build 363). Proposed: register empty or signed off, every car under 10%
   or on the named list with its reason.
2. **`catRampTop`** (build 8): if no measured back pressure is found, does it stay a rule until after v1.0?
3. **Valves** (builds 1–4): may an engine with no source stay on the ratio, named, at v1.0?
4. ~~**Group 2's aero**: with group 3 after v1.0, is a static floor and splitter enough for v1.0?~~ Answered (build
   417): no; the floor and splitter wait for group 3 and stay named gaps at v1.0 (build 10 above).
