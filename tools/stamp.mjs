#!/usr/bin/env node
// Stamp a unique build number into the app, and verify it later.
//
//   node tools/stamp.mjs           bump the build number in index.html and README.md
//   node tools/stamp.mjs --check   verify the stamp is consistent and was actually bumped
//
// WHY NOT THE COMMIT COUNT. The first version of this derived the build number from
// `git rev-list --count HEAD`, which is tidy: monotonic, free, and recomputable from any checkout
// to prove a build is what it claims. It broke on the first squash-merge. Three stamped commits on
// a branch collapse into one on main, so main's count came out two BELOW the number already
// written into the file, and --check failed on a repository that was perfectly correct. Commit
// count can only shrink under squash-merge, so it cannot carry a number that must never repeat.
//
// So the build number is now simply a counter that lives in the file and only ever goes up. It
// survives squashing (the value is in the squashed content), it can never repeat, and bumping it
// is the one thing you have to remember — which is exactly what --check enforces, by requiring the
// working tree to be ahead of whatever origin/main carries.
import { readFileSync, writeFileSync } from 'fs';
import { execSync } from 'child_process';

const VERSION = '0.6';
const ROOT = new URL('..', import.meta.url).pathname;
const check = process.argv.includes('--check');
const STAMP_RE = /PIXEL ENGINE SIM v[\d.]+ build (\d+)/;

const files = [
  { name: 'index.html', re: /PIXEL ENGINE SIM v[\d.]+ build \d+/g },
  { name: 'README.md',  re: /^# PIXEL ENGINE SIM v[\d.]+ build \d+/m },
];

const read = name => {
  const src = readFileSync(ROOT + name, 'utf8');
  const m = src.match(STAMP_RE);
  if (!m) { console.error(`  ${name}: no "PIXEL ENGINE SIM v… build N" stamp found`); process.exit(1); }
  return { src, build: +m[1] };
};

const current = files.map(f => ({ ...f, ...read(f.name) }));
const disagree = current.some(f => f.build !== current[0].build);
if (disagree) {
  console.error('  files disagree: ' + current.map(f => `${f.name}=${f.build}`).join(', '));
  if (check) process.exit(1);
}

// What does the merged history already carry? Used only to prove the number moved.
let mainBuild = null;
try {
  const s = execSync('git show origin/main:index.html', { cwd: ROOT, maxBuffer: 64 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'ignore'] }).toString();
  const m = s.match(STAMP_RE);
  if (m) mainBuild = +m[1];
} catch { /* no origin/main yet — first commit in a fresh clone */ }

if (check) {
  current.forEach(f => console.log(`  ${f.name.padEnd(12)} v${VERSION} build ${f.build}`));
  if (mainBuild !== null) {
    const ahead = execSync('git rev-list --count origin/main..HEAD', { cwd: ROOT }).toString().trim();
    if (+ahead > 0 && current[0].build <= mainBuild) {
      console.error(`\nFAIL: ${ahead} commit(s) ahead of origin/main (build ${mainBuild}) but still ` +
        `stamped build ${current[0].build}. Run "node tools/stamp.mjs" and amend.`);
      process.exit(1);
    }
    console.log(`  origin/main carries build ${mainBuild}` +
      (+ahead > 0 ? ` — this tree is ${ahead} commit(s) ahead at build ${current[0].build}` : ''));
  }
  console.log(`\nOK: build ${current[0].build} is consistent and ahead of the merged history.`);
} else {
  const next = Math.max(current[0].build, mainBuild ?? 0) + 1;
  const stamp = `PIXEL ENGINE SIM v${VERSION} build ${next}`;
  current.forEach(f => {
    writeFileSync(ROOT + f.name, f.src.replace(f.re, f.name === 'README.md' ? '# ' + stamp : stamp));
    console.log(`  ${f.name.padEnd(12)} -> v${VERSION} build ${next}`);
  });
  console.log(`\nStamped build ${next}. It only ever goes up, so it survives a squash-merge.`);
}
