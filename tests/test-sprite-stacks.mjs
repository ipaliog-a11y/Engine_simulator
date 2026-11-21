#!/usr/bin/env node
// Automated verification test for Sprite-Stacked Cars + Track Scene v2 (plans/sprite-stacked-cars.md §5).
//
// Usage:
//   node tests/test-sprite-stacks.mjs

import { readFileSync, existsSync } from 'fs';
import { execFileSync } from 'child_process';
import assert from 'assert';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

function readPngSize(filePath) {
  const buf = readFileSync(filePath);
  assert(buf.length >= 24 && buf.readUInt32BE(0) === 0x89504e47, 'Invalid PNG: ' + filePath);
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

console.log('1. Checking JS syntax & trailing newlines of drop-in modules...');
for (const rel of ['src/js/car-stacks.js', 'src/js/track-scene-v2.js']) {
  const p = path.join(ROOT, rel);
  assert(existsSync(p), 'Missing ' + rel);
  assert(readFileSync(p, 'utf8').endsWith('\n'), rel + ' must end with a trailing newline for tools/build.mjs');
  execFileSync('node', ['--check', p]);
}

console.log('2. Checking manifest.json, CAR_STACKS sync, and every slice strip PNG (width % slices === 0)...');
const manifestPath = path.join(ROOT, 'assets', 'cars', 'stacks', 'manifest.json');
assert(existsSync(manifestPath), 'Missing assets/cars/stacks/manifest.json');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const entries = Object.entries(manifest.cars || {});
assert(entries.length >= 1, 'Expected at least 1 sliced car in manifest.json');
const carStacksSrc = readFileSync(path.join(ROOT, 'src', 'js', 'car-stacks.js'), 'utf8');

for (const [name, rec] of entries) {
  const stripPath = path.join(ROOT, 'assets', 'cars', 'stacks', rec.file || (rec.slug + '.png'));
  assert(existsSync(stripPath), 'Missing strip PNG for ' + name);
  const { width, height } = readPngSize(stripPath);
  assert.strictEqual(width % rec.slices, 0, name + ': width ' + width + ' not divisible by ' + rec.slices);
  assert.strictEqual(width, rec.stripW, name + ': stripW mismatch');
  assert.strictEqual(height, rec.stripH, name + ': stripH mismatch');
  assert(carStacksSrc.includes(JSON.stringify(name)), name + ': missing from CAR_STACKS in src/js/car-stacks.js');
}

console.log('3. Checking src/shell.html & built index.html wiring...');
const shell = readFileSync(path.join(ROOT, 'src', 'shell.html'), 'utf8');
assert(shell.includes('<!-- @include js/car-stacks.js -->'), 'src/shell.html missing car-stacks.js include');
assert(shell.includes('<!-- @include js/track-scene-v2.js -->'), 'src/shell.html missing track-scene-v2.js include');

if (existsSync(path.join(ROOT, 'tools', 'build.mjs'))) {
  execFileSync('node', [path.join(ROOT, 'tools', 'build.mjs'), '--check'], { stdio: 'inherit' });
}

console.log('PASS: All ' + entries.length + ' sprite-stacked car strips, runtime modules, and build wiring verified.');
