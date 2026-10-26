# Plan: electric, then hybrids

**Status:** proposal, nothing built. Written at build 175.

Should hybrid and electric cars become a new game built from this one, or live in this one? This
document answers that, lists what would have to change, and gives an order to build it in.

---

## The decision: same game, new powertrain types

Electric and hybrid go into this repository as **powertrain types**, alongside petrol, diesel,
2-stroke and rotary. Not a fork.

### Why not a separate game

1. **Most of the simulator already is the other game.** Roughly half of `index.html` does not care
   what turns the wheels: the vehicle model, tyres (slip, temperature, camber), brakes and their
   heat, aero, differentials, the lap simulator, the race simulator with racecraft and drivers, the
   real circuits, the Greek interface, the PWA, and the validation suite against real cars. An
   electric game needs every one of those. A fork means every tyre or brake fix lands twice, and the
   two copies drift apart within a few builds.

2. **A hybrid needs the combustion model.** A hybrid is a combustion engine plus a motor plus a
   battery. Putting electric in a new game means copying the engine model across for hybrids anyway,
   which is the two-copies problem again.

3. **The seam already exists.** The 0–100 run, the lap and the race do not call the engine physics
   directly. They read a torque surface built once per engine — `lapTorqueGrid()` /
   `gridTorque(g, rpm, boost)` and a 1-D `tqAt(rpm)` from `buildTorqueCurve()` — and, for the race,
   a fuel map over speed and load from `steadyBSFC()`. That fuel map is exactly what a hybrid's
   energy manager needs to decide when the engine should run and when the motor should.

4. **It fits the v1.0 principle.** An electric drive is simpler and better documented than a
   combustion engine: constant torque to a base speed, constant power above it, copper and iron
   losses, a battery with internal resistance. It can be *derived, not fitted* from the first
   build, which is the rule the rest of the model is being converted to.

### When a new game would be right

Only if the product itself changes — an electric-motor and battery-chemistry *designer* as deep as
the engine designer, under another name, for a different player. Even then the right shape is one
shared core with two front ends, not a fork. "Pixel Engine Sim" can hold a motor.

---

## What changes, area by area

| area | today | with electric and hybrid |
|---|---|---|
| **Engine → wheels** | `tqAt` / `gridTorque` read straight off the global `engine` | One **powertrain interface**: force available at this road speed and state, energy drawn per step. The combustion engine becomes one implementation, with identical numbers. |
| **Gearbox** | `GEARBOX` = manual, sequential, DCT, torque-converter auto; shift at the torque crossover | Add a **single fixed reduction** for electric. Ratio spacing and crossover shifting stay for combustion and hybrid. |
| **Brakes** | Friction brakes, heat and fade, split between axles (build 150) | **Regenerative braking** on the driven axle(s), limited by motor power and battery charge acceptance; friction brakes take the rest. Less heat, less fade. |
| **Fuel → energy** | Fuel flow, BSFC, race fuel load and strategy | Battery **state of charge**, power limits, **thermal derating** of battery and motor. The race fuel strategy becomes an energy strategy (F1 / LMP-style deployment). |
| **Mass** | `engineMass()` + body | Motor, inverter and battery mass by capacity. A battery is heavy and low; that feeds the existing axle balance and weight transfer. |
| **Sound** | GAS — an engine simulated as gas (builds 156–160), combustion only | A separate **motor / inverter whine** (switching frequency, gear mesh). The combustion sound stays for hybrids with the engine running. |
| **Designer UI** | ENGINE tab, fields enabled and disabled by engine type | A **MOTOR / BATTERY** panel shown for electric and hybrid, the same way the type switch already disables cam and VVT for 2-strokes and rotaries. |
| **Cost / challenges** | `computeCost()`, challenge metrics | Battery cost per kWh, motor cost per kW; range and efficiency as challenge metrics. |

### Where the coupling actually is

