#!/usr/bin/env node
// Bake the ENGINE tab's showpiece sprites.
//
//   node tools/engine-art.mjs           write src/js/engine-art-data.js and assets/engine-parts/*.png
//   node tools/engine-art.mjs --check   fail if the JS file is not what this script emits
//
// The pictures are authored here at pixel size (a few are drawn at 2× and nearest-neighbour
// downscaled, to keep the reducer in the pipeline). Each pixel is a palette index from
// src/js/engine-art-palette.js. The game never loads the PNGs: a drawn image would taint the
// canvas under file:// and break garage toDataURL. The PNGs are the review copies.
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { deflateSync, crc32 } from 'zlib';
import { fileURLToPath } from 'url';
import path from 'path';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const PAL_FILE = path.join(ROOT, 'src/js/engine-art-palette.js');
const OUT_JS = path.join(ROOT, 'src/js/engine-art-data.js');
const OUT_PNG = path.join(ROOT, 'assets/engine-parts');
const check = process.argv.includes('--check');

const palSrc = readFileSync(PAL_FILE, 'utf8');
const palBody = palSrc.slice(palSrc.indexOf('const ENG_PAL=['), palSrc.indexOf('];', palSrc.indexOf('const ENG_PAL=[')) + 1);
const ENG_PAL = Function('return ' + palBody.replace('const ENG_PAL=', ''))();

const I = {
  o: 1, port: 95, belt: 96, bolt: 87, boltSh: 88, label: 93, fin: 94, dirty: 97, ti: 98,
  vvt: 85, als: 86, cable: 91, cableLo: 92, glow: 101, red: 99, redLo: 100,
  ironHi: 2, iron: 3, ironMid: 4, ironLo: 5, ironDeep: 6,
  alHi: 7, al: 8, alMid: 9, alLo: 10, alDeep: 11,
  chHi: 12, ch: 13, chMid: 14, chLo: 15, chDeep: 16,
  rub: 17, rubMid: 18, rubLo: 19,
  tHi: 63, t: 64, tMid: 65, tLo: 66,
  hHi: 67, h: 68, hMid: 69, hLo: 70,
  nHi: 71, n: 72, nMid: 73, nLo: 74,
  sHi: 59, s: 60, sMid: 61, sLo: 62,
  cHi: 55, c: 56, cMid: 57
};

function blank(w, h) { return Array.from({ length: h }, () => Array(w).fill(0)); }
function plot(g, x, y, v) {
  x = Math.round(x); y = Math.round(y);
  if (v && y >= 0 && x >= 0 && y < g.length && x < g[0].length) g[y][x] = v;
}
function fill(g, x, y, w, h, v) {
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) plot(g, x + i, y + j, v);
}
function disc(g, cx, cy, r, v) {
  const R = Math.ceil(r);
  for (let y = -R; y <= R; y++) for (let x = -R; x <= R; x++)
    if (x * x + y * y <= r * r + r * 0.25) plot(g, cx + x, cy + y, v);
}
function ring(g, cx, cy, r0, r1, v) {
  const R = Math.ceil(r1);
  for (let y = -R; y <= R; y++) for (let x = -R; x <= R; x++) {
    const d = x * x + y * y;
    if (d <= r1 * r1 + r1 * 0.2 && d >= r0 * r0) plot(g, cx + x, cy + y, v);
  }
}
function shadeDisc(g, cx, cy, r, hi, mid, lo) {
  const R = Math.ceil(r);
  for (let y = -R; y <= R; y++) for (let x = -R; x <= R; x++) {
    if (x * x + y * y > r * r + r * 0.25) continue;
    const v = (x < -r * 0.15 && y < -r * 0.05) ? hi : (x + y > r * 0.45 ? lo : mid);
    plot(g, cx + x, cy + y, v);
  }
}
function outline(g) {
  const h = g.length, w = g[0].length, o = g.map(r => r.slice());
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (g[y][x]) continue;
    if ((x > 0 && g[y][x - 1]) || (x < w - 1 && g[y][x + 1]) || (y > 0 && g[y - 1][x]) || (y < h - 1 && g[y + 1][x]))
      o[y][x] = I.o;
  }
  return o;
}
function downscale(g, factor) {
  if (factor <= 1) return g;
  const h = g.length, w = g[0].length;
  const W = Math.round(w / factor), H = Math.round(h / factor), o = blank(W, H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) o[y][x] = g[Math.min(h - 1, y * factor)][Math.min(w - 1, x * factor)];
  return o;
}
function rleFrame(g) {
  const rows = [];
  for (const row of g) {
    const runs = [];
    let x = 0;
    while (x < row.length) {
      const v = row[x];
      let n = 1;
      while (x + n < row.length && row[x + n] === v) n++;
      runs.push([v, n]);
      x += n;
    }
    rows.push(runs);
  }
  return rows;
}

