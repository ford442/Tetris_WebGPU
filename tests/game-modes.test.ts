import { describe, it, expect, beforeAll, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import Game from '../src/game';
import { createGameMode } from '../src/game/modes/createGameMode';
import { marathonMode } from '../src/game/modes/marathonMode';
import { sprintMode, SPRINT_LINE_GOAL } from '../src/game/modes/sprintMode';
import { ultraMode, ULTRA_DURATION_MS } from '../src/game/modes/ultraMode';
import type { ModeContext } from '../src/game/modes/types';
import { WasmCore } from '../src/wasm/WasmCore';

function ctx(overrides: Partial<ModeContext> = {}): ModeContext {
  return {
    lines: 0,
    score: 0,
    level: 1,
    elapsedMs: 0,
    gameOver: false,
    victory: false,
    ...overrides,
  };
}

describe('game modes', () => {
  describe('strategy win/lose rules', () => {
    it('marathon only ends on top-out defeat', () => {
      expect(marathonMode.shouldEnd(ctx())).toBe('continue');
      expect(marathonMode.shouldEnd(ctx({ gameOver: true }))).toBe('defeat');
      expect(marathonMode.shouldEnd(ctx({ lines: 100 }))).toBe('continue');
    });

    it('sprint wins at 40 lines', () => {
      expect(sprintMode.shouldEnd(ctx({ lines: SPRINT_LINE_GOAL - 1 }))).toBe('continue');
      expect(sprintMode.shouldEnd(ctx({ lines: SPRINT_LINE_GOAL }))).toBe('victory');
      expect(sprintMode.shouldEnd(ctx({ lines: SPRINT_LINE_GOAL, gameOver: true }))).toBe('victory');
    });

    it('ultra wins when the 120s timer elapses', () => {
      expect(ultraMode.shouldEnd(ctx({ elapsedMs: ULTRA_DURATION_MS - 1 }))).toBe('continue');
      expect(ultraMode.shouldEnd(ctx({ elapsedMs: ULTRA_DURATION_MS }))).toBe('victory');
      expect(ultraMode.shouldEnd(ctx({ gameOver: true }))).toBe('defeat');
    });
  });

  describe('leaderboard policy', () => {
    it('sprint saves time only on victory', () => {
      expect(sprintMode.shouldSaveLeaderboard({
        score: 0,
        lines: 40,
        level: 1,
        elapsedMs: 50000,
        victory: true,
        gameOver: true,
      })).toBe(true);
      expect(sprintMode.shouldSaveLeaderboard({
        score: 0,
        lines: 10,
        level: 1,
        elapsedMs: 50000,
        victory: false,
        gameOver: true,
      })).toBe(false);
    });

    it('ultra saves score when the run ends with points', () => {
      expect(ultraMode.shouldSaveLeaderboard({
        score: 1200,
        lines: 8,
        level: 1,
        elapsedMs: ULTRA_DURATION_MS,
        victory: true,
        gameOver: false,
      })).toBe(true);
    });
  });

  describe('Game integration', () => {
    beforeAll(async () => {
      global.fetch = vi.fn(async (url: string) => {
        if (typeof url === 'string' && url.includes('release.wasm')) {
          const wasmPath = path.resolve(__dirname, '../build/release.wasm');
          const buffer = fs.readFileSync(wasmPath);
          return {
            arrayBuffer: async () => buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength),
            ok: true,
          } as Response;
        }
        throw new Error(`Unexpected fetch: ${url}`);
      });
      await WasmCore.init();
    });

    it('setMode switches strategy and HUD metadata', () => {
      const game = new Game();
      game.setMode('sprint');
      expect(game.modeId).toBe('sprint');
      expect(game.getState().modeLabel).toBe('Sprint 40L');
      expect(game.getState().modeShowLevel).toBe(false);
      expect(game.getEffectiveLevel()).toBe(1);
    });

    it('ultra triggers victory after timer via tickMode', () => {
      const game = new Game();
      game.setMode('ultra');
      game.modeElapsedMs = ULTRA_DURATION_MS - 500;
      game.tickMode(500);
      expect(game.victory).toBe(true);
      expect(game.isRunEnded).toBe(true);
    });

    it('marathon reset keeps endless rules', () => {
      const game = new Game();
      game.setMode('marathon');
      game.gameOver = true;
      game.reset();
      expect(game.gameOver).toBe(false);
      expect(game.victory).toBe(false);
      expect(createGameMode('marathon').id).toBe(marathonMode.id);
    });
  });
});
