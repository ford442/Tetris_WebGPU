#pragma once
/**
 * Host-test stand-in for <webgpu/webgpu.h> (the real one comes from the emdawnwebgpu
 * port and only exists under emcc). It declares exactly the subset block_sampler.h
 * touches, with the same names, so the descriptor logic compiles and runs natively.
 * The values are arbitrary: tests compare enum *names*, never numbers. The emcc build
 * is what proves these names exist upstream.
 */

#include <stdint.h>

typedef enum WGPUAddressMode { WGPUAddressMode_ClampToEdge = 1 } WGPUAddressMode;
typedef enum WGPUFilterMode {
  WGPUFilterMode_Nearest = 1,
  WGPUFilterMode_Linear = 2
} WGPUFilterMode;
typedef enum WGPUMipmapFilterMode {
  WGPUMipmapFilterMode_Nearest = 1,
  WGPUMipmapFilterMode_Linear = 2
} WGPUMipmapFilterMode;
typedef enum WGPUTextureFormat { WGPUTextureFormat_RGBA8Unorm = 1 } WGPUTextureFormat;
typedef enum WGPUTextureViewDimension { WGPUTextureViewDimension_2D = 1 } WGPUTextureViewDimension;

typedef struct WGPUSamplerDescriptor {
  WGPUAddressMode addressModeU;
  WGPUAddressMode addressModeV;
  WGPUAddressMode addressModeW;
  WGPUFilterMode magFilter;
  WGPUFilterMode minFilter;
  WGPUMipmapFilterMode mipmapFilter;
  float lodMinClamp;
  float lodMaxClamp;
  uint16_t maxAnisotropy;
} WGPUSamplerDescriptor;

typedef struct WGPUTextureViewDescriptor {
  WGPUTextureFormat format;
  WGPUTextureViewDimension dimension;
  uint32_t baseMipLevel;
  uint32_t mipLevelCount;
  uint32_t arrayLayerCount;
} WGPUTextureViewDescriptor;