function wheelFrames(d) {
  const frames = [];
  const cx = (d - 1) / 2, cy = cx;
  for (let f = 0; f < 4; f++) {
    const g = blank(d, d);
    const base = f * Math.PI / 8; // 0, 22.5, 45, 67.5 — four poses, then it repeats
    disc(g, cx, cy, d / 2 - 0.2, I.tLo);
    for (let b = 0; b < 4; b++) {
      const a = base + b * Math.PI / 2;
      for (let t = 0.2; t < d / 2 - 0.6; t += 0.7) plot(g, cx + Math.cos(a) * t, cy + Math.sin(a) * t, I.chHi);
    }
    plot(g, cx, cy, I.bolt);
    frames.push(g);
  }
  return frames;
}

function makeTurbo(r) {
  const w = r * 2 + 12, h = r * 2 + 10;
  const g = blank(w, h);
  const cx = r + 2, cy = r + 1;
  const hx = cx + r - 1, hy = cy + Math.round(r * 0.85);
  shadeDisc(g, hx, hy, r - 1, I.hHi, I.h, I.hLo);
  disc(g, hx, hy, Math.max(2, r - 4), I.hMid);
  // scroll: a thick ring, open toward the outlet on the right
  shadeDisc(g, cx, cy, r, I.tHi, I.t, I.tMid);
  disc(g, cx, cy, Math.max(2, r - 3), I.port);
  // outlet snail horn, upper right
  const ox = cx + r, oy = cy - Math.round(r * 0.35);
  fill(g, ox - 1, oy - 2, r, 4, I.t);
  fill(g, ox - 1, oy - 2, r, 1, I.tHi);
  fill(g, ox + r - 2, oy - 1, 3, 3, I.tMid);
  // exhaust inlet under the turbine
  fill(g, hx - 2, hy + r - 2, 5, 3, I.h);
  const og = outline(g);
  return {
    g: og, ax: cx, ay: cy,
    hot: [hx - cx, hy - cy],
    out: [ox + r - cx - 1, oy - cy],
    inn: [0, 0]
  };
}

function makeVgt(r) {
  const d = r * 2 + 1;
  const g = blank(d, d);
  const c = r;
  ring(g, c, c, r - 1.3, r, I.als);
  for (let k = 0; k < 8; k++) {
    const a = k * Math.PI / 4;
    plot(g, c + Math.cos(a) * (r - 0.2), c + Math.sin(a) * (r - 0.2), I.glow);
  }
  return { g, ax: c, ay: c };
}

