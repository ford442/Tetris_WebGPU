#!/usr/bin/env node
/**
 * Tolerant Emscripten build for the C++ Tetris renderer.
 * Exits 0 when emcc is missing so CI / npm test keep working.
 *
 * Environment:
 *   TETRIS_CPP_WEBGPU=auto|emdawn|legacy|none  — WebGPU port selection (default: auto)
 *   TETRIS_CPP_NO_LTO=1                        — disable -flto on release builds
 *   TETRIS_CPP_SANITIZE=1                      — debug: -fsanitize=address,undefined (local only)
 *
 * WebGPU port selection (TETRIS_CPP_WEBGPU=auto):
 *   1. --use-port=emdawnwebgpu  (current Dawn webgpu.h port; needs emsdk 4.0.10+; pinned emsdk is 5.0.7)
 *   2. -s USE_WEBGPU=1          (legacy; removed upstream around the emsdk 5.0 line)
 *   3. (none)                   Canvas2D bootstrap only — gpu_renderer.cpp stubs
 *
 * Pinned emsdk: see .emsdk-version (documented in cpp/README.md).
 *
 * Outputs:
 *   public/cpp/tetris_renderer.{js,wasm}
 *   public/cpp/build-info.json
 *   build/cpp/compile_commands.json  (+ cpp/compile_commands.json mirror for clangd)
 */

import { spawnSync } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const MODE = (process.argv[2] || 'release').toLowerCase();
const OUT_PUBLIC = join(ROOT, 'public', 'cpp');
const OUT_BUILD = join(ROOT, 'build', 'cpp');
const OUT_JS = join(OUT_PUBLIC, 'tetris_renderer.js');
const COMPILE_COMMANDS = join(OUT_BUILD, 'compile_commands.json');
const COMPILE_COMMANDS_CPP = join(ROOT, 'cpp', 'compile_commands.json');
const BUILD_INFO_PUBLIC = join(OUT_PUBLIC, 'build-info.json');
const BUILD_INFO_MIRROR = join(OUT_BUILD, 'build-info.json');
const EMSDK_VERSION_FILE = join(ROOT, '.emsdk-version');

const WEBGPU_ENV = (process.env.TETRIS_CPP_WEBGPU || 'auto').toLowerCase();

const SOURCES = [
  join(ROOT, 'cpp', 'src', 'renderer.cpp'),
  join(ROOT, 'cpp', 'src', 'playfield_draw.cpp'),
  join(ROOT, 'cpp', 'src', 'gpu_renderer.cpp'),
];

const EXPORTED_FUNCTIONS = [
  '_init_renderer',
  '_resize_renderer',
  '_render_frame',
  '_update_playfield',
  '_get_playfield_ptr',
  '_get_playfield_len',
  '_get_piece_state_ptr',
  '_update_piece_state',
  '_get_renderer_backend',
  '_is_gpu_renderer_active',
  '_is_canvas_fallback_active',
  '_set_block_texture_rgba',
  '_malloc',
  '_free',
];

const PORT_LABELS = {
  USE_WEBGPU: 'USE_WEBGPU (legacy -s USE_WEBGPU=1)',
  EMDAWN: 'emdawnwebgpu (--use-port=emdawnwebgpu)',
  NONE: 'canvas2d-only (no WebGPU port linked)',
};

function readPinnedEmsdkVersion() {
  if (!existsSync(EMSDK_VERSION_FILE)) return null;
  const line = readFileSync(EMSDK_VERSION_FILE, 'utf8').trim().split('\n')[0].trim();
  return line || null;
}

function hasEmcc() {
  const probe = spawnSync('emcc', ['--version'], { encoding: 'utf8' });
  return probe.status === 0;
}

function getEmccVersion() {
  const probe = spawnSync('emcc', ['--version'], { encoding: 'utf8' });
  if (probe.status !== 0) return null;
  const firstLine = (probe.stdout || '').split('\n')[0] || '';
  const match = firstLine.match(/(\d+\.\d+\.\d+)/);
  return match ? match[1] : firstLine.trim();
}