The lap, race and acceleration code (roughly `buildVehicle` through `simulateRace`) reads the
global `engine` directly — mostly `engine.score` (the cache key), `engine.redline`, `engine.ci`,
`engine.afrMode`, `engine.stoichAFR`, `engine.maxBoost`, `engine.idleRpmEff`. That is a short list,
which is good news: those are the reads the powertrain interface has to absorb. Redline and idle
become "speed limits of the prime mover"; boost and AFR become implementation details of the
combustion powertrain; `score` becomes the powertrain's own cache key.

---

## The real risk: the file size

`index.html` is about 1.6 MB and 16,000 lines. The project README says the single file is "worth
revisiting past ~600 KB". It is now well past that, and a second and third powertrain will push it
further.

The reasons for one file still hold — opens from `file://`, no server, no dependencies, one artefact
to share. They can be kept without one *source* file: a small build script that concatenates
`src/*.js` back into a single `index.html`. The shipped artefact stays identical in kind; only the
editing changes. Deciding this **before** step 1 is cheaper than after, because step 1 is the point
where a `powertrain/` folder starts to pay.

**Decided: split.** The sources move into separate files; a build script joins them into one
`index.html`, and the joined file is **committed**, so GitHub Pages, the tests (which load
`index.html` from `file://`) and `tools/stamp.mjs` keep working unchanged. A `--check` mode fails when
the committed `index.html` does not match the sources. This is step 0 below.

---

## Build order

Each step is one PR, validated the way the rest of the model is: against `tests/test41.mjs`
(0–100 vs real cars), `aero.mjs` (top speed) and `tests/test43.mjs` (the two simulators agree).

**Decided: electric first, hybrids after.** A hybrid is the combustion engine plus the electric
drive, so it is built from parts that already exist and are already validated: the motor, battery,
regen and thermal model of step 2, and the engine of today. Building hybrids first would mean
designing the electric half and the energy manager at the same time, with no pure electric car to
check the electric half against.

### 0. Split the source — no change in the shipped file (✅ build 176)

- Move the contents of `index.html` into separate source files along the seams already marked in it
  (styles, markup, physics, vehicle and lap, race, sound, UI, translations).
- A build script joins them back into `index.html`; `--check` verifies the committed file matches.
- **Acceptance:** the joined `index.html` is byte-identical to the one it replaced (apart from the
  build stamp), and the full test suite passes.

### 1. The powertrain interface — no change in results (✅ build 177)

- Define the interface: `force(v, demand, st)`, `step(dt, st)`, `energyUsed`, limits.
- Wrap the existing engine, torque grid and gearbox behind it as the combustion powertrain.
- Replace the direct `engine.*` reads in the lap, race and acceleration code with interface calls.
- **Acceptance:** every existing test passes with bit-identical lap times, 0–100 and top speeds.
  A refactor that moves a number is not a refactor.

### 2. Battery electric

The design fields, their trade-offs and the physics behind them are in
[motor-design.md](motor-design.md).

- **Motor:** peak torque to base speed, peak power above it, a maximum speed; efficiency from
  copper loss (∝ torque²) and iron loss (∝ speed), so the efficiency map is derived, not drawn.
- **Battery:** capacity (kWh), open-circuit voltage against state of charge, internal resistance —
  power available falls as charge falls and as current rises.
- **Driveline:** single fixed reduction; no shifts, no launch rpm search.
- **Regen:** on the driven axles, capped by motor power and charge acceptance, blended with friction
  brakes through the existing axle split.
- **Thermal:** a lumped battery and motor temperature; derating when hot. This is what makes a
  long track different from a 0–100.
- **Validation:** a new real-world test, in the style of the brakes / tyres / fuel builds
  (144–146): 0–100 and top speed of real electric cars with power, mass and gearing matched
  (e.g. Tesla Model 3, Porsche Taycan, Hyundai Ioniq 5, a small city EV), plus consumption in
  Wh/km against published figures.

