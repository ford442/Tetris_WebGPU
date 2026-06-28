#!/usr/bin/env node
/**
 * Tolerant Emscripten build for the C++ Tetris renderer.
 * Exits 0 when emcc is missing so CI / npm test keep working.
 */

import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const MODE = (process.argv[2] || 'release').toLowerCase();
const OUT_PUBLIC = join(ROOT, 'public', 'cpp');
const OUT_BUILD = join(ROOT, 'build', 'cpp');
const OUT_JS = join(OUT_PUBLIC, 'tetris_renderer.js');

const SOURCES = [
  join(ROOT, 'cpp', 'src', 'renderer.cpp'),
  join(ROOT, 'cpp', 'src', 'playfield_draw.cpp'),
];

const EXPORTED_FUNCTIONS = [
  '_init_renderer',
  '_resize_renderer',
  '_render_frame',
  '_update_playfield',
  '_get_playfield_ptr',
  '_get_playfield_len',
  '_malloc',
  '_free',
];

function hasEmcc() {
  const probe = spawnSync('emcc', ['--version'], { encoding: 'utf8' });
  return probe.status === 0;
}

function runEmcc(useWebGpuFlag) {
  const optFlags = MODE === 'debug' ? ['-O0', '-g', '-s', 'ASSERTIONS=2'] : ['-O2'];

  const args = [
    ...SOURCES,
    ...optFlags,
    '-I', join(ROOT, 'cpp', 'src'),
    '-o', OUT_JS,
    '-s', 'MODULARIZE=1',
    '-s', 'EXPORT_NAME=createTetrisRendererModule',
    '-s', 'ENVIRONMENT=web',
    '-s', 'ALLOW_MEMORY_GROWTH=1',
    '-s', `EXPORTED_FUNCTIONS=${JSON.stringify(EXPORTED_FUNCTIONS)}`,
    '-s', 'EXPORTED_RUNTIME_METHODS=["ccall","cwrap","HEAP8","HEAPU8"]',
  ];

  if (useWebGpuFlag === 'USE_WEBGPU') {
    args.push('-s', 'USE_WEBGPU=1');
  } else if (useWebGpuFlag === 'EMDAWN') {
    args.push('--use-port=emdawnwebgpu');
  }

  return spawnSync('emcc', args, { encoding: 'utf8', stdio: 'pipe' });
}

function mirrorArtifacts() {
  mkdirSync(OUT_BUILD, { recursive: true });
  copyFileSync(OUT_JS, join(OUT_BUILD, 'tetris_renderer.js'));
  const wasmPublic = join(OUT_PUBLIC, 'tetris_renderer.wasm');
  if (existsSync(wasmPublic)) {
    copyFileSync(wasmPublic, join(OUT_BUILD, 'tetris_renderer.wasm'));
  }
}

function main() {
  mkdirSync(OUT_PUBLIC, { recursive: true });

  if (!hasEmcc()) {
    console.log('[build-cpp] emcc not found — skipping C++ renderer build (TS fallbacks remain available).');
    process.exit(0);
  }

  console.log(`[build-cpp] Building ${MODE} → ${OUT_JS}`);

  let result = runEmcc('USE_WEBGPU');
  if (result.status !== 0) {
    const err = `${result.stderr || ''}${result.stdout || ''}`;
    if (err.includes('USE_WEBGPU') || err.includes('use-port=emdawnwebgpu')) {
      console.warn('[build-cpp] -s USE_WEBGPU=1 unavailable on this emsdk; retrying with --use-port=emdawnwebgpu');
      result = runEmcc('EMDAWN');
    }
  }

  if (result.status !== 0) {
    console.warn('[build-cpp] emcc failed without WebGPU flags; building Canvas2D bootstrap only.');
    result = runEmcc('NONE');
  }

  if (result.status !== 0) {
    console.error(result.stderr || result.stdout || '[build-cpp] emcc failed');
    process.exit(result.status ?? 1);
  }

  mirrorArtifacts();
  console.log('[build-cpp] Wrote public/cpp/tetris_renderer.js (+ wasm)');
}

main();
