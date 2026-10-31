// Exports the electric presets' drives from index.html to drives.json: per motor group the poles, the stator slots, the
// inverter's switching frequency, the speed limit and the full-load torque curve; the car's reduction, tyre radius,
// mass and drag. What the synth (synth.mjs) needs and nothing else: run `node dump-drives.mjs` after the drive changes.
import { chromium } from '../../pw.mjs';
import { fileURLToPath, pathToFileURL } from 'url';
import path from 'path';
import fs from 'fs';
const here = path.dirname(fileURLToPath(import.meta.url)), repo = path.join(here, '..', '..', '..');
const browser = await chromium.launch(), page = await browser.newPage();
await page.goto(pathToFileURL(path.join(repo, 'index.html')).href, { waitUntil: 'networkidle' });
const drives = await page.evaluate(() => {
  const out = [];
  const take = (name, tweak) => {
    loadVehiclePreset(EV_VEHICLE_PRESETS.find(x => x.name === name)); setTab('design');
    if (tweak) { tweak(); buildEngine(); buildVehicle(); }
    const e = engine, m = e.motor, V = packOcv(e.pack, 0.9), parts = m.parts || [{ m, n: 1 }];
    const curve = []; for (let r = 0; r <= m.nMax; r += 250) curve.push([r, motorMaxTorque(m, Math.max(r, 1), V, 60)]);
    out.push({ name: name + (tweak ? ' (IGBT inverter)' : ''),
      groups: parts.map(q => ({ n: q.n, im: q.m.im, poles: q.m.poles, slots: q.m.slots, fsw: q.m.inv.fSw, inv: q.m.s.inverter, Tpk: motorMaxTorque(q.m, 100, V, 60) })),
      nMax: m.nMax, curve, fd: vehicle.finalDrive * (vehicle.ratios ? vehicle.ratios[0] : 1), rTire: vehicle.rTire, mass: vehicle.mass, cdA: vehicle.cdA, crr: vehicle.crr });
  };
  for (const p of EV_VEHICLE_PRESETS) take(p.name);
  take(EV_VEHICLE_PRESETS[0].name, () => { document.getElementById('evInverter').value = 'igbt'; });
  return out;
});
await browser.close();
fs.writeFileSync(path.join(here, 'drives.json'), JSON.stringify(drives, null, 1));
for (const d of drives) console.log(d.name, '|', d.groups.map(g => `${g.n}x ${g.im ? 'IM' : 'PM'} ${g.poles}p ${g.slots}s ${g.fsw / 1000} kHz ${Math.round(g.Tpk)} Nm`).join(' + '),
  '| nMax', Math.round(d.nMax), '| reduction', d.fd.toFixed(2), '| r', d.rTire.toFixed(3));
