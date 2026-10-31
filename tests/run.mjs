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
//   node tests/run.mjs --list       show what exists (with --shard, what that shard runs)
//   node tests/run.mjs --shard=2/5  run the 2nd of 5 shares, as CI does (.github/workflows/tests.yml)
//
// A shard is a share of the tests by running time, not by count: tests/durations.json holds each test's time from the
// last full run (a test it lacks counts as 30 s), and the longest are dealt first, each to the shard with the least so
// far. Every shard computes the same split from the same list, so the shards cover the suite once between them.
import { readdirSync, readFileSync } from 'fs';
import { spawn, spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';

const DIR = fileURLToPath(new URL('.', import.meta.url));
const all = readdirSync(DIR).filter(f => f.endsWith('.mjs') && !['run.mjs','pw.mjs'].includes(f)).sort((a, b) => {
  const n = s => { const m = s.match(/(\d+)/); return m ? +m[1] : 1e9; };
  return n(a) - n(b) || a.localeCompare(b);
});
const args = process.argv.slice(2);
const pick = args.filter(a => !a.startsWith('--'));
let run = pick.length ? all.filter(f => pick.some(p => f.includes(p))) : all;
const shardArg = args.find(a => a.startsWith('--shard='));
if (shardArg) {
  const [k, n] = shardArg.slice(8).split('/').map(Number);
  if (!(n >= 1 && k >= 1 && k <= n)) { console.error('--shard=k/n wants 1 <= k <= n'); process.exit(2); }
  let ms = {};
  try { ms = JSON.parse(readFileSync(path.join(DIR, 'durations.json'), 'utf8')); } catch {}
  const t = f => ms[f] || 30000, load = new Array(n).fill(0), share = new Map();
  for (const f of [...run].sort((a, b) => t(b) - t(a) || a.localeCompare(b))) {
    let j = 0; for (let i = 1; i < n; i++) if (load[i] < load[j]) j = i;
    load[j] += t(f); share.set(f, j);
  }
  run = run.filter(f => share.get(f) === k - 1);
  console.log(`shard ${k}/${n}: ${run.length} tests, ~${Math.round(load[k - 1] / 60000)} min on the last full run's times`);
}
if (args.includes('--list')) { run.forEach(f => console.log('  ' + f)); process.exit(0); }   // with --shard: that shard's
if (!run.length) { console.error('no tests matched ' + pick.join(' ')); process.exit(2); }

// The tests load index.html, which is src/ joined by tools/build.mjs. Run against a stale join and
// they would pass or fail on code that is no longer the source.
const built = spawnSync(process.execPath, [path.join(DIR, '..', 'tools', 'build.mjs'), '--check'], { encoding: 'utf8' });
if (built.status !== 0) { console.error((built.stderr || built.stdout).trim()); process.exit(1); }

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
