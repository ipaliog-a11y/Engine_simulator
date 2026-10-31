# ev-sound: the electric drive's sound (prototype)

Step 4 of `plans/hybrid-electric/`: a motor and inverter synth beside GAS, built here first, standalone, the way GAS
was (`../gas-sound/`). Nothing in the app plays it yet.

| file | what it is |
|---|---|
| `dump-drives.mjs` | Exports the electric presets' drives from `index.html` to `drives.json`: per motor group the poles, stator slots, inverter switching frequency and full-load torque; the speed limit, the reduction, tyre, mass and drag. |
| `synth.mjs` | The synth: a sample at a time from the motor speed, the torque per group and the modulation depth. Plain JS, no allocation in the step, ready for the AudioWorklet. |
| `render.mjs` | Drives each car through a launch (full-load curve), a lift (regeneration at a quarter of peak torque) and a cruise (what the drag needs), and writes a WAV and a spectrogram: `node render.mjs <outDir>`. |
| `check.mjs` | What must hold, measured on the output: `node check.mjs`. |
| `fft.mjs` | The FFT the check uses. |

## The voices

Every voice sits at the frequency the build gives it. Only the levels are chosen, by ear (`EV_SOUND.level`).

- **Electromagnetic.** The stator's radial magnetic force shakes the core.
  - **Torque ripple** at 6 × the electrical frequency fe = p·n/60, rising with the current.
  - **Slotting**, where the rotor's poles pass the stator's teeth: LCM(slots, poles) × the shaft frequency for a magnet
    motor (54 slots, 6 poles: 18 fe). It is there whenever the magnets spin. An induction motor's rotor bars pass the
    teeth instead, and with no torque asked it has no field, so it is silent.
  - The stator's first bending mode (assumed 2.4 kHz, Q 3) makes each order swell as it sweeps through.
- **Inverter.** PWM leaves current ripple at the switching frequency fc, strongest at fc ± 2 fe (the line currents
  cancel fc itself), weighted by J2(πm/2) for the modulation depth m, and at 2 fc ± fe. Ripple is V/(L·fc): SiC at
  16 kHz is quieter and higher than IGBT at 10 kHz.
- **Gears.** The reduction's two meshes and the first one's second harmonic. Tooth counts are not published: the pinions
  are 19 and 23 teeth (assumed), and the wheels are the pair closest to the car's ratio (9.025 for Tesla's 9.03; 7.561
  for the Plaid's 7.56). Transmission error grows with the load.
- **Windage.** Broadband, with the speed squared.

Left out: tyres and road (a bench has neither), the pack's contactors and the cooling pump.

## What was measured (`check.mjs`)

| check | result |
|---|---|
| Every voice on its predicted frequency at 3000 rpm, half torque | to the FFT bin (1.5 Hz), all four drives |
| The whine is an order | the slotting peak moves to 2× at 6000 rpm |
| Torque is heard | the 6 fe ripple is more than 6 dB louder at half torque than at a tenth |
| An idle induction front motor | 77 dB down with no torque (Model Y) |
| SiC against IGBT | the fc + 2 fe sideband: 16.3 kHz at −48.6 dB against 10.3 kHz at −43.8 dB |
| The 20 s drive cycle | no NaN; 6–8% of real time on one core of this container, the cycle's own car dynamics included |

## What it would take to ship

1. Move `makeEvSound` into `SOUND_WORKLET_SRC` beside GAS, fed from the bench (`state.rpm`, `state.torque`, the
   modulation depth from the knee) and, for a hybrid, from `hybBench` (the motor's speed and torque), mixed with the
   engine.
2. A per-group voice for a car with more than one motor group, which the bench already carries (`engine.motor.parts`).
3. The replay of a lap (TRACK tab) driving it, as the engine sound's replay does.
4. A level against GAS, set by ear in the app, and the OPTIONS sound switch covering it.
