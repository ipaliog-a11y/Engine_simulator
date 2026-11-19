#!/usr/bin/env node
// Join the sources in src/ into the pages that ship: index.html, and film.html.
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
const INCLUDE = /^<!-- @include (\S+) -->$/;
const check = process.argv.includes('--check');
// index.html is the sim. film.html is the evolution film, joined the same way so its script is
// edited in src/ and still ships. A file under src/ must be included by one of these pages.
const PAGES = [
  { shell: 'shell.html', out: 'index.html' },
  { shell: 'film-shell.html', out: 'film.html' }
];

const fail = msg => { console.error(msg); process.exit(1); };

function join(shell, used) {
  used.add(shell);
  const lines = readFileSync(path.join(SRC, shell), 'utf8').split('\n');
  return lines.map((line, i) => {
    const m = line.match(INCLUDE);
    if (!m) return line;
    const rel = m[1];
    if (used.has(rel)) fail(`  src/${shell}:${i + 1}: ${rel} is included twice`);
    used.add(rel);
    let s;
    try { s = readFileSync(path.join(SRC, rel), 'utf8'); }
    catch { fail(`  src/${shell}:${i + 1}: src/${rel} does not exist`); }
    // Each part is whole lines. The include line's own newline is the part's last one.
    if (!s.endsWith('\n')) fail(`  src/${rel} must end with a newline`);
    if (s.split('\n').some(l => INCLUDE.test(l))) fail(`  src/${rel}: includes do not nest`);
    return s.slice(0, -1);
  }).join('\n');
}

function build() {
  const used = new Set();
  const pages = PAGES.map(p => {
    const text = join(p.shell, used);
    const parts = readFileSync(path.join(SRC, p.shell), 'utf8').split('\n').filter(l => INCLUDE.test(l)).length;
    return { ...p, text, parts };
  });
  const walk = d => readdirSync(d).flatMap(n => {
    const f = path.join(d, n);
    return statSync(f).isDirectory() ? walk(f) : [path.relative(SRC, f).split(path.sep).join('/')];
  });
  const orphans = walk(SRC).filter(f => !used.has(f));
  if (orphans.length) fail(`  not included by src/: ${orphans.join(', ')}`);
  return pages;
}

const pages = build();
for (const p of pages) {
  const dest = path.join(ROOT, p.out);
  if (check) {
    const cur = readFileSync(dest, 'utf8');
    if (cur !== p.text) {
      const a = cur.split('\n'), b = p.text.split('\n');
      let i = 0; while (i < a.length && i < b.length && a[i] === b[i]) i++;
      fail(`FAIL: ${p.out} is not what src/ builds (first difference at line ${i + 1}).\n` +
        `  Edit src/, not ${p.out}, then run "node tools/build.mjs".`);
    }
    console.log(`OK: ${p.out} is src/ joined (${p.parts} parts).`);
  } else {
    writeFileSync(dest, p.text);
    console.log(`  ${p.out} <- src/ (${p.parts} parts, ${(Buffer.byteLength(p.text) / 1024).toFixed(0)} KB)`);
  }
}
