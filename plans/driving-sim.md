# Plan: from the stepped car to a driving simulation

Written at build 316 from `src/js/drive-model.js`, `plans/road-to-v1.md` (phase E) and runs of `stepCar` with the aids
off. The order is a proposal; the owner's decisions are at the end.

## Where it stands

`stepCar` already lets a car understeer, power-oversteer, spin and spin its inside wheel. At steady speed the M3 E46
saturates its front tyres first (front slip angle 10.5°, rear 6.2°, at 0.94 g). On full throttle in 2nd with an open
diff, the M3's inside rear runs at 93 km/h while the car does 61. The Civic's inside front runs at 116 km/h while the
car does 59, and its cornering falls from 0.47 to 0.35 g. With a limited-slip diff the M3's inside rear does not spin
up. It costs about 3 µs per 1 ms step, so 20 cars in real time take about 6% of one desktop core
(measured here; a phone is slower, not yet measured).

What a driving simulation still misses, from most to least felt at the wheel:

| # | Gap | What the driver feels without it |
|---|---|---|
| 1 | No steering torque (self-aligning moment, caster trail) | nothing to give force feedback; the steering doesn't go light at the limit |
| 2 | No roll or pitch, no camber, roll steer or compliance | the car doesn't lean or dive; a tail that steps out has no warning; ESP had to be detuned for this (build 281) |
| 3 | Limited-slip diff is `lock*300*Δω`, and the AWD centre diff is always locked | every LSD acts like a viscous coupling; the 300 is fitted and missing from the register; AWD cars scrub and push in tight corners |
| 4 | The road is a line with grade and curvature, no surface | no bumps, kerbs, grass, gravel or wet |
| 5 | Tyre and brake temperature, pressure and wear are race-only or absent | no warm-up, no fade, no tyre falling off over a stint |
| 6 | Each wheel has no vertical motion of its own | a bump can't unload one wheel; with no load change a kerb has no effect |
| 7 | Aero ignores ride height, pitch and the wake of a car in front | balance doesn't shift under braking; following another car costs no grip |
| 8 | The lap, 0–100 and race don't use `stepCar` | handling balance never shows in a time |
| 9 | No input layer, no game loop, no car export | nobody can drive it yet |

## Route

One build each unless stated. Every build follows `AGENTS.md`: derived from a cited source, a test, a fingerprint.
Builds G1–G5 change only `stepCar`, so the lap, 0–100, dyno and race fingerprints must stay identical; only the
`drive*` tests move.

**G. Close the handling gaps (about 9 builds)**

1. **Differentials as parts.** Clutch-plate LSD: preload plus a torque bias from the ramp angles, the
   number of plates and their friction (Milliken & Milliken RCVD ch. 20). Viscous: torque from Δω through the fluid's
   viscosity and plate area (a maker's data sheet). Torsen: a fixed bias ratio (the maker's published 2.5–4:1; to confirm). The AWD
   centre becomes the car's own type (open with a viscous coupling, Haldex-style clutch, Torsen with a static split)
   from the preset's spec. Retires the `300`. *Test:* inside-wheel speed and bias ratio on a split-μ launch per type;
   a locked centre scrubs more than an open one on a 20 m circle.
2. **Self-aligning torque.** The brush model gives the pneumatic trail in closed form (Pacejka ch. 3), so
   Mz = −Fy·(pneumatic trail + caster trail). Caster trail comes from the caster angle and wheel radius (spec sheet, or
   probable). Output `s.steerTorque` at the hand wheel through the rack ratio. *Test:* the torque peaks before the
   side force does (the "goes light" signal), and an FWD car on power torque-steers with unequal driveshaft angles
   (only where the preset says so).
3. **Roll and pitch as states.** Two more degrees of freedom: the sprung mass on the roll and pitch stiffness and
   damping already derived for `lltdF` and the ride frequency (`susp-window.js`). The first-order load-transfer lag
   goes away; the transfer follows from the body's angles. *Test:* roll gradient (deg/g) and pitch in braking against
   the model's own static values; a step-steer (ISO 7401) shows overshoot that grows with damping set lower.
