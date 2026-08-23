/**
 * Split-sum IBL GPU resources: octahedral specular RGBM atlas + BRDF LUT.
 */

import { renderLogger } from '../../utils/logger.js';
import { encodeRGBM, octDecode, sampleStudioRadiance } from './iblMath.js';

export const IBL_SPECULAR_URL = 'ibl/specular_oct_mips.png';
export const IBL_BRDF_LUT_URL = 'ibl/brdf_lut.png';
export const IBL_MIP_COUNT = 6;
export const IBL_BASE_SIZE = 128;

export interface IblGpuResources {
  specularTexture: GPUTexture;
  brdfLutTexture: GPUTexture;
  sampler: GPUSampler;
  loadedFromAssets: boolean;
}

function createWarmDummySpecular(device: GPUDevice): GPUTexture {
  const size = 8;
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const [dx, dy, dz] = octDecode((x + 0.5) / size, (y + 0.5) / size);
      const rad = sampleStudioRadiance(dx, dy, dz);
      const enc = encodeRGBM(rad[0], rad[1], rad[2]);
      const i = (y * size + x) * 4;
      data[i] = Math.round(enc[0] * 255);
      data[i + 1] = Math.round(enc[1] * 255);
      data[i + 2] = Math.round(enc[2] * 255);
      data[i + 3] = Math.round(enc[3] * 255);
    }
  }
  const texture = device.createTexture({
    label: 'ibl-specular-fallback',
    size: [size, size],
    format: 'rgba8unorm',
    mipLevelCount: 1,
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
  });
  device.queue.writeTexture({ texture }, data, { bytesPerRow: size * 4 }, [size, size]);
  return texture;
}

function createDummyBrdfLut(device: GPUDevice): GPUTexture {
  const size = 8;
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const nDotV = (x + 0.5) / size;
      const rough = (y + 0.5) / size;
      const scale = (1 - rough) * (0.04 + 0.96 * nDotV);
      const bias = rough * 0.15;
      const i = (y * size + x) * 4;
      data[i] = Math.round(scale * 255);
      data[i + 1] = Math.round(bias * 255);
      data[i + 2] = 0;
      data[i + 3] = 255;
    }
  }
  const texture = device.createTexture({
    label: 'ibl-brdf-fallback',
    size: [size, size],
    format: 'rgba8unorm',
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
  });
  device.queue.writeTexture({ texture }, data, { bytesPerRow: size * 4 }, [size, size]);
  return texture;
}

async function loadImage(url: string): Promise<ImageBitmap | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    return await createImageBitmap(blob);
  } catch {
    return null;
  }
}

function uploadMipAtlas(device: GPUDevice, bitmap: ImageBitmap): GPUTexture | null {
  const expectedH = IBL_BASE_SIZE * 2 - IBL_BASE_SIZE / 2 ** (IBL_MIP_COUNT - 1);
  if (bitmap.width !== IBL_BASE_SIZE || bitmap.height < IBL_BASE_SIZE) {
    renderLogger.warn(
      'IBL specular atlas size mismatch',
      bitmap.width,
      bitmap.height,
      'expected',
      IBL_BASE_SIZE,
      expectedH,
    );
    return null;
  }
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.drawImage(bitmap, 0, 0);
  const texture = device.createTexture({
    label: 'ibl-specular-oct',
    size: [IBL_BASE_SIZE, IBL_BASE_SIZE],
    format: 'rgba8unorm',
    mipLevelCount: IBL_MIP_COUNT,
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
  });
  let y = 0;
  let mipSize = IBL_BASE_SIZE;
  for (let mip = 0; mip < IBL_MIP_COUNT; mip++) {
    const img = ctx.getImageData(0, y, mipSize, mipSize);
    device.queue.writeTexture(
      { texture, mipLevel: mip },
      img.data,
      { bytesPerRow: mipSize * 4 },
      [mipSize, mipSize],
    );
    y += mipSize;
    mipSize = Math.max(1, mipSize >> 1);
  }
  return texture;
}

function uploadLut(device: GPUDevice, bitmap: ImageBitmap): GPUTexture {
  const texture = device.createTexture({
    label: 'ibl-brdf-lut',
    size: [bitmap.width, bitmap.height],
    format: 'rgba8unorm',
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
  });
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.drawImage(bitmap, 0, 0);
    const img = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
    device.queue.writeTexture(
      { texture },
      img.data,
      { bytesPerRow: bitmap.width * 4 },
      [bitmap.width, bitmap.height],
    );
  }
  return texture;
}

export function createFallbackIblResources(device: GPUDevice): IblGpuResources {
  return {
    specularTexture: createWarmDummySpecular(device),
    brdfLutTexture: createDummyBrdfLut(device),
    sampler: device.createSampler({
      magFilter: 'linear',
      minFilter: 'linear',
      mipmapFilter: 'linear',
      addressModeU: 'clamp-to-edge',
      addressModeV: 'clamp-to-edge',
    }),
    loadedFromAssets: false,
  };
}

export async function loadIblResources(device: GPUDevice, baseUrl = './'): Promise<IblGpuResources> {
  const fallback = createFallbackIblResources(device);
  const prefix = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  const [specBmp, lutBmp] = await Promise.all([
    loadImage(`${prefix}${IBL_SPECULAR_URL}`),
    loadImage(`${prefix}${IBL_BRDF_LUT_URL}`),
  ]);
  if (!specBmp || !lutBmp) {
    renderLogger.warn('IBL assets missing; using warm studio fallback');
    return fallback;
  }
  const specular = uploadMipAtlas(device, specBmp);
  specBmp.close();
  if (!specular) {
    lutBmp.close();
    return fallback;
  }
  const lut = uploadLut(device, lutBmp);
  lutBmp.close();
  fallback.specularTexture.destroy();
  fallback.brdfLutTexture.destroy();
  return {
    specularTexture: specular,
    brdfLutTexture: lut,
    sampler: fallback.sampler,
    loadedFromAssets: true,
  };
}

export function shouldEnableIbl(options: {
  powerPreference?: GPUPowerPreference | string;
  quality?: string;
  adaptiveDisableIbl?: boolean;
}): boolean {
  if (options.powerPreference === 'low-power') return false;
  if (options.quality === 'low') return false;
  if (options.adaptiveDisableIbl) return false;
  return true;
}

/** HDR playfield format: rg11b10ufloat when the optional feature is present. */
export function resolvePlayfieldColorFormat(
  device: GPUDevice,
  hdrEnabled: boolean,
  canvasFormat: GPUTextureFormat,
): GPUTextureFormat {
  if (!hdrEnabled) return canvasFormat;
  if (device.features.has('rg11b10ufloat-renderable' as GPUFeatureName)) {
    return 'rg11b10ufloat';
  }
  return 'rgba16float';
}

export function shouldEnableHdrPlayfield(options: {
  powerPreference?: GPUPowerPreference | string;
  quality?: string;
}): boolean {
  if (options.powerPreference === 'low-power') return false;
  if (options.quality === 'low') return false;
  return true;
}
