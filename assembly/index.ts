// assembly/index.ts
//
// MEMORY LAYOUT (imported JS Memory, initial 1 page = 64 KiB):
//   Offset   0 – 199 : Playfield (10×20 grid, 1 byte per cell; 0 = empty)
//   Offset 200 – 219 : Row full flags (byte[y] = 1 when row y is full)
//   Offset 220 – 239 : Temp cleared-index staging during clearLines()
//   clearLines() publishes indices to scratch[0..count) for the JS host
//
// Scoring, T-spin, and lock delay stay in TypeScript.

export const WIDTH: i32 = 10;
export const HEIGHT: i32 = 20;
export const PLAYFIELD_BYTES: i32 = WIDTH * HEIGHT;
export const ROW_SCRATCH_OFFSET: i32 = PLAYFIELD_BYTES;
export const ROW_SCRATCH_BYTES: i32 = HEIGHT;
export const ROW_INDEX_STAGING_OFFSET: i32 = ROW_SCRATCH_OFFSET + ROW_SCRATCH_BYTES;

// Internal: Read cell from shared memory
// 1 = Occupied/Wall, 0 = Empty
function getCell(x: i32, y: i32): i8 {
  if (x < 0 || x >= WIDTH || y >= HEIGHT) return 1;
  if (y < 0) return 0;
  return load<i8>(y * WIDTH + x);
}

function isOccupied(x: i32, y: i32): boolean {
  return getCell(x, y) != 0;
}

function isRowFull(y: i32): boolean {
  for (let x: i32 = 0; x < WIDTH; x++) {
    if (load<i8>(y * WIDTH + x) == 0) return false;
  }
  return true;
}

function isRowMarked(y: i32): boolean {
  return load<i8>(ROW_SCRATCH_OFFSET + y) != 0;
}

function setRowMarked(y: i32, full: boolean): void {
  store<i8>(ROW_SCRATCH_OFFSET + y, full ? 1 : 0);
}

function copyRow(fromY: i32, toY: i32): void {
  const srcStart = fromY * WIDTH;
  const dstStart = toY * WIDTH;
  for (let x: i32 = 0; x < WIDTH; x++) {
    store<i8>(dstStart + x, load<i8>(srcStart + x));
  }
}

/**
 * Scan the playfield for full rows.
 * Sets scratch byte[y] = 1 for each full row.
 * @returns number of full rows found
 */
export function findFullRows(): i32 {
  let count: i32 = 0;
  for (let y: i32 = 0; y < HEIGHT; y++) {
    const full = isRowFull(y);
    setRowMarked(y, full);
    if (full) count++;
  }
  return count;
}

/**
 * Compact the playfield using row flags in the scratch region (offset 200).
 * Call findFullRows() first, or clearLines() which does both.
 */
export function collapsePlayfield(): void {
  let targetY: i32 = HEIGHT - 1;
  for (let y: i32 = HEIGHT - 1; y >= 0; y--) {
    if (!isRowMarked(y)) {
      if (targetY != y) {
        copyRow(y, targetY);
      }
      targetY--;
    }
  }

  const clearEnd = (targetY + 1) * WIDTH;
  for (let i: i32 = 0; i < clearEnd; i++) {
    store<i8>(i, 0);
  }
}

/**
 * Find full rows, collapse the playfield, and write cleared indices to scratch[0..count).
 * @returns number of lines cleared
 */
export function clearLines(): i32 {
  const count = findFullRows();
  if (count == 0) return 0;

  // Snapshot indices before collapse mutates flags in place (flags live at scratch[y]).
  let idx: i32 = 0;
  for (let y: i32 = 0; y < HEIGHT; y++) {
    if (isRowMarked(y)) {
      store<i8>(ROW_SCRATCH_OFFSET + HEIGHT + idx, i8(y));
      idx++;
    }
  }

  collapsePlayfield();

  // Publish indices at scratch[0..count) for the JS host.
  for (let i: i32 = 0; i < count; i++) {
    store<i8>(
      ROW_SCRATCH_OFFSET + i,
      load<i8>(ROW_SCRATCH_OFFSET + HEIGHT + i)
    );
  }

  return count;
}

/**
 * Optimized Collision Check for 4-block Tetrominoes
 * Accepts 4 explicit coordinate pairs to avoid array overhead.
 * @returns 1 if collision, 0 otherwise
 */
export function checkPieceCollision(
  x1: i32, y1: i32,
  x2: i32, y2: i32,
  x3: i32, y3: i32,
  x4: i32, y4: i32
): i32 {
  if (isOccupied(x1, y1)) return 1;
  if (isOccupied(x2, y2)) return 1;
  if (isOccupied(x3, y3)) return 1;
  if (isOccupied(x4, y4)) return 1;
  return 0;
}

/**
 * Hard-drop distance: rows the piece can fall before collision.
 * Block coords are relative to piece origin; pieceX/pieceY is the anchor cell.
 */
export function hardDropDistance(
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
    if (checkPieceCollision(
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
