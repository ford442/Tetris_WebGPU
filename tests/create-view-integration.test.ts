import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('createView integration', () => {
  it('loads EmscriptenView via dynamic import (not static)', () => {
    const src = readFileSync(join(process.cwd(), 'src/view/createView.ts'), 'utf8');
    expect(src).not.toMatch(/import\s+EmscriptenView\s+from/);
    expect(src).toMatch(/import\s*\(\s*['"]\.\.\/viewCpp\/EmscriptenView\.js['"]\s*\)/);
  });

  it('hard-fails the active renderer instead of rescuing onto another device (#485)', () => {
    const src = readFileSync(join(process.cwd(), 'src/view/createView.ts'), 'utf8');
    expect(src).toContain("pref === 'webgpu-cpp'");
    expect(src).toContain('WebgpuBootFailure');
    expect(src).toContain('showFatalWebgpuOverlay');
    // No automatic cpp/ts -> WebGL2 rescue chain: WebGL2 is only reachable via
    // the explicit `?renderer=webgl2` opt-in, never as a failure fallback.
    expect(src).not.toContain('createWithCppFallback');
    expect(src).not.toContain('createWithWebGpuFallback');
    expect(src).not.toMatch(/falling back to WebGL2/i);
  });
});
