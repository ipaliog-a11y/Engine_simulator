# Plan: Post-441 App-Wide Remediation & Physics Completion

Written on build 441 (`8b06a5c`) after an app-wide audit of `src/js/*.js`, `src/shell.html`, and `src/css/app.css`.

Covers every verified crash/`NaN`/infinite-loop bug, missing physics model (including items previously deferred in `plans/v1-finish.md` Group 3 / Phase J, now pulled into Waves 3–4 by owner decision), and missing UI/diagnostic/mode-parity element.

**18 builds across 5 waves.** Every wave is structured so concurrent builds touch **disjoint `src/` files** and can run in parallel without source merge conflicts (only routine `CHANGELOG.md` and `tools/stamp.mjs` re-stamping per `AGENTS.md §2`).

---

## Parallelism Map

```
Wave 1 (4 parallel):  B1 (EV/Hyb NaN)  |  B2 (ICE NaN/Leak)  |  B3 (Veh/GPX/Audio)  |  B4 (Race/Champ P0)
                           |                    |                     |                       |
Wave 2 (4 parallel):  B8 (EV/Hyb Thm)  |  B5 (SC/CI Pmax)    |  B6 (Load/Eco/Aero)  |  B7 (Race/Chal Phys)
                           |                    |                     |                       |
Wave 3 (3 parallel):  B10 (EV/Hyb Arc) |  B9 (ICE Knock/Lim) |  B11 (stepCar/Lap)   |
                           |                    |                     |                       |
Wave 4 (4 parallel):  B14 (441/EV Rpt) |  B13 (2S/Dsl/Oil)   |  B12 (DynAero/Env)   |  B15 (Champ/Audio)
                           |                    |                     |                       |
Wave 5 (3 parallel):  B17 (EV/Hyb UI)  |  B16 (Designers)    |  B18 (Canvas/Replay) |
```

Dependencies across waves:
- `B1 -> B8 -> B10 -> B17` (EV & Hybrid lane)
- `B2 -> B5 -> B9 -> B13` (ICE Physics lane)
- `B3 -> B6 -> B11 -> B12` (Vehicle & Driving Sim lane; `B12` also follows `B9` for ambient barometric pressure)
- `B4 -> B7 -> B15` (Race, Challenges, Championship & Audio lane)
- `B5` & `B8` -> `B14` (Diagnostics & Reports); `B11`/`B12`/`B13` -> `B16` (Designers); `B14` -> `B18` (Canvas/HUD/Replay)

---

## Wave 1 — P0 Crashes, `NaN`, Infinite Loops & Silent Corruption (4 parallel)

*Zero intentional movement on healthy stock presets.*

### B1 — EV & Hybrid `NaN` Guards and Race Free-Energy Fix
- **Files:** `src/js/electric.js`, `src/js/electric-ui.js`, `src/js/electric-race.js`, `src/js/electric-car.js`, `src/js/electric-cycle.js`, `src/js/power-split.js`, `src/js/hybrid.js`, `src/js/hybrid-views.js`, `src/js/electric-presets.js`
- **Scope:**
  - Guard `Bg = 0` / `wt = 0` / `hy = 0` in PM `magnetCircuit`, `statorFrom`, `dqSetup`, and `dqSolve` (small rotor + 12-pole Ferrite currently produces `0/0 = NaN` everywhere).
  - Floor IM `imSat` above a physical minimum (`>= 0.15`) so high `N*I/D` cannot invert torque or divide by zero in `imCurrents`.
  - Guard `peakHP === 0` / `peakHPrpm === 0` / `pRef === 0` in `scoreMotor`, `motorOperatingPoint`, and `evRaceFFNow` (triggered when `Imax <= ImR`).
  - Fix `packDraw` overload handling in `evRaceHeatStep`, `evLapHeat`, and `evCycle`: clamp demand to `packMaxPower` before computing heat so overload never returns `null` (`heat = 0`) and never produces negative `dE` (free recharge) in EV races.
  - Guard `packBuild` (`kWh > 0`, `series > 0`), `hybMachineFrom` (`T2 > 0`, cap `amps`), `hybrid.js` (`Pr + Pf > 0`), `hybrid-views.js` BSFC map (`best.b === Infinity` and dynamic torque Y-axis step), and merge the duplicate `unsure` key in the 918 Spyder preset.
