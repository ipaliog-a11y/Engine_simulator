# Guided build that sets values (plan, build 340)

Owner's request (November 2026), from `plans/road-to-v1.md`, "After v1.0". Build 308's GUIDED BUILD
(`src/js/guided-build.js`, `tests/test188.mjs`) picks a real car from three questions (kind, budget, what matters).
This plan adds what comes after: a walk through the existing design cards that sets values, one decision per step.
**No new physics.** Every number shown comes from the functions the cards already call.

## Principles

- **The matched car is the start.** After BUILD THIS CAR, a new button **SHAPE IT** opens the walk-through on that
  car. Every field starts at the car's own value, so skipping every step gives back the factory car.
- **One decision per step.** A step shows one to three fields of one card. It reuses that card's slider, its ticks for
  the real engines/cars, its `?` help (`ICD_FIELDS`, `EVD_FIELDS`, `VCD_FIELDS`), and its limits (the input's
  `min`/`max`, the options disabled by `syncDesignEnable`). The rest stays on the cards under ADVANCED.
- **The walk-through edits the real form.** It moves the same inputs the cards move, so BUILD, the fingerprint and
  saving all work as they do now. Nothing is duplicated.
- **A step whose fields are all disabled is skipped.** For example, a step for boost is skipped on an NA engine. The
  step list is worked out again after every change to a coupled field (see below).

## The steps

`[c]` marks a coupled field (in `ICD_DEPS`, `EVD_SPEED_FIELDS`, or a field that `syncDesignEnable` reads). The range
is the input's own range today.

### Piston, naturally aspirated (`edType` petrol4, `edIntake` na)

| # | Step | Fields | Limits | Help / guide |
|---|---|---|---|---|
| 1 | Cylinders and layout | `edCyl`, `edLayout` | 1–12 (type cap `maxCyl`); inline, V, boxer | `ICD_FIELDS`; guide `bottom`, `firing` |
| 2 | Bore and stroke | `edBore`, `edStroke` | 60–110 mm, 50–130 mm | `bottom`; cylinder picture, low/high compare |
| 3 | Fuel | `edFuel` [c], `edOctane` | octane only on pump gas | `fuels` |
| 4 | Compression | `edCR` | 7–24 | `knock`; knock bar |
| 5 | Head and cam | `edValves`, `edCam`, `edVVT` | options | `valvetrain`, `vvt` |
| 6 | Redline | `edRedline` | 2,000–11,000 rpm | `redline`; valve-float bar |
| 7 | Breathing | `edRunner`, `edExhaust` [c] | options | `waves`, `header` |
| 8 | Body and drive | `vhChassis`, `vhDrive` | options | `vehicle`, `traction` |
| 9 | Mass | `vhWeight` | options | `vehicle` |
| 10 | Gearbox and gearing | `vhGearbox`, `vhGears`, `vhGearing` | final drive 0–100 (short to tall) | `gearbox`, `gearing` |
| 11 | Tyres | `vhTire`, `vhTireW` | 135–355 mm | `tyres` |

Fuel comes before compression on purpose, because the fuel sets the knock limit that compression meets.

### Turbo or supercharged petrol

The NA list, plus one step after step 4:

| 4a | Air and boost | `edIntake` [c], `edTurboSize` (turbo) or `edScType` (supercharger), `edBoost`, `edIntercooler` | boost 0–2.5 bar | `turbo`, `wastegate`, `intercooler` |

Boost and compression share one knock limit. Step 4a shows the knock bar too, and the hint in build 2 names knock
whichever of the two fields moved it.

### Diesel (`edType` diesel)

The fuel is fixed, and there is no spark or octane, so step 3 is skipped. Step 6 adds `edGovRpm` [c], the rated
speed. Step 4a is kept, since almost every diesel has a turbo. The knock bar is replaced by the limits the scorecard
already reads for a diesel (whatever `safety` gives for compression ignition). That is to be checked in build 2. If it
is not meaningful, the hint names only power and reliability.

### Rotary (`edType` rotary), and two-stroke

- **Rotary:** step 1 sets rotors (1–4) and no layout. Step 2 sets rotor R and W (`edBore`/`edStroke` relabelled) and
  `edEcc` (8–25 mm). Step 5 is skipped (no poppet valves). The rest are as NA or turbo. The card's low/high picture is
  off for a rotary (`compare.ok`). The hint still works, because `icdCompute` builds a rotary.
- **Two-stroke:** like the rotary, ports with no head step, cylinders capped at 6.

### Electric (`edType` electric; EV cards, `evdCompute`)

| # | Step | Fields | Limits | Help / guide |
|---|---|---|---|---|
| E1 | Motor kind | `evMotorType` [c] | options | `evmotor` |
| E2 | Motor size | `evRotorD`, `evStack` | 80–260 mm, 40–250 mm | `evmotor`; section picture |
| E3 | Winding | `evTurns` | 4–120 | knee picture |
| E4 | Inverter current | `evAmps` | 100–1,600 A | `inverter`; current density |
| E5 | Battery | `evChem`, `evSeries`, `evKWh` | 20–400 cells, 0.5–200 kWh | `battery`; pack picture |
| E6 | More motors | `evFront` [c], `evRearCount` | options | `evmotors` |

Then vehicle steps 8, 9 and 11. Step 10 becomes final drive only, since an EV has one speed.

### Hybrid (`edHybrid` p2, ps or series)

