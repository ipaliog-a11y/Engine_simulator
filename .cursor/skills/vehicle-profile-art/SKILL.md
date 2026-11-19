---
name: vehicle-profile-art
description: >-
  Create the 960x640 pixel-art showroom side view for a factory car (e.g. "generate
  art for the F50", "make the showroom picture", "add the car profile image"). Pairs
  with import-vehicle: same coastal-road style as assets/cars/, prompt + post-process
  + CAR_ART wiring. Use whenever a new real-car preset needs its picture, or when the
  user asks for vehicle profile / showroom art.
---

# Vehicle profile (showroom) art

Make the factory showroom picture for one real car: a **960×640** WebP side view facing
**left**, same coastal road and pixel style as the Honda S2000 reference. Pictures are
pictures only — **no number in the sim comes from them**. Live views still use
`drawCarSprite`. Follow `AGENTS.md`.

Pairs with `.cursor/skills/import-vehicle/`. Import writes the preset; this skill ships
the art that `CAR_ART` and `test131` / `test147` require.

## Hard rules (never break)

1. **Match the existing set.** Same style, framing, coastal scene, left-facing side
   elevation. Do not invent a new look, background, or camera angle.
2. **Style reference is the S2000.** Always pass
   `assets/car-profiles/honda-s2000-ap1-2000.png` (or the WebP twin) as the image
   reference. The old path `reference/honda-s2000-reference.jpg` is not in the tree.
3. **Exact model and generation.** Year, body style, and distinctive cues in the prompt.
   Factory appearance only — no aftermarket wings, wrap, or race livery unless that trim
   left the factory that way.
4. **No text, logos, or watermarks** in the image (badges painted as tiny colour blobs are
   fine if they stay unreadable).
5. **Do not claim the car is merge-ready** until `assets/cars/<slug>.webp` exists,
   `CAR_ART[name]` points at it, and `test131` (and `test147` if the showcase is in play)
   would pass for that car.
6. **Never hand-edit `index.html`.** Edit `src/js/car-art.js`, then `node tools/build.mjs`.

## What to produce

| Output | Path |
|---|---|
| Showroom WebP (required) | `assets/cars/<slug>.webp` — 960×640, quality ~82 |
| Source PNG (keep) | `assets/car-profiles/<slug>.png` — same pixels, lossless |
| Manifest rows | `assets/cars/manifest.json` and `assets/car-profiles/manifest.json` |
| Map entry | `CAR_ART['Exact Preset Name'] = '<slug>'` in `src/js/car-art.js` |

Slug: lowercase kebab, make–model–code–year, matching neighbours
(e.g. `ferrari-f40-1987`, `honda-s2000-ap1-2000`). Preset **name** must match
`VEHICLE_PRESETS` / EV / HYB exactly.

## Workflow

### 0. Resolve the car

Need the exact preset `name`, year/trim, and body class (hatch, coupe, open-wheeler, …).
If the preset is not in the game yet, finish **import-vehicle** research/presets first (or
run both in one PR). If `CAR_ART` already has the name, stop unless the user asked for a
redraw.

### 1. Write the car-specific phrase

One sentence fragment after `of a `, before `. Accurate body…`. Include year, make, model,
generation/code, body type, 3–6 distinctive visual cues, and a factory paint colour.

```bash
node .cursor/skills/vehicle-profile-art/scripts/build-prompt.mjs \
  --phrase "1987 Ferrari F40 mid-engined supercar, tall rear wing, triple taillights, gated vents on the rear haunches, Rosso Corsa red paint"
```

Full prompt rules and the fixed stem: `references/prompt-template.md`.

### 2. Generate

**Preferred (agent):** Cursor `GenerateImage` with:

- `description` = the full prompt from step 1
- `reference_image_paths` = `["assets/car-profiles/honda-s2000-ap1-2000.png"]`
- `aspect_ratio` = `"4:3"` (tool has no 3:2; post-process crops)

**Fallback (owner):** same prompt in Grok Imagine with the S2000 attached as style
reference (how the original 100 were made). Save the raw output, then post-process.

Regenerate rather than heavy retouch if the car faces the wrong way, sits in a different
scene, or looks like the S2000. Light retouch is OK only for stray badges/text (see
Viper note in `assets/cars/README.md`).

### 3. Post-process to 960×640

```bash
node .cursor/skills/vehicle-profile-art/scripts/postprocess.mjs \
  /path/to/raw.png \
  --slug ferrari-f40-1987
```

Writes `assets/car-profiles/<slug>.png` and `assets/cars/<slug>.webp`. Uses the classic
Grok crop when the input is ~1152×864; otherwise centre-crops to 3:2, then nearest-neighbour
scale to 960×640. Details: `references/postprocess.md`.

### 4. Wire into the app

1. `CAR_ART[name] = '<slug>'` in `src/js/car-art.js` (near the other entries)
2. Append both manifest `cars` entries (copy shape from a neighbour; include `prompt`)
3. `node tools/build.mjs`
4. Validate:

```bash
node .cursor/skills/vehicle-profile-art/scripts/validate-art.mjs "<Exact Preset Name>"
```

Checklist: `references/wiring.md`. QA eye-check: `references/qa-checklist.md`.

### 5. Tests for the import PR

When this art lands with a new car:

```bash
node tests/run.mjs 131 147
# plus the car's own test from import-vehicle
```

Name `131` (and `147` if showcase-touched) on the PR `Tests:` line.

## Output to the user

Always end with:

1. **Slug** and **preset name**
2. **Where files landed** (WebP + PNG + `CAR_ART`)
3. **Prompt** used (or path in the manifest)
4. **QA notes** — anything approximate (open-wheel enclosure, wrong generation cues, …)
5. If generation failed or was owner-only: the **ready-to-paste prompt** and open items

## Progressive disclosure

- Prompt stem + phrase rules → `references/prompt-template.md`
- Crop / WebP steps → `references/postprocess.md`
- `CAR_ART` + manifests → `references/wiring.md`
- Visual acceptance → `references/qa-checklist.md`