- **Tests:** Existing EV/hybrid tests + 1 new regression test covering extreme PM/IM/pack/race-overload inputs.

### B2 — ICE `NaN` Floor, Live-State Isolation, Slider Bounds & Cache Fixes
- **Files:** `src/js/engine-physics.js`, `src/js/engine-constants-boost.js`, `src/js/gas-dynamics.js`, `src/js/engine-build.js`, `src/js/parts.js`, `src/js/obd.js`, `src/js/controls-boot.js`, `src/js/engine-view.js`, `src/js/share-scoring.js`, `src/shell.html`
- **Scope:**
  - Floor net dyno `torque` / `powerKW` / `powerHP` at `>= 0` *after* subtracting `electricalDragTorque`, and guard `peakTQ === 0` in `scoreEngine()` (small 1-cyl + 120–180 A alternator currently gives negative torque and `NaN` score).
  - Save/restore `state.iat`, `state.afr`, and `state.nitrousActive` in `buildKnockLimit()` and `peakCylLoads()` so live bench state never contaminates builds or Designer previews.
  - Floor `m`, `pc`, `T`, `Tu` strictly `> 0` before `Math.pow(..., 0.8)` in `intakeFill()`, `wallTrace()`, and `endGasTraceAt()`.
  - Enforce `compD_mm >= 30` when `edCompWheel > 0` (`1 mm` currently gives `9.9M rpm` shaft speed); clamp air-filter pressure-drop multiplier `(1 - dP/101325)` to `>= 0.05` so choked filters don't flip VE negative before clamping back to `0.2`.
  - Add `o2Loop` anti-windup clamp and reset `o2Loop` in `obdReset()` / open-loop transitions; call `peakCylLoads()` in `rederiveBreathing()`; invalidate hidden preset overrides `edSpringRpm` / `edRadHp` when the user edits displacement, redline, or boost.
  - Fix `drawCompMap` cache key (`buildRev` instead of `e.score` stringified to `"[object Object]"`); fix LIVE `RESET` button (`engine.stoichAFR`, refill nitrous, reset EV SOC/temps); surface `flash()` error when `#b=` hash decode fails.
- **Tests:** `test263` + existing boost/parts/OBD tests + regression checks.

### B3 — Vehicle, Suspension, GPX & WebAudio Crash/Loop Hardening
- **Files:** `src/js/vehicle-accel.js`, `src/js/drive-model.js`, `src/js/vehicle-spec.js`, `src/js/vehicle-designer.js`, `src/js/fuel-cycle.js`, `src/js/susp-window.js`, `src/js/gear-window.js`, `src/js/drift-run.js`, `src/js/skidpad-run.js`, `src/js/tracks-gpx.js`, `src/js/sound.js`
- **Scope:**
  - Clamp `vehicle.fWt` after ballast to `[0.15, 0.85]` and clamp `brakeValveRear` / `fR >= 0` so extreme front ballast never makes rear brakes accelerate the car or inject negative heat into rotors.
  - Fix `vFree = vTop || vRedline` fallback when drag exceeds drive force everywhere (`vTop = 0`); return explicit timeout flag from `simulateBraking` at `t = 25 s` instead of silent partial distance; clamp `1 + Kus*v*v >= 0.1` in `driveSineDwell`.
  - Guard `dt === 0` in `stepCar`, `xm <= 0` in `vcdDrawAids`, `< 3` gears in `fitGearbox`, `km === 0` / `tT === 0` in `hybridCycle`, and `fMax <= 0` in `gwNice`.
  - Cap/guard zero-damping resonance (`cb = cr = 0`) in `susp-window.js` so `yMax` never hits `NaN` or `Infinity` (infinite loop on tick axis).
  - Replace unbounded `while (dh > Math.PI)` angle-wrapping loops in `drift-run.js` and `skidpad-run.js` with modular wrap.
  - Harden `tracks-gpx.js`: accept `lon` before `lat` and single quotes, validate `Number.isFinite` and lat/lon ranges, reject zero-length/stationary traces, cap `nOut`, replace spread `Math.min(...xs)` to avoid stack overflow, bound `catmullClosed` index, interpolate missing `<ele>` tags and smooth elevation.
  - Guard every WebAudio `setTargetAtTime`, `soundDrive` (`s.afr`), `motorTorqueSplit` (`c.Tpk === 0`), `motorSoundState`, worklet `Gas.rate` (`E === 0`), and `e.redline` division against non-finite values.
