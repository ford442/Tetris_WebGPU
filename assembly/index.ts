// assembly/index.ts

// MEMORY LAYOUT:
// Offset 0 - 199: Playfield (10x20 grid, 1 byte per cell)
// We implicitly use this region. No complex allocation needed.

export const WIDTH: i32 = 10;
export const HEIGHT: i32 = 20;

// Internal: Read cell from shared memory
// 1 = Occupied/Wall, 0 = Empty
function getCell(x: i32, y: i32): i8 {
  // Floor & Wall checks
  if (x < 0 || x >= WIDTH || y >= HEIGHT) return 1;
  // Ceiling check (allow spawn/rotation above grid)
  if (y < 0) return 0;
  
  // Direct memory access (FAST)
  return load<i8>(y * WIDTH + x);
}

// Internal: Collision predicate
function isOccupied(x: i32, y: i32): boolean {
  return getCell(x, y) != 0;
}

/**
 * Optimized Collision Check for 4-block Tetrominoes
 * Accepts 4 explicit coordinate pairs to avoid array overhead.
 */
export function checkPieceCollision(
  x1: i32, y1: i32, 
  x2: i32, y2: i32, 
  x3: i32, y3: i32, 
  x4: i32, y4: i32
): boolean {
  if (isOccupied(x1, y1)) return true;
  if (isOccupied(x2, y2)) return true;
  if (isOccupied(x3, y3)) return true;
  if (isOccupied(x4, y4)) return true;
  return false;
}

/**
 * Clear a line and shift rows down.
 * Note: While we could do this in WASM, doing it in JS via 
 * playfield.set() is often easier for the View synchronization 
 * in the early rollout phase. We can add it here later.
 */