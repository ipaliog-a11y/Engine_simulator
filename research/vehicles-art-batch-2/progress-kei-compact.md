# Progress: kei-city + compact-turbo

Agent batch for categories `kei-city` and `compact-turbo` from `cars.json`.

- Style reference: `assets/car-profiles/honda-s2000-ap1-2000.png`
- Staging only (`research/vehicles-art-batch-2/{raw,car-profiles,cars,status}`)
- No commit / no push

## Summary

| Metric | Count |
|--------|------:|
| Target | 18 |
| Done | 18 |
| Failed | 0 |

## Done slugs

### kei-city (7)

- autozam-az-1-1992
- daihatsu-copen-l880k-2002
- mitsubishi-minica-dangan-zz-1990
- subaru-vivio-rx-r-1992
- daihatsu-mira-tr-xx-avanzato-r-1997
- abarth-595-competizione-2015
- renault-twingo-rs-133-2008

### compact-turbo (11)

- volkswagen-golf-r-mk7-2015
- hyundai-i30-n-performance-2018
- renault-clio-rs-200-cup-2013
- mini-jcw-f56-2015
- peugeot-208-gti-by-ps-2015
- seat-leon-cupra-300-2017
- ford-escort-rs-cosworth-1992
- audi-s1-2014
- mazda3-mps-2007
- volkswagen-polo-gti-6c-2015
- honda-civic-type-r-fl5-2022

## Failures

None.

## QA notes

- All generations accepted on first pass (left-facing, coastal S2000-style scene).
- `mitsubishi-minica-dangan-zz-1990`: raw has readable “turbo” lettering on the door; light retouch before merge if needed.
- Status markers: `status/<slug>.done` plus `cars.json` status updated under flock.
