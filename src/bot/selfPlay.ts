/**
 * Headless bot-vs-engine drivers: the CPU opponent playing GameSimulator / VersusLockstepSim with no
 * view, no audio and no clock — only action masks. Used by the regression tests, the benchmark and
 * `npm run bot:selfplay` (weight tuning).
 *
 * STEPPING NOTE: Game.hardDrop() finishes its work (line clear, scoring, spawn of the next piece) one
 * microtask after the call, so a synchronous loop of sim.tick() would keep steering an already-locked
 * piece. These drivers `await` a microtask after any tick that contained a hard drop. This is the
 * stepping the repo has today; when the sim-clock work lands (#561), `stepMask` is the single place to
 * change — nothing else in src/bot/ knows about it.
 */

import { GameSimulator } from '../replay/simulator.js';
import { REPLAY_ACTION } from '../replay/actions.js';
import type { GameModeId } from '../game/modes/types.js';
import { type BotCore } from './BotCore.js';
import { BotPlayer } from './BotPlayer.js';
import type { BotDifficulty } from './difficulty.js';
import { createBotSnapshot, readGameSnapshot } from './gameSnapshot.js';
import { SyncSearcher } from './searchers.js';
import { VersusBotMatch } from './versusMatch.js';

/** A BotPlayer that decides synchronously (own search core + own planner core). */
export function createSyncBotPlayer(search: BotCore, planner: BotCore, difficulty: BotDifficulty, seed: number): BotPlayer {
  return new BotPlayer(planner, new SyncSearcher(search), difficulty, seed);
}

export interface SelfPlayResult {
  /** Pieces locked. */
  pieces: number;
  lines: number;
  score: number;
  ticks: number;
  /** The run ended by topping out (false = reached the piece cap). */
  toppedOut: boolean;
  /** Every non-zero action mask with its tick: the same data a replay recorder stores. */
  inputs: { frame: number; mask: number }[];
  finalHash: number;
}

export interface SelfPlayOptions {
  seed: number;
  /** Stop after this many locked pieces. */
  maxPieces: number;
  /** Safety valve against a stuck pilot. */
  maxTicks?: number;
  difficulty: BotDifficulty;
  mode?: GameModeId;
  /** Pin the gravity/scoring level (stress test: the pilot must keep up with fast drops). */
  level?: number;
  search: BotCore;
  planner: BotCore;
}

/** One tick of a simulator, flushing the hard-drop microtask. */
export async function stepMask(tick: () => void, mask: number): Promise<void> {
  tick();
  if (mask & REPLAY_ACTION.HARD_DROP) await Promise.resolve();
}

export async function runSelfPlay(opts: SelfPlayOptions): Promise<SelfPlayResult> {
  const sim = new GameSimulator(opts.seed, opts.mode ?? 'marathon');
  if (opts.level !== undefined) sim.game.setFixedScoringLevel(opts.level);
  const pilot = createSyncBotPlayer(opts.search, opts.planner, opts.difficulty, opts.seed ^ 0x9e3779b9);
  const snap = createBotSnapshot();
  const inputs: { frame: number; mask: number }[] = [];
  const maxTicks = opts.maxTicks ?? opts.maxPieces * 400;

  let ticks = 0;
  while (!sim.game.isRunEnded && sim.game.runStats.piecesPlaced < opts.maxPieces && ticks < maxTicks) {
    const mask = pilot.nextMask(readGameSnapshot(sim.game, snap));
    if (mask !== 0) inputs.push({ frame: sim.frame, mask });
    await stepMask(() => sim.tick(mask), mask);
    ticks++;
  }
  return {
    pieces: sim.game.runStats.piecesPlaced,
    lines: sim.game.lines,
    score: sim.game.score,
    ticks,
    toppedOut: sim.game.gameOver,
    inputs,
    finalHash: sim.boardHash(),
  };
}

export interface VersusSelfPlayResult {
  winner: 0 | 1 | null;
  frames: number;
  lines: [number, number];
  garbageSent: [number, number];
  pieces: [number, number];
}

/** Two bots in a headless versus match (CPU-vs-CPU): real garbage, real KOs, no view or clock. */
export async function runVersusSelfPlay(opts: {
  seed: number;
  maxFrames: number;
  difficulties: [BotDifficulty, BotDifficulty];
  cores: [{ search: BotCore; planner: BotCore }, { search: BotCore; planner: BotCore }];
}): Promise<VersusSelfPlayResult> {
  const match = new VersusBotMatch(opts.seed);
  const pilots = [
    createSyncBotPlayer(opts.cores[0].search, opts.cores[0].planner, opts.difficulties[0], opts.seed ^ 0x1234567),
    createSyncBotPlayer(opts.cores[1].search, opts.cores[1].planner, opts.difficulties[1], opts.seed ^ 0x7654321),
  ] as const;
  const snaps = [createBotSnapshot(), createBotSnapshot()] as const;

  let frames = 0;
  while (frames < opts.maxFrames && !match.over) {
    const m0 = pilots[0].nextMask(readGameSnapshot(match.games[0], snaps[0]));
    const m1 = pilots[1].nextMask(readGameSnapshot(match.games[1], snaps[1]));
    await match.tick([m0, m1]);
    frames++;
  }
  return {
    winner: match.winner,
    frames,
    lines: [match.games[0].lines, match.games[1].lines],
    garbageSent: [match.garbageSent[0], match.garbageSent[1]],
    pieces: [match.games[0].runStats.piecesPlaced, match.games[1].runStats.piecesPlaced],
  };
}