function makeBlower(kind) {
  const w = kind === 'centri' ? 16 : 34, h = kind === 'screw' ? 14 : kind === 'centri' ? 16 : 16;
  const g = blank(w, h);
  if (kind === 'centri') {
    shadeDisc(g, 8, 8, 6, I.tHi, I.t, I.tMid);
    disc(g, 8, 8, 2.4, I.port);
    fill(g, 12, 5, 4, 3, I.t);
    fill(g, 1, 7, 4, 3, I.chMid);
    const og = outline(g);
    return { g: og, ax: 8, ay: 8, inn: [-6, 0], out: [6, -2] };
  }
  fill(g, 2, 3, w - 6, h - 5, I.al);
  fill(g, 2, 3, w - 6, 2, I.alHi);
  fill(g, 2, h - 4, w - 6, 2, I.alLo);
  // ribs
  for (let x = 4; x < w - 6; x += 3) fill(g, x, 4, 1, h - 7, I.alMid);
  // drive snout at the front (left)
  shadeDisc(g, 3, h / 2, 3.2, I.chHi, I.ch, I.chMid);
  disc(g, 3, h / 2, 1.2, I.belt);
  const ports = kind === 'screw' ? 2 : 3;
  const gap = (w - 12) / ports;
  for (let i = 0; i < ports; i++) {
    const x = Math.round(8 + i * gap);
    fill(g, x, 1, 4, 3, I.port);
    fill(g, x, 0, 4, 1, kind === 'screw' ? I.alMid : I.h);
  }
  if (kind === 'screw') {
    for (let i = 0; i < 8; i++) plot(g, 8 + i * 3, 6 + (i % 3), I.alDeep);
  }
  const og = outline(g);
  return { g: og, ax: Math.round(w / 2), ay: Math.round(h / 2), inn: [Math.round(w / 2) - 4, -Math.round(h / 2) + 1], out: [0, 0] };
}

function makeCarb(barrels) {
  const w = barrels === 4 ? 18 : barrels === 2 ? 14 : 10;
  const h = 14;
  const g = blank(w, h);
  fill(g, 1, 6, w - 2, 7, I.alMid);
  fill(g, 1, 6, w - 2, 1, I.alHi);
  fill(g, 2, 10, w - 4, 2, I.alLo);
  const horns = barrels === 1 ? 1 : 2;
  const hw = barrels === 4 ? 4 : 3;
  for (let i = 0; i < horns; i++) {
    const x = Math.round(2 + i * ((w - 4 - hw) / Math.max(1, horns - 1 || 1)));
    const xx = horns === 1 ? Math.round((w - hw) / 2) : x;
    fill(g, xx, 2, hw, 5, I.ch);
    fill(g, xx, 1, hw, 2, I.chHi);
    disc(g, xx + hw / 2, 2, hw / 2, I.port);
  }
  if (barrels === 4) {
    fill(g, 3, 8, 2, 2, I.port); fill(g, w - 5, 8, 2, 2, I.port);
  }
  // linkage
  fill(g, w - 3, 7, 2, 1, I.bolt);
  const og = outline(g);
  return { g: og, ax: Math.round(w / 2), ay: h - 2 };
}

function makeSide() {
  const g = blank(16, 12);
  fill(g, 1, 3, 10, 7, I.alMid);
  fill(g, 1, 3, 10, 1, I.alHi);
  shadeDisc(g, 12, 6, 3.2, I.chHi, I.ch, I.chMid);
  disc(g, 13, 6, 1.5, I.port);
  fill(g, 3, 5, 2, 3, I.port);
  fill(g, 7, 5, 2, 3, I.port);
  const og = outline(g);
  return { g: og, ax: 2, ay: 10 };
}

function makeItb() {
  const g = blank(7, 12);
  fill(g, 2, 5, 3, 6, I.chMid);
  fill(g, 2, 5, 3, 1, I.chHi);
  disc(g, 3, 3, 2.6, I.ch);
  disc(g, 3, 2, 2.2, I.chHi);
  disc(g, 3, 2, 1.2, I.port);
  plot(g, 1, 4, I.ch); plot(g, 5, 4, I.ch);
  const og = outline(g);
  return { g: og, ax: 3, ay: 11 };
}