- **Tests:** Existing vehicle/susp/GPX/sound tests + 1 new regression test.

### B4 — Race & Championship Critical Bug Fixes
- **Files:** `src/js/championship.js`, `src/js/race.js`, `src/js/race-tab.js`
- **Scope:**
  - Handle `'p:'` factory-car prefix in `champNewSeason()` so player factory team cars are not silently dropped from the grid; assign `classTag` to `'cur'` / `'g:'` player entries.
  - Fix `champApplyRaceToSeason()` prize money so credits are awarded only for the player's entrant(s), not every car P1–P8.
  - Guard `cfg.laps === 0` in timed races (`raceInit`) so `recEst` / `cap` never become `NaN` and `raceRecord` cannot loop infinitely.
  - Fix blue-flag ignore check in `raceStepOnce` to inspect the lapping car's gap (`by._ahead === c && by._gap < RACE.follow * 2`); reset `R.mistakeN = 0` when VSC deploys.
  - Sort `raceStandings` and winner banner by `finishT` (including `timePenalty`) to match `raceResults`; fix `raceAir` `0°C` falsy fallback (`Number.isFinite`); guard `TRACKS[R.cfg.track]` lookups when real circuits are absent.
- **Tests:** Existing race & championship tests + regression assertions for `'p:'`, prize payout, `laps: 0`, `0°C` air, blue-flag, and VSC.

---

## Wave 2 — Broken Physics & Core Parity (4 parallel)

### B5 — Supercharger Adiabatic Efficiency & Diesel / Ported Peak Cylinder Pressure
- **Files:** `src/js/engine-build.js`, `src/js/engine-physics.js`, `src/js/engine-constants-boost.js`, `src/js/engine-view.js`
- **Scope:**
  - Replace the broken `compIslandEff(0, PR) -> 0.35` clamp for superchargers in `deriveCharge()` with sourced physical efficiency curves per blower type (Roots ~0.55–0.62 rolling off above PR 2.0, twin-screw ~0.68–0.75, centrifugal ~0.72–0.78 on speed/flow; Heywood / Eaton / Whipple), plus an off-boost bypass/mechanical parasitic floor (~15% of full-boost drag).
  - Compute closed-cycle `pMax` for CI diesels (dual-cycle compression + burn) and ported engines (2-stroke / rotary) in `cylTraceAt()` instead of short-circuiting to `0`, activating `PMAX_LIMIT_CI = 200 bar`, wear, scoring, and diagnostics.
- **Tests:** `test263` (extend for diesel `pMax` and SC `compEff`) + boost/diesel tests.

