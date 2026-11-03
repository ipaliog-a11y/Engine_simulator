# Plan: the electric drivetrain after v0.7

**Status:** stage 0 is the lock in `tests/test136.mjs` (build 225). Stage 1, lamination
thickness, is build 226. Stage 2, regeneration strength, is build 227. Stages 3–13 are not
built. The locked numbers are the drive as it stood at build 224, with lamination at 0.35 mm
and regeneration at HIGH.

The drive that shipped in builds 178–184 is a real machine up to the knee and a drawn shape
after it. This is the order for deepening it. Each stage is one build and one pull request.
[motor-design.md](motor-design.md) says what each field should cost; this file says the order,
and what is not allowed to move while you do it.

Hybrids call the same motor and the same pack. A change in `src/js/electric.js` moves the
Ioniq, the Prius, the Qashqai, the 330e and the 918 as well as the three Teslas.

---

## The rule on every stage

Derive, do not fit. A number comes from a relation and a source named beside it. If the model
cannot reach a published figure, leave the gap and write it in the CHANGELOG. Do not retune
`FLUX_KM`, `SAT_K` or `V_DROP` to buy a result back, and do not widen a band in `test96`,
`test100`, `test101` or `test102`.

Before the first line of a physics stage, record the fingerprint of `origin/main` and compare,
as `AGENTS.md` describes.

- A stage marked **still** must come back identical. Say so in the pull request.
- A stage marked **moves** reports the range (for example peak power, Wh/km, 0–100) and whether
  the error against the published figures got better or worse.

`tests/test136.mjs` locks the model's own output, tighter than the published-figure bands. Those
bands are 8–20%, so a drive can drift inside them and stay green. The lock is 0.2% on the
energy and the torque samples, and 0.01 s on the 0–100.

Edit a locked value only in the stage the table names, in the same commit as the physics, with
the old number and the new one in the CHANGELOG. A still stage that needs to edit the lock is
the wrong stage.