function makeFilter(kind) {
  if (kind === 'perf') {
    const g = blank(14, 12);
    fill(g, 4, 2, 8, 8, I.red);
    fill(g, 4, 2, 8, 1, I.glow);
    fill(g, 4, 9, 8, 1, I.redLo);
    for (let x = 5; x < 11; x += 2) fill(g, x, 3, 1, 6, I.redLo);
    fill(g, 1, 4, 4, 4, I.chMid);
    disc(g, 2, 6, 1.2, I.port);
    const og = outline(g);
    return { g: og, ax: 12, ay: 6 };
  }
  const g = blank(16, 12);
  fill(g, 1, 2, 12, 8, I.rubMid);
  fill(g, 1, 2, 12, 1, I.rub);
  fill(g, 1, 9, 12, 1, I.rubLo);
  fill(g, 12, 4, 3, 4, I.alMid);
  if (kind === 'rest') fill(g, 2, 5, 10, 2, I.dirty);
  else fill(g, 3, 4, 8, 1, I.alLo);
  const og = outline(g);
  return { g: og, ax: 14, ay: 6 };
}

function makeIC(w, h) {
  // Authored at 2× and reduced, so the fin pitch survives nearest-neighbour downscale.
  const g = blank(w * 2, h * 2);
  fill(g, 2, 4, 8, h * 2 - 8, I.s);
  fill(g, 2, 4, 8, 2, I.sHi);
  fill(g, w * 2 - 10, 4, 8, h * 2 - 8, I.s);
  fill(g, w * 2 - 10, 4, 8, 2, I.sHi);
  fill(g, 8, 2, w * 2 - 16, h * 2 - 4, I.al);
  fill(g, 8, 2, w * 2 - 16, 2, I.alHi);
  for (let x = 12; x < w * 2 - 12; x += 4) fill(g, x, 4, 2, h * 2 - 8, I.fin);
  const og = outline(downscale(g, 2));
  return { g: og, ax: Math.round(w / 2), ay: Math.round(h / 2), inn: [2 - Math.round(w / 2), 0], out: [Math.round(w / 2) - 3, 0] };
}

function makeRad(w, h) {
  const g = blank(w, h);
  fill(g, 1, 2, w - 2, h - 4, I.alMid);
  fill(g, 1, 2, w - 2, 1, I.alHi);
  fill(g, 1, h - 3, w - 2, 1, I.alLo);
  fill(g, 0, 1, w, 2, I.c); // top tank
  fill(g, 0, h - 3, w, 2, I.cMid);
  for (let y = 5; y < h - 5; y += 2) fill(g, 2, y, w - 4, 1, I.fin);
  // fan opening
  disc(g, w / 2, h / 2 + 1, Math.min(w, h) * 0.28, I.port);
  const og = outline(g);
  return { g: og, ax: Math.round(w / 2), ay: Math.round(h / 2) };
}

function makeFan() {
  const d = 13;
  const frames = [];
  const c = 6;
  for (let f = 0; f < 4; f++) {
    const g = blank(d, d);
    ring(g, c, c, 5.2, 6.1, I.rub);
    const base = f * Math.PI / 8;
    for (let b = 0; b < 4; b++) {
      const a = base + b * Math.PI / 2;
      for (let t = 1.2; t < 5.4; t += 0.8) {
        plot(g, c + Math.cos(a) * t, c + Math.sin(a) * t, I.ironLo);
        plot(g, c + Math.cos(a) * t + Math.cos(a + 1.2), c + Math.sin(a) * t + Math.sin(a + 1.2) * 0.6, I.iron);
      }
    }
    disc(g, c, c, 1.4, I.bolt);
    frames.push(g);
  }
  return { frames, ax: c, ay: c };
}

function makeOil() {
  const g = blank(18, 8);
  fill(g, 1, 1, 16, 6, I.alMid);
  fill(g, 1, 1, 16, 1, I.alHi);
  for (let x = 3; x < 15; x += 2) fill(g, x, 2, 1, 4, I.fin);
  fill(g, 0, 3, 2, 2, I.cMid);
  fill(g, 16, 3, 2, 2, I.c);
  const og = outline(g);
  return { g: og, ax: 9, ay: 4 };
}

