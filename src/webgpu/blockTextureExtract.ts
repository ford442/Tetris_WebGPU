import {
  getBlockTextureConfig,
  type BlockTextureConfig,
} from './blockTexture.js';

/** Upscale factor when baking the atlas tile into a dedicated block texture. */
export const BLOCK_TILE_EXTRACT_SCALE = 2.0;

export interface ExtractedBlockTile {
  canvas: HTMLCanvasElement;
  width: number;
  height: number;
  sourceWidth: number;
  sourceHeight: number;
  scale: number;
}

/**
 * Crop the authored middle block tile from the full block.png atlas and upscale it.
 * Default 2× turns the ~696×685 source crop into ~1392×1370 for sharper face sampling.
 */
export function extractBlockTileFromImage(
  image: CanvasImageSource & { width: number; height: number },
  scale = BLOCK_TILE_EXTRACT_SCALE,
  config: BlockTextureConfig = getBlockTextureConfig(),
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

  return {
    canvas,
    width: outW,
    height: outH,
    sourceWidth: cropW,
    sourceHeight: cropH,
    scale,
  };
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

export async function extractBlockTileFromUrl(
  url: string,
  scale = BLOCK_TILE_EXTRACT_SCALE,
  config?: BlockTextureConfig,
): Promise<ExtractedBlockTile> {
  const image = await loadBlockTextureImage(url);
  return extractBlockTileFromImage(image, scale, config);
}
