// The motor's heat paths from correlations (build 315).
//
// WHY THIS EXISTS. The water jacket was 1200 W/m²K over the stator, the stator-housing contact 2e-4 m²K/W and the air gap
// 100 W/m²K, all typical figures (MOTOR_COOLING). What must hold:
//   · the jacket's film is Gnielinski's on its channel (turbulent at 8 L/min), and the core-to-coolant conductance is the
//     contact (Staton's 0.01 mm of air), the housing wall and the finned film in series;
//   · spray and slot cooling keep the jacket, so better cooling still holds a cooler winding (test96);
//   · the air gap follows Becker & Kaye: Nu 2 at rest, continuous at Ta 1700 and 1e4, rising with speed; the speed rides
//     on the losses (L.rpm), a motor set's included.
import { chromium } from './pw.mjs';
import { fileURLToPath, pathToFileURL } from 'url';
import path from 'path';
const repo = fileURLToPath(new URL('..', import.meta.url));
const browser = await chromium.launch();
const page = await browser.newPage();
const errors = [];
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
await page.goto(pathToFileURL(path.join(repo, 'index.html')).href, { waitUntil: 'networkidle' });
const fails = [];
const r = await page.evaluate(() => {
  const J = JACKET, f = jacketFilm(J), d = { rotorD: 150, statorOD: 225, stackL: 134, poles: 6, turns: 12, magnet: 'ndfeb', inverter: 'igbt', invAmps: 800, maxRpm: 18000 };
  const mk = c => motorBuild(Object.assign({}, d, { cooling: c })), m = mk('jacket');
  // by hand: Gnielinski on the channel, the fins, the three resistances in series
  const A = J.w * J.d, Dh = 2 * A / (J.w + J.d), Re = J.rho * J.flow / A * Dh / J.mu, Pr = J.mu * J.cp / J.k, fr = (0.79 * Math.log(Re) - 1.64) ** -2;
  const h = fr / 8 * (Re - 1000) * Pr / (1 + 12.7 * Math.sqrt(fr / 8) * (Pr ** (2 / 3) - 1)) * J.k / Dh;
  const mL = Math.sqrt(2 * h / (J.kAl * J.rib)) * J.d, eta = Math.tanh(mL) / mL, Do = m.OD + 2 * J.wall;
  const G = 1 / (1e-5 / 0.030 / (Math.PI * m.OD * m.L) + Math.log(Do / m.OD) / (2 * Math.PI * J.kAl * m.L) + 1 / (h * Math.PI * Do * m.L * (J.w + 2 * J.d * eta) / (J.w + J.rib)));
  const g = m.gap, rpmAt = Ta => Math.sqrt(Ta * NU_AIR ** 2 / ((m.D + g) / 2 * g ** 3)) * 30 / Math.PI;
  const set = motorSet([{ m, n: 2 }]);
  return { Re: f.Re, h: f.h, hHand: h, G: m.Gcc, GHand: G, spray: mk('spray').Gcc, h0: gapH(m.D, g, 0), nu0: gapH(m.D, g, 0) * 2 * g / K_AIR,
    jumps: [1700, 1e4].map(Ta => [gapH(m.D, g, rpmAt(Ta) * 0.9999), gapH(m.D, g, rpmAt(Ta) * 1.0001)]),
    rise: [0, 3000, 8000, 16000].map(n => motorGrc(m, n)), Lrpm: motorLosses(m, 100, 5000, 350, { w: 80, r: 60 }).rpm,
    setRpm: motorLosses(set, 200, 5000, 350, { w: 80, r: 60 }).rpm, setG: motorGrc(set, 5000) / motorGrc(m, 5000) };
});
await browser.close();
const near = (a, b, e) => Math.abs(a - b) <= e * Math.abs(b);
console.log(`jacket: Re ${r.Re.toFixed(0)}, film ${r.h.toFixed(0)} W/m²K (by hand ${r.hHand.toFixed(0)}); core to coolant ${r.G.toFixed(1)} W/K (by hand ${r.GHand.toFixed(1)})`);
console.log(`air gap: Nu ${r.nu0.toFixed(2)} at rest; W/K at 0/3000/8000/16000 rpm ${r.rise.map(x => x.toFixed(2)).join(' / ')}`);
if (!(r.Re > 3000)) fails.push('the jacket is not turbulent at its flow');
if (!near(r.h, r.hHand, 1e-9) || !near(r.G, r.GHand, 1e-9)) fails.push('the jacket is not Gnielinski with the contact, wall and fins in series');
if (!near(r.spray, r.G, 1e-12)) fails.push('spray cooling does not keep the jacket');
if (!near(r.nu0, 2, 1e-9)) fails.push('the gap at rest is not Nu 2');
for (const [a, b] of r.jumps) if (!near(a, b, 0.02)) fails.push(`the gap's Nusselt number jumps at a regime change: ${a} -> ${b}`);
if (!r.rise.every((x, i) => i === 0 || x > r.rise[i - 1])) fails.push('the gap does not conduct more with speed');
if (r.Lrpm !== 5000 || r.setRpm !== 5000) fails.push('the losses do not carry the speed');
if (!near(r.setG, 2, 1e-9)) fails.push("a set's gap is not its motors' added");
if (errors.length) fails.push(...errors);
if (fails.length) { console.log('\nFAIL\n' + fails.map(f => '  - ' + f).join('\n')); process.exit(1); }
console.log('\nPASS');
