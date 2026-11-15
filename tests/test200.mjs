// The voxel car prototype (build 324): a real car's body as stacked layers in the TEST TRACK chase view.
//
// WHY THIS EXISTS. What must hold, on the Ferrari F40:
//   · it is off by default: without ?voxel, voxelCarFor gives nothing and the flat car is drawn;
//   · with ?voxel the model is built from the car's own data: as many voxels long and high as carDims's length and
//     height, wheels at the rear overhang and one wheelbase on, on the published tracks, with carDims's tyre sizes;
//   · the replay draws it (the picture under the car is the F40's sampled red) with no page error.
import { chromium } from './pw.mjs';
import { fileURLToPath, pathToFileURL } from 'url';
import path from 'path';
const repo = fileURLToPath(new URL('..', import.meta.url));
const browser = await chromium.launch();
const errors = [], fails = [];
const run = async q => {
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  await page.goto(pathToFileURL(path.join(repo, 'index.html')).href + q, { waitUntil: 'networkidle' });
  await page.waitForTimeout(300);
  const r = await page.evaluate(async () => {
    const p = FACTORY_CARS.find(x => x.name === 'Ferrari F40 (1987)');
    loadVehiclePreset(p); setTab('track'); refreshLap();
    const M = voxelCarFor(vehicle);
    if (!M) return { off: true };
    const D = carDims(p), T0 = lapResult.lap * 0.3;
    const hold = setInterval(() => { lapReplay.playing = true; lapReplay.speed = 0; lapReplay.t = T0; trackView.z = 3; }, 10);
    await new Promise(r => setTimeout(r, 400)); clearInterval(hold);
    // red pixels in the middle of the track picture, where the car sits
    const cv = document.getElementById('engineCanvas'), g = cv.getContext('2d'), d = g.getImageData(0, 0, cv.width, cv.height).data;
    let red = 0; for (let i = 0; i < d.length; i += 4) if (d[i] > 120 && d[i + 1] < 40 && d[i + 2] < 40) red++;
    return { D, nx: M.layers.find(c => c).width, nz: M.layers.length, wheels: M.wheels, red };
  });
  await page.close();
  return r;
};
const off = await run(''), on = await run('?voxel');
if (!off.off) fails.push('the voxel car is drawn without ?voxel');
if (on.off) fails.push('?voxel gives no model for the F40');
else {
  const { D, wheels: [R, F] } = on, V = 0.07;
  console.log(`== F40: ${on.nx} x ${on.nz} voxels; axles at ${R.x.toFixed(3)} / ${F.x.toFixed(3)} m; tyres ${(2 * R.r).toFixed(3)} / ${(2 * F.r).toFixed(3)} m; ${on.red} red pixels ==`);
  if (on.nx !== Math.ceil(D.len / V)) fails.push(`length ${on.nx} voxels, not ${Math.ceil(D.len / V)}`);
  if (on.nz !== Math.ceil(D.h / V)) fails.push(`height ${on.nz} layers, not ${Math.ceil(D.h / V)}`);
  if (Math.abs(R.x - D.ovR) > 1e-9 || Math.abs(F.x - R.x - D.wb) > 1e-9) fails.push('the axles are not at the overhang and the wheelbase');
  if (R.t !== D.trackR || F.t !== D.trackF) fails.push('the wheels are not on the tracks');
  if (R.r !== D.tyreR.dia / 2 || F.r !== D.tyreF.dia / 2 || R.tw !== D.tyreR.w || F.tw !== D.tyreF.w) fails.push('the tyres are not carDims\'s');
  if (on.red < 500) fails.push(`the replay does not draw the red body (${on.red} red pixels)`);
}
await browser.close();
if (errors.length) { console.log(errors.join('\n')); fails.push(errors.length + ' page errors'); }
if (fails.length) { console.log('\nFAIL:\n  ' + fails.join('\n  ')); process.exit(1); }
console.log('\nOK: the F40 is stacked from its own data, only when asked for.');
