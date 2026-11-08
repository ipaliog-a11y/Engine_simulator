# CG height from overall height (build 251)

Makers almost never publish a car's centre-of-gravity height; they always publish its overall height. NHTSA measured
both on hundreds of light vehicles:

- **Source:** Heydinger, Bixel, Garrott, Pyne, Howe, Guenther, *Measured Vehicle Inertial Parameters — NHTSA's Data
  Through November 1998*, SAE 1999-01-1336. Its table lists, per vehicle, wheelbase, tracks, **roof height**, weight
  and the **measured CG height**. A copy circulates as https://www.lfs.net/attachment/44487 (not stored here).
- **The paper's own finding:** "The C.G. height over roof height ratio ... do[es] not discriminate between vehicle
  classes or mass ... all the vehicle classes had a similar range of values."

`ratio.py` joins the paper's two tables (from `pdftotext -layout`) by vehicle and test, keeps the unladen tests (at
most a driver, no ballast) and prints CG / roof height:

| Set | n | median | mean | sd | range |
|---|---|---|---|---|---|
| all vehicles, unladen | 330 | **0.388** | 0.387 | 0.017 | 0.326–0.433 |
| cars (2S, 4S, 3H, 5H, 2C, SW) | 104 | 0.391 | 0.391 | 0.014 | 0.333–0.430 |
| trucks, SUVs, vans | 226 | 0.385 | 0.386 | 0.018 | 0.326–0.433 |

The game uses one rule for every car: `CG_ROOF_RATIO = 0.388` (src/js/vehicle-accel.js). It does not apply to a car
without a roof (an Ariel Atom, a BAC Mono, a Radical): their published height is a roll hoop's.
