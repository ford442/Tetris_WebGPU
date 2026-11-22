import type { Piece } from './pieces.js';

import type { TSpinResult } from './tSpin.js';
import type { RunStats } from './runStats.js';

export interface HardDropResult {
  linesCleared: number[];
  locked: boolean;
  gameOver: boolean;
  tSpin: TSpinResult;
}


export interface HardDropHost {
  activPiece: Piece;
  runStats: RunStats;
  isTSpin: TSpinResult;
  effectEvent: string | null;
  effectCounter: number;
  lastDropPos: { x: number; y: number } | null;
  lastDropDistance: number;
  gameOver: boolean;
  victory: boolean;
  hardDropSnapshot: { blocks: number[][]; x: number } | null;
  gameStateCache: { effectFlag: boolean; neonBurstFlag: boolean };
  getGhostY(): number;
  lockPiece(): void;
  notifyModeLock(): void;
  updatePieces(): void;
  applyLineClearScoring(
    linesScore: number[],
    wasTSpin: TSpinResult,
    result: HardDropResult,
  ): void;
}

export function resetHardDropResult(result: HardDropResult): void {
  result.linesCleared.length = 0;
  result.locked = false;
  result.gameOver = false;
  result.tSpin = 'none';
}

/** Drop to the ghost row and lock. Returns the T-spin state captured before the lock. */
function beginHardDrop(host: HardDropHost, result: HardDropResult): TSpinResult {
  resetHardDropResult(result);

  const ghostY = host.getGhostY();
  if (host.activPiece.y !== ghostY) {
    host.isTSpin = 'none';
  }

  host.hardDropSnapshot = {
    blocks: host.activPiece.blocks,
    x: host.activPiece.x,
  };

  const distance = ghostY - host.activPiece.y;
  host.activPiece.y = ghostY;

  host.effectEvent = 'hardDrop';
  host.effectCounter++;
  host.gameStateCache.effectFlag = true;
  host.gameStateCache.neonBurstFlag = true;

  if (!host.lastDropPos) {
    host.lastDropPos = { x: host.activPiece.x, y: host.activPiece.y };
  } else {
    host.lastDropPos.x = host.activPiece.x;
    host.lastDropPos.y = host.activPiece.y;
  }
  host.lastDropDistance = distance;

  host.runStats.recordHardDrop();

  host.lockPiece();
  result.locked = true;
  return host.isTSpin;
}

function finishHardDrop(
  host: HardDropHost,
  linesScore: number[],
  wasTSpin: TSpinResult,
  result: HardDropResult,
): HardDropResult {
  host.applyLineClearScoring(linesScore, wasTSpin, result);
  host.notifyModeLock();

  host.updatePieces();
  if (host.gameOver || host.victory) result.gameOver = true;

  return result;
}

/**
 * Synchronous hard drop: lock, clear, score and spawn all land before this returns. This is the
 * rules path (live play, replay, lockstep) — see src/replay/frameStepper.ts.
 */
export function performHardDropSync(
  host: HardDropHost,
  clearLines: () => number[],
  result: HardDropResult,
): HardDropResult {
  const wasTSpin = beginHardDrop(host, result);
  return finishHardDrop(host, clearLines(), wasTSpin, result);
}

/** Async variant for a GPU line-detect `clearLines`; not used by the fixed-tick rules step. */
export async function performHardDrop(
  host: HardDropHost,
  clearLines: () => number[] | Promise<number[]>,
  result: HardDropResult,
): Promise<HardDropResult> {
  const wasTSpin = beginHardDrop(host, result);
  const linesScore = await clearLines();
  return finishHardDrop(host, linesScore, wasTSpin, result);
}
