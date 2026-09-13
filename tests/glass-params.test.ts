import { describe, expect, it, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  DEFAULT_BLOCK_TEXTURE_CONFIG,
  DEFAULT_GLASS_PARAMS,
  evalAuthoredOutAlpha,
  getGlassParams,
  glassParamsToVec4,
  loadAuthoredBlockTextureConfig,
  resetBlockTextureConfig,
  setBlockTextureConfig,
} from '../src/webgpu/blockTexture.js';
import { Materials } from '../src/webgpu/materials.js';
import { createBlockShaderSources } from '../src/viewWebGL2/blockShadersGLSL.js';
import { createBlockShaders } from '../src/webgpu/shaders/block/blockShader.js';

describe('GlassParams single opacity curve', () => {
  beforeEach(() => {
    resetBlockTextureConfig();
  });

  it('defaults to transmissive face-on crystal (0.05 / 0.60 / 2.0)', () => {
    expect(DEFAULT_GLASS_PARAMS).toEqual({ min: 0.05, max: 0.60, fresnelPower: 2.0 });
    expect(DEFAULT_BLOCK_TEXTURE_CONFIG.authoredGlassMin).toBe(0.05);
    expect(DEFAULT_BLOCK_TEXTURE_CONFIG.authoredGlassMax).toBe(0.60);
    expect(Materials.imageSampled.authoredGlassMin).toBe(0.05);
    expect(Materials.imageSampled.authoredGlassMax).toBe(0.60);
    expect(getGlassParams()).toEqual(DEFAULT_GLASS_PARAMS);
  });

  it('reads only BlockTextureConfig (no 0.38/0.78 fallback)', () => {
    setBlockTextureConfig({ authoredGlassMin: 0.12, authoredGlassMax: 0.55, authoredGlassFresnelPower: 3 });
    expect(getGlassParams()).toEqual({ min: 0.12, max: 0.55, fresnelPower: 3 });
    const vec = glassParamsToVec4();
    expect(vec[0]).toBeCloseTo(0.12, 5);
    expect(vec[1]).toBeCloseTo(0.55, 5);
    expect(vec[2]).toBeCloseTo(3, 5);
    expect(vec[3]).toBe(0);
  });

  it('keeps gold opaque and glass transmissive on the shared CPU curve', () => {
    const params = DEFAULT_GLASS_PARAMS;
    expect(evalAuthoredOutAlpha(1, 1, params)).toBeCloseTo(1, 5);
    expect(evalAuthoredOutAlpha(0.9, 0, params)).toBeCloseTo(1, 5);
    expect(evalAuthoredOutAlpha(0, 1, params)).toBeCloseTo(0.05, 5);
    expect(evalAuthoredOutAlpha(0, 0, params)).toBeCloseTo(0.60, 5);
  });

  it('loads JSON config at boot instead of magic numbers', async () => {
    const loaded = await loadAuthoredBlockTextureConfig(async () => ({
      ok: true,
      json: async () => ({
        url: 'block.png',
        authoredGlassMin: 0.08,
        authoredGlassMax: 0.5,
        authoredGlassFresnelPower: 2,
      }),
    }) as Response);
    expect(loaded).toBe(true);
    expect(getGlassParams().min).toBeCloseTo(0.08, 5);
    expect(getGlassParams().max).toBeCloseTo(0.5, 5);
  });
});

describe('WebGL2 matches TS authored alpha', () => {
  beforeEach(() => {
    resetBlockTextureConfig();
  });
  it('uses GlassParams uniforms and premultiplies RGB', () => {
    const { fragment } = createBlockShaderSources();
    expect(fragment).toContain('mix(u_glassMin, u_glassMax, glassFresnel)');
    expect(fragment).toContain('step(0.5, metalMask)');
    expect(fragment).toContain('finalColor, 0.0, 1.0) * outAlpha');
    expect(fragment).not.toContain('mix(0.82, 0.97');
    expect(fragment).not.toContain('borderThickness');
  });

  it('WGSL and GLSL share the same glass mix / metal opaque / premul contract', () => {
    const wgsl = createBlockShaders().fragment;
    const glsl = createBlockShaderSources().fragment;
    expect(wgsl).toContain('mix(glassMin, glassMax, glassFresnel)');
    expect(glsl).toContain('mix(u_glassMin, u_glassMax, glassFresnel)');
    expect(wgsl).toContain('step(0.5, metalMask)');
    expect(glsl).toContain('step(0.5, metalMask)');
    expect(wgsl).toContain('finalColor *= outAlpha');
    expect(wgsl).toContain('gradeGoldMetalAlbedo');
    expect(glsl).toContain('gradeGoldMetalAlbedo');
    expect(wgsl).toContain('vec3f(0.90, 0.68, 0.22)');
    expect(glsl).toContain('vec3(0.90, 0.68, 0.22)');
    expect(glsl).toContain('* outAlpha, outAlpha');
    const tolerance = Math.abs(
      evalAuthoredOutAlpha(0, 1, DEFAULT_GLASS_PARAMS) -
      evalAuthoredOutAlpha(0, 1, getGlassParams()),
    );
    expect(tolerance).toBeLessThan(1e-6);
  });

  it('public JSON next to the tile matches authored glass defaults', () => {
    const json = JSON.parse(
      readFileSync(join(process.cwd(), 'public/blockTextureConfig.json'), 'utf8'),
    ) as {
      authoredGlassMin: number;
      authoredGlassMax: number;
      maskDilatePx: number;
      subregionX: number;
      subregionY: number;
      subregionWidth: number;
      subregionHeight: number;
      subregionInset: number;
    };
    expect(json.authoredGlassMin).toBeCloseTo(0.05, 5);
    expect(json.authoredGlassMax).toBeCloseTo(0.60, 5);
    expect(json.maskDilatePx).toBe(1);
    expect(json.subregionX).toBeCloseTo(DEFAULT_BLOCK_TEXTURE_CONFIG.subregionX ?? 0, 3);
    expect(json.subregionY).toBeCloseTo(DEFAULT_BLOCK_TEXTURE_CONFIG.subregionY ?? 0, 3);
    expect(json.subregionWidth).toBeCloseTo(DEFAULT_BLOCK_TEXTURE_CONFIG.subregionWidth ?? 1, 3);
    expect(json.subregionHeight).toBeCloseTo(DEFAULT_BLOCK_TEXTURE_CONFIG.subregionHeight ?? 1, 3);
    expect(json.subregionInset).toBeCloseTo(DEFAULT_BLOCK_TEXTURE_CONFIG.subregionInset ?? 0, 3);
  });
});