| Block in test136 | What it freezes | Stages that may edit it |
|---|---|---|
| Car score, pack, reduction, masses | The three Teslas as built | 4 (efficiency, heat, Wh/km). Not the 1000 rpm torque, the pack resistance, the ratio or the mass, unless the CHANGELOG shows why that stage's mechanism reaches them |
| 0–100, top speed, centre of gravity | The road | 11 (the pack's height). Top speed only if the drag-limited speed actually moved |
| Plateau and tail | Constant power to 4× the knee, then 1/ω² | 5, and only 5 |
| Hybrid motors | The five factory hybrids' motor torque, power and pack | Any stage whose mechanism reaches a hybrid. 1, 2, 6–10 and 12 do not |
| Absent fields | No lamination, wire, regen or second-gear control | 1, 2, 6 and 9, each replacing only its own "not on the form yet" line |

Run this set before pushing any stage. It is the electric drive, the race, the three cars, the
cycle, and the hybrids that share the parts:

```
node tests/run.mjs 96 99 100 101 102 103 106 110 111 112 113 114 136
```

Add `87` when a stage adds a visible string, and `73` when it edits a guide page. Add the new
test the stage introduces. `test41` and `test43` join the run when the stage edits a file the
combustion lap or the 0–100 also calls (`vehicle-accel.js`, `racing-line-lap.js`, `race.js`,
`powertrain.js`).

Each stage adds its own `tests/testNNN.mjs` for the new mechanism, with a WHY THIS EXISTS header,
and a time in `tests/durations.json`. The new test is written against the behaviour, so it would
fail on the previous build. `test136` staying green is what proves the old behaviour survived.

One finding is already locked, so it is not tidied inside another stage. On the Model 3 the
continuous power reads 294 kW and the peak 205 kW. Peak is the pack at half charge.
`motorContinuousKW` is the motor's thermal hold at 1.5× the knee with no pack cap. Capping one
by the other is its own build, or it waits for stage 4 if the heat model is what changes the
294.

---

## Stage 0 — the lock

**Still.** No change to `src/`. `test136` records the three Teslas (score, a torque sample at
1000 rpm, at the knee, at 2× the knee and at the redline, pack resistance and power, WLTP
Wh/km, 0–100, top speed, centre of gravity), a motor that revs past 4× its knee (power flat
through 4×, then 4/5 at 5× and 4/6 at 6×), and the five hybrids' motors. It also records that
lamination thickness, wire, regen strength and a second gear are not on the form, and that
`CPSR` is 4 and `IM_CPSR` is 3.

Nothing in the simulation moves. The fingerprint is identical because the sources did not change.

---

## Stage 1 — lamination thickness on the form

**Still** for every factory car.

`motorLosses` already scales the eddy term with `(t / 0.35)²`. The form never sends a thickness,
so every motor is 0.35 mm. Add the field, default 0.35 mm, with a cost. 0.20 mm and 0.35 mm are
enough; both are real non-oriented electrical steels.

The new test: at the same torque and a high speed, 0.20 mm loses less iron than 0.35 mm and
costs more; at low frequency the two are close, because hysteresis does not scale with
thickness. The default build's iron loss matches the locked Model 3 sample. `test96` already
requires the direction.

Guide: the motor page gains the field. `test87` for the new strings.

`test136`: replace only the "no lamination field" line. No locked number moves.

**Shipped** as build 226. On the Model 3 geometry at 60 Nm the iron loss is 713 W at 15,000 rpm
on 0.35 mm and 372 W on 0.20 mm, and 36 W against 34 W at 500 rpm. The thin sheet adds $4 per
kilogram of iron. The three Teslas stay on 0.35 mm.

---

## Stage 2 — regen as a calibration

**Still** at the default.

An electric car always regenerates at the motor's torque, capped by the pack's charge rate.
Hybrids already have OFF / LOW / HIGH. Add the same control for an electric car. The default,
and all three presets, stay at today's full regen, so the locked Wh/km and the 0–100 stay.

The new test: OFF raises the Model Y's Wh/km by more than 15% (the check `test102` already
makes by zeroing the table), LOW sits between OFF and HIGH, HIGH matches the locked regen
Wh/km, and a lap's brake energy moves the same way. Below about 500 rpm the fade already in
`evRegenTable` stays.

Guide: the electric-drive page. `test87`.

**Shipped** as build 227. HIGH is the old table. On the Model Y, OFF takes the WLTP figure from
141 Wh/km to 196. LOW barely moves that cycle, because its stops ask for less than half the motor;
on the technical circuit the energy put back is 0.182, 0.094 and 0 kWh, and the front rotor 563,
579 and 595 °C.

---

## Stage 3 — cell resistance against temperature

**Still** at the temperature the constant `rAh` already represents. Treat that constant as 25 °C
and cite the cell data the activation energy comes from (DOE/INL battery test manuals, per
chemistry — not one number chosen so a winter range appears).

`pack.R` and `packMaxPower` at 25 °C stay the locked values. Colder resistance rises, so power
and charge acceptance fall. The 50 °C power cut stays where it is; do not fold it into this
curve in the same build.

WLTP keeps the warm set-point in `EV_CYCLE`, so the locked Wh/km stays. The new test drives the
same cycle, or a single full-power point, at 0 °C and at −10 °C and requires less power and
less regen acceptance than at 25 °C, and the 25 °C point equal to the lock.

---

## Stage 4 — copper loss that rises with frequency

**Moves** efficiency, heat, hold time and Wh/km. **Still** for torque at 1000 rpm, the pack,
the gear ratio, the masses, the 0–100 (this loss is small beside traction) and the plateau's
shape. If the 0–100 does move, it is a surprise: stop and explain it before editing the lock.

Slot copper is DC resistance only. Skin and proximity loss grow with frequency and with strand
size. Without that term, more poles, and a later hairpin winding, are nearly free at speed.

Add a strand diameter (or a round-wire default) and a cited AC term. The DC resistance at stall
stays the locked phase resistance of the Model 3 within `test96`'s band (measured 4.75 mΩ).
Do not retune the three Model 3 constants.

