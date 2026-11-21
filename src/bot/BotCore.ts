/**
 * Thin, allocation-light wrapper over the bot half of release.wasm (assembly/bot/).
 *
 * One BotCore = one wasm instance with its OWN 1-page memory (never the shared playfield memory in
 * WasmCore), so it can live on the main thread (single-thread fallback, hints, the pilot's per-tick
 * path planning) and in a Worker (full-depth search) without the two ever sharing state. The board is
 * COPIED in per decision, which is also what makes a Worker possible.
 */

import { defaultBotWeights, WEIGHT_CAPACITY } from './botData.js';
import {
  pieceTypeId,
  PIECE_TYPES,
  type BotPlacement,
  type BotPosition,
  type PieceState,
  type RankedPlacement,
  type SearchOptions,
  type SearchResult,
  type SpinClass,
} from './types.js';

/** Param slot indices — must match assembly/bot/layout.ts (tests/bot-wasm-core.test.ts checks the wasm agrees). */
export const P = {
  ACTIVE: 0,
  HOLD: 1,
  CAN_HOLD: 2,
  COMBO: 3,
  B2B: 4,
  INCOMING: 5,
  NEXT_COUNT: 6,
  DEPTH: 7,
  BEAM: 8,
  START_X: 9,
  START_Y: 10,
  START_ROT: 11,
  START_SPIN: 12,
  NEXT0: 13,
} as const;
export const MAX_NEXT = 8;
export const SPAWN_X = 3;
export const SPAWN_Y = -2;

const PARAM_SLOTS = 32;
const PL_SIZE = 16;
const GEN_CAP = 80;
const ROOT_SIZE = 24;
const RANK_MAX = 8;

/** Every wasm export of the bot (assembly/bot/api.ts). The test hooks at the bottom are pure and cheap. */
export interface BotExports {
  botInit(): void;
  botResetWeights(): void;
  botCellsPtr(): number;
  botParamsPtr(): number;
  botWeightsPtr(): number;
  botRootRowsPtr(): number;
  botPathPtr(): number;
  botResultPtr(): number;
  botGenPtr(): number;
  botRootPtr(): number;
  botMemoryEnd(): number;
  botSetup(): void;
  botGenerate(t: number): number;
  botPlan(t: number, tx: number, ty: number, trot: number, tspin: number): number;
  botSearchBegin(): void;
  botSearchStep(maxBfs: number): number;
  botSearchDepth(): number;
  botSearchFinish(): number;
  botRootValue(i: number): number;
  botBfsRuns(): number;
  botEval(): number;
  botRootStride(): number;
  botPlacementStride(): number;
  botShapesPtr(): number;
  botWeightCount(): number;
  botSearchDone(): number;
  botSearchRoots(): number;
  // test hooks
  botCollides(t: number, rot: number, x: number, y: number): number;
  botKick(t: number, from: number, to: number, k: number, axis: number): number;
  botRotate(t: number, rot: number, cw: number, x: number, y: number): number;
  botRotX(): number;
  botRotY(): number;
  botTSpinClass(x: number, y: number, rot: number, kick4: number): number;
  botAttackRows(lines: number, spin: number): number;
  botScorePoints(lines: number, spin: number, comboBefore: number, b2b: number, allClear: number): number;
  botApply(t: number, rot: number, x: number, y: number): number;
}

export class BotCore {
  private readonly ex: BotExports;
  private readonly dv: DataView;
  private readonly cells: Int8Array;
  private readonly params: Int32Array;
  private readonly weights: Float32Array;
  private readonly pathView: Uint8Array;
  private readonly pathPtr: number;
  private readonly genPtr: number;
  private readonly rootPtr: number;
  private readonly resultPtr: number;
  private searchStartRuns = 0;

  private constructor(instance: WebAssembly.Instance, memory: WebAssembly.Memory) {
    this.ex = instance.exports as unknown as BotExports;
    this.ex.botInit();
    const buf = memory.buffer;
    this.dv = new DataView(buf);
    this.cells = new Int8Array(buf, this.ex.botCellsPtr(), 200);
    this.params = new Int32Array(buf, this.ex.botParamsPtr(), PARAM_SLOTS);
    this.weights = new Float32Array(buf, this.ex.botWeightsPtr(), WEIGHT_CAPACITY);
    this.pathPtr = this.ex.botPathPtr();
    this.pathView = new Uint8Array(buf, this.pathPtr, 128);
    this.genPtr = this.ex.botGenPtr();
    this.rootPtr = this.ex.botRootPtr();
    this.resultPtr = this.ex.botResultPtr();
    // Ship the JSON weights (identical to the compiled-in defaults unless someone edited the JSON
    // without regenerating — then the JSON wins, which is what "weights as data" means).
    this.weights.set(defaultBotWeights());
    this.params.fill(0);
    this.params[P.HOLD] = -1;
    this.params[P.COMBO] = -1;
    this.params[P.START_X] = SPAWN_X;
    this.params[P.START_Y] = SPAWN_Y;
  }

  /** Instantiate from compiled bytes or an already-compiled Module. */
  static async create(source: BufferSource | WebAssembly.Module): Promise<BotCore> {
    const memory = new WebAssembly.Memory({ initial: 1 });
    const imports = {
      env: {
        memory,
        abort: (_m: number, _f: number, line: number, col: number): void => {
          throw new Error(`bot wasm abort at ${line}:${col}`);
        },
        seed: () => Math.random(),
      },
    };
    let instance: WebAssembly.Instance;
    if (source instanceof WebAssembly.Module) {
      instance = await WebAssembly.instantiate(source, imports);
    } else {
      instance = (await WebAssembly.instantiate(source, imports)).instance;
    }
    return new BotCore(instance, memory);
  }

