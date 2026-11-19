// Import-vehicle skill: research validator and accuracy helper (build 364).
//
// WHY THIS EXISTS. Agents import real cars via `.cursor/skills/import-vehicle/`. The skill's
// validate-research script must accept a known-good research entry (batch-1 Ferrari F40), and
// check-accuracy must load a shipped factory car and exit 0 inside the documented bands.
// What must hold:
//   · the skill's SKILL.md names the workflow and the hard rules;
//   · validate-research.mjs exits 0 on the F40 research entry written to a temp file;
//   · check-accuracy.mjs exits 0 on "Ferrari F40 (1987)" (already in the game, medium confidence).
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';
import fs from 'fs';
import path from 'path';
import os from 'os';

const repo = fileURLToPath(new URL('..', import.meta.url));
const fails = [];
const skill = path.join(repo, '.cursor/skills/import-vehicle');
const skillMd = fs.readFileSync(path.join(skill, 'SKILL.md'), 'utf8');
if (!/^---\nname: import-vehicle\n/m.test(skillMd)) fails.push('SKILL.md missing name frontmatter');
if (!/Derive, do not fit/i.test(skillMd)) fails.push('SKILL.md missing derive-do-not-fit rule');
if (!/check-accuracy\.mjs/.test(skillMd)) fails.push('SKILL.md does not point at check-accuracy.mjs');

const pack = JSON.parse(fs.readFileSync(path.join(repo, 'research/vehicles-batch-1/vehicles.json'), 'utf8'));
const f40 = pack.vehicles.find(v => v.name === 'Ferrari F40 (1987)');
if (!f40) fails.push('batch-1 has no Ferrari F40 to use as a validator fixture');
else {
  const tmp = path.join(os.tmpdir(), 'pes-import-vehicle-f40.json');
  // The car already exists in presets; the validator would fail on duplicate name. Rename for the shape check.
  // Keep the real engine name; mark existing so the validator does not demand a new PRESETS slot.
  const sample = Object.assign({}, f40, {
    name: 'IMPORT-VEHICLE-SKILL-FIXTURE F40',
    id: 'import-vehicle-skill-fixture-f40',
    engineStatus: 'existing',
  });
  delete sample.enginePreset;
  fs.writeFileSync(tmp, JSON.stringify(sample));
  try {
    const out = execFileSync('node', [path.join(skill, 'scripts/validate-research.mjs'), tmp], { encoding: 'utf8' });
    console.log('== validate: ' + out.trim() + ' ==');
  } catch (e) {
    fails.push('validate-research failed: ' + (e.stderr || e.stdout || e.message).toString().slice(0, 400));
  } finally {
    try { fs.unlinkSync(tmp); } catch (_) {}
  }
}

try {
  const out = execFileSync('node', [path.join(skill, 'scripts/check-accuracy.mjs'), 'Ferrari F40 (1987)'], {
    encoding: 'utf8', timeout: 120000,
  });
  console.log(out.trim().split('\n').map(l => '== ' + l + ' ==').join('\n'));
} catch (e) {
  fails.push('check-accuracy F40 failed: ' + (e.stderr || e.stdout || e.message).toString().slice(0, 500));
}

if (fails.length) {
  console.log('\nFAIL:\n  ' + fails.join('\n  '));
  process.exit(1);
}
console.log('\nOK: import-vehicle skill scripts validate research and check a real car.');
process.exit(0);
