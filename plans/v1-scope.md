# Plan: v1.0 scope, recalibrated at build 474

Written after PR #427 (`plans/engine-systems-remaining.md`). Since `plans/v1-finish.md` (build 407) the work went far
past that plan: the post-441 waves (`plans/post-441-audit-plan.md`, builds 441–460) and the engine-systems run
(`plans/engine-systems.md`, builds 461–473). This page says what is done, what is left, and what is proposed to move
after v1.0, so the finish line is a short, closed list again. **Every "proposed" line below needs the owner's yes.**

## What changed the picture

- **Group 3 (driving sim H′ and I) was partly built anyway.** Decision 23 deferred it at build 407 and still stands
  (owner, build 474); the post-441 plan pulled it in regardless, and builds 450 (tyre heat and wear, brake fade, converter slip in `stepCar`) and 456 (aero by ride height
  and pitch, stall, ISA altitude, headwind) shipped it. Phase J (lap, 0–100 and race on the stepped car) stays after
  v1.0, so decision 21's four rules stand.
- **Builds 441–473 moved lap, acceleration and engine numbers** (downforce in rolling resistance, ISA anchoring, knock and
  limit models, ring blow-by, crank limits). The last scoreboard figures in `v1-finish.md` and `engine-systems-remaining.md`
  (RS3 ~46% / 1.0 EcoBoost ~44% low-rpm torque short, the V8s' errors, the known-gap lists) are stale.
- **The register:** 37 entries, 4 still open: `EV_RATIO`, `catRampTop`, `AERO_FRONT/REAR`, `AERO_FLOOR`. (Since: `catRampTop`
  retired at build 476; the catalyst's fitted brick back pressure, which was never listed, derived at build 480.)
- **Build numbers drifted from PR titles.** Two PRs on `main` are titled "Build 462" (#415, #416); since then each PR
  title is one below its CHANGELOG heading (PR "Build 472" is CHANGELOG build 473). The stamp itself is consistent
  (`stamp.mjs --check`: 473). Titles only; the CHANGELOG is the record.

## Done from `v1-finish.md`

Items 1–3 (valves, 49 of 93 engines), 5 (the four V8s), 6 (water-to-air model), 9 (wing part), 11 (tyre pressure),
12 (springs, bars, dampers), and the first passes of 13–15 (data). Item 10 (floor, splitter) was moved after v1.0 by the
owner at build 417.

## The v1.0 scope (about 12 builds)

### Phase 1: re-baseline (no physics change)

1. **Scoreboard now** (`v1-finish` 18 brought forward, with `engine-systems-remaining` G4 step 1 and `v1-finish` 16).
   Every preset against its published power, torque, 0–100, top speed, mass, lap time, plus boosted low-rpm torque;
   rerun every `*_KNOWN` list (`ACC`, `RATING`, `GAP`, `AT_LIMITER`, `SPOOL`, `AERO`, `NO_WIDTH`, `FULL_LOAD`, `POWER`,
   `T100`, `BRAKE`, `BRAKE_FLOOR`, `VANES`, `SPA_LIGHT`) and the moose run. Output: one table in `plans/`, cars over
   10% with a suspected cause each, and a close / fix / rule proposal per known gap. Fingerprint identical. This build
   replaces guesses in every line below with measured numbers, and lifts AGENTS.md §0.3's pause for this one build.

### Phase 2: fixes the owner has already asked for (⚠ move numbers)

2. **G3 · engine braking at the limiter.** Overrun drag kept under fuel cut; fixes descent overspeed. Small.
3. **G1 · top-end fade** (`v1-finish` 5b, decision 16). Measure which high-rpm loss is missing, derive it; shrinks
   `RATING_KNOWN` (Dino 246) and `AT_LIMITER_KNOWN`, and test60's 'limiter' list (Hellcat, LS7, LS3, RS3, BAC Mono,
   Coyote).
4. **Water-to-air intercoolers per car** (`v1-finish` 7; decisions 17, 22 put it before v1.0). Presets whose maker
   publishes a water-to-air charge cooler move to the part built in build 429.
5. **`catRampTop` closed** (`v1-finish` 8; decision 5; owner: before v1.0). **Done**: the VE ramp retired at build 476
   (valves' pumping work), the brick's fitted `restrict × 350` replaced at build 480 by `catBrickDpPa` (substrate). A measured brick + silencer back pressure
   if one is found; if not, derive the brick's loss from its substrate (laminar flow in square channels from cell
   density and wall thickness, as the DPF's Darcy model in build 469) and the silencer's from build 454's model.
6. **G2 · turbine A/R matching** (owner: before v1.0). After build 1's baseline: residual-gas knock if missing, then
   `stock` A/R sized from exhaust flow at rated power; report boost-threshold RMS against `tests/proto/housing.mjs`.
7. **E8 · variable compression (VC-T)** (owner: before v1.0). Nissan's 8–14:1 schedule on the KR15DDT preset; an
   optional part, off by default for custom builds.
8. **Fixes from build 1's review**, one build each, only those the owner picks. Expected: few.

### Phase 3: the gate (`v1-finish` 17–20)

9. **The sweep for absurd builds**: random and extreme designs (including the new parts: W/M injection, MGU-H, VC-T, DPF, start-stop, cylinder deactivation, dry sump) through every simulator; nothing NaN, negative or impossible.
10. **Guide and README pass**: every page matches the code at that build (the post-441 and engine-systems builds added a
   lot of behaviour; check each has its guide text).
11. **The full suite green on `main`** (~80 min, locally).
12. **The final scoreboard** (build 1 rerun) with the finish line applied.

Then the owner checks the finish line and tags v1.0.

## After v1.0

| Item | Why it can wait |
|---|---|
| **Valves, batch 4** (`v1-finish` 4) | 44 engines remain on `EV_RATIO`; batches 2–3 found sources for ever fewer (16, then 3). Owner (build 474): they ship named on the ratio; `EV_RATIO` is signed off at v1.0. |
| **Data leftovers** (`v1-finish` 13–15) | 73 overhang splits, 7 tyre sizes, 12 pit lanes: makers do not publish them. Named gaps at v1.0; source opportunistically. |
| **`AERO_FLOOR`, splitter** | Already after v1.0 (build 417). |
| **Camless valves, HCCI** | Already deferred (no sourced production data). |

## Owner's answers (build 474)

| # | Question | Answer |
|---|---|---|
| 1 | Finish line | **Register empty or signed off; every car under 10% on each published figure, or on a named list with its reason.** |
| 2 | `catRampTop` | **Closed before v1.0** (build 5 above), not left a rule. |
| 3 | Valves | **Unsourced engines stay on the ratio, named; `EV_RATIO` signed off at v1.0.** |
| 4 | `AERO_FRONT/REAR` | **Signed off at v1.0**; the splitter follows the floor after v1.0. |
| 5 | G2 and E8 | **Before v1.0** (builds 6 and 7 above). |
| 6 | Water-to-air per car | **Before v1.0** (decision 22 stands). |

| 7 | Decision 23 (driving-sim H′ and I) | **Stands: after v1.0.** What builds 450 and 456 already shipped of them is not part of the v1.0 finish line. |

## Still open

1. **`AERO_FLOOR`**: with the finish line above, it needs signing off at v1.0 (the floor and splitter come after v1.0).
2. **Builds 450 and 456's code** under decision 23: kept as it is, or marked in the guide as beyond v1.0?
