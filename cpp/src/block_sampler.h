#pragma once
/**
 * Block texture sampler/view parity with the TS renderer.
 *
 * TS source of truth: src/webgpu/blockTexture.ts
 *   - createBlockTextureColorSamplerDescriptor
 *   - createBlockTextureMaskSamplerDescriptor
 *   - createBlockTextureColorBindingView / createBlockTextureMaskBindingView
 *
 * The color sampler is linear/linear/mip-linear, clamp-to-edge on both axes, with
 * anisotropy 16 — the old C++ sampler was mip-nearest with default (repeat) address
 * modes and no anisotropy, which is why the authored tile read as a flat atlas crop
 * instead of a beveled crystal face.
 *
 * One intentional divergence, kept here rather than hidden at the call site: TS
 * uploads a full mip chain and clamps LOD to BLOCK_TEXTURE_MAX_LOD (4), while the
 * C++ path receives a single mip level from CppRendererLoader. lodMaxClamp is
 * therefore derived from the texture's real mip count — clamping to 4 over a
 * 1-level texture is a validation error, not parity. Once mip generation exists on
 * this path, kBlockTextureMaxLod is the only number to raise.
 */

#include <webgpu/webgpu.h>

namespace tetris {

/** Matches BLOCK_TEXTURE_MAX_LOD in src/webgpu/blockTexture.ts. */
constexpr uint32_t kBlockTextureMaxLod = 4;
/** Matches maxAnisotropy in createBlockTextureColorSamplerDescriptor. */
constexpr uint16_t kBlockTextureMaxAnisotropy = 16;

/** Linear anisotropic albedo sampler. `mip_level_count` is the bound view's. */
inline WGPUSamplerDescriptor blockColorSamplerDescriptor(uint32_t mip_level_count) {
  const uint32_t levels = mip_level_count > 0 ? mip_level_count : 1;
  const uint32_t max_lod = (levels - 1) < kBlockTextureMaxLod ? (levels - 1) : kBlockTextureMaxLod;

  WGPUSamplerDescriptor desc = {};
  desc.addressModeU = WGPUAddressMode_ClampToEdge;
  desc.addressModeV = WGPUAddressMode_ClampToEdge;
  desc.addressModeW = WGPUAddressMode_ClampToEdge;
  desc.magFilter = WGPUFilterMode_Linear;
  desc.minFilter = WGPUFilterMode_Linear;
  desc.mipmapFilter = WGPUMipmapFilterMode_Linear;
  desc.lodMinClamp = 0.0f;
  desc.lodMaxClamp = static_cast<float>(max_lod);
  // Anisotropy > 1 requires linear min/mag/mipmap filtering, which is set above.
  desc.maxAnisotropy = levels > 1 ? kBlockTextureMaxAnisotropy : 1;
  return desc;
}

/** Nearest mip-0 sampler for the baked metal/glass alpha — no linear-filter halos. */
inline WGPUSamplerDescriptor blockMaskSamplerDescriptor() {
  WGPUSamplerDescriptor desc = {};
  desc.addressModeU = WGPUAddressMode_ClampToEdge;
  desc.addressModeV = WGPUAddressMode_ClampToEdge;
  desc.addressModeW = WGPUAddressMode_ClampToEdge;
  desc.magFilter = WGPUFilterMode_Nearest;
  desc.minFilter = WGPUFilterMode_Nearest;
  desc.mipmapFilter = WGPUMipmapFilterMode_Nearest;
  desc.lodMinClamp = 0.0f;
  desc.lodMaxClamp = 0.0f;
  desc.maxAnisotropy = 1;
  return desc;
}

/** Color view: full mip chain (capped at kBlockTextureMaxLod + 1), like TS. */
inline WGPUTextureViewDescriptor blockColorViewDescriptor(uint32_t mip_level_count) {
  const uint32_t levels = mip_level_count > 0 ? mip_level_count : 1;
  WGPUTextureViewDescriptor desc = {};
  desc.format = WGPUTextureFormat_RGBA8Unorm;
  desc.dimension = WGPUTextureViewDimension_2D;
  desc.baseMipLevel = 0;
  desc.mipLevelCount = levels < (kBlockTextureMaxLod + 1) ? levels : (kBlockTextureMaxLod + 1);
  desc.arrayLayerCount = 1;
  return desc;
}

/** Mask view: mip 0 only of the same RGBA tile. */
inline WGPUTextureViewDescriptor blockMaskViewDescriptor() {
  WGPUTextureViewDescriptor desc = {};
  desc.format = WGPUTextureFormat_RGBA8Unorm;
  desc.dimension = WGPUTextureViewDimension_2D;
  desc.baseMipLevel = 0;
  desc.mipLevelCount = 1;
  desc.arrayLayerCount = 1;
  return desc;
}

} // namespace tetris
