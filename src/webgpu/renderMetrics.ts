export const BOARD_COLUMNS = 10;
export const BOARD_ROWS = 20;
export const BLOCK_WORLD_SIZE = 2.2;
export const BLOCK_HALF_WORLD_SIZE = BLOCK_WORLD_SIZE / 2;

export const BOARD_WORLD_CENTER_X =
  ((BOARD_COLUMNS - 1) * BLOCK_WORLD_SIZE) / 2;
export const BOARD_WORLD_CENTER_Y =
  -((BOARD_ROWS - 1) * BLOCK_WORLD_SIZE) / 2;

export const BLOCK_TEXTURE_ATLAS_COLUMNS = 5;
export const BLOCK_TEXTURE_ATLAS_ROWS = 3;
export const BLOCK_TEXTURE_TILE_COLUMN = 2;
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
