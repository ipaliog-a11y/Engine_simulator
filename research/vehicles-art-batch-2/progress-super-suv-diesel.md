# Progress: supercar / perf-suv / diesel

Batch: `research/vehicles-art-batch-2`
Style ref: `assets/car-profiles/honda-s2000-ap1-2000.png`
Output: staging only (no `assets/cars/` writes, no commit)

**Done: 22/22** · **Failed: 0**

| Cat | Slug | PNG | WebP | status |
|---|---|---|---|---|
| supercar | `lamborghini-miura-p400-s-1969` | Y | Y | done |
| supercar | `ferrari-288-gto-1984` | Y | Y | done |
| supercar | `lamborghini-aventador-lp700-4-2011` | Y | Y | done |
| supercar | `ferrari-488-gtb-2015` | Y | Y | done |
| supercar | `pagani-zonda-f-2005` | Y | Y | done |
| supercar | `bugatti-veyron-16-4-2005` | Y | Y | done |
| supercar | `porsche-959-1987` | Y | Y | done |
| supercar | `ferrari-f50-1995` | Y | Y | done |
| supercar | `lamborghini-gallardo-lp560-4-2009` | Y | Y | done |
| supercar | `mclaren-650s-2014` | Y | Y | done |
| supercar | `jaguar-xj220-1992` | Y | Y | done |
| supercar | `honda-nsx-type-s-na2-2002` | Y | Y | done |
| perf-suv | `alfa-romeo-stelvio-quadrifoglio-2018` | Y | Y | done |
| perf-suv | `mercedes-amg-gle-63-s-w166-2015` | Y | Y | done |
| perf-suv | `range-rover-sport-svr-2015` | Y | Y | done |
| perf-suv | `porsche-macan-turbo-95b-2015` | Y | Y | done |
| perf-suv | `jeep-grand-cherokee-trackhawk-2018` | Y | Y | done |
| diesel | `bmw-m550d-f10-2012` | Y | Y | done |
| diesel | `audi-sq7-4-0-tdi-2016` | Y | Y | done |
| diesel | `alfa-romeo-159-2-4-jtdm-q4-2008` | Y | Y | done |
| diesel | `mercedes-benz-g-350-d-2016` | Y | Y | done |
| diesel | `ford-ranger-3-2-wildtrak-2016` | Y | Y | done |

## Notes
- Skipped regenerate for `ferrari-f50-1995` (already status done; open-top spider art present in staging).
- Trackhawk / other SUVs kept exact side elevation (prompt stem).
- Raw generator frames are JPEG bytes saved as `.png` filenames under `raw/` (same as rest of batch); postprocess accepts them.
- Generated via Cursor GenerateImage 4:3 + classic 1152×864 → 960×640 crop.
