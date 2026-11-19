# Plan: vehicle Challenges page

Written at build 341. The CHALLENGES tab is for solved dynamic vehicle tests. It is not the ENGINE
tab’s career/scorecard list (`src/js/challenges.js`).

## Goal

One Drive tab where each entry is a kind of run (economy, skill, moose, skid pad, …) with its own
road or course and its own score. The sim solves; nobody drives yet.

## Registry

`RUN_CHALLENGES` in `src/js/run-challenges.js`. Economy entries (build 343 adds five real open roads; Alpine Pass stays):

| id | kind | score | course |
|---|---|---|---|
| economy | economy | litres or kWh / Wh/km at a target time | Alpine Pass (`ROADS.alpine`) |
| economy-dragon | economy | same | Tail of the Dragon US 129 (`ROADS.dragon`, ~18 km) |
| economy-bigsur | economy | same | Big Sur CA-1 mid-coast (`ROADS.bigsur`, ~38 km) |
| economy-napoleon | economy | same | Route Napoléon Digne→Grasse (`ROADS.napoleon`, ~116 km) |
| economy-highland | economy | same | A85 Oban→Lochearnhead (`ROADS.highland`, ~92 km) |
| economy-targa | economy | same | Targa Piccolo open stage (`ROADS.targa`, ~60 km) |

Real roads: OSRM centreline + ASTER elevation; width modelled (as Nordschleife). Paths stay open (no wrap).

## Economy run (shipped)

- Open path: `catmullOpen` / `buildRoad` in `src/js/eco-roads.js` (no wrap).
- Min-time on the centreline from rest (`ecoMinTime`).
- Target = pace × that car’s min-time. UI pace (build 344): 125% / 150% / 200% (`chalPaceFactor`); road `timeFactor` is the default when unset.
- Binary-search a speed cap on the open min-time solve so finish time hits the target.
- ICE: fuel from `engineFuelAt` (warm oil). EV (build 342): pack kWh / Wh/km via `motorLosses` + `packDraw` + regen (`ecoEnergyJ`).
- UI shows the target once (time ≈ target by construction). Hover the route (build 344) for distance, speed and incline at that point.
- **Named gap:** speed cap is not optimal lift-coast DP. A pure max-time limit would pick flat-out here (DFCO on brakes). Hybrids still use the ICE fuel path on this challenge.

## Eco driver and fixed-time stages (build 352)

- Eco driver (`ecoDriverTable`, `src/js/eco-run.js`): drive at the min-BSFC gear and torque (EV: best motor efficiency);
  slow on fuel-cut engine braking (EV: regen table). Blends 0/5/20/100% toward the car's own limits, each with a speed
  cap hitting the target; the cheapest is kept.
- Stage kind: `stage-*` entries, one set time per road (Golf GTI Mk7 min-time +2%, rounded up to 5 s); slower is DNF.

## Regen power against measured EVs (build 366, research)

What `evRegenTable` gives: the motor's peak torque, capped by the pack's charge power (`cCharge` × kWh), times the
setting's k. Regen alone (no drag), HIGH, test mass + inertias:

| Preset | Power cap | 20 km/h | 50 km/h | 100 km/h |
|---|---|---|---|---|
| Model 3 RWD 2021 | 90 kW | 6.7 m/s² | 3.9 | 1.9 |
| Model Y LR 2022 | 78 kW | 7.1 | 3.0 | 1.5 |
| Model S Plaid 2021 | 150 kW | 14.1 | 5.1 | 2.6 |

