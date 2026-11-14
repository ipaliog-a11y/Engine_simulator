// The register of fitted numbers (build 259).
//
// WHY THIS EXISTS. v1.0 is "every number derived, not fitted", and until build 259 nothing listed what was still
// fitted, so the finish could not be called. plans/fitted-register.json is that list. What must hold:
//   · every entry still points at its number in src/js (an entry whose number is gone must be deleted);
//   · the open entries and the files awaiting an audit only shrink: lower OPEN and AUDIT here when one goes;
//   · a number may be kept as a rule only by the owner's decision: RULES is the signed-off list.
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
const repo = fileURLToPath(new URL('..', import.meta.url));
const OPEN = 41,   // 41 since build 292: FLUX_KM retired by the magnets as geometry. Before: 42 since build 284: electric.js audited, its 15 fitted numbers listed (phase C). Before: 27 since build 278: DRIVE_DRIVER signed off as a rule. Before: 27 since build 266 (TYRE_CC); 28 since build 269: DRIVE_DRIVER, the stepped car's driver, awaiting sign-off as a rule
      AUDIT = 10, RULES = ['RACE_DRIVERS', 'part costs', 'DRIVE_DRIVER'];   // DRIVE_DRIVER: owner's sign-off, build 278
const reg = JSON.parse(readFileSync(path.join(repo, 'plans/fitted-register.json'), 'utf8'));
const fails = [];
for (const e of reg.entries) {
  let src = '';
  try { src = readFileSync(path.join(repo, 'src/js', e.file), 'utf8'); } catch { fails.push(`${e.id}: no file ${e.file}`); continue; }
  if (!src.includes(e.match)) fails.push(`${e.id}: "${e.match}" is gone from ${e.file}; delete the entry and lower OPEN`);
  if (!e.standsFor || !e.retiredBy) fails.push(`${e.id}: needs standsFor and retiredBy`);
  if (e.state === 'rule' && !RULES.includes(e.id)) fails.push(`${e.id}: kept as a rule without the owner's sign-off`);
  if (e.state !== 'rule' && e.state !== 'open') fails.push(`${e.id}: state ${e.state}`);
}
const open = reg.entries.filter(e => e.state === 'open').length;
if (open !== OPEN) fails.push(`open entries ${open}, the test holds ${OPEN} (the list may only shrink; lower OPEN with it)`);
if (reg.audit.length !== AUDIT) fails.push(`files awaiting audit ${reg.audit.length}, the test holds ${AUDIT}`);
const byPhase = {};
for (const e of reg.entries) (byPhase[e.phase] ||= []).push(e.id);
console.log(`fitted numbers: ${open} open, ${reg.entries.length - open} kept as rules, ${reg.audit.length} files to audit`);
for (const p of Object.keys(byPhase).sort()) console.log(`  phase ${p}: ${byPhase[p].join(', ')}`);
if (fails.length) { console.log('\nFAIL\n' + fails.map(f => '  - ' + f).join('\n')); process.exit(1); }
console.log('\nPASS');
