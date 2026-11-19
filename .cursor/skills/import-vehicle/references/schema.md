# Research / preset schema

Field names match `src/js/vehicle-presets.js` and `src/js/engine-options-presets.js`.
See `research/vehicles-batch-1/vehicles.json` `meta` and any one high-confidence entry
(e.g. Nissan 370Z) as a worked example.

## Top-level (`vehicle.json`)

| Field | Required | Notes |
|---|---|---|
| `id` | yes | kebab-case slug, e.g. `ferrari-f50-1995` |
| `name` | yes | Exact display name, e.g. `Ferrari F50 (1995)` — must be unique in `FACTORY_CARS` |
| `cat` | yes | Existing picker category, or a new one you also add to `PRESET_CATS` |
| `era` | yes | Decade string: `1960s` … `2020s` |
| `role` | yes | Short plain role (for notes) |
| `confidence` | yes | `high` \| `medium` \| `low` |
| `chassis` | yes* | Key of `CHASSIS` (`kei`, `hatch`, `roadster`, `coupe`, `sedan`, `muscle`, `rally`, `gt`, `super`, `hyper`, `proto`, `pickup`, `suv`, `openwheel`). Null only with `chassisSuggestion` |
| `chassisFit` | yes | `good` \| `fair` \| `poor` |
| `chassisNote` | yes | Why this archetype; what fit overrides |
| `engineStatus` | yes | `new` \| `existing` |
| `engine` | yes | Exact `PRESETS` / engine name the vehicle points at |
| `body` | yes | see below |
| `fit` | yes | see below |
| `real` | yes | maker 0–100 / top |
| `gearset` | yes | `{r, fd, src}` — `r`/`fd` may be `null` |
| `enginePreset` | if new | full engine block |
| `engineRevision` | if existing | fields to correct on the shared engine |
| `sources` | yes | `{engine, body, performance}` strings with URLs; optional `gearset`, `fit` |
| `unsure` | yes | array of field names estimated or disputed |
| `note` | recommended | curb/dry, aero rule, market, catalyst, … |

## `body`

| Field | Unit | Notes |
|---|---|---|
| `kg` | kg | Curb with fluids, **no driver**. Never dry. |
| `cd` | — | As-sold Cd (factory spoilers included) |
| `area` | m² | Frontal area |
| `wb` | m | Wheelbase |
| `fWt` | 0–1 | Static front weight share |
| `h` | m | Overall height (CG = `CG_ROOF_RATIO × h` when set) |
| `tf`, `tr` | m | Front/rear track when not in `SUSP_REAL` |
| `engPos` | | `mid` or `rear` when the archetype would put the engine wrong |
| `aero` | | Rare: car-specific aero factor (Radical). Prefer class default |

## `fit`

| Field | Allowed |
|---|---|
| `drive` | `fwd` \| `rwd` \| `awd` |
| `tire` | `eco` \| `street` \| `sport` \| `semi` \| `slick` \| `drag` (EV/hybrid may use `premium`) |
| `tw` | driven-axle tyre width mm (rear on RWD/AWD staggered) |
| `twF` | front width when staggered |
| `ta` | aspect % |
| `wheel` | rim inches |
| `brake` | `steel` \| `slotted` \| `big` \| `carbon` \| `hd` |
| `rotor` | mm |
| `susp` | `comfort` \| `sport` \| `coilover` \| `race` |
| `gears` | 3–10 |
| `gearbox` | `manual` \| `sequential` \| `dct` \| `auto` |
| `diff` | `open` \| `visc` \| `clsd` \| `spool` |
| `tc` | boolean; omit/`false` for pre-TC cars |
| `geoF`, `geoR` | `strut` \| `wishbone` \| `multilink` \| `twist` \| `solid` |
| `aF`, `aR`, `aFl` | usually `none` (Cd already includes factory aero) |

## `real` (vehicle)

| Field | Notes |
|---|---|
| `t100` | 0–100 km/h seconds (not 0–60 mph) |
| `top` | km/h |
| `limited` | true when a governor caps top speed |
| `unit` | engine power unit used in research (`PS` or `hp_SAE`) — informational |

## `enginePreset`

Delta over `DEFAULT_ENGINE`. `real`: `{hp, hpRpm, tq, tqRpm}` with torque in **Nm**.
`real.unit` = `PS` or `hp_SAE`. Convert PS→hp for storage only if the existing presets for
that maker store hp that way — **match neighbouring presets** (batch-1 stores the brochure
number in `hp` and notes the unit).

`engine` common fields: `cylinders`, `layout` (`inline`\|`v`\|`boxer`), `bore_mm`,
`stroke_mm`, `compression`, `redline`, `intake` (`na`\|`turbo`\|`supercharger`),
`boost_bar`, `turboSize`, `turboConfig`, `intercooler`, `injector`, `intakeSys`, `vvt`,
`cam`, `valveSpring`, `exhaust`, `cat`, `airFilter`, `octane`, `radiator`, `oilCooler`,
`tqLimit`, `taperRpm`, `taperPct`, `govRpm` (diesel), `type` (`petrol4`\|`diesel`\|`rotary`\|`twostroke`).

Solve taper after the hardware is in: gentlest `taperPct` from `tqRpm` that meets peak
power. Leave taper off when hardware is already at or under the rating.

## `CAR_DIMS` (implementation)

`{len, w, h, ovF?, tyF, tyR, rimF?, rimR?, src, unsure?}` — metres / tyre strings like
`245/40R17`. `src` e.g. `ad:ferrari-…` or `wp:…`.
