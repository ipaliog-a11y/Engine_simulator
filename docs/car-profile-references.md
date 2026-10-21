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

## Sources traced so far

| Car | Reference | Author / licence | Fit |
|---|---|---|---|
| `gt3` Porsche 911 GT3 991.2 | [File:Porsche 991 Turbo S Seitenansicht.JPG](https://commons.wikimedia.org/wiki/File:Porsche_991_Turbo_S_Seitenansicht.JPG) | KarleHorn, CC BY 3.0 | See the notes below. |

Notes on the 911 trace:

- **Why the Turbo S photo:** Commons has no square-on side view or drawing of the 991.2 GT3 itself. This 991 Turbo S photo shares the GT3's wide 991 shell, glasshouse and doors; only the bumpers, the wing and the ride height differ.
- **Raw trace:** the close camera makes the photo read 3971 mm long and 1194 mm tall, against the Turbo S's published 4506 mm and 1296 mm.
- **Correction:** points set back from the side plane were pushed out from the optical centre (depth factor 1.135, fitted to the published length). The height still came out 7 % short, so the glasshouse was stretched to the published GT3 height.
- **Result:** length and height match the published figures by construction. The photo supplies the shape: the cowl, roof, glass, pillar, doors and deck positions.
- **Not shipped:** the photo is only a reference. The app carries the traced numbers alone.

## Sketchfab 3D-model shortlist

The plan is now to trace each profile from a downloadable 3D model.
- **Why models:** an orthographic side view rendered from a model has no perspective error, and it can be measured automatically.
- **Search vs download:** the shortlist came from Sketchfab search, which needs no login. Downloading needs a Sketchfab API token, set as the environment variable `SKETCHFAB_TOKEN`.
- **What ships:** only the measured numbers go into the app, never the model.

**Ranking.** I picked from the thumbnails, preferring:
1. a stock road car of the right generation
2. a CC BY licence
3. 20k–600k faces

**Flagged picks:**
- `pickup`: CC BY-NC-SA; the CC BY alternative has two trucks in one scene.
- `proto`: an SR10 rather than the SR3.
- `fiesta`: the 3-door ST.
- `hatch`: a Clubsport.
- `fiat500`: an Abarth.
- `aygo`: the 2019 facelift.

**Validation.** Each model is checked after download: scaled to the published wheelbase, its length and height must come within 3 % of the published figures, or the backup is used.

| Key | Primary model | Author | Licence | Backup |
|---|---|---|---|---|
| `kei` | [Suzuki Alto Works (HA36S)](https://sketchfab.com/3d-models/00edb1d4d89c428d9e0cf6be818a29ca) | Mona x Supercars | CC BY | [1997 Daihatsu Mira TR-XX Avanzato R L502S](https://sketchfab.com/3d-models/9ebaece4eba04602973d7a9b4745f7d2) (CC BY-NC) |
| `hatch` | [2016_volkswagen_golf_gti_clubsport_mk7](https://sketchfab.com/3d-models/134f9228687d4a919dcd2edb302acb80) | 007 | CC BY | [2014 Volkswagen Golf GTI Mk7](https://sketchfab.com/3d-models/93f2b79c56c14b269fbe914205c4712e) (CC BY-NC-SA) |
| `roadster` | [Mazda Miata MX-5 NA](https://sketchfab.com/3d-models/d51fcd44b74f4daf8012c41e0400c041) | Lexyc16 | CC BY | [1989 Mazda MX-5 (NA)](https://sketchfab.com/3d-models/bd6429f3d02a426f9a714a66c33bb353) (CC BY) |
| `coupe` | [BMW M3 Coupe (E46)](https://sketchfab.com/3d-models/f5f00aecf89845709d02be03a8007752) | Mona x Supercars | CC BY | [2003_bmw_m3_e46_coupe](https://sketchfab.com/3d-models/729d1e5864514fe6ba7f526e5f175861) (CC BY) |
| `sedan` | [BMW 3 Series MK6 (F30)](https://sketchfab.com/3d-models/0c1dee70352640ea9ad7096540695342) | Merc_TV | CC BY | [BMW 3 Series MK6 (F30) 2011-2018](https://sketchfab.com/3d-models/087efd9833714af2a68561bde9181985) (CC BY) |
| `muscle` | [2015 Ford Mustang GT (S550)](https://sketchfab.com/3d-models/0382a22e782c4a9e8c0dc0f0dc587103) | Mona x Supercars | CC BY | [2015 ford mustang gt](https://sketchfab.com/3d-models/d79e030db7484d05a92b794208b0d62b) (CC BY) |
| `rally` | [2020 Toyota GR Yaris](https://sketchfab.com/3d-models/44cb958908b94aa5aad0d856994f35a3) | DisneyCars | CC BY | [2021_toyota_gr_yaris](https://sketchfab.com/3d-models/721482e4ac044f41942815ac98eb7924) (CC BY) |
| `gt` | [2018_ferrari_812_superfast](https://sketchfab.com/3d-models/98652e975cdb4772aaf4e3dba9ffe712) | 007 | CC BY | [ferrari 812 superfast](https://sketchfab.com/3d-models/959f3e000c4841a1b5e43be09fb39392) (CC BY) |
| `super` | [Lamborghini Huracan LP-6104 2014](https://sketchfab.com/3d-models/4b7b162bcb4f48849f30b1c25b3102a3) | MdMahib | CC BY | [Lamborghini Huracán LP 610-4](https://sketchfab.com/3d-models/57a42499eedb4b6f82179e3f6f12b2e4) (CC BY) |
| `hyper` | [Mclaren P1 | www.vecarz.com](https://sketchfab.com/3d-models/adae2edc721e4ce7b31c1d06a581e30a) | vecarz | CC BY | [2014 McLaren P1](https://sketchfab.com/3d-models/bdf89a13ec0b48beb698f7b658073d2a) (CC BY) |
| `proto` | [2023 Radical SR10 XXR](https://sketchfab.com/3d-models/553277a1f4c04e6b88364631204659cc) | DisneyCars | CC BY | [2023 Radical SR10 XXR](https://sketchfab.com/3d-models/401f3c0c7d6c4c34b4e43c5b87b6cd53) (CC BY-NC) |
| `pickup` | [2015 Chevrolet Silverado High Country 2500HD](https://sketchfab.com/3d-models/34a84ae7c5d9473c86e519959850cf6a) | Ddiaz Design | CC BY-NC-SA | [Chevrolet Silverado HD Crewcab](https://sketchfab.com/3d-models/fc6f983456e14bd7a82d1a3baccdf763) (CC BY) |
| `suv` | [2020 BMW X5 M Competition](https://sketchfab.com/3d-models/9b211d525797457e988c903f67d0b753) | David_Holiday | CC BY | [BMW X5 M (G05)](https://sketchfab.com/3d-models/4abeaa4dfee24ae5a49e12b624882e1b) (CC BY) |
| `fiat500` | [Fiat Abarth 500](https://sketchfab.com/3d-models/b59a403dfa1d40318c1126e658f87c19) | Luquita | CC BY | — |
| `aygo` | [Toyota Aygo  2019](https://sketchfab.com/3d-models/c01363c599a242c5b2955813959eb6f3) | Nieve5677 | CC BY | [Toyota Aygo 2009 5-doors](https://sketchfab.com/3d-models/aaf87da9481f46ccba404f3156c70d9b) (CC BY) |
| `fiesta` | [2014 Ford Fiesta ST](https://sketchfab.com/3d-models/b75493742339401d9f4e557caad7e73d) | 007 | CC BY | [Ford Fiesta](https://sketchfab.com/3d-models/8c3d2a32d39349a3909b7282c805eab7) (CC BY) |
| `civic` | [Honda Civic Type R FK8](https://sketchfab.com/3d-models/280996c1edbf4347a7d8b4bb69a0129f) | Nieve5677 | CC BY | [2019 Honda Civic Type R (FK8)](https://sketchfab.com/3d-models/8178eb7026084e6aad87bcb34aadb110) (CC BY) |
| `ae86` | [Toyota Corolla AE86 LEVIN -Free Download](https://sketchfab.com/3d-models/3587e396fd9d49b982baf0daa9e85845) | Poly-On | CC BY | [1985 Toyota Corolla Levin GT Apex AE86 Custom](https://sketchfab.com/3d-models/9c11f198c8914f5b9d79a2632f51da7c) (CC BY) |
| `s2000` | [1999 Honda S2000 AP1](https://sketchfab.com/3d-models/737fd0a261fd4f32b431c838dcc57c0f) | mc010699 | CC BY | [Honda S2000 (AP1)](https://sketchfab.com/3d-models/bdeb3c1e996c45e2b367c03301f4bd83) (CC BY) |
| `gt3` | [2013 Porsche 911 GT3 (991)](https://sketchfab.com/3d-models/93bcd9a97f3b4fdb903b2dd8c138177e) | DisneyCars | CC BY | [2014 Porsche 911 GT3 (991)](https://sketchfab.com/3d-models/249b3088ba9449038d89670c9cd8d789) (CC BY-NC-SA) |
| `supra` | [Toyota Supra MK4](https://sketchfab.com/3d-models/3c6d255109cd4ecb882002d6fdccf71b) | samydepapelo3 | CC BY | [Toyota Supra (A80) 1993](https://sketchfab.com/3d-models/dd897d7823784bc5893c183c1328e8cb) (CC BY-NC) |
| `r34` | [Nissan Skyline R34 GT-R](https://sketchfab.com/3d-models/ff8fb2251dfa4bb9979e7022c5a6666c) | Lexyc16 | CC BY | [Nissan GTR R34 Skyline | GT-R Skyline](https://sketchfab.com/3d-models/5eed440cfd094c5a8fdc9929eb43ab02) (CC BY) |
| `sti` | [2006 Subaru Impreza WRX S Ti](https://sketchfab.com/3d-models/ff6da325e2a147079a5187147999dddb) | 007 | CC BY | [Subaru Impreza WRX STi 2004 Custom](https://sketchfab.com/3d-models/08296bc950364621b6174a3078bb19e0) (CC BY) |
| `evo` | [Mitsubishi Lancer Evolution IX MR GSR (CT9A)](https://sketchfab.com/3d-models/e0646088011743639370003738d7013c) | Mona x Supercars | CC BY | [Mitsubishi Lancer Evolution IX](https://sketchfab.com/3d-models/ee88ad9414884bdabaf0658943ac339b) (CC BY) |
| `rs3` | [2018 Audi RS 3 Sportback](https://sketchfab.com/3d-models/77d3dcacacb7413e9685a27f77f651f8) | Galaxy Car Showroom | CC BY | [audi rs3 sportback](https://sketchfab.com/3d-models/036fbcc0ab9a4ee6b2a5977fb1f9d092) (CC BY) |
| `c6` | [2005 Chevrolet Corvette C6](https://sketchfab.com/3d-models/7ff74ce1324c4dbb9f3d830b71525096) | Ddiaz Design | CC BY | [2013 Chevrolet Corvette Z06](https://sketchfab.com/3d-models/a0a8832577594c13b8626fa9069885d2) (CC BY) |
| `challenger` | [2015 Dodge Challenger SRT Hellcat](https://sketchfab.com/3d-models/e9349f847d5f4b95a01a6ce578e19899) | ChoochooLi Models | CC BY | [2015_dodge_challenger_srt_hellcat](https://sketchfab.com/3d-models/502c997d564e4a049223b5c39f43e191) (CC BY) |
| `rx7` | [Mazda RX-7 FD](https://sketchfab.com/3d-models/d35ff630df614771b82e7b2f59035b1e) | Lexyc16 | CC BY | [Mazda RX-7 FD](https://sketchfab.com/3d-models/f6fd5cccfed94883ae8c7fe7cb8a94bf) (CC BY) |
| `rx8` | [mazda rx-8](https://sketchfab.com/3d-models/4ad4003f3e024d17bf3821126c58cc5a) | amogusstrikesback2 | CC BY | [Mazda RX-8](https://sketchfab.com/3d-models/c168a2001c8e4bceaaf8ff960641035e) (CC BY) |
