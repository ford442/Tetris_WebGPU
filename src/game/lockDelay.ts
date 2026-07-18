import type { Piece } from './pieces.js';
import type { ScoreEvent } from './scoring.js';
import type { RunStats } from './runStats.js';
import type { ScoringSystem } from './scoring.js';
import type { IView } from '../view/IView.js';

export interface LockUpdateResult {
  linesCleared: number[];
  locked: boolean;
  gameOver: boolean;
  tSpin: boolean;
}

export interface LockDelayHost {
  lockTimer: number;
  lockDelayTime: number;
  lockResets: number;
  maxLockResets: number;
  isRunEnded: boolean;
  activPiece: Piece;
  isTSpin: boolean;
  effectCounter: number;
  gameOver: boolean;
  victory: boolean;
  scoringSystem: ScoringSystem;
  scoreEvent: ScoreEvent | null;
  runStats: RunStats;
  view: IView | null;
  level: number;
  combo: number;
  hasCollision(): boolean;
  lockPiece(): void;
  isPlayfieldEmpty(): boolean;
  notifyModeLineClear(linesCleared: number): void;
  notifyModeLock(): void;
  updatePieces(): void;
  triggerLineClearReactive(
    linesCleared: number,
    combo: number,
    isTSpin: boolean,
    isAllClear: boolean,
  ): void;
  triggerLevelUpReactive(newLevel: number): void;
}

export function handleMoveReset(host: LockDelayHost): void {
  host.activPiece.y += 1;
  const onGround = host.hasCollision();
  host.activPiece.y -= 1;

  if (onGround) {
    if (host.lockResets < host.maxLockResets) {
      host.lockTimer = 0;
      host.lockResets++;
    }
  } else {
    host.lockTimer = -150;
    host.lockResets = 0;
  }
}

export function finishLockUpdate(
  host: LockDelayHost,
  linesScore: number[],
  wasTSpin: boolean,
  result: LockUpdateResult,
): void {
  if (linesScore.length > 0) {
    const isAllClear = host.isPlayfieldEmpty();
    const previousLevel = host.level;
    host.scoreEvent = host.scoringSystem.updateScore(linesScore.length, wasTSpin, isAllClear);
    result.linesCleared.length = 0;
    for (let i = 0; i < linesScore.length; i++) {
      result.linesCleared.push(linesScore[i]);
    }
    result.tSpin = wasTSpin;
    host.triggerLineClearReactive(linesScore.length, host.combo, wasTSpin, isAllClear);
    if (wasTSpin) host.view?.onTSpinReactive?.();
    if (host.level > previousLevel) {
      host.triggerLevelUpReactive(host.level);
    }
    host.notifyModeLineClear(linesScore.length);
    if (host.scoreEvent) {
      host.runStats.onLineClear(host.scoreEvent.combo, host.scoreEvent.backToBack);
    }
  } else {
    host.scoringSystem.resetCombo();
    host.scoreEvent = null;
  }
  host.notifyModeLock();
  host.updatePieces();
  if (host.gameOver || host.victory) result.gameOver = true;
}

function pieceOnGround(host: LockDelayHost): boolean {
  host.activPiece.y += 1;
  const onGround = host.hasCollision();
  host.activPiece.y -= 1;
  return onGround;
}

export async function tickLockDelay(
  host: LockDelayHost,
  dt: number,
  clearLines: () => number[] | Promise<number[]>,
  result: LockUpdateResult,
): Promise<void> {
  if (pieceOnGround(host)) {
    host.lockTimer += dt;
    if (host.lockTimer > host.lockDelayTime + 33) {
      host.effectCounter++;
      host.lockPiece();
      result.locked = true;
      const wasTSpin = host.isTSpin;
      const linesScore = await clearLines();
      finishLockUpdate(host, linesScore, wasTSpin, result);
    }
  } else {
    host.lockTimer = 0;
  }
}

/** Sync path for replay simulator and unit tests. */
export function tickLockDelaySync(
  host: LockDelayHost,
  dt: number,
  clearLines: () => number[],
  result: LockUpdateResult,
): void {
  if (pieceOnGround(host)) {
    host.lockTimer += dt;
    if (host.lockTimer > host.lockDelayTime + 33) {
      host.effectCounter++;
      host.lockPiece();
      result.locked = true;
      const wasTSpin = host.isTSpin;
      const linesScore = clearLines();
      finishLockUpdate(host, linesScore, wasTSpin, result);
    }
  } else {
    host.lockTimer = 0;
  }
}

export function resetLockDelayResult(result: LockUpdateResult): void {
  result.linesCleared.length = 0;
  result.locked = false;
  result.gameOver = false;
  result.tSpin = false;
}
