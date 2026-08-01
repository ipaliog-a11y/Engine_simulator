#!/usr/bin/env node
// Stamp a unique build number into the app, and verify it later.
//
// The build number is the repository's commit count. That gives every commit its own number, for
// free and without a counter to keep in sync: it is monotonic, it never repeats, and it can be
// recomputed from any checkout to prove a build is what it claims to be.
//
// Because the stamp is written BEFORE the commit that carries it, the number written is
// `rev-list --count HEAD` + 1 — the count this commit will have once it exists. After committing,
// `--check` re-reads it and confirms the two agree, which is what catches a forgotten stamp.
//
//   node tools/stamp.mjs           write the next build number into index.html and README.md
//   node tools/stamp.mjs --check   verify the committed stamp matches the committed history
//
// There is deliberately no build step and no dependency: this edits the shipped file in place, so
// index.html stays something you can open, read and hand-edit.
import { readFileSync, writeFileSync } from 'fs';
import { execSync } from 'child_process';

const VERSION = '0.6';
const ROOT = new URL('..', import.meta.url).pathname;
const check = process.argv.includes('--check');

const commits = +execSync('git rev-list --count HEAD', { cwd: ROOT }).toString().trim();
const build = check ? commits : commits + 1;   // pre-commit, this commit does not exist yet
const stamp = `v${VERSION} build ${build}`;

const files = [
  { path: ROOT + 'index.html', re: /PIXEL ENGINE SIM v[\d.]+(?: build \d+)?/g, to: `PIXEL ENGINE SIM ${stamp}` },
  { path: ROOT + 'README.md',  re: /^# PIXEL ENGINE SIM v[\d.]+(?: build \d+)?/m, to: `# PIXEL ENGINE SIM ${stamp}` },
];

let bad = 0;
for (const f of files) {
  const src = readFileSync(f.path, 'utf8');
  const found = src.match(f.re);
  if (!found) { console.error(`  ${f.path.split('/').pop()}: no version string found`); bad++; continue; }
  if (check) {
    const wrong = found.filter(m => !m.endsWith(stamp));
    if (wrong.length) { console.error(`  ${f.path.split('/').pop()}: stamped "${wrong[0]}", expected "PIXEL ENGINE SIM ${stamp}"`); bad++; }
    else console.log(`  ${f.path.split('/').pop().padEnd(12)} ${found[0]}`);
  } else {
    writeFileSync(f.path, src.replace(f.re, f.to));
    console.log(`  ${f.path.split('/').pop().padEnd(12)} -> ${stamp}`);
  }
}
if (check && bad) {
  console.error(`\nFAIL: run "node tools/stamp.mjs" and amend the commit.`);
  process.exit(1);
}
console.log(check ? `\nOK: build ${build} matches ${commits} commits.` : `\nStamped build ${build}. Commit now — the count will match.`);
