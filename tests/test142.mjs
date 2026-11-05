// A cold pack: only the charge-transfer part of its resistance rises (build 232).
//
// WHY THIS EXISTS. Build 228 raised the whole pack resistance with the graphite charge transfer's 68 kJ/mol, so a
// Model Y kept 9% of its power at 0 °C (377 -> 35 kW). The ohmic part of a cell barely moves with temperature; only
// the charge transfer is activated. Nagasubramanian (2001) measured the ohmic part flat from 25 to −20 °C while the
// whole impedance rose tenfold, which makes charge transfer about 7% of the resistance at 25 °C. What must hold:
//   · the split is that measurement: R(−20 °C) / R(25 °C) is 10, from R_CT_SHARE and the cited energy, not a fit;
//   · at 25 °C nothing moved: resistance, power and charge acceptance are the locked ones;
//   · colder still gives less, −10 °C less than 0 °C, and never takes back more; it takes back less where the voltage
//     limit binds (the Model 3 at −10 °C), not where the plating limit does, which does not vary with temperature yet;
//   · but a Model Y keeps more than half its power at 0 °C (1.8× the resistance), and about a third at −10 °C;
//   · lead-acid and NiMH still do not change.
import { chromium } from './pw.mjs';
import { fileURLToPath, pathToFileURL } from 'url';
import path from 'path';
const repo = fileURLToPath(new URL('..', import.meta.url));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
const errors = [];
page.on('console', m => { if (m.type() === 'error' && !/ERR_FILE_NOT_FOUND/.test(m.text())) errors.push('console: ' + m.text()); });
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
await page.goto(pathToFileURL(path.join(repo, 'index.html')).href, { waitUntil: 'networkidle' });
await page.waitForTimeout(400);
const fails = [];
const r = await page.evaluate(() => {
  loadVehiclePreset(EV_VEHICLE_PRESETS.find(p => /Model Y/.test(p.name)));
  const b = engine.pack, lead = packBuild({ chem: 'lead', series: 72, kWh: 10, year: 2000 }), nimh = packBuild({ chem: 'nimh', series: 168, kWh: 1.3, year: 2016 });
  const m3 = EV_VEHICLE_PRESETS.find(p => /Model 3/.test(p.name)); loadVehiclePreset(m3); const b3 = engine.pack;
  const m3c = [25, 0, -10].map(t => packChargePower(b3, 0.5, t));
  loadVehiclePreset(EV_VEHICLE_PRESETS.find(p => /Model Y/.test(p.name)));
  return { m3c, share: R_CT_SHARE, R: b.R, r20: packR(b, -20) / b.R, r0: packR(b, 0) / b.R, r10: packR(b, -10) / b.R, R25: packR(b, 25),
    p25: packMaxPower(b, 0.5, 25), p: packMaxPower(b, 0.5), p0: packMaxPower(b, 0.5, 0), p10: packMaxPower(b, 0.5, -10),
    c25: packChargePower(b, 0.5, 25), c0: packChargePower(b, 0.5, 0), c10: packChargePower(b, 0.5, -10),
    lead: packR(lead, -10) / lead.R, nimh: packR(nimh, -10) / nimh.R };
});
const f = (x, d = 2) => (+x).toFixed(d), kW = x => Math.round(x / 1000);
console.log(`== charge-transfer share ${f(r.share, 4)} · resistance ×${f(r.r0)} at 0 °C, ×${f(r.r10)} at −10 °C, ×${f(r.r20)} at −20 °C ==`);
console.log(`== Model Y: ${kW(r.p25)} / ${kW(r.p0)} / ${kW(r.p10)} kW and takes back ${kW(r.c25)} / ${kW(r.c0)} / ${kW(r.c10)} kW at 25 / 0 / −10 °C ==`);
if (Math.abs(r.r20 - 10) > 1e-9) fails.push(`R(−20 °C) / R(25 °C) is ${f(r.r20, 4)}, not the measured tenfold`);
if (!(r.share > 0.05 && r.share < 0.09)) fails.push(`charge-transfer share ${f(r.share, 4)} is not about 0.07`);
if (r.R25 !== r.R || r.p25 !== r.p) fails.push('25 °C moved');
if (Math.abs(r.p - 377316) > 50) fails.push(`warm power ${f(r.p, 0)} W is not the locked 377316`);
if (!(r.p10 < r.p0 && r.p0 < r.p25)) fails.push('colder does not give less');
// charge acceptance is the lower of the plating limit and the voltage limit; the plating limit does not vary with
// temperature yet (a named gap, stage 10), so a cold pack takes back less only where the voltage limit binds
console.log(`== Model 3 takes back ${r.m3c.map(kW).join(' / ')} kW at 25 / 0 / −10 °C ==`);
if (!(r.c10 <= r.c0 && r.c0 <= r.c25)) fails.push('a colder Model Y takes back more');
if (!(r.m3c[2] < r.m3c[0] && r.m3c[1] <= r.m3c[0])) fails.push('at −10 °C the Model 3 does not take back less, where its voltage limit binds');
if (!(r.p0 > 0.5 * r.p25)) fails.push(`at 0 °C the Model Y keeps only ${f(r.p0 / r.p25 * 100, 0)}% of its power`);
if (!(r.p10 > 0.25 * r.p25 && r.p10 < 0.5 * r.p25)) fails.push(`at −10 °C the Model Y keeps ${f(r.p10 / r.p25 * 100, 0)}%, outside a quarter to a half`);
if (r.lead !== 1 || r.nimh !== 1) fails.push('lead-acid or NiMH changed with temperature');
if (errors.length) fails.push(...errors);
console.log(fails.length ? '\nFAIL:\n  ' + fails.join('\n  ') : '\nPASS');
await browser.close();
process.exit(fails.length ? 1 : 0);
