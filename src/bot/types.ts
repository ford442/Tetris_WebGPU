/** Shared types of the CPU opponent. Pure data — no wasm, no DOM — so workers and tests can import freely. */

/** Piece letters in wasm type-id order: id = index (== the game's colour index - 1). */
export const PIECE_TYPES = 'IJLOSTZ';

export function pieceTypeId(type: string): number {
  return PIECE_TYPES.indexOf(type);
}

/** T-spin class: 0 none, 1 mini, 2 full — the same split as TSpinResult. */
export type SpinClass = 0 | 1 | 2;

/** A lock position: where the piece's 3x3/4x4 box origin ends up, in the game's coordinates. */
export interface BotPlacement {
  type: string;
  x: number;
  y: number;
  rot: number;
  spin: SpinClass;
  /** Reached through a hold swap (the pilot must press hold first). */
  hold: boolean;
  /** Lines this lock clears (filled by the search; 0 for plain generator output). */
  lines: number;
}

/** A search answer: the placement plus the value the evaluator ranked it by (higher is better). */
export interface RankedPlacement extends BotPlacement {
  value: number;
}

/** Everything the search needs to know about one side of the board. */
export interface BotPosition {
  /** 200 playfield cells, row-major, row 0 = top (Game.playfield). */
  cells: Int8Array;
  /** Piece letter being controlled right now. */
  active: string;
  /** Held piece letter, or null. */
  hold: string | null;
  canHold: boolean;
  /** Visible upcoming pieces, nearest first. */
  next: readonly string[];
  /** Scoring combo counter (-1 = none), as in ScoringSystem. */
  combo: number;
  /** True when the next difficult clear continues a back-to-back chain. */
  b2b: boolean;
  /** Garbage rows queued against this board. */
  incoming: number;
}

/** A piece's current pose, as the pilot reads it off the live game. */
export interface PieceState {
  x: number;
  y: number;
  rot: number;
  /** T-spin class the game currently holds for this piece (Game.isTSpin). */
  spin: SpinClass;
}

export interface SearchOptions {
  /** Pieces to plan (1 = greedy). Clamped to 1..7 by the wasm. */
  depth: number;
  /** Beam width. Clamped to 1..32. */
  beam: number;
}

export interface SearchResult {
  /** Best-first. Empty when the board has no lockable placement (the bot is already topped out). */
  moves: RankedPlacement[];
  /** How many plies the search completed. */
  depthReached: number;
  /** Move-generator runs spent (the node budget unit). */
  nodes: number;
}

/** Input codes in a planned path (match assembly/bot/moves.ts M_*). */
export const MOVE = { LEFT: 1, RIGHT: 2, DOWN: 3, CW: 4, CCW: 5 } as const;
