import { SoundEngine } from './engine.mjs';
import { readFileSync } from 'fs';
const E = JSON.parse(readFileSync(new URL('./engines.json', import.meta.url)));
const name = process.argv[2] || '6.5 V12 NA Supercar', e = E[name];
for (const fluid of [8, 4, 2]) {
  const m = new SoundEngine(e, { fluid }), op = { rpm: 6000, map: 101325, fuel: 1, lambda: 0.88, spark: 28, burn: 65 };
  const x = new Float64Array(20000); const t0 = Date.now();
  for (let i = 0; i < 20000; i++) x[i] = m.step(op)[0];
  const ms = Date.now() - t0; let q = 0; for (let i = 10000; i < 20000; i++) q += x[i] * x[i];
  // signal shape against the 8-step run
  console.log(`fluid ${fluid}: ${(ms / 2).toFixed(0)} ms per second of sound · rms ${Math.sqrt(q / 10000).toExponential(3)} · peak cyl ${(m.peakCylinderPressure() / 1e5).toFixed(0)} bar`);
}
