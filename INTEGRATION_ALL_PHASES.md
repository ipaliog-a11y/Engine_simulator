# Pixel Engine Sim — Complete Implementation Guide (Phases 1 + 2 + 3)

This bundle contains the complete, production-ready drop-in upgrade for `ipaliog-a11y/Engine_simulator`:
- **Phase 1 — Sprite-Stacked Cars & 100-Car Batch Pipeline:**
  - `src/js/car-stacks.js` — Classic script (`file://`-safe, zero dependencies): hybrid renderer using **continuous floating-point live slice stacking** at close/mid zoom (`cam.scale >= 5.5`) for 0° angular stepping, pre-dilated single 1px outer silhouette, and smooth continuous Ackermann Z-interleaved front-wheel steering, plus a lazy 64-heading 1-blit atlas at far overview zoom (24-car LRU cache), twin headlamp beams, twin brake/taillights + CHMSL + wet/night red asphalt wash, and automatic fallback to `drawCar` for unsheeted/custom cars.
  - `assets/cars/stacks/<slug>.png` + `<slug>.check.png` + `manifest.json` + `prompts.json` (all 100 cars in 10-car batches).
  - `tools/generate-stack-prompts.mjs` & `tools/slice-cars.mjs` (zero-dependency Node CLIs).
- **Phase 2 — Mode B Tiled Track Renderer, 3D Props & Smooth Cameras:**
  - `src/js/track-scene-v2.js` — Chunked/tiled Mode B world cache (`160m × 160m` tiles @ `4 px/m`, 24-tile LRU cap — works from 1 km club circuits up to 20 km Nordschleife/GPX without large canvas allocations), 3D voxel-stacked trees/tire walls/grandstands/pit buildings/gantry, unified back-to-front painter's sort, batched smoke & spray particles, and critically damped **Follow** (locked north-up `sceneFollow`) & **Chase** (`sceneChase`) camera springs.
- **Phase 3 — 1-Command Installer & Verification Suite:**
  - `tools/apply-sprite-stack-upgrade.mjs` — Idempotently patches `src/shell.html`, `src/js/track-view.js`, and `src/js/race-tab.js`, syncs `CAR_STACKS`, and rebuilds `index.html`.
  - `tests/test-sprite-stacks.mjs` — Verifies JS syntax, every strip PNG's `width % slices === 0`, `shell.html` wiring, and `tools/build.mjs --check`.

## Quick Install (2 Commands)
1. Unzip this archive into the root of your `Engine_simulator` repository.
2. Run:
   ```bash
   node tools/apply-sprite-stack-upgrade.mjs
   node tests/test-sprite-stacks.mjs
   ```

## Adding Remaining Cars (Batches 1–10)
1. Copy prompts for any 10-car batch from the **Implementation** tab (or run `node tools/generate-stack-prompts.mjs --batch 2`).
2. Drop the generated `<slug>.views.png` sheets into the **Implementation** tab to batch-slice & inspect all 4 turntable angles.
3. Export the updated ZIP (or copy the new `<slug>.png` + `manifest.json` into `assets/cars/stacks/`), then run:
   ```bash
   node tools/slice-cars.mjs --sync
   node tools/build.mjs
   ```
