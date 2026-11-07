#!/usr/bin/env node
// Put every entry of the translation tables (I18N, GUIDE_I18N, CHALLENGE_I18N in src/js/i18n.js) on a line of its own.
//
//   node tools/split-i18n.mjs            rewrite src/js/i18n.js in place, then prove the tables did not change
//
// Why: a diff or a search that touches a line prints all of it, and lines that held a whole build's strings (31,380
// characters at the longest) made a six-string change an 80 KB diff (build 241; AGENTS.md section 10; test156).
// Use it after merging a branch that still adds strings the old way: take either side's i18n.js, add the other side's
// entries, and run this. A line that is a comment, blank, or one entry is left as it is; a trailing comment moves to a
// line of its own above the entries. It evaluates the tables before and after, and fails if they differ in any key,
// value or key order.
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import vm from 'vm';

const file = fileURLToPath(new URL('../src/js/i18n.js', import.meta.url));
const src = readFileSync(file, 'utf8');

// Split one line at commas outside strings and brackets. Returns { parts, comment } or null if the line is not a run
// of complete entries, each ending in a comma.
function split(line) {
  const parts = []; let depth = 0, q = null, start = 0, comment = '';
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) { if (c === '\\') i++; else if (c === q) q = null; continue; }
    if (c === '"' || c === "'" || c === '`') { q = c; continue; }
    if (c === '/' && line[i + 1] === '/') { comment = line.slice(i).trim(); line = line.slice(0, i); break; }
    if (c === '/' && line[i + 1] === '*') return null;
    if ('{[('.includes(c)) depth++;
    else if ('}])'.includes(c)) { if (--depth < 0) return null; }
    else if (c === ',' && depth === 0) { parts.push(line.slice(start, i).trim()); start = i + 1; }
  }
  if (q || depth !== 0 || line.slice(start).trim()) return null;
  return { parts, comment };
}

const tables = ['const I18N={', 'const GUIDE_I18N={', 'const CHALLENGE_I18N={'];
let inTable = false, split_ = 0, made = 0; const out = [];
for (const line of src.split('\n')) {
  if (tables.includes(line.trim())) { inTable = true; out.push(line); continue; }
  if (inTable && line.startsWith('};')) { inTable = false; out.push(line); continue; }
  const s = inTable && split(line);
  if (!s || s.parts.length < 2) { out.push(line); continue; }
  const indent = line.match(/^\s*/)[0];
  if (s.comment) out.push(indent + s.comment);
  for (const p of s.parts) out.push(indent + p + ',');
  split_++; made += s.parts.length;
}
const next = out.join('\n');

const tablesOf = text => {
  const ctx = {};
  vm.runInNewContext(text + ';this.r=JSON.stringify([I18N,GUIDE_I18N,CHALLENGE_I18N]);', ctx);
  return ctx.r;
};
if (tablesOf(src) !== tablesOf(next)) { console.error('FAIL: the split changed the tables; nothing written.'); process.exit(1); }
if (next !== src) writeFileSync(file, next);
console.log(split_ ? `OK: ${split_} lines split into ${made}, one entry each; the tables are unchanged.`
  : 'OK: every entry is already on its own line.');