Hybrids take the combustion steps for their engine (NA or turbo), then add:
H1 Hybrid layout (`edHybrid` [c], `edHyDeploy` [c], `edHyPlug`), then E2, E4 and E5 on the hybrid motor and pack
(`evdCompute`'s hybrid branch), then the vehicle steps.

## Coupled fields

1. **Order first.** Every coupled field sits in a step before the fields it enables or disables: fuel before
   compression, intake before boost, motor kind before its magnets, hybrid layout before its motor.
2. **Re-sync after.** A change to a coupled field runs `syncDesignEnable()`, as the cards already do
   (`design-cards.js:126`). The step list is then rebuilt, and steps with no enabled field drop out (or come back).
3. **Timing stays AUTO.** `edTiming` [c] and `edIntakeSys` [c] are not steps. With AUTO timing, the ECU advances the
   spark to the knock limit, so the knock bar the hints read is the real one. A car that loads with FIXED timing keeps
   it, and steps 3–4 say so.
4. **Physical coupling is not hidden.** Boost, compression and fuel all meet knock. The walk-through does not solve
   for them together. Each step shows the knock bar, and the hint names the limit it meets.

## Goal hints (build 2)

- **What it computes.** When a step opens, take each numeric field one step below and one step above its current
  value (a step is 5% of the range, or the next real-engine tick if one is closer). Run the step's preview at each:
  `icdCompute`, `evdCompute` or `vcdCompute`. Report the change in the measure of the goal chosen in build 308:
  - **QUICKEST:** peak power, and torque for engine steps; 0–100 for vehicle steps.
  - **LIGHTEST:** mass. Engine mass is not in `icdCompute`'s result today. Build 2 reads the mass the vehicle takes
    from the engine; if that needs a full rebuild, the hint shows power-to-weight instead and says so.
  - **CHEAPEST:** cost (`icdCompute.cost`, `evdCompute.cost`, `vcdCompute.cost`).

  The hint is one line, for example: "Higher: +14 hp toward QUICKEST · meets valve float at 7,800 rpm." It gives a
  direction and the limit met: knock (`icdKnockOver`), valve float (`icdFloatShort`), tyre speed rating
  (`vcdTyresShort`), grip-bound launch (`vcdGripBound`), or motor current density and tip speed on the EV side.
  **It never gives a "best value",** and nothing searches for one.
- **Choices** (selects): only the neighbouring options are run, never the whole list.
- **Cost.** An engine step costs 2 builds per numeric field, at ~50–150 ms each. That is at most ~0.6 s for a
  two-field step, run once when the step opens, and again 150 ms after a slider stops (the cards' own `delay`). The EV
  preview has no `buildEngineCore`, so it should be cheaper; build 2 measures it. Vehicle steps need `perf`
  (`simulateAccel`, ~1 s): their hint runs once when the step opens, behind a "working" mark, and is cancelled if a
  field moves. 0–100 and the price are worked out again at the end of a step, never while a slider moves.
- **Safety.** `icdCompute` puts back the engine and state. The test checks that the form and `engine` are unchanged
  after a hint, and the fingerprint must be identical.

## Finish screen (build 3)

Two columns: the build against the car it started from. Rows: power, torque, 0–100, top speed, mass, price and
reliability, each with its change, and the row for the chosen goal highlighted. Under the table, one line names the
limit the build sits on: the first of knock, valve float, grip, tyre rating and current density that is lit, in the
cards' own words (`limits().verdict`). Actions: **DRIVE IT** (VEHICLE tab), **BACK TO STEPS**, and **START OVER**
(reload the factory car). The figures are the scorecard's and `perf`'s after BUILD, not new estimates.

## The three builds

| Build | What | Fingerprint | Test |
|---|---|---|---|
| 1 | Walk-through: SHAPE IT, the step lists above, skip rules, BACK/NEXT, ADVANCED link to the full card, phone width | identical | Each powertrain's start car (NA, turbo, diesel, rotary, EV, hybrid) shows its steps in order; NA skips 4a; changing `edIntake` to turbo adds 4a; a slider sets the form field; skipping every step leaves the factory engine unchanged |
| 2 | Goal hints | identical | The hint's direction matches the sign of `icdCompute`'s change; the form and `engine` are unchanged after a hint; a step's hint finishes in under 1 s for an engine step |
| 3 | Finish screen | identical | The figures equal the scorecard's and `perf`'s after BUILD; the limit line matches the lit limit; START OVER restores the factory car |

The README section on GUIDED BUILD (line ~457) and the guide's opening line are updated in builds 1 and 3. Greek is
paused (AGENTS.md section 0): strings go through `tr()` only.

## Owner's questions

1. **The step list.** Is the order above right: engine first (block, fuel, compression, boost, head, redline,
   breathing), then the car (body, mass, gearing, tyres)? *Recommendation: yes. The car's steps are short, and
   the engine is what learners come for.*
2. **How many steps.** The NA list has 11 steps (12 with boost). Cut it to 7 by leaving breathing, mass and tyres to
   ADVANCED? *Recommendation: keep 11, with SKIP TO FINISH on every step.*
3. **Timing.** Keep `edTiming` AUTO in the walk-through, with FIXED only on the card? *Recommendation: yes.*
4. **Rotary and two-stroke.** Give them their own branch (as above), or offer them only on the cards?
   *Recommendation: their own branch. It costs only skip rules.*
5. **Hybrid.** Combustion steps, then the hybrid motor and pack (as above), or the engine only?
   *Recommendation: as above. The EV cards already have a hybrid branch.*
6. **Vehicle-step hints at ~1 s each.** Run them when the step opens (with a "working" mark), or only on a HINT
   button? *Recommendation: when the step opens, cancelled if a field moves.*
7. **The size of a hint's step.** 5% of the range, or the next real-engine tick? *Recommendation: whichever is
   closer, so the hint stays local and anchored to real parts.*
