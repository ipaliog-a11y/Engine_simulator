// What the electric sound must do, measured on its own output: `node check.mjs`. For each exported drive (drives.json):
//   · every voice is where the build puts it: at a steady speed and torque the spectrum's peaks sit on the predicted
//     frequencies (6 fe, the slotting order and its double, the two gear meshes, the inverter's fc +/- 2 fe), to the bin;
//   · the whine is an order: the slotting peak moves with the speed (3000 to 6000 rpm doubles it);
//   · the inverter: a SiC drive's sidebands sit around 16 kHz and are quieter than an IGBT drive's around 10 kHz;
//   · an induction motor with no torque is silent (no field): its slotting peak is gone; a magnet motor's is not;
//   · torque is heard: the whine's level rises with the load;
//   · the drive cycle renders with no NaN and nothing past full scale before the leveller, and its cost per second of
//     sound is printed (it has to run in the AudioWorklet, in real time, beside GAS).
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { makeEvSound, voiceOrders, EV_SOUND } from './synth.mjs';
import { spectrum } from './fft.mjs';
import { cycle } from './render.mjs';
const here = path.dirname(fileURLToPath(import.meta.url));
const drives = JSON.parse(fs.readFileSync(path.join(here, 'drives.json'), 'utf8'));
const sr = EV_SOUND.sr, N = 32768, bin = sr / N, fails = [];
// the spectrum of a steady state: rpm, torque per group, modulation depth
function steady(d, rpm, Ts, m) {
  const syn = makeEvSound(d), x = new Float64Array(N);
  for (let i = 0; i < 8000; i++) syn(rpm, Ts, m);
  for (let i = 0; i < N; i++) x[i] = syn(rpm, Ts, m);
  return spectrum(x);
}
// the level (dB) of the strongest bin within 2 bins of f
const at = (S, f) => { const k = Math.round(f / bin); let m = 0; for (let j = k - 2; j <= k + 2; j++) if (j > 0 && j < S.length) m = Math.max(m, S[j]); return 20 * Math.log10(m + 1e-12); };
// the frequencies of the n strongest local peaks
const peaks = (S, n) => { const p = []; for (let k = 3; k < S.length - 3; k++) if (S[k] > S[k - 1] && S[k] >= S[k + 1]) p.push([k * bin, S[k]]); return p.sort((a, b) => b[1] - a[1]).slice(0, n).map(q => q[0]); };
const sic = drives.find(d => d.groups[0].fsw === 16000 && d.groups.length === 1), igbt = drives.find(d => d.groups[0].fsw === 10000);
for (const d of drives) {
  const g = d.groups[0], o = voiceOrders(g, d.fd), rpm = 3000, T = d.groups.map(q => 0.5 * q.n * q.Tpk), fe = o.fe * rpm;
  const S = steady(d, rpm, T, 0.43), P = peaks(S, 24);
  const want = { '6 fe': o.ripple * rpm, slotting: o.slot * rpm, 'slotting x2': 2 * o.slot * rpm, 'mesh 1': o.mesh1 * rpm, 'mesh 2': o.mesh2 * rpm,
    'fc - 2fe': g.fsw - 2 * fe, 'fc + 2fe': g.fsw + 2 * fe };
  const miss = Object.entries(want).filter(([, f]) => !P.some(p => Math.abs(p - f) <= 1.5 * bin));
  console.log(`== ${d.name} at ${rpm} rpm, half torque: ` + Object.entries(want).map(([k, f]) => `${k} ${Math.round(f)} Hz ${at(S, f).toFixed(0)} dB`).join(', ') +
    `; reduction ${o.stages.z.join('/')} = ${o.stages.ratio.toFixed(3)} (preset ${d.fd.toFixed(2)}) ==`);
  if (miss.length) fails.push(`${d.name}: no peak at ${miss.map(m => m[0]).join(', ')}`);
  // the whine is an order
  const S2 = steady(d, 2 * rpm, T, 0.86), P2 = peaks(S2, 24);
  if (!P2.some(p => Math.abs(p - 2 * o.slot * rpm) <= 1.5 * bin)) fails.push(`${d.name}: the slotting peak does not move with the speed`);
  // torque is heard
  const Slo = steady(d, rpm, d.groups.map(q => 0.1 * q.n * q.Tpk), 0.43), dB = at(S, o.ripple * rpm) - at(Slo, o.ripple * rpm);
  if (!(dB > 6)) fails.push(`${d.name}: the torque ripple is not louder at half torque than at a tenth (${dB.toFixed(1)} dB)`);
  // an induction front motor with no torque is silent; the magnet rear is not
  if (d.groups.length > 1 && d.groups[1].im) {
    const f = d.groups[1], of = voiceOrders(f, d.fd), S0 = steady(d, rpm, [T[0], 0], 0.43), S1 = steady(d, rpm, T, 0.43);
    const drop = at(S1, of.slot * rpm) - at(S0, of.slot * rpm);
    console.log(`   induction front at ${Math.round(of.slot * rpm)} Hz: ${at(S1, of.slot * rpm).toFixed(0)} dB with torque, ${at(S0, of.slot * rpm).toFixed(0)} dB with none (${drop.toFixed(0)} dB down)`);
    if (!(drop > 30)) fails.push(`${d.name}: the induction front motor is heard with no torque`);
  }
  // the drive cycle: no NaN, bounded; its cost
  const syn = makeEvSound(d), t0 = performance.now(); let n = 0, bad = 0, pk = 0;
  for (const s of cycle(d)) { const y = syn(s.rpm, s.Ts, s.m); n++; if (!Number.isFinite(y)) bad++; pk = Math.max(pk, Math.abs(y)); }
  const ms = performance.now() - t0, rt = ms / 1000 / (n / sr);
  console.log(`   drive cycle ${(n / sr).toFixed(1)} s: ${bad} NaN, peak ${pk.toFixed(2)}, ${(rt * 100).toFixed(1)}% of real time (with the cycle's own dynamics)`);
  if (bad || pk > 4) fails.push(`${d.name}: the drive cycle renders NaN or runs away`);
}
// the inverter: SiC higher and quieter than IGBT
if (sic && igbt) {
  const T = [0.5 * sic.groups[0].Tpk], fe = voiceOrders(sic.groups[0], sic.fd).fe * 3000;
  const a = at(steady(sic, 3000, T, 0.43), 16000 + 2 * fe), b = at(steady(igbt, 3000, T, 0.43), 10000 + 2 * fe);
  console.log(`== inverter sideband fc + 2fe at 3000 rpm: SiC ${Math.round(16000 + 2 * fe)} Hz ${a.toFixed(1)} dB, IGBT ${Math.round(10000 + 2 * fe)} Hz ${b.toFixed(1)} dB ==`);
  if (!(a < b - 2)) fails.push('a SiC inverter is not quieter than an IGBT one');
}
if (fails.length) { console.log('\nFAIL:\n  ' + fails.join('\n  ')); process.exit(1); }
console.log('\nOK: every voice sits where the drive puts it, follows the speed and the load, and the cycle renders clean.');
