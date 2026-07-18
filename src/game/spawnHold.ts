import type { Piece } from './pieces.js';
import type { IView } from '../view/IView.js';
import type { RunStats } from './runStats.js';

export interface SpawnHoldHost {
  activPiece: Piece;
  nextPiece: Piece;
  nextQueue: Piece[];
  nextQueueDepth: number;
  holdPieceObj: Piece | null;
  canHold: boolean;
  infiniteHold?: boolean;
  practiceTopOutRecovery?: boolean;
  lockTimer: number;
  lockResets: number;
  isTSpin: boolean;
  gameOver: boolean;
  runStats: RunStats;
  view: IView | null;
  createPiece(): Piece;
  resetPiecePosition(piece: Piece): void;
  hasCollision(): boolean;
  applyPendingGarbage(): void;
  recoverFromTopOut?(): boolean;
}

export function syncNextPieceField(host: SpawnHoldHost): void {
  host.nextPiece = host.nextQueue[0] ?? host.nextPiece;
}

export function refillNextQueue(host: SpawnHoldHost): void {
  while (host.nextQueue.length < host.nextQueueDepth) {
    host.nextQueue.push(host.createPiece());
  }
  syncNextPieceField(host);
}

export function spawnNextPiece(host: SpawnHoldHost): void {
  host.applyPendingGarbage();
  host.runStats.onPieceLocked();
  host.activPiece = host.nextQueue.shift()!;
  refillNextQueue(host);
  host.canHold = true;
  host.lockTimer = 0;
  host.lockResets = 0;
  host.isTSpin = false;

  if (host.hasCollision()) {
    if (host.recoverFromTopOut) {
      let safety = 0;
      while (host.hasCollision() && host.recoverFromTopOut() && safety < 6) {
        host.resetPiecePosition(host.activPiece);
        safety++;
      }
    }
    if (host.hasCollision() && !host.practiceTopOutRecovery) {
      host.gameOver = true;
      host.view?.onGameOverReactive?.();
    }
  }
}

export function performHold(host: SpawnHoldHost): void {
  if (!host.canHold) return;

  if (!host.holdPieceObj) {
    host.holdPieceObj = host.activPiece;
    host.activPiece = host.nextQueue.shift()!;
    refillNextQueue(host);
  } else {
    const temp = host.activPiece;
    host.activPiece = host.holdPieceObj;
    host.holdPieceObj = temp;
  }

  host.resetPiecePosition(host.activPiece);
  if (host.holdPieceObj) {
    host.resetPiecePosition(host.holdPieceObj);
  }
  if (!host.infiniteHold) {
    host.canHold = false;
  }
  host.lockTimer = 0;
  host.lockResets = 0;
  host.isTSpin = false;
}
