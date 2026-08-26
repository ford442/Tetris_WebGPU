import { describe, expect, it } from 'vitest';
import { createBlockShaders } from '../src/webgpu/shaders/block/blockShader.js';
import {
  assertBlockShaderBindings,
  BLOCK_FRAGMENT_BINDING_SPECS,
  BLOCK_VERTEX_BINDING_SPECS,
  BLOCK_PIPELINE_BINDINGS,
  createBlockBindGroupEntries,
} from '../src/webgpu/shaders/block/bindings.js';

describe('block bind group layout', () => {
  it('shader declares each required @binding for group 0', () => {
    const { vertex, fragment } = createBlockShaders();
    for (const spec of BLOCK_VERTEX_BINDING_SPECS) {
      expect(vertex).toContain(`@binding(${spec.binding}) @group(0)`);
    }
    for (const spec of BLOCK_FRAGMENT_BINDING_SPECS) {
      expect(fragment).toContain(`@binding(${spec.binding}) @group(0)`);
    }
    assertBlockShaderBindings(vertex, fragment);
  });

  it('createBlockBindGroupEntries matches shader binding indices', () => {
    const dummyTex = { createView: () => ({}) } as unknown as GPUTexture;
    const entries = createBlockBindGroupEntries({
      vertexUniformBuffer: {} as GPUBuffer,
      vertexUniformOffset: 256,
      fragmentUniformBuffer: {} as GPUBuffer,
      blockTexture: dummyTex,
      blockSampler: {} as GPUSampler,
      dissolveBuffer: {} as GPUBuffer,
      fresnelParamsUniform: {} as GPUBuffer,
      iblSpecularTexture: dummyTex,
      iblBrdfLutTexture: dummyTex,
      iblSampler: {} as GPUSampler,
    });

    expect(entries).toHaveLength(BLOCK_PIPELINE_BINDINGS.length);
    expect(entries.map((e) => e.binding)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
    const vertexEntry = entries[0].resource as GPUBufferBinding;
    expect(vertexEntry.offset).toBe(256);
  });

  it('fails fast when a required binding is removed from shader source', () => {
    const { vertex, fragment } = createBlockShaders();
    const broken = fragment.replace('@binding(5) @group(0)', '@binding(99) @group(0)');
    expect(() => assertBlockShaderBindings(vertex, broken)).toThrow(/binding\(5\)/);
  });
});
