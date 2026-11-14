// Cell resistance against temperature (plans/hybrid-electric/drivetrain.md, stage 3).
//
// WHY THIS EXISTS. A pack's resistance was one number at every temperature. It is now the 25 °C value,
// and a graphite-anode lithium pack's rises when it is colder. What must hold:
//   · at 25 °C the Model Y's resistance, discharge power and charge acceptance are the locked ones;
//   · at 0 °C and at −10 °C the power is lower, and −10 °C the lower; the charge acceptance is never higher (build 232:
//     on the Model Y it is the plating limit, which does not vary with temperature yet);
//   · a lead-acid pack does not change, because it has no cited activation energy;
//   · the 50 °C cut is untouched, and below that cut a warmer pack gives more, not less;
//   · the Model Y's WLTP figure stays the warm one.
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
  const b = engine.pack;
  const P = t => packMaxPower(b, 0.5, t), C = t => packChargePower(b, 0.8, t);
  const lead = packBuild({ chem: 'lead', series: 160, kWh: 15, year: 1998 });
  return {
    R: b.R, R25: packR(b, 25), R0: packR(b, 0), Rm10: packR(b, -10),
    p: packMaxPower(b, 0.5), p25: P(25), p0: P(0), pm10: P(-10), p40: P(40),
    c: b.pChargeMax, c25: C(25), c0: C(0), cm10: C(-10),
    leadR: lead.R, leadCold: packR(lead, -10), leadP: packMaxPower(lead, 0.5), leadPc: packMaxPower(lead, 0.5, -10),
    der25: packDerate(25), der55: packDerate(55),
    wh: evCycle(engine, vehicle).whkm
  };
});
const f = (x, d = 0) => (+x).toFixed(d);
console.log(`== Model Y at 50%: R ${f(r.R, 5)} / ${f(r.R0, 5)} / ${f(r.Rm10, 5)} ohm at 25 / 0 / −10 °C; ` +
  `power ${f(r.p25 / 1000, 1)} / ${f(r.p0 / 1000, 1)} / ${f(r.pm10 / 1000, 1)} kW; ` +
  `charge at 80% ${f(r.c25 / 1000, 1)} / ${f(r.c0 / 1000, 1)} / ${f(r.cm10 / 1000, 1)} kW ==`);
console.log(`== 40 °C power ${f(r.p40 / 1000, 1)} kW with derate ${r.der25} at 25 °C and ${r.der55} at 55 °C; ` +
  `lead-acid R ${f(r.leadR, 4)} at −10 °C ${f(r.leadCold, 4)}; WLTP ${f(r.wh, 2)} Wh/km ==`);
if (r.R25 !== r.R || r.p25 !== r.p) fails.push('25 °C is not the resistance and the power the pack already had');
if (Math.abs(r.p - 377316) > 50) fails.push(`discharge power ${f(r.p)} W is not the locked 377316`);
if (r.c25 !== r.c) fails.push('25 °C charge acceptance is not the plating limit');
if (!(r.Rm10 > r.R0 && r.R0 > r.R)) fails.push('colder is not a higher resistance');
if (!(r.pm10 < r.p0 && r.p0 < r.p25)) fails.push('colder does not give less power');
// Since build 232 the cold raises only the charge-transfer share of the resistance (test142). The Model Y's charge
// acceptance is then its plating limit at all three temperatures, and this model does not vary that limit with
// temperature yet: a named gap, for stage 10 (charging). Colder must still never take back more.
if (!(r.cm10 <= r.c0 && r.c0 <= r.c25)) fails.push('colder accepts more charge');
if (r.leadCold !== r.leadR || r.leadPc !== r.leadP) fails.push('a lead-acid pack changed with temperature');
if (!(r.p40 > r.p25 && r.der25 === 1 && r.der55 === 0.5)) fails.push('the 50 °C cut moved, or a warm pack below it did not give more');
// 141.33 until build 294, whose motor (the circuit solved under load) and re-matched rear current gave 139.63.
if (Math.abs(r.wh - 139.63) > 0.3) fails.push(`WLTP ${f(r.wh, 2)} Wh/km is not the locked warm 139.63`);

if (errors.length) console.log('ERRORS:\n  ' + errors.join('\n  '));
if (fails.length || errors.length) {
  console.log('\nFAIL:\n  ' + fails.concat(errors).join('\n  '));
  process.exit(1);
}
console.log('\nOK: 25 °C is the old pack. Colder lithium gives and takes less. Lead-acid does not move, and the 50 °C cut is still its own.');
await browser.close();
