# Implementation checklist

Work in `src/`, then `node tools/build.mjs`. Never hand-edit `index.html`.

## Always (combustion)

- [ ] `research/vehicles/<id>/vehicle.json` + `NOTES.md`
- [ ] `validate-research.mjs` clean
- [ ] Engine in `src/js/engine-options-presets.js` (`PRESETS`) — new or reused
- [ ] Car in `src/js/vehicle-presets.js` (`VEHICLE_PRESETS`)
- [ ] `GEARSETS[name]` only when ratios are published (`r` and preferably `fd`)
- [ ] `CAR_NO[name] = max+1` in `src/js/car-art.js` (never reuse a retired number)
- [ ] `CAR_DIMS[name]` in `src/js/car-dimensions.js` (`test171`)
- [ ] `node tools/build.mjs`
- [ ] `check-accuracy.mjs` within band (or gap report filed)
- [ ] New `tests/testNNN.mjs` + `tests/durations.json`
- [ ] CHANGELOG + stamp + PR per `AGENTS.md`

## When sourced

- [ ] `CAR_PROFILES[name]` in `src/js/car-profiles.js` (side silhouette)
- [ ] `SUSP_REAL[name]` in `src/js/tyres-brakes-driveline.js` (`{f,r,tf,tr}`)
- [ ] `body.h`, `body.tf`, `body.tr` on the vehicle preset
- [ ] `CAR_ART[name]` + `assets/cars/<slug>.webp` (owner art; `test147`)
- [ ] `assets/cars/manifest.json` entry if that file is maintained for new art
- [ ] New `cat` → `PRESET_CATS` and vehicle picker cats
- [ ] `node tools/class-medians.mjs` if class has ≥3 real cars (`test134`)
- [ ] `node tools/car-prices.mjs` (rewrites `src/js/car-prices.js`)

## Hybrid / electric

Do **not** put these in `VEHICLE_PRESETS` / `PRESETS`. Use
`src/js/electric-presets.js` (`EV_*` or `HYB_*`) and the matching tests
(`test101`, `test103`, `test110`, …). Read `plans/hybrid-electric/` first.
Accuracy bands and motor sizing rules differ; ask the owner before a first EV/hybrid
import if unsure.

## Tests to run

Minimum for a combustion import:

```bash
node tests/run.mjs <new-test> 132 171
# also 134 if class-medians.mjs was run
# also 147 once CAR_ART + WebP exist
```

Name them on the PR `Tests:` line so CI picks them up.
