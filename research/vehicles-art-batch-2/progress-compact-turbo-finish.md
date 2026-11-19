# Progress: compact-turbo finish

**done:** 10  
**fail:** 0  
**failed_slugs:** (none)  
**skipped (already had webp):** hyundai-i30-n-performance-2018  
**regenerated (facing right):** ford-escort-rs-cosworth-1992 (1 regen → left)

## compact-turbo remaining (10/10)

| slug | status | notes |
|------|--------|-------|
| hyundai-i30-n-performance-2018 | done | skipped — webp + status already present |
| renault-clio-rs-200-cup-2013 | done | left-facing, Liquid Yellow |
| mini-jcw-f56-2015 | done | left-facing; chili red / black roof |
| peugeot-208-gti-by-ps-2015 | done | left-facing; Coupe Franche two-tone |
| seat-leon-cupra-300-2017 | done | left-facing; Desire Red |
| ford-escort-rs-cosworth-1992 | done | regen once (first faced right); whale-tail |
| audi-s1-2014 | done | left-facing; Misano Red |
| mazda3-mps-2007 | done | left-facing; hood scoop + spoiler |
| volkswagen-polo-gti-6c-2015 | done | left-facing; tornado red |
| honda-civic-type-r-fl5-2022 | done | left-facing; Championship White + wing |

## Outputs (staging only)

Per slug under `research/vehicles-art-batch-2/`:

- `raw/<slug>.png` (JPEG bytes from GenerateImage, classic 1152×864)
- `car-profiles/<slug>.png` (960×640)
- `cars/<slug>.webp` (960×640, q=82)
- `status/<slug>.done`

No writes to `assets/cars/`. No commit.

## Method

- Prompt from `cars.json`; `GenerateImage` with S2000 reference, `aspect_ratio=4:3`
- Copy artifact → `raw/<slug>.png`
- `node .cursor/skills/vehicle-profile-art/scripts/postprocess.mjs … --staging … --in-place`
- Set `status: done` in `cars.json` (status field only)
