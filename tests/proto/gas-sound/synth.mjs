// The audio stage of engine-sim's Synthesizer (src/synthesizer.cpp), ported: the gas model's exhaust signal
// arrives at the simulation rate, is linearly upsampled and band-limited to 1.9 kHz, jittered, DC-removed,
// mixed with a little of its own derivative, multiplied by low-passed noise (the "air noise": the pressure
// wave sets how much turbulent noise the exhaust makes), convolved with a recorded exhaust impulse response,
// and levelled. MIT licence, Copyright 2022 AngeTheGreat (Ange Yaghi); full text in gas.mjs.
const PI = Math.PI;
function biquadLP(f, fs, q) {
  const w = 2 * PI * f / fs, al = Math.sin(w) / (2 * q), c = Math.cos(w), a0 = 1 + al;
  const b0 = (1 - c) / 2 / a0, b1 = (1 - c) / a0, b2 = b0, a1 = -2 * c / a0, a2 = (1 - al) / a0;
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  return x => { const y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2; x2 = x1; x1 = x; y2 = y1; y1 = y; return y; };
}
// 4th-order Butterworth as two biquads
const butter4 = (f, fs) => { const a = biquadLP(f, fs, 0.5412), b = biquadLP(f, fs, 1.3066); return x => b(a(x)); };
export function synthesize(input, simHz, fs, ir, p = {}) {
  const P = Object.assign({ dF_F_mix: 0.01, inputSampleNoise: 0.5, airNoise: 1.0, convolution: 1.0 }, p);
  const nOut = Math.floor(input.length * fs / simHz), dry = new Float32Array(nOut);
  const aa = butter4(1900, fs), airLP = butter4(2000, fs), jitLP = butter4(10000, fs);
  const hist = new Float32Array(10); let hi = 0, dc = 0, prev = 0;
  const dcA = 1 - Math.exp(-2 * PI * 10 / fs);
  for (let i = 0; i < nOut; i++) {
    const t = i * simHz / fs, k = Math.floor(t), f = t - k;
    const s = aa((input[k] || 0) * (1 - f) + (input[k + 1] || 0) * f);
    hist[hi] = s; hi = (hi + 1) % 10;                                   // JitterFilter: read up to 10 samples back
    const j = Math.max(0, Math.min(9, jitLP(Math.random() * 9 * P.inputSampleNoise)));
    const j0 = Math.floor(j), j1 = Math.ceil(j), jf = j - j0;
    const fin = hist[(hi + j1) % 10] * jf + hist[(hi + j0) % 10] * (1 - jf);
    dc += dcA * (fin - dc); const fv = fin - dc;
    const fp = (fin - prev) * fs; prev = fin;
    const r = airLP(2 * Math.random() - 1), rm = P.airNoise * r + (1 - P.airNoise);
    dry[i] = fp * P.dF_F_mix + fv * rm * (1 - P.dF_F_mix);
  }
  if (!ir) return dry;
  const out = new Float32Array(nOut), L = ir.length;                    // direct convolution, offline only
  for (let i = 0; i < nOut; i++) { const x = dry[i]; if (!x) continue; for (let k = 0, m = Math.min(L, nOut - i); k < m; k++) out[i + k] += x * ir[k]; }
  for (let i = 0; i < nOut; i++) out[i] = P.convolution * out[i] + (1 - P.convolution) * dry[i];
  return out;
}
// LevelingFilter, scaled to +/-1
export function level(x, target = 0.6, maxGain = 1.9e9, minGain = 1e-12) {
  let peak = 1e-9, att = 0; const y = new Float32Array(x.length);
  for (let i = 0; i < x.length; i++) {
    peak *= 0.999; const a = Math.abs(x[i]); if (a > peak) peak = a;
    const g = Math.min(maxGain, Math.max(minGain, target / peak)); att = att ? 0.9 * att + 0.1 * g : g;
    y[i] = x[i] * att;
  }
  return y;
}
export function readWav(buf) {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength); let o = 12, data = null, ch = 1, bits = 16;
  while (o < buf.length - 8) { const id = String.fromCharCode(...buf.slice(o, o + 4)), sz = dv.getUint32(o + 4, true);
    if (id === 'fmt ') { ch = dv.getUint16(o + 10, true); bits = dv.getUint16(o + 22, true); }
    if (id === 'data') { data = [o + 8, sz]; break; } o += 8 + sz + (sz & 1); }
  const n = data[1] / (bits / 8) / ch, out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = dv.getInt16(data[0] + i * ch * 2, true) / 32768;
  return out;
}
export function writeWav(x, fs) {
  const dv = new DataView(new ArrayBuffer(44 + x.length * 2)); const w = (o, s) => [...s].forEach((c, i) => dv.setUint8(o + i, c.charCodeAt(0)));
  w(0, 'RIFF'); dv.setUint32(4, 36 + x.length * 2, true); w(8, 'WAVEfmt '); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 1, true);
  dv.setUint32(24, fs, true); dv.setUint32(28, fs * 2, true); dv.setUint16(32, 2, true); dv.setUint16(34, 16, true); w(36, 'data'); dv.setUint32(40, x.length * 2, true);
  for (let i = 0; i < x.length; i++) dv.setInt16(44 + i * 2, Math.max(-1, Math.min(1, x[i])) * 32767, true);
  return Buffer.from(dv.buffer);
}