What real cars do (makers' calibration, not the motor or pack):

- **Tesla, lift-off (the only regen; the brake pedal is friction only, owners' reports: probable):** steady
  −0.21 g (2.1 m/s²) Standard, −0.11 g Low, on two Model 3s; a ramp-down below walking pace (Siddiqui et al.,
  SAE 2020-01-0883). Six 2020–22 EVs (Model 3, Model Y, Ioniq 5, ID.4, Mach-E, R1T) per setting: SAE 2023-01-0623
  (results behind the paywall, not read). Field study: ~2.5 m/s² regen alone (par.nsf.gov/servlets/purl/10511946).
- **Tesla peak regen power:** Model 3 ~77 kW (InsideEVs, Taycan regen article; year not given: probable); Model S
  Plaid ~90 kW (evkx.net spec listing: probable).
- **Hyundai E-GMP (Ioniq 5):** lift-off up to ~0.25 g at the strongest level and i-Pedal; regen blended under the brake
  pedal up to ~0.4 g, friction beyond (Hyundai engineer, The Brake Report, "Ioniq 5's sophisticated regen system").
- **VW MEB (ID.3):** electric braking alone under the pedal up to ~0.3 g, >100 kW, hydraulics beyond (VW newsroom,
  "Brake energy recuperation for efficient driving"; VW Australia says ~0.25 g).
- **Low speed:** all of them fade regen out near a stop and blend friction in; the table's 500 rpm floor (7–9 km/h)
  is in line.

**Gap (open, owner's decision):** the table misses by far more than 10%. At low speed it gives 6.7–14 m/s² against
2–4 m/s² measured; at speed the Plaid's 150 kW is ~1.7× its ~90 kW, the Model 3's 90 kW ~1.2× its ~77 kW. The cap
that bites is the maker's calibration (a deceleration cap, ~0.2 g lift-off on a Tesla, 0.3–0.4 g blended on E-GMP and
MEB, and a regen kW limit below the pack's charge power), which no relation in the sim derives. A fix is a rule with a
sourced figure per maker, and it moves all three EVs (economy run most; the lap's regen kWh and rotor heat; WLTC
little, its stops ask < 1.5 m/s²). Not changed in this build.

## Moose run (shipped)

- Registry id `moose`, kind `moose`. Solver in `src/js/moose-run.js` (ISO 3888-2, from `test173`).
- Score: max clear entry speed (km/h). UI: score grid + top-down cones + frontal force/roll replay from sampled `stepCar` state.
- Named gap: frontal diagram is a replay of the solved line, not a player-steered run.
- Build 352: entry speed BEST / 72 (Teknikens Värld) / 77 (km77); outcome CLEAR / CONE / SPIN / ROLLOVER (rigid tip about
  the outer tyres after a two-wheel lift); two-wheel lift flagged.
- **Known gap:** clear speeds 55–68 km/h vs 68–84 in magazine tests: look at the driver model's line and steering
  rate, the tyres' peak grip and the 40 kg-per-person load the magazines add.
- Build 352: the frontal view is the front axle seen from behind, to scale, every force labelled in kN on one scale.

## S-route powerslide (build 358)

- Registry id `drift-s`, kind `drift`. Solver in `src/js/drift-run.js`. Research: `plans/drift-challenge.md`.
- Course: point-to-point S (approach straight, left 90°, short mid, right 90°, exit). Road half-width 12 m.
- Driver: `driveDriver` for the path; in corners, throttle holds a target body slip β (power-over / clutch kick).
  ESP and TC off. FWD stays on the grip path (no handbrake yet) → **NO_SLIDE**.
- Outcomes: CLEAR / FADE / NO_SLIDE / OFF / SPIN. Score grid + top-down replay.
- Named gaps: handbrake, loose surface, FWD/AWD techniques, style points beyond CLEAR + β.

## Follow-ups

1. ~~Skid-pad challenge.~~ Shipped in build 368 (`src/js/skidpad-run.js`, id `skidpad`): 61 m circle, steady g from the
   lap time, outcomes HOLD / WIDE / TIGHT / SPIN / SLOW. Open: the driver's speed loop is proportional, so it settles
   just under its target; ESC stays at the car's default.
2. Multi-car ranking on a challenge.
3. Distance DP for economy (pulse-and-glide on the flat); hybrid energy on economy roads.
4. Open GPX import for user roads (do not reuse closed `gpxToTrack` blindly).
5. Drift: handbrake initiation; tighter road once the hold is stronger.
