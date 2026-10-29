# Automation DIY

[valdavole/automation-diy](https://github.com/valdavole/automation-diy) at
[`fe760c0ab88e41368d4fb73f784f9b51d71da1b5`](https://github.com/valdavole/automation-diy/commit/fe760c0ab88e41368d4fb73f784f9b51d71da1b5)
(27 July 2026, "Update README.cz.md"). Default branch `main`. The README calls the tree
v4.10.2.

**License.** MIT. Copyright 2026 valdavole. The `LICENSE` file is the standard MIT text.
The GitHub API reports `spdx_id: MIT`.

**Language.** Python 3.10+, one script: `automation_diy_4.10.2.py`, 5,080 lines. UI is
tkinter. NumPy is used for the curves. `sounddevice` is optional. The README asks future
contributors to split it into `physics.py`, `audio.py`, `gui.py`, `track.py` and
`presets.py`. That split has not happened. There is no test file.

**Activity.** Created 18 July 2026. About 45 commits, almost all in that same month.
Last push 27 July 2026. 2 stars, 0 forks, 0 open issues. A short private-project burst
that was published, not an ongoing codebase.

## What it is

An Automation-style builder. The player sets bore, stroke, materials, cam, boost and a
car, runs a dyno, holds a throttle pedal to watch coolant, runs 0–100 and top speed, then
a flying lap on one synthetic circuit. The README is honest about scope: deterministic
inside the program, not a substitute for a cycle model or a multibody lap sim. Presets
that name real cars are fan approximations, and the disclaimer says so.

The physics and the widgets live in the same file. The functions that matter are all in
`automation_diy_4.10.2.py` at the commit above.

| Function | Lines (at `fe760c0`) | Role |
|---|---|---|
| [`run_track_simulation`](https://github.com/valdavole/automation-diy/blob/fe760c0ab88e41368d4fb73f784f9b51d71da1b5/automation_diy_4.10.2.py#L947) | 947–1133 | The flying lap. |
| [`build_test_track_geometry`](https://github.com/valdavole/automation-diy/blob/fe760c0ab88e41368d4fb73f784f9b51d71da1b5/automation_diy_4.10.2.py#L910) | 910–941 | The only circuit. |
| [`run_engine_simulation`](https://github.com/valdavole/automation-diy/blob/fe760c0ab88e41368d4fb73f784f9b51d71da1b5/automation_diy_4.10.2.py#L1135) | 1135–1519 | Dyno curve, over-rev, knock blow-up. |
| [`select_launch_rpm`](https://github.com/valdavole/automation-diy/blob/fe760c0ab88e41368d4fb73f784f9b51d71da1b5/automation_diy_4.10.2.py#L789) / [`launch_traction_utilization`](https://github.com/valdavole/automation-diy/blob/fe760c0ab88e41368d4fb73f784f9b51d71da1b5/automation_diy_4.10.2.py#L797) | 789–806 | Launch control. |
| `update_throttle_physics` | 4258–4293 | Coolant and the head gasket. |

`docs/USER_GUIDE.md` describes the same behaviour for players. The source is what this
note trusts where the two could diverge.

## Lap time

`run_track_simulation` is the quasi-steady method, on a centreline.

1. **Corner ceiling.** Curvature comes from the turning angle between samples, smoothed.
   Where the radius is finite,

   `v = sqrt( μ·g / (1/r − μ·(½ ρ ClA)/m) )`

   which is `m v²/r = μ (m g + ½ ρ ClA v²)` solved for `v`. A straight is capped by the
   lesser of top-gear redline speed, an electronic limiter, and 125 m/s.

2. **Backward pass, nine times around the closed loop.** Each point may be no faster
   than the next point plus `v² = v_next² + 2 a_brake ds`. Brake deceleration is the
   friction-circle remainder (`μx · sqrt(1 − u²)`, times a brake-utilisation factor),
   capped by a mechanical brake figure, plus aero drag. Floor 0.5 m/s².

3. **Forward pass, fourteen times.** Each point may be no faster than the previous point
   plus the best gear's acceleration. Wheel force is torque times ratio times efficiency,
   capped by the driven axle's share of the longitudinal grip times a differential
   factor. Drag and rolling resistance are subtracted. Rotating inertia is a flat `1.05`
   on the mass.

4. **Five more pairs** of brake and drive passes. Shift time is added after the speed
   profile exists: a full `shift_time` on an upshift, 40% of it (capped at 0.20 s) on a
   downshift. Time is `2 ds / (v + v_next)` plus those penalties. Three sectors are
   fixed fractions of the lap (0.31 and 0.63 of the length), not corners.

The track is one closed Catmull–Rom spline through a hardcoded point list, scaled to
3,605 m and resampled at about 5 m. The same points are drawn and driven. There is no
width and no racing line. Elevation is absent. Lateral μ does not fall with load. The
two axles are not separate except as a driven-weight fraction for traction.

**This repo.** `simulateLapRun` in `src/js/racing-line-lap.js` is the same three-step
method, and the header says so: cornering ceiling, backward braking, forward
traction/power. Past that the two are not comparable.

- The line is `optimiseLine`: minimum curvature, then a minimum-time refinement, inside
  the track width minus half the car.
- Circuits are real (`tracks/real-circuits.js`), with width and elevation. Vertical
  curvature loads and unloads the car, capped at 0.6 g.
- Grip is per axle (`latBalance`): load transfer, roll stiffness, camber, staggered
  tyres. The car is limited by the axle that runs out first.
- Brakes fade, split front/rear, and add engine braking. An axle with too little rotor
  for its grip costs stopping distance.
- The forward pass cuts drive for a gearshift and will hold a gear if the shift does not
  pay before the next brake zone. Boost is a shaft energy, not a sigmoid of rpm.
- Rotating inertia is `vehicleMassEff`, gear by gear, not `1.05`.

So the idea "corner limits, then brake backward, then accelerate forward" is already the
lap this game runs. Their version is the diagram of the method with the complications
left out. Porting it would replace a checked model with a thinner one. The one habit
worth noticing is the repeated passes: they iterate the closed loop because brake points
and drive points move each other's answers. This repo does two brake passes and two
drive passes inside `passes()`, which is the same fix, already in the code.

## Over-rev: the weakest of three lookups

In `run_engine_simulation`, three dictionaries map a material name to an RPM cap.

- Crank: cast 6500, forged 8500, billet 11500, flat-plane 9500, with a balancer adding
  200 or 500 rpm.
- Rods: cast 6000, heavy-duty 7000, forged 8500, lightweight forged 10000, titanium 12000.
- Pistons: cast 6500, forged 8500, lightweight forged 12000, hypereutectic 7200, low-friction 7500.

`mech_limit` is the minimum of the three. If the player's rev limit is above it, the dyno
returns `blew_up` immediately, the curve is cut at `mech_limit`, and the reason string
names the weakest part ("Crankshaft", "Conrods" or "Pistons"). This is not a stress. A
cast crank at 6501 rpm is destroyed before the pull is integrated; a forged crank at 8499
is fine at any boost, any stroke, any piston speed.

A `race_architecture` factor, the product of tech level, cam, rev limit, bore/stroke,
valvetrain, intake, manifold and the three exotic materials, can then `max()` all three
caps up to `12000 + 7000 · factor`. So the weakest-link rule is also allowed to raise
every link at once when the build looks like a high-rpm naturally aspirated race engine.

**This repo.** The redline is a fuel cut (`stepEngine` clamps and cuts fuel at
`engine.redline`). Wear, when enabled, adds a small OVER-REV term above 98.5% of that
limit (`stepWear` in `engine-physics.js`). The guide's redline page lists four physical
ceilings — mean piston speed, valve float, port Mach, burn time — and valve float is
computed from the spring (`src/js/valvetrain.js`) and actually reduces VE when it is
inside the rev range. Mean piston speed is in the guide as `Sp = 2 · S · N / 60`. None of
that picks a part and snaps the engine at a table RPM. A cast piston and a forged piston
are not a player choice with an RPM sticker.

Naming the binding limit is the useful fragment: "valve float at 6400" or "mean piston
speed past 25 m/s" is a better sentence than a generic OVER-REV, and it can be computed
from numbers the sim already has. Copying the dictionaries would invent a material system
this builder does not have, and would destroy engines at RPM numbers that ignore stroke.
Their own piston-speed choke (a soft VE drop past 22 m/s, or 22–40 m/s when
`race_architecture` is high) is closer to this repo's Mach and float losses, and it is
also a fitted cliff.

## Overheating and the head gasket

The gasket is not in `run_engine_simulation`. Knock is. A points score

`knock_index = max(0, effective_compression · 5 + ignition · 0.2 + lean_penalty − octane + 22 + modifiers)`

scales torque by `exp(−0.08 · index)` and, above 20, sets `blew_up` with the reason
"melted the pistons". Modifiers add for an iron head, a carburettor and a lean fuel map,
and subtract for direct injection, an intercooler, aluminium and tech level. This is the
kind of score `knockScorePorted` still is for this repo's rotary and two-stroke, and the
kind `endGasIntegral` replaced for four-strokes in build 131.

The head gasket lives in `update_throttle_physics`, the manual-throttle screen, which runs
on a 30 ms `after` callback:

- RPM chases the rev limit while the pedal is held, and idle when it is not.
- `heat_gen = sqrt(hp) · 0.06 · load · (rpm / limit)`
- `cooling = radiator_efficiency · (coolant − 20) / 100`
- coolant integrates `(heat_gen − cooling − 0.01) · 0.05`
- at 130°C, `engine_blown` is set and the label becomes the localised "BLOWN HEAD GASKET"
  string (`msg_hg_blown`).

The radiator is a 10–100 efficiency slider. There is no heat capacity, no thermostat, no
load from the dyno curve's actual fuel energy, and no gasket in the lap or the 0–100 run.
A car that would overheat on track never does, because the track function does not read
coolant.

**This repo.** `stepWear` charges OVERHEAT when coolant is above 112°C and OIL TEMP above
132°C, on the live bench, and a dead engine stays dead until it is rebuilt. DETONATION,
LEAN/BOOST and OVER-REV are separate causes, so the failure names the thing that was
worst. Thermal state is part of the live engine (`corners-thermal.js` and the coolant
model), not a single screen. There is no part called a head gasket. Adding that label on
top of OVERHEAT would be a string, not a model. A real gasket failure wants combustion
pressure and a temperature the head cannot reject; this sim's coolant is already the
temperature, and cylinder pressure is only implicit in the knock integral. Not worth a
port.

## Launch control

`select_launch_rpm`: with the option on, the player's `launch_rpm` clamped into
`[1000, 0.9 · max_rpm]`. With it off, `0.55 · peak_torque_rpm`, clamped to `0.45 · max_rpm`.
`launch_traction_utilization` returns a grip multiplier. Without launch control it ramps
from 0.78 to 1.0 over 1.2 seconds (a clumsy clutch). With it, the multiplier is
`1 − 0.16 · |rpm − optimum| / optimum`, where optimum is `0.82 · peak_torque_rpm`, clamped
to `[0.82, 1]`. Too high a setting mostly spins, which the tooltip also says. The 0–100
integrator in `run_vehicle_kinematics` holds engine RPM at the launch figure while the
clutch slips, and multiplies grip by that scalar. There is no slip ratio.

**This repo.** `runAccel` in `src/js/vehicle-accel.js` launches at several engine speeds
(30, 42, 55, 65 and 75 percent of the limiter, plus a default near 55%) and keeps the
quickest 0–100. A torque converter uses its stall speed instead. While the clutch slips,
torque is limited by clutch capacity (`CLUTCH_MARGIN` times peak torque) and the flywheel
slows if the clutch takes more than the engine makes. Wheel speed is a state.
`tyreSlipMu` turns slip into force. Traction control, and the driver during first gear,
hold slip at `TYRE_SLIP_OPT` (10%). The comment in the proto README that called the clutch
"a kinematic rpm hold" is out of date: build 106 and build 154 are the capacity limit and
the slip state. The remaining gap the proto note still cares about is calibration, not
the absence of a launch RPM.

A player-facing launch-RPM slider would be the only idea here that the UI lacks. The
solver would still be the one in `vehicle-accel.js`. Their utilization ramp should not
come with it. It hides wheelspin inside a coefficient the player cannot connect to a
tyre.

## What to adopt

Almost nothing from this file should be implemented. The comparison is still worth
keeping, because it shows the quasi-steady lap reduced to its skeleton, and it shows two
failure presentations (name the weak part, blow a gasket on a temperature) that are
coarser than what this sim already computes.

### Worth a later, separate look

**A sentence for the binding rev limit.** When wear trips OVER-REV, or when the valvetrain
panel already shows float below the redline, say which ceiling bound: valve float, mean
piston speed, or the player's own limiter. The numbers are in `valvetrain.js` and
`engine-physics.js`. No material table.

**A launch-RPM control, optional.** A slider that overrides the search in `runAccel` and
shows the 0–100 the player actually asked for, next to the searched best. Small, and only
after the spark-map and G-G work, because it does not teach a mechanism the sim is missing.
Test it by locking the RPM and checking that a peaky engine is slower at idle-launch than
at the searched RPM, and that traction control still holds 10% slip. Do not add a grip
multiplier.

### Not worth adopting

- The lap passes. Already present, with more of the car in them.
- The crank/rod/piston RPM dictionaries, and `race_architecture` lifting all three.
  Stroke and piston speed are the mechanism; a lookup that ignores them will disagree
  with the guide.
- The knock index. Four-strokes here already use the end-gas integral. Porting the index
  would be a second knock model.
- The 130°C gasket integrator. It is not connected to fuel energy or to the lap, and
  OVERHEAT already exists on the live bench.

**Effort and risk** for the two small items are low precisely because they do not touch
`simulateLap` or `calcAtRpm`. The risk in treating this project as a physics source is the
opposite: the script is one place, untested, and several of its dramatic results (instant
blow-up, the gasket, the launch multiplier) are thresholds chosen so the UI has an event.

## Attribution

Do not copy the script. If the launch-RPM slider is ever built, it should not share
control flow with `launch_traction_utilization`, so no MIT header is required. A comment
can still say the player-set RPM was prompted by this project, at commit `fe760c0`,
copyright 2026 valdavole, MIT. That is courtesy, not the license condition. The condition
applies when a substantial portion of their code is in the file.
