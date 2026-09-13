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
  strokeStyle: string | CanvasGradient | CanvasPattern;
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
   *
   * This is the geometric hinge force — it lives in the extractor, not the shader.
   */
  maskOuterForce?: number;

  /**
   * Morphological dilate of the binary metal mask (extracted pixels) before feathering.
   * 1px is enough to keep gold hinges opaque under nearest sampling at cube edges.
   */
  maskDilatePx?: number;

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
   * Written to the GPU as GlassParams (see getGlassParams).
   *   glassOpacity = mix(min, max, pow(1 - NdotV, fresnelPower))
   *
   * Lower min => more transmissive face-on crystal.
   * Higher max => thicker glass at grazing angles.
   */
  authoredGlassMin?: number;
  authoredGlassMax?: number;
  authoredGlassFresnelPower?: number;
}

/**
 * Named glass opacity curve. CPU writes this once from getBlockTextureConfig();
 * the fragment shader reads FragmentUniforms.glassParams (not a generic reserved slot).
 */
export interface GlassParams {
  min: number;
  max: number;
  fresnelPower: number;
}

/** Reference curve matching go.1ink.us/tetris — transmissive face-on, Fresnel edges. */
export const DEFAULT_GLASS_PARAMS: GlassParams = {
  min: 0.05,
  max: 0.60,
  fresnelPower: 2.0,
};

/** Optional albedo LOD bias (negative = sharper). Mask sampling never uses this. */
export const BLOCK_COLOR_LOD_BIAS = 0.0;

export const BLOCK_TEXTURE_CONFIG_JSON = 'blockTextureConfig.json';

/**
 * Default configuration for block.png — subregion mode picking the middle crystal block.
 *
 * Pixel analysis of the 2816×1536 image located gold hinge valleys at:
 *   columns: x ≈ 344, 1037, 1733, 2430
 *   rows:    y ≈ 296, 981
 * The middle full block occupies x=[1037,1733], y=[296,981] (≈696×685 px, nearly square).
 * Normalised: x=1037/2816≈0.368, y=296/1536≈0.193, w=696/2816≈0.247, h=685/1536≈0.446
 *
 * Inset 0.01 keeps those gold hinge strips on the tile border (inset 0.04 shaved
 * them off and left silver-chrome inner metal). Do not crop the top atlas row
 * as a square — the horizontal gold bar at y≈296 would sit in the glass.
 */
