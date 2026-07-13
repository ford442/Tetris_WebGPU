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
  maskCanvas?: HTMLCanvasElement;
}

/**
 * Crop the authored middle block tile from the full block.png atlas and upscale it.
 * Default 2× turns the ~696×685 source crop into ~1392×1370 for sharper face sampling.
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

function bakeMetalFrameMaskIntoAlpha(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  config: BlockTextureConfig,
  maskImage: (CanvasImageSource & { width: number; height: number }) | null,
): void {
  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;

  const n = width * height;

  // Pixel-space "UV edge distance" for outer-ring force and connectivity seeds.
  const uDen = Math.max(1, width - 1);
  const vDen = Math.max(1, height - 1);
  // Outer frame force: slightly larger to reduce metal/glass halo risk.
  const outerForce = config.maskOuterForce ?? 0.13; // ~10-14% depending on aspect

  // ---------------------------------------------------------------------------
  // Mask-driven path (Option A):
  // If a companion mask image is provided, crop it identically and pack a
  // feathered metal mask into the extracted tile alpha channel.
  // ---------------------------------------------------------------------------
  if (maskImage) {
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
    const cropX = sx + sw * inset;
    const cropY = sy + sh * inset;
    const cropW = sw * (1.0 - inset * 2.0);
    const cropH = sh * (1.0 - inset * 2.0);

    mctx.imageSmoothingEnabled = true;
    mctx.imageSmoothingQuality = 'high';
    mctx.drawImage(maskImage, cropX, cropY, cropW, cropH, 0, 0, width, height);

    const maskData = mctx.getImageData(0, 0, width, height).data;

    const maskThreshold = config.maskThreshold ?? 0.5;
    const maskChannel = config.maskChannel ?? 'auto';

    // Decide which channel to use for auto:
    // If alpha varies significantly, use alpha; otherwise use red.
    let minA = Number.POSITIVE_INFINITY;
    let maxA = Number.NEGATIVE_INFINITY;
    for (let i = 0; i < n; i++) {
      const a = maskData[i * 4 + 3];
      minA = Math.min(minA, a);
      maxA = Math.max(maxA, a);
    }
    const useAlpha = maskChannel === 'alpha' ||
      (maskChannel === 'auto' && (maxA - minA) > 20);
    const metal = new Uint8Array(n);
    const keep = new Uint8Array(n);

    for (let y = 0; y < height; y++) {
      const v = y / vDen;
      for (let x = 0; x < width; x++) {
        const u = x / uDen;
        const idx = y * width + x;
        const r = maskData[idx * 4 + 0] / 255;
        const a = maskData[idx * 4 + 3] / 255;
        const metalValue = useAlpha ? a : r;
        metal[idx] = metalValue >= maskThreshold ? 1 : 0;
      }
    }

    // Keep only metal component connected to the outer ring.
    keep.fill(0);
    const queue = new Int32Array(n);
    let head = 0;
    let tail = 0;

    for (let y = 0; y < height; y++) {
      const v = y / vDen;
      const distY = Math.min(v, 1.0 - v);
      for (let x = 0; x < width; x++) {
        const u = x / uDen;
        const distX = Math.min(u, 1.0 - u);
        const distEdge = Math.min(distX, distY);
        const idx = y * width + x;
        if (distEdge < outerForce && metal[idx] === 1) {
          keep[idx] = 1;
          queue[tail++] = idx;
        }
      }
    }

    if (tail === 0) {
      // If no component was found, keep everything above threshold.
      // (prevents empty alpha when mask is inverted)
      keep.set(metal);
    } else {
      while (head < tail) {
        const idx = queue[head++];
        const x = idx % width;
        const y = Math.floor(idx / width);

        if (x > 0) {
          const ni = idx - 1;
          if (metal[ni] === 1 && keep[ni] === 0) {
            keep[ni] = 1;
            queue[tail++] = ni;
          }
        }
        if (x + 1 < width) {
          const ni = idx + 1;
          if (metal[ni] === 1 && keep[ni] === 0) {
            keep[ni] = 1;
            queue[tail++] = ni;
          }
        }
        if (y > 0) {
          const ni = idx - width;
          if (metal[ni] === 1 && keep[ni] === 0) {
            keep[ni] = 1;
            queue[tail++] = ni;
          }
        }
        if (y + 1 < height) {
          const ni = idx + width;
          if (metal[ni] === 1 && keep[ni] === 0) {
            keep[ni] = 1;
            queue[tail++] = ni;
          }
        }
      }
    }

    // Force metal=1 on the outer ring regardless of mask output.
    for (let y = 0; y < height; y++) {
      const v = y / vDen;
      const distY = Math.min(v, 1.0 - v);
      for (let x = 0; x < width; x++) {
        const u = x / uDen;
        const distX = Math.min(u, 1.0 - u);
        const distEdge = Math.min(distX, distY);
        const idx = y * width + x;
        if (distEdge < outerForce) keep[idx] = 1;
      }
    }

    const featherPx = Math.max(1, Math.round(config.maskFeatherPx ?? 1));
    applyFeatheredAlpha(ctx, imageData, width, height, keep, featherPx);
    return;
  }

  const scalar = new Float32Array(n);

  // Compute scalar metal-likelihood signal depending on detection mode.
  // We later separate the two populations with an adaptive threshold.
  let minS = Number.POSITIVE_INFINITY;
  let maxS = Number.NEGATIVE_INFINITY;
  for (let y = 0; y < height; y++) {
    const v = y / vDen;
    for (let x = 0; x < width; x++) {
      const u = x / uDen;
      const idx = y * width + x;
      const i4 = idx * 4;
      const r = data[i4 + 0] / 255;
      const g = data[i4 + 1] / 255;
      const b = data[i4 + 2] / 255;

      const luma = 0.299 * r + 0.587 * g + 0.114 * b;

      let s: number;
      switch (config.materialDetectionMode ?? 'color_signal') {
        case 'warmth': {
          // Warm gold frame: positive (R-B), only in mid luma band.
          const rawWarmth = r - b;
          const warmthMin = config.warmthSignalClampMin ?? -Infinity;
          const warmthMax = config.warmthSignalClampMax ?? Infinity;
          const warmth = Math.min(warmthMax, Math.max(warmthMin, rawWarmth));

          // Approximate luma band that the shader uses to avoid shadow noise.
          const a0 = config.warmthLumaBandA0 ?? 0.25;
          const a1 = config.warmthLumaBandA1 ?? 0.55;
          const b0 = config.warmthLumaBandB0 ?? 0.82;
          const b1 = config.warmthLumaBandB1 ?? 0.95;
          const lumaBand =
            smoothstep(a0, a1, luma) * (1.0 - smoothstep(b0, b1, luma));

          s = lumaBand * warmth;
          break;
        }
        case 'luminance': {
          // Bright frame pixels.
          s = luma;
          break;
        }
        case 'none': {
          // No signal; fall back to geometric-only.
          s = 0.0;
          break;
        }
        case 'alpha': {
          // No RGB signal to detect metal/glass; fall back to geometric-only.
          s = 0.0;
          break;
        }
        case 'color_signal':
        default: {
          // Default: gold signal in the texture.
          // (Same spirit as textureSampling.ts 'color_signal' path.)
          s = r + g - b * 0.5;
          break;
        }
      }

      scalar[idx] = s;
      minS = Math.min(minS, s);
      maxS = Math.max(maxS, s);
    }
  }

  // If detection mode doesn't provide meaningful signal, fall back to
  // geometric-only metal frame (keeps alpha stable).
  if (config.materialDetectionMode === 'none' || config.materialDetectionMode === 'alpha') {
    const keep = new Uint8Array(n);
    for (let y = 0; y < height; y++) {
      const v = y / vDen;
      for (let x = 0; x < width; x++) {
        const u = x / uDen;
        const distX = Math.min(u, 1.0 - u);
        const distY = Math.min(v, 1.0 - v);
        const distEdge = Math.min(distX, distY);
        const idx = y * width + x;
        keep[idx] = distEdge < outerForce ? 1 : 0;
      }
    }
    applyFeatheredAlpha(ctx, imageData, width, height, keep, Math.max(1, Math.round(config.maskFeatherPx ?? 1)));
    return;
  }

  // Adaptive thresholding (Otsu) on scalar values.
  // This is far less sensitive than fixed thresholds and avoids tuning to a
  // single block.png histogram.
  const range = Math.max(1e-6, maxS - minS);
  const histBins = 256;
  const hist = new Uint32Array(histBins);
  for (let i = 0; i < n; i++) {
    const tn = (scalar[i] - minS) / range; // ~[0,1]
    const t = clamp01(tn);
    const b = Math.min(histBins - 1, Math.max(0, Math.floor(t * (histBins - 1))));
    hist[b]++;
  }

  const total = n;
  let sum = 0;
  for (let i = 0; i < histBins; i++) sum += i * hist[i];

  let sumB = 0;
  let wB = 0;
  let wF = 0;
  let maxBetween = -1;
  let bestBin = 0;

  for (let t = 0; t < histBins; t++) {
    wB += hist[t];
    if (wB === 0) continue;
    wF = total - wB;
    if (wF === 0) break;
    sumB += t * hist[t];

    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) * (mB - mF);
    if (between > maxBetween) {
      maxBetween = between;
      bestBin = t;
    }
  }

  const thresholdNorm = bestBin / (histBins - 1);

  // Initial binary metal mask.
  const metal = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const tn = (scalar[i] - minS) / range;
    metal[i] = tn > thresholdNorm ? 1 : 0;
  }

  // Keep only the metal component connected to the outer border ring.
  // This suppresses false positives inside the glass window.
  const keep = new Uint8Array(n);
  const queue = new Int32Array(n);
  let head = 0;
  let tail = 0;

  for (let y = 0; y < height; y++) {
    const v = y / vDen;
    const distY = Math.min(v, 1.0 - v);
    for (let x = 0; x < width; x++) {
      const u = x / uDen;
      const distX = Math.min(u, 1.0 - u);
      const distEdge = Math.min(distX, distY);
      const idx = y * width + x;
      if (distEdge < outerForce && metal[idx] === 1) {
        keep[idx] = 1;
        queue[tail++] = idx;
      }
    }
  }

  if (tail === 0) {
    // Threshold may have inverted or the crop is degenerate.
    // Keep all metal so alpha isn't empty.
    for (let i = 0; i < n; i++) keep[i] = metal[i];
  } else {
    while (head < tail) {
      const idx = queue[head++];
      const x = idx % width;
      const y = Math.floor(idx / width);

      // 4-neighborhood flood-fill
      if (x > 0) {
        const ni = idx - 1;
        if (metal[ni] === 1 && keep[ni] === 0) {
          keep[ni] = 1;
          queue[tail++] = ni;
        }
      }
      if (x + 1 < width) {
        const ni = idx + 1;
        if (metal[ni] === 1 && keep[ni] === 0) {
          keep[ni] = 1;
          queue[tail++] = ni;
        }
      }
      if (y > 0) {
        const ni = idx - width;
        if (metal[ni] === 1 && keep[ni] === 0) {
          keep[ni] = 1;
          queue[tail++] = ni;
        }
      }
      if (y + 1 < height) {
        const ni = idx + width;
        if (metal[ni] === 1 && keep[ni] === 0) {
          keep[ni] = 1;
          queue[tail++] = ni;
        }
      }
    }
  }

  // Force metal=1 on the outer ring regardless of classifier output.
  for (let y = 0; y < height; y++) {
    const v = y / vDen;
    const distY = Math.min(v, 1.0 - v);
    for (let x = 0; x < width; x++) {
      const u = x / uDen;
      const distX = Math.min(u, 1.0 - u);
      const distEdge = Math.min(distX, distY);
      const idx = y * width + x;
      if (distEdge < outerForce) keep[idx] = 1;
    }
  }

  const featherPx = Math.max(1, Math.round(config.maskFeatherPx ?? 1));
  applyFeatheredAlpha(ctx, imageData, width, height, keep, featherPx);
}

function applyFeatheredAlpha(
  ctx: CanvasRenderingContext2D,
  imageData: ImageData,
  width: number,
  height: number,
  keep: Uint8Array,
  featherRadiusPx: number,
): void {
  const n = width * height;
  const r = featherRadiusPx;
  const kernel = 2 * r + 1;

  // Start from binary keep mask.
  let alpha = new Float32Array(n);
  for (let i = 0; i < n; i++) alpha[i] = keep[i];

  // Separable box blur (fast and stable).
  const tmp = new Float32Array(n);
  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let x = 0; x < width; x++) {
      let sum = 0;
      for (let k = -r; k <= r; k++) {
        const xx = clampInt(x + k, 0, width - 1);
        sum += alpha[row + xx];
      }
      tmp[row + x] = sum / kernel;
    }
  }

  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let x = 0; x < width; x++) {
      let sum = 0;
      for (let k = -r; k <= r; k++) {
        const yy = clampInt(y + k, 0, height - 1);
        sum += tmp[yy * width + x];
      }
      alpha[row + x] = sum / kernel;
    }
  }

  // Write blurred mask back into alpha channel.
  const data = imageData.data;
  for (let i = 0; i < n; i++) {
    data[i * 4 + 3] = Math.round(clamp01(alpha[i]) * 255);
  }
  ctx.putImageData(imageData, 0, 0);
}

function clamp01(x: number): number {
  return Math.max(0.0, Math.min(1.0, x));
}

function clampInt(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x));
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp01((x - edge0) / Math.max(1e-6, edge1 - edge0));
  return t * t * (3.0 - 2.0 * t);
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
