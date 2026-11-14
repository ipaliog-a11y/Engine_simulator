# The GAS sound and a hybrid's drive mode

A hybrid's engine must be heard only when, and as, the drive model runs it. Review at build 293, and the builds that
follow from it.

## What was wrong (build 293)

On the track (lap replay):
1. **The engine never stops.** `updateSound` mutes a hybrid's engine only on the bench (`hybBenchEngineOff()&&vizMode!=='track'`).
2. **Power-split and series play the wrong engine.** `trackSoundState` puts the engine on the eCVT's full-load line
   (`psEngineRpmAt`) whenever the throttle is above 2%, and at idle below. The lap's fuel (`psFuelRate`) has the engine
   giving `max(0, shaft power - motor power) / eta`, on its best line (`psOolAt`), and stopped off the power. So the sound
   disagrees with the fuel at part load, under motor boost and on a lift.
3. **Their manifold is 1 bar flat.** The replay records `map = 1` for a direct drive (`racing-line-lap.js`), so the
   sound's load does not move.
4. **P2:** the lap model has no electric-only stretches (the engine gives its full torque, the motor tops up). The sound
   follows the model, which is right; electric stretches need the lap model first.

On the bench:

5. **The sound reads the pedal, not the engine's throttle.** In AUTO, HOLD and CHARGE the ECU sets `H.thrE`;
   `soundDrive` reads `state.throttle`, so it crackles and blows off with the pedal up while the engine is charging.
6. **No start or stop.** `muteEngineSound` zeroes the output, but the gas worklet keeps its last speed, so a restart
   sweeps down from it to idle. No spin-up by the motor.
7. The gas worklet keeps stepping while muted (CPU).

General: `gasReference` and `calibrateGas` read the global `engine`, not the one they're given. `GAS_HEAT_SHARE` is a
named fit (a known gap, not to be tuned).

## The builds

| Build | Change | Derived from |
|---|---|---|
| **A** (build 297) | Power-split and series on the track: per replay point, the engine's power as the fuel has it (`psEnginePower`, shared with `psFuelRate`), its speed on the best line (`psOolAt`), its manifold from its share of full-load torque at that speed (`steadyMapAt`'s law). Off the power it stops, and the sound mutes. | The fuel model's relations: sound and fuel agree by construction |
| **B** (build 296) | The bench's sound reads the engine's throttle (`withEngThr`), so crackle, blow-off and lope follow `H.thrE` | The controller's output |
| **C** (build 298) | Start and stop: the motor (P2) or MG1 spins the engine up unfuelled over `t = J dw / T_motor`, then fuel on; a stop cuts the fuel and runs down to 0. The gas worklet is reset, not left at its old speed. Done with MG1 (or the generator) also braking the engine to rest at its full torque; a P2's coasts on its friction. | Engine and motor inertia, the motor's torque |
| **D** | Each bench mode checked: EV the motor only; CHARGE and HOLD the engine at the controller's speed whatever the road; SPORT and ENGINE on the pedal. Guide and README text for the sound. | Falls out of A-C |
| **E** | Skip the gas worklet while muted; pass the engine to `gasReference` and `calibrateGas` | Refactor: fingerprint identical |
| later | P2 electric stretches on the track (EV UP TO, EV POWER) | Needs the lap solver to record engine-off points first |
