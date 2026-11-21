/**
 * Assist hints: the CPU's best placements drawn with the existing ghost renderer (no new shader).
 *
 * Press H in a single-player mode: best placement -> top 3 -> off. The cells go into Game.hintCells and
 * the playfield projection draws them like the ghost (negative colour index). Using a hint marks the run
 * as assisted (Game.assistUsed), which keeps it off the leaderboards.
 *
 * The overlay recomputes only when the position changes (new piece, hold, new board), never per frame.
 */

import type Game from '../game.js';
import { rotatePieceBlocks } from '../game/rotation.js';
import { PieceGenerator } from '../game/pieces.js';
import { BotCore } from './BotCore.js';
import { createBotSnapshot, readGameSnapshot, type BotSnapshot } from './gameSnapshot.js';
import { fetchBotWasm } from './loadWasm.js';
import { PIECE_TYPES, type BotPlacement, type RankedPlacement, type BotPosition } from './types.js';

/** Hint search effort: 2 plies, narrow beam — a few ms of wasm, only when the position changes. */
export const HINT_SEARCH = { depth: 3, beam: 8, nodeBudget: 40 } as const;
export const MAX_HINTS = 3;

const pieceMaker = new PieceGenerator();

/** Absolute board cells (x0, y0, x1, y1, …) a placement occupies, written into `out`. */
export function placementCells(p: Pick<BotPlacement, 'type' | 'x' | 'y' | 'rot'>, out: number[] = []): number[] {
  let blocks = pieceMaker.createPieceByType(p.type).blocks;
  for (let r = 0; r < p.rot; r++) blocks = rotatePieceBlocks(blocks, true).map((row) => row.slice());
  out.length = 0;
  for (let cy = 0; cy < blocks.length; cy++) {
    for (let cx = 0; cx < blocks[cy]!.length; cx++) {
      if (blocks[cy]![cx]) out.push(p.x + cx, p.y + cy);
    }
  }
  return out;
}

/** Best `count` placements for a position (best first). */
export function computeHints(core: BotCore, position: BotPosition, count = MAX_HINTS): RankedPlacement[] {
  const result = core.search(position, { depth: HINT_SEARCH.depth, beam: HINT_SEARCH.beam });
  return result.moves.slice(0, count);
}

/** Write placements into the game's hint buffer. @returns number of cells written. */
export function writeHintCells(game: Game, hints: readonly RankedPlacement[]): number {
  const cells: number[] = [];
  let n = 0;
  for (const h of hints.slice(0, MAX_HINTS)) {
    placementCells(h, cells);
    const colour = PIECE_TYPES.indexOf(h.type) + 1;
    for (let i = 0; i < cells.length && n < game.hintCells.length / 3; i += 2) {
      game.hintCells[n * 3] = cells[i]!;
      game.hintCells[n * 3 + 1] = cells[i + 1]!;
      game.hintCells[n * 3 + 2] = colour;
      n++;
    }
  }
  game.hintCellCount = n;
  return n;
}

export type HintLevel = 0 | 1 | 3;

export class HintOverlay {
  level: HintLevel = 0;
  /** True when the best hint plays the held piece (press hold first). */
  suggestsHold = false;
  private core: BotCore | null = null;
  private loading: Promise<void> | null = null;
  private snap: BotSnapshot = createBotSnapshot();
  private key = '';
  private lastSerial = -1;

  /** off -> best -> top 3 -> off. Loads the wasm on first use. */
  cycle(game: Game): HintLevel {
    this.level = this.level === 0 ? 1 : this.level === 1 ? 3 : 0;
    this.key = '';
    if (this.level === 0) {
      this.clear(game);
    } else {
      game.assistUsed = true;
      void this.ensureCore();
    }
    return this.level;
  }

  /** Test seam / eager init. */
  async ensureCore(core?: BotCore): Promise<void> {
    if (this.core) return;
    if (core) {
      this.core = core;
      return;
    }
    this.loading ??= fetchBotWasm()
      .then((bytes) => BotCore.create(bytes))
      .then((c) => {
        this.core = c;
      })
      .catch(() => {
        this.level = 0; // no wasm, no hints — fail quiet, the game itself is unaffected
      });
    await this.loading;
  }

  clear(game: Game): void {
    game.hintCellCount = 0;
    this.suggestsHold = false;
  }

  /** Call once per frame: recompute only when the position changed. */
  update(game: Game): void {
    if (this.level === 0 || !this.core) return;
    if (game.isRunEnded || !game.activPiece) {
      this.clear(game);
      return;
    }
    const snap = readGameSnapshot(game, this.snap);
    if (snap.pieceSerial < this.lastSerial) this.key = '';
    this.lastSerial = snap.pieceSerial;
    const p = snap.position;
    const key = `${snap.pieceSerial}|${snap.activeType}|${p.hold}|${p.canHold}|${this.level}|${boardHash(p.cells)}`;
    if (key === this.key) return;
    this.key = key;
    game.assistUsed = true; // hints on screen == assisted, even if the run was reset while the overlay stayed on
    const hints = computeHints(this.core, p, this.level);
    this.suggestsHold = hints[0]?.hold ?? false;
    writeHintCells(game, hints);
  }
}

function boardHash(cells: Int8Array): number {
  let h = 2166136261;
  for (let i = 0; i < cells.length; i++) h = Math.imul(h ^ (cells[i]! + 1), 16777619);
  return h >>> 0;
}
