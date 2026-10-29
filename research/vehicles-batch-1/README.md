# Vehicle research, batch 1

Research only. Nothing in `src/js/vehicle-presets.js` or `src/js/engine-options-presets.js` was changed. A later session implements the presets from `vehicles.json` and checks them against `real`.

`node research/vehicles-batch-1/validate.mjs` checks the file. `tests/test97.mjs` runs that check inside `node tests/run.mjs`.

## What this batch is for

The 42 cars already in the game are mostly modern performance cars and supercars. They leave four holes: no real Performance SUV, no real Track Prototype, no V6 of any kind, and almost nothing from the 1960s to the 1980s. Kei cars, hot hatches, sports sedans, pickups and diesels are thin. The Cummins 6.7 and the Yamaha RD350LC exist as engines and have no car. This batch fills those holes with 50 combustion cars. Hybrids and electrics stay out; that work is described in `plans/hybrid-electric/`.

## How to read an entry

`vehicles.json` uses the field names the presets already use.

- `body` is `{kg, cd, area, wb, fWt}` and, where the archetype would place the engine wrong, `engPos` (`mid` or `rear`). `kg` is curb mass with fluids and without a driver. A published dry weight is never stored as `kg`. Where a source includes a 75 kg driver, it has been taken back off and the note says so.
- `fit` is the factory hardware: `drive, tire, tw, twF, ta, wheel, brake, rotor, susp, gears, gearbox, diff, tc`, plus suspension geometry when it matters. Factory wings are already inside a measured `cd`, so `aF` / `aR` / `aFl` stay off unless the note says the Cd is a wing-off estimate. That is the rule in `vehicle-presets.js`.
- `real` is `{t100, top, limited}`. `t100` is 0–100 km/h. A 0–60 mph road test is not stored as if it were 0–100; the gap is estimated and the field is in `unsure`.
- `gearset` is `{r, fd, src}`. `r` or `fd` is `null` when it was not found. Do not invent a gearbox to fill the hole.
- `enginePreset`, only when `engineStatus` is `new`, is a `PRESETS` entry: `engine` is a delta over `DEFAULT_ENGINE`, the same way the existing presets are written. `real.unit` is `PS` or `hp_SAE`. Torque is always Nm.
- `unsure` names every figure that is estimated, secondary, or in conflict with another source. The note says which.

Where frontal area is unpublished, `area` is width × height × 0.81 (cars) or × 0.85 (trucks and SUVs). Where the axle split is unpublished, `fWt` is a layout estimate. Where peak boost is unpublished, `boost_bar` is a typical value for that hardware. All three land in `unsure`.

Three categories are new and have to be added to `PRESET_CATS` before a dropdown will show them: **Performance SUV**, **Track**, **Pickup**. Diesels stay in the existing Diesel category, including the pickups, because the Silverado already lives there.

## The 50

