// Batch 2 shortlist: next 100 factory cars (research/vehicles-batch-2).
//
// WHY THIS EXISTS. The queue is research-only (names, categories, waves) until later sessions
// write full vehicle.json packs and presets. What must hold:
//   · queue.json has exactly 100 unique ids and names;
//   · every cat and chassis key is one the picker / CHASSIS already know;
//   · none of the shortlist names collide with current FACTORY_CARS;
//   · Electric / Hybrid rows use the electric/hybrid path, not combustion.
import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const repo = fileURLToPath(new URL('..', import.meta.url));
const fails = [];

try {
  const out = execFileSync('node', [path.join(repo, 'research/vehicles-batch-2/validate.mjs')], { encoding: 'utf8' });
  console.log('== pack: ' + out.trim() + ' ==');
} catch (e) {
  fails.push('validate.mjs failed:\n' + (e.stdout || '') + (e.stderr || e.message));
}

const pack = JSON.parse(fs.readFileSync(path.join(repo, 'research/vehicles-batch-2/queue.json'), 'utf8'));
const byCat = {};
for (const v of pack.vehicles) byCat[v.cat] = (byCat[v.cat] || 0) + 1;
console.log('== by category: ' + Object.entries(byCat).map(([k, n]) => `${k} ${n}`).join(', ') + ' ==');
if (pack.vehicles.length !== 100) fails.push(`count ${pack.vehicles.length}`);
if ((byCat.Electric || 0) !== 7) fails.push(`Electric expected 7, got ${byCat.Electric}`);
if ((byCat.Hybrid || 0) !== 8) fails.push(`Hybrid expected 8, got ${byCat.Hybrid}`);

if (fails.length) {
  console.error('FAIL');
  for (const f of fails) console.error('-', f);
  process.exit(1);
}
console.log('OK batch-2 shortlist');
process.exit(0);
