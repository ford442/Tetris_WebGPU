import { describe, expect, it } from 'vitest';
import {
  BlockShaders,
  Shaders,
  createBlockShaders,
  PBRBlockShaders,
  BLOCK_PIPELINE_BINDINGS,
  BLOCK_FRAGMENT_UNIFORM_OFFSETS,
  BLOCK_FRAGMENT_UNIFORM_SIZE,
  createBlockBindGroupEntries,
  assertBlockShaderBindings,
} from '../src/webgpu/shaders/index.js';
import { VideoBackgroundShader, VideoBackgroundShaders, ParticleShaders } from '../src/webgpu/shaders/index.js';
import { UNIFORM_BUFFER_SIZES } from '../src/config/renderConfig.js';

describe('shader module facade exports', () => {
  it('exposes a single block shader factory from the modular shader index', () => {
    expect(BlockShaders).toBeTypeOf('function');
    expect(Shaders).toBe(createBlockShaders);
    expect(PBRBlockShaders).toBe(createBlockShaders);
    expect(BlockShaders).toBe(createBlockShaders);
  });

  it('exposes both video shader export names for compatibility', () => {
    expect(VideoBackgroundShader).toBeTypeOf('function');
    expect(VideoBackgroundShader).toBe(VideoBackgroundShaders);
  });

  it('continues to expose particle shader factory', () => {
    const shader = ParticleShaders();
    expect(shader.vertex.length).toBeGreaterThan(0);
    expect(shader.fragment.length).toBeGreaterThan(0);
  });
});

describe('authoritative block shader structure', () => {
  it('declares all required group-0 bindings in fragment shader', () => {
    const { vertex, fragment } = createBlockShaders();
    assertBlockShaderBindings(vertex, fragment);
    expect(vertex).toContain('@binding(0) @group(0) var<uniform> vUniforms');
    expect(fragment).toContain('struct FragmentUniforms');
    expect(fragment).toContain('dissolveField');
    expect(fragment).toContain('fresnelParams');
    // Particle interaction injected once (no duplicate WGSL paste or duplicate locals)
    const interactionMarker = 'applyParticleInteraction';
    expect(fragment.split(interactionMarker).length - 1).toBe(2); // fn def + one call site
    expect(fragment.split('let particleIntensity').length - 1).toBe(1);
    expect(fragment).not.toContain('applyMaterialParticleInteraction');
  });

  it('keeps CPU uniform buffer size aligned with WGSL struct', () => {
    expect(UNIFORM_BUFFER_SIZES.FRAGMENT).toBe(BLOCK_FRAGMENT_UNIFORM_SIZE);
    expect(BLOCK_FRAGMENT_UNIFORM_SIZE).toBe(224);
    expect(Object.keys(BLOCK_FRAGMENT_UNIFORM_OFFSETS).length).toBeGreaterThan(20);
  });

  it('createBlockBindGroupEntries supplies every active pipeline binding', () => {
    const dummyTex = { createView: () => ({}) } as unknown as GPUTexture;
    const entries = createBlockBindGroupEntries({
      vertexUniformBuffer: {} as GPUBuffer,
      fragmentUniformBuffer: {} as GPUBuffer,
      blockTexture: dummyTex,
      blockSampler: {} as GPUSampler,
      dissolveBuffer: {} as GPUBuffer,
      fresnelParamsUniform: {} as GPUBuffer,
      iblSpecularTexture: dummyTex,
      iblBrdfLutTexture: dummyTex,
      iblSampler: {} as GPUSampler,
    });
    expect(entries.map((e) => e.binding)).toEqual(BLOCK_PIPELINE_BINDINGS);
    expect(BLOCK_PIPELINE_BINDINGS).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it('authored metal path uses split-sum IBL and does not clamp HDR before bloom', () => {
    const { fragment } = createBlockShaders();
    expect(fragment).toContain('splitSumSpecular');
    expect(fragment).toContain('iblSpecular');
    expect(fragment).toContain('clearcoatSpecular');
    expect(fragment).not.toContain('clamp(finalColor');
  });
});
