// Resolve Playwright from wherever it happens to be installed.
//
// ES modules ignore NODE_PATH, so `import 'playwright'` only finds a node_modules beside the test.
// The suite should run in a fresh checkout without an install step when a global Playwright is
// already present, and equally after a local `npm i` — so try local first, then the global root.
import { createRequire } from 'module';
import { execSync } from 'child_process';

let pw = null, tried = [];
const attempt = base => { try { return createRequire(base)('playwright'); } catch (e) { tried.push(base); return null; } };

pw = attempt(import.meta.url);
if (!pw) {
  let g = '';
  try { g = execSync('npm root -g', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch {}
  if (g) pw = attempt(g.replace(/\/?$/, '/') + 'x.js');
}
if (!pw) {
  console.error('Playwright not found. Install it with:\n  npm i -D playwright\n' +
    'Searched:\n  ' + tried.join('\n  '));
  process.exit(2);
}
export const chromium = pw.chromium;
export default pw;
