/**
 * CPU-side block bind-group helpers — single source for required pipeline bindings.
 */

import {
  createBlockTextureColorBindingView,
  createBlockTextureMaskBindingView,
} from '../../blockTexture.js';
import {
  BLOCK_FRAGMENT_UNIFORM_SIZE,
  BLOCK_VERTEX_UNIFORM_SIZE,
} from './uniforms.js';
import { AUTHORED_MATERIAL_PARAMS_SIZE } from '../../blockMaterial.js';
import {
  BLOCK_FRAGMENT_BINDING_SPECS,
  BLOCK_VERTEX_BINDING_SPECS,
} from './bindings.wgsl.js';

export { BLOCK_PIPELINE_BINDINGS, BLOCK_PIPELINE_BINDING_SPECS, BLOCK_FRAGMENT_BINDING_SPECS, BLOCK_VERTEX_BINDING_SPECS } from './bindings.wgsl.js';
export {
  BLOCK_FRAGMENT_UNIFORM_OFFSETS,
  BLOCK_FRAGMENT_UNIFORM_SIZE,
  BLOCK_VERTEX_UNIFORM_SIZE,
} from './uniforms.js';

export interface BlockBindGroupResources {
  vertexUniformBuffer: GPUBuffer;
  vertexUniformOffset?: number;
  fragmentUniformBuffer: GPUBuffer;
  blockTexture: GPUTexture;
  /**
   * Optional pre-compressed albedo (BC7 via KTX2) bound at @binding(2) instead of the
   * extracted tile. @binding(9) always keeps the uncompressed tile: the baked metal
   * mask is sampled with a nearest mip-0 sampler and block compression would fringe it.
   */
  blockColorTexture?: GPUTexture;
  blockSamplerColor: GPUSampler;
  blockSamplerMask: GPUSampler;
  dissolveBuffer: GPUBuffer;
  fresnelParamsUniform: GPUBuffer;
  iblSpecularTexture: GPUTexture;
  iblBrdfLutTexture: GPUTexture;
  iblSampler: GPUSampler;
  /** Captured scene backdrop sampled by the glass path (see BackdropCapture). */
  backdropTextureView: GPUTextureView;
  backdropSampler: GPUSampler;
  /** Packed normal/roughness/metallic map, or the 1x1 flat fallback. */
  blockMaterialMapTexture: GPUTexture;
  /** AuthoredMaterialParams uniform buffer (the visual contract). */
  materialParamsBuffer: GPUBuffer;
}

/**
 * Build bind-group entries for the production block pipeline.
 * Color + mask are two views / two samplers of the same RGBA tile.
 */
export function createBlockBindGroupEntries(
  resources: BlockBindGroupResources,
): GPUBindGroupEntry[] {
  const vertexOffset = resources.vertexUniformOffset ?? 0;
  return [
    {
      binding: 0,
      resource: {
        buffer: resources.vertexUniformBuffer,
        offset: vertexOffset,
        size: BLOCK_VERTEX_UNIFORM_SIZE,
      },
    },
    {
      binding: 1,
      resource: {
        buffer: resources.fragmentUniformBuffer,
        offset: 0,
        size: BLOCK_FRAGMENT_UNIFORM_SIZE,
      },
    },
    { binding: 2, resource: blockColorView(resources.blockColorTexture ?? resources.blockTexture) },
    { binding: 3, resource: resources.blockSamplerColor },
    { binding: 4, resource: resources.iblSpecularTexture.createView() },
    { binding: 5, resource: { buffer: resources.dissolveBuffer } },
    { binding: 6, resource: { buffer: resources.fresnelParamsUniform } },
    { binding: 7, resource: resources.iblBrdfLutTexture.createView() },
    { binding: 8, resource: resources.iblSampler },
    { binding: 9, resource: createBlockTextureMaskBindingView(resources.blockTexture) },
    { binding: 10, resource: resources.blockSamplerMask },
    { binding: 11, resource: resources.backdropTextureView },
    { binding: 12, resource: resources.backdropSampler },
    { binding: 13, resource: resources.blockMaterialMapTexture.createView() },
    {
      binding: 14,
      resource: {
        buffer: resources.materialParamsBuffer,
        offset: 0,
        size: AUTHORED_MATERIAL_PARAMS_SIZE,
      },
    },
  ];
}

/**
 * Albedo view. The rgba8unorm path uses the LOD-clamped view the sampler expects;
 * a block-compressed texture carries its own mip chain and is bound whole.
 */
function blockColorView(texture: GPUTexture): GPUTextureView {
  return texture.format === 'rgba8unorm'
    ? createBlockTextureColorBindingView(texture)
    : texture.createView();
}

/** Assert shader sources declare every required @binding for group 0. */
export function assertBlockShaderBindings(vertexSource: string, fragmentSource: string): void {
  for (const spec of BLOCK_VERTEX_BINDING_SPECS) {
    const pattern = `@binding(${spec.binding}) @group(0)`;
    if (!vertexSource.includes(pattern)) {
      throw new Error(`Block vertex shader missing ${pattern}`);
    }
  }
  for (const spec of BLOCK_FRAGMENT_BINDING_SPECS) {
    const pattern = `@binding(${spec.binding}) @group(0)`;
    if (!fragmentSource.includes(pattern)) {
      throw new Error(`Block fragment shader missing ${pattern}`);
    }
  }
  if (!fragmentSource.includes('struct FragmentUniforms')) {
    throw new Error('Block fragment shader missing FragmentUniforms struct');
  }
  if (!fragmentSource.includes('struct GlassParams')) {
    throw new Error('Block fragment shader missing GlassParams struct');
  }
  if (!fragmentSource.includes('struct AuthoredMaterialParams')) {
    throw new Error('Block fragment shader missing AuthoredMaterialParams struct');
  }
}
