import { describe, it, expect, beforeAll, vi } from 'vitest';
import { WasmCore } from '../src/wasm/WasmCore.js';
import { BOT_DIFFICULTIES, type BotDifficulty } from '../src/bot/difficulty.js';
import { runSelfPlay, runVersusSelfPlay, stepMask } from '../src/bot/selfPlay.js';
import type { BotCore } from '../src/bot/BotCore.js';
import { createReplayFile, decodeInputStream, inputEventsToMap, REPLAY_TICK_MS } from '../src/replay/format.js';
import { GameSimulator } from '../src/replay/simulator.js';
import { REPLAY_ACTION } from '../src/replay/actions.js';
import { makeBotCore, readWasmBytes } from './helpers/bot.js';

global.fetch = vi.fn(async () => {
  const buf = readWasmBytes();
  return { ok: true, arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) } as Response;
}) as unknown as typeof fetch;

let a: { search: BotCore; planner: BotCore };
let b: { search: BotCore; planner: BotCore };
beforeAll(async () => {
  await WasmCore.init();
  a = { search: await makeBotCore(), planner: await makeBotCore() };
  b = { search: await makeBotCore(), planner: await makeBotCore() };
});

const play = (difficulty: BotDifficulty, seed: number, maxPieces = 200, extra: { level?: number } = {}) =>
  runSelfPlay({ seed, maxPieces, difficulty, search: a.search, planner: a.planner, ...extra });

describe('self-play regression (seeded, 200 pieces = 800 cells = at most 80 lines)', () => {
  it.each([
    ['expert', 1],
    ['expert', 42],
    ['hard', 7],
    ['normal', 7],
    ['easy', 7],
  ] as const)('%s (seed %i) survives all 200 pieces and clears >= 70 lines', async (id, seed) => {
    const r = await play(BOT_DIFFICULTIES[id], seed);
    expect(r.toppedOut).toBe(false);
    expect(r.pieces).toBe(200);
    expect(r.lines).toBeGreaterThanOrEqual(70); // a clean stacker wastes < 12% of its cells
    expect(r.lines).toBeLessThanOrEqual(80);
  }, 60_000);

  it('is bit-identical across runs and across wasm instances', async () => {
    const first = await play(BOT_DIFFICULTIES.hard, 99, 120);
    const again = await play(BOT_DIFFICULTIES.hard, 99, 120);
    const other = await runSelfPlay({ seed: 99, maxPieces: 120, difficulty: BOT_DIFFICULTIES.hard, search: b.search, planner: b.planner });
    expect(again).toEqual(first);
    expect(other).toEqual(first);
    const different = await play(BOT_DIFFICULTIES.hard, 100, 120);
    expect(different.finalHash).not.toBe(first.finalHash);
  }, 60_000);

  it('higher difficulty scores more (mean over 6 seeds: depth buys T-spins, combos and tetrises)', async () => {
    // Single seeds are noisy (a lucky T-spin chain doubles a score); the means are cleanly ordered.
    const mean: number[] = [];
    for (const id of ['easy', 'normal', 'hard', 'expert'] as const) {
      let total = 0;
      for (let seed = 1; seed <= 6; seed++) total += (await play(BOT_DIFFICULTIES[id], seed, 120)).score;
      mean.push(total / 6);
    }
    expect(mean, `mean scores ${mean.map(Math.round)}`).toEqual([...mean].sort((x, y) => x - y));
    expect(mean[3]).toBeGreaterThan(mean[0]! * 1.5);
  }, 120_000);
});