### B6 — Wheel-Lift Load Conservation, Solid-Axle Roll, Aero Ceiling & Eco-Run Fixes
- **Files:** `src/js/tyres-brakes-driveline.js`, `src/js/vehicle-accel.js`, `src/js/racing-line-lap.js`, `src/js/eco-run.js`
- **Scope:**
  - Enforce vertical-load conservation on wheel lift: cap outer load `o = Math.min(Nax, F + d)` in `axleLatCap`, `Nf <= Wtot` in `simulateBraking`, and `drivenN <= Wtot` in `simulateAccelRun` (eliminates phantom normal load on rollover/stoppie/wheelie).
  - Clamp solid-axle roll-center height realistically below CG when `rTire > cg` so low-CG solid-axle builds don't collapse to `0.0°/g` roll.
  - Cap extreme-downforce `ceilAt` corner speed via tyre vertical load rating / suspension bottoming ceiling instead of jumping to `VMAX = 504 km/h` when `denom <= 0`.
  - Fix `eco-run.js`: compute rotational inertia `meff` from the active gear ratio rather than 1st gear `ratios[0]`; include aero downforce and `TYRE_MU_X` in `brakeCap` and remove straight-line `dCorner` scrub.
- **Tests:** Existing accel, lap, skidpad, and eco-run tests.

### B7 — Race Wet/Mandatory-Stop Strategy & EV/Hybrid Challenge Physics
- **Files:** `src/js/race.js`, `src/js/drift-run.js`, `src/js/moose-run.js`, `src/js/skidpad-run.js`
- **Scope:**
  - Pass `cfg.weather` and wet tyres into `racePractice()` so wet-race pit strategy computes wear on wet asphalt.
  - Incorporate `cfg.minStops` into `racePlan()` (`sMin = Math.max(sFuel, sTyre, cfg.minStops)`) and allow opportunistic pit stops under `R.vsc`.
  - Keep reduced slipstream/dirty-air wake active alongside spray in wet races; maintain idle fuel flow floor at low speeds.
  - Drift: disable clutch-kick (`init: 'kick'`) and virtual `clutch: 1` disengagement for `car.ev`.
  - Moose: neutralize regen for P2 hybrids (`car.el != null`, not just `car.ev`) during coast; preserve the sign of `s.rollV` when initializing rollover tip rate instead of forcing `Math.abs(s.rollV)`.
  - Skidpad: add 2-wheel-lift / rigid-body tip-over check matching `moose-run.js` so high-CG vehicles cannot hold lateral g above their Static Stability Factor.
- **Tests:** Existing race, drift, moose, and skidpad tests.

### B8 — EV & Hybrid Thermal, Regen & Bench Physics Parity
- **Files:** `src/js/electric.js`, `src/js/electric-ui.js`, `src/js/electric-car.js`, `src/js/hybrid.js`, `src/js/hybrid-bench.js`, `src/js/hybrid-race.js`, `src/js/power-split.js`
- **Scope:**
  - Wire `packChargePower(b, soc, tC)` (currently dead code) into EV/hybrid regen caps and add `vMax` / `cCharge` checks for `P < 0` in `packDraw()`; track real SOC evolution in single-lap `evLapHeat` instead of pinning `soc = 0.5`.
  - EV LIVE bench: initialize & step `state.tB` (`packHeatStep` / `packDerate`), pass `tB` to `packDraw` / `evBmsPower`, and allow negative regen torque testing.
  - Hybrid bench & track/race: apply `motorDerate()` and `packDerate()` with live `H.mT` and `H.tB.b`; add `hybLapHeat` / `hybRaceHeatStep` so small hybrid packs cannot pull 25C indefinitely.
  - Fix P2 hybrid full-throttle engine-start deadlock (`hybrid-bench.js:171`) by reserving cranking torque from `TmMax` while `H.engOn && !H.fired`.
  - Use `RHO_AL` for aluminium-conductor IM rotor cages (replacing hardcoded `RHO_CU`), include rotor slip frequency in IM iron loss, replace hardcoded PM saturation fit & `IM_CPSR = 3` with physical leakage-reactance breakdown torque, add magnet eddy-current loss estimate, and apply DC-DC boost converter efficiency (~97%, Toyota THS-II) in `power-split.js`.
- **Tests:** Existing EV, hybrid, and hybrid-race tests.

---

## Wave 3 — Deep Physics Expansion (3 parallel)

