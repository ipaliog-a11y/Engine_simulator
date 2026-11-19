# Vehicle research, batch 2 — next 100 (shortlist)

Research queue only. Nothing in `src/js/vehicle-presets.js`, `src/js/engine-options-presets.js`,
or `src/js/electric-presets.js` is changed by this pack. Later sessions turn each wave into full
`research/vehicles/<id>/vehicle.json` research, then into factory presets.

`node research/vehicles-batch-2/validate.mjs` checks `queue.json` (count, uniqueness, categories,
chassis keys, no collision with current `FACTORY_CARS`).

## What this batch is for

The game already has **100** factory cars. Batch 1 filled SUVs, track, pickups, older eras, and
V6s. This shortlist is the next **100** nameplates: interesting gaps, still inside existing
picker categories, and chosen because maker press / Autodata-class sources exist for an honest
import.

Hybrids and electrics are in the queue (unlike batch 1) and must use the
`electric-presets.js` / hybrid path, not the combustion tables.

## Selection rules

- Stay inside existing `FACTORY_CAR_CATS` / `PRESET_CATS` — **no new category**.
- Prefer cars with published curb mass, power, 0–100, and usually gear ratios.
- Avoid mild-hybrid / 48V traps; pin a pre-48V model year when researching.
- Skip badge twins already covered (e.g. Subaru BRZ vs GR86).
- Derive and cite; never invent gear ratios, curb mass, Cd, or power.

## Mix vs current roster

| Category | Now | +This queue | Why |
| --- | ---: | ---: | --- |
| Kei & City | 6 | 7 | Mid-engine and turbo kei icons |
| Compact Turbo | 7 | 11 | Hot-hatch depth; first Korean combustion |
| NA Sports | 21 | 16 | Icons, Alpine, light cars |
| Turbo Performance | 13 | 12 | Missing GT-R gens, Celica GT-Four, STI GC8 |
| American V8 | 6 | 7 | Classic + modern muscle |
| Supercar | 22 | 12 | Era holes without overloading |
| Performance SUV | 4 | 5 | Non-German + Macan class |
| Diesel | 7 | 5 | Performance diesels + Ranger |
| Pickup | 1 | 2 | Gas pickups (diesels stay Diesel) |
| Track | 2 | 4 | More proto / open-wheel-adjacent |
| Rotary | 2 | 3 | FC RX-7, Cosmo 20B, RX-3 |
| Two-Stroke | 1 | 1 | Second two-stroke car |
| Electric | 3 | 7 | Break the Tesla-only set |
| Hybrid | 5 | 8 | Performance + daily hybrids |

## The 100

