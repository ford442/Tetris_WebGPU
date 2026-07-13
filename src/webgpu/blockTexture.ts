export const PROCEDURAL_BLOCK_TEXTURE_SIZE = 256;
export const BLOCK_TEXTURE_MAX_LOD = 4;

export type GradientStop = {
  offset: number;
  color: string;
};

export interface BlockTextureGradient {
  addColorStop(offset: number, color: string): void;
}

export interface BlockTexturePainter {
  createLinearGradient(x0: number, y0: number, x1: number, y1: number): BlockTextureGradient;
  fillStyle: string | BlockTextureGradient | CanvasGradient | CanvasPattern;
  strokeStyle: string;
  lineWidth: number;
  fillRect(x: number, y: number, width: number, height: number): void;
  strokeRect(x: number, y: number, width: number, height: number): void;
}

declare const __BLOCK_TEXTURE_CACHE_KEY__: string | undefined;

function appendBlockTextureCacheBust(url: string): string {
  if (!url || url.startsWith('data:')) return url;
  const key =
    typeof __BLOCK_TEXTURE_CACHE_KEY__ !== 'undefined'
      ? __BLOCK_TEXTURE_CACHE_KEY__
      : '';
  if (!key || key === 'missing') return url;
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}v=${key}`;
}

/** Resolve block.png against the Vite deployment base (e.g. /tetris-webgpu/block.png). */
export function resolveBlockTextureUrl(_moduleUrl?: string): string {
  const configured = currentTextureConfig.url;
  // Absolute URLs and data URLs are used as-is.
  if (/^(https?:|data:)/.test(configured)) {
    return appendBlockTextureCacheBust(configured);
  }
  if (configured.startsWith('/')) {
    return appendBlockTextureCacheBust(configured);
  }
  const base =
    (typeof import.meta !== 'undefined' && import.meta.env?.BASE_URL) || '/';
  const normalizedBase = base.endsWith('/') ? base : `${base}/`;
  const asset = configured.replace(/^\.\//, '');
  return appendBlockTextureCacheBust(`${normalizedBase}${asset}`);
}

/** Default authored block texture URL (honours Vite base path). */
export function getDefaultBlockTextureUrl(): string {
  return resolveBlockTextureUrl();
}

// ============================================================================
// BLOCK TEXTURE SAMPLING CONFIGURATION
// ============================================================================

/**
 * Sampling mode for block textures
 * - 'single': Use entire texture as one block (default for simple textures)
 * - 'atlas': Sample from a grid atlas (default for block.png)
 * - 'subregion': Sample from a specific subregion within the texture
 */
export type BlockTextureSamplingMode = 'single' | 'atlas' | 'subregion';

/**
 * Configuration for how to sample block textures
 * This enables support for different image sources with varying layouts
 */
export interface BlockTextureConfig {
  /** URL or path to the texture image */
  url: string;
  
  /** Sampling mode - how to interpret the texture */
  samplingMode: BlockTextureSamplingMode;
  
  // Atlas mode configuration
  /** Number of columns in the texture atlas (for 'atlas' mode) */
  atlasColumns?: number;
  /** Number of rows in the texture atlas (for 'atlas' mode) */
  atlasRows?: number;
  /** Which column to sample from (0-based, for 'atlas' mode) */
  atlasTileColumn?: number;
  /** Which row to sample from (0-based, for 'atlas' mode) */
  atlasTileRow?: number;
  /** Inset to avoid bleeding at tile edges (0.0 - 0.5) */
  atlasTileInset?: number;
  
  // Subregion mode configuration (normalized 0.0 - 1.0 coordinates)
  /** Left coordinate of subregion (for 'subregion' mode) */
  subregionX?: number;
  /** Top coordinate of subregion (for 'subregion' mode) */
  subregionY?: number;
  /** Width of subregion (for 'subregion' mode) */
  subregionWidth?: number;
  /** Height of subregion (for 'subregion' mode) */
  subregionHeight?: number;
  /** Inset inside the subregion to avoid atlas hinge seams (0.0 - 0.2) */
  subregionInset?: number;
  
  // Material detection configuration
  /** Method to use for detecting metal vs glass regions */
  materialDetectionMode?: 'luminance' | 'color_signal' | 'warmth' | 'alpha' | 'none';
  /** Threshold for metal detection (material-specific) */
  metalThresholdLow?: number;
  /** Threshold for metal detection (material-specific) */
  metalThresholdHigh?: number;
  
  // Fallback behavior
  /** Whether to use procedural texture if loading fails */
  useProceduralFallback?: boolean;

  /**
   * Optional companion mask image for metal-vs-glass segmentation.
   * If provided, we crop this mask identically to the texture tile and
   * pack it into the extracted tile's alpha channel (white/opaque=metal).
   *
   * This enables artist/user-provided textures without shader tweaks.
   */
  maskUrl?: string;

  /**
   * How to interpret the mask image.
   * - 'auto' uses mask alpha if it's meaningfully non-opaque, otherwise uses red.
   * - 'alpha' uses mask alpha.
   * - 'red' uses the red channel.
   */
  maskChannel?: 'auto' | 'alpha' | 'red';

  /** If maskChannel is 'red' or 'alpha', threshold used to classify metal. */
  maskThreshold?: number;

  /** Feather radius (in extracted pixels, before baking). ~1-2px usually enough. */
  maskFeatherPx?: number;

  /**
   * Outer-ring force used by the extractor to keep the correct metal component connected
   * to the border (prevents metal/glass halo/disconnected islands).
   *
   * Higher => thicker forced frame region (more conservative "metal stays metal").
   * Lower  => thinner forced frame region (more aggressive glassing near edges).
   */
  maskOuterForce?: number;

  /**
   * Warmth-based heuristic shaping (used when materialDetectionMode='warmth' and no maskImage).
   *
   * Metal "warmth" signal is (r - b) multiplied by a band-pass luma gate:
   *   lumaBand = smoothstep(lumaBandA0, lumaBandA1, luma) * (1 - smoothstep(lumaBandB0, lumaBandB1, luma))
   */
  warmthLumaBandA0?: number;
  warmthLumaBandA1?: number;
  warmthLumaBandB0?: number;
  warmthLumaBandB1?: number;

  /** Optional clamp for the warmth signal (r - b) prior to Otsu thresholding. */
  warmthSignalClampMin?: number;
  warmthSignalClampMax?: number;

  /**
   * Authored sampled-block glass opacity tuning.
   * These params define the reference translucency curve:
   *   glassOpacity = mix(glassMin, glassMax, pow(edgeFresnel, glassFresnelPower))
   * where edgeFresnel = 1 - NdotV.
   *
   * Higher glassMax => more visible through-glass at face-on and edges
   * Higher glassMin => less opaque even at face-on
   * Higher glassFresnelPower => sharper increase toward grazing angles.
   */
  authoredGlassMin?: number;
  authoredGlassMax?: number;
  authoredGlassFresnelPower?: number;
}

/**
 * Default configuration for block.png — subregion mode picking the middle crystal block.
 *
 * Pixel analysis of the 2816×1536 image located dark hinge valleys at:
 *   columns: x ≈ 344, 1037, 1733, 2430
 *   rows:    y ≈ 296, 981
 * The middle full block occupies x=[1037,1733], y=[296,981] (≈695×685 px, nearly square).
 * Normalised: x=1037/2816≈0.368, y=296/1536≈0.193, w=696/2816≈0.247, h=685/1536≈0.446
 */
export const DEFAULT_BLOCK_TEXTURE_CONFIG: BlockTextureConfig = {
  url: 'block.png',
  samplingMode: 'subregion',
  subregionX: 0.368,
  subregionY: 0.193,
  subregionWidth: 0.247,
  subregionHeight: 0.446,
  subregionInset: 0.04,
  materialDetectionMode: 'color_signal',
  metalThresholdLow: 0.80,
  metalThresholdHigh: 1.20,
  useProceduralFallback: true,
  maskChannel: 'auto',
  // Reference curve matching block.png gold frame + crystal interior.
  authoredGlassMin: 0.38,
  authoredGlassMax: 0.78,
  authoredGlassFresnelPower: 2.0,

  // Extractor heuristic defaults
  maskOuterForce: 0.13,
  warmthLumaBandA0: 0.25,
  warmthLumaBandA1: 0.55,
  warmthLumaBandB0: 0.82,
  warmthLumaBandB1: 0.95,
};

/** Configuration for single-tile textures (e.g., a single 256x256 block image) */
export const SINGLE_TILE_TEXTURE_CONFIG: BlockTextureConfig = {
  url: 'block.png',
  samplingMode: 'single',
  materialDetectionMode: 'luminance',
  metalThresholdLow: 0.45,
  metalThresholdHigh: 0.55,
  useProceduralFallback: true,
  authoredGlassMin: 0.38,
  authoredGlassMax: 0.78,
  authoredGlassFresnelPower: 2.0,

  // Extractor heuristic defaults
  maskOuterForce: 0.13,
  warmthLumaBandA0: 0.25,
  warmthLumaBandA1: 0.55,
  warmthLumaBandB0: 0.82,
  warmthLumaBandB1: 0.95,
};

/** Current active texture configuration (can be changed at runtime) */
let currentTextureConfig: BlockTextureConfig = { ...DEFAULT_BLOCK_TEXTURE_CONFIG };

/**
 * Set the active texture configuration
 * Call this before view.preRender() to use a different texture source
 */
export function setBlockTextureConfig(config: Partial<BlockTextureConfig>): void {
  currentTextureConfig = { ...currentTextureConfig, ...config };
}

/**
 * Get the current texture configuration
 */
export function getBlockTextureConfig(): BlockTextureConfig {
  return currentTextureConfig;
}

/**
 * Reset to default configuration
 */
export function resetBlockTextureConfig(): void {
  currentTextureConfig = { ...DEFAULT_BLOCK_TEXTURE_CONFIG };
}

/**
 * Generate atlas sampling parameters for WGSL shaders
 * Returns shader-compatible string values for the current config
 */
export function getAtlasSamplingParams(): {
  columns: number;
  rows: number;
  tileColumn: number;
  tileRow: number;
  inset: number;
} {
  const config = currentTextureConfig;
  return {
    columns: config.atlasColumns ?? 1,
    rows: config.atlasRows ?? 1,
    tileColumn: config.atlasTileColumn ?? 0,
    tileRow: config.atlasTileRow ?? 0,
    inset: config.atlasTileInset ?? 0.0,
  };
}

export function getTextureMipLevelCount(width: number, height: number): number {
  return Math.floor(Math.log2(Math.max(width, height))) + 1;
}

export function createBlockTextureSamplerDescriptor(): GPUSamplerDescriptor {
  return {
    magFilter: 'linear',
    minFilter: 'linear',
    mipmapFilter: 'linear',
    addressModeU: 'clamp-to-edge',
    addressModeV: 'clamp-to-edge',
    lodMinClamp: 0,
    lodMaxClamp: BLOCK_TEXTURE_MAX_LOD,
    maxAnisotropy: 16,
  };
}

/** Bind view for authored block.png — mip 0 only (shader uses textureSampleLevel(..., 0.0)). */
export function createBlockTextureBindingView(texture: GPUTexture): GPUTextureView {
  return texture.createView({
    format: 'rgba8unorm',
    dimension: '2d',
    baseMipLevel: 0,
    mipLevelCount: 1,
  });
}

export function getProceduralBlockTextureGradientStops(): GradientStop[] {
  return [
    { offset: 0, color: '#d9dde5' },
    { offset: 0.24, color: '#f7fbff' },
    { offset: 0.5, color: '#ffffff' },
    { offset: 0.76, color: '#c3ccd9' },
    { offset: 1, color: '#8c96a6' },
  ];
}

export function paintProceduralBlockTexture(ctx: BlockTexturePainter, size = PROCEDURAL_BLOCK_TEXTURE_SIZE): void {
  const gradient = ctx.createLinearGradient(0, 0, size, size);
  for (const stop of getProceduralBlockTextureGradientStops()) {
    gradient.addColorStop(stop.offset, stop.color);
  }

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);

  ctx.strokeStyle = '#d4af37';
  ctx.lineWidth = 8;
  ctx.strokeRect(4, 4, size - 8, size - 8);

  ctx.strokeStyle = '#f0e68c';
  ctx.lineWidth = 2;
  ctx.strokeRect(12, 12, size - 24, size - 24);

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
  ctx.lineWidth = 6;
  ctx.strokeRect(20, 20, size - 40, size * 0.34);

  ctx.strokeStyle = 'rgba(110, 180, 255, 0.22)';
  ctx.lineWidth = 3;
  ctx.strokeRect(28, size * 0.44, size - 56, size * 0.34);
}