| | Car | Role | Chassis | Engine | Confidence |
| --- | --- | --- | --- | --- | --- |
| 1 | BMW X5 M (F85, 2015) | Performance SUV | suv | new | medium |
| 2 | Porsche Cayenne Turbo (958.2, 2014) | Performance SUV | suv | new | high |
| 3 | Lamborghini Urus (2018) | Performance SUV | suv | new | medium |
| 4 | Jeep Grand Cherokee SRT (WK2, 2014) | Performance SUV | suv | new | high |
| 5 | Toyota Land Cruiser 200 VX 4.5 D-4D (2015) | Heavy SUV | suv | new | medium |
| 6 | Radical SR3 RSX 1500 (2015) | Track Prototype | proto | new | low |
| 7 | BAC Mono 2.3 (2011) | Track Prototype | none, suggest `openwheel` | new | low |
| 8 | Nissan 370Z (Z34, 2009) | Sports coupe | coupe | new | high |
| 9 | Honda NSX (NA1, 1991) | Mid-engine sports | super | new | high |
| 10 | Ford F-150 Raptor (2017) | Pickup | pickup | new | medium |
| 11 | Nissan GT-R (R35, 2017) | Sports coupe | coupe | new | high |
| 12 | Alfa Romeo Giulia Quadrifoglio (2017) | Sports sedan | sedan | new | high |
| 13 | Nissan 300ZX Twin Turbo (Z32, 1990) | Sports coupe | coupe | new | high |
| 14 | Buick GNX (1987) | Muscle | muscle | new | high |
| 15 | Ferrari Dino 246 GT (1969) | Classic mid-engine | super | new | medium |
| 16 | Ferrari F40 (1987) | Supercar | hyper | new | medium |
| 17 | Jaguar E-Type 3.8 FHC (Series 1, 1961) | Classic GT | coupe | new | medium |
| 18 | Ford Mustang Fastback 289 (1965) | Muscle | muscle | new | medium |
| 19 | Porsche 911 Carrera RS 2.7 Sport (1973) | Classic sports | super | new | high |
| 20 | BMW M3 (E30, 1986) | Sports coupe | coupe | new | high |
| 21 | Volkswagen Golf GTI (Mk1, 1976) | Hot hatch | hatch | new | high |
| 22 | Ferrari 365 GTB/4 Daytona (1968) | Classic GT | gt | new | medium |
| 23 | Lamborghini Countach LP400 (1974) | Supercar | super | new | low |
| 24 | Audi Sport quattro (1984) | Rally | rally | new | medium |
| 25 | Mercedes-Benz 190E 2.3-16 (1984) | Sports sedan | sedan | new | medium |
| 26 | Peugeot 205 GTI 1.9 (1986) | Hot hatch | hatch | new | high |
| 27 | Ford Sierra RS Cosworth (1986) | Classic sports | coupe | new | medium |
| 28 | Lancia Delta HF Integrale Evoluzione (1992) | Rally | rally | new | medium |
| 29 | Honda Integra Type R (DC2, 1995) | Sports coupe | coupe | new | medium |
| 30 | Lotus Elise (S1, 1996) | Light roadster | roadster | new | medium |
| 31 | BMW M5 (E39, 2000) | Sports sedan | sedan | new | high |
| 32 | Trabant 601 S (1988) | City | kei | new | medium |
| 33 | Honda S660 (2015) | Kei | kei | new | high |
| 34 | Honda Beat (1991) | Kei | kei | new | high |
| 35 | Suzuki Cappuccino (EA11R, 1991) | Kei | roadster | new | medium |
| 36 | Ford Focus RS (Mk3, 2016) | Hot hatch | rally | new | high |
| 37 | Renault Mégane R.S. Trophy (2018) | Hot hatch | hatch | new | high |
| 38 | Suzuki Swift Sport (ZC33S, 2018) | Hot hatch | hatch | new | medium |
| 39 | Honda Civic Type R (EK9, 1997) | Hot hatch | hatch | new | medium |
| 40 | Toyota GR86 (2022) | Sports coupe | coupe | new | high |
| 41 | Porsche 718 Cayman GT4 (2020) | Sports coupe | super | new | medium |
| 42 | BMW M2 Competition (F87, 2018) | Sports coupe | coupe | new | medium |
| 43 | Ariel Atom 3.5 (2013) | Light roadster | roadster | new | low |
| 44 | Mazda MX-5 2.0 (ND, 2015) | Light roadster | roadster | new | medium |
| 45 | Dodge Viper SRT-10 (2008) | Front-engine V10 | muscle | new | medium |
| 46 | Mercedes-AMG C63 (W204, 2008) | Sports sedan | sedan | new | medium |
| 47 | Ram 2500 HO Cummins (2019) | Pickup | pickup | existing | low |
| 48 | Toyota Hilux 2.8 D-4D (2016) | Pickup | pickup | new | medium |
| 49 | Volkswagen Amarok 3.0 V6 TDI (2018) | Pickup | pickup | new | medium |
| 50 | Chevrolet Camaro ZL1 (2017) | Muscle | muscle | new | medium |

Confidence: 18 high, 27 medium, 5 low.

## Why these, and what they add

**Performance SUV** had no real car. The F85 X5 M, the 958.2 Cayenne Turbo, the 2018 Urus and the 2014 Grand Cherokee SRT are four different V8s (twin-turbo BMW, twin-turbo Porsche, twin-turbo Lamborghini, naturally aspirated Hemi). The Land Cruiser 200 diesel uses the same archetype and is flagged as a poor sports-SUV fit: it is a heavy off-road wagon, and a later expedition-SUV archetype would suit it better.