| | Car | Cat | Chassis | Path | Wave | Conf. |
| --- | --- | --- | --- | --- | ---: | --- |
| 1 | Autozam AZ-1 (1992) | Kei & City | kei | combustion | 3 | medium |
| 2 | Daihatsu Copen (L880K, 2002) | Kei & City | roadster | combustion | 3 | high |
| 3 | Mitsubishi Minica Dangan ZZ (1990) | Kei & City | kei | combustion | 3 | medium |
| 4 | Subaru Vivio RX-R (KK4, 1992) | Kei & City | kei | combustion | 3 | medium |
| 5 | Daihatsu Mira TR-XX Avanzato R (1997) | Kei & City | kei | combustion | 3 | medium |
| 6 | Abarth 595 Competizione (2015) | Kei & City | kei | combustion | 1 | high |
| 7 | Renault Twingo R.S. 133 (2008) | Kei & City | hatch | combustion | 3 | high |
| 8 | VW Golf R (Mk7, 2015) | Compact Turbo | rally | combustion | 1 | high |
| 9 | Hyundai i30 N Performance (PD, 2018) | Compact Turbo | hatch | combustion | 1 | high |
| 10 | Renault Clio R.S. 200 Cup (2013) | Compact Turbo | hatch | combustion | 1 | high |
| 11 | Mini John Cooper Works (F56, 2015) | Compact Turbo | hatch | combustion | 1 | high |
| 12 | Peugeot 208 GTi by Peugeot Sport (2015) | Compact Turbo | hatch | combustion | 1 | high |
| 13 | SEAT León Cupra 300 (2017) | Compact Turbo | hatch | combustion | 1 | high |
| 14 | Ford Escort RS Cosworth (1992) | Compact Turbo | rally | combustion | 1 | medium |
| 15 | Audi S1 (8X, 2014) | Compact Turbo | rally | combustion | 1 | high |
| 16 | Mazda3 MPS (BK, 2007) | Compact Turbo | hatch | combustion | 1 | medium |
| 17 | VW Polo GTI (6C, 2015) | Compact Turbo | hatch | combustion | 1 | high |
| 18 | Honda Civic Type R (FL5, 2022) | Compact Turbo | hatch | combustion | 1 | high |
| 19 | Nissan Silvia Spec-R (S15, 1999) | NA Sports | coupe | combustion | 1 | high |
| 20 | Toyota MR2 (AW11, 1985) | NA Sports | roadster | combustion | 1 | high |
| 21 | Alpine A110 Pure (2018) | NA Sports | super | combustion | 1 | high |
| 22 | Honda Civic Type R (EP3, 2001) | NA Sports | hatch | combustion | 1 | high |
| 23 | BMW M3 (E92, 2008) | NA Sports | coupe | combustion | 1 | high |
| 24 | Porsche 911 Carrera 2 (964, 1990) | NA Sports | super | combustion | 1 | high |
| 25 | Nissan Fairlady Z 240Z (S30, 1970) | NA Sports | coupe | combustion | 1 | medium |
| 26 | Alfa Romeo 4C (2014) | NA Sports | super | combustion | 1 | high |
| 27 | Caterham Seven 420R (2015) | NA Sports | roadster | combustion | 1 | medium |
| 28 | Mazda MX-5 (NB, 1998) | NA Sports | roadster | combustion | 1 | high |
| 29 | Honda Prelude Type S (BB6, 1997) | NA Sports | coupe | combustion | 1 | medium |
| 30 | Toyota 86 (ZN6, 2012) | NA Sports | coupe | combustion | 1 | high |
| 31 | BMW Z4 M Coupé (E86, 2006) | NA Sports | coupe | combustion | 1 | high |
| 32 | Lotus Exige S (240, 2006) | NA Sports | super | combustion | 1 | medium |
| 33 | Porsche Boxster S (986, 2000) | NA Sports | roadster | combustion | 1 | high |
| 34 | Aston Martin V8 Vantage (4.3, 2005) | NA Sports | gt | combustion | 2 | medium |
| 35 | Nissan Skyline GT-R (R32, 1989) | Turbo Performance | coupe | combustion | 1 | high |
| 36 | Nissan Skyline GT-R V-spec (R33, 1995) | Turbo Performance | coupe | combustion | 1 | high |
| 37 | Toyota Celica GT-Four (ST205, 1994) | Turbo Performance | rally | combustion | 1 | high |
| 38 | Subaru Impreza WRX STI (GC8, 1998) | Turbo Performance | rally | combustion | 1 | high |
| 39 | Mitsubishi Lancer Evolution VI Tommi Mäkinen (2000) | Turbo Performance | rally | combustion | 1 | high |
| 40 | Toyota Supra (A90, 2020) | Turbo Performance | coupe | combustion | 1 | high |
| 41 | BMW M4 Competition (F82, 2016) | Turbo Performance | coupe | combustion | 1 | high |
| 42 | Mercedes-AMG C63 S (W205, 2015) | Turbo Performance | sedan | combustion | 1 | high |
| 43 | Audi RS4 Avant (B7, 2006) | Turbo Performance | sedan | combustion | 1 | high |
| 44 | Porsche 911 Turbo (996, 2001) | Turbo Performance | super | combustion | 2 | high |
| 45 | Mitsubishi 3000GT VR-4 (1994) | Turbo Performance | coupe | combustion | 2 | medium |
| 46 | Subaru Legacy GT (BL5, 2005) | Turbo Performance | sedan | combustion | 2 | medium |
| 47 | Chevrolet Camaro SS 1LE (2018) | American V8 | muscle | combustion | 1 | high |
| 48 | Ford Mustang Shelby GT350 (2016) | American V8 | muscle | combustion | 1 | high |
| 49 | Dodge Charger R/T (1969) | American V8 | muscle | combustion | 2 | medium |
| 50 | Chevrolet Corvette Stingray (C3, 1969) | American V8 | coupe | combustion | 2 | medium |
| 51 | Pontiac GTO (1966) | American V8 | muscle | combustion | 2 | medium |
| 52 | Chevrolet Corvette C5 Z06 (2001) | American V8 | coupe | combustion | 1 | high |
| 53 | Cadillac CTS-V (2009) | American V8 | sedan | combustion | 2 | high |
| 54 | Lamborghini Miura P400 S (1969) | Supercar | super | combustion | 2 | medium |
| 55 | Ferrari 288 GTO (1984) | Supercar | hyper | combustion | 2 | medium |
| 56 | Lamborghini Aventador LP700-4 (2011) | Supercar | super | combustion | 2 | high |
| 57 | Ferrari 488 GTB (2015) | Supercar | super | combustion | 2 | high |
| 58 | Pagani Zonda F (2005) | Supercar | hyper | combustion | 2 | low |
| 59 | Bugatti Veyron 16.4 (2005) | Supercar | hyper | combustion | 2 | low |
| 60 | Porsche 959 (1986) | Supercar | super | combustion | 2 | medium |
| 61 | Ferrari F50 (1995) | Supercar | hyper | combustion | 2 | medium |
| 62 | Lamborghini Gallardo LP560-4 (2008) | Supercar | super | combustion | 2 | high |
| 63 | McLaren 650S (2014) | Supercar | super | combustion | 2 | high |
| 64 | Jaguar XJ220 (1992) | Supercar | hyper | combustion | 2 | medium |
| 65 | Honda NSX Type S (NA2, 1997) | Supercar | super | combustion | 2 | high |
| 66 | Alfa Romeo Stelvio Quadrifoglio (2018) | Performance SUV | suv | combustion | 1 | high |
| 67 | Mercedes-AMG GLE 63 S (W166, 2015) | Performance SUV | suv | combustion | 1 | high |
| 68 | Range Rover Sport SVR (L494, 2015) | Performance SUV | suv | combustion | 1 | high |
| 69 | Porsche Macan Turbo (95B, 2015) | Performance SUV | suv | combustion | 1 | high |
| 70 | Jeep Grand Cherokee Trackhawk (2018) | Performance SUV | suv | combustion | 1 | high |
| 71 | BMW M550d xDrive (F10, 2012) | Diesel | sedan | combustion | 1 | high |
| 72 | Audi SQ7 4.0 TDI (4M, 2016) | Diesel | suv | combustion | 1 | medium |
| 73 | Alfa Romeo 159 2.4 JTDM Q4 (2006) | Diesel | sedan | combustion | 3 | medium |
| 74 | Mercedes-Benz G 350 d (W463, 2016) | Diesel | suv | combustion | 3 | medium |
| 75 | Ford Ranger 3.2 TDCi Wildtrak (2015) | Diesel | pickup | combustion | 3 | medium |
| 76 | Chevrolet Colorado ZR2 (2017) | Pickup | pickup | combustion | 3 | medium |
| 77 | Toyota Tacoma TRD Pro (2019) | Pickup | pickup | combustion | 3 | medium |
| 78 | Lotus 3-Eleven (2016) | Track | proto | combustion | 3 | low |
| 79 | Radical RXC Turbo 500 (2015) | Track | proto | combustion | 3 | low |
| 80 | Caterham 620 R (2013) | Track | roadster | combustion | 3 | low |
| 81 | KTM X-Bow R (2011) | Track | openwheel | combustion | 3 | low |
| 82 | Mazda RX-7 (FC3S Turbo II, 1989) | Rotary | coupe | combustion | 1 | high |
| 83 | Mazda Cosmo Type-E (JC, 20B, 1990) | Rotary | coupe | combustion | 3 | medium |
| 84 | Mazda RX-3 (1972) | Rotary | coupe | combustion | 3 | low |
| 85 | Wartburg 353 (1985) | Two-Stroke | kei | combustion | 3 | medium |
| 86 | Porsche Taycan Turbo S (2020) | Electric | sedan | electric | 4 | high |
| 87 | BMW i4 M50 (2021) | Electric | sedan | electric | 4 | high |
| 88 | Nissan Leaf e+ (ZE1, 2019) | Electric | hatch | electric | 4 | high |
| 89 | Hyundai Ioniq 5 (2021) | Electric | suv | electric | 4 | high |
| 90 | Rivian R1T (2022) | Electric | pickup | electric | 4 | medium |
| 91 | Lucid Air Touring (2022) | Electric | sedan | electric | 4 | medium |
| 92 | Chevrolet Bolt EUV (2022) | Electric | hatch | electric | 4 | high |
| 93 | Honda NSX (NC1, 2017) | Hybrid | super | hybrid | 4 | high |
| 94 | McLaren P1 (2013) | Hybrid | hyper | hybrid | 4 | medium |
| 95 | Ferrari SF90 Stradale (2019) | Hybrid | hyper | hybrid | 4 | medium |
| 96 | BMW i8 (2014) | Hybrid | super | hybrid | 4 | high |
| 97 | Lexus LC 500h (2017) | Hybrid | gt | hybrid | 4 | high |
| 98 | Toyota Prius (XW10, 1997) | Hybrid | hatch | hybrid | 4 | medium |
| 99 | Honda CR-Z (2010) | Hybrid | hatch | hybrid | 4 | high |
| 100 | Toyota RAV4 Hybrid (XA50, 2019) | Hybrid | suv | hybrid | 4 | high |

