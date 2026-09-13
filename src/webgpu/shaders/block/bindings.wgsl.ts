/**
 * WGSL bind-group declarations for the production block pipeline.
 */

import { BLOCK_FRAGMENT_UNIFORM_WGSL } from './uniforms.js';

export const BLOCK_FRAGMENT_BINDINGS_WGSL = `
${BLOCK_FRAGMENT_UNIFORM_WGSL}
@binding(1) @group(0) var<uniform> fUniforms : FragmentUniforms;
@binding(2) @group(0) var blockTexture : texture_2d<f32>;
@binding(3) @group(0) var blockSamplerColor : sampler;
@binding(4) @group(0) var iblSpecular : texture_2d<f32>;
@binding(5) @group(0) var<storage, read> dissolveField : array<f32, 200>;

struct FresnelParams {
    intensity: f32,
    fresnelPower: f32,
    hardDropBoost: f32,
    _pad1: f32,
};
@binding(6) @group(0) var<uniform> fresnelParams: FresnelParams;
@binding(7) @group(0) var iblBrdfLut : texture_2d<f32>;
@binding(8) @group(0) var iblSampler : sampler;
@binding(9) @group(0) var blockTextureMask : texture_2d<f32>;
@binding(10) @group(0) var blockSamplerMask : sampler;

// Captured scene backdrop (procedural background + video portal + frosted backboard),
// blitted to a fixed-size texture after the background passes. Sampled in screen space
// by the glass path so the crystal bends the *real* background instead of a sine gradient.
@binding(11) @group(0) var backdropTexture : texture_2d<f32>;
@binding(12) @group(0) var backdropSampler : sampler;

// Authored packed material map (see src/webgpu/blockMaterialMaps.ts):
//   R = tangent normal.x, G = tangent normal.y, B = roughness, A = metallic
// Always bound — a 1x1 flat texel stands in before/without a bake, and
// materialParams.mapParams.y tells the shader which one it got.
@binding(13) @group(0) var blockMaterialMap : texture_2d<f32>;

// The visual contract, as uniforms (src/webgpu/blockMaterial.ts):
//   goldTint  : rgb = jewelry tint, w = grade mix
//   goldShade : x = shadeMin, y = shadeMax, z = metal roughness, w = glass roughness
//   mapParams : x = normal strength, y = material-map enable, z = roughness detail,
//               w = debug view (MaterialDebugView)
struct AuthoredMaterialParams {
    goldTint  : vec4f,
    goldShade : vec4f,
    mapParams : vec4f,
};
@binding(14) @group(0) var<uniform> materialParams : AuthoredMaterialParams;
`;

/** Required @group(0) bindings for the block render pipeline. */
export const BLOCK_VERTEX_BINDING_SPECS = [
  { binding: 0, kind: 'uniform', wgsl: '@binding(0) @group(0) var<uniform> vUniforms' },
] as const;

export const BLOCK_FRAGMENT_BINDING_SPECS = [
  { binding: 1, kind: 'uniform', wgsl: '@binding(1) @group(0) var<uniform> fUniforms' },
  { binding: 2, kind: 'texture', wgsl: '@binding(2) @group(0) var blockTexture' },
  { binding: 3, kind: 'sampler', wgsl: '@binding(3) @group(0) var blockSamplerColor' },
  { binding: 4, kind: 'texture', wgsl: '@binding(4) @group(0) var iblSpecular' },
  { binding: 5, kind: 'storage', wgsl: '@binding(5) @group(0) var<storage, read> dissolveField' },
  { binding: 6, kind: 'uniform', wgsl: '@binding(6) @group(0) var<uniform> fresnelParams' },
  { binding: 7, kind: 'texture', wgsl: '@binding(7) @group(0) var iblBrdfLut' },
  { binding: 8, kind: 'sampler', wgsl: '@binding(8) @group(0) var iblSampler' },
  { binding: 9, kind: 'texture', wgsl: '@binding(9) @group(0) var blockTextureMask' },
  { binding: 10, kind: 'sampler', wgsl: '@binding(10) @group(0) var blockSamplerMask' },
  { binding: 11, kind: 'texture', wgsl: '@binding(11) @group(0) var backdropTexture' },
  { binding: 12, kind: 'sampler', wgsl: '@binding(12) @group(0) var backdropSampler' },
  { binding: 13, kind: 'texture', wgsl: '@binding(13) @group(0) var blockMaterialMap' },
  { binding: 14, kind: 'uniform', wgsl: '@binding(14) @group(0) var<uniform> materialParams' },
] as const;

export const BLOCK_PIPELINE_BINDING_SPECS = [
  ...BLOCK_VERTEX_BINDING_SPECS,
  ...BLOCK_FRAGMENT_BINDING_SPECS,
] as const;

export const BLOCK_PIPELINE_BINDINGS = BLOCK_PIPELINE_BINDING_SPECS.map((s) => s.binding);
