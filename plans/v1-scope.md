# Plan: v1.0 scope, recalibrated at build 474

Written after PR #427 (`plans/engine-systems-remaining.md`). Since `plans/v1-finish.md` (build 407) the work went far
past that plan: the post-441 waves (`plans/post-441-audit-plan.md`, builds 441–460) and the engine-systems run
(`plans/engine-systems.md`, builds 461–473). This page says what is done, what is left, and what is proposed to move
after v1.0, so the finish line is a short, closed list again. **Every "proposed" line below needs the owner's yes.**

## What changed the picture

- **Group 3 (driving sim H′ and I) is no longer "after v1.0".** Decision 23 deferred it at build 407; the post-441 plan
  pulled it in, and builds 450 (tyre heat and wear, brake fade, converter slip in `stepCar`) and 456 (aero by ride height
  and pitch, stall, ISA altitude, headwind) shipped it. Phase J (lap, 0–100 and race on the stepped car) stays after
  v1.0, so decision 21's four rules stand.
- **Builds 441–473 moved lap, acceleration and engine numbers** (downforce in rolling resistance, ISA anchoring, knock and
  limit models, ring blow-by, crank limits). The last scoreboard figures in `v1-finish.md` and `engine-systems-remaining.md`
  (RS3 ~46% / 1.0 EcoBoost ~44% low-rpm torque short, the V8s' errors, the known-gap lists) are stale.
- **The register:** 37 entries, 4 still open: `EV_RATIO`, `catRampTop`, `AERO_FRONT/REAR`, `AERO_FLOOR`.
- **Build numbers drifted from PR titles.** Two PRs on `main` are titled "Build 462" (#415, #416); since then each PR
  title is one below its CHANGELOG heading (PR "Build 472" is CHANGELOG build 473). The stamp itself is consistent
  (`stamp.mjs --check`: 473). Titles only; the CHANGELOG is the record.

## Done from `v1-finish.md`

Items 1–3 (valves, 49 of 93 engines), 5 (the four V8s), 6 (water-to-air model), 9 (wing part), 11 (tyre pressure),
12 (springs, bars, dampers), and the first passes of 13–15 (data). Item 10 (floor, splitter) was moved after v1.0 by the
owner at build 417.

## The v1.0 scope (about 10 builds)

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
5. **`catRampTop` research** (`v1-finish` 8; decision 5). One search build: a measured brick + silencer back pressure
   closes it; none found → owner's ruling (open question 2 below).
6. **Fixes from build 1's review**, one build each, only those the owner picks. Expected: few.

### Phase 3: the gate (`v1-finish` 17–20)

7. **The sweep for absurd builds**: random and extreme designs (including the new parts: W/M injection, MGU-H, VC-T if
   in, DPF, start-stop, cylinder deactivation, dry sump) through every simulator; nothing NaN, negative or impossible.
8. **Guide and README pass**: every page matches the code at that build (the post-441 and engine-systems builds added a
   lot of behaviour; check each has its guide text).
9. **The full suite green on `main`** (~80 min, locally).
10. **The final scoreboard** (build 1 rerun) with the finish line applied.

Then the owner checks the finish line and tags v1.0.

## Proposed to move after v1.0

| Item | Why it can wait |
|---|---|
| **G2 · turbine A/R matching** | Moves boost threshold and mid-range torque on every fixed-geometry turbo preset; it is a model change, not a bug, and the gap is named (`tests/proto/housing.mjs`). Revisit if build 1 shows boosted cars over 10% for this cause. |
| **E8 · variable compression (VC-T)** | A new system for one preset (Nissan KR15DDT, whose valves are not even sourced). Not a v1.0 promise. |
| **Valves, batch 4** (`v1-finish` 4) | 44 engines remain on `EV_RATIO`; batches 2–3 found sources for ever fewer (16, then 3). Ship them named on the ratio (open question 3 below); close the register entry as signed off. |
| **Data leftovers** (`v1-finish` 13–15) | 73 overhang splits, 7 tyre sizes, 12 pit lanes: makers do not publish them. Named gaps at v1.0; source opportunistically. |
| **`AERO_FLOOR`, splitter** | Already after v1.0 (build 417). |
| **Camless valves, HCCI** | Already deferred (no sourced production data). |

## Questions for the owner

1. **The finish line's wording** (open since build 363). Proposed: register empty or signed off; every car under 10%
   on each published figure, or on a named list with its reason.
2. **`catRampTop`**: if no measured back pressure turns up in build 5, it stays a rule until after v1.0?
3. **Valves**: may the 44 unsourced engines stay on the ratio, named, at v1.0 (signing `EV_RATIO` off)?
4. **`AERO_FRONT/REAR`**: the wing part shipped (build 415); the entry stays open only for the splitter, which is after
   v1.0. Sign it off at v1.0?
5. **G2 and E8 after v1.0**: agreed?
6. **Water-to-air per car**: still before v1.0 (decision 22), or after?
7. **Decision 23**: record it as reversed (H′ and I shipped in builds 450 and 456)?
