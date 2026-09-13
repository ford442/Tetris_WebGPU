import {
  getBlockTextureConfig,
  resolveBlockTextureAssetUrl,
  type BlockTextureConfig,
} from './blockTexture.js';
import {
  bakeMetalMaskAlpha,
  dilateBinaryMask,
  maskAlphaHistogram,
} from './blockMaskBake.js';

// Re-exported: these used to live here, and both the Mask Lab and the tests import
// them from this module.
export { bakeMetalMaskAlpha, dilateBinaryMask, maskAlphaHistogram };

/** Upscale factor when baking the atlas tile into a dedicated block texture. */
export const BLOCK_TILE_EXTRACT_SCALE = 2.0;

export interface ExtractedBlockTile {
  canvas: HTMLCanvasElement;
  width: number;
  height: number;
  sourceWidth: number;
  sourceHeight: number;
  scale: number;
  maskCanvas?: HTMLCanvasElement;
}

/**
 * Crop the authored middle crystal tile (gold hinges on the border) from the
 * full block.png atlas and upscale it. Default 2× with inset 0.01 turns the
 * ~682×671 source crop into ~1364×1343 for sharper face sampling.
 */
export function extractBlockTileFromImage(
  image: CanvasImageSource & { width: number; height: number },
  scale = BLOCK_TILE_EXTRACT_SCALE,
  config: BlockTextureConfig = getBlockTextureConfig(),
  maskImage?: (CanvasImageSource & { width: number; height: number }) | null,
): ExtractedBlockTile {
  const imgW = image.width;
  const imgH = image.height;

  const sx = (config.subregionX ?? 0) * imgW;
  const sy = (config.subregionY ?? 0) * imgH;
  const sw = (config.subregionWidth ?? 1) * imgW;
  const sh = (config.subregionHeight ?? 1) * imgH;
  const inset = config.subregionInset ?? 0;

  const cropX = sx + sw * inset;
  const cropY = sy + sh * inset;
  const cropW = sw * (1.0 - inset * 2.0);
  const cropH = sh * (1.0 - inset * 2.0);

  const outW = Math.max(1, Math.round(cropW * scale));
  const outH = Math.max(1, Math.round(cropH * scale));

  const canvas = document.createElement('canvas');
  canvas.width = outW;
  canvas.height = outH;

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Unable to create 2D context for block tile extraction');
  }

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(image, cropX, cropY, cropW, cropH, 0, 0, outW, outH);

  // Bake a metal-frame mask into the extracted tile alpha channel.
  // This makes the authored sampled-block shader opacity independent of
  // UV-square heuristics and robust to mip/lighting variations.
  // (One-time work on load; performance is not critical here.)
  bakeMetalFrameMaskIntoAlpha(ctx, outW, outH, config, maskImage ?? null);

  // Optional output for tooling/debug: visualize baked alpha as a grayscale mask.
  // 1 (metal) -> white, 0 (glass) -> black.
  const bakedAlpha = ctx.getImageData(0, 0, outW, outH);
  const maskCanvas = document.createElement('canvas');
  maskCanvas.width = outW;
  maskCanvas.height = outH;
  const mctx = maskCanvas.getContext('2d');
  if (!mctx) throw new Error('Unable to create 2D context for mask visualization');
  const maskImageData = mctx.createImageData(outW, outH);
  const md = maskImageData.data;
  for (let i = 0; i < outW * outH; i++) {
    const a = bakedAlpha.data[i * 4 + 3];
    md[i * 4 + 0] = a;
    md[i * 4 + 1] = a;
    md[i * 4 + 2] = a;
    md[i * 4 + 3] = 255;
  }
  mctx.putImageData(maskImageData, 0, 0);

  return {
    canvas,
    width: outW,
    height: outH,
    sourceWidth: cropW,
    sourceHeight: cropH,
    scale,
    maskCanvas,
  };
}

/**
 * Canvas wrapper around the pure {@link bakeMetalMaskAlpha}: read the tile back,
 * crop the companion mask to the same rect (canvas work), bake, write back.
 */
function bakeMetalFrameMaskIntoAlpha(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  config: BlockTextureConfig,
  maskImage: (CanvasImageSource & { width: number; height: number }) | null,
): void {
  const imageData = ctx.getImageData(0, 0, width, height);
  const maskData = maskImage ? cropCompanionMask(maskImage, width, height, config) : null;
  bakeMetalMaskAlpha(imageData.data, width, height, config, maskData);
  ctx.putImageData(imageData, 0, 0);
}

/** Crop a companion mask image with the same subregion/inset math as the tile. */
function cropCompanionMask(
  maskImage: CanvasImageSource & { width: number; height: number },
  width: number,
  height: number,
  config: BlockTextureConfig,
): Uint8ClampedArray {
  const maskCanvas = document.createElement('canvas');
  maskCanvas.width = width;
  maskCanvas.height = height;
  const mctx = maskCanvas.getContext('2d');
  if (!mctx) throw new Error('Unable to create 2D context for mask extraction');

  const imgW = maskImage.width;
  const imgH = maskImage.height;
  const sx = (config.subregionX ?? 0) * imgW;
  const sy = (config.subregionY ?? 0) * imgH;
  const sw = (config.subregionWidth ?? 1) * imgW;
  const sh = (config.subregionHeight ?? 1) * imgH;
  const inset = config.subregionInset ?? 0;

  mctx.imageSmoothingEnabled = true;
  mctx.imageSmoothingQuality = 'high';
  mctx.drawImage(
    maskImage,
    sx + sw * inset,
    sy + sh * inset,
    sw * (1.0 - inset * 2.0),
    sh * (1.0 - inset * 2.0),
    0,
    0,
    width,
    height,
  );
  return mctx.getImageData(0, 0, width, height).data;
}

export function loadBlockTextureImage(url: string, timeoutMs = 10000): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    let timeoutId = 0;

    const cleanup = () => {
      window.clearTimeout(timeoutId);
      img.onload = null;
      img.onerror = null;
    };

    timeoutId = window.setTimeout(() => {
      cleanup();
      reject(new Error(`Timed out loading ${url} after ${timeoutMs}ms`));
    }, timeoutMs);

    img.onload = () => {
      cleanup();
      resolve(img);
    };
    img.onerror = () => {
      cleanup();
      reject(new Error(`Failed to load ${url}`));
    };

    img.src = url;
  });
}

/** Load cfg.maskUrl if set. Returns null when absent or the fetch fails (heuristic bake). */
export async function loadCompanionMaskImage(
  config: BlockTextureConfig = getBlockTextureConfig(),
  timeoutMs = 10000,
): Promise<HTMLImageElement | null> {
  const maskUrl = config.maskUrl;
  if (!maskUrl) return null;
  try {
    return await loadBlockTextureImage(resolveBlockTextureAssetUrl(maskUrl), timeoutMs);
  } catch {
    return null;
  }
}

export async function extractBlockTileFromUrl(
  url: string,
  scale = BLOCK_TILE_EXTRACT_SCALE,
  config?: BlockTextureConfig,
): Promise<ExtractedBlockTile> {
  const image = await loadBlockTextureImage(url);
  return extractBlockTileFromImage(image, scale, config);
}
