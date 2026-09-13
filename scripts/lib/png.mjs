/**
 * Minimal PNG reader — just enough to gate the authored material maps in CI.
 *
 * Deliberately dependency-free: the block material contract must be checkable in a
 * plain `npm run build` with no optional image library installed (and the PNG path
 * stays canonical even when the KTX2 tooling is absent). Supports what a browser
 * canvas actually exports: 8-bit, non-interlaced, colour type 2 (RGB) or 6 (RGBA).
 */

import { inflateSync } from 'node:zlib';
import { readFileSync } from 'node:fs';

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** Read width/height/bitDepth/colorType without decoding pixel data. */
export function readPngHeader(buffer) {
  if (buffer.length < 24 || !buffer.subarray(0, 8).equals(PNG_SIGNATURE)) {
    throw new Error('not a PNG file');
  }
  if (buffer.toString('ascii', 12, 16) !== 'IHDR') {
    throw new Error('PNG is missing its IHDR chunk');
  }
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
    bitDepth: buffer[24],
    colorType: buffer[25],
    interlace: buffer[28],
  };
}

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  return pb <= pc ? b : c;
}

/** Decode to a tightly packed RGBA byte array (alpha 255 when the PNG has none). */
export function decodePngRgba(buffer) {
  const header = readPngHeader(buffer);
  if (header.bitDepth !== 8) throw new Error(`unsupported PNG bit depth ${header.bitDepth}`);
  if (header.interlace !== 0) throw new Error('interlaced PNGs are not supported');
  const channels = header.colorType === 6 ? 4 : header.colorType === 2 ? 3 : 0;
  if (!channels) throw new Error(`unsupported PNG colour type ${header.colorType}`);

  const idat = [];
  let offset = 8;
  while (offset + 8 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    const start = offset + 8;
    if (type === 'IDAT') idat.push(buffer.subarray(start, start + length));
    if (type === 'IEND') break;
    offset = start + length + 4; // skip CRC
  }
  if (!idat.length) throw new Error('PNG has no IDAT chunks');

  const raw = inflateSync(Buffer.concat(idat));
  const { width, height } = header;
  const stride = width * channels;
  const out = new Uint8Array(width * height * 4);
  let prev = Buffer.alloc(stride);

  for (let y = 0; y < height; y++) {
    const rowStart = y * (stride + 1);
    const filter = raw[rowStart];
    const row = Buffer.from(raw.subarray(rowStart + 1, rowStart + 1 + stride));

    for (let i = 0; i < stride; i++) {
      const a = i >= channels ? row[i - channels] : 0;
      const b = prev[i];
      const c = i >= channels ? prev[i - channels] : 0;
      switch (filter) {
        case 0: break;
        case 1: row[i] = (row[i] + a) & 0xff; break;
        case 2: row[i] = (row[i] + b) & 0xff; break;
        case 3: row[i] = (row[i] + ((a + b) >> 1)) & 0xff; break;
        case 4: row[i] = (row[i] + paeth(a, b, c)) & 0xff; break;
        default: throw new Error(`unsupported PNG row filter ${filter}`);
      }
    }

    for (let x = 0; x < width; x++) {
      const src = x * channels;
      const dst = (y * width + x) * 4;
      out[dst + 0] = row[src + 0];
      out[dst + 1] = row[src + 1];
      out[dst + 2] = row[src + 2];
      out[dst + 3] = channels === 4 ? row[src + 3] : 255;
    }
    prev = row;
  }

  return { ...header, data: out };
}

export function readPng(path) {
  return decodePngRgba(readFileSync(path));
}

export function readPngSize(path) {
  return readPngHeader(readFileSync(path));
}
