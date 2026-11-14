import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('createView integration', () => {
  it('loads EmscriptenView via dynamic import (not static)', () => {
    const src = readFileSync(join(process.cwd(), 'src/view/createView.ts'), 'utf8');
    expect(src).not.toMatch(/import\s+EmscriptenView\s+from/);
    expect(src).toMatch(/import\s*\(\s*['"]\.\.\/viewCpp\/EmscriptenView\.js['"]\s*\)/);
  });

  it('hard-fails an explicit WebGPU choice instead of rescuing onto another device (#485)', () => {
    const src = readFileSync(join(process.cwd(), 'src/view/createView.ts'), 'utf8');
    expect(src).toContain("pref === 'webgpu-cpp'");
    expect(src).toContain('WebgpuBootFailure');
    expect(src).toContain('showFatalWebgpuOverlay');
    // No cpp/ts -> WebGL2 rescue chain after a device failure. WebGL2 is reached
    // via the explicit `?renderer=webgl2` opt-in, or by `auto` when there is no
    // adapter at all (see create-view-auto-fallback.test.ts).
    expect(src).not.toContain('createWithCppFallback');
    expect(src).not.toContain('createWithWebGpuFallback');
    expect(src).not.toMatch(/falling back to WebGL2/i);
  });
});
