import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('createView integration', () => {
  it('loads EmscriptenView via dynamic import (not static)', () => {
    const src = readFileSync(join(process.cwd(), 'src/view/createView.ts'), 'utf8');
    expect(src).not.toMatch(/import\s+EmscriptenView\s+from/);
    expect(src).toMatch(/import\s*\(\s*['"]\.\.\/viewCpp\/EmscriptenView\.js['"]\s*\)/);
  });

  it('routes webgpu-cpp preference through cpp fallback chain', () => {
    const src = readFileSync(join(process.cwd(), 'src/view/createView.ts'), 'utf8');
    expect(src).toContain("pref === 'webgpu-cpp'");
    expect(src).toContain('createWithCppFallback');
    expect(src).toContain('falling back to WebGPU (TS)');
    expect(src).toContain('falling back to WebGL2');
  });
});
