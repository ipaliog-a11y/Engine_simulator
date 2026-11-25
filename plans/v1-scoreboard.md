# v1.0 scoreboard (build 474, `v1-scope` build 1)

Measured on `main` at build 474 with **no physics change** (the fingerprint is identical; see the CHANGELOG entry).
This replaces the stale figures in `v1-scope.md`, `v1-finish.md` and `engine-systems-remaining.md`. Every proposal
below needs the owner's ruling; nothing here was fixed.

## How it was measured

`node tools/scoreboard.mjs out.json` (new, read-only) loads each of the 100 factory cars as a player would (model
power, nothing matched) and compares it with the figures its presets carry:

- **Power, torque**: `engine.score.peakHP` / `peakTQ` against the engine preset's `real.hp` / `real.tq` (PS ratings
  converted to hp). The three Teslas carry no engine rating, so they are not scored on power.
- **Low-rpm torque** (G4 step 1): on every boosted engine, the model's full-load torque at the maker's torque-peak
  rpm (`real.tqRpm`, the first rpm of the published plateau) against `real.tq`.
- **0–100, top speed**: `simulateAccel()` against the car's `real.t100` / `real.top`. Top speeds the maker governs
  (`limited`) are not scored, because the model fits no governor.
- **Mass**: `vehicle.mass` equals the published `body.kg` for all 100 cars (0.0%). Mass goes into the model as a
  published value and comes out unchanged, so this check only shows that loading a car does not alter it.
- **Lap time: not scored.** No preset or test holds a published lap time for a car, and the model's tracks would
  need the same circuit and conditions. Sourcing these figures is a data build of its own (proposal D4 below).

| Figure | Cars | Mean \|error\| | Mean signed | Over 10% | Without the two rotaries and the two SAE-gross cars |
|---|---|---|---|---|---|
| Peak power | 97 | 6.5% | — | 16 | 5.5% mean, 12 over |
| Peak torque | 97 | 6.4% | — | 19 | 6.0% mean, 17 over |
| Boosted low-rpm torque | 46 | 16.5% | −9.3% | 26 | 16.4% mean, 25 over |
| 0–100 km/h | 100 | 9.1% | +1.4% | 32 | 8.6% mean, 28 over |
| Top speed (not governed) | 72 | 5.1% | +3.3% | 10 | 4.7% mean, 7 over |
| Mass | 100 | 0.0% | 0.0% | 0 | (an input) |

The finish line (owner, build 474): every car under 10% on each published figure, **or on a named list with its
reason**. **66 of the 100 cars** miss by more than 10% on at least one figure. Most fall into the six causes below.

## Cars over 10%, by suspected cause

### C1 · Boosted low-rpm torque short (G4): 17 cars (plus the RX-7, in C2), feeds G2

| Car | At the maker's plateau start | Model / published |
|---|---|---|
| VW Amarok 3.0 V6 TDI | 1400 rpm | 275 / 550 Nm **−50%** |
| Lamborghini Urus | 2250 | 430 / 850 **−49%** |
| Audi RS3 (8V) | 1700 | 249 / 480 **−48%** (was ~46%) |
| Alfa Giulia Quadrifoglio | 2500 | 318 / 600 **−47%** |
| Ford Fiesta 1.0 EcoBoost | 1400 | 95 / 170 **−44%** (was ~44%) |
| BMW M2 Competition | 2350 | 305 / 550 **−44%** |
| Ford Focus RS (Mk3) | 2000 | 249 / 440 **−43%** |
| Ferrari F40 | 4000 | 360 / 577 **−38%** |
| Toyota Land Cruiser 200 D-4D | 1600 | 419 / 650 **−35%** |
| BMW X5 M (F85) | 2200 | 497 / 750 **−34%** |
| Ram 2500 Cummins | 1800 | 1030 / 1356 **−24%** (peak torque −19% as well) |
| Porsche Cayenne Turbo, BMW 330e, Nissan Qashqai e-POWER, BMW 330d, 911 Turbo S (992), Honda S660 | | −22% to −11% |

Peak power is within 5% on 15 of the 17 (not the Land Cruiser +10%, S660 +6%), and peak torque on 12 (not the Ram
−19%, Qashqai −18%, 330e −13%, 330d −5%, Land Cruiser +14%). So most of these engines make their rating. They make it too late: boost is not built at the rpm where the maker's plateau starts. The RS3 and EcoBoost figures
are about where they were before build 425 (~46%, ~44%), so the post-425 builds did not close them. Suspected cause: the fixed turbine A/R
table (G2) puts the boost threshold too high on small-frame and twin-scroll units. Fixed-geometry turbos and VGT
diesels (Amarok, LC200, Ram) both fall short, so the diesels' VGT schedule is a second suspect. **Proposal: fix in
G2** (build 6). Report this column's RMS against the table above, and add a test that holds it (G4 step 2).

