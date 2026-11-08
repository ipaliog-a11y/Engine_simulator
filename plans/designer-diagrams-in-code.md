# Plan: value diagrams drawn in code, from the sim's own numbers

The generated diagrams (Grok's set, commit 0d8e2b8, since removed) looked right but showed the wrong things. They had
identical before-and-after panels, curves nobody computed, and a steel girder standing in for a tyre sidewall. An
image generator can't draw a correct mechanism or a correct curve, so the designers draw their diagrams the way they
already draw their live views: in code, to scale, from the same functions the build runs. This holds to the rule the
repository runs on: **derived, not fitted**. A diagram is derived, not drawn from imagination.

## The rule for every diagram

- **Two panels: the field at a low value and at a high value.** The values are the lowest and highest real examples
  the card already ticks (`cfg.ticks`). If a field has fewer than two ticks, the panels use the input's own `min` and
  `max`, or `PART_LIMITS`.
- **Each panel is the card's own drawing**, built from the engine, car or motor with only that field changed: the
  same drawer as the card's live view (`icdDrawCylinder`, `vcdDrawTyre`, `evdDrawViz`), or a new drawer listed below.
- **Each curve is computed** by the same code the build runs (`cfg.compute()` and `cfg.curve`), at both values, and
  drawn on the same axes so the two can be compared. Nothing is drawn by hand.
- **The current build must not change.** The comparison runs on a copy of the state and puts everything back. The
  proof is an identical fingerprint (AGENTS.md section 3).
- **If the sim does not model something, the diagram doesn't pretend it does.** For example, the silencer's
  back-pressure is not modelled, and the lap does not read the steering ratio. For such a field, either show no
  diagram, or say on it that the sim does not model this yet.
- Captions go through `tr()`. The palette is `DC_COLOURS`. The art is on a whole-pixel grid, as in `PixBuf`.

## The mechanism (first build)

Add `dcCompare(field)` to `DesignCards` in `src/js/design-cards.js`. It works in this order:

1. Read the field's low and high values.
2. Take a snapshot of the form.
3. Set the field to the low value, run `compute()`, and keep the result. Do the same for the high value.
4. Restore the snapshot.
5. Draw both results with the card's drawer, side by side, and both curves on the same axes.

It is shown in the `?` help panel, under the field's existing text. A slow computation (`cfg.slow`) waits, as the
preview already does.

## What each field needs

| Card | Fields | Panel drawer | Curve the sim already gives |
|---|---|---|---|
| ENGINE · BLOCK | bore, stroke, CR, cylinders, eccentricity, redline | `icdDrawCylinder` (exists, to scale) | power and torque (`r.pts`) |
| ENGINE · HEAD & VALVES | cam, VVT, valve material, springs, EGR | **new:** valve lift against crank angle, from `camSpec` (duration, lift, separation, phaser) | power and torque; the valve-float rpm |
| PARTS · camshaft | duration, lift, separation, phaser, profile | the same lift-curve drawer | the part preview's curves (`previewCam`) |
| ENGINE · INTAKE & EXHAUST, PARTS · intake/exhaust | runner, header, primary D/L, runner D/L, system D/L, flap | **new:** the pipe to scale, its length and diameter, and the tuned rpm marked (`runnerTuneRpm`, `primaryFor`) | power and torque (`previewIntake`, `previewPart`) |
| PARTS · air filter | housing, media, area, inlet | **new:** pressure drop against flow, from `filterDp` | power and torque (`previewFilter`) |
| ENGINE · AIR & BOOST | boost, turbo size, wheel, A/R, VGT, taper, torque limit, governor, intercooler | **new:** boost against rpm, from the boost model | power and torque |
| ENGINE · FUEL & SPARK | fuel, octane, injector, advance | the knock margin against rpm (from the knock model, if it exposes one; check first) | power and torque |
| ENGINE · COOLING | radiator, thermostat, fan | coolant temperature against power (only what the thermal model gives) | — |
| ELECTRIC · all cards | rotor D, stack, poles, turns, amps, max rpm, series, kWh, year | `evdDrawViz` (section, knee, pack: exists) | torque and power against speed |
| VEHICLE · WHEELS & TYRES | wheel, width, aspect, front width | `vcdDrawTyre` (exists, to scale) | — (the stats: radius, grip) |
| VEHICLE · GEARBOX | gears, spacing, final drive | **new:** rpm against road speed, the saw-tooth of the real ratios | the 0–100 km/h time from the stats |
| VEHICLE · AERO & WEIGHT | front, rear, floor, weight | **new:** downforce and drag against speed, from the aero tables | — |
| VEHICLE · BRAKES | brake type, rotor size | the rotor to scale inside the wheel | rotor temperature over a lap, from `brakeThermal` |
| VEHICLE · SUSPENSION | springs, bars, dampers, geometry | roll angle and front/rear load-transfer share; the body's bounce decay from the damping ratio (`zetaF`) | — |
| HYBRID | assist rpm, EV speed and power, charge band, deploy/harvest | the strategy's own lap trace (state of charge and motor power), where the hybrid views already draw it | — |

Before you draw a field, check that the sim really computes what the drawing shows. If it doesn't, the field goes on
the "not modelled" list in that build's test, with its reason.

## The order of the builds

Each build follows AGENTS.md: one pull request each, with a test (`WHY THIS EXISTS`), an identical fingerprint, the
guide and README updated, and a CHANGELOG entry.

1. `dcCompare`, plus BLOCK and WHEELS & TYRES (their drawers already exist).
2. ELECTRIC DRIVE (its drawers already exist).
3. The valve-lift drawer: HEAD & VALVES and the camshaft part.
4. The pipe drawer: INTAKE & EXHAUST, and the intake and exhaust parts. The filter's pressure-drop curve.
5. AIR & BOOST.
6. GEARBOX, AERO & WEIGHT, BRAKES, SUSPENSION.
7. FUEL & SPARK, COOLING, HYBRID.

Icons are a separate job: generated pictures from real photos (`plans/designer-art-brief.md`). Showing an icon
beside its choice is one small build, once the icons have passed review.
