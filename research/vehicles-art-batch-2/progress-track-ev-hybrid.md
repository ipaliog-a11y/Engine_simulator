# Progress: pickup / track / rotary / two-stroke / electric / hybrid

Batch from `cars.json` categories: `pickup`, `track`, `rotary`, `two-stroke`, `electric`, `hybrid`.

- **Target:** 25
- **Done:** 25
- **Fail:** 0
- **Failed slugs:** (none)

Style reference: `assets/car-profiles/honda-s2000-ap1-2000.png` on every GenerateImage call.
Staging only under `research/vehicles-art-batch-2/` (raw / car-profiles / cars / status). No writes to `assets/cars` or `assets/car-profiles`. No commit/push.

## By category

### pickup (2/2)
| slug | status | notes |
|---|---|---|
| chevrolet-colorado-zr2-2017 | done | open bed reads |
| toyota-tacoma-trd-pro-2017 | done | open bed reads |

### track (4/4)
| slug | status | notes |
|---|---|---|
| lotus-3-eleven-2016 | done | |
| radical-rxc-turbo-500-2016 | done | |
| caterham-620-r-2013 | done | cycle wings / exposed wheels |
| ktm-x-bow-r-2011 | done | exposed wheels, carbon tub |

### rotary (3/3)
| slug | status |
|---|---|
| mazda-rx-7-turbo-ii-fc3s-1989 | done |
| mazda-cosmo-type-e-jc-1990 | done |
| mazda-rx-3-1972 | done |

### two-stroke (1/1)
| slug | status |
|---|---|
| wartburg-353-1985 | done |

### electric (7/7)
| slug | status | notes |
|---|---|---|
| porsche-taycan-turbo-s-2020 | done | |
| bmw-i4-m50-2022 | done | |
| nissan-leaf-e-plus-2019 | done | |
| hyundai-ioniq-5-2022 | done | |
| rivian-r1t-2022 | done | open bed reads |
| lucid-air-touring-2022 | done | |
| chevrolet-bolt-euv-2022 | done | |

### hybrid (8/8)
| slug | status |
|---|---|
| honda-nsx-nc1-2017 | done |
| mclaren-p1-2013 | done |
| ferrari-sf90-stradale-2020 | done |
| bmw-i8-2015 | done |
| lexus-lc-500h-2018 | done |
| toyota-prius-xw10-1998 | done |
| honda-cr-z-2011 | done |
| toyota-rav4-hybrid-xa50-2019 | done |

## Pipeline per car

1. GenerateImage (`prompt`, S2000 ref, `4:3`, `<slug>-raw.png`)
2. ffmpeg → `raw/<slug>.png` (artifact lands as `.jpg`)
3. `postprocess.mjs … --staging research/vehicles-art-batch-2 --in-place` → 960×640 PNG+WebP
4. `status/<slug>.done`

## Counts

```
done: 25
fail: 0
failed_slugs: []
```
