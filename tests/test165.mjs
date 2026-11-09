// Emission tile colors on LIVE + guide copy (build 258).
//
// WHY THIS EXISTS. Each species tile must turn amber/red on the same scale as the emit score,
// and the guide wiki must say so. What must hold:
//   · stoich cruise with a stock cat → CO and HC tiles are not warning/danger;
//   · a rich mixture → CO tile is danger (or at least warning);
//   · cat none at stoich → at least one of CO/HC/NOx is warning or danger;
//   · the guide emissions page mentions amber/red (or the color words) for the tiles.
import { chromium } from './pw.mjs';
import { fileURLToPath, pathToFileURL } from 'url';
import path from 'path';
const repo = fileURLToPath(new URL('..', import.meta.url));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors = [];
page.on('console', m => { if (m.type() === 'error' && !/ERR_FILE_NOT_FOUND/.test(m.text())) errors.push('console: ' + m.text()); });
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
await page.goto(pathToFileURL(path.join(repo, 'index.html')).href, { waitUntil: 'networkidle' });
await page.waitForTimeout(300);
const fails = [];

const r = await page.evaluate(() => {
  const cls = id => document.getElementById(id).className;
  applyBuild({ engine: Object.assign({}, DEFAULT_ENGINE), tune: Object.assign({}, STD_TUNE) });
  engine.afrMode = 'fixed';
  engine.cat = 'stock'; engine.catConv = CAT.stock.conv;
  state.rpm = 2500; state.map = 0.55; state.coolant = 90; state.iat = 25; state.fuelCut = false;
  state.ve = computeVE(state.rpm, state.map);
  state.afr = engine.stoichAFR;
  // fuel flow path so g/kg tones have a denominator
  const T_k = effIAT(state.map, state.rpm) + 273.15, MAP_pa = state.map * 1e5, Vd = engine.displacement_L / 1000;
  const air = (MAP_pa * Vd * (state.rpm / 60) * engine.chargesPerRev * state.ve) / (287 * T_k) * (1 - egrRate(state.rpm, state.map));
  const metered = (air / state.afr) / engine.meteringEff * engine.typeBsfc;
  state.fuelFlowLph = (metered * 3600) / engine.fuelDensity;
  state.powerKW = 20; state.powerHP = state.powerKW / 0.7457;
  computeEmissions(); updateUI();
  const clean = { co: cls('statCO'), hc: cls('statHC'), nox: cls('statNOx'), emit: cls('statEmit') };
  state.afr = engine.stoichAFR * 0.80;
  state.fuelFlowLph = (air / state.afr) / engine.meteringEff * engine.typeBsfc * 3600 / engine.fuelDensity;
  computeEmissions(); updateUI();
  const rich = { co: cls('statCO'), emCO: state.emCO, fph: state.fuelFlowLph };
  state.afr = engine.stoichAFR;
  engine.cat = 'none'; engine.catConv = 0;
  state.fuelFlowLph = (air / state.afr) / engine.meteringEff * engine.typeBsfc * 3600 / engine.fuelDensity;
  computeEmissions(); updateUI();
  const none = { co: cls('statCO'), hc: cls('statHC'), nox: cls('statNOx') };
  const guide = document.querySelector('#gp-emissions [data-gk="emissionsGame"]');
  return { clean, rich, none, guide: guide ? guide.textContent : '' };
});

console.log('== tones ==', JSON.stringify(r));
const dirty = s => /\b(warning|danger)\b/.test(s);
if (dirty(r.clean.co) || dirty(r.clean.hc)) fails.push(`stoich+cat CO/HC not clean: co=${r.clean.co} hc=${r.clean.hc}`);
if (!dirty(r.rich.co)) fails.push(`rich CO tile not amber/red: ${r.rich.co} (emCO=${r.rich.emCO})`);
if (!(dirty(r.none.co) || dirty(r.none.hc) || dirty(r.none.nox))) fails.push(`cat none left all pollutant tiles green: ${JSON.stringify(r.none)}`);
if (!/amber|red|warning|colour|color/i.test(r.guide)) fails.push('guide emissionsGame does not mention tile colors');

if (errors.length) fails.push(...errors);
console.log(fails.length ? `FAIL (${fails.length})\n` + fails.map(f => ' - ' + f).join('\n') : 'OK');
await browser.close();
process.exit(fails.length ? 1 : 0);
