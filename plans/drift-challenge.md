# Plan: S-route powerslide / drift challenge

Written before the first build. Sources cited below; numbers go into the driver and the
failure modes, not into the tyre model.

## Course (v1) — shipped build 358

Point-to-point **S**: straight → left 90° → short straight (34 m) → right 90° → straight.
Corner radius 18–22 m (searched); road half-width **12 m**. The line is a **drift line** (sustain
the slide), not the minimum-time racing line.

## What a controlled powerslide is

From Hindiyeh (Stanford PhD, 2013) and Velenis et al. (AVEC 2010): a drift / powerslide is a
steady cornering equilibrium with **saturated rear tyres**, **large body slip β**, **countersteer**,
and **large rear drive torque** (wheelspin). That equilibrium is **open-loop unstable**; the driver
(or a controller) must keep it with **steering and throttle together**.

Expert-driver data (Velenis, Escort RWD on loose surface): ~13 m radius, V ≈ 8 m/s, β ≈ 32°,
near-full throttle, consistent countersteer. Road-tyre dry asphalt needs more torque or a lower μ
to hold the same angle; the model already has combined slip and yaw, so the limit is the driver and
the car’s drive layout, not a missing DOF.

## Initiation methods (RWD first)

| Method | How | In `stepCar` today |
|---|---|---|
| **Power-over** | Turn in + sharp throttle so rear κ past the peak | Works if torque and gear allow; aids off |
| **Clutch kick** | Clutch in, rev, dump | `u.clutch` exists |
| **Scandinavian flick / feint** | Steer away, then into the turn to unload the rear | Steer only |
| **Lift-off** | Trail brake / lift to transfer load forward | Pedals |
| **Handbrake** | Lock rears briefly | **Not modelled** (named gap) |

v1 uses **power-over** (and a short clutch kick if power-over alone fails on a low-power car).
FWD needs handbrake or feint (Velenis CDC 2011); leave FWD/AWD as named gaps or FAIL_LAYOUT.

## Drift line vs racing line

Racing line: out–in–out, minimise time (already in the lap solver).
Drift line (driving practice + linked-corner notes): initiate **before** the geometric apex, hold a
wide arc so the slide can be sustained, then **transition** into the next corner by lifting (car
straightens and yaws the other way) and re-applying throttle — the pendulum used in S-bends.

For an S: left drift → lift through the short straight → right drift. Missing the transition is a
failure mode of its own (gripped up, or spun).

## How to handle failing to powerslide

Named outcomes (worst first), same spirit as moose CLEAR / CONE / SPIN / ROLLOVER:

| Outcome | Meaning |
|---|---|
| **SPIN** | Heading > 90° from the road, or β past a recovery band (~60°) with yaw still growing |
| **OFF** | Body outside the road half-width |
| **NO_SLIDE** | In a corner zone, rear slip never past the tyre peak (understeer / not enough torque) |
| **FADE** | Rear went past the peak, then gripped up before the corner ended (failed to hold) |
| **CLEAR** | Both corners: sustained β above a floor, with countersteer while the rear is past the peak |

A car that cannot initiate (FWD on power-over, ESP left on, very soft power) gets **NO_SLIDE**, not a
tuned tyre. ESP/TC are forced off for the run (as a hot lap already does in `test170`).

## Controller (v1, build 358)

Path from `driveDriver`. In corner zones: throttle regulates |β| toward a target (cut hard when over;
power-over / short clutch kick to initiate). Mid-straight: lift to let the pendulum swap sides.
Plans searched: v ∈ {9…12} m/s, |β| ∈ {0.20, 0.24, 0.28} rad, kick steps, R ∈ {18, 20, 22}.
First CLEAR wins (FWD stops at NO_SLIDE).

## Out of scope (named)

- Handbrake; loose surface μ map; smoke/tyre heat; player inputs; FWD/AWD techniques; scoring style
  points beyond CLEAR + β.

## Follow-ups

- **AWD power-over — done (build 379).** AWD takes the RWD path; whether the rear slides is up to the centre coupling
  `stepCar` already models (`centreCoupling`). The result and the DRIVE cell name the coupling and split. A single-speed
  car was put in gear 2, which it lacks, and STALLed: fixed (Model Y now CLEAR, Model 3 RWD CLEAR). The viscous,
  rear-driven cars (993 Turbo, Diablo VT, Murciélago) stay NO_SLIDE: the coupling sends torque forward as the rear slips.
  Left open: the Plaid goes OFF (too much power for R 18–22 m at the searched speeds); the Qashqai e-POWER (FWD) STALLs.
- **Next: handbrake.** Needs `u.handbrake` in `stepCar` (rear-only torque the ABS does not ease, with a sourced lever-brake
  capacity), then `'handbrake'` in `DRIFT_INITS` / `DRIFT_METHODS` for RWD and FWD (Velenis CDC 2011). Waits for the
  stability-control build in `drive-model.js` to merge.

## Sources

1. Hindiyeh, *Dynamics and Control of Drifting in Automobiles*, Stanford PhD, 2013.
2. Velenis et al., *Stabilization of Steady-State Drifting for a RWD Vehicle*, AVEC 2010.
3. Edelmann, *Analysis of Steady-State Vehicle Handling…*, TU Wien, 2011 (powerslide equilibria).
4. Velenis, *FWD vehicle drifting control: the handbrake-cornering technique*, CDC 2011.
5. Practice summaries for lines/transitions: drivingfast.net/drifting (initiation catalogue).
