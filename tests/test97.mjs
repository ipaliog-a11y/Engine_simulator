#!/usr/bin/env node
// Research package for the next vehicle-preset batch. Checks field names, ranges,
// and that none of the 50 cars or their new engines collide with the presets.
import { spawnSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const r = spawnSync(process.execPath, [path.join(root, 'research/vehicles-batch-1/validate.mjs')], { stdio: 'inherit' });
process.exit(r.status == null ? 1 : r.status);