**Track Prototype** had no real car. The Radical SR3 RSX is the one that actually fits `proto` (wings, slicks, sequential). The BAC Mono does not. `proto` assumes a wide winged sports-racer; the Mono is a narrow open-wheeler. The entry leaves `chassis` null and suggests a new `openwheel` archetype (about 520 kg, frontal area about 1.15 m², Cd about 0.55, aero about 1.0, slicks, sequential). Do not drop it onto `proto`.

**The Ariel Atom** is the opposite case. It has almost no aero, so it is a light roadster, not a track prototype. Fit leaves the wings off.

**V6.** There is still no V6 in `PRESETS`. This batch adds eight petrol V6s and one diesel V6: 370Z VQ37, NSX C30A, Raptor 3.5 EcoBoost, R35 VR38, Giulia 690T, 300ZX VG30DETT, Buick LC2, Dino 246, and the Amarok 3.0 TDI.

**Older cars.** E-Type and Mustang (1960s, and both rated in SAE gross — do not score the model against those headline horsepower numbers), Dino and Daytona (1960s), Golf GTI Mk1 and 911 RS 2.7 and Countach (1970s), F40, GNX, Sport quattro, 190E 2.3-16, 205 GTI, Sierra RS Cosworth, E30 M3 and the Trabant (1980s).

**The two-stroke car** is the Trabant 601, with its own air-cooled 594 cc twin. The Yamaha RD350LC stays a motorcycle engine and is not reused. The model has no air-cooled path and no drum brakes; both are called out on that entry.

**Kei and city.** S660 (mid-engine turbo), Beat (mid-engine, individual throttles, 64 PS at 8100 rpm), Cappuccino (F6A turbo, not the K6A already used by the Alto Works). The Trabant is the city car.

**Hot hatches.** 205 GTI, Golf GTI Mk1, EK9 Civic Type R, Swift Sport, Mégane Trophy, Focus RS. The EK9's B16B is not the FK8's K20C1.

**Sports sedans.** 190E 2.3-16, M5 E39, C63 W204, Giulia Quadrifoglio.

**Pickups and diesels.** Ram 2500 on the existing Cummins, Hilux 1GD-FTV, Amarok V6 TDI, Raptor, and the Land Cruiser 200's 1VD-FTV. The Silverado Duramax remains the only heavy-duty pickup already in the game.

## Engines

**49 cars need a new engine. One does not.**

