#!/usr/bin/env node
/**
 * Validate level background MP4s under public/assets/video/.
 * Writes manifest.json for runtime probing. Optionally generates ffmpeg placeholders.
 *
 * Usage:
 *   node scripts/validate-video-assets.mjs           # check + write manifest
 *   node scripts/validate-video-assets.mjs --placeholders  # generate missing via ffmpeg
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const VIDEO_DIR = path.join(ROOT, 'public', 'assets', 'video');
const MANIFEST_PATH = path.join(VIDEO_DIR, 'manifest.json');
const LEVEL_COUNT = 15;
const GENERATE_PLACEHOLDERS = process.argv.includes('--placeholders');

function hasFfmpeg() {
  const r = spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' });
  return r.status === 0;
}

function placeholderColor(index) {
  const hues = [0x1a0a3a, 0x0033cc, 0x00cccc, 0x00cc00, 0xcccc00, 0xcc6600, 0xcc0000];
  return hues[(index - 1) % hues.length];
}

function generatePlaceholder(index) {
  const out = path.join(VIDEO_DIR, `bg${index}.mp4`);
  const color = placeholderColor(index);
  const hex = color.toString(16).padStart(6, '0');
  const args = [
    '-y', '-f', 'lavfi', '-i', `color=c=0x${hex}:s=720x1280:d=10`,
    '-c:v', 'libx264', '-t', '10', '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart', '-b:v', '800k', out,
  ];
  console.log(`[video-validate] generating ${path.basename(out)}`);
  const r = spawnSync('ffmpeg', args, { stdio: 'inherit' });
  return r.status === 0;
}

function ensureDir() {
  fs.mkdirSync(VIDEO_DIR, { recursive: true });
}

function listPresent() {
  const files = [];
  for (let i = 1; i <= LEVEL_COUNT; i++) {
    const name = `bg${i}.mp4`;
    if (fs.existsSync(path.join(VIDEO_DIR, name))) {
      files.push(name);
    }
  }
  return files;
}

function writeManifest(files, generated) {
  const manifest = {
    version: 1,
    basePath: './assets/video/',
    files,
    generated,
    builtAt: new Date().toISOString(),
  };
  fs.writeFileSync(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`[video-validate] wrote ${path.relative(ROOT, MANIFEST_PATH)} (${files.length} clips)`);
}

function main() {
  ensureDir();
  let generated = false;

  if (GENERATE_PLACEHOLDERS) {
    if (!hasFfmpeg()) {
      console.warn('[video-validate] ffmpeg not found — skipping placeholder generation');
    } else {
      for (let i = 1; i <= LEVEL_COUNT; i++) {
        const target = path.join(VIDEO_DIR, `bg${i}.mp4`);
        if (!fs.existsSync(target)) {
          if (generatePlaceholder(i)) generated = true;
        }
      }
    }
  }

  const files = listPresent();
  writeManifest(files, generated);

  const missing = [];
  for (let i = 1; i <= LEVEL_COUNT; i++) {
    if (!files.includes(`bg${i}.mp4`)) missing.push(`bg${i}.mp4`);
  }

  if (missing.length === LEVEL_COUNT) {
    console.log('[video-validate] no MP4s present — game uses procedural GPU backgrounds (OK for CI/clones)');
    process.exit(0);
  }

  if (missing.length > 0) {
    console.log(`[video-validate] partial set: missing ${missing.join(', ')}`);
    console.log('[video-validate] missing levels reuse bg1.mp4 at runtime when available');
  } else {
    console.log('[video-validate] full set bg1–bg15 present');
  }

  process.exit(0);
}

main();