The new test: at constant current, loss rises with electrical frequency; at 0 rpm the AC term
is zero. The Leaf still peaks above 96.5% somewhere between 5000 and 9000 rpm. Report the three
Wh/km figures against 117, 138 and 158. If one leaves the 8% band, say so. Do not widen
`test102`.

`test136`: edit the score, the best efficiency, the hold, the continuous power and the Wh/km.
Do not edit the tail block.

---

## Stage 5 — field weakening from the current left

**Moves** the curve above the knee. This is the stage that replaces the rectangle.

Today `motorMaxTorque` holds power to `CPSR` times the knee (4 for a magnet motor, 3 for an
induction motor) and then falls as 1/ω². The d-axis current in `motorCurrent` (0.7 × Imax ×
(1 − ωbase/ω)) adds copper loss and does not spend the inverter's amps, so the plateau is
imposed. A real interior-magnet range follows the characteristic current ψ / Ld (Soong;
Pyrhönen, *Design of Rotating Electrical Machines*).

Derive Ld, or one saliency, from the geometry, and calibrate it once on the Model 3 — the
motor that already set `FLUX_KM`. The Leaf was not used to set anything. It still has to land:
knee within 10% of 2730 rpm, at least 280 Nm, 80 kW held at 7000 rpm, winding between 100 and
170 °C. If it will not, the gap stays open. Do not put the rectangle back to pass the test.

Torque at 1000 rpm, the pack and the masses stay. Wh/km may move, because the extra-high phase
of the cycle is up where the curve changes. The hybrid tests (`test103`, `test106`, `test110`,
`test111`, `test112`) are part of the push, not a follow-up.

The new test: above the knee, torque cannot exceed what the current circle leaves after the
weakening current; a motor with a higher characteristic current holds power further; the old
"flat to exactly 4×, then exactly 4/5 at 5×" no longer holds. Update the tail block in
`test136` in the same commit.

Fingerprint the hybrids as well as the three Teslas.

---

## Stage 6 — hairpin or round wire, copper or aluminium

**Still** on the default, which is today's stranded copper, after stage 4's numbers.

Only after stage 4. A hairpin fill of about 0.7 with no AC loss is strictly better, and that
must not ship.

Hairpin: more copper in the slot, lower DC resistance, higher AC loss, higher cost. Aluminium:
about 1.6× the resistivity of copper, less mass, less money. Both from a cited conductivity and
a cited fill, not from a torque multiplier.

The new test checks those three directions and that the default reproduces the locked DC
resistance.

---

## Stage 7 — the inverter as a part that gets hot, and a voltage class

**Still** for the three Teslas if their devices stay inside the class the loss formula already
assumes (the IGBT energy was measured at 400 V, 820 A).

Inverter watts are computed and then disappear. Add a node and a current cut when it is hot,
the way the winding already cuts. Switching energy scales with voltage from the same module
datasheet, not from a new efficiency percentage.

A voltage class is chosen, or taken from the series count. An underrated device does not
silently run an 800 V pack. The new test: a hot inverter gives less current, a cool one matches
the locked loss, and a 400 V device on a pack built like an 800 V string is limited.

Factory presets keep today's switches, so the lock stays.

---

## Stage 8 — ratios per axle, then a motor per wheel

Two builds. Do not do them as one.

**8a. A front reduction on an electric car. Still** while it is "same as the rear", which is
today's behaviour. Hybrids already have `evFrontFd`. The new test: a different front ratio
changes the front motor's road speed and not the rear's, and the default matches the locked
final drive.

**8b. Per-wheel torque. Still** for the Plaid preset, which stays on the clutch-type limited-slip
diff until a build opts into one motor per wheel. The new test: two rear motors can send
different torque left and right, the yaw moment comes from the tyre model that already exists,
and a single motor still uses the diff it uses today. No grip multiplier.

---

## Stage 9 — a two-speed reduction

**Still** on one speed, the default.

`EV_REDUCTION` is one ratio between 4:1 and 14:1, and the loss is a flat 3% (5% with a second
axle). A second gear needs a ratio, a shift cut, inertia, mass and a mesh loss. The Porsche
Taycan is the published reason; its preset is a later car (stage 13), not this stage. Cite the
ratios from the workshop manual when that car is added. Do not invent them here.

