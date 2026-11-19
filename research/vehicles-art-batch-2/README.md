# Vehicle art batch 2 (~100 showroom pictures)

Pixel-art side views for cars not yet in the factory roster, produced with
`.cursor/skills/vehicle-profile-art/` (S2000 style reference, coastal road, 960×640).

| Path | Contents |
|---|---|
| `cars.json` | Preset-ready name, slug, category, prompt phrase |
| `raw/` | Generator frames (4:3) before crop |
| `car-profiles/` | 960×640 PNG |
| `cars/` | 960×640 WebP (quality 82) |

Do **not** copy into `assets/cars/` until the matching preset and `CAR_ART` entry
exist — orphan WebPs fail `test131`.

```bash
# after a raw frame lands:
node .cursor/skills/vehicle-profile-art/scripts/postprocess.mjs research/vehicles-art-batch-2/raw/<slug>.png \
  --slug <slug> --staging research/vehicles-art-batch-2 --in-place
```