The Ram 2500 uses `Cummins 6.7 (Ram HD 2019 HO)`, which is already in `PRESETS` and has no car. Do not add a second Cummins. The 2019 Stellantis press kit does fill fields that preset still marks unsure: high-output compression **16.2:1** (the preset has 17.3), boost **up to 33 psi / 2.28 bar** (the preset has 2.0), high-idle **3200 rpm** (the preset redline is 3500). Rated power and torque already match (400 hp and 1356 Nm at the preset's speeds). `engineRevision` on that entry is the correction, not a new preset.

Engines that look reusable and are not:

- 718 Cayman GT4 4.0 and the 911 GT3 4.0 share 102.0 × 81.5 mm. The GT4 is a lower compression, a plenum rather than individual throttles, an 8000 rpm redline and 420 PS. It needs its own preset.
- Ariel Atom 3.5 is a tuned naturally aspirated K20A at 245 hp. The K20C1 already in the list is the turbo Civic Type R.
- EK9 B16B and DC2 B18C are naturally aspirated Honda fours. Neither is the K20C1.
- Camaro ZL1 is the LT4. The Hellcat is a different supercharged 6.2, and the preset even uses a different blower type (`screw` versus the LT4's roots-style TVS).
- Cappuccino EA11R is the F6A. The K6A is already the Alto Works engine; the later Cappuccino that switched to a K6A was left out so the two would not collide.
- M2 Competition is the S55. The S54 (E46 M3) and the 2JZ are different sixes.
- C63 W204 is the naturally aspirated M156. Later AMG C63s are the turbo M177, and the W206 is a hybrid.
- Sierra RS Cosworth is the YBB. The RS500 is a different turbo.

The Viper is the second V10, after the Carrera GT. The Dino is a 65-degree V6. The Trabant is the second two-stroke, and the first that is a car.

## Excluded on purpose

Hybrids and anything with a traction battery or a 48V machine, including the cars the brief named:

- Honda NSX NC1 (the NA1 is in the batch)
- Porsche 918, McLaren P1, Ferrari SF90, LaFerrari, 296
- BMW M5 G90 (the E39 is in the batch; the F90 would have been combustion, and was skipped in favour of the older car)
- Mercedes-AMG C63 W206 (the W204 is in the batch)
- 48V and mild-hybrid traps that sit next to cars that were kept: Golf 8 GTI, the 2024 Suzuki Swift, Land Cruiser 300 hybrids, Urus SE, Cayenne S E-Hybrid, Ram 1500 eTorque. The 2019 Ram 2500 Cummins does not have eTorque. The F85 X5 M was used instead of the later X5 M so a facelift 48V car could not slip in.

Also excluded: any of the 42 cars already in `VEHICLE_PRESETS`, and a second badge on the same car (the GR86 stands for the BRZ).

## Chassis that do not fit

| Car | Decision |
| --- | --- |
| BAC Mono | No archetype. Suggest `openwheel`. Nearest, and wrong, is `proto`. |
| Ariel Atom 3.5 | `roadster`. `proto` would add a wing the car does not have. |
| Trabant 601 | `kei` is only a size match. It is a small sedan, not a kei. |
| Land Cruiser 200 | `suv`, with a note that the archetype is a sports SUV and this is not. |
| S660, Beat, Elise | Kei or roadster archetype, but `engPos` must be `mid` or the engine sits in the nose. |
| 911 RS 2.7 | `super` with `engPos: "rear"`, same as the other 911s. `super` alone means mid-engine. |
| Sierra RS Cosworth | `coupe`, not `rally`. The three-door is rear-wheel drive. The Sapphire 4x4 is a different car. |
| Integra Type R, Mégane, 205, Golf, EK9, Swift | Hot hatches on `hatch` or, for the DC2, `coupe`, with `drive: "fwd"`. The coupe and some archetypes default to rear-wheel drive. |

## Suggested implementation order

Do the cars that need no new engine first, then the high-confidence cars whose gearsets and curb weights are actually sourced, then everything whose `unsure` list is long. Do not tune the model to a low-confidence `real` block.

1. **Ram 2500 HO Cummins.** Existing engine. Correct compression and boost from `engineRevision` first, then the truck. The truck's mass and 0–100 are the weak part of an otherwise ready engine.
2. **High, and sourced enough to implement together.** Cayenne Turbo, Grand Cherokee SRT, 370Z, NSX NA1, GT-R R35, Giulia Quadrifoglio, 300ZX, GNX, 911 RS 2.7, E30 M3, Golf GTI Mk1, 205 GTI 1.9, M5 E39, S660, Beat, Focus RS, Mégane Trophy, GR86. These are the ones a validation pass can be honest about.
3. **Medium.** The rest of the table. Read `unsure` before copying a number into a preset. In particular the E-Type and the 1965 Mustang are SAE gross, the F40's 1100 kg is dry, the Focus RS brochure kerb includes the driver (the file already stores 1524 kg), and the 718 GT4 must not inherit the GT3 preset or the older 981 GT4's 3.8-litre figures.
4. **Low, last.** Radical SR3 RSX and BAC Mono (track data was not on a factory sheet, and the Mono needs a new archetype), Countach LP400, Ariel Atom 3.5. They are in the batch so the holes are named, not so the model can be scored against them yet.

## Lowest confidence

These five are `low`. The numbers are in the file so the shape is complete, and the notes say what a later session has to replace.

- **Radical SR3 RSX 1500.** Power, weight and gearing moved between RS, RSX and XX years. No 2015 factory sheet was captured. Do not score a lap against its 0–100.
- **BAC Mono 2.3.** The original 280 bhp car and the later 305 bhp 2.5 are easy to mix. Chassis is unset on purpose.
- **Lamborghini Countach LP400.** Dry weight, curb weight, top speed and the V12's torque disagree across secondary sources. No Lamborghini sheet was opened for this one.
- **Ariel Atom 3.5.** The buying guide used for 245 hp and 520 kg says those figures are not definitive. The chassis choice (roadster, no wing) is the firm part.
- **Ram 2500 HO Cummins.** The engine is in good shape. The crew-cab curb weight was not isolated (published figures for the line run from a light regular-cab to about 9200 lb), and Ram does not publish 0–100.