The opposite, over at the torque peak (+10% to +34%): Buick GNX +34%, Hellcat +20%, Supra A80 +13%, 300ZX +12%,
Sierra Cosworth +11%, Sport quattro +11%, Camaro ZL1 +11%, Evo IX +10%. Build 136 named the cause: the model has no
ECU torque limit where the real car's calibration holds torque flat. **Proposal: rule** (named list), or fix by
giving these presets a sourced `tqLimit`, as the newer presets have. That is a preset change, for the owner to pick.

### C2 · The rotaries: power −29% and −44%, held by no test

RX-8 (Renesis) 129 / 232 hp, 149 / 211 Nm. RX-7 FD 180 / 255 hp. The whole curve is low and peaks early (RX-8 at
7300 of 9000 rpm). **This is not a regression**: the RX-8 read 128–130 hp at every build checked back to build 152,
and build 99's CHANGELOG states the cause: the rotary's IMEP factor (0.70) is fitted, and the side-port breathing is
not modelled. It also drives their 0–100 (+44%, +18%) and the RX-8's top speed (−11%). **No test holds it**, and it is
not in the register. **Proposal: fix** (derive the IMEP factor and the port breathing), or else put it on a named
list and in `fitted-register.json`.

### C3 · Naturally aspirated power off the rating (G1 and its opposite)

- **Over**: Corvette C6 LS3 523 / 430 hp **+22%**, Mercedes-AMG C63 (M156) **+20%**, Corvette Z06 C6 (LS7)
  **+16%**, Mercedes 190E 2.3-16 +11%, Ford GT (supercharged) +11%, Trabant +15%. The V8s peak at or near the
  limiter (test60's 'limiter' list has the LS3 and LS7). **Proposal: fix in G1** (build 3).
- **Under**: Honda Civic Type R EK9 −14%, Ariel Atom 3.5 −15%, Honda S2000 −11%, Huracán STO −11%; torque under on
  the E46 M3 −15%, Ferrari 458 −13%, BAC Mono −12%. These are the highest-revving naturally aspirated engines, the
  opposite of G1: a ram or resonance gain at high rpm that the model misses. **Proposal: measure inside G1**, which
  already has to find the missing high-rpm loss. Fix the two together.
- **R34 Skyline GT-R +41%** (390 / 276 hp): the rating is the JDM 280 PS gentlemen's-agreement figure. test48
  already quotes the Supra A80 at its export rating for the same reason. **Proposal: data**. Rate the RB26 at a
  sourced dyno or export figure, or mark it `gross`-like ("agreement rating", not scored).
- Gross-rated 1960s cars: E-Type −31% power, Mustang 289 +16%. They are flagged `gross` and test115 does not score
  them. **Proposal: rule** (stays as it is).

### C4 · 0–100 too slow on high-power cars (model slower than the maker)

Ferrari 812 Superfast **+29%** (power −5%), Camaro ZL1 **+30%**, Ariel Atom **+30%** (power −15%), Corvette Z06 C8
**+27%**, Tesla Model S Plaid **+22%**, Corvette Z06 C6 **+21%**, Nissan GT-R R35 **+18%**, Giulia QV **+18%**, BMW M2
**+17%**, Hellcat **+17%**, McLaren F1 +14%, Mustang GT +11%, 911 Turbo S +11%, S2000 +11%, GTI Mk7 +10%. Most make
their power, so the engine is not the cause. Suspected cause: the launch. Makers time these runs with launch control,
and some quoted figures may be rollout-corrected (1 ft, worth ~0.1–0.3 s; not checked per car). The model starts from
standstill with no rollout, and first-gear traction may limit the most powerful cars more than it should. test41 matches power and passes (RMS 6.8%), but
its reference set's most powerful car makes ~460 hp. **Proposal: fix**, in two parts. (a) Measure whether the makers' figures are
rollout-corrected, and if so apply the same convention (a rule about the measurement, sourced). (b) Then check the
traction launch against one published launch trace.

### C5 · 0–100 too fast on older and economy cars (model quicker than the maker)

Toyota Aygo **−24%** (10.9 s against 14.2 s), Countach LP400 −20%, Carrera RS 2.7 −19%, Dino 246 −17%, 190E 2.3-16
−16%, 911 Turbo 993 −15%, Land Cruiser 200 −12%, Trabant −12%, Alto Works −11%, Tesla Model Y −11%, E30 M3 −10%,
Ioniq Hybrid −10%. Most are period road-test figures on period tyres. Suspected: the model's tyre compounds are modern, and its
driver shifts perfectly. The Aygo is the outlier: the maker's figure with a modern car's tyres, 3.2 s slower than the
model. **Proposal**: check the Aygo's published figure first: is 14.2 s the manual's or the x-shift AMT's? (Not checked
here.) For the period cars, **rule** "period road-test figures, period tyres", or fix by giving them
period tyre compounds, which would be a preset change.

