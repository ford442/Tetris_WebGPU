/**
 * WGSL bind-group declarations for the production block pipeline.
 */

import { BLOCK_FRAGMENT_UNIFORM_WGSL } from './uniforms.js';

export const BLOCK_FRAGMENT_BINDINGS_WGSL = `
${BLOCK_FRAGMENT_UNIFORM_WGSL}
@binding(1) @group(0) var<uniform> fUniforms : FragmentUniforms;
@binding(2) @group(0) var blockTexture : texture_2d<f32>;
@binding(3) @group(0) var blockSampler : sampler;
@binding(5) @group(0) var<storage, read> dissolveField : array<f32, 200>;

struct FresnelParams {
    intensity: f32,
    fresnelPower: f32,
    hardDropBoost: f32,
    _pad1: f32,
};
@binding(6) @group(0) var<uniform> fresnelParams: FresnelParams;
`;

/** Required @group(0) bindings for the block render pipeline (binding 4 unused). */
export const BLOCK_VERTEX_BINDING_SPECS = [
  { binding: 0, kind: 'uniform', wgsl: '@binding(0) @group(0) var<uniform> vUniforms' },
] as const;

export const BLOCK_FRAGMENT_BINDING_SPECS = [
  { binding: 1, kind: 'uniform', wgsl: '@binding(1) @group(0) var<uniform> fUniforms' },
  { binding: 2, kind: 'texture', wgsl: '@binding(2) @group(0) var blockTexture' },
  { binding: 3, kind: 'sampler', wgsl: '@binding(3) @group(0) var blockSampler' },
  { binding: 5, kind: 'storage', wgsl: '@binding(5) @group(0) var<storage, read> dissolveField' },
  { binding: 6, kind: 'uniform', wgsl: '@binding(6) @group(0) var<uniform> fresnelParams' },
] as const;

export const BLOCK_PIPELINE_BINDING_SPECS = [
  ...BLOCK_VERTEX_BINDING_SPECS,
  ...BLOCK_FRAGMENT_BINDING_SPECS,
] as const;

export const BLOCK_PIPELINE_BINDINGS = BLOCK_PIPELINE_BINDING_SPECS.map((s) => s.binding);
