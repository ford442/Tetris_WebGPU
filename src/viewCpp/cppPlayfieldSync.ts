export const PLAYFIELD_COLS = 10;
export const PLAYFIELD_ROWS = 20;
export const PLAYFIELD_CELL_COUNT = PLAYFIELD_COLS * PLAYFIELD_ROWS;

/** 12-byte piece state layout — must match cpp/src/piece_state.h */
export const PIECE_STATE_BYTES = 12;

export interface PieceStatePacked {
  pieceType: number;
  rotation: number;
  x: number;
  y: number;
  ghostY: number;
  lockFlash: number;
}

function firstBlockColor(blocks: number[][]): number {
  for (const row of blocks) {
    for (const cell of row) {
      if (cell !== 0) return cell;
    }
  }
  return 0;
}

/** Pack active piece + lock flash for the C++ HEAP piece-state region. */
export function packPieceState(
  state: {
    activePiece?: { blocks: number[][]; x: number; y: number; rotation: number } | null;
    isGameOver?: boolean;
    lockTimer?: number;
    lockDelayTime?: number;
  } | null | undefined,
  ghostY: number,
): Int8Array {
  const out = new Int8Array(PIECE_STATE_BYTES);
  const view = new DataView(out.buffer);

  if (!state?.activePiece || state.isGameOver) {
    return out;
  }

  const piece = state.activePiece;
  out[0] = firstBlockColor(piece.blocks);
  out[1] = Math.max(0, Math.min(3, piece.rotation | 0));
  out[2] = Math.max(-127, Math.min(127, piece.x | 0));
  out[3] = Math.max(-127, Math.min(127, piece.y | 0));
  out[4] = Math.max(-127, Math.min(127, ghostY | 0));

  const lockDelay = state.lockDelayTime ?? 500;
  const lockTimer = state.lockTimer ?? 0;
  const lockFlash = lockTimer > 0 && lockDelay > 0
    ? Math.min(1, lockTimer / lockDelay)
    : 0;
  view.setFloat32(8, lockFlash, true);

  return out;
}

/** Flatten projected playfield grid into 200 signed bytes for the C++ renderer. */
export function flattenPlayfieldGrid(playfield: number[][] | undefined): Int8Array {
  const out = new Int8Array(PLAYFIELD_CELL_COUNT);
  if (!playfield) return out;

  let i = 0;
  for (let y = 0; y < PLAYFIELD_ROWS; y++) {
    const row = playfield[y];
    for (let x = 0; x < PLAYFIELD_COLS; x++) {
      const cell = row?.[x] ?? 0;
      out[i++] = Math.max(-127, Math.min(127, cell | 0));
    }
  }
  return out;
}