4. **Camber and camber thrust.** Static camber plus camber gain with roll from the suspension type (strut, double
   wishbone, multi-link: geometry from Reimpell, *The Automotive Chassis*), and camber stiffness in the brush tyre
   (Pacejka ch. 3). *Test:* the outside front's camber on a skidpad; more negative static camber raises front grip.
5. **Roll steer and compliance steer.** Toe change per degree of roll and per kN of side force, by suspension type
   (Reimpell; Milliken ch. 17). This is what lets ESP go back to judging a spin by yaw rate (build 281's open item).
   *Test:* ISO 4138 constant-radius understeer gradient rises with compliance; the ESP test still passes with its
   original yaw-rate trigger.
6. **Each wheel's own vertical motion.** A quarter-car at each corner: unsprung mass (already a part), spring and
   damper, and the tyre's vertical stiffness. The tyre's load becomes the tyre's own deflection. Two builds: the
   corner, then substeps if the wheel-hop frequency (~12–15 Hz) needs a step under 1 ms. *Test:* a single bump
   unloads one wheel for the time the quarter-car predicts.
7. **The surface.** The road as a height field along and across the line: kerbs from FIA circuit drawings, roughness
   from ISO 8608 classes A–C. Grip per surface (dry, wet, grass, gravel) from published friction measurements (source to
   be found). *Test:* two wheels on a kerb change their loads; the car slows on grass as the friction measurements say.
8. **Lift-off and trail-brake checks.** A test only: ISO 9816 (throttle off in a turn) and ISO 7975 (braking in a
   turn) on five cars. The rear-drivers must tighten their line and the front-drivers must keep it. If one doesn't,
   it is a named gap, not a tune.

**H′. Heat and wear in time (3 builds, after phase F's tyre heat)**

1. Tyre surface and core temperature and pressure in `stepCar`, the race's model reused, with grip by temperature.
2. Brake rotor temperature from its mass (the rotor part) and a pad's friction by temperature (pad maker's curve):
   fade.
3. Tread wear by the energy put through the tyre (the race's model), so a stint's grip falls in the stepped car too.

**I. Aero in motion (2 builds)**

1. Downforce and balance by front and rear ride height and pitch (from G3), where the aero parts give a height
   (splitter, undertray). Source: wind-tunnel data published for the same kind of part (probable, marked).
2. The wake: a following car's drag and downforce cut by the distance to the car in front, from the race's tow and
   dirty-air rules, now applied per axle.

**J. One model for the numbers (decision first)**

The lap solver stays the headline number (it is fast and needs no driver). The stepped lap with `driveDriver`
(within 4% today) becomes a second figure, "DRIVEN LAP". The gap between the two then shows how drivable a car is.
A twitchy car loses more to the driver than a stable one does.

**K. Drivable (after v1.0, may be a separate app; road-to-v1 decision 10)**

1. **Car export:** a button that saves `JSON.stringify(driveCar())` and a standalone `drive-model.js` loaded
   without the page. A headless test runs a lap from the file alone.
2. **Input:** keyboard, gamepad and touch, with a steering filter that slows the wheel at speed. Assists (ABS, TC,
   ESP) are already a tune.
3. **Loop:** fixed 1 ms physics steps behind the frame rate, interpolated for drawing; force feedback from G2's
   steering torque, by the Gamepad API's haptics where a wheel supports it.
4. The 3D 8-bit view and the game itself, as already planned after v1.0.

## Order and size

G1 → G2 → G3 → G4 → G5 → G8 → G6 → G7 (about 9 builds) gives the handling. G1 and G2 are small, and on their own
they are enough to drive it. H′ and I follow phase F. J is one build. K comes after v1.0.

## Owner's decisions needed

1. **Before or after v1.0?** Road-to-v1 point 6 says v1.0 "simulates every value a playable driving game needs".
   Read that way, G and J are v1.0 work; read narrowly, only G1–G2 are.
2. **G3 and G6 make the stepped car stiffer to integrate.** Allow substeps under 1 ms for it (the cost per car
   rises in proportion)?
3. **Suspension geometry for G4–G5** isn't in any preset. Use the per-type values from Reimpell, marked probable,
   or ask for a maker's figure per car?
4. **J:** show a DRIVEN LAP beside the solved lap, or keep it test-only?
