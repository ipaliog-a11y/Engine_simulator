#!/usr/bin/env node
// Join the sources in src/ into the one index.html that ships.
//
//   node tools/build.mjs           write index.html from src/
//   node tools/build.mjs --check   fail if index.html is not exactly what src/ builds
//
// WHY A JOIN AND NOT MODULES. The app is one file on purpose: it opens straight from file:// with no
// server, no build step for the person using it and no dependencies, works offline, and is a single
// artefact to share. ES modules are blocked from file://, so the shipped page stays one classic
// script. What changed (build 176) is only where it is edited: at 1.6 MB a single source file had
// outgrown its editor, so the source is cut along the seams already marked in it and joined back.
//
// The join is deliberately dumb. src/shell.html is the page with each part replaced by a line
//   <!-- @include path -->
// (path relative to src/), and that whole line becomes the file's contents, byte for byte. No
// nesting, no transforms, no minifying: the output is the file you would have written by hand, so
// a stack trace's line in index.html is findable and the page served is the page reviewed.
//
// index.html is COMMITTED. GitHub Pages serves the repository as it is, the tests load index.html,
// and tools/stamp.mjs reads the merged history's index.html; none of them run a build. --check is
// what keeps the committed file honest: edit src/, run this, commit both.
import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SRC = path.join(ROOT, 'src');
const OUT = path.join(ROOT, 'index.html');
const SHELL = 'shell.html';
const INCLUDE = /^<!-- @include (\S+) -->$/;
const check = process.argv.includes('--check');

const fail = msg => { console.error(msg); process.exit(1); };

function build() {
  const used = new Set([SHELL]);
  const lines = readFileSync(path.join(SRC, SHELL), 'utf8').split('\n');
  const out = lines.map((line, i) => {
    const m = line.match(INCLUDE);
    if (!m) return line;
    const rel = m[1];
    if (used.has(rel)) fail(`  src/${SHELL}:${i + 1}: ${rel} is included twice`);
    used.add(rel);
    let s;
    try { s = readFileSync(path.join(SRC, rel), 'utf8'); }
    catch { fail(`  src/${SHELL}:${i + 1}: src/${rel} does not exist`); }
    // Each part is whole lines. The include line's own newline is the part's last one.
    if (!s.endsWith('\n')) fail(`  src/${rel} must end with a newline`);
    if (s.split('\n').some(l => INCLUDE.test(l))) fail(`  src/${rel}: includes do not nest`);
    return s.slice(0, -1);
  }).join('\n');
  // A file in src/ that nothing includes is code that silently does not ship.
  const walk = d => readdirSync(d).flatMap(n => {
    const f = path.join(d, n);
    return statSync(f).isDirectory() ? walk(f) : [path.relative(SRC, f).split(path.sep).join('/')];
  });
  const orphans = walk(SRC).filter(f => !used.has(f));
  if (orphans.length) fail(`  not included by src/${SHELL}: ${orphans.join(', ')}`);
  return { out, parts: used.size - 1 };
}

const { out, parts } = build();
if (check) {
  const cur = readFileSync(OUT, 'utf8');
  if (cur !== out) {
    const a = cur.split('\n'), b = out.split('\n');
    let i = 0; while (i < a.length && i < b.length && a[i] === b[i]) i++;
    fail(`FAIL: index.html is not what src/ builds (first difference at line ${i + 1}).\n` +
      `  Edit src/, not index.html, then run "node tools/build.mjs".`);
  }
  console.log(`OK: index.html is src/ joined (${parts} parts).`);
} else {
  writeFileSync(OUT, out);
  console.log(`  index.html <- src/ (${parts} parts, ${(Buffer.byteLength(out) / 1024).toFixed(0)} KB)`);
}