describe('the pilot speaks the human action-mask language', () => {
  it('emits at most one action per tick, never mixes hold with a drop, and only uses defined bits', async () => {
    const r = await play(BOT_DIFFICULTIES.hard, 5, 80);
    const defined = Object.values(REPLAY_ACTION).reduce((x, y) => x | y, 0);
    expect(r.inputs.length).toBeGreaterThan(80);
    for (const { mask } of r.inputs) {
      expect(mask & ~defined).toBe(0);
      expect(mask & (mask - 1), `mask ${mask} has several bits`).toBe(0);
    }
    // exactly one hard drop per locked piece
    expect(r.inputs.filter((i) => i.mask === REPLAY_ACTION.HARD_DROP)).toHaveLength(r.pieces);
  });

  it('its input stream round-trips through the replay file format and replays to the same final board', async () => {
    const r = await play(BOT_DIFFICULTIES.hard, 11, 60);
    const file = createReplayFile({ seed: 11, mode: 'marathon', tickMs: REPLAY_TICK_MS, frames: r.ticks }, r.inputs);
    const decoded = decodeInputStream(file.inputs);
    expect(decoded).toEqual(r.inputs);

    // Replay through the same stepping the sim needs (see stepMask): identical board, score and line count.
    const sim = new GameSimulator(file.seed, file.mode);
    const inputs = inputEventsToMap(decoded);
    for (let f = 0; f < file.frames; f++) {
      const mask = inputs.get(f) ?? 0;
      await stepMask(() => sim.tick(mask), mask);
    }
    expect(sim.boardHash()).toBe(r.finalHash);
    expect(sim.game.score).toBe(r.score);
    expect(sim.game.lines).toBe(r.lines);
  }, 60_000);
});

describe('humanizing cadence', () => {
  it('waits out its reaction time before the first key and honours the PPS cap', async () => {
    const slow: BotDifficulty = { ...BOT_DIFFICULTIES.expert, reactionTicks: 25, maxPps: 1 };
    const r = await play(slow, 2, 25);
    expect(r.inputs[0]!.frame).toBeGreaterThanOrEqual(24);
    const drops = r.inputs.filter((i) => i.mask === REPLAY_ACTION.HARD_DROP).map((i) => i.frame);
    for (let i = 1; i < drops.length; i++) expect(drops[i]! - drops[i - 1]!).toBeGreaterThanOrEqual(59); // 60 ticks = 1 piece/s
  });

  it('recovers from fumbled keys: a 30% error rate still stacks cleanly (closed-loop replanning)', async () => {
    const clumsy: BotDifficulty = { ...BOT_DIFFICULTIES.hard, finesseErrorRate: 0.3, mistakeRate: 0 };
    const r = await play(clumsy, 8, 100);
    expect(r.toppedOut).toBe(false);
    expect(r.pieces).toBe(100);
    expect(r.lines).toBeGreaterThanOrEqual(30); // 40 possible; fumbles cost some placements
  }, 60_000);

  it('keeps up with fast gravity (level 15 drops a row every ~6 ticks)', async () => {
    const r = await play({ ...BOT_DIFFICULTIES.expert, maxPps: 20 }, 4, 100, { level: 15 });
    expect(r.toppedOut).toBe(false);
    expect(r.lines).toBeGreaterThanOrEqual(30);
  }, 60_000);
});

describe('CPU vs CPU versus (headless, no network, no clock)', () => {
  const cores = (): [{ search: BotCore; planner: BotCore }, { search: BotCore; planner: BotCore }] => [a, b];

  it('plays a full match to a knockout: the stronger CPU wins and real garbage is exchanged', async () => {
    let wins = 0;
    for (const seed of [1, 2, 3]) {
      const r = await runVersusSelfPlay({ seed, maxFrames: 60 * 60 * 3, difficulties: [BOT_DIFFICULTIES.expert, BOT_DIFFICULTIES.easy], cores: cores() });
      expect(r.winner, `seed ${seed}`).not.toBeNull();
      if (r.winner === 0) wins++;
      expect(r.garbageSent[0]).toBeGreaterThan(0);
    }
    expect(wins).toBe(3);
  }, 120_000);

  it('a match is deterministic frame-for-frame', async () => {
    const one = await runVersusSelfPlay({ seed: 9, maxFrames: 4000, difficulties: [BOT_DIFFICULTIES.hard, BOT_DIFFICULTIES.normal], cores: cores() });
    const two = await runVersusSelfPlay({ seed: 9, maxFrames: 4000, difficulties: [BOT_DIFFICULTIES.hard, BOT_DIFFICULTIES.normal], cores: cores() });
    expect(two).toEqual(one);
  }, 60_000);
});
