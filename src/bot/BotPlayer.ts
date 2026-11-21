/**
 * The CPU pilot: turns "best placement" into the same per-tick ACTION MASK a human's keyboard produces
 * (src/replay/actions.ts), so a bot game records, replays and plugs into GameSimulator.tick(mask) /
 * VersusLockstepSim.tick(m0, m1) exactly like a human one.
 *
 * Control loop, once per 60 Hz tick:
 *
 *   new piece spawned?  -> wait out the reaction delay (and the PPS cap), then ask the searcher
 *   searcher answered?  -> pick the placement (occasionally the runner-up: a human-like mistake)
 *   acting              -> every tick re-plan the shortest input path FROM THE PIECE'S ACTUAL POSE and press
 *                          its first key. Closed-loop on purpose: gravity, a fumbled key or a lock-delay
 *                          nudge simply changes the next plan instead of derailing a pre-computed script.
 *
 * One action per tick, hold on its own tick, hard drop only when the plan is empty (the piece is already
 * resting on its target with the right spin) — which also keeps a T-spin's "last input was a rotation"
 * condition intact.
 */

import { REPLAY_ACTION } from '../replay/actions.js';
import { createSeededRng, type Rng } from '../game/pieces.js';
import { type BotCore } from './BotCore.js';
import type { BotDifficulty } from './difficulty.js';
import type { BotSnapshot } from './gameSnapshot.js';
import type { BotSearcher } from './searchers.js';
import { MOVE, type RankedPlacement } from './types.js';

type Phase = 'idle' | 'thinking' | 'acting';

const MASK_OF_MOVE: Record<number, number> = {
  [MOVE.LEFT]: REPLAY_ACTION.LEFT,
  [MOVE.RIGHT]: REPLAY_ACTION.RIGHT,
  [MOVE.DOWN]: REPLAY_ACTION.DOWN,
  [MOVE.CW]: REPLAY_ACTION.ROTATE_CW,
  [MOVE.CCW]: REPLAY_ACTION.ROTATE_CCW,
};
/** What a fumbled key press looks like: a wrong shift or a stray rotation (never a hard drop or hold). */
const FUMBLES = [REPLAY_ACTION.LEFT, REPLAY_ACTION.RIGHT, REPLAY_ACTION.ROTATE_CW, REPLAY_ACTION.ROTATE_CCW];

export interface BotPlayerStats {
  pieces: number;
  decisions: number;
  replans: number;
  fumbles: number;
  mistakes: number;
  /** Ticks between spawn and the searcher answering (thinking latency, in game time). */
  thinkTicks: number;
}

export class BotPlayer {
  readonly stats: BotPlayerStats = { pieces: 0, decisions: 0, replans: 0, fumbles: 0, mistakes: 0, thinkTicks: 0 };
  /** The placement being executed (hint / debug / HUD). */
  target: RankedPlacement | null = null;

  private rng: Rng;
  private phase: Phase = 'idle';
  private tick = 0;
  private serial = -1;
  private readyTick = 0;
  private nextInputTick = 0;
  private lastDropTick = -1_000_000;
  private thinkStartTick = 0;
  private holdDone = false;
  private boardLoaded = false;

  /**
   * @param planner a BotCore used ONLY for per-tick path planning (never shared with a searcher: the
   *                search keeps its state in the same wasm memory the planner would clobber)
   */
  constructor(
    private readonly planner: BotCore,
    private readonly searcher: BotSearcher,
    private difficulty: BotDifficulty,
    seed = 1,
  ) {
    this.rng = createSeededRng(seed);
  }

  setDifficulty(d: BotDifficulty): void {
    this.difficulty = d;
  }

  /** Forget the current piece (new game). */
  reset(seed?: number): void {
    if (seed !== undefined) this.rng = createSeededRng(seed);
    this.searcher.cancel();
    this.phase = 'idle';
    this.serial = -1;
    this.target = null;
    this.tick = 0;
    this.readyTick = 0;
    this.nextInputTick = 0;
    this.lastDropTick = -1_000_000;
    this.boardLoaded = false;
  }

  /** One 60 Hz tick. @returns the action mask to apply this tick (0 = do nothing). */
  nextMask(snap: BotSnapshot): number {
    const now = ++this.tick;
    if (snap.ended) return 0;

    if (snap.pieceSerial !== this.serial) {
      this.serial = snap.pieceSerial;
      this.searcher.cancel();
      this.phase = 'idle';
      this.target = null;
      this.holdDone = false;
      this.boardLoaded = false;
      const gap = Math.ceil(60 / this.difficulty.maxPps);
      this.readyTick = Math.max(now + this.difficulty.reactionTicks, this.lastDropTick + gap);
    }

    if (this.phase === 'idle') {
      if (now < this.readyTick) return 0;
      this.searcher.request(snap.position, { depth: this.difficulty.depth, beam: this.difficulty.beam }, this.difficulty.nodeBudget);
      this.thinkStartTick = now;
      this.phase = 'thinking';
    }

    if (this.phase === 'thinking') {
      const result = this.searcher.poll();
      if (!result) return 0;
      this.stats.decisions++;
      this.stats.thinkTicks += now - this.thinkStartTick;
      if (result.moves.length === 0) {
        // Nothing lockable: the board is topped out. Slam the piece down and let the game end.
        this.target = null;
        this.phase = 'idle';
        this.readyTick = Number.MAX_SAFE_INTEGER; // until the next spawn re-arms it
        this.lastDropTick = now;
        return REPLAY_ACTION.HARD_DROP;
      }
      let pick = result.moves[0]!;
      if (result.moves.length > 1 && this.rng() < this.difficulty.mistakeRate) {
        pick = result.moves[1]!;
        this.stats.mistakes++;
      }
      this.target = pick;
      this.holdDone = !pick.hold;
      this.phase = 'acting';
      this.nextInputTick = now;
    }

    return this.act(snap, now);
  }

  private act(snap: BotSnapshot, now: number): number {
    const target = this.target;
    if (!target) return 0;
    if (now < this.nextInputTick) return 0;

    if (!this.holdDone) {
      this.holdDone = true;
      this.nextInputTick = now + this.difficulty.interKeyTicks;
      this.boardLoaded = false; // the active piece changes; the board does not, but be strict
      return REPLAY_ACTION.HOLD;
    }
    if (snap.activeType !== target.type) {
      // The hold did not do what the plan expected (or the queue shifted): think again.
      this.phase = 'idle';
      this.readyTick = now + 1;
      return 0;
    }

    if (!this.boardLoaded) {
      this.planner.setPosition(snap.position);
      this.boardLoaded = true;
    }
    const len = this.planner.plan(target.type, snap.piece, target);
    if (len < 0) {
      // Target no longer reachable (stack moved under us): decide again from here.
      this.stats.replans++;
      this.phase = 'idle';
      this.readyTick = now + 1;
      return 0;
    }
    if (len === 0) {
      this.lastDropTick = now;
      this.stats.pieces++;
      this.phase = 'idle';
      this.readyTick = Number.MAX_SAFE_INTEGER; // until the next spawn re-arms it
      return REPLAY_ACTION.HARD_DROP;
    }

    this.nextInputTick = now + this.difficulty.interKeyTicks;
    if (this.difficulty.finesseErrorRate > 0 && this.rng() < this.difficulty.finesseErrorRate) {
      this.stats.fumbles++;
      return FUMBLES[(this.rng() * FUMBLES.length) | 0]!;
    }
    return MASK_OF_MOVE[this.planner.path[0]!] ?? 0;
  }
}