### B9 — ICE Knock (Coolant/EGR/Bore), Mechanical/Turbo Limits & Nitrous Accounting
- **Files:** `src/js/engine-physics.js`, `src/js/engine-constants-boost.js`, `src/js/gas-dynamics.js`, `src/js/engine-designer.js`, `src/js/parts.js`, `src/js/obd.js`
- **Scope:**
  - Wire `state.coolant` (`T_WALL` offset), `egrRate()` (charge dilution), and bore-scaled burn duration (`SI_BURN_DEG * (bore/86)^0.35`, Heywood flame travel) into `endGasTraceAt()`, bringing physics in line with Engine Designer help text.
  - Add live inertial wear above `PISTON_SPEED_LIMIT` (25 m/s) and rotary apex-seal sliding speed limit (~22 m/s, Mazda SAE) in `stepWear()`, and unify connecting-rod ratio (`ROD_RATIO`).
  - Add compressor surge-line check/warning (low flow at high PR) and shaft overspeed wear/diagnostic; add standstill intercooler face-velocity drop (heat-soak on dyno/launch); update stale `previewTurbo` shaft-inertia text (`parts.js:1152`).
  - Account for nitrous fuel enrichment in `meteredFuelKgS()` and cylinder pressure/heat load in `endGasTraceAt()`, `exhaustGasT`, and `computeEmissions`.
  - Add lean/rich combustion misfire roll-off and `obdMisfire()` flag at extreme petrol AFR bounds.
- **Tests:** ICE knock/combustion/turbo/OBD tests + `test263`.

### B10 — EV & Hybrid Architecture Expansion (Cooling, Inverter Thermal, Multi-Speed, TV, Power-Split, MHEV)
- **Files:** `src/js/electric.js`, `src/js/electric-car.js`, `src/js/electric-presets.js`, `src/js/ev-designer.js`, `src/js/hybrid.js`, `src/js/hybrid-bench.js`, `src/js/power-split.js`, `src/shell.html`
- **Scope:**
  - Add pack cooling options (passive air / forced air / liquid plate) and ambient/initial pack temperature (removing `[25, 60] °C` clamp in `evPackGain` so `packR` cold impedance derating works).
  - Add inverter thermal node & current derating (`invT` stepped from `invL` in `motorHeatStep`) and MG1 thermal node in `power-split.js`.
  - Add optional 2-speed EV gearbox (`EV_REDUCTION` -> selectable 1- or 2-speed with shift speed, e.g. Taycan), per-axle front reduction ratio (`evFrontFd`) for pure EVs, and independent dual-rear motor torque vectoring (replacing clutch-plate LSD approximation).
  - Make power-split planetary ratio (`rho`, `k2`, `busV`) configurable per preset/designer, add P0/P1 48V MHEV & P3/P4 hybrid topologies, and model P2 clutch engagement slip heat/loss instead of instantaneous RPM snap.
  - Expose `evMaker` regen calibration selector in `shell.html` (currently hidden input).
- **Tests:** Existing EV/hybrid tests + 1 new test covering cold pack derating, inverter thermal limit, 2-speed EV shift, and MHEV/TV behavior.

### B11 — Driving Sim `stepCar` & Lap Parity (Tyre Thermal/Wear/Wet, Brake Fade, Camber, Torque Converter, Lap Aids)
- **Files:** `src/js/drive-model.js`, `src/js/racing-line-lap.js`, `src/js/tyres-brakes-driveline.js`, `src/js/vehicle-accel.js`
- **Scope:**
  - Add tread temperature, warm-up window, wear, and wet grip to `driveTyre` in `stepCar` (and to `simulateLapCore` / `simulateBraking` when wet/cold conditions are active), plus tyre thermal degradation and smoke intensity in drift runs.
  - Apply `latCamberF` grip loss in `stepCar` (matching `latBalance`), wire `brakeHeatStep` / thermal brake fade and knee-point proportioning valve (`brakeValveRear` when `abs: false`) into `stepCar`, and add reverse gear support.
  - Model automatic torque converter (`GEARBOX.auto.stall` and `.mult`) in `stepCar` instead of treating automatics as a dry clutch.
  - Wire `vehicle.aids.abs`, `tc`, `esp`, and `awdMode` (`centreCoupling`) into `simulateLapCore` and `simulateAccelRun`, and add slip-angle understeer/oversteer to `racing-line-lap.js` steering trace.
