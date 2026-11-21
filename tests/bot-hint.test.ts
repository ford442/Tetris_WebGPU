import { describe, it, expect, beforeAll, vi } from 'vitest';
import Game from '../src/game.js';
import { WasmCore } from '../src/wasm/WasmCore.js';
import type { BotCore } from '../src/bot/BotCore.js';
import { createBotSnapshot, readGameSnapshot } from '../src/bot/gameSnapshot.js';
import { computeHints, HintOverlay, HINT_SEARCH, placementCells } from '../src/bot/hint.js';
import { saveModeLeaderboard, type LeaderboardSaveHost } from '../src/game/leaderboardSave.js';
import { marathonMode } from '../src/game/modes/marathonMode.js';
import { ScoringSystem } from '../src/game/scoring.js';
import { makeBotCore, makePiece, randomCells, readWasmBytes } from './helpers/bot.js';

global.fetch = vi.fn(async () => {
  const buf = readWasmBytes();
  return { ok: true, arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) } as Response;
}) as unknown as typeof fetch;

let core: BotCore;
let game: Game;
beforeAll(async () => {
  await WasmCore.init();
  core = await makeBotCore();
  game = new Game();
  game.view = null;
});

function freshGame(seed: number, rows = 0): Game {
  game.reset({ seed });
  if (rows > 0) game.playfield.set(randomCells(seed, rows, 0.6));
  game.collisionDetector.updatePlayfield(game.playfield);
  return game;
}

/** Negative cells in the projected playfield are ghost-style cells; return them as "x,y" keys. */
function ghostCells(g: Game): Set<string> {
  const out = new Set<string>();
  g.getState().playfield.forEach((row, y) => row.forEach((v, x) => v < 0 && out.add(`${x},${y}`)));
  return out;
}

describe('hint placements match the move generator', () => {
  it('every hinted placement is a placement the generator produces for that piece (acceptance criterion)', () => {
    for (let seed = 1; seed <= 25; seed++) {
      const g = freshGame(seed, 4 + (seed % 9));
      const pos = readGameSnapshot(g, createBotSnapshot()).position;
      const hints = computeHints(core, pos, 3);
      expect(hints.length).toBeGreaterThan(0);
      for (const h of hints) {
        core.setPosition(pos);
        const generated = core.generate(h.type);
        expect(
          generated.some((p) => p.x === h.x && p.y === h.y && p.rot === h.rot),
          `seed ${seed}: hint ${h.type}@${h.x},${h.y} rot ${h.rot} is not in the generator output`,
        ).toBe(true);
      }
    }
  });

  it('the best hint is the search winner, and top-3 are distinct and ranked best-first', () => {
    const g = freshGame(3, 8);
    const pos = readGameSnapshot(g, createBotSnapshot()).position;
    const search = core.search(pos, { depth: HINT_SEARCH.depth, beam: HINT_SEARCH.beam });
    const hints = computeHints(core, pos, 3);
    expect(hints[0]).toEqual(search.moves[0]);
    expect(hints).toHaveLength(3);
    expect(new Set(hints.map((h) => `${h.type}${h.x},${h.y},${h.rot}`)).size).toBe(3);
    expect(hints[0]!.value).toBeGreaterThanOrEqual(hints[1]!.value);
  });

  it('placementCells returns the four board cells the piece would occupy', () => {
    for (const type of 'IJLOSTZ') {
      for (let rot = 0; rot < 4; rot++) {
        const piece = makePiece(type, 2, 5, rot);
        const expected: number[] = [];
        piece.blocks.forEach((row, cy) => row.forEach((v, cx) => v && expected.push(2 + cx, 5 + cy)));
        expect(placementCells({ type, x: 2, y: 5, rot })).toEqual(expected);
        expect(expected).toHaveLength(8);
      }
    }
  });
});

