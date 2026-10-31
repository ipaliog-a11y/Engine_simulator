# ECU Lab

[DNiev/ecu-lab](https://github.com/DNiev/ecu-lab) at
[`378b3457563000b9b5b931ae995117406e246212`](https://github.com/DNiev/ecu-lab/commit/378b3457563000b9b5b931ae995117406e246212)
(28 October 2026, "Merge pull request #150 … Mac desktop build"). Default branch `main`.
v1.10.0.

**License.** MIT. Copyright 2026 Caribou Tuning and Turtle.GTI. The `LICENSE` file matches
the standard MIT text, and the GitHub API reports `spdx_id: MIT`. `package.json` says
`"license": "MIT"`.

**Language.** JavaScript and React 18, built with Vite. The physics is plain ES modules in
`src/sim/` with no React imports. JSX is the UI only. `tsconfig.json` typechecks JSDoc; the
source is not TypeScript.

**Activity.** Created 5 August 2026. About 550 commits. Pushed 29 October 2026. 55 stars,
8 forks, 47 open issues at the time of this note. CaribouTuning owns the engine model;
Turtle.GTI owns tests, CI and the UI rework (README credits). This is the only one of the
three that is moving.

## What it is

An engine-management trainer. The player designs a short block, edits the calibration
tables a speed-density ECU actually has, runs a dyno pull, and reads a log. A quarter-mile
uses the torque curve. The design rule in the README is the same one this repo argues for
in the guide: parts change air, pressure, temperature or fuel, and power is whatever falls
out. No horsepower multiplier.

## Files checked

The four files named in the brief are real. One of them is not what it sounded like.

| Path at `378b345` | What is actually in it |
|---|---|
| [`src/sim/tables.js`](https://github.com/DNiev/ecu-lab/blob/378b3457563000b9b5b931ae995117406e246212/src/sim/tables.js) | The editable calibration: RPM and MAP axes, stock VE, spark and AFR tables, rectangle edits (add, scale, interpolate, smooth). |
| [`src/sim/cycle.js`](https://github.com/DNiev/ecu-lab/blob/378b3457563000b9b5b931ae995117406e246212/src/sim/cycle.js) | The closed cycle. Wiebe heat release, two-zone gas, Woschni wall loss, `∮ p dV`, and the knock integral. `knockLimitedSpark` and `trappedAirGrams` live here. |
| [`src/sim/knock.js`](https://github.com/DNiev/ecu-lab/blob/378b3457563000b9b5b931ae995117406e246212/src/sim/knock.js) | **Not the knock model.** 22 lines. `chargeIndexOf` returns `(VE/100) · (MAP / baro)`, a fullness number for the log. The file's own comment sends the reader to `cycle.js`. |
| [`src/sim/veLearn.js`](https://github.com/DNiev/ecu-lab/blob/378b3457563000b9b5b931ae995117406e246212/src/sim/veLearn.js) | VE corrections from a pull or a LIVE log. |

Also read, because the named files call them: `src/sim/airflow.js` (`computeHardwareVE`),
`src/sim/point.js` (the per-point solve; the speed-density split is here),
`src/sim/manifold.js`, `src/sim/coefficients.js` (the knock scale), `src/sim/ecu/strategy.js`
(table lookup), `tests/ve-learn.test.js`, `tests/fingerprint.test.js`, and the testing
section of the README.

## Speed-density air

`trappedAirGrams` in `cycle.js` is the ideal-gas charge:

`air [g] = (VE / 100) · Vswept · (MAP / (R · T))`

MAP is the load axis. `tables.js` says so explicitly: rows are manifold absolute pressure
in kPa (`LOAD = [200, 150, 100, 70, 40, 20]`), the axis HP Tuners uses, not throttle
(Alpha-N). The top two rows exist only on boost. Columns are a fixed RPM axis from 800 to
7500.

`point.js` keeps two VE numbers apart, and the comment says not to collapse them:

- `veActual` — what the hardware flows (`computeHardwareVE` in `airflow.js`). This sets
  real air, so torque, knock and the MAF.
- `veVal` — what the ECU's table claims. Fuelling uses this and nothing else.

The gap between them is the wideband's whole signal. The ECU can also be told `sd` (pure
speed-density), `maf`, or `blend` (speed-density with the MAF's error feeding the trims).
Sensor error is applied to the MAP and IAT the table is indexed with, so a lying sensor
reads the wrong cell.

`computeHardwareVE` builds the truth table from bore/stroke, cam duration (the breathing
curve slides along RPM), valve float, compression, head material, fuel charge-cooling,
exhaust size and turbine backpressure during overlap. The stock `DEFAULT_VE` grid is only
the shape that hardware then scales. A longer cam does not multiply power; it moves the
peak.

**This repo.** `computeVE` in `src/js/engine-physics.js` is the breathing model: a bell
where gas dynamics are not derived, otherwise intake fill, scavenging, residual, compressor
choke, port Mach and valve float. `updatePhysics` then does the same speed-density sum,
`MAP · Vd · (N/60) · charges · VE / (R T)`. So the air-mass law is already here. What is
not here is a second VE that the ECU believes and the player can be wrong about. VE in
this sim is physics the player changes by changing the head, the cam and the pipes. In
ECU Lab the player also edits the table, and a wrong table fuels wrong while the hardware
keeps breathing the truth. That is the tuner’s actual job, and this sim does not have it.

## Wiebe cycle

`runCycle` integrates from intake-valve close to exhaust-valve open, two crank degrees at
a time (the step is a coefficient). Volume is slider-crank, so rod ratio matters. Mass
fraction burned is Wiebe with `a = 5`, `m = 2`:

`xb = 1 − exp(−a · x^(m+1))`

phased from the spark plus a flame-development delay, over `burnDurationDeg`. Duration
depends on lambda (asymmetric: lean slows the burn more than rich), residual, a small RPM
term, and bore. Gamma blends from unburned to burned as `xb` rises. Pressure comes from
the first law, wall heat from Woschni, work is trapezoidal `p dV`, and gross IMEP is that
work over the swept volume. MBT is read off the trace (`mbtFromBurn`), not from a parabola
around a correlated spark number.

**This repo.** The same Wiebe constants are in `engine-physics.js` (`WIEBE_A`, `WIEBE_M`).
`wiebePhasingEff` weights Otto expansion efficiency by the burn rate, and that ratio is
what a spark advance costs (`sparkTimingFactor`). The end-gas trace uses the same `xb`.
Torque itself is not the integral. Spark IMEP is Heywood's rule of thumb: about 0.8 of the
fuel-air cycle (`GAMMA_FA = 1.28`), times the air mass, times `sparkMixture(lambda)`. A
diesel burn is a fixed 2.5 ms, also weighted by Wiebe. The guide states this on the
combustion page.

Adopting their cycle would replace that IMEP source with `∮ p dV`. It is the more direct
model, and it is also the change most likely to move every preset. Their own README says
the fingerprint is float-sensitive and Node must stay on 20 or 22 because of it. This
repo's equivalent gate is `test41` and `aero.mjs`, which are calibrated to the current
IMEP. Do not do both in one step.

## The three maps

All three are 6×8 and bilinearly interpolated. Stock spark is degrees BTDC, and the legal
cell range is −5 to +50 (`SPARK_MIN_DEG`, `SPARK_MAX_DEG`). The comment on that floor is
specific: a boosted low-speed cell really is after TDC, and a floor of +5 made a generated
B58 table detonate from 1700 to 2600 rpm because the generator was not allowed to write
the number the physics asked for. Stock AFR is gasoline-equivalent, stoich at light load,
about 12.6 under load. There is also a boost-target curve, one value per RPM column.

`interpolationRoomDeg` is the piece worth copying as an idea. The ECU does not run on
breakpoints. Halfway between a safe cell and the cell above, at a pressure neither row
sits on, the knock ceiling can be lower than at either end. The spark written in a cell
is limited so the interpolated value still clears the ceiling. `factoryCalibration` and
the advisor share that function, after a bug where the generator's own table looked
dangerous to its own advisor.

**This repo.** One editable map: the fuel map in `engine-physics.js` (`FM_ROWS = 6`,
`FM_COLS = 8`). Petrol rows are MAP in bar from 0.3 to `mapMax`; diesel rows are load as
a share of the air available at that rpm, because a diesel's full-load MAP moves with
boost and absolute-MAP rows smeared the smoke limit. Cells are lambda. The player taps a
cell and leans or riches it; saves persist `fuelMap` when it has been edited. There is no
spark table. `activeAdvance` is either the single FIXED advance or an AUTO search: MBT
where `knockAt` stays under `KNOCK_TARGET` (40), otherwise a bisection down to the knock
limit, never more than 37° of CA50 retard. `mbtAdvance` itself is still a short
correlation (more with rpm, less with MAP), and the Wiebe phasing then prices whatever
AUTO actually ran. The player cannot write a bad spark cell and see the log. They can
only pick FIXED and wind one number.

## Knock

Inside `runCycle`, while burned fraction is under the end-gas limit, the unburned zone is
compressed isentropically and cooled by Woschni, then heated by a fraction of the burned
zone (`ENDGAS_FLAME_COUPLING`). Ignition delay is Douaud–Eyzat:

`tau [ms] = SCALE · 17.68 · (ON/100)^3.402 · p[atm]^(−1.7) · exp(E / T)`

`KNOCK_TAU_SCALE` is 2.0. `coefficients.js` says the A, B, N and E coefficients are the
published ones, and the scale is the one fitted number, anchored so that presets make
their rated power knock-free and so that a 10.3:1 engine on 91 octane loses advance at
low speed. `knockLimitedSpark` bisects spark until the integral is 1, and it refuses to
search past the advance where the integral stops being monotonic (once the charge is
burned before TDC there is no end gas left, and the integral falls).

**This repo.** `endGasIntegral` is the same correlation with the published coefficients
and no scale (`DE_A = 17.68`, `DE_ON = 3.402`, `DE_P = 1.7`, `DE_T = 3800`). The score
the rest of the model reads is `KNOCK_TARGET` times the integral, so 40 is onset. On top
of Douaud–Eyzat it uses Kalghatgi's octane index, `OI = RON − K·S`, with `K` from the
unburned temperature at 15 bar. That is why E85 and methanol are not just "more octane".
Residual fraction, direct-injection latent heat and Woschni cooling of the end gas are in
the trace. Nitrous is still a points add. Rotary and two-stroke still use the old points
score (`knockScorePorted`), and the comment says so: the integral is a four-stroke poppet
cycle.

The two models are cousins, not copies. Theirs is a fuller cycle (two zones, flame
coupling, crevice, blowby) with a fitted scale and raw octane. Ours is a thinner cycle,
unscaled, with octane sensitivity. Replacing ours with theirs would reintroduce the fit
the build-131 notes removed, and would drop the octane index. The part to take is the
*use* of the integral: a spark table whose interpolated cells are checked against it.

## VE learning

`veLearn.js` is the tuner’s histogram, written out:

`VE_new = VE · (λ_measured / λ_target) · (1 + trims) · (MAF factor)`

Samples come from a full-throttle pull (`veSamplesFromPull`) or from the LIVE log
(`veSamplesFromLive`). A pull point is dropped if it is closed-loop, on nitrous, fuel-cut,
misfiring, injector-limited, or in a protection enrichment. A LIVE row is dropped if MAP
stepped more than 3 kPa, coolant is under 75°C, acceleration enrichment is on, or the
same protections are active. Each sample is shared across the four surrounding cells by
bilinear weight, and a cell needs about two samples on it before it counts. Cells the car
never visited stay as they were. `applyVeCorrections` applies a share of the error
(the comment says tuners use about a half) and clamps VE to 10–130%. The MAF's error is
reported separately (`mafErrorPct`) so it is not baked into the VE table.

**This repo.** Nothing learns. The fuel map is hand-edited. There is no wideband-versus-target
residual, because the ECU's air estimate and the engine's air are the same `computeVE`.
A learn loop only means something after the two-VE split exists.

## How they test

Vitest, physics in Node, no browser for the model.

- Intent tests (`tests/physics.test.js`, `tests/drivetrain.test.js`, and a long list of
  narrower files) assert direction: a longer cam gives away the bottom, a traction-limited
  launch does not depend on mass. `tests/ve-learn.test.js` is the pattern to copy. A table
  set to 0.9 of the truth reads about 1/0.9 in the cells a full-throttle pull visited, and
  null everywhere else. Applying the correction brings the wideband within 2%. Applying
  half of it, four times, converges. Nitrous, injector-limit and protection points are
  excluded.
- `tests/fingerprint.test.js` hashes 9,720 operating points, 756 sweeps, 252 VE tables and
  72 drag runs, and compares the SHA-256 to a committed fixture. A physics change fails
  the hash. The README tells the author to decide whether the move was intended, and only
  then regenerate the fixture. Node must be 20 or 22; newer is refused because the hash
  is float-sensitive.
- `tests/benchmark.test.js` and `tests/accuracy-claims.test.js` hold presets and the docs
  to ranges. `tests/physics-invariants.test.js` checks laws on random builds.

**This repo.** Playwright drives the shipped `index.html` (`tests/run.mjs`). Most files
are relative (a bigger turbo spools later). Three files are absolute: `test41.mjs` (0–100
against six real cars, fail above 5% RMS), `aero.mjs` (top speed), `test43.mjs` (the two
simulators agree). `tests/proto/` is outside the suite on purpose. There is no hash of
the operating map. A pure-function test of a new VE-learn module could follow their
intent-test style without a fingerprint; the lap and the 0–100 gate stay the check that
the torque source did not move.

## What to adopt

### 1. Spark table, knock-checked between cells

**Where.** Next to the fuel map in `src/js/engine-physics.js` (`generateFuelMap`,
`mappedAFR`, `renderFuelMap`) and the AUTO path in `activeAdvance`. Saves already persist
a custom fuel map in `src/js/saves-garage.js`; a spark grid would follow that.

**Shape.** Same 6×8 the fuel map uses, so one set of breakpoints. Cell value is degrees,
not a replacement for `endGasIntegral`. AUTO becomes: read the table, then if that advance
makes the integral exceed 1, run the retard search that already exists and log that the
cell was over the limit. FIXED-with-a-map lets the player leave it over the limit and take
the damage `stepWear` already charges for detonation. A generator fills the grid with
today's `activeAdvance` at each breakpoint, then pulls any cell back until the interpolated
value between it and its neighbour also clears the integral. That is `interpolationRoomDeg`,
reimplemented against `knockAt`, not pasted.

**Effort.** The grid, the save field, the generator and the retard-or-allow choice. The
guide page on ignition would need a short paragraph. No change to `computeVE` or to IMEP.

**Risk.** If the generator does not reproduce today's AUTO advance, every turbo preset's
torque curve moves and `test41` moves with it. Build the generator so a fresh table
matches `activeAdvance` within a fraction of a degree on the existing breakpoints, and
assert that before the table is allowed to change anything. The other risk is cost:
`endGasIntegral` is already cached because it is expensive. A 6×8 generator plus a few
mid-cell checks is a one-time cost per build, not per simulation step, if the result is
cached on `engine.score` the way `activeAdvance` is.

**Test.** A cell set past the limit, with wear on, raises `knockRisk` and drops health.
The same cell in the "ECU pulls it back" mode does not knock, and torque is below the
un-knocked MBT figure. A cell at light load can take more advance than the boosted cell
in the same column. The fuel map's existing behaviour is unchanged. A fresh generated
table matches today's AUTO torque curve closely enough that `test41` does not move.

### 2. True VE versus the ECU's VE, then learning

**Where.** `computeVE` stays the truth. A new table, same axes as the fuel map, is what
`mappedAFR` thinks the engine breathed. Fuel mass uses the table. Torque, knock and the
logged air use `computeVE`. The error the player sees is the ratio, which is what
`veLearn.js` multiplies by.

**Effort.** Larger than the spark table, because the live AFR, the emissions window and
the dyno log all assume the mixture the map asked for is the mixture that burned. Those
call sites have to grow a "commanded versus delivered" pair. Learning itself is a small
pure function: bin steady points, ignore fuel-cut and cold, apply half the ratio, leave
empty cells.

**Risk.** Wiring the table in as a multiplier on `computeVE` would make a "tune" into a
horsepower slider, which breaks the rule both projects state. The table may change
fuelling only. Also do not learn from points where this sim's mixture was not the table's
doing (nitrous, the rev limiter, cold oil). Their filters are the list.

**Test.** Scale the ECU table to 0.9, run a full-load sweep, and the delivered lambda is
about 10% lean of the target in the cells the sweep visited. Part-load cells are
untouched. One full correction, or a few half corrections, brings the wideband back.
A point with the fuel cut does not move a cell.

### 3. Do not port `runCycle` yet

Their closed cycle is the better IMEP model. It is also a rewrite of `sparkGrossImep`,
`wiebePhasingEff` and the end-gas trace together, and it brings a fitted knock scale.
Park it as a later comparison: implement `∮ p dV` beside the current IMEP, on one
engine, and see whether `test41` gets better or just different. Until that measurement
exists, the maps above do not need it. Knock-limited spark can keep using
`endGasIntegral`.

## Attribution

Reimplement. If a later change does adapt a substantial part of their source (the learn
binning is the likely candidate), the file header needs:

```
Portions adapted from ECU Lab (https://github.com/DNiev/ecu-lab),
commit 378b3457563000b9b5b931ae995117406e246212.
Copyright (c) 2026 Caribou Tuning and Turtle.GTI
Licensed under the MIT License.
```

The Wiebe function and Douaud–Eyzat are cited from Heywood and from Douaud & Eyzat, which
this repo already does. They are not ECU Lab's.
