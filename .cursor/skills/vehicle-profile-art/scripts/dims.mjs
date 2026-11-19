#!/usr/bin/env node
// Read PNG / WebP pixel size without ffmpeg (CI has none).
import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';

export function readDims(file) {
  const b = fs.readFileSync(file);
  if (b.length >= 24 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) {
    return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
  }
  if (b.length >= 16 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP') {
    let i = 12;
    while (i + 8 <= b.length) {
      const tag = b.toString('ascii', i, i + 4);
      const size = b.readUInt32LE(i + 4);
      const data = i + 8;
      if (tag === 'VP8X' && size >= 10) {
        const w = 1 + (b[data + 4] | (b[data + 5] << 8) | (b[data + 6] << 16));
        const h = 1 + (b[data + 7] | (b[data + 8] << 8) | (b[data + 9] << 16));
        return { w, h };
      }
      if (tag === 'VP8 ' && size >= 10) {
        // lossy bitstream: 3-byte frame tag, then 0x9d 0x01 0x2a, then 16-bit w/h
        const w = b.readUInt16LE(data + 6) & 0x3fff;
        const h = b.readUInt16LE(data + 8) & 0x3fff;
        return { w, h };
      }
      if (tag === 'VP8L' && size >= 5) {
        const bits = b[data + 1] | (b[data + 2] << 8) | (b[data + 3] << 16) | (b[data + 4] << 24);
        return { w: (bits & 0x3fff) + 1, h: ((bits >> 14) & 0x3fff) + 1 };
      }
      i += 8 + size + (size & 1);
    }
  }
  return { w: 0, h: 0 };
}

const isCli = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isCli) {
  const file = process.argv[2];
  if (!file) {
    console.error('Usage: node dims.mjs <png|webp>');
    process.exit(2);
  }
  const { w, h } = readDims(file);
  if (!w || !h) {
    console.error('could not read size: ' + file);
    process.exit(1);
  }
  console.log(w + 'x' + h);
}
