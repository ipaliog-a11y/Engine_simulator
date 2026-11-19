#!/usr/bin/env node
// Sanity-check research/tracks-candidates/candidates.json.
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const root = path.dirname(fileURLToPath(import.meta.url));
const data = JSON.parse(readFileSync(path.join(root, 'candidates.json'), 'utf8'));
const fails = [];

const shipped = data.already_shipped?.tum_keys || [];
if (shipped.length !== 22) fails.push(`already_shipped.tum_keys should be 22, got ${shipped.length}`);

const demOk = new Set(['eudem25m', 'ned10m', 'srtm30m']);
const keys = new Set(shipped);

for (const c of data.tier_a_tum || []) {
  if (!c.key) fails.push('tier_a entry missing key');
  if (keys.has(c.key)) fails.push(`tier_a ${c.key} collides with shipped`);
  keys.add(c.key);
  if (!c.tum) fails.push(`${c.key}: missing tum`);
  if (!demOk.has(c.dem)) fails.push(`${c.key}: bad dem ${c.dem}`);
  if (!(c.tum_length_m > 1000)) fails.push(`${c.key}: tum_length_m`);
  if (!(c.tum_width_m?.min >= 6 && c.tum_width_m?.max <= 30)) fails.push(`${c.key}: width out of band`);
  if (c.status === 'ready') {
    if (!c.import) fails.push(`${c.key}: ready but no import object`);
    else {
      for (const f of ['key', 'tum', 'geo', 'dem', 'label', 'place']) {
        if (c.import[f] == null) fails.push(`${c.key}: import missing ${f}`);
      }
      if (!Array.isArray(c.import.geo) || c.import.geo.length !== 4) fails.push(`${c.key}: geo must be [w,s,e,n]`);
    }
  }
  if (c.status === 'blocked_geo' && c.import != null) fails.push(`${c.key}: blocked_geo should have import: null`);
}

for (const c of data.tier_b_track_atlas || []) {
  if (!c.key) fails.push('tier_b entry missing key');
  if (keys.has(c.key)) fails.push(`tier_b ${c.key} key collision`);
  keys.add(c.key);
  if (!c.atlas_id || !c.atlas_layout) fails.push(`${c.key}: atlas id/layout`);
  if (!demOk.has(c.dem)) fails.push(`${c.key}: bad dem ${c.dem}`);
  if (!(c.midline_length_m > 1000)) fails.push(`${c.key}: midline_length_m`);
  if (!(c.width_m?.median >= 6 && c.width_m?.median <= 30)) fails.push(`${c.key}: median width`);
  if (typeof c.seen_fraction_both !== 'number') fails.push(`${c.key}: seen_fraction_both`);
  if (c.status === 'adapter_needed' && c.seen_fraction_both < 0.6) {
    fails.push(`${c.key}: adapter_needed but seen_both ${c.seen_fraction_both} < 0.6 (should be hold)`);
  }
  if (c.status === 'hold_low_coverage' && c.seen_fraction_both >= 0.6) {
    fails.push(`${c.key}: hold but seen_both ${c.seen_fraction_both} ≥ 0.6`);
  }
}

const ready = (data.tier_a_tum || []).filter(c => c.status === 'ready');
const blocked = (data.tier_a_tum || []).filter(c => c.status === 'blocked_geo');
const atlas = (data.tier_b_track_atlas || []).filter(c => c.status === 'adapter_needed');
const hold = (data.tier_b_track_atlas || []).filter(c => c.status === 'hold_low_coverage');

console.log(`tier_a ready ${ready.length}: ${ready.map(c => c.key).join(', ') || '—'}`);
console.log(`tier_a blocked_geo ${blocked.length}: ${blocked.map(c => c.key).join(', ') || '—'}`);
console.log(`tier_b adapter_needed ${atlas.length}: ${atlas.map(c => c.key).join(', ') || '—'}`);
console.log(`tier_b hold ${hold.length}: ${hold.map(c => c.key).join(', ') || '—'}`);

if (fails.length) {
  console.error('FAIL\n  ' + fails.join('\n  '));
  process.exit(1);
}
console.log('PASS — candidates.json shape and quality gates');