function getOptFlags() {
  if (MODE === 'debug') {
    const flags = ['-O0', '-g', '-s', 'ASSERTIONS=2', '-s', 'SAFE_HEAP=1'];
    if (process.env.TETRIS_CPP_SANITIZE === '1') {
      flags.push('-fsanitize=address', '-fsanitize=undefined');
    }
    return flags;
  }

  const flags = ['-O3'];
  if (process.env.TETRIS_CPP_NO_LTO !== '1') {
    flags.push('-flto');
  }
  return flags;
}

function getCompileOnlyFlags() {
  const flags = getOptFlags();
  const compile = [];
  for (let i = 0; i < flags.length; i++) {
    if (flags[i] === '-s') {
      i += 1;
      continue;
    }
    compile.push(flags[i]);
  }
  return compile;
}

function resolveWebGpuAttempts() {
  switch (WEBGPU_ENV) {
    case 'emdawn':
      return ['EMDAWN', 'NONE'];
    case 'legacy':
      return ['USE_WEBGPU', 'NONE'];
    case 'none':
      return ['NONE'];
    case 'auto':
    default:
      return ['EMDAWN', 'USE_WEBGPU', 'NONE'];
  }
}

function webGpuArgs(useWebGpuFlag) {
  if (useWebGpuFlag === 'USE_WEBGPU') {
    return ['-s', 'USE_WEBGPU=1', '-DTETRIS_ENABLE_WEBGPU=1'];
  }
  if (useWebGpuFlag === 'EMDAWN') {
    return ['--use-port=emdawnwebgpu', '-DTETRIS_ENABLE_WEBGPU=1'];
  }
  return [];
}

function runEmcc(useWebGpuFlag) {
  const args = [
    ...SOURCES,
    ...getOptFlags(),
    '-I', join(ROOT, 'cpp', 'src'),
    '-o', OUT_JS,
    '-s', 'MODULARIZE=1',
    '-s', 'EXPORT_NAME=createTetrisRendererModule',
    '-s', 'ENVIRONMENT=web',
    '-s', 'ALLOW_MEMORY_GROWTH=1',
    '-s', `EXPORTED_FUNCTIONS=${JSON.stringify(EXPORTED_FUNCTIONS)}`,
    '-s', 'EXPORTED_RUNTIME_METHODS=["ccall","cwrap","HEAP8","HEAPU8"]',
    ...webGpuArgs(useWebGpuFlag),
  ];

  return spawnSync('emcc', args, { encoding: 'utf8', stdio: 'pipe' });
}

function isWebGpuPortError(output) {
  const err = output || '';
  return err.includes('USE_WEBGPU') || err.includes('use-port=emdawnwebgpu') || err.includes('emdawnwebgpu');
}

function normalizeCompileCommands(raw) {
  const trimmed = raw.trim().replace(/,\s*$/, '');
  if (!trimmed) return [];
  const jsonText = trimmed.startsWith('[') ? trimmed : `[${trimmed}]`;
  const entries = JSON.parse(jsonText);
  return entries.map((entry) => {
    const normalized = { ...entry, directory: ROOT };
    if (normalized.file && !normalized.file.startsWith('/')) {
      normalized.file = join(ROOT, normalized.file);
    }
    if (normalized.output && !normalized.output.startsWith('/')) {
      normalized.output = join(ROOT, normalized.output);
    }
    return normalized;
  });
}