### 3. Hybrids — after electric is shipped and validated

In order of complexity, each built on the last:

1. **Mild / parallel (P2):** a motor between engine and gearbox, small battery, torque fill and
   regen. Uses the existing gearbox unchanged.
2. **Full parallel / power-split:** electric-only driving at low load, engine on at high load. The
   energy manager uses the `steadyBSFC()` map to run the engine at its efficient points.
3. **Series:** the engine only charges; the wheels see an electric drive.
4. **Racing energy recovery:** deploy and harvest per lap under a regulation limit (MJ per lap),
   wired into the race simulator's strategy the way fuel and tyres are now.

- **Validation:** real hybrids where the figures are published (e.g. a Prius for consumption, a
  Porsche 918 or similar for performance).

### 4. Electric sound

A motor and inverter synth beside GAS: an inverter switching tone, motor whine rising with speed,
gear mesh from the reduction. Built standalone in `tests/proto/` first, the way GAS was.

---

## Decisions

| # | question | decision |
|---|---|---|
| 1 | One source file or split? | **Split**, joined output committed (step 0). |
| 2 | Does electric work pause the v1.0 queue? | **A freeze, not a pause**: from the start of step 0 until step 1 merges, no change that moves a number lands; work that touches only tests, docs or the UI continues. After step 1, v1.0 and electric run side by side. Reason: step 0 moves every line of `index.html`, step 1 rewrites the lap, race and acceleration code, and step 1's bit-identical check is only meaningful against a baseline that is not moving underneath it. |
| 3 | How exact must step 1 be? | **Bit-identical** 0–100, top speeds and lap times on every preset. A number that moves is fixed before merging, not explained. |
| 4 | Version | Electric ships as **v0.7**. v1.0 keeps its meaning: every combustion number derived. |
| 5 | Saved builds and share links | Saves gain a **powertrain type**; a save without one is read as `combustion`, so every existing save, garage entry and share link still loads. |
| 6 | Where electric appears | A new type in the **engine-type dropdown**; choosing it swaps the ENGINE tab for MOTOR / BATTERY. |
| 7 | The live dyno for a motor | **Torque, power and efficiency curves**, with winding and magnet temperatures. No cutaway in the first version. |
| 8 | Electric against combustion in a race | **Mixed fields allowed, no charging mid-race**: an electric car manages its energy. Categories unchanged. |
| 9 | Is battery and motor technology tied to the decade? | **Yes, by decade**, like the Supercar category: at least battery energy per kg and cost per kWh, so a 1990s challenge cannot be won with a 2020s battery. |
| 10 | Which real electric cars to validate against (and ship as presets) | **Tesla Model 3, Model Y and the new Model S** (the 2021 refresh). Variants to be fixed in step 2; see the note below. |
| 11 | Greek translation | **Falls back to English for now.** New electric strings need no Greek in the same PR; `tr()` shows the English where a translation is missing, and the Greek is filled in later. |
| — | Electric or hybrid first | **Electric first** (see *Build order*). |

**On the three Teslas (decision 10).** Tesla publishes 0–100 / 0–60, top speed, mass and WLTP/EPA
consumption, which the 0–100, top-speed and Wh/km checks need. It does **not** publish continuous
(30-minute) power, so the heat model's peak-hold check needs another source: sustained-lap tests
where the cars' power derating has been measured. The variants proposed for step 2 span one, two
and three motors: Model 3 RWD (single motor), Model Y Long Range AWD (dual motor), Model S Plaid
(three motors, the 2021 refresh).

## Open questions

- **The three Teslas' variants:** proposed above (Model 3 RWD, Model Y Long Range, Model S Plaid).
- **Motor designer depth:** proposed in [motor-design.md](motor-design.md), a first set of about
  12 geometric fields, more later.
- **Name and identity:** stays "Pixel Engine Sim", or becomes "powertrain" in the UI?