function makeNos(big) {
  const w = big ? 11 : 9, h = big ? 24 : 16;
  const g = blank(w, h);
  const cx = (w - 1) / 2;
  shadeDisc(g, cx, 4, 3, I.nHi, I.n, I.nMid);
  fill(g, 1, 4, w - 2, h - 6, I.n);
  fill(g, 1, 4, 1, h - 8, I.nHi);
  fill(g, w - 2, 6, 1, h - 10, I.nLo);
  fill(g, 2, Math.round(h * 0.45), w - 4, 3, I.label);
  fill(g, Math.round(cx) - 1, 1, 3, 3, I.ch);
  plot(g, cx, 0, I.redLo);
  const og = outline(g);
  return { g: og, ax: Math.round(cx), ay: h - 2 };
}

function makeAlt(w) {
  const h = w;
  const g = blank(w, h);
  shadeDisc(g, w / 2, h / 2, w / 2 - 1.2, I.alHi, I.alMid, I.alLo);
  for (let k = 0; k < 6; k++) {
    const a = k * Math.PI / 3;
    plot(g, w / 2 + Math.cos(a) * (w / 2 - 3), h / 2 + Math.sin(a) * (h / 2 - 3), I.ironDeep);
  }
  shadeDisc(g, 2, h / 2, 2.2, I.chHi, I.ch, I.chMid);
  disc(g, 2, h / 2, 0.8, I.belt);
  const og = outline(g);
  return { g: og, ax: Math.round(w / 2), ay: Math.round(h / 2) };
}

function makeHybrid(kind) {
  const w = kind === 'series' ? 20 : kind === 'ps' ? 18 : 16;
  const h = 12;
  const g = blank(w, h);
  fill(g, 2, 2, w - 4, 8, I.alMid);
  fill(g, 2, 2, w - 4, 1, I.alHi);
  fill(g, 2, 8, w - 4, 2, I.alLo);
  for (let x = 4; x < w - 4; x += 3) fill(g, x, 3, 1, 6, I.ironLo);
  shadeDisc(g, 2, 6, 2.4, I.chHi, I.ch, I.chMid);
  // orange cables
  fill(g, w - 5, 1, 2, 3, I.cable);
  fill(g, w - 3, 1, 2, 3, I.cableLo);
  if (kind === 'ps') fill(g, Math.round(w / 2) - 2, 4, 4, 4, I.ironDeep);
  if (kind === 'series') { fill(g, 6, 4, 3, 4, I.cable); fill(g, 10, 4, 3, 4, I.nMid); }
  const og = outline(g);
  return { g: og, ax: Math.round(w / 2), ay: 6 };
}

function pack(name, built, scaleNote) {
  const frames = built.frames ? built.frames : [built.g];
  const g0 = frames[0];
  return {
    name,
    w: g0[0].length,
    h: g0.length,
    ax: built.ax,
    ay: built.ay,
    hot: built.hot || null,
    out: built.out || null,
    inn: built.inn || null,
    frames: frames.map(rleFrame),
    grids: frames,
    scaleNote: scaleNote || null
  };
}

const sprites = [];
function add(name, built, note) { sprites.push(pack(name, built, note)); }