describe('HintOverlay drives Game.hintCells and the ghost projection', () => {
  it('off -> best (4 cells) -> top 3 (12 cells) -> off, drawing them as ghost cells in the state', async () => {
    const g = freshGame(5, 6);
    const overlay = new HintOverlay();
    await overlay.ensureCore(core);

    expect(overlay.level).toBe(0);
    overlay.update(g);
    expect(g.hintCellCount).toBe(0);

    const ghostOnly = ghostCells(g); // the ordinary landing ghost
    expect(overlay.cycle(g)).toBe(1);
    overlay.update(g);
    expect(g.hintCellCount).toBe(4);
    const best = computeHints(core, readGameSnapshot(g, createBotSnapshot()).position, 1)[0]!;
    const bestKeys = new Set<string>();
    const c = placementCells(best);
    for (let i = 0; i < c.length; i += 2) bestKeys.add(`${c[i]},${c[i + 1]}`);
    const withHint = ghostCells(g);
    for (const k of bestKeys) expect(withHint.has(k), `hint cell ${k} drawn`).toBe(true);
    expect([...ghostOnly].every((k) => withHint.has(k))).toBe(true); // the real ghost is still there

    expect(overlay.cycle(g)).toBe(3);
    overlay.update(g);
    expect(g.hintCellCount).toBe(12);

    expect(overlay.cycle(g)).toBe(0);
    expect(g.hintCellCount).toBe(0);
    expect(ghostCells(g)).toEqual(ghostOnly);
  });

  it('only recomputes when the position changes (not every frame)', async () => {
    const g = freshGame(8, 5);
    const overlay = new HintOverlay();
    await overlay.ensureCore(core);
    const spy = vi.spyOn(core, 'search');
    overlay.cycle(g);
    for (let i = 0; i < 30; i++) overlay.update(g);
    expect(spy).toHaveBeenCalledTimes(1);
    g.hold(); // a different active piece -> a new answer
    overlay.update(g);
    expect(spy).toHaveBeenCalledTimes(2);
    spy.mockRestore();
  });

  it('never changes the game: the board and piece stream are identical with and without hints', async () => {
    const plain = freshGame(11, 7);
    const before = { cells: Array.from(plain.playfield), next: plain.peekUpcomingTypes(5), piece: plain.activPiece.type };
    const overlay = new HintOverlay();
    await overlay.ensureCore(core);
    overlay.cycle(plain);
    overlay.update(plain);
    expect({ cells: Array.from(plain.playfield), next: plain.peekUpcomingTypes(5), piece: plain.activPiece.type }).toEqual(before);
  });

  it('marks the run assisted, and an assisted run is not saved to the leaderboard', async () => {
    const g = freshGame(13);
    expect(g.assistUsed).toBe(false);
    const overlay = new HintOverlay();
    await overlay.ensureCore(core);
    overlay.cycle(g);
    expect(g.assistUsed).toBe(true);
    g.reset({ seed: 13 }); // a new run starts clean...
    expect(g.assistUsed).toBe(false);
    expect(g.hintCellCount).toBe(0);

    // The overlay staying on across a restart must re-mark the NEW run (no clean run with hints on screen).
    overlay.update(g);
    expect(g.assistUsed).toBe(true);
    expect(g.hintCellCount).toBeGreaterThan(0);

    const shouldSave = vi.spyOn(marathonMode, 'shouldSaveLeaderboard');
    const host: LeaderboardSaveHost = { score: 100, lines: 1, level: 1, modeElapsedMs: 0, victory: false, gameOver: true, mode: marathonMode, scoringSystem: new ScoringSystem() };
    expect(saveModeLeaderboard({ ...host, assistUsed: true })).toBe(false);
    expect(shouldSave).not.toHaveBeenCalled(); // short-circuited before any leaderboard logic
    try {
      saveModeLeaderboard({ ...host, assistUsed: false });
    } catch {
      /* localStorage-backed leaderboards may be unavailable in node; the point is it WAS consulted */
    }
    expect(shouldSave).toHaveBeenCalled();
    shouldSave.mockRestore();
  });
});
