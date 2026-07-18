import type { Piece } from './pieces.js';

export interface HardDropResult {
  linesCleared: number[];
  locked: boolean;
  gameOver: boolean;
  tSpin: boolean;
}

export interface HardDropHost {
  activPiece: Piece;
  isTSpin: boolean;
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
    wasTSpin: boolean,
    result: HardDropResult,
  ): void;
}

export function resetHardDropResult(result: HardDropResult): void {
  result.linesCleared.length = 0;
  result.locked = false;
  result.gameOver = false;
  result.tSpin = false;
}

export async function performHardDrop(
  host: HardDropHost,
  clearLines: () => number[] | Promise<number[]>,
  result: HardDropResult,
): Promise<HardDropResult> {
  resetHardDropResult(result);

  const ghostY = host.getGhostY();
  if (host.activPiece.y !== ghostY) {
    host.isTSpin = false;
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

  host.lockPiece();
  result.locked = true;

  const wasTSpin = host.isTSpin;
  const linesScore = await clearLines();
  host.applyLineClearScoring(linesScore, wasTSpin, result);
  host.notifyModeLock();

  host.updatePieces();
  if (host.gameOver || host.victory) result.gameOver = true;

  return result;
}
