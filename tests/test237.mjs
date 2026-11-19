// Service worker: real-circuits.js must not stick on an old cache (build 388).
//
// WHY THIS EXISTS. Build 386 added ten circuits to tracks/real-circuits.js. Returning visitors
// still saw 22 in the TRACK menu because the SW served that file cache-first under
// pixel-engine-sim-v5. What must hold:
//   · CACHE is past v5 so activate drops the stale store;
//   · the fetch handler treats /tracks/real-circuits.js as network-first (like the page);
//   · fonts/icons stay on the cache-first path.
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const repo = fileURLToPath(new URL('..', import.meta.url));
const sw = readFileSync(path.join(repo, 'sw.js'), 'utf8');
const fails = [];

const cache = sw.match(/const CACHE\s*=\s*['"]([^'"]+)['"]/);
if (!cache) fails.push('CACHE name not found');
else if (cache[1] === 'pixel-engine-sim-v5' || !/^pixel-engine-sim-v([6-9]|\d{2,})$/.test(cache[1])) {
  fails.push('CACHE still ' + (cache ? cache[1] : '?') + ' — need v6+ so old stores are deleted');
}

const fetchAt = sw.indexOf("addEventListener('fetch'");
if (fetchAt < 0) fails.push('no fetch listener');
else {
  const body = sw.slice(fetchAt);
  // Source may escape the dot as \. inside a RegExp literal.
  if (!/real-circuits/.test(body)) fails.push('fetch listener does not mention real-circuits.js');
  const re = /real-circuits[\s\S]{0,400}?respondWith\(\s*fetch\(/;
  if (!re.test(body)) fails.push('real-circuits.js branch is not network-first (fetch before caches.match)');
  if (!/PressStart2P|icon-192|cache-first/.test(sw)) fails.push('expected fonts/icons to stay cache-first in comments or assets');
}

if (fails.length) {
  console.error('FAIL');
  for (const f of fails) console.error('-', f);
  process.exit(1);
}
console.log('OK sw.js CACHE=' + cache[1] + '; real-circuits network-first');
process.exit(0);
