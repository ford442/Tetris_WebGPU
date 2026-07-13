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
    expect(src).toContain('-flto');
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
    expect(['debug', 'release']).toContain(info.mode);
  });

  it('emits compile_commands.json for clangd when emcc ran', () => {
    const ccPath = join(ROOT, 'build/cpp/compile_commands.json');
    if (!existsSync(ccPath)) return;

    const entries = JSON.parse(readFileSync(ccPath, 'utf8'));
    expect(Array.isArray(entries)).toBe(true);
    expect(entries.length).toBeGreaterThanOrEqual(3);
    for (const entry of entries) {
      expect(entry.file).toMatch(/cpp\/src\/.*\.cpp$/);
      expect(entry.directory).toBe(ROOT);
    }
  });
});
