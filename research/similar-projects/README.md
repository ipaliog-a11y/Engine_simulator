# Similar projects

Notes on three MIT-licensed engine and lap simulators, read against this repository at
`main` (`be0650a`, build 183). The aim is ideas this project can adopt without taking on a
GPL (or unlicensed) dependency.

Nothing here changes the simulator. The notes prefer a reimplementation of an idea over a
copy of another project's code. Where a later change does adapt a substantial piece of
someone else's source, that file needs their copyright line and the MIT permission notice.
A published formula (Wiebe, Douaud–Eyzat, the Magic Formula) is not their expression: cite
the paper in a comment. Their comments, table layouts, control flow and tests are. Do not
paste those.

Pins are the default-branch tips cloned on 29 October 2026. GitHub links below include the
commit, so a later push cannot move the evidence.

## Left out on purpose

| Project | Why it is not in the table |
|---|---|
| [ange-yaghi/engine-sim](https://github.com/ange-yaghi/engine-sim) | MIT, and already the source of the gas-sound mode. Not surveyed again. |
| [VDrift](https://github.com/VDrift/vdrift) and [Rigs of Rods](https://github.com/RigsOfRods/rigs-of-rods) | GPL. Out, so this tree stays MIT. |
| [Engine-Simulator/engine-sim-community-edition](https://github.com/Engine-Simulator/engine-sim-community-edition) | The public repo is README, docs and a tutorial. GitHub reports no language and no license. Excluded. Not read for ideas. |

## Summary

Activity is `pushed_at` and commit count from the GitHub API on 29 October 2026, not the
`updated_at` field (that moves when someone stars a dormant repo).

| Project | License | Language | Activity | Most useful ideas |
|---|---|---|---|---|
| [ECU Lab](ecu-lab.md) | MIT, © 2026 Caribou Tuning and Turtle.GTI. Confirmed in `LICENSE` and the API (`spdx_id: MIT`). | JavaScript and React (Vite). Physics is plain modules under `src/sim/`, no React. | Active. Created 2026-08-05, about 550 commits, v1.10.0, pushed 2026-10-29. 55 stars, 8 forks, 47 open issues. | The three calibration tables (VE, spark, AFR), the split between true airflow and the ECU's VE table, VE learning from a wideband log, and knock-safe interpolation between cells. The knock integral itself is already in this repo. |
| [fastest-lap](fastest-lap.md) | MIT, © 2021 Juan Manzanero. Confirmed in `LICENSE` and the API. | C++ core with a Python API. GitHub Linguist’s primary language is Jupyter Notebook, because of the examples, not the solver. | Dormant. Created 2021-11-26, about 204 commits, releases v0.1–v0.5, last push 2023-08-16. 655 stars, 57 forks. | A steady-state G-G diagram, and their minimum-curvature path as a check on ours. Their Pacejka model is a reduced Magic Formula, useful as a reference when the parked slip model is picked up again. The optimal-control lap is the real solver and is too heavy to port. |
| [Automation DIY](automation-diy.md) | MIT, © 2026 valdavole. Confirmed in `LICENSE` and the API. | Python. One 5,080-line script, `automation_diy_4.10.2.py`, plus docs. | Quiet after a short burst. Created 2026-07-18, about 45 commits, last push 2026-07-27, tagged in the README as v4.10.2. 2 stars, 0 forks. No tests. | Little that this repo does not already do in more detail. The lap method matches ours. The failure modes and launch control are coarser. |

## What does not match the brief

These are the places the source disagreed with the starting notes. Detail is in the linked file.

- **ECU Lab's `src/sim/knock.js` is not the knock model.** It is a 22-line charge index, `chargeIndexOf(ve, MAP)`. Knock is the Livengood–Wu integral inside `src/sim/cycle.js` (`runCycle`, `knockLimitedSpark`).
- **Their knock delay is the published Douaud–Eyzat correlation times a fitted scale of 2.** This repo integrates the published coefficients unscaled, and uses Kalghatgi's octane index. Taking their knock model would put a fit back into a place this project just removed one.
- **Wiebe is already here** (`WIEBE_A = 5`, `WIEBE_M = 2` in `src/js/engine-physics.js`), for burn phasing and for the end-gas trace. ECU Lab goes further: indicated work is the integral of `p dV` on a two-zone crank-angle cycle. That is a different, larger change than "add Wiebe".
- **Speed-density air mass is already here.** `updatePhysics` traps `MAP · VE · Vd · N / (R T)`. The missing piece is an editable VE table that is the ECU's belief, not the breathing model.
- **fastest-lap's G-G sweep and curvature objective live in the `.hpp` files.** `steady_state.h` and `minimum_curvature_path.h` are the declarations; the algorithms are included from the matching `.hpp`. `tire_pacejka.hpp` is the implementation, as named. There are two Pacejka models, and combined slip on the "standard" one is a cosine gain, not the full Pacejka weighting functions.
- **This racing line is already minimum-curvature, then minimum time.** Theirs stops at minimum curvature. Using it as a replacement would drop the time refinement. It is worth having as an independent check.
- **fastest-lap's optimal lap is transient optimal control** (Ipopt, not a quasi-steady pass). It is the interesting comparison, and it is not a browser feature.
- **Automation DIY's head gasket is not in the dyno or the lap.** The manual-throttle screen integrates coolant and blows the gasket at 130°C. Over-rev is a lookup of three material RPM caps, taken once when the curve is built. A "race architecture" flag can raise all three caps together.
- **Their launch control is a grip scalar and a held RPM.** This repo already searches launch RPM and holds the tyre at the slip peak.

## Ranked recommendation

Ranked by what would teach the player something this sim does not already compute, at a cost
that does not move the real-car calibration (`tests/test41.mjs`, `tests/aero.mjs`).

1. **ECU Lab's tuning maps, with this repo's knock model kept.** An editable spark table and a
   VE table that is the ECU's estimate, not `computeVE`. Knock stays `endGasIntegral`. Borrow
   their rule that the value *between* two spark cells must still clear the knock integral,
   and their VE-learn loop (wideband error, half a correction, cells with no log left alone).
   Do not port `runCycle` as the torque source in the same change. Roughly a new grid beside
   the fuel map, a generator that writes today's AUTO advance into it so existing cars do not
   move, and tests that a bad cell knocks or leans and a learned VE table converges. The risk
   is letting the player's table replace `computeVE` or `activeAdvance` outright: every preset's
   power and every lap time would move, and `test41` would have to be recalibrated for a reason
   that is not physics.

2. **A G-G diagram from the car this repo already has, not a new tyre.** Sample `latBalance`,
   the braking pass and the drive pass at one speed and draw `ax` against `ay`. That is what
   `Steady_state::gg_diagram` does with a full vehicle model; here the same picture falls out
   of `simulateLapRun` without Ipopt. It makes aero, diff and axle balance visible, which the
   lap time hides inside one number. Leave the tyre model alone for now. `tyreSlipMu` is
   already the Magic Formula shape in slip, and `tests/proto/slip.mjs` showed that driving the
   car through that curve moved 0–100 from 2.66% to 7.79% RMS. Their cosine combined-slip gain
   is a reference for that parked work, not the next change.

3. **fastest-lap's minimum-curvature line as a check, not a new line.** `optimiseLine` already
   minimises `κ² · length` and then spends lap time to move the line. An offline check on a
   circle and on one real circuit — same centreline, same width, compare the curvature
   integral and the path — would catch a regression in step 1 of `optimiseLine`. Their
   optimal-control lap is the honest "is our quasi-steady lap in the right place?" question,
   and it belongs as an occasional offline comparison, not as a dependency. Ipopt and CppAD
   are EPL, not GPL; still do not vendor them into this tree.

**Not recommended from Automation DIY.** The forward/back lap is the method in
`simulateLapRun`, on a real racing line with per-axle grip, fade, gradient and shift cuts.
Their over-rev table and 130°C gasket are coarser than `stepWear`, valve float and mean
piston speed. A player-set launch RPM is the only small idea worth keeping on a list, and
the 0–100 solver already picks that RPM by trying several.
