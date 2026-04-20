export const PROCEDURAL_BLOCK_TEXTURE_SIZE = 256;

export type GradientStop = {
  offset: number;
  color: string;
};

export interface BlockTextureGradient {
  addColorStop(offset: number, color: string): void;
}

export interface BlockTexturePainter {
  createLinearGradient(x0: number, y0: number, x1: number, y1: number): BlockTextureGradient;
  fillStyle: string | BlockTextureGradient | CanvasGradient;
  strokeStyle: string;
  lineWidth: number;
  fillRect(x: number, y: number, width: number, height: number): void;
  strokeRect(x: number, y: number, width: number, height: number): void;
}

export function resolveBlockTextureUrl(_moduleUrl?: string): string {
  return currentTextureConfig.url;
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
  
  // Material detection configuration
  /** Method to use for detecting metal vs glass regions */
  materialDetectionMode?: 'luminance' | 'color_signal' | 'alpha' | 'none';
  /** Threshold for metal detection (material-specific) */
  metalThresholdLow?: number;
  /** Threshold for metal detection (material-specific) */
  metalThresholdHigh?: number;
  
  // Fallback behavior
  /** Whether to use procedural texture if loading fails */
  useProceduralFallback?: boolean;
}

/** Default configuration for block.png (4x3 atlas with gold/silver tile) */
export const DEFAULT_BLOCK_TEXTURE_CONFIG: BlockTextureConfig = {
  url: './block.png',
  samplingMode: 'atlas',
  atlasColumns: 4,
  atlasRows: 3,
  atlasTileColumn: 1,
  atlasTileRow: 1,
  atlasTileInset: 0.03,
  materialDetectionMode: 'color_signal',
  metalThresholdLow: 0.8,
  metalThresholdHigh: 1.2,
  useProceduralFallback: true,
};

/** Configuration for single-tile textures (e.g., a single 256x256 block image) */
export const SINGLE_TILE_TEXTURE_CONFIG: BlockTextureConfig = {
  url: './block.png',
  samplingMode: 'single',
  materialDetectionMode: 'luminance',
  metalThresholdLow: 0.45,
  metalThresholdHigh: 0.55,
  useProceduralFallback: true,
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
