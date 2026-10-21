// Real circuits (build 121): the 22 tracks in tracks/real-circuits.js are what their sources say they
// are. Length against the official figure, width from the measured data rather than a model, the
// terrain model's height against published elevation changes, and a lap that solves on every one.
import { chromium } from './pw.mjs';
import { fileURLToPath, pathToFileURL } from 'url';
import path from 'path';
const repo = fileURLToPath(new URL('..', import.meta.url));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 950 } });
const errors = [];
page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
await page.goto(pathToFileURL(path.join(repo, 'index.html')).href, { waitUntil: 'networkidle' });
await page.waitForTimeout(400);
const fails = [];

// Official lap lengths (m) for the layout each source file carries (Catalunya with the 2007-2020
// chicane, Zandvoort before the 2020 rebuild, Yas Marina before 2021, Indianapolis the oval).
const OFFICIAL = { cota: 5513, brands: 3908, hungaro: 4381, catalunya: 4655, hockenheim: 4574, indy: 4023,
  melbourne: 5303, mexico: 4304, montreal: 4361, monza: 5793, nurgp: 5148, sakhir: 5412, interlagos: 4309,
  sepang: 5543, shanghai: 5451, silverstone: 5891, sochi: 5848, spa: 7004, spielberg: 4318, suzuka: 5807,
  yasmarina: 5554, zandvoort: 4307 };
// Published elevation changes (m) where the figure is well established; flat circuits by a ceiling.
const ELEV = { spa: 104, spielberg: 65, suzuka: 40, interlagos: 43, hungaro: 35 };
const FLAT = ['indy', 'yasmarina', 'zandvoort', 'shanghai', 'sochi', 'montreal'];

const r = await page.evaluate(() => {
  loadVehiclePreset(VEHICLE_PRESETS.find(v => v.name === 'Porsche 911 GT3 (991.2, 2017)'));
  const sel = document.getElementById('trkSel');
  const grp = [...sel.querySelectorAll('optgroup')].find(g => g.label === 'REAL CIRCUITS');
  return {
    menu: grp ? grp.querySelectorAll('option').length : 0,
    tracks: Object.keys(TRACKS).filter(k => TRACKS[k].real).map(k => {
      const L = simulateLap(k), T = L.track, zs = T.pts.map(p => p.z);
      const gap = Math.hypot(T.pts[0].x - T.pts[T.pts.length - 1].x, T.pts[0].y - T.pts[T.pts.length - 1].y);
      return { k, label: T.label, len: T.length, lap: L.lap, wMin: T.wMin, wMax: T.wMax, gap,
        dz: Math.max(...zs) - Math.min(...zs), fit: TRACKS[k].src.fitRms, avg: T.length / L.lap * 3.6 };
    })
  };
});
console.log('== real circuits (911 GT3 991.2) ==');
for (const t of r.tracks) console.log(`  ${t.label.padEnd(19)} ${Math.round(t.len)} m  lap ${t.lap.toFixed(2)} s  ` +
  `avg ${Math.round(t.avg)} km/h  width ${t.wMin.toFixed(1)}-${t.wMax.toFixed(1)} m  rise ${t.dz.toFixed(1)} m  fit ${t.fit} m`);

if (r.tracks.length !== 22) fails.push(`expected 22 real circuits, found ${r.tracks.length}`);
if (r.menu !== 22) fails.push(`the CIRCUIT menu's REAL CIRCUITS group lists ${r.menu}, expected 22`);
const by = Object.fromEntries(r.tracks.map(t => [t.k, t]));
for (const t of r.tracks) {
  const off = OFFICIAL[t.k];
  if (!off) { fails.push(`${t.k}: no official length to check against`); continue; }
  if (Math.abs(t.len / off - 1) > 0.01) fails.push(`${t.label} is ${Math.round(t.len)} m against an official ${off} m`);
  if (t.gap > 25) fails.push(`${t.label} centreline does not close (gap ${t.gap.toFixed(1)} m)`);
  if (!(t.lap > 0 && isFinite(t.lap))) fails.push(`${t.label} lap did not solve`);
  if (t.fit > 15) fails.push(`${t.label} georeference fit ${t.fit} m RMS: the sources disagree about the layout`);
  // Measured width varies; only the oval is one width all the way round.
  if (t.k !== 'indy' && t.wMax - t.wMin < 2) fails.push(`${t.label} width ${t.wMin.toFixed(1)}-${t.wMax.toFixed(1)} m reads as constant, not measured`);
  if (t.wMin < 6 || t.wMax > 30) fails.push(`${t.label} width ${t.wMin.toFixed(1)}-${t.wMax.toFixed(1)} m is outside any real circuit`);
}
for (const [k, e] of Object.entries(ELEV))
  if (by[k] && Math.abs(by[k].dz - e) > Math.max(10, 0.15 * e)) fails.push(`${by[k].label} rises ${by[k].dz.toFixed(1)} m against a published ${e} m`);
for (const k of FLAT) if (by[k] && by[k].dz > 12) fails.push(`${by[k].label} rises ${by[k].dz.toFixed(1)} m; it is a flat circuit`);
// Character: Monza is the fastest road circuit, the Hungaroring among the slowest, the oval faster than both.
const road = r.tracks.filter(t => t.k !== 'indy').sort((a, b) => b.avg - a.avg);
if (road[0].k !== 'monza') fails.push(`fastest road circuit is ${road[0].label}, expected Monza`);
if (!(by.hungaro.avg < by.silverstone.avg && by.hungaro.avg < by.spa.avg)) fails.push('the Hungaroring should be slower on average than Silverstone and Spa');
if (!(by.indy.avg > road[0].avg)) fails.push('the oval should be faster on average than any road circuit');

if (errors.length) fails.push(...errors);
console.log(fails.length ? '\nFAIL\n  ' + fails.join('\n  ') : '\nPASS — 22 real circuits: lengths, widths, elevation and laps');
await browser.close();
process.exit(fails.length ? 1 : 0);
