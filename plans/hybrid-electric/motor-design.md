# Plan: the motor designer

**Status:** proposal, nothing built. Companion to [README.md](README.md) (the electric-then-hybrid plan),
covering step 2: which design fields an electric drive should have, and how each one changes the
output.

---

## The principle: measure what separates motors

Almost every electric motor has the same shape of curve: flat torque up to a **knee** (the base
speed), then roughly constant power, then falling as the voltage runs out. If the game only scores
0–100 and peak power, most motor choices collapse into "pick the biggest" and stop mattering.

Choices make a difference only when the game measures four things:

1. **Where the knee sits.** That decides whether the car pulls at 200 km/h or only off the line.
2. **How long it can hold peak power before it overheats.** Real EVs differ by 2–3× between peak
   and continuous power.
3. **Efficiency.** That shows up as energy per lap, range, and the heat the motor has to shed.
4. **Mass and cost.**

The lap and race simulators already measure time over distance with heat build-up (brakes, tyres).
That is where motor choices bite.

**Every field needs a real cost somewhere** — money, mass, heat or efficiency — so that no option
is best everywhere. It is the same rule the valvetrain section already follows: nothing is a lookup
multiplier; the effect comes from geometry and mechanics.

---

## The design fields

Grouped the way the ENGINE tab is.

### 1. Motor type — the equivalent of engine type

| type | gains | costs |
|---|---|---|
| **Permanent magnet** (most EVs, e.g. Tesla Model 3 rear) | Best torque per kg; best efficiency at low and mid speed | Rare-earth magnet cost; efficiency drops at high speed; magnets lose strength if overheated |
| **Induction** (early Tesla Model S) | No magnets, cheap and tough; spins freely with no drag when switched off — good for a secondary axle | Lower efficiency at part load; the rotor gets hot, which caps how long it holds peak power |
| **Wound rotor** (Renault Zoe, BMW iX) | No magnets; the rotor field is adjustable, so it stays efficient at high speed | Extra rotor losses; slip rings or brushes |
| **Axial flux** (YASA, Ferrari SF90) | Very high torque per kg, very short | Harder to cool; expensive |
| **Switched reluctance** | Cheapest and toughest | Torque ripple, harsh noise, lower efficiency |

Like the engine type switch, the motor type enables and disables the fields below (no magnet grade
on an induction motor, no windings on the rotor of a permanent-magnet one).

### 2. Size: rotor diameter × stack length — the motor's bore × stroke

- **Torque ∝ D² × L × σ**, where σ is the shear stress at the rotor surface — the motor's
  equivalent of BMEP, set by how hard the copper and iron are pushed (see *The derived core*).
- **Diameter also sets the redline.** The rotor's surface speed is limited to about 100–200 m/s
  before it comes apart, depending on how the magnets are retained. At 20,000 rpm a 150 mm rotor's
  surface runs at about 157 m/s, which is roughly where production EV motors sit.
- So a big rotor gives lots of torque and a low maximum rpm; a small, long rotor revs to
  20,000 rpm and needs a numerically higher reduction.

This is the direct parallel to bore, stroke and piston speed, and it falls straight out of geometry.

### 3. Pole count — a little like cylinder count

- More poles: more torque per amp, thinner back iron, a lighter motor.
- Cost: a higher electrical frequency at the same rpm (f = pole pairs × rpm / 60), so iron losses
  climb at high speed and the inverter's frequency limit caps the maximum rpm sooner.
- Pole count also sets the pitch of the motor's whine.

### 4. Windings

- **Turns per coil** — the most important trade-off, the motor's version of a cam or a gear
  choice. More turns give more torque per amp but a lower knee, because the motor's back-EMF (the
  voltage it generates as it spins) reaches the battery voltage sooner and power falls away above
  that. Fewer turns move the knee up but need more current, so a bigger inverter.
- **Round wire vs hairpin.** Hairpin fills more of the slot (about 70% copper vs about 45%), so it
  has lower losses at low speed. It suffers AC losses (skin and proximity effects) at high
  frequency. Good in town, worse at top speed.
- **Copper vs aluminium.** Aluminium is cheaper and lighter but more resistive, so it runs hotter.

### 5. Magnets (permanent-magnet and axial-flux types)

- **Grade / temperature class:** strength vs heat tolerance vs cost. Adding dysprosium raises the
  safe magnet temperature at a price.
- **Ferrite:** cheap but weak.
- **Failure mode:** overheating permanently weakens the magnets — the motor's blown engine. It plugs
  into the existing `engineHealth` and `stepWear` model: lost torque that does not come back.

### 6. Laminations

- Thinner core sheets (0.20 mm vs 0.35 mm) cut iron loss at high speed, since eddy-current loss
  scales with thickness² × frequency². The cost is money.

### 7. Cooling — the biggest lever on a lap or in a race

| cooling | continuous current density | effect |
|---|---|---|
| Air | ~5 A/mm² | Cheap; holds peak power for seconds |
| Water jacket | ~10–15 A/mm² | The everyday EV choice |
| Oil spray on the end windings | ~20 A/mm² | Holds peak power for a lap |
| Direct oil cooling in the slots | ~25–30 A/mm² | Race motors; cost and complexity |

