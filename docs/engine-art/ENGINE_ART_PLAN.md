# Engine designer art upgrade: modular 8-bit engine picture

## Goal
Replace the ENGINE tab's basic engine preview (`drawEngineSprite` in `src/js/sprites.js`, `#enginePreview`) with a richer 8-bit pixel-art engine that matches the car art in `assets/cars/` (shaded colour ramps, dark outlines, light from the top-left). It must stay modular: the picture is composed from the engine designer choices, and every combination the form allows must render.

## What is there today (main @ b8ea42f, Build 222)
- `PixBuf` cell grid (`sprites.js:12-49`), 150x78 grid (`ENG_GW/ENG_GH`, `:265`), upscaled with integer nearest-neighbour by `fitPixCanvas`; `pixBackdrop`, `pixCaption`, `shadeHex`. Colours are hex literals, there is no palette.
- `drawEngineSprite(buf,e,t)` `sprites.js:269-443`. Inline = side view, rotary = side view, V/boxer = front view with a fixed bank angle, and **cylinder count is ignored for V/boxer** (a V6, V8 and V12 look the same). Bolt-ons hang off computed anchors (top/left/right/exX/exY/pulley).
- Re-rendered every frame from `stepPreviews` -> `renderEnginePreview` using `readEngineFromForm()`; a new canvas is created each frame. The clock is `previewT` (wall time, not rpm), and the preview honours reduced motion.
- Also used by garage thumbnails (`saves-garage.js:205-228`, `toDataURL`) and `tests/test64.mjs:70-115`.
- Electric uses `drawMotorSprite` (`electric-ui.js:484`). The LIVE tab cutaway (`src/js/engine-view.js`) already computes crankAngle / turboAngle / scAngle and per-cylinder phase (`FIRING_ORDER`, `cylPhase`).

## Option matrix that must be covered
type (petrol4, diesel, twostroke, rotary, electric); cylinders 1,2,3,4,5,6,8,10,12 (2-stroke up to 6, rotary 1-4 rotors); layout inline / v / boxer; bore / stroke / ecc; intake na / turbo / supercharger; turboSize S/M/L, turboConfig single / twin / sequential / compound, vgt, antilag; scType roots / screw / centrifugal; intercooler none / small / large; intakeSys carb1 / carb2 / carb4 / sidedraft / mech / efi / itb; airFilter; exhaust and cat; cam and vvt; radiator, oilCooler, nitrous, fuel.
Not shown today but should be if cheap: valves (2/4/5, via cover style: pushrod vs twin-cam), fan, alternator, hybrid motor (p2 / ps / series).

## Chosen approach: hybrid (code for the parts that vary, authored sprites for the showpiece parts)
1. **One camera for every layout**: a front three-quarter oblique view. Each cylinder steps by a fixed integer offset (e.g. +6x, -3y). Inline = one diagonal row; V = two banks leaning out; boxer = two flat, horizontally opposed banks. Cylinders must be countable in every layout. Rotary and two-stroke get their own block pieces.
2. **Grid** of about 240x144 cells (close to the car art's effective pixel density), still drawn through PixBuf and upscaled with integer nearest-neighbour. Keep the caption row.
3. **Shared palette** `src/js/engine-art-palette.js`: 4-5 step ramps per material (cast iron, alloy, chrome, rubber/black, cam cover stock / sport / race / atkinson, diesel, header heat steps, coolant blue, intercooler silicone), sampled from the car art. No more scattered hex literals.
4. **Procedural toolkit in code** for the parts that repeat or stretch: block segments per cylinder (width from bore, height from stroke), heads, cam covers (pushrod vs twin-cam by valves), plenum and runners, header primaries and pipes routed between anchors, fins, bolt rows, dithering.
5. **Authored sprites (about 40-60)** for the showpiece parts: turbo snail (S/M/L) with 4 compressor-wheel frames plus VGT ring, Roots and screw blowers with belt frames, centrifugal head unit, carbs 1/2/4, sidedraft, ITB trumpets, air filters, intercooler S/L, radiator S/stock/L, fan frames, oil cooler, nitrous bottle, alternator, hybrid motor, cover end caps. Use `docs/engine-art/concepts/` as the style target. Pipeline: Grok-style art or hand-authored PNG in `assets/engine-parts/` -> `tools/engine-art.mjs` downscales nearest-neighbour, reduces to the palette, and emits `src/js/engine-art-data.js` with palette-index, run-length rows + anchors + frames. **Do not load images at runtime**: the game runs from file://, a drawn image would taint the canvas and break `toDataURL` in garage thumbnails and tests, and AGENTS.md requires a single classic script with no fetch/modules. Palette indices also give free recolours (cam colours, diesel, heat glow).
6. **Composer** `src/js/engine-art.js`: `composeEngine(e) -> layers[{part,x,y,z,anim}]` driven by a declarative per-layout manifest (slots for block x n, heads, covers, valley/top intake, side exhaust, front accessories, rear turbo positions). `drawEngineArt(buf,e,t,rpm)` paints layers back to front. `drawEngineSprite` becomes a thin wrapper so `paintEngine`, `garageThumb` and tests keep the same entry point.
7. **Animation**: frame = floor(angle / 2pi * frames). On the ENGINE tab, run a gentle idle-to-redline sweep on `previewT`; where live rpm exists, reuse the crank, turbo and supercharger angles from `engine-view.js`. Optional small per-cylinder piston windows using `cylPhase`/`FIRING_ORDER` that flash on firing; headers glow with exhaust temperature (reuse `vizTempCol`). Keep honouring reduced motion.
8. **Performance**: cache the static layers per config key in an offscreen buffer and redraw only the animated parts each frame; stop creating a new canvas every frame.

## Delivery steps (one PR is fine; stage commits in this order)
1. Lock camera, grid and palette; add palette + toolkit.
2. Block, head and cover per layout, so V6 / V8 / V12 and boxer 2 / 4 / 6 are all visually distinct; two-stroke and rotary pieces.
3. Intake / exhaust routing between anchors.
4. Showpiece sprites + `tools/engine-art.mjs` conversion + generated data file.
5. Animation and static-layer cache.
6. Add the options not shown today (valves via cover style, fan, alternator, hybrid motor).
7. Tests: update `tests/test64.mjs` for the new grid / colours, and add checks that V6 / V8 / V12 differ, boxer 4 / 6 differ, every option combination draws, and turbo / supercharger change the picture. Keep the garage thumbnail working.
8. Follow AGENTS.md: one build number for the PR, a CHANGELOG entry, `build.mjs --check`, CI green.

## Concept images (style direction only, not assets)
In `docs/engine-art/concepts/`:
- `concept-1-inline4-na.jpg`: inline-4, red twin-cam cover, headers. Target look and camera angle.
- `concept-2-v8-roots-supercharger.jpg`: V8 with a Roots blower in the valley, glowing headers.
- `concept-3-turbo-intercooler-NOT-boxer.jpg`: turbo snail, top-mount intercooler and blue silicone hoses. Use it for the turbo and intercooler look only: it came out as a V engine, not a boxer.
- `concept-4-parts-sheet.jpg`: the modular parts idea: turbo, Roots blower, carb, ITBs, intercooler, radiator with fan, nitrous, alternator, valve cover, block segment, headers.
- `current-engine-preview.png`: how the preview looks today.
The concepts are more detailed than the in-game grid can hold. Simplify them to the grid and palette rather than copying them.
