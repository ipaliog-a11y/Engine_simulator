# Wiring checklist

After post-process, the app must find the picture by preset name.

## Files

- [ ] `assets/cars/<slug>.webp` — 960×640
- [ ] `assets/car-profiles/<slug>.png` — 960×640 (source twin)
- [ ] No unused WebP left in `assets/cars/` (every file mapped; `test131`)
- [ ] No `CAR_ART` name that is not a factory preset (`test131`)

## `src/js/car-art.js`

- [ ] `CAR_ART['Exact Preset Name'] = '<slug>'` — name matches the preset exactly
- [ ] `CAR_NO[name]` already set by import-vehicle (`max+1`, never reuse)
- [ ] `node tools/build.mjs` so `index.html` carries the map

## Manifests

Add one object under `cars` in **both**:

- `assets/cars/manifest.json` — `"file": "<slug>.webp"`, plus `"source_png": "<slug>.png"`
- `assets/car-profiles/manifest.json` — `"file": "<slug>.png"`

Fields to copy from a neighbour:

```json
"<Exact Preset Name>": {
  "file": "<slug>.webp",
  "name": "<Exact Preset Name>",
  "slug": "<slug>",
  "prompt": "<full prompt>",
  "reference_image": "assets/car-profiles/honda-s2000-ap1-2000.png",
  "generated_size": "<WxH of raw frame>",
  "post_process": "<what postprocess.mjs did>",
  "source_png": "<slug>.png"
}
```

Use the real reference path above for new rows (the historical
`reference/honda-s2000-reference.jpg` is not in the tree).

## Validate

```bash
node .cursor/skills/vehicle-profile-art/scripts/validate-art.mjs "<Exact Preset Name>"
node tools/build.mjs --check
node tests/run.mjs 131
```

## Import-vehicle hand-off

On the import checklist, art is no longer "owner-only blocked" once this skill has
landed the WebP + `CAR_ART` entry. Still leave the PR open if QA rejects the picture.
