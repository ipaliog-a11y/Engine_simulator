# Plan: the smaller physics leftovers before v1.0

Written at build 363 from the "Left open" notes in `CHANGELOG.md` (group 4–6 of *Leftovers to v1.0* in
`plans/road-to-v1.md`). One line is one build unless it says otherwise. About 16 builds.

**Order rule:** builds that change only `stepCar` come first, because the fingerprint doesn't record it, so nothing
can move. Builds that move recorded numbers (the 100–0 stop, the EV lap, the exhaust temperature) come later, each
reporting its range. Sourcing is batched apart from physics.

## 0. A green baseline (1–2 builds)

- `test136`: the Model 3's locked motor figures moved (peak 426 against 424 Nm, continuous 282 against 259 kW, hold
  29 against 37 s), most likely in build 315's jacket cooling. Find the build, then either explain and re-lock in the
  open, or fix it.
- `test145` (engine wear and coolant at full load; ~6 min) was reported failing on `main` at build ~320. Rerun it, then
  treat it the same way.
  *Build 365:* test136 re-locked to builds 314 (stator 225 mm), 315 (jacket cooling) and 354 (tyres), all intended;
  test145 passes on `main` (fixed by builds 336-337). Nothing left open here.
- Not physics, noted only: `test42` (3 untranslated starter messages, Greek paused), `test64` (the track map never
  draws the car sprite), `test125` (folded LIVE OUTPUT at 21%, not a third).

## 1. Suspension in time (`stepCar` only; fingerprint identical)

