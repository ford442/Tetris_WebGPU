import { describe, it, expect } from 'vitest';
import {
  computeBloomParams,
  BRIGHT_FRAGMENT,
  BLUR_FRAGMENT,
  COMPOSITE_FRAGMENT,
} from '../src/viewWebGL2/glBloom.js';
import { rendererBadgeLabel } from '../src/view/rendererBadge.js';

describe('WebGL2 bloom params', () => {
  it('has a gentle resting glow and grows with the neon flash', () => {
    const rest = computeBloomParams(0);
    const flash = computeBloomParams(3);
    expect(rest.intensity).toBeGreaterThan(0);
    expect(flash.intensity).toBeGreaterThan(rest.intensity);
    expect(flash.threshold).toBeLessThan(rest.threshold);
  });

  it('clamps out-of-range and non-finite flash values', () => {
    expect(computeBloomParams(100)).toEqual(computeBloomParams(3));
    expect(computeBloomParams(-5)).toEqual(computeBloomParams(0));
    expect(computeBloomParams(Number.NaN)).toEqual(computeBloomParams(0));
  });

  it('shaders are GLSL ES 3.00 and the composite keeps colour <= alpha (premultiplied canvas)', () => {
    for (const src of [BRIGHT_FRAGMENT, BLUR_FRAGMENT, COMPOSITE_FRAGMENT]) {
      expect(src.startsWith('#version 300 es')).toBe(true);
    }
    expect(COMPOSITE_FRAGMENT).toContain('min(scene.rgb + glow, vec3(a))');
  });
});

describe('renderer badge label', () => {
  it('names the active backend', () => {
    expect(rendererBadgeLabel({ rendererName: 'webgpu' })).toBe('WebGPU');
    expect(rendererBadgeLabel({ rendererName: 'webgpu-cpp' })).toBe('WebGPU (C++)');
    expect(rendererBadgeLabel({ rendererName: 'webgl2' })).toBe('WebGL2');
  });
  it('says so when WebGL2 is an automatic fallback', () => {
    expect(rendererBadgeLabel({ rendererName: 'webgl2', fallbackReason: 'no-adapter' })).toBe('WebGL2 (no WebGPU)');
  });
});
