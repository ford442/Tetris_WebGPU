#!/usr/bin/env node
/**
 * Generate PWA icons (192 / 512 / maskable) into public/icons/.
 * Uses ImageMagick `convert` when available; skips cleanly otherwise.
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'public', 'icons');

function hasConvert() {
  return spawnSync('convert', ['-version'], { stdio: 'ignore' }).status === 0;
}

function runConvert(args) {
  const r = spawnSync('convert', args, { stdio: 'inherit' });
  return r.status === 0;
}

function main() {
  fs.mkdirSync(OUT, { recursive: true });

  if (!hasConvert()) {
    console.warn('[pwa-icons] ImageMagick convert not found — skip icon generation');
    process.exit(0);
  }

  const bg = '#1a0a3a';
  const fg = '#8cf0ff';

  const sizes = [
    { name: 'icon-192.png', size: 192, maskable: false },
    { name: 'icon-512.png', size: 512, maskable: false },
    { name: 'icon-maskable-512.png', size: 512, maskable: true },
  ];

  for (const { name, size, maskable } of sizes) {
    const out = path.join(OUT, name);
    const pad = maskable ? Math.floor(size * 0.1) : 0;
    const inner = size - pad * 2;
    const ok = runConvert([
      '-size', `${size}x${size}`,
      `xc:${bg}`,
      '-fill', fg,
      '-gravity', 'center',
      '-font', 'DejaVu-Sans-Bold',
      '-pointsize', String(Math.floor(inner * 0.45)),
      '-annotate', '0', 'T',
      ...(maskable ? ['-bordercolor', bg, '-border', `${pad}x${pad}`] : []),
      out,
    ]);
    if (!ok) {
      console.warn(`[pwa-icons] failed to write ${name}`);
      process.exit(1);
    }
    console.log(`[pwa-icons] wrote ${path.relative(ROOT, out)}`);
  }
}

main();
