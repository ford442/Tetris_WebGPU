#!/usr/bin/env node
/**
 * Emscripten build for the C++ Tetris renderer.
 * Exits 0 when emcc is missing so a fresh clone / `npm run build:all` keeps working
 * (set TETRIS_CPP_REQUIRE_EMCC=1 — CI does — to make a missing emcc an error).
 *
 * Environment:
 *   TETRIS_CPP_WEBGPU=auto|emdawn|legacy|none  — WebGPU port selection (default: auto)
 *   TETRIS_CPP_REQUIRE_EMCC=1                  — exit 1 instead of skipping when emcc is absent
 *   TETRIS_CPP_NO_LTO=1                        — disable -flto on release builds
 *   TETRIS_CPP_SIMD=1                          — release experiment: add -msimd128 (off until a browser matrix confirms it)
 *   CI=1|true                                  — add -Werror (warnings are -Wall -Wextra -Wpedantic everywhere)
 *   TETRIS_CPP_SANITIZE=1                      — debug: -fsanitize=address,undefined (local only)
 *
 * WebGPU port selection (TETRIS_CPP_WEBGPU=auto):
 *   1. --use-port=emdawnwebgpu  (current Dawn webgpu.h port; needs emsdk 4.0.10+; pinned emsdk is 5.0.7)
 *   2. -s USE_WEBGPU=1          (legacy; removed upstream around the emsdk 5.0 line)
 *   3. (none)                   Canvas2D bootstrap only — gpu_renderer.cpp stubs
 *
 * A RELEASE build never ends in step 3 on its own: a Canvas2D-only module cannot boot
 * (the TS loader hard-fails on it), so if no WebGPU port links the build exits non-zero.
 * Only TETRIS_CPP_WEBGPU=none opts into a Canvas2D-only release. Debug builds still
 * fall back to step 3, with a loud warning.
 *
 * Sources, flags, exports and the size budget live in cpp/build.config.json — the one place
 * both this script and cpp/CMakeLists.txt read. Do not hand-copy them here.
 *
 * Pinned emsdk: see .emsdk-version (documented in cpp/README.md).
 *
 * Outputs:
 *   public/cpp/tetris_renderer.{js,wasm}
 *   public/cpp/build-info.json  (COMMITTED provenance: emcc version, port, flags, source
 *     hash, artifact sha256 — verified by scripts/verify-cpp-artifact.mjs; no timestamps)
 *   build/cpp/compile_commands.json  (+ cpp/compile_commands.json mirror for clangd)
 *   cpp/src/generated/shader_sources.h  (embedded cpp/src/shaders/**\/*.wgsl plus
 *     the WGSL shared with the TS renderer — via scripts/generate-cpp-shaders.mjs,
 *     runs even without emcc)
 *   cpp/src/generated/authored_block_uniforms.h  (block uniform struct generated
 *     from shared/authoredBlockUniforms.json — via scripts/generate-cpp-uniforms.mjs,
 *     and the authored material constants from public/block-material.json — via
 *     scripts/generate-cpp-material.mjs)
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

import {
  codegenCompileFlags,
  enabledOptionalFlags,
  linkFlags as buildLinkFlags,
  loadBuildConfig,
  warningFlags,
} from './lib/cppBuildConfig.mjs';
import {
  BUILD_INFO_SCHEMA_VERSION,
  computeSourceHash,
  describeArtifacts,
} from './lib/cppProvenance.mjs';

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

const CONFIG = loadBuildConfig(ROOT);

const SOURCES = CONFIG.sources.map((rel) => join(ROOT, 'cpp', rel));
const INCLUDE_DIRS = CONFIG.includeDirs.flatMap((rel) => ['-I', join(ROOT, 'cpp', rel)]);

const PORT_LABELS = Object.fromEntries(
  Object.entries(CONFIG.webgpuPorts)
    .filter(([key]) => !key.startsWith('$'))
    .map(([key, port]) => [key, port.label]),
);

function readPinnedEmsdkVersion() {
  if (!existsSync(EMSDK_VERSION_FILE)) return null;
  const line = readFileSync(EMSDK_VERSION_FILE, 'utf8').trim().split('\n')[0].trim();
  return line || null;
}

/** Major version of a dotted semver string (e.g. "5.0.7" → 5). */
function semverMajor(version) {
  const match = version?.match(/^(\d+)/);
  return match ? Number.parseInt(match[1], 10) : null;
}

/**
 * Legacy `-s USE_WEBGPU=1` was removed upstream around the emsdk 5.0 line.
 * When the repo pin is ≥ 5.0, `auto` should not waste a failed link on it.
 */