export const DEFAULT_BLOCK_TEXTURE_CONFIG: BlockTextureConfig = {
  url: 'block.png',
  samplingMode: 'subregion',
  subregionX: 0.368,
  subregionY: 0.193,
  subregionWidth: 0.247,
  subregionHeight: 0.446,
  subregionInset: 0.01,
  materialDetectionMode: 'color_signal',
  metalThresholdLow: 0.75,
  metalThresholdHigh: 1.20,
  useProceduralFallback: true,
  maskChannel: 'auto',
  authoredGlassMin: DEFAULT_GLASS_PARAMS.min,
  authoredGlassMax: DEFAULT_GLASS_PARAMS.max,
  authoredGlassFresnelPower: DEFAULT_GLASS_PARAMS.fresnelPower,

  // Extractor heuristic defaults (geometric hinge force lives here, not in the shader)
  maskOuterForce: 0.13,
  maskDilatePx: 1,
  maskFeatherPx: 1,
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
  metalThresholdLow: 0.40,
  metalThresholdHigh: 0.55,
  useProceduralFallback: true,
  authoredGlassMin: DEFAULT_GLASS_PARAMS.min,
  authoredGlassMax: DEFAULT_GLASS_PARAMS.max,
  authoredGlassFresnelPower: DEFAULT_GLASS_PARAMS.fresnelPower,

  // Extractor heuristic defaults
  maskOuterForce: 0.13,
  maskDilatePx: 1,
  maskFeatherPx: 1,
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
 * Single opacity curve for TS WebGPU + WebGL2. Reads authored fields from the
 * active BlockTextureConfig only — no 0.38/0.78 material/shader fallbacks.
 */
export function getGlassParams(config: BlockTextureConfig = getBlockTextureConfig()): GlassParams {
  return {
    min: config.authoredGlassMin ?? DEFAULT_GLASS_PARAMS.min,
    max: config.authoredGlassMax ?? DEFAULT_GLASS_PARAMS.max,
    fresnelPower: config.authoredGlassFresnelPower ?? DEFAULT_GLASS_PARAMS.fresnelPower,
  };
}

/** Pack GlassParams into the vec4 written at FragmentUniforms.glassParams (offset 120). */
export function glassParamsToVec4(params: GlassParams = getGlassParams()): Float32Array {
  return new Float32Array([params.min, params.max, params.fresnelPower, 0.0]);
}

/**
 * Shader-identical authored alpha:
 *   metalOpaque = step(0.5, metalMask)
 *   glassOpacity = mix(min, max, pow(1-NdotV, power))
 *   finalAlpha = mix(1, glassOpacity, 1-metalOpaque)
 *   materialAlpha = mix(finalAlpha, 1, metalOpaque)
 */
export function evalAuthoredOutAlpha(
  metalMask: number,
  ndotV: number,
  params: GlassParams = getGlassParams(),
  vertexAlpha = 1,
): number {
  const metalOpaque = metalMask >= 0.5 ? 1 : 0;
  const edgeFresnel = 1 - Math.max(0, Math.min(1, ndotV));
  const power = Math.max(params.fresnelPower, 0.001);
  const glassFresnel = Math.pow(edgeFresnel, power);
  const glassOpacity = params.min + (params.max - params.min) * glassFresnel;
  const finalAlpha = 1 + (glassOpacity - 1) * (1 - metalOpaque);
  const materialAlpha = finalAlpha + (1 - finalAlpha) * metalOpaque;
  return materialAlpha * vertexAlpha;
}

function pickAuthoredTuning(config: BlockTextureConfig): Partial<BlockTextureConfig> {
  return {
    url: config.url,
    authoredGlassMin: config.authoredGlassMin,
    authoredGlassMax: config.authoredGlassMax,
    authoredGlassFresnelPower: config.authoredGlassFresnelPower,
    maskOuterForce: config.maskOuterForce,
    maskDilatePx: config.maskDilatePx,
    maskFeatherPx: config.maskFeatherPx,
    maskUrl: config.maskUrl,
    maskChannel: config.maskChannel,
    maskThreshold: config.maskThreshold,
    metalThresholdLow: config.metalThresholdLow,
    metalThresholdHigh: config.metalThresholdHigh,
    materialDetectionMode: config.materialDetectionMode,
    warmthLumaBandA0: config.warmthLumaBandA0,
    warmthLumaBandA1: config.warmthLumaBandA1,
    warmthLumaBandB0: config.warmthLumaBandB0,
    warmthLumaBandB1: config.warmthLumaBandB1,
    warmthSignalClampMin: config.warmthSignalClampMin,
    warmthSignalClampMax: config.warmthSignalClampMax,
    // Atlas crop stays DEFAULT for large images; inset is Mask Lab–tunable.
    subregionInset: config.subregionInset,
  };
}

/** Resolve blockTextureConfig.json against the Vite deployment base. */
export function resolveBlockTextureConfigUrl(): string {
  const base =
    (typeof import.meta !== 'undefined' && import.meta.env?.BASE_URL) || '/';
  const normalizedBase = base.endsWith('/') ? base : `${base}/`;
  return appendBlockTextureCacheBust(`${normalizedBase}${BLOCK_TEXTURE_CONFIG_JSON}`);
}

/**
 * Load persisted BlockTextureConfig JSON next to the tile (public/blockTextureConfig.json).
 * Returns true when a file was applied; false keeps DEFAULT_BLOCK_TEXTURE_CONFIG.
 */
export async function loadAuthoredBlockTextureConfig(
  fetchImpl: typeof fetch = fetch,
): Promise<boolean> {
  try {
    const url = resolveBlockTextureConfigUrl();
    const res = await fetchImpl(url);
    if (!res.ok) return false;
    const json: unknown = await res.json();
    if (!json || typeof json !== 'object' || Array.isArray(json)) return false;
    setBlockTextureConfig(json as Partial<BlockTextureConfig>);
    return true;
  } catch {
    return false;
  }
}

/**
 * Reset to default configuration
 */
export function resetBlockTextureConfig(): void {
  currentTextureConfig = { ...DEFAULT_BLOCK_TEXTURE_CONFIG };
}

/**
 * Pick atlas vs single-tile crop based on authored image dimensions.
 * go.1ink.us uses a 768×768 single tile; this repo's default atlas is 2816×1536.
 * Wrong subregion coords on a single tile crop a corner sliver and break glass masks.
 */
export function applyBlockTextureConfigForImageDimensions(width: number, height: number): void {
  const maxDim = Math.max(width, height);
  const tuning = pickAuthoredTuning(getBlockTextureConfig());
  if (maxDim >= 2000) {
    setBlockTextureConfig({ ...DEFAULT_BLOCK_TEXTURE_CONFIG, ...tuning });
    return;
  }

  setBlockTextureConfig({
    ...SINGLE_TILE_TEXTURE_CONFIG,
    subregionX: 0,
    subregionY: 0,
    subregionWidth: 1,
    subregionHeight: 1,
    subregionInset: 0.04,
    materialDetectionMode: 'warmth',
    metalThresholdLow: 0.75,
    metalThresholdHigh: 1.15,
    ...tuning,
  });
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

/** Linear anisotropic sampler for albedo. Mask alpha must not use this. */
export function createBlockTextureColorSamplerDescriptor(): GPUSamplerDescriptor {
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

/** Nearest mip-0 sampler for baked metal/glass alpha — prevents linear-filter halos. */
export function createBlockTextureMaskSamplerDescriptor(): GPUSamplerDescriptor {
  return {
    magFilter: 'nearest',
    minFilter: 'nearest',
    mipmapFilter: 'nearest',
    addressModeU: 'clamp-to-edge',
    addressModeV: 'clamp-to-edge',
    lodMinClamp: 0,
    lodMaxClamp: 0,
  };
}

/** @deprecated Use createBlockTextureColorSamplerDescriptor */
export function createBlockTextureSamplerDescriptor(): GPUSamplerDescriptor {
  return createBlockTextureColorSamplerDescriptor();
}

function textureMipCount(texture: GPUTexture): number {
  const count = texture.mipLevelCount ?? 1;
  return Math.max(1, count);
}

/** Color view: full mip chain so anisotropy and mip-3 roughness variance work. */
export function createBlockTextureColorBindingView(texture: GPUTexture): GPUTextureView {
  const mips = Math.min(textureMipCount(texture), BLOCK_TEXTURE_MAX_LOD + 1);
  return texture.createView({
    format: 'rgba8unorm',
    dimension: '2d',
    baseMipLevel: 0,
    mipLevelCount: mips,
  });
}

/** Mask view: mip 0 only of the same RGBA tile. */
export function createBlockTextureMaskBindingView(texture: GPUTexture): GPUTextureView {
  return texture.createView({
    format: 'rgba8unorm',
    dimension: '2d',
    baseMipLevel: 0,
    mipLevelCount: 1,
  });
}

/** @deprecated Use createBlockTextureColorBindingView for albedo. */
export function createBlockTextureBindingView(texture: GPUTexture): GPUTextureView {
  return createBlockTextureColorBindingView(texture);
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
