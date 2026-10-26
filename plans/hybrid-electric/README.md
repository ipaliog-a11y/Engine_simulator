# Plan: electric, then hybrids

**Status:** proposal, nothing built. Written at build 172.

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

This is a decision for the maintainer, not part of the plan by default.

---

## Build order

Each step is one PR, validated the way the rest of the model is: against `tests/test41.mjs`
(0–100 vs real cars), `aero.mjs` (top speed) and `tests/test43.mjs` (the two simulators agree).

**Decided: electric first, hybrids after.** A hybrid is the combustion engine plus the electric
drive, so it is built from parts that already exist and are already validated: the motor, battery,
regen and thermal model of step 2, and the engine of today. Building hybrids first would mean
designing the electric half and the energy manager at the same time, with no pure electric car to
check the electric half against.

### 1. The powertrain interface — no change in results

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

## Open questions

- **Single source file or concatenated build?** See *The real risk* above.
- **How deep is the motor designer?** Proposed in [motor-design.md](motor-design.md): a first set
  of about 12 geometric fields, more later. The v1.0 rule applies to whatever is exposed.
- **Presets:** how many electric and hybrid cars, and do they enter the Supercar category
  (build 148) alongside combustion cars?
- **Name and identity:** stays "Pixel Engine Sim", or becomes "powertrain" in the UI?
