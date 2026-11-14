/**
 * cpp/build.config.json is the single source of truth for the C++ renderer build. These
 * tests keep it that way: the loader's cwrap list, the config's export list and the C++
 * EMSCRIPTEN_KEEPALIVE set cannot drift, neither build script can hand-copy a flag or an
 * export, and the committed artifact records exactly what the config says.
 */
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  codegenCompileFlags,
  enabledOptionalFlags,
  exportedFunctions,
  linkFlags,
  loadBuildConfig,
  scanKeepaliveSymbols,
  scanLoaderSymbols,
  warningFlags,
} from '../scripts/lib/cppBuildConfig.mjs';

const ROOT = join(__dirname, '..');
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8');
const config = loadBuildConfig(ROOT);
const info = JSON.parse(read('public/cpp/build-info.json'));

describe('exports: one list, checked against both sides', () => {
  const loaderSymbols = scanLoaderSymbols(read('src/viewCpp/CppRendererLoader.ts'));
  const keepalive = scanKeepaliveSymbols(config.sources.map((rel: string) => read(`cpp/${rel}`)));

  it('extracts a plausible number of names (the scan itself is not vacuous)', () => {
    expect(loaderSymbols.length).toBeGreaterThanOrEqual(12);
    expect(loaderSymbols).toContain('_init_renderer');
    expect(loaderSymbols).toContain('_render_dual_frame');
    expect(loaderSymbols).toContain('_malloc');
    expect(keepalive.length).toBeGreaterThanOrEqual(14);
  });

  it('config.exports.loader equals what CppRendererLoader.ts cwrap()s or reads as module._name', () => {
    expect([...config.exports.loader].sort()).toEqual(loaderSymbols);
  });

  it('every EMSCRIPTEN_KEEPALIVE function is in the export list, and nothing else is (bar malloc/free)', () => {
    const exported = exportedFunctions(config).filter((n: string) => n !== '_malloc' && n !== '_free');
    expect(exported.sort()).toEqual(keepalive);
  });

  it('has no duplicates and the extra list never repeats a loader name', () => {
    const all = exportedFunctions(config);
    expect(new Set(all).size).toBe(all.length);
  });
});

describe('both build paths read the config instead of copying it', () => {
  const script = read('scripts/build-cpp.mjs');
  // Comments may explain a flag; only live CMake code must not carry one.
  const cmake = read('cpp/CMakeLists.txt').replace(/^\s*#.*$/gm, '');

  it('build-cpp.mjs holds no export, flag or source literal', () => {
    for (const literal of ["'_init_renderer'", "'-O3'", "'-Wall'", "'-fno-exceptions'", "'MODULARIZE=1'", "'src/renderer.cpp'", "'src/gpu_renderer.cpp'"]) {
      expect(script, `build-cpp.mjs must not hard-code ${literal}`).not.toContain(literal);
    }
    expect(script).toContain('loadBuildConfig');
  });

  it('CMakeLists.txt parses build.config.json and holds no export, flag or source literal', () => {
    expect(cmake).toContain('build.config.json');
    expect(cmake).toContain('string(JSON');
    for (const literal of ['_init_renderer', '-O3', '-flto', '-Wall', '-fno-exceptions', 'MODULARIZE', 'gpu_renderer.cpp', 'use-port=emdawnwebgpu']) {
      expect(cmake, `CMakeLists.txt must not hard-code ${literal}`).not.toContain(literal);
    }
  });

  it('CMake does not let its own per-config defaults (-DNDEBUG) change the emitted code', () => {
    expect(cmake).toMatch(/set\(CMAKE_CXX_FLAGS_RELEASE ""\)/);
  });

  it('lists only sources and include dirs that exist', () => {
    for (const rel of config.sources) expect(existsSync(join(ROOT, 'cpp', rel)), rel).toBe(true);
    for (const rel of config.includeDirs) expect(existsSync(join(ROOT, 'cpp', rel)), rel).toBe(true);
  });
});

describe('language and warning flags', () => {
  it('compiles as C++17 without exceptions or RTTI', () => {
    expect(codegenCompileFlags(config)).toEqual(['-std=c++17', '-fno-exceptions', '-fno-rtti']);
  });

  it('warns with -Wall -Wextra -Wpedantic, and adds -Werror only under CI', () => {
    expect(warningFlags(config, {})).toEqual(['-Wall', '-Wextra', '-Wpedantic']);
    expect(warningFlags(config, { CI: '1' })).toContain('-Werror');
    expect(warningFlags(config, { CI: 'true' })).toContain('-Werror');
    expect(warningFlags(config, { CI: '' })).not.toContain('-Werror');
  });

  it('keeps warning flags out of the codegen flags (they never change the wasm)', () => {
    expect(codegenCompileFlags(config).some((f: string) => f.startsWith('-W'))).toBe(false);
  });

  it('does not use the file system and says so', () => {
    expect(config.link.settings.FILESYSTEM).toBe('0');
  });

  it('emits an ES module so the browser can import() the glue', () => {
    expect(config.link.settings.EXPORT_ES6).toBe('1');
  });
});

describe('-msimd128 stays opt-in', () => {
  it('is off unless TETRIS_CPP_SIMD=1', () => {
    expect(enabledOptionalFlags(config, {})).toEqual([]);
    expect(enabledOptionalFlags(config, { TETRIS_CPP_SIMD: '0' })).toEqual([]);
    expect(enabledOptionalFlags(config, { TETRIS_CPP_SIMD: '1' })).toEqual(['-msimd128']);
  });

  it('is not in the release optimization flags', () => {
    expect(config.optimize.release).not.toContain('-msimd128');
  });
});

describe('link flags', () => {
  it('only debug builds get ASSERTIONS / SAFE_HEAP', () => {
    const release = linkFlags(config, 'release').join(' ');
    const debug = linkFlags(config, 'debug').join(' ');
    expect(release).not.toMatch(/SAFE_HEAP|ASSERTIONS/);
    expect(debug).toContain('SAFE_HEAP=1');
    expect(debug).toContain('ASSERTIONS=2');
  });

  it('exports every symbol in the list', () => {
    const flag = linkFlags(config, 'release').find((f: string) => f.startsWith('EXPORTED_FUNCTIONS='))!;
    expect(JSON.parse(flag.slice('EXPORTED_FUNCTIONS='.length))).toEqual(exportedFunctions(config));
  });
});

describe('the committed artifact records what the config says', () => {
  it('language, optimization and link flags match build.config.json', () => {
    expect(info.languageFlags).toEqual(codegenCompileFlags(config));
    expect(info.optFlags).toEqual(config.optimize.release);
    expect(info.linkFlags).toEqual(linkFlags(config, 'release'));
  });

  it('WebGPU port flags match the emdawn rung', () => {
    expect(info.webGpuFlags).toEqual(config.webgpuPorts.EMDAWN.args);
  });

  it('wasm is inside the budget', () => {
    expect(info.wasmBytes).toBeLessThanOrEqual(config.wasmBudgetBytes);
  });

  it('glue is an ES module with a default export (what CppRendererLoader import()s)', () => {
    const glue = read('public/cpp/tetris_renderer.js');
    expect(glue).toMatch(/export default createTetrisRendererModule;\s*$/);
    // A classic MODULARIZE script exports nothing under import(); never regress to it.
    expect(glue).not.toMatch(/module\.exports\s*=/);
  });
});
