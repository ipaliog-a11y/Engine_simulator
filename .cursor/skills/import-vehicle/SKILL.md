---
name: import-vehicle
description: >-
  Research and import a real car into Pixel Powertrain factory presets (e.g. "import
  Ferrari F50", "add the NSX Type R", "bring in a real car"). Covers sourcing body and
  engine numbers, writing presets, running accuracy checks against published 0-100 /
  top speed / power, fixing honest input errors within tolerances, and reporting
  unachievable gaps with suggested actions. Use whenever the user asks to import,
  add, or research a factory car for the sim.
---

# Import a real vehicle

Turn a named real car into a factory preset the sim can load, with cited sources and
accuracy checks. Follow `AGENTS.md`. **Derive, do not fit.**

Gold-standard pack: `research/vehicles-batch-1/` (README + `vehicles.json` +
`validate.mjs` + `tests/test115.mjs`). Mirror that shape for one car.

## Hard rules (never break)

1. **Never tune physics** or widen a test tolerance so the car "passes".
2. **Never invent** gear ratios, curb mass, Cd, or power. Missing → `null` / omit + `unsure`.
3. **Never store dry weight as `body.kg`**. Curb with fluids, no driver. EU kerb with 75 kg
   driver → subtract 75 and note it.
4. **Factory aero is inside measured Cd** → leave `aF`/`aR`/`aFl` as `none` unless Cd is
   wing-off and the note says so.
5. **Allowed "adjustments"** are source fixes and control inputs only:
   - correct dry/curb, PS↔hp, 0–60≠0–100, wrong trim/year
   - solve factory ECU `taperRpm`/`taperPct` (gentlest from peak-torque rpm that meets rating)
   - set `tqLimit`, diesel `govRpm`, published `GEARSETS`
   - pick a better chassis / `engPos` / mark `unsure`
6. **Forbidden "adjustments"**: fudge `kg`/`cd`/`area`/`boost_bar` to hit 0–100; change
   unrelated presets; add to `*_KNOWN` gap lists without a CHANGELOG reason.

## Workflow

### 0. Clarify the car

Resolve year, trim, market, drivetrain. Refuse hybrids/EVs in the combustion tables — those
go in `electric-presets.js` (see `plans/hybrid-electric/`). If already in `FACTORY_CARS`,
stop and say so.

Default path = **combustion**. Ask only if the car is clearly hybrid/EV or the year/trim is
ambiguous.

### 1. Research (before editing `src/`)

Create `research/vehicles/<id>/` with:

| File | Purpose |
|---|---|
| `vehicle.json` | One entry shaped like batch-1 (use `assets/vehicle.template.json`) |
| `NOTES.md` | Short: sources, conflicts, confidence, chassis choice |

Fill every field in `references/schema.md`. Prefer maker press / official pages, then
auto-data.net, then Wikipedia (mark secondary). Cite URLs in `sources.*`.

**Estimates (always list in `unsure`):**

- frontal area unpublished → `width_m × height_m × 0.81` (cars) or `× 0.85` (truck/SUV)
- axle split unpublished → layout estimate for `fWt`
- peak boost unpublished → typical for that hardware as `boost_bar`

**Confidence:** `high` / `medium` / `low`. Do not score the model against `low` or SAE-gross
ratings (`real.gross: true` on the engine).

Validate:

```bash
node .cursor/skills/import-vehicle/scripts/validate-research.mjs research/vehicles/<id>/vehicle.json
```

### 2. Implement presets

Touch only what the checklist needs (`references/checklist.md`). Typical combustion set:

1. `src/js/engine-options-presets.js` — new `PRESETS` entry (or reuse an existing engine name)
2. `src/js/vehicle-presets.js` — `VEHICLE_PRESETS` + optional `GEARSETS`
3. `src/js/car-art.js` — `CAR_NO` = max+1 (never reuse); `CAR_ART` when WebP exists
4. `src/js/car-dimensions.js` — `CAR_DIMS` (required by `test171`)
5. `src/js/car-profiles.js`, `src/js/tyres-brakes-driveline.js` (`SUSP_REAL`) when sourced
6. New category → add to `PRESET_CATS` / picker cats
7. New chassis needed → **stop and propose**; do not force a bad archetype (see BAC Mono → `openwheel`)

Then:

```bash
node tools/build.mjs
node tools/class-medians.mjs   # if the car's class is derived (≥3 real cars)
node tools/car-prices.mjs      # regenerates src/js/car-prices.js
```

**Art:** follow `.cursor/skills/vehicle-profile-art/` (prompt → generate with the S2000
style reference → post-process → `CAR_ART` + manifests). Without the WebP, finish research
+ presets + accuracy, leave art named open, and do not claim the PR merge-ready until art
+ `CAR_ART` land (showcase / `test147` need the file).

### 3. Accuracy check

```bash
node tools/build.mjs
node .cursor/skills/import-vehicle/scripts/check-accuracy.mjs "<Exact Preset Name>"
```

Tolerances (same spirit as `tests/test115.mjs`):

| Check | Band | Notes |
|---|---|---|
| Peak power vs `real.hp` | ±25% | skip if `confidence: low` or `real.gross` |
| 0–100 matched to rating | ±35% | scale torque to rating, then `buildVehicle` |
| Top speed | ±35% | `limited: true` = governor; model has none |

Also verify: loads as factory fit, published gearset applied, no page errors.

### 4. Diagnose misses (honest loop)

If over band, fix **inputs** only — re-read sources; curb vs dry; PS vs hp; gearset; taper;
chassis / `engPos`; tyre size. Re-run the check.

If still over band after honest inputs → **do not ship as a scored car**. Report gaps
(`references/gap-report.md` shape) and suggest actions. Typical actions:

- mark `confidence: low` and leave unscored until sources improve
- name a model gap (two-valve top-end, diesel BMEP ceiling, missing Atkinson cam, …)
- propose a new chassis archetype
- wait for published gearset / Cd / curb
- SAE gross → set `real.gross`, do not score power against it

### 5. Test + ship (one build = one PR)

Add `tests/testNNN.mjs` for this car (copy shape from `test115` / a recent one): pack
fields match preset; factory load; accuracy bands for high/medium. Add duration to
`tests/durations.json`.

```bash
node tools/stamp.mjs          # once per PR
node tools/build.mjs
node tools/stamp.mjs --check && node tools/build.mjs --check
node tests/run.mjs <new> 134 171 132
```

Run `134` after class-median regen, `171` for dims, `132` for `CAR_NO`. CHANGELOG under
`## [Unreleased]`: `### <Car> factory preset (build N)` with sources, errors vs real, and
what stayed open.

## Output to the user

Always end with:

1. **Verdict:** imported / research-only / blocked
2. **Numbers table:** power, 0–100, top — model vs real (%), confidence
3. **Sources** used
4. **Open items** and **suggested actions** if anything is out of band or unscored

## Progressive disclosure

- Field meanings → `references/schema.md`
- Files to edit → `references/checklist.md`
- Gap report template → `references/gap-report.md`
- JSON skeleton → `assets/vehicle.template.json`
