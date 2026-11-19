// Vehicle-profile-art skill: prompt builder, post-process, validate (build 385).
//
// WHY THIS EXISTS. Agents add showroom pictures via `.cursor/skills/vehicle-profile-art/`.
// The prompt stem must stay locked to the existing coastal-road set; post-process must emit
// 960x640 when ffmpeg is available; validate-art must accept a shipped factory car without
// needing ffmpeg (CI runners do not ship it).
// What must hold:
//   · SKILL.md names the workflow and the S2000 style reference;
//   · build-prompt.mjs joins a phrase to the frozen stem;
//   · dims.mjs reads a shipped 960x640 PNG and WebP;
//   · validate-art.mjs exits 0 on "Honda S2000 (AP1, 2000)";
//   · when ffmpeg is on PATH, postprocess.mjs turns a 1152x864 frame into 960x640 png+webp.
import { execFileSync, spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { readDims } from '../.cursor/skills/vehicle-profile-art/scripts/dims.mjs';

const repo = fileURLToPath(new URL('..', import.meta.url));
const fails = [];
const skill = path.join(repo, '.cursor/skills/vehicle-profile-art');
const skillMd = fs.readFileSync(path.join(skill, 'SKILL.md'), 'utf8');
if (!/^---\nname: vehicle-profile-art\n/m.test(skillMd)) fails.push('SKILL.md missing name frontmatter');
if (!/honda-s2000-ap1-2000\.png/.test(skillMd)) fails.push('SKILL.md missing S2000 style reference');
if (!/postprocess\.mjs/.test(skillMd)) fails.push('SKILL.md does not point at postprocess.mjs');
if (!/import-vehicle/.test(skillMd)) fails.push('SKILL.md should pair with import-vehicle');

const stem = fs.readFileSync(path.join(skill, 'assets/prompt-stem.txt'), 'utf8').trim();
if (!/facing LEFT/.test(stem) || !/coastal road/.test(stem)) fails.push('prompt-stem.txt drifted from the coastal left-facing set');

const phrase = '1987 Ferrari F40 mid-engined supercar, tall rear wing, Rosso Corsa red paint';
try {
  const out = execFileSync('node', [path.join(skill, 'scripts/build-prompt.mjs'), '--phrase', phrase], {
    encoding: 'utf8',
  }).trim();
  if (!out.startsWith('8-bit pixel-art side profile of a ' + phrase)) fails.push('build-prompt missing phrase prefix');
  if (!out.endsWith(stem)) fails.push('build-prompt stem mismatch');
  console.log('== build-prompt: ' + out.length + ' chars ==');
} catch (e) {
  fails.push('build-prompt failed: ' + (e.stderr || e.stdout || e.message).toString().slice(0, 400));
}

const s2kPng = path.join(repo, 'assets/car-profiles/honda-s2000-ap1-2000.png');
const s2kWebp = path.join(repo, 'assets/cars/honda-s2000-ap1-2000.webp');
const pngDim = readDims(s2kPng);
const webpDim = readDims(s2kWebp);
console.log(`== dims: png ${pngDim.w}x${pngDim.h}, webp ${webpDim.w}x${webpDim.h} ==`);
if (pngDim.w !== 960 || pngDim.h !== 640) fails.push('dims.mjs PNG read wrong: ' + JSON.stringify(pngDim));
if (webpDim.w !== 960 || webpDim.h !== 640) fails.push('dims.mjs WebP read wrong: ' + JSON.stringify(webpDim));

const hasFfmpeg = spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' }).status === 0;
if (hasFfmpeg) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pes-vpa-'));
  const raw = path.join(tmpDir, 'raw.png');
  const slug = 'skill-test-tmp-frame';
  try {
    execFileSync('ffmpeg', [
      '-y', '-f', 'lavfi', '-i', 'color=c=0x4488cc:s=1152x864',
      '-frames:v', '1', raw,
    ], { stdio: ['ignore', 'pipe', 'pipe'] });
    const out = execFileSync('node', [
      path.join(skill, 'scripts/postprocess.mjs'), raw, '--slug', slug, '--in-place',
    ], { encoding: 'utf8' });
    console.log(out.trim().split('\n').map(l => '== ' + l + ' ==').join('\n'));
    const png = path.join(repo, 'assets/car-profiles', slug + '.png');
    const webp = path.join(repo, 'assets/cars', slug + '.webp');
    for (const f of [png, webp]) {
      if (!fs.existsSync(f)) fails.push('postprocess did not write ' + f);
      else {
        const d = readDims(f);
        if (d.w !== 960 || d.h !== 640) fails.push(f + ' is ' + d.w + 'x' + d.h + ', want 960x640');
        fs.unlinkSync(f);
      }
    }
  } catch (e) {
    fails.push('postprocess failed: ' + (e.stderr || e.stdout || e.message).toString().slice(0, 500));
  } finally {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {}
    for (const f of [
      path.join(repo, 'assets/car-profiles', slug + '.png'),
      path.join(repo, 'assets/cars', slug + '.webp'),
    ]) {
      try { fs.unlinkSync(f); } catch (_) {}
    }
  }
} else {
  // CI has no ffmpeg; postprocess.mjs still must exist and refuse a bad invocation.
  console.log('== postprocess: skipped (no ffmpeg on PATH; agent machines have it) ==');
  if (!fs.existsSync(path.join(skill, 'scripts/postprocess.mjs'))) fails.push('postprocess.mjs missing');
  const bad = spawnSync('node', [path.join(skill, 'scripts/postprocess.mjs')], { encoding: 'utf8' });
  if (bad.status === 0) fails.push('postprocess with no args should exit non-zero');
}

try {
  const out = execFileSync('node', [
    path.join(skill, 'scripts/validate-art.mjs'), 'Honda S2000 (AP1, 2000)',
  ], { encoding: 'utf8' });
  console.log('== validate: ' + out.trim() + ' ==');
} catch (e) {
  fails.push('validate-art S2000 failed: ' + (e.stderr || e.stdout || e.message).toString().slice(0, 500));
}

const importMd = fs.readFileSync(path.join(repo, '.cursor/skills/import-vehicle/SKILL.md'), 'utf8');
if (!/vehicle-profile-art/.test(importMd)) fails.push('import-vehicle SKILL.md should point at vehicle-profile-art');

if (fails.length) {
  console.log('\nFAIL:\n  ' + fails.join('\n  '));
  process.exit(1);
}
console.log('\nOK: vehicle-profile-art skill builds prompts, sizes art without ffmpeg, validates a real car.');
process.exit(0);
