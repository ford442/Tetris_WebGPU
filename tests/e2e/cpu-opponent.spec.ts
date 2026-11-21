/**
 * The CPU opponent in a real browser: the production build, a real module Worker, the real wasm.
 * Unit tests cover the logic headlessly (tests/bot-*.test.ts); this proves the PACKAGING — the Worker
 * chunk is emitted and loads under the /tetris-webgpu/ base, release.wasm resolves from inside it, the
 * pilot's inputs move pieces on a live board, and `?mode=versus-cpu` wires a CPU into the controller.
 *
 * These specs PUMP the opponent by hand (`cpu.advance`, `hint.update`) instead of waiting for the
 * controller's rAF loop: in this suite's Chromium the TS WebGPU block pipeline is invalid (see
 * knownIssues.ts), so every render throws and the loop stops after one frame — for every mode, not just
 * this one. Pumping exercises the same Worker -> wasm -> pilot -> Game path without depending on that.
 */

import { expect, test } from '@playwright/test';

import { boot, collectConsole, until } from './app.js';

interface CpuProbe {
  controller?: {
    hasCpu: boolean;
    isPlaying: boolean;
    cpu: { backend: string; advance(dt: number, game: unknown, apply: (mask: number) => void): void; player: { stats: { pieces: number; replans: number } } };
    applyCpuMask(mask: number): void;
    players: { game: { runStats: { piecesPlaced: number }; isRunEnded: boolean; playfield: Int8Array; lines: number } }[];
  };
}

test('?mode=versus-cpu wires a CPU into player 2, and it plays pieces from a Worker', async ({ page }) => {
  const log = collectConsole(page);
  await boot(page, { query: { mode: 'versus-cpu', cpu: 'expert' } });

  expect(await page.evaluate(() => (document.getElementById('game-mode-select') as HTMLSelectElement).value)).toBe('versus-cpu');
  expect(await page.evaluate(() => (document.getElementById('cpu-difficulty-select') as HTMLSelectElement).value)).toBe('expert');
  // play() (which resets both boards) runs only after the CPU finished loading: wait for it, or the pump races the reset.
  await until(page, () => !!(window as unknown as CpuProbe).controller?.hasCpu && (window as unknown as CpuProbe).controller!.isPlaying, undefined, { what: 'the match to start with a CPU loaded' });

  const result = await page.evaluate(async () => {
    const c = (window as unknown as CpuProbe).controller!;
    const g = c.players[1]!.game;
    const t0 = performance.now();
    while (g.runStats.piecesPlaced < 6 && performance.now() - t0 < 30_000) {
      c.cpu.advance(16.7, g, (mask) => c.applyCpuMask(mask));
      await new Promise((r) => setTimeout(r, 2));
    }
    return {
      backend: c.cpu.backend,
      cpuPieces: g.runStats.piecesPlaced,
      humanPieces: c.players[0]!.game.runStats.piecesPlaced,
      cells: Array.from(g.playfield).filter(Boolean).length,
      lines: g.lines,
      replans: c.cpu.player.stats.replans,
    };
  });

  expect(result.backend).toBe('worker');
  expect(result.cpuPieces).toBeGreaterThanOrEqual(6);
  // Every locked piece is on its board: 4 cells per piece, minus 10 per cleared line (the CPU stacks cleanly and
  // may clear a couple of lines within 6 pieces; the seed is random per match).
  expect(result.cells).toBe(result.cpuPieces * 4 - result.lines * 10);
  expect(result.humanPieces).toBe(0); // the human has not pressed anything: only the CPU moved
  expect(result.replans).toBe(0);
  expect(log.errors.filter((e) => /bot|worker|release\.wasm/i.test(e))).toEqual([]);
});

test('H cycles the assist hint overlay (best -> top 3 -> off) and marks the run assisted', async ({ page }) => {
  await boot(page, {});
  await page.evaluate(() => (document.getElementById('start-button') as HTMLButtonElement).click());
  await until(page, () => !!(window as unknown as { controller?: { isPlaying: boolean } }).controller?.isPlaying, undefined, { what: 'the game to start' });

  const hintCells = async (): Promise<number> =>
    page.evaluate(async () => {
      const w = window as unknown as { game: { hintCellCount: number }; controller: { hint: { update(g: unknown): void } } };
      for (let i = 0; i < 400; i++) {
        w.controller.hint.update(w.game);
        if (w.game.hintCellCount > 0) break;
        await new Promise((r) => setTimeout(r, 25));
      }
      w.controller.hint.update(w.game);
      return w.game.hintCellCount;
    });

  await page.keyboard.press('KeyH');
  expect(await hintCells()).toBe(4); // best placement: one piece
  expect(await page.evaluate(() => (window as unknown as { game: { assistUsed: boolean } }).game.assistUsed)).toBe(true);

  await page.keyboard.press('KeyH');
  expect(await hintCells()).toBe(12); // top 3: three pieces
  await page.keyboard.press('KeyH');
  expect(
    await page.evaluate(() => {
      const w = window as unknown as { game: { hintCellCount: number } };
      return w.game.hintCellCount;
    }),
  ).toBe(0);
});
