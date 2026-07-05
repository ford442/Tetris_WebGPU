import { describe, expect, it } from 'vitest';
import { PostProcessShaders } from '../src/webgpu/shaders/postProcess.js';
import { MaterialAwarePostProcessShaders } from '../src/webgpu/shaders/materialAwarePostProcess.js';
import { createPostProcessBindGroupEntries } from '../src/webgpu/viewTextures.js';

describe('post-process bind group layout', () => {
  it('shader declares binding 4 for shockwaveParamsUniform', () => {
    for (const shaders of [PostProcessShaders(), MaterialAwarePostProcessShaders()]) {
      expect(shaders.fragment).toContain('@binding(4) @group(0) var<uniform> shockwaveParamsUniform');
    }
  });

  it('createPostProcessBindGroupEntries supplies bindings 0 through 4', () => {
    const entries = createPostProcessBindGroupEntries({
      postProcessUniformBuffer: { } as GPUBuffer,
      shockwaveParamsUniformBuffer: { } as GPUBuffer,
      sampler: { } as GPUSampler,
      offscreenTexture: { createView: () => ({}) } as unknown as GPUTexture,
      blockTexture: { createView: () => ({}) } as unknown as GPUTexture,
    });

    expect(entries).toHaveLength(5);
    expect(entries.map((e) => e.binding)).toEqual([0, 1, 2, 3, 4]);
  });
});