  /** Bytes of working memory the bot uses (must stay inside the 64 KiB page). */
  get memoryEnd(): number {
    return this.ex.botMemoryEnd();
  }

  /** Replace the evaluator weights (wasm table order, see shared/botDataSchema.json). */
  setWeights(w: Float32Array): void {
    this.weights.fill(0);
    this.weights.set(w.subarray(0, WEIGHT_CAPACITY));
  }

  resetWeights(): void {
    this.weights.set(defaultBotWeights());
  }

  /** Copy a position into wasm memory and pack the bitboard. Cheap (200 bytes + a dozen ints). */
  setPosition(pos: BotPosition): void {
    this.cells.set(pos.cells.length === 200 ? pos.cells : pos.cells.subarray(0, 200));
    const p = this.params;
    p[P.ACTIVE] = pieceTypeId(pos.active);
    p[P.HOLD] = pos.hold === null ? -1 : pieceTypeId(pos.hold);
    p[P.CAN_HOLD] = pos.canHold ? 1 : 0;
    p[P.COMBO] = pos.combo;
    p[P.B2B] = pos.b2b ? 1 : 0;
    p[P.INCOMING] = pos.incoming;
    const n = Math.min(pos.next.length, MAX_NEXT);
    p[P.NEXT_COUNT] = n;
    for (let i = 0; i < n; i++) p[P.NEXT0 + i] = pieceTypeId(pos.next[i]!);
    this.setStart(SPAWN_X, SPAWN_Y, 0, 0);
    this.ex.botSetup();
  }

  /** Start pose used by generate()/plan(): defaults to a fresh spawn. */
  setStart(x: number, y: number, rot: number, spin: number): void {
    this.params[P.START_X] = x;
    this.params[P.START_Y] = y;
    this.params[P.START_ROT] = rot;
    this.params[P.START_SPIN] = spin;
  }

  /** Every lock placement of `type` from the current start pose (spawn unless setStart was called). */
  generate(type: string): BotPlacement[] {
    const typeId = pieceTypeId(type);
    const n = this.ex.botGenerate(typeId);
    const out: BotPlacement[] = [];
    for (let i = 0; i < n && i < GEN_CAP; i++) out.push(this.readPlacement(this.genPtr + i * PL_SIZE));
    return out;
  }

  /**
   * Shortest input path from `from` to `target` on the loaded board, NOT counting the final hard drop.
   * Returns its length (0 = hard-drop right now, -1 = unreachable); the move codes are in `path` until the
   * next call. No allocation.
   */
  plan(type: string, from: PieceState, target: Pick<BotPlacement, 'x' | 'y' | 'rot' | 'spin'>): number {
    this.setStart(from.x, from.y, from.rot, from.spin);
    // A spin target must END in that spin class; a plain target accepts any class (same cells either way).
    return this.ex.botPlan(pieceTypeId(type), target.x, target.y, target.rot, target.spin > 0 ? target.spin : -1);
  }

  /** The move codes written by the last plan() (valid for its returned length). */
  get path(): Uint8Array {
    return this.pathView;
  }

  /** Start an incremental search of the loaded position. */
  searchBegin(opts: SearchOptions): void {
    this.params[P.DEPTH] = opts.depth;
    this.params[P.BEAM] = opts.beam;
    this.searchStartRuns = this.ex.botBfsRuns();
    this.ex.botSearchBegin();
  }

  /** Spend up to `maxBfs` move-generator runs. @returns true when the search is finished. */
  searchStep(maxBfs: number): boolean {
    return this.ex.botSearchStep(maxBfs) !== 0;
  }

  /** Rank what the search has found so far (valid after any step; best-so-far semantics). */
  searchFinish(): SearchResult {
    const n = this.ex.botSearchFinish();
    const moves: RankedPlacement[] = [];
    for (let i = 0; i < Math.min(n, RANK_MAX); i++) {
      const idx = this.dv.getUint16(this.resultPtr + 2 + i * 2, true);
      const placement = this.readPlacement(this.rootPtr + idx * ROOT_SIZE);
      moves.push({ ...placement, value: this.ex.botRootValue(idx) });
    }
    return {
      moves,
      depthReached: this.ex.botSearchDepth(),
      nodes: this.ex.botBfsRuns() - this.searchStartRuns,
    };
  }

  /** Run a whole search synchronously. */
  search(pos: BotPosition, opts: SearchOptions): SearchResult {
    this.setPosition(pos);
    this.searchBegin(opts);
    while (!this.searchStep(1 << 20)) {
      /* run to completion */
    }
    return this.searchFinish();
  }

  /** Evaluator value of the loaded board (test/diagnostic hook). */
  evaluate(): number {
    return this.ex.botEval();
  }

  /** Raw wasm exports for white-box tests. */
  get raw(): BotExports {
    return this.ex;
  }

  private readPlacement(p: number): RankedPlacement {
    const dv = this.dv;
    const typeId = dv.getUint8(p + 4);
    return {
      type: PIECE_TYPES[typeId]!,
      x: dv.getInt8(p),
      y: dv.getInt8(p + 1),
      rot: dv.getUint8(p + 2),
      spin: dv.getUint8(p + 3) as SpinClass,
      hold: dv.getUint8(p + 5) !== 0,
      lines: dv.getUint8(p + 6),
      value: 0,
    };
  }
}
