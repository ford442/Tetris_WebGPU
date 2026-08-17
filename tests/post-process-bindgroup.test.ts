import { describe, expect, it } from 'vitest';
import { createPostProcessBindGroupEntries } from '../src/webgpu/viewTextures.js';

describe('post-process bind group layout', () => {
  it('createPostProcessBindGroupEntries supplies bindings 0 through 3', () => {
    const entries = createPostProcessBindGroupEntries({
      postProcessUniformBuffer: { } as GPUBuffer,
      sampler: { } as GPUSampler,
      offscreenTexture: { createView: () => ({}) } as unknown as GPUTexture,
      blockTexture: { createView: () => ({}) } as unknown as GPUTexture,
    });

    expect(entries).toHaveLength(4);
    expect(entries.map((e) => e.binding)).toEqual([0, 1, 2, 3]);
  });
});
