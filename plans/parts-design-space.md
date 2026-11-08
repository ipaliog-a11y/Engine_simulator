# Plan: widening the parts design space

Owner's decision (build 249): **values stay honest.** A part's numbers come from a real car's published spec (cited in
the preset), or from one rule applied the same way to every car. Never tune a part, or a preset, to win back a figure;
a car that misses goes on a named known-gaps list in its test and in the CHANGELOG.

## How each part is built

Each new part is two builds:

1. **The part.** The factory choices stay as they are; a designed part feeds the same physics its own dimensions. A
   factory choice written down as a part must give the same engine, so the fingerprint is identical and no car moves.
2. **Retiring the fitted number the part stood beside**, in its own build. It reports how far each preset moved and
   whether the error against the real cars got better or worse. A shift shared by many cars points to one missing
   piece of physics: fix that, never each car.

## Order

| # | Part | What the player sets | Physics it feeds | Fitted number to retire after |
|---|---|---|---|---|
| 1 | **Camshaft** (build 249) | duration, lift, lobe separation, lobe profile, phaser range | intake stroke (IVC), overlap, trapping, valve float, friction | `CAM.ampMul`, `idleRpm` (idle), `loWiden` |
| 2 | Cylinder head & springs | valve diameter, port flow, spring seat load and rate | Mach index, valve mass and float, friction | `THROAT_RATIO`/`dOverB` per pack, the 3 spring steps |
| 3 | **Chassis numbers** (build 250) | CG height, wheelbase, track, weight split, ballast | load transfer, roll, diff traction | class-median CG/track on real cars (sourced per car) |
| 4 | **Intercooler** (build 254) | core face, depth, fins, pipe length | effectiveness (NTU), charge volume, **pressure drop (new)** | `INTERCOOLER.eff` |
| 5 | Turbocharger | compressor and turbine wheels, A/R, wastegate | compressor map, back-pressure, spool | `TURB_WHEEL`, `TURBO_CONFIG` multipliers |
| 6 | Wings, brake bias | span, chord, angle; front share | lift and induced drag; lock-up order | `AERO_FRONT/REAR` tables |
| 7 | Plenum & throttle, flywheel, wheels, tyre pressure | volume, bore, mass, material, pressure | Helmholtz, `MAP_K`, inertia, unsprung mass, contact patch | `MAP_K`, `UNSPRUNG_SHARE` |
| 8 | Catalytic converter, rods & pistons | cells, brick; rod length, forging | back-pressure; stress limit (new model) | `catRampTop` (counts the cat twice); needs the owner |

## Moves expected when fitted numbers go

- Cam (step 2 of #1): `ampMul` no longer scales a valved engine's power (its fill table does, since build 122); it is
  left in the airflow estimates (exhaust pulse, blowdown, compressor demand). Its removal should move turbo spool most.
- Intercooler: every intercooled preset (45) loses its core's pressure drop.
- Catalytic converter: removing the double count lifts nearly every engine 5–6% (build 244): find what it hides first.
- Chassis: all 92 vehicle presets move once each has its own sourced CG height and track. Build 251, batch 1: CG = 0.388 × overall height
  (NHTSA's measured median, `research/cg-height/`) on the 38 cars with published tracks; mean 0-100 error 10.10 → 9.77%.
  Build 252, batch 2: tracks and height for 20 NA Sports, Kei & City and Compact Turbo cars (error 7.77 → 7.69%).
  Build 253, batch 3: the rest; 85 of 92 cars carry their own CG, 81 their own tracks (error 9.55 → 9.51% on batch 3).
  Still open: Dino 246, GNX, Sierra Cosworth, F-150 Raptor (unsourced); Atom, Mono, SR3 (roofless). Class CG and track
  stay hand-set.