function emitCompileCommands(linkedPort) {
  mkdirSync(OUT_BUILD, { recursive: true });
  if (existsSync(COMPILE_COMMANDS)) unlinkSync(COMPILE_COMMANDS);

  const compileFlags = getCompileOnlyFlags();
  const portArgs = webGpuArgs(linkedPort);
  let merged = [];

  for (const src of SOURCES) {
    const base = src.split('/').pop().replace('.cpp', '.o');
    const objPath = join(OUT_BUILD, base);
    const args = [
      src,
      '-c',
      ...compileFlags,
      '-I', join(ROOT, 'cpp', 'src'),
      ...portArgs,
      '-MJ', COMPILE_COMMANDS,
      '-o', objPath,
    ];

    const result = spawnSync('emcc', args, { encoding: 'utf8', stdio: 'pipe' });
    if (result.status !== 0) {
      console.warn('[build-cpp] compile_commands emission failed for', src);
      console.warn(result.stderr || result.stdout || '');
      return false;
    }

    if (existsSync(COMPILE_COMMANDS)) {
      const chunk = readFileSync(COMPILE_COMMANDS, 'utf8');
      merged = merged.concat(normalizeCompileCommands(chunk));
      unlinkSync(COMPILE_COMMANDS);
    }
  }

  const payload = `${JSON.stringify(merged, null, 2)}\n`;
  writeFileSync(COMPILE_COMMANDS, payload);
  writeFileSync(COMPILE_COMMANDS_CPP, payload);
  console.log(`[build-cpp] Wrote ${COMPILE_COMMANDS}`);
  return true;
}

function writeBuildInfo(linkedPort) {
  const pinned = readPinnedEmsdkVersion();
  const emccVersion = getEmccVersion();
  const wasmPublic = join(OUT_PUBLIC, 'tetris_renderer.wasm');
  const wasmBytes = existsSync(wasmPublic) ? readFileSync(wasmPublic).byteLength : null;
  const jsBytes = existsSync(OUT_JS) ? readFileSync(OUT_JS).byteLength : null;
  const info = {
    mode: MODE,
    builtAt: new Date().toISOString(),
    emccVersion,
    pinnedEmsdkVersion: pinned,
    webGpuBackend: PORT_LABELS[linkedPort] || linkedPort,
    webGpuBackendId: linkedPort.toLowerCase(),
    webGpuEnv: WEBGPU_ENV,
    optFlags: getOptFlags(),
    sources: SOURCES.map((s) => s.replace(`${ROOT}/`, '')),
    wasmBytes,
    jsBytes,
  };

  const payload = `${JSON.stringify(info, null, 2)}\n`;
  writeFileSync(BUILD_INFO_PUBLIC, payload);
  writeFileSync(BUILD_INFO_MIRROR, payload);
  console.log(`[build-cpp] Wrote ${BUILD_INFO_PUBLIC}`);
  return info;
}

const DEFAULT_WASM_BUDGET_BYTES = 256 * 1024;

function getWasmBudgetBytes() {
  const raw = process.env.TETRIS_CPP_WASM_BUDGET_BYTES;
  if (!raw) return DEFAULT_WASM_BUDGET_BYTES;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_WASM_BUDGET_BYTES;
}

/**
 * Guardrail against accidental release bloat. Debug builds (-O0 -g,
 * ASSERTIONS=2) are exempt — only release wasm is budgeted.
 */
function enforceWasmSizeBudget(info) {
  if (MODE !== 'release') return;
  if (typeof info.wasmBytes !== 'number') {
    console.error('[build-cpp] release build produced no wasmBytes in build-info.json — failing.');
    process.exit(1);
  }

  const budget = getWasmBudgetBytes();
  if (info.wasmBytes > budget) {
    console.error(
      `[build-cpp] release tetris_renderer.wasm is ${info.wasmBytes} bytes, ` +
      `over the ${budget} byte budget. If this growth is intentional, raise ` +
      'TETRIS_CPP_WASM_BUDGET_BYTES in this PR with a comment explaining why.'
    );
    process.exit(1);
  }
}

function mirrorArtifacts() {
  mkdirSync(OUT_BUILD, { recursive: true });
  copyFileSync(OUT_JS, join(OUT_BUILD, 'tetris_renderer.js'));
  const wasmPublic = join(OUT_PUBLIC, 'tetris_renderer.wasm');
  if (existsSync(wasmPublic)) {
    copyFileSync(wasmPublic, join(OUT_BUILD, 'tetris_renderer.wasm'));
  }
  if (existsSync(BUILD_INFO_PUBLIC)) {
    copyFileSync(BUILD_INFO_PUBLIC, BUILD_INFO_MIRROR);
  }
}