function shouldSkipLegacyWebGpu() {
  const pinned = readPinnedEmsdkVersion();
  const major = semverMajor(pinned);
  return major != null && major >= 5;
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

/** Optimization (+ optional experiment) flags; recorded in build-info.json as optFlags. */
function getOptFlags() {
  if (MODE === 'debug') {
    const flags = [...CONFIG.optimize.debug];
    if (process.env.TETRIS_CPP_SANITIZE === '1') {
      flags.push('-fsanitize=address', '-fsanitize=undefined');
    }
    return flags;
  }

  const flags = CONFIG.optimize.release.filter(
    (flag) => !(flag === '-flto' && process.env.TETRIS_CPP_NO_LTO === '1'),
  );
  return [...flags, ...enabledOptionalFlags(CONFIG)];
}

/** Everything that is compile-only: language, warnings and optimization. */
function getCompileFlags() {
  return [
    ...codegenCompileFlags(CONFIG),
    ...warningFlags(CONFIG),
    ...getOptFlags(),
  ];
}

/**
 * Whether a link that ends without any WebGPU port is acceptable: only when asked for
 * explicitly (TETRIS_CPP_WEBGPU=none) or for a throwaway debug build. A release `auto`
 * build must never "succeed" into a module the loader refuses to boot.
 */
function allowsCanvasOnly() {
  return WEBGPU_ENV === 'none' || MODE !== 'release';
}

function resolveWebGpuAttempts() {
  const ladder = resolveLadder();
  return allowsCanvasOnly() ? ladder : ladder.filter((attempt) => attempt !== 'NONE');
}

function resolveLadder() {
  switch (WEBGPU_ENV) {
    case 'emdawn':
      return ['EMDAWN', 'NONE'];
    case 'legacy':
      return ['USE_WEBGPU', 'NONE'];
    case 'none':
      return ['NONE'];
    case 'auto':
    default:
      if (shouldSkipLegacyWebGpu()) {
        return ['EMDAWN', 'NONE'];
      }
      return ['EMDAWN', 'USE_WEBGPU', 'NONE'];
  }
}

function webGpuArgs(rung) {
  return [...(CONFIG.webgpuPorts[rung]?.args ?? [])];
}

/** Link-time settings, recorded verbatim in build-info.json (no absolute paths). */
function getLinkFlags() {
  return buildLinkFlags(CONFIG, MODE);
}

function runEmcc(useWebGpuFlag) {
  const args = [
    ...SOURCES,
    ...getCompileFlags(),
    ...INCLUDE_DIRS,
    '-o', OUT_JS,
    ...getLinkFlags(),
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

  const compileFlags = getCompileFlags();
  const portArgs = webGpuArgs(linkedPort);
  let merged = [];

  for (const src of SOURCES) {
    const base = src.split('/').pop().replace('.cpp', '.o');
    const objPath = join(OUT_BUILD, base);
    const args = [
      src,
      '-c',
      ...compileFlags,
      ...INCLUDE_DIRS,
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
  const artifacts = describeArtifacts(ROOT);
  const { sourceHash, sourceFileCount } = computeSourceHash(ROOT);
  // Deliberately no timestamp, host or absolute path: this file is committed next to
  // the wasm and a rebuild with the same toolchain must reproduce it byte-for-byte.
  const info = {
    schemaVersion: BUILD_INFO_SCHEMA_VERSION,
    mode: MODE,
    emccVersion: getEmccVersion(),
    pinnedEmsdkVersion: pinned,
    webGpuBackend: PORT_LABELS[linkedPort] || linkedPort,
    webGpuBackendId: linkedPort.toLowerCase(),
    webGpuEnv: WEBGPU_ENV,
    languageFlags: codegenCompileFlags(CONFIG),
    optFlags: getOptFlags(),
    linkFlags: getLinkFlags(),
    webGpuFlags: webGpuArgs(linkedPort),
    sources: SOURCES.map((s) => s.replace(`${ROOT}/`, '')),
    sourceHash,
    sourceFileCount,
    wasmBytes: artifacts.wasm.bytes,
    jsBytes: artifacts.js.bytes,
    artifacts,
  };

  const payload = `${JSON.stringify(info, null, 2)}\n`;
  writeFileSync(BUILD_INFO_PUBLIC, payload);
  writeFileSync(BUILD_INFO_MIRROR, payload);
  console.log(`[build-cpp] Wrote ${BUILD_INFO_PUBLIC}`);
  return info;
}

const DEFAULT_WASM_BUDGET_BYTES = CONFIG.wasmBudgetBytes;

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
  let linkedPort = null;
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
    if (i === attempts.length - 1) break;

    // Only a missing/unsupported port justifies the next rung. A genuine compile or
    // link error must surface as-is, never get masked by a fallback that "works".
    if (isWebGpuPortError(err)) {
      console.warn(`[build-cpp] ${PORT_LABELS[attempt] || attempt} unavailable on this emsdk; trying next`);
      continue;
    }
    break;
  }

  return { result, linkedPort };
}

function runGenerator(script) {
  const result = spawnSync(process.execPath, [join(__dirname, script)], {
    encoding: 'utf8',
    stdio: 'pipe',
  });
  if (result.status !== 0) {
    console.error(result.stderr || result.stdout || `[build-cpp] ${script} failed`);
    process.exit(result.status ?? 1);
  }
  console.log((result.stdout || '').trim());
}

function generateShaderHeaders() {
  runGenerator('generate-cpp-shaders.mjs');
  runGenerator('generate-cpp-uniforms.mjs');
  runGenerator('generate-cpp-material.mjs');
}

function main() {
  mkdirSync(OUT_PUBLIC, { recursive: true });

  // Pure Node, no emcc needed — regenerate before the emcc-presence check so the
  // generated header stays fresh for editors/clangd even when emcc is absent.
  generateShaderHeaders();

  if (!hasEmcc()) {
    if (process.env.TETRIS_CPP_REQUIRE_EMCC === '1') {
      console.error('[build-cpp] emcc not found and TETRIS_CPP_REQUIRE_EMCC=1 — failing.');
      console.error(`[build-cpp] Install emsdk ${readPinnedEmsdkVersion() || '(see .emsdk-version)'} and \`source emsdk_env.sh\`.`);
      process.exit(1);
    }
    console.log('[build-cpp] emcc not found — skipping C++ renderer build (TS fallbacks remain available).');
    console.log('[build-cpp] Linked WebGPU port: (skipped — no emcc)');
    console.log(`[build-cpp] Pinned emsdk (when installed): ${readPinnedEmsdkVersion() || '(none)'}`);
    process.exit(0);
  }

  warnEmsdkDrift();
  if (WEBGPU_ENV === 'auto' && shouldSkipLegacyWebGpu()) {
    console.log(
      '[build-cpp] pinned emsdk >= 5.0 — skipping legacy -s USE_WEBGPU=1 (removed upstream); ' +
      'use TETRIS_CPP_WEBGPU=legacy to force on older toolchains'
    );
  }
  console.log(`[build-cpp] Building ${MODE} → ${OUT_JS}`);
  console.log(`[build-cpp] TETRIS_CPP_WEBGPU=${WEBGPU_ENV}`);
  console.log(`[build-cpp] Flags: ${getCompileFlags().join(' ')}`);

  const { result, linkedPort } = buildLinkedPort();

  if (result.status !== 0 || !linkedPort) {
    console.error(result.stderr || result.stdout || '[build-cpp] emcc failed');
    if (!allowsCanvasOnly()) {
      console.error(
        `[build-cpp] ERROR: no WebGPU port linked (TETRIS_CPP_WEBGPU=${WEBGPU_ENV}, emcc ${getEmccVersion()}). ` +
        'A release build must not fall back to a Canvas2D-only module — it cannot boot. ' +
        `Use the pinned emsdk (${readPinnedEmsdkVersion() || 'see .emsdk-version'}), or set TETRIS_CPP_WEBGPU=none ` +
        'to explicitly build the Canvas2D-only bootstrap.'
      );
    }
    process.exit(result.status || 1);
  }

  if (linkedPort === 'NONE') {
    console.warn(
      '[build-cpp] WARNING: linked the Canvas2D-only bootstrap (no WebGPU port). ' +
      (WEBGPU_ENV === 'none'
        ? 'Requested via TETRIS_CPP_WEBGPU=none.'
        : 'Debug fallback only.') +
      ' The TS loader refuses this module — do not commit it.'
    );
  }

  emitCompileCommands(linkedPort);
  const info = writeBuildInfo(linkedPort);
  mirrorArtifacts();

  console.log(`[build-cpp] Linked WebGPU port: ${PORT_LABELS[linkedPort] || linkedPort}`);
  console.log('[build-cpp] Wrote public/cpp/tetris_renderer.js (+ wasm)');

  enforceWasmSizeBudget(info);
}

main();
