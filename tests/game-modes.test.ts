import { describe, it, expect, beforeAll, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import Game from '../src/game';
import { createGameMode, parseGameModeId } from '../src/game/modes/createGameMode';
import { marathonMode } from '../src/game/modes/marathonMode';
import { sprintMode, SPRINT_LINE_GOAL } from '../src/game/modes/sprintMode';
import { ultraMode, ULTRA_DURATION_MS } from '../src/game/modes/ultraMode';
import {
  cheeseMode,
  parseCheeseRowCount,
  resetCheeseRowCountCache,
  CHEESE_DEFAULT_ROWS,
} from '../src/game/modes/cheeseMode';
import { zenMode } from '../src/game/modes/zenMode';
import type { ModeContext } from '../src/game/modes/types';
import { GARBAGE_CELL } from '../src/versus/garbage.js';
import { spawnNextPiece } from '../src/game/spawnHold.js';
import { WasmCore } from '../src/wasm/WasmCore';

function ctx(overrides: Partial<ModeContext> = {}): ModeContext {
  return {
    lines: 0,
    score: 0,
    level: 1,
    elapsedMs: 0,
    gameOver: false,
    victory: false,
    garbageCellsRemaining: 0,
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

    it('cheese wins when all garbage cells are cleared', () => {
      expect(cheeseMode.shouldEnd(ctx({ garbageCellsRemaining: 1 }))).toBe('continue');
      expect(cheeseMode.shouldEnd(ctx({ garbageCellsRemaining: 0 }))).toBe('victory');
      expect(cheeseMode.shouldEnd(ctx({ garbageCellsRemaining: 0, gameOver: true }))).toBe('victory');
      expect(cheeseMode.shouldEnd(ctx({ garbageCellsRemaining: 5, gameOver: true }))).toBe('defeat');
    });

    it('zen never ends competitively', () => {
      expect(zenMode.shouldEnd(ctx())).toBe('continue');
      expect(zenMode.shouldEnd(ctx({ gameOver: true, lines: 999 }))).toBe('continue');
    });
  });

  describe('mode factory', () => {
    it('parseGameModeId accepts cheese and zen', () => {
      expect(parseGameModeId('cheese')).toBe('cheese');
      expect(parseGameModeId('zen')).toBe('zen');
      expect(parseGameModeId('unknown')).toBe('marathon');
    });

    it('createGameMode resolves cheese and zen without marathon fallback', () => {
      expect(createGameMode('cheese').id).toBe('cheese');
      expect(createGameMode('zen').id).toBe('zen');
    });
  });

  describe('cheese row count', () => {
    it('clamps cheeseRows URL param to 5–10', () => {
      resetCheeseRowCountCache();
      expect(parseCheeseRowCount('?cheeseRows=4')).toBe(5);
      resetCheeseRowCountCache();
      expect(parseCheeseRowCount('?cheeseRows=12')).toBe(10);
      resetCheeseRowCountCache();
      expect(parseCheeseRowCount('?cheeseRows=8')).toBe(8);
      resetCheeseRowCountCache();
      expect(parseCheeseRowCount('')).toBe(CHEESE_DEFAULT_ROWS);
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

    it('cheese saves best time on victory only', () => {
      expect(cheeseMode.shouldSaveLeaderboard({
        score: 500,
        lines: 10,
        level: 1,
        elapsedMs: 45000,
        victory: true,
        gameOver: false,
      })).toBe(true);
      expect(cheeseMode.shouldSaveLeaderboard({
        score: 500,
        lines: 10,
        level: 1,
        elapsedMs: 45000,
        victory: false,
        gameOver: true,
      })).toBe(false);
      expect(cheeseMode.getLeaderboardStorageKey()).not.toBe(marathonMode.getLeaderboardStorageKey());
      expect(cheeseMode.getLeaderboardStorageKey()).not.toBe(sprintMode.getLeaderboardStorageKey());
    });

    it('zen does not save leaderboard entries', () => {
      expect(zenMode.shouldSaveLeaderboard({
        score: 0,
        lines: 100,
        level: 1,
        elapsedMs: 60000,
        victory: false,
        gameOver: false,
      })).toBe(false);
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

    it('cheese seeds garbage rows on reset', () => {
      resetCheeseRowCountCache();
      const game = new Game();
      game.setMode('cheese');
      expect(game.countGarbageCells()).toBe(CHEESE_DEFAULT_ROWS * 9);
    });

    it('cheese triggers victory when garbage is cleared', () => {
      const game = new Game();
      game.setMode('cheese');
      for (let i = 0; i < game.playfield.length; i++) {
        if (game.playfield[i] === GARBAGE_CELL) {
          game.playfield[i] = 0;
        }
      }
      game.tickMode(1);
      expect(game.victory).toBe(true);
      expect(game.isRunEnded).toBe(true);
    });

    it('zen recovers from blocked spawn without game over', () => {
      const game = new Game();
      game.setMode('zen');
      for (let y = 0; y < 19; y++) {
        for (let x = 0; x < 10; x++) {
          game.setCell(x, y, 2);
        }
      }
      spawnNextPiece(game);
      expect(game.gameOver).toBe(false);
    });

    it('zen allows infinite hold', () => {
      const game = new Game();
      game.setMode('zen');
      expect(game.infiniteHold).toBe(true);
      game.hold();
      expect(game.canHold).toBe(true);
    });

    it('zen hides score panels in HUD state', () => {
      const game = new Game();
      game.setMode('zen');
      const state = game.getState();
      expect(state.modeShowScore).toBe(false);
      expect(state.modeShowHighScore).toBe(false);
    });
  });
});
