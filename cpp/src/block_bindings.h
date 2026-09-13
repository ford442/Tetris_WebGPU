#pragma once
/**
 * Block bind-group layout for the C++ renderer, stated explicitly so the numbers
 * can be compared against the TS renderer instead of silently drifting.
 *
 * TS source of truth: src/webgpu/shaders/block/bindings.wgsl.ts
 * (BLOCK_PIPELINE_BINDING_SPECS). tests/cpp-block-parity.test.ts asserts the table
 * below still matches it.
 *
 * | binding | TS renderer            | C++ renderer            | note                         |
 * |---------|------------------------|-------------------------|------------------------------|
 * |    0    | VertexUniforms         | AuthoredBlockUniforms   | see "uniform merge" below    |
 * |    1    | FragmentUniforms       | (folded into 0)         | see "uniform merge" below    |
 * |    2    | blockTexture           | blockTexture            | same extracted authored tile |
 * |    3    | blockSamplerColor      | blockSamplerColor       | linear/aniso, see sampler.h  |
 * |    4    | iblSpecular            | absent                  | no IBL prefilter in C++ yet  |
 * |    5    | dissolveField          | absent                  | no GPU dissolve in C++ yet   |
 * |    6    | fresnelParams          | absent                  | folded into glassParams      |
 * |    7    | iblBrdfLut             | absent                  | no IBL prefilter in C++ yet  |
 * |    8    | iblSampler             | absent                  | no IBL prefilter in C++ yet  |
 * |    9    | blockTextureMask       | blockTextureMask        | mip-0 view of the same tile  |
 * |   10    | blockSamplerMask       | blockSamplerMask        | nearest mip 0                |
 * |   11    | backdropTexture        | absent                  | no backdrop capture in C++   |
 * |   12    | backdropSampler        | absent                  | no backdrop capture in C++   |
 *
 * Uniform merge: TS splits vertex (binding 0) and fragment (binding 1) uniforms
 * across two buffers because the vertex block is written per draw call. The C++
 * path draws every block in one instanced call, so there is nothing to split —
 * binding 0 carries the whole AuthoredBlockUniforms block and binding 1 is left
 * unused rather than reassigned. Bindings are *omitted*, never renumbered: a C++
 * binding index always means the same resource it means in TS, so adding IBL or
 * backdrop support later is filling a hole, not a remap.
 *
 * Shader-visible resources the C++ path lacks are handled by taking the exact
 * fallback branch the TS shader already has for them (iblEnable == 0,
 * refractEnable == 0) — not by a separate C++-only material path.
 */

namespace tetris {

enum BlockBinding {
  kBlockBindingUniforms = 0,
  kBlockBindingTextureColor = 2,
  kBlockBindingSamplerColor = 3,
  kBlockBindingTextureMask = 9,
  kBlockBindingSamplerMask = 10,
};

} // namespace tetris
