// The fingerprint covers the electric and hybrid cars (build 231).
//
// WHY THIS EXISTS. tools/fingerprint.mjs is how a build proves it moved nothing, and every stage of
// plans/hybrid-electric/drivetrain.md is told to use it. It walked the combustion presets only, so a change to
// electric.js came back "identical" whatever it moved. It now records the three Teslas and the five hybrids.
// What must hold:
//   · --only=electric records all eight: the drive's score, the pack, its WLTP figure (Wh/km for an electric car,
//     L/100 km for a hybrid), the 0-100 and top speed, and a lap;
//   · two recordings of the same code are identical, so "identical" means something (the lap is hashed without the
//     track's cache of other cars' lines, and the score at 6 significant digits);
//   · the pack is recorded warm and cold, so a change to its temperature model shows up.
import { spawnSync } from 'child_process';
import { readFileSync, mkdtempSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import os from 'os';
const repo = fileURLToPath(new URL('..', import.meta.url));
const tool = path.join(repo, 'tools', 'fingerprint.mjs');
const dir = mkdtempSync(path.join(os.tmpdir(), 'fp141-'));
const fails = [];
const rec = f => { const r = spawnSync(process.execPath, [tool, '--only=electric', f], { encoding: 'utf8' }); if (r.status) fails.push('recording failed: ' + r.stderr + r.stdout); return r; };
const a = path.join(dir, 'a.json'), b = path.join(dir, 'b.json');
rec(a); rec(b);
const cmp = spawnSync(process.execPath, [tool, '--compare', a, b], { encoding: 'utf8' });
console.log('== two recordings: ' + cmp.stdout.trim().split('\n').pop() + ' ==');
if (cmp.status) fails.push('two recordings of the same code differ:\n' + cmp.stdout);
const d = JSON.parse(readFileSync(a, 'utf8')).data.electric || {};
const names = Object.keys(d);
console.log(`== ${names.length} cars: ${names.join(', ')} ==`);
if (names.length !== 8) fails.push('expected the 3 electric and 5 hybrid cars, got ' + names.length);
for (const [n, c] of Object.entries(d)) {
  const ev = /Tesla/.test(n), cyc = c.cycle || {};
  const pm = (c.pack && c.pack.pMax) || [];
  console.log(`   ${n}: ${ev ? cyc.whkm && cyc.whkm.toFixed(1) + ' Wh/km' : cyc.lPer100 && cyc.lPer100.toFixed(2) + ' L/100'} · 0-100 ${c.accel && c.accel.t100 && c.accel.t100.toFixed(2)} s · lap ${c.tech && c.tech.lap && c.tech.lap.toFixed(2)} s · pack ${pm.map(x => Math.round(x / 1000)).join('/')} kW at 25/0/-10 °C`);
  if (!c.score || !c.accel || !c.tech) fails.push(n + ': score, 0-100 or lap missing');
  if (ev ? !(cyc.whkm > 50) : !(cyc.lPer100 > 1)) fails.push(n + ': no WLTP figure');
  if (pm.length !== 3 || !(pm[0] > 0)) fails.push(n + ': the pack is not recorded warm and cold');
}
console.log(fails.length ? '\nFAIL:\n  ' + fails.join('\n  ') : '\nPASS');
process.exit(fails.length ? 1 : 0);
