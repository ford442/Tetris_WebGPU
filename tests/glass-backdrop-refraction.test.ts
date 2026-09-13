import { describe, expect, it, beforeEach } from 'vitest';
import {
  DEFAULT_BLOCK_TEXTURE_CONFIG,
  DEFAULT_GLASS_REFRACTION_PARAMS,
  getGlassRefractionParams,
  resetBlockTextureConfig,
  setBlockTextureConfig,
} from '../src/webgpu/blockTexture.js';
import { createBlockShaders } from '../src/webgpu/shaders/block/blockShader.js';
import {
  BLOCK_FRAGMENT_UNIFORM_OFFSETS,
  BLOCK_FRAGMENT_UNIFORM_SIZE,
} from '../src/webgpu/shaders/block/uniforms.js';
import { shouldEnableBackdropRefraction } from '../src/webgpu/glassRefraction.js';

describe('authored glass refraction params', () => {
  beforeEach(() => {
    resetBlockTextureConfig();
  });

  it('defaults to a stained-glass IOR, not a window-glass one', () => {
    expect(DEFAULT_GLASS_REFRACTION_PARAMS).toEqual({ ior: 1.22, thickness: 0.035 });
    expect(DEFAULT_BLOCK_TEXTURE_CONFIG.authoredGlassIor).toBe(1.22);
    expect(DEFAULT_BLOCK_TEXTURE_CONFIG.authoredGlassThickness).toBe(0.035);
    expect(getGlassRefractionParams()).toEqual(DEFAULT_GLASS_REFRACTION_PARAMS);
  });

  it('reads authored overrides from the active block texture config', () => {
    setBlockTextureConfig({ authoredGlassIor: 1.6, authoredGlassThickness: 0.05 });
    expect(getGlassRefractionParams()).toEqual({ ior: 1.6, thickness: 0.05 });
  });

  it('clamps values the shader cannot use', () => {
    // ior <= 1 makes refract() degenerate; unbounded thickness samples far off-block.
    setBlockTextureConfig({ authoredGlassIor: 0.4, authoredGlassThickness: 5 });
    expect(getGlassRefractionParams()).toEqual({ ior: 1.01, thickness: 0.25 });
  });
});

describe('backdrop refraction uniforms', () => {
  it('adds named IOR/thickness/enable fields inside the existing 224B binding', () => {
    const offs = BLOCK_FRAGMENT_UNIFORM_OFFSETS;
    expect(offs.glassIor).toBe(204);
    expect(offs.glassThickness).toBe(208);
    expect(offs.refractEnable).toBe(212);
    expect(BLOCK_FRAGMENT_UNIFORM_SIZE).toBe(224);
  });
});

describe('block fragment shader backdrop refraction', () => {
  const { vertex, fragment } = createBlockShaders();

  it('forwards clip-space position so the fragment stage can derive screen UVs', () => {
    expect(vertex).toContain('@location(4) vClipPos');
    expect(vertex).toContain('out.vClipPos         = out.Position;');
    expect(fragment).toContain('@location(4) vClipPos : vec4f');
  });

  it('samples the captured backdrop instead of only the procedural env', () => {
    expect(fragment).toContain('@binding(11) @group(0) var backdropTexture');
    expect(fragment).toContain('@binding(12) @group(0) var backdropSampler');
    expect(fragment).toContain('fn refractBackdrop(');
    // Must be textureSampleLevel: refraction runs inside glass-mask branching,
    // where implicit-derivative sampling is not uniform.
    expect(fragment).toContain('textureSampleLevel(backdropTexture, backdropSampler');
    expect(fragment).not.toContain('textureSample(backdropTexture');
  });

  it('keeps a procedural fallback when the capture is disabled', () => {
    expect(fragment).toContain('fUniforms.refractEnable > 0.5');
    expect(fragment).toContain('proceduralEnvReflect(refract(-V, N, 1.0 / max(fUniforms.glassIor, 1.01)), time)');
  });

  it('drops the hardcoded 1.15 IOR in favour of the named uniform', () => {
    expect(fragment).not.toContain('refract(-V, N, 1.0 / 1.15)');
  });

  it('gates refraction behind the glass mask so the metal frame stays opaque', () => {
    const glassBlock = fragment.slice(
      fragment.indexOf('if (glassMask > 0.2) {'),
      fragment.indexOf('// Gold frame opaque'),
    );
    expect(glassBlock).toContain('refractBackdrop(');
    // The ghost path early-returns well before any of this.
    const ghostReturn = fragment.indexOf('let isGhost = vColor.w < 0.4;');
    expect(ghostReturn).toBeGreaterThan(0);
    expect(ghostReturn).toBeLessThan(fragment.indexOf('if (glassMask > 0.2) {'));
  });
});

describe('shouldEnableBackdropRefraction', () => {
  it('is on by default', () => {
    expect(shouldEnableBackdropRefraction({})).toBe(true);
    expect(shouldEnableBackdropRefraction({ quality: 'ultra' })).toBe(true);
  });

  it('follows the same budget signals as IBL', () => {
    expect(shouldEnableBackdropRefraction({ powerPreference: 'low-power' })).toBe(false);
    expect(shouldEnableBackdropRefraction({ quality: 'low' })).toBe(false);
    expect(shouldEnableBackdropRefraction({ adaptiveDisableIbl: true })).toBe(false);
  });
});
