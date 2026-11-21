/**
 * Reads the live `Game` into the plain data the bot works on. One reusable snapshot object per player
 * (the pilot runs every 60 Hz tick; nothing here allocates after construction except `next` growth).
 */

import type Game from '../game.js';
import type { TSpinResult } from '../game/tSpin.js';
import type { BotPosition, PieceState, SpinClass } from './types.js';

const SPIN: Record<TSpinResult, SpinClass> = { none: 0, mini: 1, normal: 2 };

export interface BotSnapshot {
  /** Live board (not a copy — searchers copy it when a request is made). */
  position: BotPosition;
  /** Letter of the piece under control. */
  activeType: string;
  /** Pose of the piece under control. */
  piece: PieceState;
  /** Changes every time a new piece spawns (and when the game is reset); stable while one piece is in play. */
  pieceSerial: number;
  ended: boolean;
}

export function createBotSnapshot(): BotSnapshot {
  return {
    position: {
      cells: new Int8Array(200),
      active: 'T',
      hold: null,
      canHold: true,
      next: [],
      combo: -1,
      b2b: false,
      incoming: 0,
    },
    activeType: 'T',
    piece: { x: 3, y: -2, rot: 0, spin: 0 },
    pieceSerial: 0,
    ended: false,
  };
}

/** Refresh `out` from `game`. The playfield is referenced, not copied. */
export function readGameSnapshot(game: Game, out: BotSnapshot): BotSnapshot {
  const pos = out.position;
  pos.cells = game.playfield;
  const piece = game.activPiece;
  out.ended = game.isRunEnded || !piece;
  if (piece) {
    out.activeType = piece.type;
    pos.active = piece.type;
    out.piece.x = piece.x;
    out.piece.y = piece.y;
    out.piece.rot = piece.rotation;
    out.piece.spin = SPIN[game.isTSpin];
  }
  pos.hold = game.holdPieceObj ? game.holdPieceObj.type : null;
  pos.canHold = game.canHold;
  const queue = game.nextQueue;
  const n = queue.length;
  const next = pos.next as string[];
  next.length = 0;
  for (let i = 0; i < n; i++) next.push(queue[i]!.type);
  pos.combo = game.scoringSystem.combo;
  pos.b2b = game.scoringSystem.backToBack;
  pos.incoming = game.pendingGarbageRows;
  out.pieceSerial = game.runStats.piecesPlaced;
  return out;
}
