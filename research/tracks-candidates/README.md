# Real-circuit candidates (beyond the 22)

Research only. Nothing in `tracks/real-circuits.js` or `tools/import-real-tracks.mjs` was
changed. A later session imports from `candidates.json` and re-runs `test65`.

## Quality bar (same as build 123)

Every shipped real circuit needs all three:

| Piece | Source used today | Why |
|---|---|---|
| Centreline + **measured** left/right width | TUMFTM/racetrack-database (LGPL-3.0) | Width drives the racing line; modelled width is not this tier |
| Geographic reference | bacinger/f1-circuits (MIT) or OSM `highway=raceway` (ODbL) | Rigid fit of TUM metres onto lon/lat (RMS ≤ 15 m) |
| Elevation | OpenTopoData: EU-DEM 25 m / USGS NED 10 m / SRTM 30 m | Vertical curvature for crests and compressions |

GPX-only or centreline-only (bacinger / track-atlas without a measured surface) is **not** the
same quality: the app already accepts user GPX, and those imports mark width as unknown.

`node research/tracks-candidates/validate.mjs` checks `candidates.json`.

## Tier A — drop into the existing importer

TUM still has three CSVs the app never pulled. Moscow and Oschersleben have OSM raceway ways
in a bbox (same path as Brands Hatch / Indy oval). Norisring is a street circuit: OSM stores it
as relation `1889538` (`type=circuit`) whose members are ordinary roads, not `highway=raceway`,
so the current OSM fetch returns nothing until the importer accepts a relation or a local GeoJSON.

| key | TUM file | Official length | TUM length | Width (TUM) | geo | dem | Place |
|---|---|---|---|---|---|---|---|
| `moscow` | MoscowRaceway | 3.931–4.070 km (layout-dependent; TUM ≈ full) | 4063 m | 9.7–19.5 m | OSM bbox | srtm30m | Volokolamsk, Russia |
| `oschersleben` | Oschersleben | 3.696 km (GP) | 3692 m (−0.1 %) | 8.4–16.3 m | OSM bbox | eudem25m | Oschersleben, Germany |
| `norisring` | Norisring | ~2.300 km | 2296 m | 10.3–21.0 m | OSM relation 1889538 (needs importer change) | eudem25m | Nuremberg, Germany |

Paste the `import` objects from `candidates.json` into `CIRCUITS` in
`tools/import-real-tracks.mjs`, then:

```
node tools/import-real-tracks.mjs --only moscow,oschersleben
```

After import: bump `test65`'s expected count (22 → 24 or 25), add English blurbs through `tr()`,
and set `TRACK_ROAD_OF` if the surface is not the default smooth GP asphalt (Norisring and older
German circuits are closer to `bumpy`).

## Tier B — measured edges, new adapter

[tobi/track-atlas](https://github.com/tobi/track-atlas) (MIT code; ODbL for OSM-derived geometry)
publishes left/right edges and a derived midline measured from open orthoimagery (NAIP / state
orthos / IGN), registered to lidar. That is the same *kind* of measured width as TUM, but not the
same CSV schema: the importer must turn edge polylines into per-station `w_right` / `w_left` (or
total width), skip the TUM↔geo rigid fit (geometry is already WGS84), then still sample DEM heights.

Already covered by TUM in the app: COTA. The Indy **oval** is in the app; track-atlas’s
Indianapolis layout is the **road course** (different circuit).

Recommended first (seen-both ≥ ~60 %, CE95 ≲ 1.6 m):

| key | track-atlas id / layout | Midline length | Width p05–p95 (med) | Seen both | CE95 | dem |
|---|---|---|---|---|---|---|
| `daytona` | daytona / gp | 5741 m | 9.1–19.0 (12.5) | 86 % | 0.80 m | ned10m |
| `lime_rock` | lime-rock / gp | 2369 m | 8.8–14.0 (11.7) | 91 % | 0.33 m | ned10m |
| `laguna` | laguna-seca / gp | 3600 m | 10.4–19.1 (13.0) | 80 % | 1.54 m | ned10m |
| `vir` | virginia-international-raceway / gp | 5260 m | 9.4–13.5 (10.9) | 80 % | 1.26 m | ned10m |
| `indy_road` | indianapolis / gp | 3904 m | 14.2–22.2 (14.5) | 75 % | 0.37 m | ned10m |
| `lemans` | circuit-de-la-sarthe / 24h | 13643 m | 8.5–18.1 (11.9) | 70 % | 1.44 m | eudem25m |
| `road_atlanta` | road-atlanta / gp | 4084 m | 11.9–17.0 (12.5) | 61 % | 1.06 m | ned10m |

(Exact percentiles are in `candidates.json`.)

Hold (large bridged / unseen edge share — width invents stretches):

| key | id | Seen both | Note |
|---|---|---|---|
| `sebring` | sebring / imsa | 44 % | Tree shadow; many bridged spans |
| `watkins` | watkins-glen / gp | 36 % | Same |
| `long_beach` | long-beach / gp | 10 % | Street furniture; not ready |

## Rejected for this quality bar

- **bacinger/f1-circuits alone** (Monaco, Imola, Singapore, Jeddah, Miami, Las Vegas, Baku, …):
  lon/lat centreline only, no measured width.
- **f1tenth_racetracks**: TUM geometry downscaled 1:10 with a fixed 2.20 m width.
- **Oversteer TrackAlign API**: centreline + width for many layouts, but commercial / keyed; not
  the open three-source pipeline.
- **User GPX / Nordschleife path**: geometry yes, surveyed width no (Nord already ships with
  modelled width and says so in its blurb).

## Suggested import order

1. `oschersleben`, `moscow` (Tier A, no tool change).
2. Importer: OSM relation or local GeoJSON → then `norisring`.
3. New `import-track-atlas.mjs` (or a `--source=atlas` mode) → Daytona, Lime Rock, Laguna, VIR,
   then Le Mans / Indy road / Road Atlanta.
4. Revisit Sebring / Watkins Glen only if edge coverage improves upstream.
