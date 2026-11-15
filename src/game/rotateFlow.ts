/**
 * SRS rotation of the active piece (basic rotation, then wall kicks). Split out of game.ts.
 * Behaviour is verbatim, including the quirk that the kick loop advances `kickIndex` twice per
 * iteration (so every second kick offset is skipped) — changing that alters gameplay and the
 * T-Spin kick indices, so it is deliberately not touched in a refactor.
 */

import type { Piece } from './pieces.js';
import { rotatePieceBlocks, getWallKicks } from './rotation.js';
import type { TSpinResult } from './tSpin.js';

export interface RotateHost {
  activPiece: Piece;
  isTSpin: TSpinResult;
  /** Scratch piece used to probe a rotation without mutating the active piece. */
  _tempPiece: Piece;
  _tempBlocks: number[][];
  hasCollisionPiece(piece: Piece): boolean;
  handleMoveReset(): void;
  checkTSpin(kickIndex?: number): void;
  triggerTSpinReactive(type: TSpinResult): void;
}

/**
 * Copy `src` into `dst` in place. `src` is the shared scratch array that the next rotation
 * overwrites, so the active piece must own its own rows.
 */
function copyBlocksInPlace(dst: number[][], src: number[][]): void {
  for (let i = 0; i < src.length; i++) {
    const srcRow = src[i]!;
    let dstRow = dst[i];
    if (!dstRow || dstRow.length !== srcRow.length) {
      if (!dstRow) dst[i] = dstRow = [];
      dstRow.length = srcRow.length;
    }
    for (let j = 0; j < srcRow.length; j++) {
      dstRow[j] = srcRow[j]!;
    }
  }
  // Trim excess rows if any (should not happen for tetrominoes)
  if (dst.length > src.length) {
    dst.length = src.length;
  }
}

function finishRotation(host: RotateHost, kickIndex: number): void {
  copyBlocksInPlace(host.activPiece.blocks, host._tempPiece.blocks);
  host.activPiece.rotation = host._tempPiece.rotation;
  host.handleMoveReset();
  host.checkTSpin(kickIndex);
  if (host.isTSpin !== 'none' && host.activPiece.type === 'T') {
    host.triggerTSpinReactive(host.isTSpin);
  }
}

export function rotateActivePiece(host: RotateHost, rightTurn: boolean): void {
  const piece = host.activPiece;
  const temp = host._tempPiece;
  const type = piece.type;
  const currentRotation = piece.rotation;
  const nextRotation = rightTurn ? (currentRotation + 1) % 4 : (currentRotation + 3) % 4;

  if (type === 'O') return;

  // Probe on the scratch piece; explicit field copies (no Object.assign) to avoid GC churn.
  temp.x = piece.x;
  temp.y = piece.y;
  temp.type = piece.type;
  temp.blocks = rotatePieceBlocks(piece.blocks, rightTurn, host._tempBlocks);
  temp.rotation = nextRotation;

  if (!host.hasCollisionPiece(temp)) {
    finishRotation(host, -1);
    return;
  }

  // Wall kicks
  const kicks = getWallKicks(type, currentRotation, nextRotation);
  if (!kicks || kicks.length === 0) return;

  for (let kickIndex = 0; kickIndex < kicks.length; kickIndex++) {
    const [ox, oy] = kicks[kickIndex]! as [number, number];
    temp.x = piece.x + ox;
    temp.y = piece.y + oy;

    if (!host.hasCollisionPiece(temp)) {
      piece.x = temp.x;
      piece.y = temp.y;
      finishRotation(host, kickIndex);
      return;
    }
    kickIndex++; // (sic) see file header
  }
}