- **Tests:** Drive-model, lap, braking, drift, and `test262` (AWD/TC/ESP) tests.

---

## Wave 4 — Dynamic Aero/Environment, Cycle-Specific ICE, Diagnostics & Championship/Audio (4 parallel)

### B12 — Dynamic Aero (Ride-Height/Pitch/Stall) & Global Environment (Altitude, Wind, Downforce Rolling Resistance)
- **Files:** `src/js/tyres-brakes-driveline.js`, `src/js/drive-model.js`, `src/js/vehicle-accel.js`, `src/js/vehicle-spec.js`, `src/js/racing-line-lap.js`, `src/js/fuel-cycle.js`, `src/js/eco-run.js`, `src/js/engine-constants-boost.js`
- **Scope:**
  - Couple `stepCar` `s.heave` and `s.pitch` into live `clA`, `cdA`, and `aeroBal` (ground-effect ride-height sensitivity and pitch aero balance shift), and add post-stall lift drop + drag rise above `WING_CLMAX` in `wingAero`.
  - Add suspension travel / bottoming check in `racing-line-lap.js` and `vehicle-accel.js`.
  - Replace hardcoded `AIR_RHO = 1.20` and `101325 Pa` with an ambient environment model (altitude/barometric pressure & air temp -> `airRho` + intake ambient pressure, plus headwind/tailwind component).
  - Include aerodynamic downforce `N` (not static `m * G`) in rolling resistance across `vehicle-accel.js`, `racing-line-lap.js`, `fuel-cycle.js`, and `eco-run.js`.
- **Tests:** Aero, lap, accel, and fuel-cycle tests + 1 new test verifying ride-height aero shift, post-stall drag, altitude power/drag drop, and downforce rolling resistance.

### B13 — 2-Stroke Expansion Chamber, Unthrottled Diesel, Silencer Back-Pressure & Oil Pressure
- **Files:** `src/js/engine-physics.js`, `src/js/gas-dynamics.js`, `src/js/friction.js`, `src/js/parts.js`
- **Scope:**
  - Model 2-stroke tuned expansion-chamber resonant stuffing wave (length/RPM-tuned return pulse independent of 4-stroke valve overlap) and transition 2-stroke/rotary friction & breathing toward derived models where sources exist.
  - Implement unthrottled quality-governed diesel operation on the LIVE bench (fuel-quantity load control at atmospheric/boosted manifold pressure instead of throttling intake to `0.12 bar` vacuum).
  - Model exhaust silencer back-pressure from chamber/baffle geometry (`parts.js:12, 1024`).
  - Add oil-pressure model (RPM-driven pump flow vs viscosity/oil-temp leakage, relief valve ceiling, and low-oil-pressure wear/warning).
- **Tests:** 2-stroke, diesel, rotary, and parts tests.

