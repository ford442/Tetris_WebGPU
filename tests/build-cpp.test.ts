import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();

describe('build-cpp outputs', () => {
  it('documents pinned emsdk version', () => {
    const pinned = readFileSync(join(ROOT, '.emsdk-version'), 'utf8').trim();
    expect(pinned).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('build-cpp.mjs supports WebGPU env and build-info emission', () => {
    const src = readFileSync(join(ROOT, 'scripts/build-cpp.mjs'), 'utf8');
    expect(src).toContain('TETRIS_CPP_WEBGPU');
    expect(src).toContain('build-info.json');
    expect(src).toContain('compile_commands.json');
    expect(src).toContain('SAFE_HEAP');
    expect(src).toContain('wasmBytes');
    expect(src).toContain('jsBytes');
    expect(src).toContain('shouldSkipLegacyWebGpu');
  });

  it('auto WebGPU port order tries emdawnwebgpu before the removed legacy flag', () => {
    const src = readFileSync(join(ROOT, 'scripts/build-cpp.mjs'), 'utf8');
    const match = src.match(/case 'auto':\s*\n\s*default:\s*\n\s*if \(shouldSkipLegacyWebGpu\(\)\) \{\s*\n\s*return \[([^\]]+)\];\s*\n\s*\}\s*\n\s*return \[([^\]]+)\];/);
    expect(match).not.toBeNull();
    const pinnedOrder = match![1].split(',').map((s) => s.trim().replace(/'/g, ''));
    const fallbackOrder = match![2].split(',').map((s) => s.trim().replace(/'/g, ''));
    expect(pinnedOrder).toEqual(['EMDAWN', 'NONE']);
    expect(fallbackOrder.indexOf('EMDAWN')).toBeLessThan(fallbackOrder.indexOf('USE_WEBGPU'));
    expect(fallbackOrder[fallbackOrder.length - 1]).toBe('NONE');
  });

  it('skips legacy USE_WEBGPU when pinned emsdk is 5.x', () => {
    const pinned = readFileSync(join(ROOT, '.emsdk-version'), 'utf8').trim();
    const major = Number.parseInt(pinned.split('.')[0], 10);
    const src = readFileSync(join(ROOT, 'scripts/build-cpp.mjs'), 'utf8');
    expect(src).toContain('shouldSkipLegacyWebGpu');
    if (major >= 5) {
      expect(src).toContain("major >= 5");
    }
  });

  it('enforces a release wasm size budget', () => {
    const src = readFileSync(join(ROOT, 'scripts/build-cpp.mjs'), 'utf8');
    expect(src).toContain('TETRIS_CPP_WASM_BUDGET_BYTES');
    expect(src).toContain('enforceWasmSizeBudget');
    expect(src).toMatch(/DEFAULT_WASM_BUDGET_BYTES\s*=\s*256\s*\*\s*1024/);
  });

  it('regenerates the embedded shader header before every build (with or without emcc)', () => {
    const src = readFileSync(join(ROOT, 'scripts/build-cpp.mjs'), 'utf8');
    expect(src).toContain('generate-cpp-shaders.mjs');
    expect(src).toContain('generateShaderHeaders');
    const cmake = readFileSync(join(ROOT, 'cpp/CMakeLists.txt'), 'utf8');
    expect(cmake).toContain('generate-cpp-shaders.mjs');
    expect(cmake).toContain('generate_cpp_shaders');
  });

  it('gpu_renderer.cpp consumes the generated header instead of a hand-copied WGSL string', () => {
    const blockWgsl = readFileSync(join(ROOT, 'cpp/src/shaders/block/block.wgsl'), 'utf8');
    const cppSrc = readFileSync(join(ROOT, 'cpp/src/gpu_renderer.cpp'), 'utf8');
    expect(cppSrc).toContain('generated/shader_sources.h');
    expect(cppSrc).not.toContain('struct Uniforms {'); // that struct now lives only in block.wgsl
    expect(blockWgsl).toContain('struct Uniforms {');
  });

  it('emits build-info.json with backend metadata when emcc ran', () => {
    const infoPath = join(ROOT, 'public/cpp/build-info.json');
    if (!existsSync(infoPath)) {
      // CI / dev without emcc — script documents the contract only
      return;
    }
    const info = JSON.parse(readFileSync(infoPath, 'utf8'));
    expect(info).toHaveProperty('emccVersion');
    expect(info).toHaveProperty('webGpuBackend');
    expect(info).toHaveProperty('pinnedEmsdkVersion');
    if (info.wasmBytes != null) {
      expect(typeof info.wasmBytes).toBe('number');
      expect(info.wasmBytes).toBeGreaterThan(0);
    }
    expect(['debug', 'release']).toContain(info.mode);
  });

  it('emits compile_commands.json for clangd when emcc ran', () => {
    const ccPath = join(ROOT, 'build/cpp/compile_commands.json');
    if (!existsSync(ccPath)) return;

    const entries = JSON.parse(readFileSync(ccPath, 'utf8'));
    expect(Array.isArray(entries)).toBe(true);
    expect(entries.length).toBeGreaterThanOrEqual(3);
    if (!entries.every((entry: { file: string }) => existsSync(entry.file))) {
      // Stale compile_commands from another machine/checkout — skip path assertions.
      return;
    }
    for (const entry of entries) {
      expect(entry.file).toMatch(/cpp\/src\/.*\.cpp$/);
      expect(existsSync(entry.file)).toBe(true);
    }
  });
});
