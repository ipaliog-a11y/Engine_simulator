// Render the gas-model sound for the exported presets: idle, then a rev to 85% of the redline at full
// throttle, then a lift. node render.mjs <outDir>
import { SoundEngine } from './engine.mjs';
import { synthesize, level, readWav, writeWav } from './synth.mjs';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
const outDir = process.argv[2] || '.'; mkdirSync(outDir, { recursive: true });
const E = JSON.parse(readFileSync(new URL('./engines.json', import.meta.url)));
const IR = { mild: readWav(readFileSync(new URL('./ir/mild_exhaust.wav', import.meta.url))), minimal: readWav(readFileSync(new URL('./ir/minimal_muffling_02.wav', import.meta.url))) };
const FS = 44100, SIM = 10000, DUR = 6;
for (const [name, e] of Object.entries(E)) {
  const m = new SoundEngine(e, { simHz: SIM }), n = SIM * DUR;
  const banks = Array.from({ length: e.banks }, () => new Float64Array(n));
  const t0 = Date.now();
  for (let i = 0; i < n; i++) {
    const t = i / SIM, top = 0.85 * e.redline;
    const rpm = t < 1.5 ? e.idle : t < 4.5 ? e.idle + (top - e.idle) * Math.min(1, (t - 1.5) / 2.2) : Math.max(e.idle, top - (top - e.idle) * (t - 4.5) / 1.5);
    const thr = t < 1.5 ? 0 : t < 4.5 ? 1 : 0;
    const map = thr ? 101325 : 30000;
    const o = m.step({ rpm, map, fuel: thr || rpm < e.idle + 150 ? 1 : 0, lambda: thr ? 0.88 : 1, spark: thr ? 20 + 10 * rpm / e.redline : 15, burn: 55 + 15 * rpm / e.redline });
    for (let b = 0; b < e.banks; b++) banks[b][i] = o[b];
  }
  const tSim = Date.now() - t0;
  const ir = e.exhaust === 'race' ? IR.minimal : IR.mild;
  // two banks: left and right, each through its own copy of the impulse response
  const ch = banks.map(x => synthesize(x, SIM, FS, ir, { inputSampleNoise: 0.23 }));
  const L = ch[0], Rr = ch[1] || ch[0];
  const mono = new Float32Array(L.length); for (let i = 0; i < L.length; i++) mono[i] = (L[i] + Rr[i]) / 2;
  writeFileSync(`${outDir}/${name.replace(/[^\w.]+/g, '_')}_gas.wav`, writeWav(level(mono), FS));
  console.log(`${name}: ${DUR} s simulated in ${tSim} ms (${(tSim / DUR / 10).toFixed(0)}% of real time) · IR ${e.exhaust === 'race' ? 'minimal_muffling_02' : 'mild_exhaust'}`);
}
