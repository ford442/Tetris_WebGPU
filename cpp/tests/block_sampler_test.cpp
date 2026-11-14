#include <doctest.h>

#include "block_sampler.h"
#include "generated/parity_vectors.h"

using namespace tetris;

TEST_CASE("sampler constants match the shared vectors") {
  CHECK(kBlockTextureMaxLod == parity::kSamplerMaxLod);
  CHECK(kBlockTextureMaxAnisotropy == parity::kSamplerMaxAnisotropy);
}

TEST_CASE("color sampler follows the per-mip-level vectors") {
  for (int i = 0; i < parity::kColorByMipLevelsCount; ++i) {
    const auto& c = parity::kColorByMipLevels[i];
    CAPTURE(c.levels);
    const WGPUSamplerDescriptor d = blockColorSamplerDescriptor(c.levels);
    CHECK(d.lodMaxClamp == doctest::Approx(static_cast<float>(c.lod_max_clamp)));
    CHECK(d.lodMinClamp == doctest::Approx(static_cast<float>(parity::kColorLodMinClamp)));
    CHECK(d.maxAnisotropy == c.max_anisotropy);
    CHECK(d.magFilter == WGPUFilterMode_Linear);
    CHECK(d.minFilter == WGPUFilterMode_Linear);
    CHECK(d.mipmapFilter == WGPUMipmapFilterMode_Linear);
    CHECK(d.addressModeU == WGPUAddressMode_ClampToEdge);
    CHECK(d.addressModeV == WGPUAddressMode_ClampToEdge);
    CHECK(d.addressModeW == WGPUAddressMode_ClampToEdge);

    const WGPUTextureViewDescriptor v = blockColorViewDescriptor(c.levels);
    CHECK(v.mipLevelCount == c.view_mip_levels);
    CHECK(v.baseMipLevel == 0);
    CHECK(v.format == WGPUTextureFormat_RGBA8Unorm);
    CHECK(v.dimension == WGPUTextureViewDimension_2D);
  }
}

TEST_CASE("anisotropy > 1 never pairs with a non-linear filter") {
  for (uint32_t levels = 0; levels < 16; ++levels) {
    CAPTURE(levels);
    const WGPUSamplerDescriptor d = blockColorSamplerDescriptor(levels);
    if (d.maxAnisotropy > 1) {
      CHECK(d.magFilter == WGPUFilterMode_Linear);
      CHECK(d.minFilter == WGPUFilterMode_Linear);
      CHECK(d.mipmapFilter == WGPUMipmapFilterMode_Linear);
    }
    CHECK(d.lodMaxClamp <= static_cast<float>(parity::kSamplerMaxLod));
    CHECK(d.lodMaxClamp <= static_cast<float>(levels > 0 ? levels - 1 : 0));
  }
}

TEST_CASE("mask sampler is nearest, mip 0 only") {
  const WGPUSamplerDescriptor d = blockMaskSamplerDescriptor();
  CHECK(d.magFilter == WGPUFilterMode_Nearest);
  CHECK(d.minFilter == WGPUFilterMode_Nearest);
  CHECK(d.mipmapFilter == WGPUMipmapFilterMode_Nearest);
  CHECK(d.addressModeU == WGPUAddressMode_ClampToEdge);
  CHECK(d.addressModeV == WGPUAddressMode_ClampToEdge);
  CHECK(d.lodMinClamp == doctest::Approx(static_cast<float>(parity::kMaskLodMinClamp)));
  CHECK(d.lodMaxClamp == doctest::Approx(static_cast<float>(parity::kMaskLodMaxClamp)));
  CHECK(d.maxAnisotropy == 1);

  const WGPUTextureViewDescriptor v = blockMaskViewDescriptor();
  CHECK(v.mipLevelCount == 1);
  CHECK(v.baseMipLevel == 0);
}