### C6 · Top speed over on cars the data does not mark governed

Honda S660 **+30%** (182 / 140), Honda Beat +18% (165 / 140), Suzuki Cappuccino +17% (176 / 150): Japanese kei
cars run a voluntary maker limiter (~140 km/h). Nissan 370Z +18% (296 / 250): its 250 km/h is the EU governor.
Toyota GR86 +19% (267 / 226): Toyota quotes 226 km/h, below the drag limit, so it is probably governed as well. Others:
Mustang 289 +22% (gross era), Trabant +18%, 205 GTI +11%. **Proposal: data**: mark the four governed cars
`limited:true` with a source. That is a preset change, for the owner to approve. The rest is C5's period-car rule.

## Known-gap lists, rerun

All 17 tests were rerun on build 474. All pass except **test145 and test170, which fail on `main`** (rows below).

| List (test) | Measured now | Proposal |
|---|---|---|
| `ACC_KNOWN` (41) | Supra A80 +11% (cap 16), WRX STI +8.8% (cap 11; default 8). Set RMS 6.8% (budget 9) | **Shrink**: Supra 16 → 12, STI 11 → 9. The Supra's residue is the 2–3 shift landing at 100 km/h (test48's note). **Rule** after that |
| `RATING_KNOWN` (115) | Dino 246: +9% (212 / 195 hp), inside 25%. The test prints "RESOLVED … remove it" | **Close**: remove the entry |
| `GAP_KNOWN` (96) | Model 3: 481 Nm at 953 A (measured 430; cap 485). Leaf: 113.5 kW (rated 80; cap 114), peak efficiency 97.5% | **Rule**: the electric-motor gaps are outside v1.0's engine scope; sign them off as they stand |
| `AT_LIMITER_KNOWN` (44, 46) | test44: 1.6 Sport NA I4 only. test46: 5 archetypes print at the limiter (1.6 NA, 1.0 Kei Turbo, 2.0 Hot-Hatch, 2.5 RS, 3.0 2JZ); the counted set is within budget 3 | **Fix in G1** (build 3) |
| `SPOOL_REAL` / `SPOOL_KNOWN` (56) | 13B: 90% boost at 3175 rpm against ~3000 (+6%), EGT 867 °C | **Rule** (owner, build 413: after v1.0). Re-measure in G2 |
| `AERO_KNOWN` (116) | Radical 1.93 g against 2 g (−3.5%). Huracán STO ClA 0.97 against 1.14 (−15%) | **Rule**: signed off with `AERO_FRONT/REAR` (owner's answer 4); the wing angles are unsourced |
| `NO_WIDTH_KNOWN` (171) | empty | **Closed**: keep the empty list as the guard |
| `FULL_LOAD_KNOWN` (145) | empty, and full load holds (0 wear). **But test145 fails on `main`**: free-revving, the Murciélago V12, both Huracán V10s and the BAC Mono wear (PISTON SPEED; the Mono's reason is blank). Bisected: passes at build 450 and fails from **build 451** (mechanical and turbo limits), first on TURBO OVERSPEED (the six small turbos), then on PISTON SPEED by build 467 | **Fix (bug)**: a free-revving engine should not trip a wear limit at its own redline. Find out why the limit trips, and why the Mono's reason is blank |
| `POWER_KNOWN` (48) | empty. test48 power RMS 5.6%, none over 15% | **Closed** |
| `T100_KNOWN` (48) | Supra RZ cap 20%, now +7% (default cap 15) | **Close**: remove the entry (its comment: retire when the shift moves back past 100) |
| `BRAKE_KNOWN` (63) | empty: every factory brake reaches its tyres' limit | **Closed** |
| `BRAKE_FLOOR_KNOWN` (47) | empty | **Closed** |
| `VANES_KNOWN` (49) | empty | **Closed** |
| `SPA_LIGHT_KNOWN` (76) | Golf GTI Mk7: 711 °C at Spa, list cap 711 (light-car bound 710) | **Rule**: 1 °C over the bound is inside the model's resolution. Or close, if a later brake build lands it at 710 |
| `LIFT_KNOWN` (204) | Mustang GT: the diff locks on the coast as on drive (no Torsen bias ratio published) | **Rule**: no published data |
| `OFF_KNOWN` (170) | **Fails on `main`**: the MX-5 is 5.1 m off the line, and the FK8, STI, 911 GT3 and Model 3 leave it (11–15 m, the GT3 and Model 3 86–87° sideways). Bisected: passes at build 440. From **build 441** the FK8 sits exactly at its 4.8 m cap and fails. Somewhere in **builds 449–462** the cars start leaving the line (450 and 456 both changed `stepCar`; not narrowed further) | **Fix (bug)**: the stepped car's driver cannot hold the line. Narrow it to 450 or 456 first |
| Moose run (173) | MX-5 62, Civic FK8 69, 911 GT3 67, F-150 Raptor 66 km/h. The test's band is 55–90; magazines publish 65–85 for road cars | **Data, then rule**: no per-car published figure is in the repo. Source one per tested car (e.g. the Swedish magazines' elk-test results), then decide. ~10 km/h under for the sporty cars, as v1-finish 16 said |

## Proposals, in short

| # | Kind | What |
|---|---|---|
| F1 | fix | G2 should close C1 (boosted low-rpm torque, 17 cars); add the test (G4 step 2) |
| F2 | fix | G1 should close C3 over (V8s, limiter lists), and measure C3 under in the same build |
| F3 | fix | Rotary IMEP factor and port breathing (C2). It is in no plan yet: the owner decides whether it goes before v1.0 |
| F4 | fix | 0–100 launch and rollout convention (C4) |
| D1 | data | Mark S660, Beat, Cappuccino and 370Z governed, with sources; check the GR86 (C6) |
| D2 | data | R34 GT-R rating (C3) |
| D3 | data | Aygo 0–100 source (C5) |
| D4 | data | Published lap times and moose figures for a scored subset (not held by the repo now) |
| R1 | rule | Period cars on period road tests (C5), gross ratings (C3), ECU-limit overs (C1) as named lists |
| R2 | rule | `GAP_KNOWN`, `SPOOL_KNOWN`, `AERO_KNOWN`, `SPA_LIGHT_KNOWN`, `LIFT_KNOWN` signed off |
| X1 | close | `RATING_KNOWN` (Dino) and `T100_KNOWN` (Supra) entries removed; `ACC_KNOWN` caps shrunk |
| B1 | bug | test170: the stepped-car driver leaves the line (builds 449–462) |
| B2 | bug | test145: free-revving engines trip wear limits (from build 451) |

## Every car

Model figure (published) and error. Errors over 10% are in bold. `gov` means a governed top speed, not scored.
ᵍ marks an SAE-gross rating. "Low-rpm" is boosted engines only, at the maker's torque-peak rpm.

| Car | Power hp (pub) | Torque Nm (pub) | Low-rpm Nm @ rpm | 0–100 s (pub) | Top km/h (pub) |
|---|---|---|---|---|---|
| **Kei & City** | | | | | |
| Suzuki Alto Works (HA36S, 2015) | 64 (64) +0% | 98 (100) −2% | 99 @ 3000 −1% | 9.74 (11) **−11%** | 140 (140 gov)  |
| Toyota Aygo 1.0 (2014) | 71 (68) +4% | 90 (93) −3% |  | 10.85 (14.2) **−24%** | 175 (160) +10% |
| Fiat 500 TwinAir 85 (2011) | 83 (84) −1% | 141 (145) −3% | 142 @ 1900 −2% | 10.09 (11) −8% | 180 (173) +4% |
| **Compact Turbo** | | | | | |
| Ford Fiesta 1.0 EcoBoost 125 (2013) | 122 (123) −1% | 170 (170) +0% | 95 @ 1400 **−44%** | 9.04 (9.4) −4% | 203 (196) +3% |
| VW Golf GTI (Mk7, 2013) | 225 (220) +2% | 346 (350) −1% | 348 @ 1500 −1% | 7.18 (6.5) **+10%** | 245 (246 gov)  |
| Toyota GR Yaris (2020) | 258 (257) +0% | 354 (360) −2% | 360 @ 3000 +0% | 5.11 (5.5) −7% | 230 (230 gov)  |
| Honda Civic Type R (FK8, 2017) | 303 (316) −4% | 394 (400) −2% | 400 @ 2500 +0% | 6.00 (5.8) +3% | 267 (272) −2% |
| **NA Sports** | | | | | |
| Mazda MX-5 1.6 (NA, 1989) | 116 (115) +1% | 139 (136) +2% |  | 8.49 (8.8) −3% | 202 (195) +4% |
| Toyota Corolla Levin GT-APEX (AE86) | 133 (128) +4% | 138 (149) −7% |  | 8.19 (8.5) −4% | 208 (200) +4% |
| Honda S2000 (AP1, 2000) | 213 (240) **−11%** | 182 (208) **−13%** |  | 6.86 (6.2) **+11%** | 250 (240) +4% |
| BMW M3 (E46, 2000) | 326 (343) −5% | 309 (365) **−15%** |  | 5.62 (5.2) +8% | 250 (250 gov)  |
| Porsche 911 GT3 (991.2, 2017) | 462 (493) −6% | 416 (460) −10% |  | 3.41 (3.4) +0% | 300 (318) −6% |
| **Turbo Performance** | | | | | |
| Toyota Supra RZ (A80, 1993) | 315 (320) −2% | 475 (427) **+11%** | 481 @ 4000 **+13%** | 5.24 (4.9) +7% | 250 (250 gov)  |
| Nissan Skyline GT-R V-spec (R34, 1999) | 390 (276) **+41%** | 382 (392) −3% | 388 @ 4400 −1% | 4.61 (5) −8% | 250 (250 gov)  |
| Subaru Impreza WRX STI (GD, 2004) | 273 (296) −8% | 412 (407) +1% | 419 @ 4000 +3% | 5.26 (5) +5% | 249 (250 gov)  |
| Mitsubishi Lancer Evolution IX (2006) | 286 (286) +0% | 425 (392) +8% | 433 @ 3500 **+10%** | 5.25 (5) +5% | 246 (250 gov)  |
| Audi RS3 Sportback (8V, 2017) | 398 (394) +1% | 482 (480) +0% | 249 @ 1700 **−48%** | 3.79 (4.1) −7% | 250 (250 gov)  |
| **American V8** | | | | | |
| Chevrolet Corvette (C6, LS3, 2008) | 523 (430) **+22%** | 589 (575) +2% |  | 4.57 (4.2) +9% | 335 (306) +10% |
| Chevrolet Corvette Z06 (C6, 2006) | 588 (505) **+16%** | 672 (637) +5% |  | 4.47 (3.7) **+21%** | 337 (318) +6% |
| Ford Mustang GT (2018) | 472 (460) +3% | 522 (569) −8% |  | 5.12 (4.6) **+11%** | 250 (250 gov)  |
| Dodge Challenger SRT Hellcat (2015) | 764 (707) +8% | 1038 (881) **+18%** | 1056 @ 4000 **+20%** | 4.57 (3.9) **+17%** | 325 (320) +1% |
| **Supercar** | | | | | |
| Ferrari F355 Berlinetta (1994) | 384 (375) +2% | 349 (363) −4% |  | 4.44 (4.7) −6% | 293 (295) −1% |
| Lamborghini Diablo VT (1993) | 526 (492) +7% | 541 (580) −7% |  | 4.25 (4.1) +4% | 330 (325) +2% |
| McLaren F1 (1994) | 591 (627) −6% | 589 (651) −10% |  | 3.65 (3.2) **+14%** | 363 (386) −6% |
| Porsche 911 Turbo (993, 1995) | 425 (408) +4% | 570 (540) +6% | 565 @ 4500 +5% | 3.84 (4.5) **−15%** | 301 (290) +4% |
| Ferrari Enzo (2002) | 636 (651) −2% | 600 (657) −9% |  | 3.61 (3.65) −1% | 345 (350) −1% |
| Porsche Carrera GT (2004) | 629 (604) +4% | 586 (590) −1% |  | 4.00 (3.9) +3% | 337 (330) +2% |
| Ford GT (2005) | 610 (550) **+11%** | 709 (678) +5% | 713 @ 3750 +5% | 3.90 (3.9) +0% | 344 (330) +4% |
| Lamborghini Murciélago LP640 (2006) | 639 (631) +1% | 646 (660) −2% |  | 3.45 (3.4) +1% | 343 (340) +1% |
| Ferrari 458 Italia (2010) | 529 (562) −6% | 472 (540) **−13%** |  | 3.60 (3.4) +6% | 331 (325) +2% |
| Lamborghini Huracán LP610-4 (2014) | 559 (602) −7% | 538 (560) −4% |  | 3.05 (3.2) −5% | 316 (325) −3% |
| McLaren 720S (2017) | 693 (710) −2% | 765 (770) −1% | 762 @ 5500 −1% | 3.07 (2.9) +6% | 348 (341) +2% |
| Ferrari 812 Superfast (2017) | 746 (789) −5% | 676 (718) −6% |  | 3.74 (2.9) **+29%** | 352 (340) +3% |
| Porsche 911 Turbo S (992, 2020) | 628 (641) −2% | 801 (800) +0% | 704 @ 2500 **−12%** | 3.01 (2.7) **+11%** | 336 (330) +2% |
| Lamborghini Huracán STO (2021) | 559 (631) **−11%** | 538 (565) −5% |  | 3.21 (3) +7% | 306 (310) −1% |
| Chevrolet Corvette Z06 (C8, 2023) | 619 (670) −8% | 570 (623) −9% |  | 3.57 (2.8) **+27%** | 324 (312) +4% |
| McLaren 750S (2023) | 717 (740) −3% | 798 (800) −0% | 797 @ 5500 −0% | 3.03 (2.8) +8% | 348 (332) +5% |
| **Rotary** | | | | | |
| Mazda RX-7 (FD, 1993) | 180 (255) **−29%** | 233 (294) **−21%** | 233 @ 5000 **−21%** | 6.26 (5.3) **+18%** | 245 (250 gov)  |
| Mazda RX-8 (2004) | 129 (232) **−44%** | 149 (211) **−29%** |  | 9.21 (6.4) **+44%** | 209 (235) **−11%** |
| **Diesel** | | | | | |
| VW Golf 2.0 TDI 150 (Mk7, 2013) | 147 (148) −1% | 326 (320) +2% | 316 @ 1750 −1% | 8.88 (8.6) +3% | 218 (216) +1% |
| BMW 330d (F30, 2012) | 251 (254) −1% | 531 (560) −5% | 483 @ 2000 **−14%** | 6.06 (5.6) +8% | 250 (250 gov)  |
| Chevrolet Silverado 2500HD Duramax (2020) | 436 (445) −2% | 1168 (1234) −5% | 1156 @ 1600 −6% | 7.87 (8) −2% | 160 (160 gov)  |
| **Performance SUV** | | | | | |
| BMW X5 M (F85, 2015) | 552 (575) −4% | 744 (750) −1% | 497 @ 2200 **−34%** | 4.26 (4.2) +1% | 250 (250 gov)  |
| Porsche Cayenne Turbo (958.2, 2014) | 500 (520) −4% | 744 (750) −1% | 582 @ 2250 **−22%** | 4.29 (4.5) −5% | 269 (279) −3% |
| Lamborghini Urus (2018) | 631 (650) −3% | 842 (850) −1% | 430 @ 2250 **−49%** | 3.68 (3.6) +2% | 292 (305) −4% |
| Jeep Grand Cherokee SRT (WK2, 2014) | 508 (470) +8% | 632 (630) +0% |  | 4.66 (4.9) −5% | 255 (257) −1% |
| **Diesel** | | | | | |
| Toyota Land Cruiser 200 VX 4.5 D-4D (2015) | 300 (272) **+10%** | 741 (650) **+14%** | 419 @ 1600 **−35%** | 7.69 (8.7) **−12%** | 214 (210) +2% |
| **Track** | | | | | |
| Radical SR3 RSX 1500 (2015) | 205 (210) −2% | 165 (179) −8% |  | 3.29 (3.2) +3% | 231 (240) −4% |
| BAC Mono 2.3 (2011) | 260 (280) −7% | 247 (280) **−12%** |  | 3.26 (3) +9% | 265 (274) −3% |
| **NA Sports** | | | | | |
| Nissan 370Z (Z34, 2009) | 331 (332) −0% | 376 (366) +3% |  | 5.39 (5.1) +6% | 296 (250) **+18%** |
| **Supercar** | | | | | |
| Honda NSX (NA1, 1991) | 276 (280) −1% | 282 (294) −4% |  | 5.37 (5.9) −9% | 279 (270) +3% |
| **Pickup** | | | | | |
| Ford F-150 Raptor (2017) | 440 (450) −2% | 721 (691) +4% | 731 @ 3500 +6% | 5.33 (5.4) −1% | 180 (180 gov)  |
| **Turbo Performance** | | | | | |
| Nissan GT-R (R35, 2017) | 546 (565) −3% | 628 (633) −1% | 633 @ 3300 +0% | 3.41 (2.9) **+18%** | 321 (315) +2% |
| Alfa Romeo Giulia Quadrifoglio (2017) | 502 (510) −2% | 591 (600) −2% | 318 @ 2500 **−47%** | 4.59 (3.9) **+18%** | 320 (307) +4% |
| Nissan 300ZX Twin Turbo (Z32, 1990) | 278 (283) −2% | 413 (375) **+10%** | 420 @ 3600 **+12%** | 5.87 (5.9) −0% | 250 (250 gov)  |
| Buick GNX (1987) | 295 (276) +7% | 644 (488) **+32%** | 653 @ 3000 **+34%** | 5.32 (5) +6% | 200 (200 gov)  |
| **Supercar** | | | | | |
| Ferrari Dino 246 GT (1969) | 212 (195) +9% | 214 (226) −5% |  | 5.89 (7.1) **−17%** | 249 (235) +6% |
| Ferrari F40 (1987) | 466 (478) −3% | 589 (577) +2% | 360 @ 4000 **−38%** | 3.78 (4.1) −8% | 328 (324) +1% |
| **NA Sports** | | | | | |
| Jaguar E-Type 3.8 FHC (Series 1, 1961) ᵍ | 182 (265) **−31%** | 324 (353) −8% |  | 6.47 (7.3) **−11%** | 212 (241) **−12%** |
| **American V8** | | | | | |
| Ford Mustang Fastback 289 (1965) ᵍ | 260 (225) **+16%** | 410 (414) −1% |  | 7.33 (8.8) **−17%** | 220 (180) **+22%** |
| **NA Sports** | | | | | |
| Porsche 911 Carrera RS 2.7 Sport (1973) | 228 (210) +9% | 242 (255) −5% |  | 4.67 (5.8) **−19%** | 247 (245) +1% |
| BMW M3 (E30, 1986) | 213 (197) +8% | 217 (240) −10% |  | 6.02 (6.7) **−10%** | 250 (235) +6% |
| Volkswagen Golf GTI (Mk1, 1976) | 103 (110) −6% | 139 (140) −1% |  | 8.49 (9) −6% | 188 (182) +3% |
| **Supercar** | | | | | |
| Ferrari 365 GTB/4 Daytona (1968) | 354 (352) +1% | 389 (431) −10% |  | 5.01 (5.4) −7% | 283 (280) +1% |
| Lamborghini Countach LP400 (1974) | 365 (375) −3% | 362 (361) +0% |  | 4.47 (5.6) **−20%** | 295 (290) +2% |
| **Turbo Performance** | | | | | |
| Audi Sport quattro (1984) | 305 (306) −0% | 384 (350) +10% | 389 @ 3700 **+11%** | 4.44 (4.9) −9% | 260 (250) +4% |
| **NA Sports** | | | | | |
| Mercedes-Benz 190E 2.3-16 (1984) | 205 (185) **+11%** | 217 (235) −8% |  | 6.36 (7.6) **−16%** | 242 (230) +5% |
| Peugeot 205 GTI 1.9 (1986) | 139 (130) +7% | 175 (161) +9% |  | 7.48 (7.8) −4% | 220 (198) **+11%** |
| **Turbo Performance** | | | | | |
| Ford Sierra RS Cosworth (1986) | 202 (204) −1% | 304 (276) **+10%** | 308 @ 4500 **+11%** | 6.11 (6.2) −1% | 237 (240) −1% |
| Lancia Delta HF Integrale Evoluzione (1992) | 208 (210) −1% | 329 (298) **+10%** | 322 @ 3500 +8% | 6.30 (5.7) **+11%** | 227 (220) +3% |
| **NA Sports** | | | | | |
| Honda Integra Type R (DC2, 1995) | 180 (200) −10% | 163 (181) −10% |  | 6.69 (6.2) +8% | 231 (230) +0% |
| Lotus Elise (S1, 1996) | 112 (118) −5% | 166 (165) +1% |  | 6.08 (6.5) −6% | 214 (202) +6% |
| BMW M5 (E39, 2000) | 416 (400) +4% | 458 (500) −8% |  | 5.30 (5.3) +0% | 250 (250 gov)  |
| **Two-Stroke** | | | | | |
| Trabant 601 S (1988) | 30 (26) **+15%** | 54 (54) +0% |  | 21.20 (24) **−12%** | 118 (100) **+18%** |
| **Kei & City** | | | | | |
| Honda S660 (2015) | 68 (64) +6% | 103 (104) −1% | 92 @ 2600 **−11%** | 10.71 (11.5) −7% | 182 (140) **+30%** |
| Honda Beat (1991) | 62 (64) −3% | 54 (60) −10% |  | 12.24 (11.5) +6% | 165 (140) **+18%** |
| Suzuki Cappuccino (EA11R, 1991) | 64 (64) +0% | 92 (85) +8% | 93 @ 4000 +9% | 9.85 (9.5) +4% | 176 (150) **+17%** |
| **Compact Turbo** | | | | | |
| Ford Focus RS (Mk3, 2016) | 336 (350) −4% | 435 (440) −1% | 249 @ 2000 **−43%** | 4.85 (4.7) +3% | 263 (266) −1% |
| Renault Mégane R.S. Trophy (2018) | 304 (300) +1% | 398 (420) −5% | 403 @ 3200 −4% | 5.41 (5.7) −5% | 261 (255) +2% |
| Suzuki Swift Sport (ZC33S, 2018) | 136 (140) −3% | 227 (230) −1% | 231 @ 2500 +1% | 7.54 (8.1) −7% | 211 (210) +0% |
| **NA Sports** | | | | | |
| Honda Civic Type R (EK9, 1997) | 159 (185) **−14%** | 143 (160) **−11%** |  | 7.36 (6.7) +10% | 222 (235) −5% |
| Toyota GR86 (2022) | 228 (235) −3% | 240 (250) −4% |  | 6.22 (6.4) −3% | 267 (225) **+19%** |
| Porsche 718 Cayman GT4 (2020) | 441 (420) +5% | 431 (420) +3% |  | 3.98 (4.4) −9% | 308 (304) +1% |
| **Turbo Performance** | | | | | |
| BMW M2 Competition (F87, 2018) | 397 (410) −3% | 541 (550) −2% | 305 @ 2350 **−44%** | 5.17 (4.4) **+17%** | 250 (250 gov)  |
| **NA Sports** | | | | | |
| Ariel Atom 3.5 (2013) | 209 (245) **−15%** | 185 (209) **−11%** |  | 4.14 (3.2) **+30%** | 250 (241) +4% |
| Mazda MX-5 2.0 (ND, 2015) | 154 (160) −4% | 194 (200) −3% |  | 7.25 (7.3) −1% | 229 (214) +7% |
| **Supercar** | | | | | |
| Dodge Viper SRT-10 (2008) | 646 (600) +8% | 788 (760) +4% |  | 4.29 (3.9) +10% | 329 (325) +1% |
| **NA Sports** | | | | | |
| Mercedes-AMG C63 (W204, 2008) | 548 (457) **+20%** | 623 (600) +4% |  | 4.54 (4.5) +1% | 250 (250 gov)  |
| **Diesel** | | | | | |
| Ram 2500 HO Cummins (2019) | 413 (400) +3% | 1099 (1356) **−19%** | 1030 @ 1800 **−24%** | 8.11 (7.5) +8% | 170 (170 gov)  |
| Toyota Hilux 2.8 D-4D (2016) | 173 (177) −2% | 443 (450) −2% | 441 @ 1600 −2% | 10.41 (9.5) +10% | 184 (185) −1% |
| Volkswagen Amarok 3.0 V6 TDI (2018) | 221 (224) −1% | 528 (550) −4% | 275 @ 1400 **−50%** | 8.09 (7.9) +2% | 197 (193) +2% |
| **American V8** | | | | | |
| Chevrolet Camaro ZL1 (2017) | 619 (650) −5% | 966 (881) +10% | 981 @ 3600 **+11%** | 4.80 (3.7) **+30%** | 317 (319) −1% |
| **Electric** | | | | | |
| Tesla Model 3 RWD (2021) | 273 (—)  | 426 (—)  |  | 5.90 (6.1) −3% | 225 (225 gov)  |
| Tesla Model Y Long Range (2022) | 483 (—)  | 550 (—)  |  | 4.47 (5) **−11%** | 217 (217 gov)  |
| Tesla Model S Plaid (2021) | 1064 (—)  | 1524 (—)  |  | 2.57 (2.1) **+22%** | 322 (322 gov)  |
| **Hybrid** | | | | | |
| Hyundai Ioniq Hybrid (2016) | 110 (104) +6% | 151 (147) +3% |  | 9.69 (10.8) **−10%** | 185 (185 gov)  |
| Toyota Prius (2016) | 88 (97) −9% | 119 (142) **−16%** |  | 11.12 (10.6) +5% | 180 (180 gov)  |
| Nissan Qashqai e-POWER (2022) | 151 (156) −3% | 204 (250) **−18%** | 202 @ 2400 **−19%** | 7.21 (7.9) −9% | 170 (170 gov)  |
| BMW 330e (2020) | 174 (182) −4% | 262 (300) **−13%** | 234 @ 1350 **−22%** | 5.67 (5.9) −4% | 230 (230 gov)  |
| Porsche 918 Spyder (2013) | 542 (599) −10% | 487 (540) −10% |  | 2.53 (2.6) −3% | 336 (345) −3% |
