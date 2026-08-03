#!/usr/bin/env node
// Run the whole suite and report by EXIT CODE, never by scraping stdout.
//
// This matters more than it looks. The ad-hoc runner this replaces grepped stdout for "FAIL", so a
// test that THREW — exiting non-zero without ever printing its verdict — was reported as passing.
// test42 sat broken and green that way. A test harness that can report a crash as a pass is worse
// than no harness, because it converts silence into false confidence.
//
//   node tests/run.mjs              run everything
//   node tests/run.mjs 41 43 aero   run only those
//   node tests/run.mjs --list       show what exists
import { readdirSync } from 'fs';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';

const DIR = fileURLToPath(new URL('.', import.meta.url));
const all = readdirSync(DIR).filter(f => f.endsWith('.mjs') && !['run.mjs','pw.mjs'].includes(f)).sort((a, b) => {
  const n = s => { const m = s.match(/(\d+)/); return m ? +m[1] : 1e9; };
  return n(a) - n(b) || a.localeCompare(b);
});
const args = process.argv.slice(2);
if (args.includes('--list')) { all.forEach(f => console.log('  ' + f)); process.exit(0); }
const pick = args.filter(a => !a.startsWith('--'));
const run = pick.length ? all.filter(f => pick.some(p => f.includes(p))) : all;
if (!run.length) { console.error('no tests matched ' + pick.join(' ')); process.exit(2); }

const one = f => new Promise(res => {
  const t0 = Date.now();
  const p = spawn(process.execPath, [path.join(DIR, f)], { stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '';
  p.stdout.on('data', d => out += d); p.stderr.on('data', d => out += d);
  p.on('close', code => res({ f, code, ms: Date.now() - t0, out }));
});

const results = [];
for (const f of run) {
  const r = await one(f);
  results.push(r);
  const tag = r.code === 0 ? 'PASS' : 'FAIL';
  console.log(`${tag}  ${f.padEnd(16)} ${String(r.ms + 'ms').padStart(8)}` +
    (r.code === 0 ? '' : `  (exit ${r.code})`));
}
const failed = results.filter(r => r.code !== 0);
if (failed.length) {
  console.log(`\n${'='.repeat(70)}`);
  for (const r of failed) {
    console.log(`\n--- ${r.f} ---`);
    // show the verdict if it printed one, otherwise the tail (which is where a crash lands)
    const v = r.out.split('\n').filter(l => /^(FAIL|ERRORS|\s+\S.*)/.test(l));
    console.log((r.out.includes('FAIL:') ? r.out.slice(r.out.indexOf('FAIL:')) : r.out.split('\n').slice(-14).join('\n')).trim());
  }
}
console.log(`\n${results.length - failed.length}/${results.length} passed` +
  (failed.length ? `  ·  failing: ${failed.map(r => r.f).join(', ')}` : ''));
process.exit(failed.length ? 1 : 0);
