// assembly/index.ts
//
// MEMORY LAYOUT (imported JS Memory, initial 1 page = 64 KiB):
//   Offset   0 – 199 : Board 0 playfield (10×20 grid, 1 byte per cell; 0 = empty)
//   Offset 200 – 399 : Board 1 playfield
//   Offset 400 – 419 : Board 0 row full flags (byte[y] = 1 when row y is full)
//   Offset 420 – 439 : Board 0 temp cleared-index staging during clearLines()
//   Offset 440 – 459 : Board 1 row full flags
//   Offset 460 – 479 : Board 1 temp cleared-index staging
//   clearLinesBoard(id) publishes indices to scratch[0..count) for the JS host
//
// Scoring, T-spin, and lock delay stay in TypeScript.

export const WIDTH: i32 = 10;
export const HEIGHT: i32 = 20;
export const PLAYFIELD_BYTES: i32 = WIDTH * HEIGHT;
export const MAX_BOARDS: i32 = 2;
export const ROW_SCRATCH_BYTES: i32 = HEIGHT;
export const SCRATCH_BLOCK_BYTES: i32 = ROW_SCRATCH_BYTES * 2;
export const SCRATCH_REGION_BASE: i32 = PLAYFIELD_BYTES * MAX_BOARDS;
export const MEMORY_BYTES: i32 = SCRATCH_REGION_BASE + SCRATCH_BLOCK_BYTES * MAX_BOARDS;

// Legacy board-0 offsets (for host parity checks).
export const ROW_SCRATCH_OFFSET: i32 = SCRATCH_REGION_BASE;
export const ROW_INDEX_STAGING_OFFSET: i32 = ROW_SCRATCH_OFFSET + ROW_SCRATCH_BYTES;

function playfieldBase(boardId: i32): i32 {
  return boardId * PLAYFIELD_BYTES;
}

function scratchBase(boardId: i32): i32 {
  return SCRATCH_REGION_BASE + boardId * SCRATCH_BLOCK_BYTES;
}

// Internal: Read cell from shared memory
// 1 = Occupied/Wall, 0 = Empty
function getCell(boardId: i32, x: i32, y: i32): i8 {
  if (x < 0 || x >= WIDTH || y >= HEIGHT) return 1;
  if (y < 0) return 0;
  const base = playfieldBase(boardId);
  return load<i8>(base + y * WIDTH + x);
}

function isOccupied(boardId: i32, x: i32, y: i32): boolean {
  return getCell(boardId, x, y) != 0;
}

function isRowFull(boardId: i32, y: i32): boolean {
  const base = playfieldBase(boardId);
  for (let x: i32 = 0; x < WIDTH; x++) {
    if (load<i8>(base + y * WIDTH + x) == 0) return false;
  }
  return true;
}

function isRowMarked(boardId: i32, y: i32): boolean {
  return load<i8>(scratchBase(boardId) + y) != 0;
}

function setRowMarked(boardId: i32, y: i32, full: boolean): void {
  store<i8>(scratchBase(boardId) + y, full ? 1 : 0);
}

function copyRow(boardId: i32, fromY: i32, toY: i32): void {
  const base = playfieldBase(boardId);
  const srcStart = base + fromY * WIDTH;
  const dstStart = base + toY * WIDTH;
  for (let x: i32 = 0; x < WIDTH; x++) {
    store<i8>(dstStart + x, load<i8>(srcStart + x));
  }
}

/**
 * Scan the playfield for full rows.
 * Sets scratch byte[y] = 1 for each full row.
 * @returns number of full rows found
 */
export function findFullRowsBoard(boardId: i32): i32 {
  let count: i32 = 0;
  for (let y: i32 = 0; y < HEIGHT; y++) {
    const full = isRowFull(boardId, y);
    setRowMarked(boardId, y, full);
    if (full) count++;
  }
  return count;
}

export function findFullRows(): i32 {
  return findFullRowsBoard(0);
}

