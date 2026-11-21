// assembly/bot/shapes.ts
//
// Piece geometry, SRS wall kicks, the bitboard collision test and T-spin classification.
// Everything here mirrors the TypeScript game EXACTLY (including its quirks) — tests/bot-parity.test.ts
// drives the real Game and this code through thousands of random positions and compares them.

import { SHAPES, ROOT_ROWS, KICK_TBL } from './layout';

// Piece type ids: index into "IJLOSTZ" (== the game's colour index - 1).
export const T_I: i32 = 0;
export const T_O: i32 = 3;
export const T_T: i32 = 5;

// NO STATIC DATA: AssemblyScript puts array literals in a data segment starting at offset 12, which is
// the shared board region (0..479) — instantiating into WasmCore's memory would stamp tables over the
// playfields, and the next board write would corrupt the tables. Every table below is therefore written
// into BOT memory by initShapes() (plain stores in code). tests/bot-wasm-core.test.ts proves that
// instantiation touches no memory at all.

/** Define a piece from its rotation-0 cells; fills all four rotations (clockwise turns of the matrix). */
function definePiece(t: i32, n: i32, x0: i32, y0: i32, x1: i32, y1: i32, x2: i32, y2: i32, x3: i32, y3: i32): void {
  for (let r: i32 = 0; r < 4; r++) {
    for (let i: i32 = 0; i < 4; i++) {
      let cx: i32 = i == 0 ? x0 : i == 1 ? x1 : i == 2 ? x2 : x3;
      let cy: i32 = i == 0 ? y0 : i == 1 ? y1 : i == 2 ? y2 : y3;
      // rotatePieceBlocks(clockwise): cell (cx, cy) -> (n - 1 - cy, cx)
      for (let k: i32 = 0; k < r; k++) {
        const nx: i32 = n - 1 - cy;
        cy = cx;
        cx = nx;
      }
      const p: i32 = SHAPES + (t * 4 + r) * 8 + i * 2;
      store<i8>(p, <i8>cx);
      store<i8>(p + 1, <i8>cy);
    }
  }
}

let shapesReady: bool = false;

/**
 * Build the SHAPES and KICK_TBL tables. Shapes mirror src/game/pieces.ts createPieceByType; kicks are the
 * SRS tables of src/game/rotation.ts, 10 offsets (5 kicks x dx,dy) packed 3 bits each (+2 bias) per
 * transition. tests/bot-parity.test.ts re-derives both from the TS sources and compares.
 */
export function initShapes(): void {
  if (shapesReady) return;
  definePiece(0, 4, 0, 1, 1, 1, 2, 1, 3, 1); // I
  definePiece(1, 3, 0, 0, 0, 1, 1, 1, 2, 1); // J
  definePiece(2, 3, 2, 0, 0, 1, 1, 1, 2, 1); // L
  definePiece(3, 4, 1, 1, 2, 1, 1, 2, 2, 2); // O
  definePiece(4, 3, 1, 0, 2, 0, 0, 1, 1, 1); // S
  definePiece(5, 3, 1, 0, 0, 1, 1, 1, 2, 1); // T
  definePiece(6, 3, 0, 0, 1, 0, 1, 1, 2, 1); // Z
  for (let i: i32 = 0; i < 32; i++) store<i32>(KICK_TBL + (i << 2), 0);
  store<i32>(KICK_TBL + 4, 562598994); // JLSTZ 0->1: (0,0) (-1,0) (-1,-1) (0,2) (-1,2)
  store<i32>(KICK_TBL + 12, 596161746); // JLSTZ 0->3: (0,0) (1,0) (1,-1) (0,2) (1,2)
  store<i32>(KICK_TBL + 16, 50967762); // JLSTZ 1->0: (0,0) (1,0) (1,1) (0,-2) (1,-2)
  store<i32>(KICK_TBL + 24, 50967762); // JLSTZ 1->2: (0,0) (1,0) (1,1) (0,-2) (1,-2)
  store<i32>(KICK_TBL + 36, 562598994); // JLSTZ 2->1: (0,0) (-1,0) (-1,-1) (0,2) (-1,2)
  store<i32>(KICK_TBL + 44, 596161746); // JLSTZ 2->3: (0,0) (1,0) (1,-1) (0,2) (1,2)
  store<i32>(KICK_TBL + 48, 17405010); // JLSTZ 3->0: (0,0) (-1,0) (-1,1) (0,-2) (-1,-2)
  store<i32>(KICK_TBL + 56, 17405010); // JLSTZ 3->2: (0,0) (-1,0) (-1,1) (0,-2) (-1,-2)
  store<i32>(KICK_TBL + 68, 56701970); // I 0->1: (0,0) (-2,0) (1,0) (-2,1) (1,-2)
  store<i32>(KICK_TBL + 76, 470107218); // I 0->3: (0,0) (-1,0) (2,0) (-1,-2) (2,1)
  store<i32>(KICK_TBL + 80, 556864786); // I 1->0: (0,0) (2,0) (-1,0) (2,-1) (-1,2)
  store<i32>(KICK_TBL + 88, 470107218); // I 1->2: (0,0) (-1,0) (2,0) (-1,-2) (2,1)
  store<i32>(KICK_TBL + 100, 143459538); // I 2->1: (0,0) (1,0) (-2,0) (1,2) (-2,-1)
  store<i32>(KICK_TBL + 108, 556864786); // I 2->3: (0,0) (2,0) (-1,0) (2,-1) (-1,2)
  store<i32>(KICK_TBL + 112, 143459538); // I 3->0: (0,0) (1,0) (-2,0) (1,2) (-2,-1)
  store<i32>(KICK_TBL + 120, 56701970); // I 3->2: (0,0) (-2,0) (1,0) (-2,1) (1,-2)
  shapesReady = true;
}

