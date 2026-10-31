// Renders each exported drive (drives.json) through a launch, a lift and a cruise: `node render.mjs <outDir>`.
// The car is the preset's (mass, drag, reduction, tyre); the torque is the full-load curve flat out, regeneration at a
// quarter of the peak on the lift, and what the drag needs at the cruise. Writes <name>.wav (48 kHz, 16 bit) and, if
// ffmpeg is there, <name>.png, a spectrogram.
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';
import { makeEvSound, EV_SOUND } from './synth.mjs';
const here = path.dirname(fileURLToPath(import.meta.url)), out = process.argv[2] || path.join(here, 'out');
fs.mkdirSync(out, { recursive: true });
const drives = JSON.parse(fs.readFileSync(path.join(here, 'drives.json'), 'utf8'));
const tq = (d, rpm) => { const c = d.curve, i = Math.min(c.length - 2, Math.floor(rpm / 250)), f = (rpm - c[i][0]) / 250; return c[i][1] + (c[i + 1][1] - c[i][1]) * f; };
export function knee(d) { const pk = d.curve[1][1]; for (const [r, t] of d.curve) if (t < 0.97 * pk) return r; return d.nMax; }
// The drive cycle: launch to 80% of the top motor speed (or 9 s), lift with regeneration to half that speed, cruise 3 s.
export function* cycle(d) {
  const sr = EV_SOUND.sr, dt = 1 / sr, k = d.fd / d.rTire * 60 / (2 * Math.PI), Gsum = d.groups.reduce((s, g) => s + g.n * g.Tpk, 0);
  const share = T => d.groups.map(g => T * g.n * g.Tpk / Gsum);   // flat out every group gives its share
  let v = 0, t = 0, phase = 'launch', vLift = 0, tc = 0, Tnow = 0;
  const slew = 1.25 * d.curve[1][1] / 0.3;
  const drag = v => 0.5 * 1.2 * d.cdA * v * v + d.crr * d.mass * 9.81;
  while (t < 20) {
    const rpm = v * k, kn = knee(d), m = Math.min(1, rpm / kn);
    let T;
    if (phase === 'launch') { T = tq(d, Math.min(rpm, d.nMax - 1)); if (rpm > 0.8 * d.nMax || t > 9) { phase = 'lift'; vLift = v; } }
    else if (phase === 'lift') { T = -0.25 * d.curve[1][1]; if (v < vLift / 2) { phase = 'cruise'; tc = t; } }
    else { T = drag(v) * d.rTire / d.fd / 0.95; if (t - tc > 3) break; }
    // the controller ramps the torque (about 0.3 s from full drive to regeneration), as a car's does for comfort
    Tnow += Math.max(-slew * dt, Math.min(slew * dt, T - Tnow)); T = Tnow;
    // a cruise on a car with an induction front motor: the rear does it all (no field, no drag at the front)
    const Ts = phase === 'cruise' && d.groups.length > 1 && d.groups[1].im ? [T, 0] : share(T);
    const F = T * d.fd * (T > 0 ? 0.95 : 1 / 0.95) / d.rTire;
    v = Math.max(0, v + (F - drag(v)) / d.mass * dt); t += dt;
    yield { rpm, Ts, m, t, phase };
  }
}
function wav(file, x) {
  const n = x.length, b = Buffer.alloc(44 + 2 * n), sr = EV_SOUND.sr;
  b.write('RIFF', 0); b.writeUInt32LE(36 + 2 * n, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(sr, 24); b.writeUInt32LE(sr * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(2 * n, 40);
  for (let i = 0; i < n; i++) b.writeInt16LE(Math.round(Math.max(-1, Math.min(1, x[i])) * 32767), 44 + 2 * i);
  fs.writeFileSync(file, b);
}
if (import.meta.url === `file://${process.argv[1]}`) {
  for (const d of drives) {
    const syn = makeEvSound(d), x = []; let peak = 0, top = 0, tTop = 0;
    for (const s of cycle(d)) { const y = syn(s.rpm, s.Ts, s.m); x.push(y); peak = Math.max(peak, Math.abs(y)); if (s.rpm > top) { top = s.rpm; tTop = s.t; } }
    const g = 0.7 / Math.max(peak, 1e-6), xs = Float32Array.from(x, y => y * g);
    const name = d.name.replace(/[^A-Za-z0-9]+/g, '-').replace(/-+$/, ''), f = path.join(out, name + '.wav');
    wav(f, xs);
    try { execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', f, '-lavfi', 'showspectrumpic=s=1000x420:legend=1:scale=log:fscale=lin', path.join(out, name + '.png')]); } catch (e) {}
    console.log(`${name}: ${(xs.length / EV_SOUND.sr).toFixed(1)} s, peak ${peak.toFixed(3)}, knee ${knee(d)} rpm, launch to ${Math.round(top)} rpm in ${tTop.toFixed(1)} s`);
  }
}
