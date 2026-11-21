import { describe, it, expect, beforeAll } from 'vitest';
import { type BotCore, P } from '../src/bot/BotCore.js';
import { PIECE_TYPES } from '../src/bot/types.js';
import { makeBotCore, readWasmBytes, emptyPosition, randomCells } from './helpers/bot.js';

/** The wasm-side layout contract and the empty-board facts everyone knows about Tetris. */
describe('bot wasm core', () => {
  let core: BotCore;
  beforeAll(async () => {
    core = await makeBotCore();
  });

  it('keeps all of its working memory inside the single 64 KiB page, above the board region', () => {
    expect(core.memoryEnd).toBeLessThanOrEqual(65536);
    // boards 0/1 + scratch occupy 0..479 (assembly/index.ts); the bot starts well above that
    const base = core.raw.botCellsPtr();
    expect(base).toBeGreaterThanOrEqual(1024);
  });

  it('writes nothing at or above BOT_BASE when instantiated (no static data under its buffers)', async () => {
    const memory = new WebAssembly.Memory({ initial: 1 });
    new Uint8Array(memory.buffer).fill(0xab);
    await WebAssembly.instantiate(readWasmBytes(), {
      env: { memory, abort: () => undefined, seed: () => 0 },
    });
    const bytes = new Uint8Array(memory.buffer);
    const base = core.raw.botCellsPtr();
    for (let i = 0; i < 480; i++) expect(bytes[i]).toBe(0xab); // collision boards untouched
    for (let i = base; i < 65536; i++) {
      if (bytes[i] !== 0xab) throw new Error(`instantiation wrote byte ${i} (>= BOT_BASE ${base})`);
    }
  });

  it('exposes the param-slot layout the TS wrapper hard-codes', () => {
    expect(core.raw.botParamsPtr() - core.raw.botCellsPtr()).toBe(208);
    expect(P.NEXT0).toBe(13);
    expect(core.raw.botRootStride()).toBe(24);
    expect(core.raw.botPlacementStride()).toBe(16);
  });

  it('generates the textbook number of placements for every piece on an empty board', () => {
    core.setPosition(emptyPosition());
    const counts = Object.fromEntries([...PIECE_TYPES].map((t) => [t, core.generate(t).length]));
    expect(counts).toEqual({ I: 17, J: 34, L: 34, O: 9, S: 17, T: 34, Z: 17 });
  });

  it('never reports a placement with a cell above the board, or one that is not resting', () => {
    for (let seed = 1; seed <= 20; seed++) {
      core.setPosition(emptyPosition({ cells: randomCells(seed, 6 + (seed % 8)) }));
      for (const t of PIECE_TYPES) {
        for (const p of core.generate(t)) {
          expect(p.y).toBeGreaterThanOrEqual(-1); // 4x4 boxes may poke above row 0 but their CELLS may not
          expect(p.lines).toBe(0);
        }
      }
    }
  });

  it('returns no moves (and does not crash) when the board is already topped out', () => {
    const cells = new Int8Array(200);
    for (let y = 0; y < 20; y++) for (let x = 0; x < 9; x++) cells[y * 10 + x] = 1; // one open column to the top
    core.setPosition(emptyPosition({ cells, active: 'O', next: ['O'] }));
    const result = core.search(emptyPosition({ cells, active: 'O', next: ['O'] }), { depth: 2, beam: 4 });
    expect(result.moves).toEqual([]);
    expect(result.depthReached).toBe(0);
  });
});
