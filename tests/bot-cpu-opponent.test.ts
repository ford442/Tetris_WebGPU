import { describe, it, expect, beforeAll, vi } from 'vitest';
import Game from '../src/game.js';
import { WasmCore } from '../src/wasm/WasmCore.js';
import { applyActionMask } from '../src/replay/actions.js';
import { CpuOpponent } from '../src/bot/CpuOpponent.js';
import { BOT_DIFFICULTIES, parseBotDifficulty } from '../src/bot/difficulty.js';
import { parseCpuVersusUrl } from '../src/bot/url.js';
import { createBotRuntime, SyncSearcher, type BotRuntime, type BotSearcher } from '../src/bot/searchers.js';
import { makeBotCore, readWasmBytes } from './helpers/bot.js';

global.fetch = vi.fn(async () => {
  const buf = readWasmBytes();
  return { ok: true, arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) } as Response;
}) as unknown as typeof fetch;

beforeAll(async () => {
  await WasmCore.init();
});

describe('difficulty + URL parsing', () => {
  it('parses difficulty names case-insensitively and defaults to normal', () => {
    expect(parseBotDifficulty('HARD').id).toBe('hard');
    expect(parseBotDifficulty('expert').id).toBe('expert');
    expect(parseBotDifficulty('nonsense').id).toBe('normal');
    expect(parseBotDifficulty(null).id).toBe('normal');
  });

  it('the ladder is monotone: deeper search, faster reactions, fewer errors as difficulty rises', () => {
    const ladder = ['easy', 'normal', 'hard', 'expert'].map((id) => BOT_DIFFICULTIES[id as keyof typeof BOT_DIFFICULTIES]);
    for (let i = 1; i < ladder.length; i++) {
      const lo = ladder[i - 1]!;
      const hi = ladder[i]!;
      expect(hi.depth).toBeGreaterThan(lo.depth);
      expect(hi.nodeBudget).toBeGreaterThan(lo.nodeBudget);
      expect(hi.reactionTicks).toBeLessThan(lo.reactionTicks);
      expect(hi.interKeyTicks).toBeLessThan(lo.interKeyTicks);
      expect(hi.finesseErrorRate).toBeLessThanOrEqual(lo.finesseErrorRate);
      expect(hi.mistakeRate).toBeLessThanOrEqual(lo.mistakeRate);
      expect(hi.maxPps).toBeGreaterThan(lo.maxPps);
    }
  });

  it('?mode=versus-cpu[&cpu=...] parses; other modes do not', () => {
    expect(parseCpuVersusUrl('?mode=versus-cpu')).toEqual({ difficulty: 'normal' });
    expect(parseCpuVersusUrl('?mode=versus-cpu&cpu=hard')).toEqual({ difficulty: 'hard' });
    expect(parseCpuVersusUrl('?cpu=hard&mode=versus-cpu&renderer=webgl2')).toEqual({ difficulty: 'hard' });
    expect(parseCpuVersusUrl('?mode=versus-cpu&cpu=bogus')).toEqual({ difficulty: 'normal' });
    expect(parseCpuVersusUrl('?mode=versus')).toBeNull();
    expect(parseCpuVersusUrl('?mode=online-versus&room=ABC')).toBeNull();
    expect(parseCpuVersusUrl('')).toBeNull();
  });
});

describe('CpuOpponent', () => {
  it('plays a live Game through the production runtime (sliced fallback in node) with no Worker', async () => {
    const cpu = await CpuOpponent.create('expert', 5);
    expect(cpu.backend).toBe('sliced'); // node has no Worker: the fallback path is the one under test
    const game = new Game();
    game.view = null;
    game.reset({ seed: 5 });
    let masks = 0;
    for (let frame = 0; frame < 1200 && game.runStats.piecesPlaced < 4; frame++) {
      cpu.advance(16.67, game, (mask) => {
        masks++;
        applyActionMask(game, mask);
      });
      await new Promise((r) => setTimeout(r, 0)); // let the idle-callback slices run
      await Promise.resolve();
    }
    expect(game.runStats.piecesPlaced).toBeGreaterThanOrEqual(4);
    expect(masks).toBeGreaterThan(4);
    cpu.dispose();
  }, 30_000);

  it('never runs more than 4 pilot ticks for one rendered frame, however long the frame was', async () => {
    let polls = 0;
    const counting: BotSearcher = {
      request: () => undefined,
      poll: () => {
        polls++;
        return null;
      },
      cancel: () => undefined,
      dispose: () => undefined,
    };
    const runtime: BotRuntime = { searcher: counting, planner: await makeBotCore(), backend: () => 'sync' };
    const cpu = CpuOpponent.fromRuntime(runtime, { ...BOT_DIFFICULTIES.expert, reactionTicks: 0 }, 1);
    const game = new Game();
    game.view = null;
    game.reset({ seed: 1 });
    cpu.advance(10_000, game, () => undefined); // a tab that was in the background for 10 s
    expect(polls).toBe(4);
    cpu.advance(10, game, () => undefined); // the backlog was dropped, not queued
    expect(polls).toBe(4);
    cpu.advance(10, game, () => undefined);
    expect(polls).toBe(5);
  });

  it('reset() forgets the piece in flight so a new game starts cleanly', async () => {
    const runtime: BotRuntime = { searcher: new SyncSearcher(await makeBotCore()), planner: await makeBotCore(), backend: () => 'sync' };
    const cpu = CpuOpponent.fromRuntime(runtime, BOT_DIFFICULTIES.expert, 3);
    const game = new Game();
    game.view = null;
    game.reset({ seed: 3 });
    const first: number[] = [];
    for (let i = 0; i < 40; i++) cpu.advance(16.67, game, (m) => first.push(m));
    cpu.reset(3);
    game.reset({ seed: 3 });
    const second: number[] = [];
    for (let i = 0; i < 40; i++) cpu.advance(16.67, game, (m) => second.push(m));
    expect(second).toEqual(first);
  });

  it('createBotRuntime in node reports the sliced backend and a usable planner', async () => {
    const rt = await createBotRuntime();
    expect(rt.backend()).toBe('sliced');
    rt.searcher.dispose();
  });
});
