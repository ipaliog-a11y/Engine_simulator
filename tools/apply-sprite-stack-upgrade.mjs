#!/usr/bin/env node
// Automated idempotent Phase 1 + 2 + 3 installer for ipaliog-a11y/Engine_simulator.
//
// Usage:
//   node tools/apply-sprite-stack-upgrade.mjs --check   Preview edits without modifying files
//   node tools/apply-sprite-stack-upgrade.mjs           Apply edits + verify strips + rebuild index.html

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { execFileSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const CHECK = process.argv.includes('--check');

function patchFile(relPath, transform) {
  const full = path.join(ROOT, relPath);
  if (!existsSync(full)) {
    console.warn('  SKIP (missing):', relPath);
    return false;
  }
  const before = readFileSync(full, 'utf8');
  const after = transform(before);
  if (after === before) {
    console.log('  OK (already patched):', relPath);
    return false;
  }
  if (CHECK) {
    console.log('  WOULD PATCH:', relPath);
    return true;
  }
  writeFileSync(full, after, 'utf8');
  console.log('  PATCHED:', relPath);
  return true;
}

console.log('Applying Pixel Engine Sim Sprite-Stack + Track v2 upgrade' + (CHECK ? ' (dry-run)' : '') + '...');

// 1. Include car-stacks.js and track-scene-v2.js in src/shell.html
patchFile('src/shell.html', (src) => {
  let out = src;
  if (!out.includes('<!-- @include js/car-stacks.js -->')) {
    out = out.replace(
      '<!-- @include js/car-art.js -->',
      '<!-- @include js/car-art.js -->\n<!-- @include js/car-stacks.js -->'
    );
  }
  if (!out.includes('<!-- @include js/track-scene-v2.js -->')) {
    out = out.replace(
      '<!-- @include js/track-scene.js -->',
      '<!-- @include js/track-scene.js -->\n<!-- @include js/track-scene-v2.js -->'
    );
  }
  return out;
});

// 2. Pass real car preset name, proportional braking & steering angle in src/js/track-view.js
patchFile('src/js/track-view.js', (src) => {
  if (src.includes('name:vehicle.chLabel')) return src;
  return src.replace(
    'car=Object.assign(scenePose(T.line,live.i+live.f),{col:carLivery(vehicle),brk:live.brk>0.05,pos:1});',
    'car=Object.assign(scenePose(T.line,live.i+live.f),{name:vehicle.chLabel,col:carLivery(vehicle),brk:live.brk||0,steer:(live.steer||0)*Math.PI/180,pos:1});'
  );
});

// 3. Pass real car name & proportional braking in src/js/race-tab.js
patchFile('src/js/race-tab.js', (src) => {
  if (src.includes('name:M.name')) return src;
  return src.replace(
    'const car=Object.assign(scenePose(M.line,s.pos),{col:RACE_COLS[x.c.id],brk:s.dv<-3,pos:x.pos});',
    'const car=Object.assign(scenePose(M.line,s.pos),{name:M.name,col:RACE_COLS[x.c.id],brk:s.dv<-1.5?Math.min(1,-s.dv/12):0,pos:x.pos});'
  );
});

if (!CHECK) {
  const sliceCli = path.join(ROOT, 'tools', 'slice-cars.mjs');
  if (existsSync(sliceCli)) {
    console.log('Syncing car stacks manifest into src/js/car-stacks.js...');
    execFileSync('node', [sliceCli, '--sync'], { stdio: 'inherit' });
  }
  const buildCli = path.join(ROOT, 'tools', 'build.mjs');
  if (existsSync(buildCli)) {
    console.log('Rebuilding index.html via tools/build.mjs...');
    execFileSync('node', [buildCli], { stdio: 'inherit' });
  }
}

console.log('Done.');
