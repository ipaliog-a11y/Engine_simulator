#!/usr/bin/env node
// Build the full showroom-art prompt from a car-specific phrase.
// Usage:
//   node build-prompt.mjs --phrase "1987 Ferrari F40 … red paint"
//   node build-prompt.mjs --phrase "…" --json
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));
const stemPath = path.join(here, '../assets/prompt-stem.txt');
const stem = fs.readFileSync(stemPath, 'utf8').trim();

const args = process.argv.slice(2);
const json = args.includes('--json');
const i = args.indexOf('--phrase');
const phrase = i >= 0 ? args[i + 1] : '';

if (!phrase || phrase.startsWith('--')) {
  console.error('Usage: node build-prompt.mjs --phrase "<year make model … paint>" [--json]');
  process.exit(2);
}

const cleaned = phrase.replace(/\s+/g, ' ').replace(/\.\s*$/, '').trim();
if (cleaned.length < 20) {
  console.error('Phrase too short — need year, model, body cues, and paint.');
  process.exit(1);
}
if (/facing right|three-quarter|3\/4|front view/i.test(cleaned)) {
  console.error('Phrase must describe a LEFT-facing side elevation, not another view.');
  process.exit(1);
}

const prompt = `8-bit pixel-art side profile of a ${cleaned}. ${stem}`;

if (json) {
  process.stdout.write(JSON.stringify({ prompt, stem, phrase: cleaned }, null, 2) + '\n');
} else {
  process.stdout.write(prompt + '\n');
}