Expected confidence: high-biased on waves 1 and 4; medium on classics; low reserved for track exotics, Zonda, Veyron, RX-3 (same spirit as Radical / Mono in batch 1).

## Research waves

1. **High-interest, high-data combustion** — Golf R, i30 N, R32/R33 GT-R, Silvia S15, Alpine A110, Shelby GT350, Macan Turbo, Stelvio QF, FC RX-7, Escort Cosworth, and the rest of `wave: 1` in `queue.json`.
2. **Supercar era fills** — 959, F50, Aventador, 488, Gallardo, Miura, 288 GTO, and the rest of wave 2.
3. **Thin categories** — Track quartet, Cosmo 20B, Wartburg, Colorado / Tacoma, remaining kei.
4. **Electric / Hybrid** — Taycan, i4, Leaf, Ioniq 5, then NC1 / P1 / SF90 / i8 (separate PRs from combustion).

Per car, follow `.cursor/skills/import-vehicle/SKILL.md`: `research/vehicles/<id>/vehicle.json` + `NOTES.md`, then `validate-research.mjs`.

## Suggested preset implementation order (later sessions)

Do **not** stamp or edit `src/` from this shortlist alone. After a wave’s research validates:

1. Combustion cars that reuse an existing `PRESETS` engine (if any).
2. High-confidence wave 1 with published gearsets.
3. Medium-confidence classics (flag SAE gross where needed).
4. Low-confidence track / exotic last — ship research-complete, score only when honest.
5. Electric / Hybrid only through `electric-presets.js`.

One build = one PR; small packs of cars, not all 100 at once.

## Excluded on purpose

- New categories (van, boat, motorcycle, formula).
- Badge twins of cars already in `FACTORY_CARS` (BRZ, etc.).
- Cars that need a new chassis archetype without owner sign-off.
- Mild-hybrid facelifts next to a clean ICE year (prefer the clean year).
- Fitting numbers so a test passes.

## Chassis notes for research

| Car | Note |
| --- | --- |
| AZ-1, MR2, Alpine A110, 4C, Exige, NSX | Set `engPos: "mid"`. |
| 964 / 996 Turbo / 959 | `engPos: "rear"` on `super`. |
| Caterham 620 R | `roadster`, not `proto` (no factory wing). |
| KTM X-Bow R | `openwheel` (already exists). |
| Wartburg 353 | `kei` is a size match only (same as Trabant). |
| Silvia S15 / RS4 B7 | Category may move after research; shortlist locks the picker slot for now. |