for (const [name, r] of [['turboS', 5], ['turboM', 7], ['turboL', 9]]) add(name, makeTurbo(r));
for (const [name, d] of [['wheelS', 5], ['wheelM', 7], ['wheelL', 9]]) {
  const frames = wheelFrames(d);
  add(name, { frames, ax: (d - 1) / 2, ay: (d - 1) / 2 });
}
for (const [name, r] of [['vgtS', 4], ['vgtM', 5], ['vgtL', 7]]) add(name, makeVgt(r));
add('roots', makeBlower('roots'));
add('screw', makeBlower('screw'));
add('centri', makeBlower('centri'));
add('carb1', makeCarb(1));
add('carb2', makeCarb(2));
add('carb4', makeCarb(4));
add('side', makeSide());
add('itb', makeItb());
add('filtBox', makeFilter('box'));
add('filtPerf', makeFilter('perf'));
add('filtRest', makeFilter('rest'));
add('icS', makeIC(22, 12), '2x-downscale');
add('icL', makeIC(36, 16), '2x-downscale');
add('radS', makeRad(12, 22));
add('radM', makeRad(14, 30));
add('radL', makeRad(16, 38));
add('fan', makeFan());
add('oil', makeOil());
add('nosS', makeNos(false));
add('nosL', makeNos(true));
add('altS', makeAlt(12));
add('altM', makeAlt(14));
add('altL', makeAlt(16));
add('hyP2', makeHybrid('p2'));
add('hyPS', makeHybrid('ps'));
add('hySer', makeHybrid('series'));

function emitJS() {
  const lines = [];
  lines.push('// Generated by tools/engine-art.mjs — do not edit.');
  lines.push('// Palette-index sprites for the ENGINE tab picture. 0 is empty. Each row is [index, count] runs.');
  lines.push('// Frames spin (compressor, fan). hot/out/inn are pixel offsets from the anchor.');
  lines.push('const ENG_SPRITES={');
  for (const s of sprites) {
    const meta = [`w:${s.w}`, `h:${s.h}`, `ax:${s.ax}`, `ay:${s.ay}`];
    if (s.hot) meta.push(`hot:[${s.hot.join(',')}]`);
    if (s.out) meta.push(`out:[${s.out.join(',')}]`);
    if (s.inn) meta.push(`inn:[${s.inn.join(',')}]`);
    const frames = s.frames.map(rows => '[' + rows.map(r => '[' + r.map(run => '[' + run.join(',') + ']').join(',') + ']').join(',') + ']');
    lines.push(`${s.name}:{${meta.join(',')},frames:[${frames.join(',')}]},`);
  }
  lines.push('};');
  return lines.join('\n') + '\n';
}

function pngOf(g) {
  const h = g.length, w = g[0].length;
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    const o = y * (w * 4 + 1);
    raw[o] = 0;
    for (let x = 0; x < w; x++) {
      const i = g[y][x];
      const p = o + 1 + x * 4;
      if (!i) { raw[p + 3] = 0; continue; }
      const hex = ENG_PAL[i];
      const n = parseInt(hex.slice(1), 16);
      raw[p] = (n >> 16) & 255; raw[p + 1] = (n >> 8) & 255; raw[p + 2] = n & 255; raw[p + 3] = 255;
    }
  }
  const z = deflateSync(raw);
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
    const td = Buffer.concat([Buffer.from(type), data]);
    const c = Buffer.alloc(4); c.writeUInt32BE(crc32(td) >>> 0, 0);
    return Buffer.concat([len, td, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr), chunk('IDAT', z), chunk('IEND', Buffer.alloc(0))
  ]);
}

const js = emitJS();
if (check) {
  const cur = readFileSync(OUT_JS, 'utf8');
  if (cur !== js) {
    console.error('FAIL: src/js/engine-art-data.js is not what tools/engine-art.mjs emits. Re-run it.');
    process.exit(1);
  }
  console.log(`OK: engine-art-data.js matches (${sprites.length} sprites).`);
} else {
  mkdirSync(OUT_PNG, { recursive: true });
  writeFileSync(OUT_JS, js);
  let pngs = 0;
  for (const s of sprites) {
    s.grids.forEach((g, i) => {
      const file = s.grids.length > 1 ? `${s.name}-${i}.png` : `${s.name}.png`;
      writeFileSync(path.join(OUT_PNG, file), pngOf(g));
      pngs++;
    });
  }
  console.log(`  ${sprites.length} sprites, ${pngs} pngs, ${(Buffer.byteLength(js) / 1024).toFixed(1)} KB js`);
}
