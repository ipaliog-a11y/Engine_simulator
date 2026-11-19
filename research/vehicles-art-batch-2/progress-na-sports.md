# na-sports art batch progress

Category: `na-sports` (16 cars)
Style reference: `assets/car-profiles/honda-s2000-ap1-2000.png`
Outputs under `research/vehicles-art-batch-2/` only (not `assets/cars/` / `assets/car-profiles/`).

## Result

| Metric | Count |
|--------|------:|
| Done | 16 |
| Failed | 0 |
| Regenerated (wrong facing) | 0 |

## Cars

| Slug | Status | Notes |
|------|--------|-------|
| nissan-silvia-spec-r-s15-1999 | done | left-facing |
| toyota-mr2-aw11-1985 | done | left-facing, T-top |
| alpine-a110-pure-2018 | done | left-facing |
| honda-civic-type-r-ep3-2001 | done | left-facing, rear wing |
| bmw-m3-e92-2008 | done | left-facing |
| porsche-911-carrera-2-964-1990 | done | left-facing |
| datsun-240z-s30-1970 | done | left-facing |
| alfa-romeo-4c-2015 | done | left-facing |
| caterham-seven-420r-2016 | done | left-facing; cycle wings + open cockpit |
| mazda-mx-5-nb-1998 | done | left-facing; soft top down / open cockpit |
| honda-prelude-type-s-bb6-1997 | done | left-facing |
| toyota-86-zn6-2012 | done | left-facing |
| bmw-z4-m-coupe-e86-2006 | done | left-facing |
| lotus-exige-s-240-2008 | done | left-facing |
| porsche-boxster-s-986-2000 | done | left-facing; soft top down / open cockpit |
| aston-martin-v8-vantage-2005 | done | left-facing |

## Pipeline per car

1. `GenerateImage` with full `prompt` + S2000 reference, `aspect_ratio=4:3`
2. Copy raw from `/opt/cursor/artifacts/assets/<slug>-raw.jpg` → `raw/<slug>.png`
3. `postprocess.mjs … --staging research/vehicles-art-batch-2 --in-place`
4. `status/<slug>.done` + `cars.json` status `done`

No commit/push (per batch instructions).