1. **Bump stops and droop.** Travel by suspension type (Reimpell), a progressive bump rubber past it, and the wheel
   hanging free at full droop. Bound and rebound damping apart, from the damper part's ratio (typical about 1:3,
   PROBABLE; Dixon, *The Shock Absorber Handbook*).
   *Build 364:* done (travel by `SUSP_GEO` type, rubber 25 mm, rebound 3× bound about the kit's mean; `test220`).
   Left open: travel by the kit, the damper's blow-off.
2. **Anti-dive and anti-squat.** The pitch share carried by the links, from the side-view swing arm by suspension
   type (Milliken RCVD ch. 17; Reimpell). Today all pitch goes through the springs (~2° at 0.5 g). Jacking with it.
   *Build 369:* done (`SUSP_GEO` `svF`/`svR` by type, PROBABLE; drive through half-shafts and inboard brakes on the
   wheel centre; jacking; `test223`: M3 anti-dive 27 %, MX-5 23 %). Left open: the arm's change with travel, inboard
   brakes on presets, arms by the kit.
3. **Camber and toe by heave and pitch**, from the same type curves the roll already uses. Also the weight's own roll
   moment as the body leans. Both the ESP's understeer reference and its roll-steer share then read the full roll.
   *Build 374:* done (camber 1/fvsa and toe rs/(t/2) by each wheel's travel, none on solid or twist axles; ESP's roll
   steer by the full roll with the tyres' give; `test228`). Left open (owner): the weight's roll moment m g h sin φ
   (+9–10 % roll, pushed `test170` past its caps), to land with the lap's `rollGrad`; curves' change with travel.

## 2. Steering and stability control (`stepCar` only)

4. **Power assistance and steering friction.** An EPS boost curve on the column load `s.steerTorque` already gives
   (PROBABLE, marked), plus the scrub radius's drive-force moment. Torque steer stays out: no preset gives shaft angles.
   *Build 376:* done (`s.handTorque`: boost curve, Coulomb friction with a dead band, 10 mm scrub radius, all
   PROBABLE; `test229`). Left open: scrub radius by suspension type, a curve per car, torque steer.
5. **ESP judges a spin by yaw rate**, with a lagged reference (van Zanten, Bosch, SAE 2000-01-1633), in place of
   the rear slip angle. The previous try (yaw alone, no lag) braked the MX-5 on 30% of a hot lap. Its limit reads the
   surface (needs 7).
6. **Grip by camber** (`latCamberF` in the stepped car). Blocked on a driver who judges the car's own grip
   (`DRIVE_DRIVER` is a rule). Try after 5. If `test170` still strays past `OFF_KNOWN`, it stays named.

## 3. Surfaces

7. **Off the track.** Rolling resistance on grass and gravel (Wong, *Theory of Ground Vehicles*, ch. 2: Bekker's
   sinkage), a gravel trap where a circuit draws one, and a painted kerb's grip and ribs. The ESP's limit reads the
   surface.
8. **A rain tyre's own wet grip.** The compound's wet advantage from the EU label's wet grip index (Regulation
   2020/740, ISO 23671), class by class against a road tyre's. Today only its grooves help.
   *Build 367:* `RACE_WET_G` (race.js): a road tyre is class B's middle (G 1.47), a rain compound (inter, full wet)
   class A's floor (1.55), both PROBABLE; its low-speed wet grip is 0.71 x 1.55/1.47 = 0.749. Open: road compounds
   by their own class (eco, sport, semi), and a race rain tyre measured above class A.

## 4. Brakes (moves the 100–0)

9. **The 100–0 stop reads the brake share per axle** (build 312's part), not the four tyres' pooled grip, with the
   road car's proportioning (knee-point) valve. Report each car's 100–0 change.

## 5. Electric and hybrid

10. **The lap's torque curve and the race's pace-grid price read the pack's own temperature**, not 25 °C (build
    346's follow-up). Moves EV and hybrid laps; report.
    *Build 373:* the lap scales the drive by the pack's power at its walked temperature over 25 °C (`evPackGain`, up to
    +1.4% on a Model Y at 45 °C); the race prices the cells' heat at the pack's temperature and charge each step. Tesla
    laps move ≤0.003%. Left open: the hybrid lap and race walk no pack temperature, so they do not move; the race's
    pace grid (speeds) and the motor bench stay at 25 °C.
11. **A hybrid's engine start and stop, stepped.** The ~1 kJ to crank comes from the pack and comes back on the stop,
    the spin-up and run-down come from the engine's and motor's inertias, and MG2 cancels MG1's reaction on the ring.
    Bench, sound and lap replay.
12. **Regen power against measured EVs.** A research build: published regen kW limits (Tesla, E-GMP, MEB), the
    coast-down and one-pedal measurements (SAE 2023-01-0623), and the friction brakes blending in at low speed.
    `evRegenTable` changes only if it misses.
    *Build 366:* researched (`plans/vehicle-challenges.md`); the table is 1.2–1.7× the measured regen kW and ~3× the
    measured slowing at low speed, set by makers' calibration, not physics. Code unchanged; the fix (a sourced rule per
    maker, moving every EV) waits on the owner.
    *Build 378:* the owner's rule made (`EV_REGEN_RULES`): Tesla 0.21 g, 77 kW (Plaid 90); E-GMP 0.4 g; MEB 0.3 g; default
    0.3 g. All three Teslas within 4% of each sourced figure (`test221`).

## 6. Engine details

13. **Rich mixtures cool the exhaust.** The excess fuel's evaporation and the unburned share (Heywood ch. 4 and 14)
    end the cap at stoichiometric. *Owner's decision first:* letting the retard floor read the exhaust temperature
    then cuts boost on the presets whose modelled exhaust is already over 950 °C at best spark.
14. **The scavenging term reads the burned mixture**, not the target, with the loop closed to convergence.
15. **A compound's split off its design point.** The low-pressure stage lags the high-pressure one, from each stage's
    own map. No preset is a compound, so the fingerprint is identical.
    *Build 375:* done; each stage on its own map, the HP shaft settled at once, the LP the state. Fingerprint identical.
    Open: the HP shaft's inertia and bearings, an LP gate, the LP turbine's sizing.

## Sourcing batch (apart from physics)

- Each all-wheel-drive preset's centre diff type (today every one is locked), then the centre coupling's own torque
  capacity.
- LSD coast ramps (1-way, 1.5-way, 2-way) where published; this would close the Mustang GT in `LIFT_KNOWN`.

## Open questions for the owner

1. Step 13: may the exhaust temperature lower boost on presets that run hot today?
2. Step 6: if grip by camber can't be kept inside `OFF_KNOWN`, does it stay named until after v1.0?
3. Does step 0 come first, or alongside step 1?