### B14 — Build 441 & EV Diagnostics Everywhere (LIVE, OBD, ECU, Guided Build, Reports)
- **Files:** `src/js/dyno-ui.js`, `src/js/obd.js`, `src/js/ecu-computer.js`, `src/js/guided-build.js`, `src/js/reports.js`, `src/shell.html`
- **Scope:**
  - Surface live `state.cylPmax` (bar) and `state.preIgn` warnings on the LIVE bench; add `state.blown` and `state.wearCause` to `renderDynoResult()`'s memo key so `#dynoDiag` never goes stale.
  - Add OBD fault codes for `PRE-IGNITION`, `OVER-PRESSURE`, `OIL OVER-TEMP`, `LOW OIL PRESSURE`, and `ECU BOOST CUT`; display code title, status, and freeze-frame values in `ecuRenderDiag()`.
  - Fix ECU Computer EGT enrichment LED (`ecuLeds`) by comparing against pre-EGT base AFR rather than `mappedAFR()`; add `cylPmax`, `preIgn`, `egt`, `oil`, `oilP`, and `boostActual` scope channels; allow user selection of narrowband vs wideband O2 sensor.
  - Add Build 441 (`icdPreIgn`, `pMax > pMaxLim`) and EV (`evdCompute`) limits to Guided Build (`gwLimit`, `gfLimit`).
  - Reports: include `diagnoseEngine()` warnings on Dyno PNG/PDF sheets; include Build 436 track conditions (`weather`, `air`, `tyre`) on Hot Lap reports; fix `lapVehicleRows` and implement full EV Dyno PNG/PDF export instead of `"0.00 L 4-cyl NA"` / `EV_REPORT_NOTE`; include `engine.icPart` in `reportSpecRows`.
- **Tests:** `test263`, OBD/ECU, guided-build, and report tests.

### B15 — Championship Completion, Timed-Race Countdown & Cross-Mode Audio
- **Files:** `src/js/championship.js`, `src/js/champ-tab.js`, `src/js/race-tab.js`, `src/js/series.js`, `src/js/sound.js`, `src/js/skidpad-run.js`
- **Scope:**
  - Championship: add `"WATCH REPLAY"` button wired to `raceUI.run`; add series for the 5 unreachable classes (`kei_cup`, `muscle`, `touring`, `proto`, `hyb_cup`); enforce class eligibility for player team cars; wire `S.economy.tyres` allocation and distinct `CAREER` mode progression; update Instant Season progress bar and redraw track preview on `#champSeries` change.
  - Timed races: render remaining countdown clock (`MM:SS`) instead of `LAP X / est` when `cfg.durationSec > 0`.
  - Audio: wire `motorSoundState` into Drift, Skidpad, Spiral, and Figure 8 so EVs are audible in challenges; stop muting Hybrids in Drift when the bench engine was off; record slip angle `alpha` in `skidpad-run.js` and enable engine + tyre screech audio on Skidpad, Spiral, Figure 8, and the focused car on the Race tab.
- **Tests:** Championship, race, challenge, and sound tests.

---

## Wave 5 — Designers, EV/Hybrid UI & Canvas/Replay Polish (3 parallel)

*UI/UX only — zero physics/preset movement.*

### B16 — Vehicle & Engine Designer Fixes, Setup Warnings & Layout Validation
- **Files:** `src/js/vehicle-designer.js`, `src/js/vehicle-spec.js`, `src/js/engine-build.js`, `src/js/engine-designer.js`, `src/js/cost-challenge-ui.js`, `src/shell.html`
- **Scope:**
  - Fix ballast summary in `vcdSummary` (`+g('vhBallast') > 0`), final-drive label in `updateGearingLabel` (`vehicle.finalDrive`), hybrid front-motor curve in `vcdForce`, and circuit challenge budget bar (`ev.cost` instead of `m.cost`).
  - Add `vhAwdMode` selector to Vehicle Designer `CHASSIS & DRIVE` (synced with Track/Race/Chal) plus chassis alignment/ride-height inputs (`camberF/R`, `rideHeight`) already consumed by `drive-model.js`.
  - Add Vehicle Designer safety warnings: rotor-in-wheel clearance, rollover hazard (`track/(2*cg) < mu`), tyre load-rating overload, rear-before-front brake lockup (`brakeLockOrder`), 200–0 brake fade, and aero spring bottoming.
  - Block invalid engine cylinder/layout combinations (1/3/5-cyl V/Boxer, 12-cyl Inline); sync rotary `edEcc` max to `bore/5`; disable `edCompWheel`/`edHousing` when custom `turboPart` is active and `edTaperPct` when `edTaperRpm === 0`; add `turboLoad`, spool RPM, `compEff`, and peak EGT readouts to Engine Designer.
  - Account for `engine.icPart` (water-to-air / custom intercooler) in `computeCost()` and `updateDesignSummary()`.