function warnEmsdkDrift() {
  const pinned = readPinnedEmsdkVersion();
  const emccVersion = getEmccVersion();
  if (!pinned || !emccVersion) return;

  const pinnedMajorMinor = pinned.split('.').slice(0, 2).join('.');
  const activeMajorMinor = emccVersion.split('.').slice(0, 2).join('.');
  if (pinnedMajorMinor !== activeMajorMinor) {
    console.warn(
      `[build-cpp] emsdk drift: active emcc ${emccVersion}, pinned .emsdk-version is ${pinned}. ` +
      'Run: cd emsdk && ./emsdk install ' + pinned + ' && ./emsdk activate ' + pinned
    );
  }
}

function buildLinkedPort() {
  const attempts = resolveWebGpuAttempts();
  let linkedPort = attempts[attempts.length - 1];
  let result = { status: 1, stderr: '', stdout: '' };

  for (let i = 0; i < attempts.length; i++) {
    const attempt = attempts[i];
    if (i > 0) {
      console.warn(`[build-cpp] retrying with ${PORT_LABELS[attempt] || attempt}`);
    }
    result = runEmcc(attempt);
    if (result.status === 0) {
      linkedPort = attempt;
      break;
    }

    const err = `${result.stderr || ''}${result.stdout || ''}`;
    const hasNext = i < attempts.length - 1;
    if (!hasNext) break;

    if (attempt === 'USE_WEBGPU' && isWebGpuPortError(err)) {
      console.warn('[build-cpp] -s USE_WEBGPU=1 unavailable on this emsdk; trying next port');
      continue;
    }
    if (attempt === 'EMDAWN' && isWebGpuPortError(err)) {
      console.warn('[build-cpp] --use-port=emdawnwebgpu failed; trying Canvas2D-only build');
      continue;
    }
    if (WEBGPU_ENV !== 'auto') {
      console.warn('[build-cpp] explicit TETRIS_CPP_WEBGPU=' + WEBGPU_ENV + ' failed; trying fallback');
      continue;
    }
    break;
  }

  if (result.status !== 0 && linkedPort !== 'NONE' && !attempts.includes('NONE')) {
    console.warn('[build-cpp] WebGPU ports failed; building Canvas2D bootstrap only.');
    result = runEmcc('NONE');
    if (result.status === 0) linkedPort = 'NONE';
  }

  return { result, linkedPort };
}

function main() {
  mkdirSync(OUT_PUBLIC, { recursive: true });

  if (!hasEmcc()) {
    console.log('[build-cpp] emcc not found — skipping C++ renderer build (TS fallbacks remain available).');
    console.log('[build-cpp] Linked WebGPU port: (skipped — no emcc)');
    console.log(`[build-cpp] Pinned emsdk (when installed): ${readPinnedEmsdkVersion() || '(none)'}`);
    process.exit(0);
  }

  warnEmsdkDrift();
  console.log(`[build-cpp] Building ${MODE} → ${OUT_JS}`);
  console.log(`[build-cpp] TETRIS_CPP_WEBGPU=${WEBGPU_ENV}`);
  console.log(`[build-cpp] Flags: ${getOptFlags().join(' ')}`);

  const { result, linkedPort } = buildLinkedPort();

  if (result.status !== 0) {
    console.error(result.stderr || result.stdout || '[build-cpp] emcc failed');
    process.exit(result.status ?? 1);
  }

  emitCompileCommands(linkedPort);
  const info = writeBuildInfo(linkedPort);
  mirrorArtifacts();

  console.log(`[build-cpp] Linked WebGPU port: ${PORT_LABELS[linkedPort] || linkedPort}`);
  console.log('[build-cpp] Wrote public/cpp/tetris_renderer.js (+ wasm)');

  enforceWasmSizeBudget(info);
}

main();
