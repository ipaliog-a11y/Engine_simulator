// Challenges: five real open roads (build 343).
//
// WHY THIS EXISTS. Build 343 adds Dragon, Big Sur, Napoleon, Highland and Targa as
// open ROADS + economy RUN_CHALLENGES. What must hold:
//   · each new road is open (start ≠ end), corners > 0, length within ~15% of the
//     published/chosen segment cited in eco-roads.js;
//   · Alpine Pass still present; challenge select lists all six economy entries;
//   · MX-5 ICE economy solve succeeds on each new road;
//   · at least one EV solve (Model 3 on Dragon) returns kWh.
import { chromium } from './pw.mjs';
import { fileURLToPath, pathToFileURL } from 'url';
import path from 'path';
const repo = fileURLToPath(new URL('..', import.meta.url));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
await page.goto(pathToFileURL(path.join(repo, 'index.html')).href, { waitUntil: 'networkidle' });
const fails = [];

// Chosen segment lengths (km) cited beside each road: classic published or OSRM cut.
const PUB = {
  dragon: 18.0,
  bigsur: 38.1,
  napoleon: 116.3,
  highland: 91.6,
  targa: 60.1
};

const r = await page.evaluate((PUB) => {
  const keys = Object.keys(PUB);
  const roads = {};
  for (const k of keys) {
    const road = buildRoad(k);
    if (!road) { roads[k] = null; continue; }
    const n = road.pts.length;
    roads[k] = {
      open: !!road.open,
      lenKm: road.length / 1000,
      corners: road.corners,
      startEnd: Math.hypot(road.pts[0].x - road.pts[n - 1].x, road.pts[0].y - road.pts[n - 1].y)
    };
  }
  const alpine = buildRoad('alpine');
  const chalIds = RUN_CHALLENGES.map(c => c.id);
  const chalRoads = RUN_CHALLENGES.filter(c => c.kind === 'economy').map(c => c.road);
  loadVehiclePreset(FACTORY_CARS.find(p => p.name.includes('MX-5')));
  const ice = {};
  for (const k of keys) {
    const s = simulateEconomyChallenge(k);
    ice[k] = s && s.ok && !s.ev ? { t: s.time, target: s.target, L: s.fuelL, km: s.lengthKm } : null;
  }
  loadVehiclePreset(FACTORY_CARS.find(p => p.name.includes('Model 3 RWD (2021)')));
  const ev = simulateEconomyChallenge('dragon');
  const sel = document.getElementById('chalSel');
  const opts = sel ? Array.from(sel.options).map(o => o.value) : [];
  return {
    roads,
    alpineOk: !!(alpine && alpine.open && alpine.length > 8000),
    chalIds,
    chalRoads,
    ice,
    ev: ev && ev.ok && ev.ev ? { kWh: ev.kWh, whkm: ev.whkm } : null,
    opts
  };
}, PUB);

console.log(JSON.stringify({ alpineOk: r.alpineOk, roads: r.roads, chalIds: r.chalIds, ice: r.ice, ev: r.ev, opts: r.opts }, null, 2));

if (!r.alpineOk) fails.push('Alpine Pass missing or closed');
for (const [k, pub] of Object.entries(PUB)) {
  const rd = r.roads[k];
  if (!rd) { fails.push(k + ' missing'); continue; }
  if (!rd.open) fails.push(k + ' not open');
  if (!(rd.corners > 0)) fails.push(k + ' no corners');
  if (!(rd.startEnd > 100)) fails.push(k + ' start≈finish (' + rd.startEnd.toFixed(0) + ' m)');
  const err = Math.abs(rd.lenKm - pub) / pub;
  if (!(err <= 0.15)) fails.push(k + ' length ' + rd.lenKm.toFixed(2) + ' km vs ' + pub + ' (' + (err * 100).toFixed(1) + '%)');
  if (!r.ice[k]) fails.push(k + ' MX-5 solve failed');
  else if (!(r.ice[k].L > 0.1)) fails.push(k + ' MX-5 fuel missing');
}
for (const id of ['economy', 'economy-dragon', 'economy-bigsur', 'economy-napoleon', 'economy-highland', 'economy-targa']) {
  if (!r.chalIds.includes(id)) fails.push('RUN_CHALLENGES missing ' + id);
  if (!r.opts.includes(id)) fails.push('chalSel missing ' + id);
}
if (!r.ev) fails.push('Model 3 Dragon EV solve failed');
else if (!(r.ev.kWh > 0.5)) fails.push('Model 3 kWh missing: ' + r.ev.kWh);

console.log(fails.length ? 'FAIL:\n  ' + fails.join('\n  ') : 'PASS');
console.log('ERRORS:', errors.length ? errors : 'none');
await browser.close();
process.exit(fails.length || errors.length ? 1 : 0);