Cooling sets continuous power. In a 0–100 it is invisible; over a lap it is the whole difference.
That mirrors how brake fade already works.

### 8. Inverter

- **Silicon IGBT vs silicon carbide (SiC):** SiC is 2–4% more efficient at part load (range) and
  switches faster, which changes the sound; it costs more.
- **Current rating:** caps peak torque.

### 9. Battery — fuel tank and turbo at once

- **Chemistry:**
  - LFP: cheap, heavy, tough, lower voltage.
  - NMC: more energy per kg, higher power.
  - High-power cells: little energy, huge power — what hybrids use.
- **Capacity (kWh):** range vs mass.
- **Voltage, 400 V vs 800 V** (set by the number of cells in series):
  - at the same current, 800 V raises the knee;
  - at the same power, it halves the current, so cables and inverter run cooler.
- **Discharge-rate limit:** peak power ≈ kWh × C-rate. Voltage also sags as charge runs down and
  under heavy load, so a small battery cannot feed a big motor.

### 10. Driveline

- **Reduction ratio:** acceleration vs top speed, given the motor's maximum rpm.
- **One-speed vs two-speed** (Porsche Taycan): two speeds cost mass and money and keep both the
  launch and the top speed.
- **Motor count and layout:**
  - single motor on the rear, front or both axles;
  - dual motor, with an induction motor on the axle that is often switched off;
  - three or four motors, for torque vectoring that **replaces** the `DIFF` model (open, LSD,
    spool) with per-wheel torque.

---

## What each choice moves

| choice | peak torque | top rpm / top speed | efficiency / range | peak-hold (heat) | mass | cost |
|---|---|---|---|---|---|---|
| Diameter ↑ | ↑↑ | ↓ | — | ↑ | ↑ | ↑ |
| Stack length ↑ | ↑ | — | — | ↑ | ↑ | ↑ |
| Poles ↑ | ↑ per amp | ↓ | ↓ at high speed | — | ↓ | — |
| Turns ↑ | ↑ per amp | knee ↓ | — | — | — | — |
| Hairpin | — | — | ↑ low speed, ↓ high speed | ↑ | — | ↑ |
| Better magnets | ↑ | — | ↑ | ↑↑ | — | ↑↑ |
| Better cooling | — | — | — | ↑↑↑ | ↑ | ↑ |
| SiC inverter | — | — | ↑ | ↑ | — | ↑ |
| 800 V | — | knee ↑ | ↑ | ↑ | — | ↑ |

Every row has at least one cost column. A row without one would be a dominant choice and should
not ship.

---

## The derived core — keeping the v1.0 rule

Everything above comes from a small set of physical relations, with no fitted multipliers:

- **Torque** from size and loading: σ ∝ electric loading (amps per metre of rotor circumference,
  limited by cooling) × magnetic loading (air-gap flux density, limited by iron saturation and
  magnet strength).
- **The knee** from battery voltage against back-EMF, which is set by turns, poles and magnet
  strength. Above it the controller weakens the field, trading current for speed.
- **Maximum rpm** as the lowest of: rotor surface speed (diameter), inverter frequency limit (poles),
  and back-EMF the controller can still hold down.
- **Losses:**
  - copper: I²R, with resistance rising 0.39% per °C — a hot motor is less efficient, which makes it
    hotter still; that feedback is what makes heat interesting on a lap;
  - iron: rising with frequency and flux density, scaled by lamination thickness;
  - hairpin AC loss: rising with frequency;
  - inverter: conduction and switching, by device type.
- **Heat:** a two-node lumped model (windings, magnets/rotor) with a conductance to coolant set by
  the cooling choice. Peak-hold time and derating come out of it.

Together these give an efficiency map and a peak-hold time that are consequences of the design,
not drawings of one.

---

## Sound comes for free

- The whine's pitch is pole pairs × rpm / 60, with harmonics from the slot count.
- The inverter adds a switching tone: audible with silicon IGBTs, pushed higher with SiC.
- Switched reluctance growls; the reduction gears add mesh whine.

Every design choice becomes audible, as it already is with GAS. Built standalone in `tests/proto/`
first, the way GAS was (step 4 of the main plan).

---

## Validation

In the style of the brakes / tyres / fuel builds (144–146): real electric cars with motor type,
power, mass and gearing matched — 0–100, top speed, and consumption in Wh/km against published
figures. Where a manufacturer publishes peak and continuous (30-minute) power, both are checked;
that pair is the direct test of the heat model.

---

## Build order inside step 2

**First set (shallow first, as the main plan says):** motor type, rotor diameter, stack length,
pole count, turns, magnet grade, cooling, inverter type and current rating, battery chemistry,
capacity and voltage, reduction ratio. About 12 fields, each of which moves a number the lap
simulator measures.

**Later:** round wire vs hairpin, copper vs aluminium, lamination thickness, axial flux and
switched reluctance, multi-motor torque vectoring, two-speed gearbox.
