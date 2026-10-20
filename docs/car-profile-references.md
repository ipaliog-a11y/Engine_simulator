# Car side-profile references wanted

Build 107 draws every car from `CAR_PROFILE` in `index.html`.

- **Taken from published specs:** each car's length, width, height and wheelbase.
- **Estimated by eye:** the split between front and rear overhang, and the outline points between them.

This list asks for a real side view of each car, so the estimated parts can be replaced with traced ones. The traced outline then becomes the independent reference on the contact sheet.

There are **29 profiles**. Each one needs a side elevation of the exact version listed.

## Class reference cars (13)

| # | Key | Car | Body / notes | Also used by |
|---|---|---|---|---|
| 1 | `kei` | Suzuki Alto Works HA36S, 2015 | 5-door | Alto Works preset |
| 2 | `hatch` | VW Golf GTI Mk7, 2013 | 5-door | Golf GTI and Golf 2.0 TDI presets |
| 3 | `roadster` | Mazda MX-5 NA, 1989 | top down if possible | MX-5 preset |
| 4 | `coupe` | BMW M3 E46, 2000 | coupé | E46 preset |
| 5 | `sedan` | BMW 3 Series F30, 2012 | sedan | 330d preset |
| 6 | `muscle` | Ford Mustang GT S550, 2018 | fastback | Mustang preset |
| 7 | `rally` | Toyota GR Yaris, 2020 | 3-door | GR Yaris preset |
| 8 | `gt` | Ferrari 812 Superfast, 2017 | | 812 preset |
| 9 | `super` | Lamborghini Huracán LP610-4, 2014 | coupé | Huracán preset |
| 10 | `hyper` | McLaren P1, 2013 | no preset uses it; any carbon hypercar is fine | — |
| 11 | `proto` | Radical SR3 RSX | no preset uses it; any open-cockpit track prototype is fine | — |
| 12 | `pickup` | Chevrolet Silverado 2500HD, 2020 | crew cab, standard bed | Silverado preset |
| 13 | `suv` | BMW X5 M F95, 2020 | no preset uses it; any performance SUV is fine | — |

## Real cars with their own profile (16)

| # | Key | Car | Body / notes |
|---|---|---|---|
| 14 | `fiat500` | Fiat 500, 2011 | 3-door |
| 15 | `aygo` | Toyota Aygo AB40, 2014 | 5-door |
| 16 | `fiesta` | Ford Fiesta Mk7, 2013 | 5-door |
| 17 | `civic` | Honda Civic Type R FK8, 2017 | |
| 18 | `ae86` | Toyota Corolla Levin AE86 | 2-door notchback coupé |
| 19 | `s2000` | Honda S2000 AP1, 2000 | top down |
| 20 | `gt3` | Porsche 911 GT3 991.2, 2017 | |
| 21 | `supra` | Toyota Supra RZ A80, 1993 | |
| 22 | `r34` | Nissan Skyline GT-R R34, 1999 | |
| 23 | `sti` | Subaru Impreza WRX STI GD, 2004 | sedan |
| 24 | `evo` | Mitsubishi Lancer Evolution IX, 2006 | |
| 25 | `rs3` | Audi RS3 Sportback 8V, 2017 | |
| 26 | `c6` | Chevrolet Corvette C6, 2008 | coupé; covers both C6 presets |
| 27 | `challenger` | Dodge Challenger SRT Hellcat, 2015 | |
| 28 | `rx7` | Mazda RX-7 FD, 1993 | |
| 29 | `rx8` | Mazda RX-8, 2004 | |

## Priority if time is short

Start with these:

1. #9 Huracán
2. #8 812 Superfast
3. #20 911 GT3
4. #6 Mustang
5. #12 Silverado
6. #7 GR Yaris
7. #1 Alto Works

They are the shapes where the current estimates are least certain: cab-forward and long-hood cars, the 911's rear engine, and the bulky bodies.

## What to send for each car (best first)

**A. A blueprint or side-view image.**
- A dimension drawing is best, ideally with the wheelbase or length marked.
- A photo taken square-on from the side also works.
- Only the traced numbers go into the app, never the image.

**B. Dimension-sheet numbers.**
- Front overhang and rear overhang.
- If listed: ground clearance, beltline height, hood or cowl height, and deck height.

**C. Points already extracted.** Give each as (x, y) in mm, with x measured from the rear bumper and y up from the ground:
- **Outline points:** tail bottom, tail top, deck or spoiler, rear-glass base, roof rear, roof peak, roof front (windscreen top), cowl (windscreen base), hood front, nose top, nose bottom.
- **Sill height:** the height of the rocker.
- **Beltline:** the height of the bottom of the side glass at its rear end and at its front end.
- **The x position of:** each pillar (B, and C on 4-doors) and each door shut-line.

Please note the **source name, URL and licence** for each car. It goes into that profile's `src` field.

## What happens with each reference

1. Replace that car's `top`, `ovR`, `sill`, `belt`, `dlo`, `pil` and `door` in `CAR_PROFILE` (`index.html`), and add the source to `src`.
2. Re-render the contact sheet, using the traced outline as the independent middle panel.
3. Run `node tests/run.mjs`.
4. Bump the build with `node tools/stamp.mjs`.
5. Add a CHANGELOG line and refresh `docs/vehicle.png`.

References can arrive in any order and in any batch size.
