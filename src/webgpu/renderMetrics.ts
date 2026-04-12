import { getBlockTextureConfig } from './blockTexture.js';

export const BOARD_COLUMNS = 10;
export const BOARD_ROWS = 20;
export const BLOCK_WORLD_SIZE = 2.2;
export const BLOCK_HALF_WORLD_SIZE = BLOCK_WORLD_SIZE / 2;

export const BOARD_WORLD_CENTER_X =
  ((BOARD_COLUMNS - 1) * BLOCK_WORLD_SIZE) / 2;
export const BOARD_WORLD_CENTER_Y =
  -((BOARD_ROWS - 1) * BLOCK_WORLD_SIZE) / 2;

// ============================================================================
// TEXTURE ATLAS CONSTANTS - Dynamic based on BlockTextureConfig
// 
// These constants are maintained for backward compatibility but now
// derive their values from the configurable BlockTextureConfig.
// 
// For new code, prefer using getBlockTextureConfig() directly or
// the textureSampling utilities which provide runtime-configurable
// shader code.
// ============================================================================

/**
 * Get the current atlas configuration based on BlockTextureConfig
 * This allows runtime changes to texture layout
 */
export function getAtlasConfig() {
  const config = getBlockTextureConfig();
  return {
    columns: config.atlasColumns ?? 4,
    rows: config.atlasRows ?? 3,
    tileColumn: config.atlasTileColumn ?? 1,
    tileRow: config.atlasTileRow ?? 1,
    tileInset: config.atlasTileInset ?? 0.03,
  };
}

// Legacy constants - kept for backward compatibility
// These will use the default config values
export const BLOCK_TEXTURE_ATLAS_COLUMNS = 4;
export const BLOCK_TEXTURE_ATLAS_ROWS = 3;
export const BLOCK_TEXTURE_TILE_COLUMN = 1;
export const BLOCK_TEXTURE_TILE_ROW = 1;
// Keep a small inset inside the chosen atlas tile to avoid filtering bleed
// from neighboring tiles along the gold frame seams.
export const BLOCK_TEXTURE_TILE_INSET = 0.03;

/**
 * Converts a zero-based board column into world-space X where the leftmost
 * playable block starts at x=0 and each block advances by one block width.
 */
export const boardWorldX = (column: number) => column * BLOCK_WORLD_SIZE;
/**
 * Converts a zero-based board row into world-space Y where the top row is y=0
 * and positive row indices move downward in screen space, hence the negation.
 */
export const boardWorldY = (row: number) => row * -BLOCK_WORLD_SIZE;

/**
 * Converts a zero-based border column into world-space X for the 12-column
 * decorative frame, which extends exactly one block left/right of the board.
 */
export const borderWorldX = (column: number) =>
  boardWorldX(column) - BLOCK_WORLD_SIZE;
/**
 * Converts a zero-based border row into world-space Y for the 22-row
 * decorative frame, which extends exactly one block above/below the board.
 */
export const borderWorldY = (row: number) =>
  boardWorldY(row) + BLOCK_WORLD_SIZE;