// Rows of the board the collision/T-spin helpers read (u16 per row, bit x = column x).
let boardPtr: i32 = ROOT_ROWS;

export function useBoard(ptr: i32): void {
  boardPtr = ptr;
}

export function currentBoard(): i32 {
  return boardPtr;
}

/** true when the piece fits (no wall, floor or block collision). Cells above the top are free. */
export function fits(t: i32, rot: i32, x: i32, y: i32): bool {
  const sp: i32 = SHAPES + (t * 4 + rot) * 8;
  for (let i: i32 = 0; i < 4; i++) {
    const cx: i32 = x + <i32>load<i8>(sp + i * 2);
    const cy: i32 = y + <i32>load<i8>(sp + i * 2 + 1);
    if (<u32>cx >= 10) return false;
    if (cy >= 20) return false;
    if (cy >= 0 && ((<i32>load<u16>(boardPtr + (cy << 1)) >> cx) & 1) != 0) return false;
  }
  return true;
}

/** true when every cell of the piece is on the board (lockable without topping out). */
export function allCellsVisible(t: i32, rot: i32, y: i32): bool {
  const sp: i32 = SHAPES + (t * 4 + rot) * 8;
  for (let i: i32 = 0; i < 4; i++) {
    if (y + <i32>load<i8>(sp + i * 2 + 1) < 0) return false;
  }
  return true;
}

// Rotation result of tryRotate (the kick that succeeded moved the piece here).
export let rotX: i32 = 0;
export let rotY: i32 = 0;

export function kickOffset(t: i32, from: i32, to: i32, k: i32, axis: i32): i32 {
  const isI: i32 = t == T_I ? 1 : 0;
  const packed: i32 = load<i32>(KICK_TBL + ((isI * 16 + from * 4 + to) << 2));
  return ((packed >> (3 * (k * 2 + axis))) & 7) - 2;
}

/**
 * Game-exact SRS rotation (src/game/rotateFlow.ts).
 * @returns -2 blocked, -1 plain rotation, otherwise the kick index (2 or 4) that succeeded.
 *
 * The game's kick loop bumps `kickIndex` twice per iteration (see the header of rotateFlow.ts), so only
 * kick tests 0, 2 and 4 are ever tried — and test 0 is [0,0], the plain rotation that just failed. The
 * bot must reproduce that or it plans rotations the game rejects. tests/bot-parity.test.ts fails the
 * moment either side changes.
 */
export function tryRotate(t: i32, rot: i32, nrot: i32, x: i32, y: i32): i32 {
  if (fits(t, nrot, x, y)) {
    rotX = x;
    rotY = y;
    return -1;
  }
  for (let k: i32 = 2; k < 5; k += 2) {
    const nx: i32 = x + kickOffset(t, rot, nrot, k, 0);
    const ny: i32 = y + kickOffset(t, rot, nrot, k, 1);
    if (fits(t, nrot, nx, ny)) {
      rotX = nx;
      rotY = ny;
      return k;
    }
  }
  return -2;
}

function cornerFilled(x: i32, y: i32): bool {
  if (<u32>x >= 10 || y >= 20) return true;
  if (y < 0) return false;
  return ((<i32>load<u16>(boardPtr + (y << 1)) >> x) & 1) != 0;
}

/**
 * T-spin class of a T piece that just completed a rotation at (x, y, rot): 0 none, 1 mini, 2 full.
 * Port of evaluateTSpin() in src/game/tSpin.ts, including "kick test 5 promotes a mini to a full".
 */
export function tSpinClass(x: i32, y: i32, rot: i32, kick4: bool): i32 {
  const c0: i32 = cornerFilled(x, y) ? 1 : 0;
  const c1: i32 = cornerFilled(x + 2, y) ? 1 : 0;
  const c2: i32 = cornerFilled(x, y + 2) ? 1 : 0;
  const c3: i32 = cornerFilled(x + 2, y + 2) ? 1 : 0;
  if (c0 + c1 + c2 + c3 < 3) return 0;
  let front: i32 = 0;
  if (rot == 0) front = c0 + c1;
  else if (rot == 1) front = c1 + c3;
  else if (rot == 2) front = c2 + c3;
  else front = c0 + c2;
  if (front == 2) return 2;
  if (front == 1) return kick4 ? 2 : 1;
  return 0;
}
