// Development instructions stay in the repository (build 213).
//
// WHY THIS EXISTS. Every later build is supposed to follow AGENTS.md, and Cursor is supposed to
// load it through an always-applied rule. What must hold:
//   · AGENTS.md is at the repository root and still states the method: one build per pull request,
//     edit src/ and join index.html, merge main (never rebase) when it moves, derive rather than fit,
//     fingerprint, a test per build, Greek for every visible string;
//   · .cursor/rules/development.mdc applies on every task and points at AGENTS.md;
//   · the README tells a person opening the repo to read AGENTS.md first.
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = rel => readFileSync(path.join(root, rel), 'utf8');
const fails = [];

let agents = '';
try { agents = read('AGENTS.md'); }
catch { fails.push('AGENTS.md is missing from the repository root'); }

const need = [
  'One change = one build = one pull request',
  'Edit `src/`',
  'node tools/build.mjs',
  'node tools/stamp.mjs',
  'git merge origin/main',
  'never rebase',
  'Derive, do not fit',
  'tools/fingerprint.mjs',
  'WHY THIS EXISTS',
  'Every visible English string has Greek',
  'test87',
];
for (const phrase of need) {
  if (agents && !agents.includes(phrase)) fails.push(`AGENTS.md no longer contains: ${phrase}`);
}

let rule = '';
try { rule = read('.cursor/rules/development.mdc'); }
catch { fails.push('.cursor/rules/development.mdc is missing'); }
if (rule && !/alwaysApply:\s*true/.test(rule)) fails.push('the Cursor rule is not always applied');
if (rule && !rule.includes('AGENTS.md')) fails.push('the Cursor rule does not point at AGENTS.md');

const readme = read('README.md');
if (!readme.includes('AGENTS.md')) fails.push('the README does not link to AGENTS.md');

if (fails.length) {
  console.log('FAIL: ' + fails.length);
  fails.forEach(f => console.log('  ' + f));
  process.exit(1);
}
console.log('OK: AGENTS.md, the Cursor rule and the README link are in place.');