/**
 * Compact the playfield using row flags in the scratch region.
 * Call findFullRowsBoard() first, or clearLinesBoard() which does both.
 */
export function collapsePlayfieldBoard(boardId: i32): void {
  const base = playfieldBase(boardId);
  let targetY: i32 = HEIGHT - 1;
  for (let y: i32 = HEIGHT - 1; y >= 0; y--) {
    if (!isRowMarked(boardId, y)) {
      if (targetY != y) {
        copyRow(boardId, y, targetY);
      }
      targetY--;
    }
  }

  const clearEnd = base + (targetY + 1) * WIDTH;
  for (let i: i32 = base; i < clearEnd; i++) {
    store<i8>(i, 0);
  }
}

export function collapsePlayfield(): void {
  collapsePlayfieldBoard(0);
}

/**
 * Find full rows, collapse the playfield, and write cleared indices to scratch[0..count).
 * @returns number of lines cleared
 */
export function clearLinesBoard(boardId: i32): i32 {
  const scratch = scratchBase(boardId);
  const count = findFullRowsBoard(boardId);
  if (count == 0) return 0;

  // Snapshot indices before collapse mutates flags in place (flags live at scratch[y]).
  let idx: i32 = 0;
  for (let y: i32 = 0; y < HEIGHT; y++) {
    if (isRowMarked(boardId, y)) {
      store<i8>(scratch + HEIGHT + idx, i8(y));
      idx++;
    }
  }

  collapsePlayfieldBoard(boardId);

  // Publish indices at scratch[0..count) for the JS host.
  for (let i: i32 = 0; i < count; i++) {
    store<i8>(scratch + i, load<i8>(scratch + HEIGHT + i));
  }

  return count;
}

export function clearLines(): i32 {
  return clearLinesBoard(0);
}

/**
 * Optimized Collision Check for 4-block Tetrominoes
 * Accepts 4 explicit coordinate pairs to avoid array overhead.
 * @returns 1 if collision, 0 otherwise
 */
export function checkPieceCollisionBoard(
  boardId: i32,
  x1: i32, y1: i32,
  x2: i32, y2: i32,
  x3: i32, y3: i32,
  x4: i32, y4: i32
): i32 {
  if (isOccupied(boardId, x1, y1)) return 1;
  if (isOccupied(boardId, x2, y2)) return 1;
  if (isOccupied(boardId, x3, y3)) return 1;
  if (isOccupied(boardId, x4, y4)) return 1;
  return 0;
}

export function checkPieceCollision(
  x1: i32, y1: i32,
  x2: i32, y2: i32,
  x3: i32, y3: i32,
  x4: i32, y4: i32
): i32 {
  return checkPieceCollisionBoard(0, x1, y1, x2, y2, x3, y3, x4, y4);
}

/**
 * Hard-drop distance: rows the piece can fall before collision.
 * Block coords are relative to piece origin; pieceX/pieceY is the anchor cell.
 */
export function hardDropDistanceBoard(
  boardId: i32,
  pieceX: i32,
  pieceY: i32,
  x1: i32, y1: i32,
  x2: i32, y2: i32,
  x3: i32, y3: i32,
  x4: i32, y4: i32
): i32 {
  let dropY: i32 = pieceY;
  while (true) {
    const nextY = dropY + 1;
    if (checkPieceCollisionBoard(
      boardId,
      pieceX + x1, nextY + y1,
      pieceX + x2, nextY + y2,
      pieceX + x3, nextY + y3,
      pieceX + x4, nextY + y4
    ) != 0) {
      break;
    }
    dropY = nextY;
  }
  return dropY - pieceY;
}

export function hardDropDistance(
  pieceX: i32,
  pieceY: i32,
  x1: i32, y1: i32,
  x2: i32, y2: i32,
  x3: i32, y3: i32,
  x4: i32, y4: i32
): i32 {
  return hardDropDistanceBoard(0, pieceX, pieceY, x1, y1, x2, y2, x3, y3, x4, y4);
}
