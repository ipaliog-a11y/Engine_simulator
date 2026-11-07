// Translation tables one entry per line, and generated files kept out of diffs and searches (build 245).
//
// WHY THIS EXISTS. A diff or a search that touches a line prints the whole line. src/js/i18n.js had grown lines that
// held a whole build's strings (the longest 31,380 characters, mostly Greek), so adding six strings made an 80 KB diff,
// and index.html repeated it. Every agent that read that diff or search carried it in its context for the rest of the
// session. Build 241 put each entry on its own line and hid the generated files. What must hold:
//   · in I18N, GUIDE_I18N and CHALLENGE_I18N every line is one complete entry, a comment, or blank;
//   · the page's tables hold exactly the keys those lines give, so no entry is hidden in a line the scan missed;
//   · Greek still comes through tr() and the guide table;
//   · git treats index.html as generated (-diff, linguist-generated), and .ignore keeps searches off it;
//   · no page errors.
import { chromium } from './pw.mjs';
import { fileURLToPath, pathToFileURL } from 'url';
import { readFileSync } from 'fs';
import { execFileSync } from 'child_process';
import path from 'path';
const repo = fileURLToPath(new URL('..', import.meta.url));
const fails = [], errors = [];

// ---- 1. the source: one entry per line
// Split a line at commas outside strings and brackets, dropping a trailing // comment; null if it is not a run of
// complete entries. A table's last entry may go without its comma.
function entries(line) {
  const parts = []; let depth = 0, q = null, start = 0, end = line.length;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) { if (c === '\\') i++; else if (c === q) q = null; continue; }
    if (c === '"' || c === "'" || c === '`') { q = c; continue; }
    if (c === '/' && line[i + 1] === '/') { end = i; break; }
    if ('{[('.includes(c)) depth++;
    else if ('}])'.includes(c)) depth--;
    else if (c === ',' && depth === 0) { parts.push(line.slice(start, i).trim()); start = i + 1; }
  }
  if (q || depth !== 0) return null;
  const tail = line.slice(start, end).trim();
  if (tail) parts.push(tail);
  return parts;
}
const src = readFileSync(path.join(repo, 'src/js/i18n.js'), 'utf8').split('\n');
const tables = {}, longest = { len: 0 };
for (const name of ['I18N', 'GUIDE_I18N', 'CHALLENGE_I18N']) {
  const at = src.findIndex(l => l.trim() === `const ${name}={`);
  if (at < 0) { fails.push(`const ${name}={ not found on a line of its own`); continue; }
  const keys = [];
  for (let n = at + 1; n < src.length && !src[n].startsWith('};'); n++) {
    const line = src[n], t = line.trim();
    if (!t || t.startsWith('//')) continue;
    const parts = entries(line);
    if (!parts || parts.length !== 1) {
      fails.push(`${name}, i18n.js line ${n + 1}: ${parts ? parts.length + ' entries' : 'not a complete entry'} — ` +
        `put each entry on its own line: ${t.slice(0, 70)}…`);
      continue;
    }
    keys.push(Object.keys(Function(`return ({${parts[0]}})`)())[0]);
    if (line.length > longest.len) Object.assign(longest, { len: line.length, key: keys.at(-1) });
  }
  tables[name] = keys;
}
console.log(`== i18n.js: ${Object.entries(tables).map(([k, v]) => `${k} ${v.length} lines`).join(', ')}; ` +
  `longest line ${longest.len} chars (${longest.key}, one entry) ==`);

// ---- 2. the page holds exactly those keys, and Greek still comes through
const browser = await chromium.launch();
const page = await browser.newPage();
page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
await page.goto(pathToFileURL(path.join(repo, 'index.html')).href);
const live = await page.evaluate(() => {
  const r = { I18N: Object.keys(I18N), GUIDE_I18N: Object.keys(GUIDE_I18N), CHALLENGE_I18N: Object.keys(CHALLENGE_I18N) };
  applyLang('el');
  r.greek = [tr('Combustion engine'), tr('Electric drive'), GUIDE_I18N.evdriveGame && GUIDE_I18N.evdriveGame.el.slice(0, 20)];
  applyLang('en');
  return r;
});
for (const name of Object.keys(tables)) {
  const fromLines = [...new Set(tables[name])], inPage = live[name];
  const missing = inPage.filter(k => !fromLines.includes(k)), extra = fromLines.filter(k => !inPage.includes(k));
  console.log(`   ${name}: ${inPage.length} keys in the page, ${fromLines.length} from the lines`);
  if (missing.length || extra.length)
    fails.push(`${name}: the lines and the page disagree — in the page only: ${missing.slice(0, 3).join(' | ')}; ` +
      `in the lines only: ${extra.slice(0, 3).join(' | ')}`);
}
console.log(`   Greek: ${live.greek.join(' · ')}`);
if (live.greek[0] === 'Combustion engine' || live.greek[1] === 'Electric drive' || !live.greek[2])
  fails.push('Greek no longer comes through tr() or GUIDE_I18N: ' + live.greek.join(' · '));
await browser.close();

// ---- 3. generated files stay out of diffs and searches
const attr = execFileSync('git', ['check-attr', 'diff', 'linguist-generated', '--', 'index.html'], { cwd: repo, encoding: 'utf8' });
console.log('== git: ' + attr.trim().replace(/\n/g, '; ') + ' ==');
if (!/diff: unset/.test(attr)) fails.push('index.html should be -diff in .gitattributes, so git diff does not print it');
if (!/linguist-generated: true/.test(attr)) fails.push('index.html should be linguist-generated in .gitattributes');
let ignore = '';
try { ignore = readFileSync(path.join(repo, '.ignore'), 'utf8'); } catch {}
if (!/^index\.html$/m.test(ignore)) fails.push('.ignore should list index.html, so searches skip it');

if (errors.length) fails.push(...errors.slice(0, 5));
if (fails.length) { console.log('\nFAIL\n  ' + fails.join('\n  ')); process.exit(1); }
console.log('\nPASS: one translation per line, the page holds exactly those, and generated files stay out of diffs and searches');
