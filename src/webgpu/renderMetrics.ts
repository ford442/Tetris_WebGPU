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
export const BLOCK_TEXTURE_TILE_INSET = 0.03;

export const boardWorldX = (column: number) => column * BLOCK_WORLD_SIZE;
export const boardWorldY = (row: number) => row * -BLOCK_WORLD_SIZE;

export const borderWorldX = (column: number) =>
  boardWorldX(column) - BLOCK_WORLD_SIZE;
export const borderWorldY = (row: number) =>
  boardWorldY(row) + BLOCK_WORLD_SIZE;
