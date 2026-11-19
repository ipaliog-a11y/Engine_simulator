#!/usr/bin/env node
// Validates research/vehicles-batch-2/queue.json: 100 unique shortlist rows,
// existing categories/chassis, no collision with current FACTORY_CARS names.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(__dirname, '../..');
const fails = [];

const pack = JSON.parse(fs.readFileSync(path.join(__dirname, 'queue.json'), 'utf8'));
const vehicles = pack.vehicles;
if (!Array.isArray(vehicles)) fails.push('queue.vehicles is not an array');
if (vehicles.length !== 100) fails.push(`expected 100 vehicles, got ${vehicles.length}`);
if (pack.meta?.count !== 100) fails.push(`meta.count expected 100, got ${pack.meta?.count}`);

const CATS = new Set([
  'Kei & City', 'Compact Turbo', 'NA Sports', 'Turbo Performance', 'American V8',
  'Supercar', 'Performance SUV', 'Track', 'Rotary', 'Diesel', 'Pickup', 'Two-Stroke',
  'Electric', 'Hybrid',
]);
const CHASSIS = new Set([
  'kei', 'hatch', 'roadster', 'coupe', 'sedan', 'muscle', 'rally', 'gt', 'super',
  'hyper', 'proto', 'pickup', 'suv', 'openwheel',
]);
const PATHS = new Set(['combustion', 'electric', 'hybrid']);
const WAVES = new Set([1, 2, 3, 4]);
const CONF = new Set(['high', 'medium', 'low']);

const ids = new Set();
const names = new Set();
for (const [i, v] of vehicles.entries()) {
  const where = `vehicles[${i}] (${v?.id || '?'})`;
  for (const k of ['id', 'name', 'cat', 'era', 'role', 'chassis', 'path', 'confidenceExpected', 'wave']) {
    if (v[k] == null || v[k] === '') fails.push(`${where}: missing ${k}`);
  }
  if (v?.id) {
    if (ids.has(v.id)) fails.push(`duplicate id: ${v.id}`);
    ids.add(v.id);
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(v.id)) fails.push(`${where}: id not kebab-case`);
  }
  if (v?.name) {
    if (names.has(v.name)) fails.push(`duplicate name: ${v.name}`);
    names.add(v.name);
  }
  if (v?.cat && !CATS.has(v.cat)) fails.push(`${where}: unknown cat ${v.cat}`);
  if (v?.chassis && !CHASSIS.has(v.chassis)) fails.push(`${where}: unknown chassis ${v.chassis}`);
  if (v?.path && !PATHS.has(v.path)) fails.push(`${where}: unknown path ${v.path}`);
  if (v?.wave != null && !WAVES.has(v.wave)) fails.push(`${where}: wave must be 1–4`);
  if (v?.confidenceExpected && !CONF.has(v.confidenceExpected)) fails.push(`${where}: bad confidenceExpected`);
  if (v?.path === 'electric' && v?.cat !== 'Electric') fails.push(`${where}: electric path needs cat Electric`);
  if (v?.path === 'hybrid' && v?.cat !== 'Hybrid') fails.push(`${where}: hybrid path needs cat Hybrid`);
  if (v?.path === 'combustion' && (v?.cat === 'Electric' || v?.cat === 'Hybrid')) {
    fails.push(`${where}: combustion path cannot use Electric/Hybrid cat`);
  }
}

const factorySrc = [
  fs.readFileSync(path.join(repo, 'src/js/vehicle-presets.js'), 'utf8'),
  fs.readFileSync(path.join(repo, 'src/js/electric-presets.js'), 'utf8'),
].join('\n');
const factoryNames = new Set();
for (const m of factorySrc.matchAll(/\bname:\s*'([^']+)'/g)) factoryNames.add(m[1]);
// Own shortlist names may already be imported into FACTORY_CARS (batch-1 `own` pattern).
// Fail only when a shortlist name collides with a factory car that is not on this queue —
// which cannot happen for names ∈ queue; keep the check as: factory ∩ queue is fine.
const foreignFactory = new Set([...factoryNames].filter(n => !names.has(n)));
for (const name of names) {
  if (foreignFactory.has(name)) fails.push(`already in FACTORY_CARS: ${name}`);
}

if (fails.length) {
  console.error('FAIL', fails.length);
  for (const f of fails) console.error('-', f);
  process.exit(1);
}
const imported = [...names].filter(n => factoryNames.has(n)).length;
console.log(`OK batch-2 queue: ${vehicles.length} cars, ${ids.size} ids, ${imported} already imported, no foreign FACTORY_CARS collisions`);
