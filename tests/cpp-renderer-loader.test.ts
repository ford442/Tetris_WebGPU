import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PLAYFIELD_BYTES, WASM_CANDIDATES, JS_CANDIDATES } from '../src/viewCpp/CppRendererLoader.js';

describe('CppRendererLoader paths', () => {
  it('probes relative and root artifact paths like WasmCore', () => {
    expect(JS_CANDIDATES).toContain('./cpp/tetris_renderer.js');
    expect(JS_CANDIDATES).toContain('/cpp/tetris_renderer.js');
    expect(WASM_CANDIDATES).toContain('./cpp/tetris_renderer.wasm');
    expect(WASM_CANDIDATES).toContain('/cpp/tetris_renderer.wasm');
  });

  it('playfield buffer is 200 bytes (10×20)', () => {
    expect(PLAYFIELD_BYTES).toBe(200);
  });

  it('exports GPU status helpers', () => {
    const src = readFileSync(join(process.cwd(), 'src/viewCpp/CppRendererLoader.ts'), 'utf8');
    expect(src).toContain('getRendererBackend');
    expect(src).toContain('RendererBackend');
    expect(src).toContain('get_renderer_backend');
    expect(src).toContain('preinitializedWebGPUDevice');
  });
});