- **Tests:** Designer, cost-challenge, and `test73` (mobile width / no horizontal scroll).

### B17 — EV & Hybrid Bench Telemetry, Garage & Designer UI Parity
- **Files:** `src/js/electric-ui.js`, `src/js/hybrid-bench.js`, `src/js/ev-designer.js`, `src/js/saves-garage.js`
- **Scope:**
  - EV LIVE bench: display pack °C bar & thermal warning; scale magnet temp bar dynamically (Ferrite 250 °C no longer clipped at 200 °C); label induction motors `"IM MOTOR"` instead of `"PM MOTOR"`; clamp dyno `KNEE` marker inside chart bounds; add 2D EV efficiency contour & regen dyno view.
  - Hybrid bench: display motor temps (`H.mT`), show front motor (`evFront`) in flow diagram and telemetry, color SOC bar from `hybTune().socLo/socHi` instead of hardcoded 35–85%, and show P2 clutch `CRANKING`/`OPEN` until `H.fired`.
  - Fix EV Garage detail drawer (`garageDetail`) to display EV motor/pack specs rather than falling back to `ENGINE_TYPE.petrol4`.
  - Enable `evdComputeSlow` preview for hybrid motors and add `evFrontOD` to `evdFrontOnly`.
- **Tests:** EV/hybrid UI, garage, and `test73`.

### B18 — Canvas/HUD Visual Glitches, Challenge Replay Controls & GPX Delete
- **Files:** `src/js/dyno-ui.js`, `src/js/track-view.js`, `src/js/engine-view.js`, `src/js/track-scene-v2.js`, `src/js/susp-window.js`, `src/js/chal-view.js`, `src/js/chal-rank.js`, `src/js/fullscreen-track.js`
- **Scope:**
  - Fix dyno canvas verdict/legend collision (`iy+41`); fix track digital HUD hot-brake square / G-meter overlap and shift-light spacing.
  - Remove stray legacy BOV/knock debug rectangles (`engine-view.js:126-133`); check `e.valvetrain` instead of `e.valves === 2` when drawing OHV vs OHC.
  - Pause particle spawning/movement in `track-scene-v2.js` when replay is paused; use `'nonzero'` instead of `'evenodd'` on `fillRibbon` (fixes figure-8 intersection holes); keep 3D props and night grading consistent when the 20-tile guard triggers.
  - Challenge replays (`chal-view.js`): add Play/Pause and scrub bar; fix EV Drift tach redline (`engine.motor.nMax`) and add handbrake bar to `drawDriftHud`; distinguish genuine failure reasons (`no-hold`, `no-clear`, `no-run`) from `"not ready yet"`; update stale Moose ("48 lines") and Drift AWD handbrake copy; surface `r.err` tooltip in `chal-rank.js`.
  - Add missing red `"wheel in air"` legend entry in `susp-window.js`; add delete button for imported GPX tracks in `#trackSetup`.
- **Tests:** Dyno, track/replay, challenge, and `test73` + Playwright screenshots.

---

## Rules per Build (`AGENTS.md`)

1. Start each build in a fresh session on a new branch off `origin/main` (`cursor/<short-topic>`).
2. Run `node tools/build.mjs` and `node tools/stamp.mjs` once per PR; verify `build.mjs --check` and `stamp.mjs --check`.
3. Derive constants from sourced physics (cite papers/spec sheets beside constants); never tune a constant to pass a test.
4. Keep `tr('...')` on new interface text; do not add Greek translations while paused (`AGENTS.md §0`).
5. Run only the targeted tests for touched subsystems (`node tests/run.mjs ...`) and list them on a `Tests:` line in the PR body.
6. Update `CHANGELOG.md` (and `src/html/guide.html` / `README.md` wherever user-facing behaviour changes).
