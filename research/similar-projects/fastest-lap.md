# fastest-lap

[juanmanzanero/fastest-lap](https://github.com/juanmanzanero/fastest-lap) at
[`0660208aaeea956c9d833cb32a0ae6b4d959ecb9`](https://github.com/juanmanzanero/fastest-lap/commit/0660208aaeea956c9d833cb32a0ae6b4d959ecb9)
(16 August 2023, "Added 7 italian racing circuits (#45)"). Default branch `main`.
That commit is still the tip. Nothing has been pushed since.

**License.** MIT. Copyright 2021 Juan Manzanero. The `LICENSE` file is the standard MIT
text. The GitHub API reports `spdx_id: MIT`.

The solver's dependencies are not MIT. The README lists Ipopt and CppAD, both Eclipse
Public License, plus TinyXML-2 and the author's own `lion` / `logger-cpp` packages. EPL
is not GPL, so reading the project does not contaminate this tree. Vendoring Ipopt or
CppAD into it would. The recommendation below does not do that.

**Language.** The core is C++ (headers under `src/core/`, a C API in `src/main/c/`,
Python bindings in `src/main/python/fastest_lap.py`). GitHub Linguist reports Jupyter
Notebook as the primary language, because `examples/python` is full of notebooks. Both
statements are true; the physics is the C++.

**Activity.** Created 26 November 2021. About 204 commits. Releases v0.1 through v0.5.
Last push 16 August 2023. 655 stars, 57 forks, 8 open issues. The star count is why it
still looks alive. The code has been still for three years.

## What it is

A vehicle-dynamics library. Given a car and a speed, it computes a G-G diagram. Given a
car and a circuit, it computes the controls that minimise lap time. The README is
explicit that the lap is not quasi-steady: the dynamic equations are integrated, with no
steady-state assumption, by trapezoidal collocation. Ipopt solves the nonlinear program.
CppAD supplies the derivatives. A Catalunya lap at about 500 points is quoted at about a
minute.

Two vehicle models: a 3DOF car (longitudinal, lateral, yaw) used for the Limebeer 2014 F1
dataset, and a 6DOF kart (Lot & Dal Bianco). Tracks come from Google Earth KML, preprocessed
to a reference line, curvature, and distance to the kerbs.

## Files checked

The three paths in the brief exist. Two of them are declarations; the algorithms are in
the headers they include at the bottom.

| Path at `0660208` | What is actually in it |
|---|---|
| [`src/core/tire/tire_pacejka.hpp`](https://github.com/juanmanzanero/fastest-lap/blob/0660208aaeea956c9d833cb32a0ae6b4d959ecb9/src/core/tire/tire_pacejka.hpp) | Both Magic Formula implementations. `tire_pacejka.h` is the class declaration. |
| [`src/core/applications/steady_state.h`](https://github.com/juanmanzanero/fastest-lap/blob/0660208aaeea956c9d833cb32a0ae6b4d959ecb9/src/core/applications/steady_state.h) | `Steady_state`: `solve`, `solve_max_lat_acc`, `solve_max_lon_acc`, `gg_diagram`. The G-G loop is in [`steady_state.hpp`](https://github.com/juanmanzanero/fastest-lap/blob/0660208aaeea956c9d833cb32a0ae6b4d959ecb9/src/core/applications/steady_state.hpp) from about line 594. |
| [`src/core/applications/minimum_curvature_path.h`](https://github.com/juanmanzanero/fastest-lap/blob/0660208aaeea956c9d833cb32a0ae6b4d959ecb9/src/core/applications/minimum_curvature_path.h) | `Minimum_curvature_path`. The objective, sum of pseudo-curvature squared times `ds`, is `Fitness_fcn` in [`minimum_curvature_path.hpp`](https://github.com/juanmanzanero/fastest-lap/blob/0660208aaeea956c9d833cb32a0ae6b4d959ecb9/src/core/applications/minimum_curvature_path.hpp) from about line 338. |

Also read: `src/core/applications/optimal_laptime.h` (the transient lap), the README's
"What can be done" section, and `database/limebeer-2014-f1.xml` only far enough to see
that the car is data, not code.

## Pacejka combined slip

`Pacejka_standard_model` is a reduced Magic Formula, not the full Pacejka 2002 set.

Pure longitudinal force is `μx · Fz · sin(C · atan(B·κ − E·(B·κ − atan(B·κ))))`, with
`B` depending on a normalised load `dfz = (Fz − Fz0) / Fz0` through three `pK` coefficients.
`μx` is a single coefficient `pDx1`, not the usual load-sensitive peak. Lateral is the
same sine, with `B` from the `sin(pKy4 · atan(Fz / …))` stiffness form. Combined slip
multiplies the pure force by a cosine of the other slip:

- `Gx = cos(rCx1 · atan(rBx1 · λ))`, so lateral slip shrinks `Fx`
- `Gy = cos(rCy1 · atan(rBy1 · κ))`, so longitudinal slip shrinks `Fy`

There is no horizontal or vertical shift, no aligning torque in these functions, and no
separate friction-ellipse exponent. It is enough to make a tyre that saturates and gives
up one force when the other slip grows.

`Pacejka_simple_model` is the other option, and it is closer to a friction circle in
slip space. Each slip is divided by the slip at its peak, `ρ = sqrt(κn² + λn²)`, peak
friction falls with load between two `(Fz, μ)` points, and the force is shared out along
`κn/ρ` and `λn/ρ`.

**This repo.** `src/js/tyres-brakes-driveline.js` already has three of the same ideas,
split across the car rather than inside one tyre class.

- Load sensitivity: `μ = μref · (Fz / Fzref)^(−0.15)`, tabulated. The compound `μ` is the
  lateral figure at 60% of rated load. Rated load comes from the tyre's air volume.
- Longitudinal versus lateral: peak `μx` is `1.15 · μ`, from Milliken, and combined use
  is the ellipse `sqrt(1 − u²)` inside the lap solver (`accFrom`, `brakeFrom` in
  `src/js/racing-line-lap.js`).
- Slip shape: `tyreSlipMu(s) = sin(C · atan(B · s))` with `C = 1.4` and the peak at 10%
  slip. That is the pure-longitudinal Magic Formula with `E = 0`. The 0–100 run in
  `src/js/vehicle-accel.js` integrates wheel speed against it. Traction control, and the
  driver in first gear, hold slip at the peak.

What this repo does not have is combined slip as a function of both slips at once on the
contact patch. The ellipse is applied in force space after the lateral use `u = ay / ayMax`
is known. That is the quasi-steady assumption: the tyre is at whatever lateral force the
corner needs, and the rest of the ellipse is available longitudinally. Their cosine (or
the simple model's `ρ`) is what you need when slip, not acceleration, is the state. That
is exactly the parked model in `tests/proto/slip.mjs`, which uses the same sine curve and
was not shipped because wiring it through the launch moved the real-car 0–100 error from
2.66% to 7.79% RMS. The blocker written there is the clutch, not the lack of a Pacejka
reference.

So their tyre is a useful second opinion on combined slip, and a poor thing to drop in
as a replacement. The F1 and kart datasets are also not this game's road tyres. Copying
`pDx1` out of `limebeer-2014-f1.xml` would put a 2014 slick under a Golf.

## G-G diagram

`gg_diagram(v, n_points)` does not draw an ellipse. It solves the car.

1. Steady state at `ax = ay = 0`, as a starting point.
2. Maximum lateral acceleration at that speed (`solve_max_lat_acc`).
3. For each `ay` from 0 up to that maximum, an NLP for the most positive `ax` and another
   for the most negative. The constraints are the vehicle's steady-state equations
   (steering, yaw balance, axle loads), not a hand-written `μ`.

The numerical-Jacobian overload and the CppAD overload are duplicated. Both return a pair
of solution vectors, drive side and brake side, including the controls that achieved them.
A failed Ipopt status is recorded on the solution rather than always thrown.

That is a real G-G diagram: aero, roll, the diff and the engine's force all move the
boundary, and it can be asymmetric. An ellipse cannot show an open diff losing the drive
side, or brakes that give up before the tyre does.

**This repo.** The lap solver already knows every point on that boundary, one station at
a time. `ceilAt` is the lateral limit, with downforce, slope and a capped vertical
curvature. `brakeFrom` is the braking limit with load transfer, per-axle grip, fade and
engine braking. `accFrom` is the drive limit with the diff, the friction ellipse and
rotating inertia. Nothing plots them against each other at a fixed speed. The player sees
a lap time and a coloured line (power, traction, cornering, braking), which is the
diagram integrated along a track, not the diagram itself.

A G-G view is the piece to take. It does not require their tyre, their NLP, or their car
model. Sweep `ay`, and at each value ask the existing functions for the greatest `ax` the
driven axle can add and the greatest the brakes can take, at one speed, on level ground,
in a steady corner. Plot both. Downforce should fatten the diagram as speed rises. An
open diff should cut the drive side once lateral transfer unloads the inside wheel. A
front brake bias that is wrong should clip the brake side before the tyre ellipse does.

## Minimum-curvature path

`Fitness_fcn` in `minimum_curvature_path.hpp` minimises the sum of
`pseudo_curvature2_at(s, w, dw, d2w) · ds`. The unknown is `w`, the offset along the
track normal. Derivatives are central differences on a closed loop. Ipopt solves it,
with track-edge bounds. A second fitness function (`Fitness_fcn_by_polynomial`) does the
same job on a 3D centreline, with yaw, pitch and roll as variables, for circuits that are
not a sequence of arcs.

The objective is geometric. It does not know the car. A metre of extra radius is worth
the same at corner entry and at corner exit, and a longer path is only penalised insofar
as curvature times length says so.

**This repo.** `optimiseLine` in `src/js/racing-line-lap.js` states the same limitation
in its header, then does two steps.

1. Minimum curvature: projected gradient descent on `κ² · l`, on nodes about 25 m apart,
   clamped to the track width minus half the car. The comment records the bug this
   replaced: minimising the raw second difference pulled a constant-radius corner to the
   inside, because a shorter path scored better.
2. Minimum time: the same nodes are walked again, and a move is kept only when
   `simulateLap` on the candidate is quicker. Exit speed is then worth more than entry
   speed, which pure curvature cannot express.

So step 1 is the same problem they solve with Ipopt, solved here by gradient descent
because it has to run in the page on every car and every circuit. Step 2 is the part
they do not put in this class. Their minimum-time answer is `Optimal_laptime`, a
different, much bigger program.

Using their path as the line the car drives would throw away step 2. Using it as a check
on step 1 is the right size. On a circle, both should sit on the outside kerb. On a
straight, both should be indifferent. On a real circuit, the curvature integrals should
be close; where they are not, the difference is a bug in one of the two, and the lap-time
refinement is allowed to leave the pure-curvature line afterwards.

## Optimal-control lap

`Optimal_laptime` in `src/core/applications/optimal_laptime.h` is first-order collocation.
`Options::sigma` is 0 for explicit Euler, 0.5 for Crank–Nicolson (the trapezoidal rule the
README names), 1 for implicit Euler. Controls can be fixed, constant, on a coarse mesh, or
free at every point with a dissipation penalty so the driver does not chatter. The class
is hard-wired to CppAD (`static_assert` on the autodiff type). It is not a quasi-steady
pass with a braking sweep and an acceleration sweep.

**This repo.** `simulateLapRun` is the quasi-steady method, and the comment says so: a
cornering ceiling, a backward braking pass, a forward power pass, shift time charged when
the drive is cut. It also has things their F1 model does not need to teach and this game
does: per-axle load transfer, brake fade, elevation, vertical curvature capped at bump
stops, boost lag, a rev limiter that does not exempt top gear, and a driver who will not
upshift a car length before the brakes.

The quasi-steady lap can be wrong in ways a single lap time will not show, mostly where
the car is neither fully on the brakes nor fully on the power (a long crest, a corner
that is slightly too fast to be flat, a shift that should have been held). Their optimal
lap is the tool that would expose that, run offline on one exported circuit and one
exported torque curve. It is not a feature to link into `index.html`. A minute of Ipopt
per lap, an EPL library, and a 3DOF model that does not know this game's diffs would all
arrive together.

## What to adopt

### 1. G-G diagram from the existing solver

**Where.** A function next to `simulateLapRun` in `src/js/racing-line-lap.js`, or beside
`latBalance` in `src/js/tyres-brakes-driveline.js`, that does not touch the lap. The
drawing belongs on the lap panel (`src/js/track-view.js` or the vehicle performance
panel), as a plot of `ax`–`ay` at a chosen speed.

**Effort.** One sweep, two calls into physics that already exist, a canvas. No new
dependency. Smaller than the spark-table work, and independent of it.

**Risk.** Low if the diagram is a view. The risk is "correcting" the lap solver because
the diagram looks different from a textbook ellipse. It should look different: load
transfer, the 1.15 longitudinal factor, the diff and aero are supposed to dent it. Do not
feed the diagram back into `ceilAt`.

**Test.** At zero lateral acceleration the drive and brake accelerations match a
straight-line run at that speed. Raising `clA` widens the diagram more at 200 km/h than
at 50. An open diff's drive side is inside a spool's once `ay` unloads the inside tyre.
A car whose brakes fade to nothing clips `ax` on the brake side below the tyre. None of
these assertions call `simulateLap`, so a lap-time change cannot hide in them.

### 2. Combined-slip reference, not a new tyre

**Where.** `tests/proto/slip.mjs` and `tyreSlipMu`, when that prototype is picked up.
Not before the clutch note in `tests/proto/README.md` is dealt with.

**Effort.** Reading their cosine gain and deciding whether the parked model wants it.
No production change in this pass.

**Risk.** Known, and already measured. A slip-state tyre without a recalibrated launch
makes the real cars slow. Their F1 coefficients are the wrong tyres for these presets.

**Test.** The prototype's existing three checks (step size, final-drive sensitivity,
compound peak slip) plus one combined-slip check: at equal normalised slip, neither force
exceeds the pure peak, and the vector sum stays inside the ellipse the lap solver already
uses. That keeps the two models from drifting when the slip work is resumed.

### 3. Minimum curvature as a check

**Where.** A small script under `tests/proto/` or a single Playwright test that builds a
circular track, runs `optimiseLine` with no `lapOf` (the function already allows
`lapOf` null, "minimum curvature only"), and checks the offset sign. A second check
exports one real centreline and compares the curvature integral to a local
reimplementation of "sum of `κ² ds` on the normal offset". Reimplement the objective.
Do not compile their Ipopt code into the test.

**Effort.** Small. The circle case is a few dozen lines. The circuit comparison is a
bit more, and only worth it if the circle case is boringly correct.

**Risk.** Low. A test that fails when the line steps inward on a constant bend is the
regression the build-115 comment describes. It must not start failing because the
minimum-time step left the geometric line: call the curvature pass only.

**Test.** Constant radius, width known, the optimised radius is the outside one, not the
inside one. A straight has no preferred offset. Flipping the centreline's direction does
not mirror the car into the grass.

### Leave the optimal lap offline

If a later comparison is wanted, export a centreline and a torque curve and run their
Python examples out of tree, at this commit, without copying `optimal_laptime.hpp` in.
Record the lap-time delta in a note. Do not add Ipopt to the page.

## Attribution

Reimplement the G-G sweep and the curvature check. Their specific coefficient sets and the
XML databases are their expression; a comment that names the project and this commit is
the right credit if the diagram's layout follows theirs. If a file ever contains a
substantial adaptation:

```
Portions adapted from fastest-lap (https://github.com/juanmanzanero/fastest-lap),
commit 0660208aaeea956c9d833cb32a0ae6b4d959ecb9.
Copyright (c) 2021 Juan Manzanero
Licensed under the MIT License.
```

The Magic Formula itself is Pacejka's. Cite Pacejka, as `tyreSlipMu` already cites the
shape.
