// The real-car scoreboard (v1-scope build 1; rerun as the final scoreboard before v1.0).
//
// Every factory car as it loads (model power, no matching) against the figures its presets carry: the engine's
// real.hp / real.tq (maker's rating; PS converted to hp), the car's real.t100 / real.top and body.kg. Boosted engines
// also get their torque at the maker's torque-peak rpm (real.tqRpm), the "low-rpm torque" of plan G4. It changes
// nothing: it only reads. Lap times are not scored: no preset carries a published one.
//   node tools/scoreboard.mjs out.json      writes every car's numbers, and prints a summary
import { chromium } from '../tests/pw.mjs';
import { writeFileSync } from 'fs';
import { fileURLToPath, pathToFileURL } from 'url';
import path from 'path';

const out = process.argv[2];
if (!out) { console.error('usage: node tools/scoreboard.mjs out.json'); process.exit(2); }
const repo = fileURLToPath(new URL('..', import.meta.url));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
const errors = [];
page.on('pageerror', e => errors.push(e.message));
await page.goto(pathToFileURL(path.join(repo, 'index.html')).href, { waitUntil: 'networkidle' });
await page.waitForTimeout(400);

const rows = await page.evaluate(() => {
  const PS = 0.98632; // 1 PS = 735.5 W, 1 hp = 745.7 W
  return FACTORY_CARS.map(p => {
    loadVehiclePreset(p);
    const ep = FACTORY_ENGINES.find(x => x.name === p.engine), er = (ep && ep.real) || {}, s = engine.score || {};
    const k = er.unit === 'PS' ? PS : 1;
    let lowTq = null;
    const boosted = ep && ep.engine && ep.engine.intake && ep.engine.intake !== 'na';
    if (boosted && er.tqRpm && typeof buildTorqueCurve === 'function') {
      const c = buildTorqueCurve(), r = er.tqRpm;
      if (c && c.length) {
        lowTq = c[0].tq;
        for (let i = 1; i < c.length; i++) if (r <= c[i].rpm) { const a = c[i - 1], b = c[i]; lowTq = r <= a.rpm ? a.tq : a.tq + (b.tq - a.tq) * (r - a.rpm) / (b.rpm - a.rpm); break; }
        if (r > c[c.length - 1].rpm) lowTq = c[c.length - 1].tq;
      }
    }
    const a = simulateAccel() || {};
    return { name: p.name, cat: p.cat, engine: p.engine, intake: ep && ep.engine ? ep.engine.intake || 'na' : (engine.type || ''),
      gross: !!er.gross, unsure: [].concat(p.unsure || [], (ep && ep.unsure) || []),
      hp: s.peakHP, rhp: er.hp != null ? er.hp * k : null, tq: s.peakTQ, rtq: er.tq != null ? er.tq : null,
      tqRpm: er.tqRpm || null, lowTq, t100: a.t100, rt100: p.real ? p.real.t100 : null,
      top: a.topSpeed, rtop: p.real ? p.real.top : null, limited: !!(p.real && p.real.limited),
      mass: vehicle.mass, rkg: p.body ? p.body.kg : null };
  });
});
await browser.close();
if (errors.length) { console.error('page errors:\n' + errors.join('\n')); process.exit(1); }
const pc = (m, r) => (m != null && r ? 100 * (m - r) / r : null);
for (const r of rows) Object.assign(r, { dHp: pc(r.hp, r.rhp), dTq: pc(r.tq, r.rtq), dLow: pc(r.lowTq, r.rtq),
  dT100: pc(r.t100, r.rt100), dTop: r.limited ? null : pc(r.top, r.rtop), dKg: pc(r.mass, r.rkg) });
writeFileSync(out, JSON.stringify(rows, null, 1));
const keys = ['dHp', 'dTq', 'dLow', 'dT100', 'dTop', 'dKg'];
for (const k of keys) {
  const v = rows.map(r => r[k]).filter(x => x != null && isFinite(x)), over = v.filter(x => Math.abs(x) > 10).length;
  const mae = v.reduce((s, x) => s + Math.abs(x), 0) / (v.length || 1);
  console.log(`${k.padEnd(6)} n=${String(v.length).padStart(3)}  mean |err| ${mae.toFixed(1)}%  over 10%: ${over}`);
}
console.log(`${out}: ${rows.length} cars`);
