import { chromium } from './pw.mjs';
import { fileURLToPath, pathToFileURL } from 'url';
import path from 'path';
const repo = fileURLToPath(new URL('..', import.meta.url));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 950 } });
await page.goto(pathToFileURL(path.join(repo, 'index.html')).href, { waitUntil: 'networkidle' });
await page.waitForTimeout(600);

// Does the TOP SPEED model reproduce real cars? test41 only ever checked 0-100, which is
// traction-limited and therefore says nothing about aero. Top speed is where drag lives.
// Power, mass, CdA, drivetrain and gearing are all matched to the real car, so what is left
// under test is the drag model and the power needed to overcome it.
const ref = await page.evaluate(() => {
  //                              hp    kg   CdA   real km/h  drive  gears  redline  notes
  const REF = [
    ['Nissan GT-R R35',           565, 1752, 0.56, 315, 'awd', 6, 7000],
    ['Porsche 911 Turbo S 992',   640, 1640, 0.67, 330, 'awd', 8, 7200],
    ['Corvette C8 Z06',           670, 1660, 0.74, 314, 'rwd', 8, 8600],
    ['McLaren F1',                618, 1138, 0.57, 386, 'rwd', 6, 7500],
    ['Bugatti Veyron 16.4',       987, 1888, 0.75, 407, 'awd', 7, 6400],
    ['Ferrari 812 Superfast',     789, 1630, 0.72, 340, 'rwd', 7, 8900],
    ['Dodge Challenger Hellcat',  707, 2020, 0.85, 328, 'rwd', 8, 6200],
  ];
  return REF.map(([label, hp, kg, cdA, realV, drive, gears, redline]) => {
    applyEngineToForm(Object.assign({}, DEFAULT_ENGINE, { cylinders: 8, bore_mm: 94, stroke_mm: 90,
      compression: 10.5, redline, intake: 'na', octane: 98, injector: 'port', cam: 'sport' }));
    buildEngine();
    applyChassisFit('super');
    document.getElementById('vhDrive').value = drive;
    document.getElementById('vhGears').value = gears;
    buildVehicle();
    const scale = hp / engine.score.peakHP, realCurve = buildTorqueCurve;
    window.buildTorqueCurve = () => realCurve().map(p => ({ rpm: p.rpm, tq: p.tq * scale }));
    vehicle.mass = kg;
    vehicle.cdA = cdA;                 // match the real car's drag area exactly
    vehicle.clA = 0;                   // top speed runs are low-downforce; keep it clean
    // Give it gearing tall enough that the limiter is not the ceiling — we are testing DRAG,
    // so the car must be allowed to run out of power rather than out of revs.
    let best = 0, bestG = null;
    for (let g = 0; g <= 100; g += 4) {
      document.getElementById('vhGearing').value = g; buildVehicle();
      vehicle.mass = kg; vehicle.cdA = cdA; vehicle.clA = 0;
      const R = vehicle.ratios, tot = R[R.length-1] * vehicle.finalDrive;
      const vRed = engine.redline * Math.PI*2 * vehicle.rTire / 60 / tot * 3.6;
      const t = simulateAccel().topSpeed;
      if (t > best) { best = t; bestG = { g, vRed: Math.round(vRed), revLimited: t >= vRed - 1 }; }
    }
    window.buildTorqueCurve = realCurve;
    // what the textbook says this car should do, from the same numbers
    const solve = () => { let v = 50;
      for (let i = 0; i < 200; i++) {
        const P = hp * 745.7 * 0.90;                       // crank hp -> wheels
        const f = 0.5 * 1.2 * cdA * v*v + 0.013 * kg * 9.81;
        v = Math.pow(P / (0.5*1.2*cdA) , 1/3) * (1 - 0.0*i) ;
        break; }
      // proper: solve P = (0.5 rho CdA v^2 + crr m g) v  by iteration
      v = 50;
      for (let i = 0; i < 500; i++) {
        const P = hp * 745.7 * 0.90;
        const F = P / v;
        // same speed-dependent Crr law the sim uses, so this stays an independent check of the
        // ARITHMETIC rather than accidentally testing a different physical model
        const vref = 80/3.6, beta = (0.016/0.010 - 1)/(Math.pow(200/3.6,2) - vref*vref);
        const need = 0.5*1.2*cdA*v*v + 0.013*(1 + beta*(v*v - vref*vref))*kg*9.81;
        v += (F - need) / (kg) * 0.5;
        if (v < 5) v = 5;
      }
      return v * 3.6; };
    return { label, hp, kg, cdA, real: realV, model: Math.round(best),
      textbook: Math.round(solve()), gearing: bestG.g, revLimited: bestG.revLimited,
      err: +((best/realV - 1)*100).toFixed(1) };
  });
});
console.log('car                          hp    kg   CdA   real   model  textbook   error   rev-limited?');
ref.forEach(r => console.log(`${r.label.padEnd(27)} ${String(r.hp).padStart(4)} ${String(r.kg).padStart(5)}` +
  ` ${r.cdA.toFixed(2)} ${String(r.real).padStart(6)} ${String(r.model).padStart(7)} ${String(r.textbook).padStart(9)}` +
  ` ${String((r.err>0?'+':'')+r.err+'%').padStart(8)}   ${r.revLimited ? 'yes (not drag)' : 'no'}`));
const rms = Math.sqrt(ref.reduce((s,r)=>s+r.err*r.err,0)/ref.length);
const bias = ref.reduce((s,r)=>s+r.err,0)/ref.length;
console.log(`\nRMS error ${rms.toFixed(1)}%  ·  mean bias ${bias>0?'+':''}${bias.toFixed(1)}%` +
  `  (positive = the model is FASTER than the real car)`);
console.log('"textbook" solves P = (0.5.rho.CdA.v^2 + crr.m.g).v independently, as a cross-check on the sim.');
await browser.close();
