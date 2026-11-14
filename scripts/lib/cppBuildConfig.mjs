/**
 * Reader for cpp/build.config.json — the single source of truth for the C++ renderer's
 * sources, flags and exports. Consumers: scripts/build-cpp.mjs, scripts/cpp-size-report.mjs
 * and tests/cpp-build-config.test.ts; cpp/CMakeLists.txt parses the same file with
 * string(JSON ...). Pure Node, no emcc.
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

export const BUILD_CONFIG_REL = 'cpp/build.config.json';

export function loadBuildConfig(root = DEFAULT_ROOT) {
  const raw = JSON.parse(readFileSync(join(root, BUILD_CONFIG_REL), 'utf8'));
  for (const key of ['std', 'sources', 'includeDirs', 'compile', 'optimize', 'webgpuPorts', 'link', 'exports']) {
    if (raw[key] === undefined) throw new Error(`${BUILD_CONFIG_REL}: missing "${key}"`);
  }
  return raw;
}

/** Every exported symbol, loader-facing first. Order is the emcc EXPORTED_FUNCTIONS order. */
export function exportedFunctions(config) {
  return [...config.exports.loader, ...config.exports.extra];
}

/** `-s KEY=VALUE` pairs flattened for emcc, e.g. ['-s', 'MODULARIZE=1', ...]. */
export function settingsToFlags(settings) {
  return Object.entries(settings).flatMap(([key, value]) => ['-s', `${key}=${value}`]);
}

/** Link flags exactly as passed to emcc (and recorded in build-info.json). */
export function linkFlags(config, mode) {
  const settings = { ...config.link.settings };
  if (mode === 'debug') Object.assign(settings, config.link.debugSettings ?? {});
  return [
    ...settingsToFlags(settings),
    '-s', `EXPORTED_FUNCTIONS=${JSON.stringify(exportedFunctions(config))}`,
    '-s', `EXPORTED_RUNTIME_METHODS=${JSON.stringify(config.link.exportedRuntimeMethods)}`,
  ];
}

/** Optional experiment flags whose env var is set to "1" (e.g. TETRIS_CPP_SIMD=1). */
export function enabledOptionalFlags(config, env = process.env) {
  return Object.values(config.optionalFlags ?? {})
    .filter((entry) => env[entry.env] === '1')
    .flatMap((entry) => entry.flags);
}

/** Flags that change the emitted code: std + language flags (never warnings). */
export function codegenCompileFlags(config) {
  return [`-std=${config.std}`, ...config.compile.language];
}

/** -Wall -Wextra -Wpedantic, plus -Werror when CI is 1/true. Output-neutral. */
export function warningFlags(config, env = process.env) {
  const flags = [...config.compile.warnings];
  if (env.CI === '1' || env.CI === 'true') flags.push('-Werror');
  return flags;
}

/** Names the TS loader calls: cwrap('name', …) plus direct module._name uses. */
export function scanLoaderSymbols(loaderSource) {
  const names = new Set();
  for (const m of loaderSource.matchAll(/\bcwrap\(\s*'([A-Za-z0-9_]+)'/g)) names.add(`_${m[1]}`);
  for (const m of loaderSource.matchAll(/\bmodule\._([A-Za-z0-9_]+)/g)) names.add(`_${m[1]}`);
  return [...names].sort();
}

/** Names of EMSCRIPTEN_KEEPALIVE functions defined in the given C++ sources. */
export function scanKeepaliveSymbols(sources) {
  const names = new Set();
  for (const text of sources) {
    for (const m of text.matchAll(/EMSCRIPTEN_KEEPALIVE\s+[\w\s*:<>]+?[\s*&]([A-Za-z_][A-Za-z0-9_]*)\s*\(/g)) {
      names.add(`_${m[1]}`);
    }
  }
  return [...names].sort();
}

/** Hand-written C++ (headers + sources, no generated/) under cpp/. */
export function listHandWrittenCpp(root = DEFAULT_ROOT) {
  const out = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === 'generated' || entry.name === 'third_party') continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.(cpp|h|hpp)$/.test(entry.name)) out.push(full);
    }
  };
  for (const sub of ['src', 'tests']) {
    const dir = join(root, 'cpp', sub);
    if (existsSync(dir)) walk(dir);
  }
  return out.sort();
}