The new test uses a synthetic car: first gear launches harder, second gear raises the
drag-limited speed, and a shift takes time. The three Teslas stay single-speed and locked.

---

## Stage 10 — charging, on the bench

**Still** for the race. Decision 8 stands: no charger in the pit lane. `test99` keeps that.

The bench only has a state-of-charge slider. A charge session is the quadratic `packDraw`
already solves, run the other way: constant current up to the cell's voltage ceiling, then
constant voltage, with the current falling. `cCharge` is the plating limit. The 15% AC loss
cited from the Bern University of Applied Sciences stays the slow-charge case; a DC figure
needs its own citation.

The new test: the taper, LFP against NCA (the flat LFP curve spends longer near the ceiling),
and a cold pack from stage 3 accepting less. The race still will not fill a car in the pits.

---

## Stage 11 — the pack's height in the centre of gravity

**Moves** the 0–100. **Still** for a combustion car, whose pack mass is zero, so its centre of
gravity stays the chassis table. The fingerprint has to show that.

`powertrain().mass()` adds the pack's kilograms. The centre of gravity stays the chassis
(`vehicle.cg` is 0.52 m on the Model 3 and the Plaid, 0.66 m on the Model Y, the SUV class).
A skateboard pack should lower it in proportion to its mass and a cited height. Weight transfer
in the lap uses that height, which is why the launch moves.

The new test: a heavier, lower pack drops the centre of gravity and adds launch traction; a
pack with no height cited does not get a made-up one. Update the locked 0–100 and the locked
centre of gravity in the same commit. Re-read `test101`. If the error against Tesla's figures
gets worse, write the gap. Do not change the presets' masses or their `fWt` to pull it back.

---

## Stage 12 — cabin heat beside the cycle

**Still** for the homologated Wh/km.

`EV_CYCLE.auxW` is 250 W with the climate off, which is how WLTP is run. Keep that as OFF.
Add PTC and HEAT PUMP as a vehicle choice, with a cited draw and a cited coefficient of
performance. The new test: OFF matches the locked Wh/km, PTC costs more, a heat pump costs
less than PTC and more than OFF. The number on the VEHICLE tab for a factory Tesla stays the
homologated one, and the other two can sit beside it.

---

## Stage 13 — cars that are not Teslas

**Still** for the three Teslas. New presets, checked the way `test101` and `test102` check
those three: published hardware matched, 0–100 and consumption derived.

The useful ones are the ones the earlier stages now know how to represent:

- the 2012 Leaf, whose motor is already the hold-out in `test96`, as a car;
- a small LFP car on a low voltage;
- a Taycan, once stage 9 exists, with the workshop-manual ratios;
- a wound-rotor car (Zoe or Mégane E-Tech) only after that motor exists.

The wound rotor is not one of the numbered stages above on purpose. It needs a teardown with
resistance, a flux and a measured map, the way MotorXP was for the Model 3. Until that source
is in the comment, it does not start.

---

## Parked

These are easy to add as a table row or a brochure figure, and they wait.

- **Axial flux and switched reluctance.** In the motor plan. Each needs its own magnetic
  circuit and a measured machine. A torque density copied from a maker's sheet is a fitted
  multiplier.
- **A new chemistry** (sodium-ion, solid-state). `CHEM` can take another row. It teaches
  little until stage 3 and stage 10 are in. Add one when a datasheet gives the open-circuit
  curve, the resistance and the year it shipped.
- **Capping continuous power by the pack**, the 294 kW against 205 kW quirk above. Its own
  build if it is done at all, with the score's meaning written down so the grade does not
  silently change.

---

## What not to do in any of these

- Do not fit a constant-power range per car so the 0–100 lands.
- Do not edit a preset's mass, drag, tyres or ratio to save a test.
- Do not skip `test136` because the published-figure tests are green.
- Do not start stage 6 before stage 4, or stage 5 in the same pull request as stage 4. Each
  one moves the curve for a different reason, and a single fingerprint cannot say which.
