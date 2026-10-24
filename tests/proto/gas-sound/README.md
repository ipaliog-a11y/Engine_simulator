# gas-sound: an engine-sim style gas model for the engine sound (prototype)

Shipped in build 156 as the GAS engine sound model (OPTIONS); the app's copy is `SOUND_GAS_SRC` in
`index.html`, which adds a leveller and per-build calibration. This directory is the record of how it was
measured.

Explores option 5 of the sound methods: simulate the gas and listen to it, as Ange Yaghi's
[engine-sim](https://github.com/ange-yaghi/engine-sim) does (MIT licence; notice in `gas.mjs`).

| file | what it is |
|---|---|
| `gas.mjs` | `GasSystem` ported from engine-sim: lumped volumes, compressible orifice flow (choked and subsonic), bulk momentum and dynamic pressure. Mix bookkeeping left out. |
| `engine.mjs` | Per cylinder an intake runner, the cylinder and an exhaust runner + primary; per bank a collector venting to atmosphere. Flow order, velocity handling and the audio pick-off follow engine-sim. The crank runs at the rpm our model sets, the plenum is held at its manifold pressure, combustion is a Wiebe curve. |
| `synth.mjs` | engine-sim's `Synthesizer` audio chain: upsample, 1.9 kHz band limit, jitter, DC removal, derivative mix, flow-modulated air noise, convolution with a recorded exhaust impulse response, levelling. |
| `ir/` | Two of engine-sim's impulse responses (`mild_exhaust`, `minimal_muffling_02`). |
| `dump-engines.mjs` | Exports the presets' geometry from `index.html` to `engines.json`. |
| `render.mjs` | Renders idle, a full-throttle rev and a lift for each exported preset: `node render.mjs <outDir>`. |
| `bench.mjs` | Cost per second of sound at 8, 4 and 2 fluid substeps: `node bench.mjs "6.5 V12 NA Supercar"`. |

## What was measured

- **Physics.** With the presets' real bore, stroke, compression, cam timing and lift, valve size and header
  length, the 1.6 sport four makes 77 bar peak and 13.2 bar IMEP flat out at 3000 rpm, and 4.0 bar IMEP at
  0.4 bar manifold pressure, once one stated factor (`GAS_HEAT_SHARE` = 0.50, the share of the fuel's heat
  that reaches the ideal gas) is set to that one IMEP figure. Without it the ideal diatomic gas gave 24 bar.
- **Rhythm.** The idle envelope repeats at the firing frequency or a sub-multiple of it (the crank or the
  cycle rate); which one the autocorrelation picks varies run to run, because the air noise multiplying the
  signal is random. That is a measuring problem, not a check that passed: pinning the firing rhythm needs the
  dry signal before the noise. No NaNs over the renders.
- **Cost of the full drive cycle** (idle, rev, lift; 4 substeps): I4 19-21% of real time, I6 27%, V8 42%,
  V12 57%.
- **Cost** (this container, one core): a V12 at 6000 rpm, 10 kHz simulation, takes 0.93 s per second of
  sound at 8 fluid substeps, 0.48 s at 4 (rms within 5% of 8), 0.24 s at 2 (13% off). An I4 is about a
  third of the V12. Real time is reachable on a desktop at 4 substeps; a phone would struggle with 8+
  cylinders. The convolution would go to a native `ConvolverNode`, which is FFT-based and cheap.

## What it would take to ship

1. Move `gas.mjs` + `engine.mjs` into the AudioWorklet (the code is already plain JS with no allocation in
   the step), with the live rpm, MAP, fuel cut and spark as parameters, and a `ConvolverNode` after it.
2. Choose the impulse response from the exhaust (stock / sport / race) and the cat.
3. Keep the current voices (turbo whine, blow-off, intake roar, knock, crackle) layered on top.
4. Speed: cache pressure/temperature per substep, replace `Math.pow` in the flow law with a table, and
   fall back to the current synth on slow devices or above ~8 cylinders.
