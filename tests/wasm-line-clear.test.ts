import { describe, it, expect, beforeAll, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import { clearFullLines } from '../src/game/lineUtils';
import { WasmCore, WASM_PLAYFIELD_BYTES } from '../src/wasm/WasmCore';

global.fetch = vi.fn(async (url: string) => {
  if (typeof url === 'string' && url.includes('release.wasm')) {
    const wasmPath = path.resolve(__dirname, '../build/release.wasm');
    const buffer = fs.readFileSync(wasmPath);
    return {
      arrayBuffer: async () => buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength),
      ok: true,
    } as Response;
  }
  throw new Error(`Unexpected fetch call: ${url}`);
});

const WIDTH = 10;
const HEIGHT = 20;

function getCell(playfield: Int8Array, x: number, y: number): number {
  return playfield[y * WIDTH + x];
}

function copyBoard(src: Int8Array): Int8Array {
  return new Int8Array(src);
}

function randomBoard(rng: () => number): Int8Array {
  const board = new Int8Array(WIDTH * HEIGHT);
  for (let i = 0; i < board.length; i++) {
    board[i] = rng() < 0.55 ? 0 : ((rng() * 7) | 0) + 1;
  }
  return board;
}

function forceFullRow(board: Int8Array, y: number): void {
  const start = y * WIDTH;
  for (let x = 0; x < WIDTH; x++) {
    board[start + x] = 1;
  }
}

function clearJs(board: Int8Array): { lines: number[]; board: Int8Array } {
  const copy = copyBoard(board);
  const lines = clearFullLines(copy, WIDTH, HEIGHT, (x, y) => getCell(copy, x, y));
  return { lines, board: copy };
}

describe('WASM line clear parity', () => {
  beforeAll(async () => {
    await WasmCore.init();
    const core = WasmCore.get();
    if (!core.hasLineClear || !core.hasDualBoard || core.playfieldView.buffer.byteLength <= WASM_PLAYFIELD_BYTES) {
      throw new Error('WASM line-clear exports not loaded');
    }
  });

  it('matches JS for a single bottom-row clear', () => {
    const core = WasmCore.get();
    const initial = new Int8Array(WIDTH * HEIGHT);
    forceFullRow(initial, HEIGHT - 1);
    initial[(HEIGHT - 2) * WIDTH] = 2;

    const js = clearJs(initial);
    core.playfieldView.set(initial);
    const wasmLines = core.clearFullLines(
      core.playfieldView,
      WIDTH,
      HEIGHT,
      (x, y) => getCell(core.playfieldView, x, y)
    );

    expect(wasmLines).toEqual(js.lines);
    expect(Array.from(core.playfieldView)).toEqual(Array.from(js.board));
  });

  it('matches JS for multiple scattered full rows', () => {
    const core = WasmCore.get();
    const initial = new Int8Array(WIDTH * HEIGHT);
    forceFullRow(initial, 3);
    forceFullRow(initial, 7);
    forceFullRow(initial, 19);
    initial[5 * WIDTH + 2] = 4;
    initial[12 * WIDTH + 9] = 3;

    const js = clearJs(initial);
    core.playfieldView.set(initial);
    const wasmLines = core.clearFullLines(
      core.playfieldView,
      WIDTH,
      HEIGHT,
      (x, y) => getCell(core.playfieldView, x, y)
    );

    expect(wasmLines).toEqual(js.lines);
    expect(Array.from(core.playfieldView)).toEqual(Array.from(js.board));
  });

  it('matches JS across random boards (property-style)', () => {
    const core = WasmCore.get();
    let seed = 0xdecaf;
    const rng = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 0x100000000;
    };

    for (let trial = 0; trial < 200; trial++) {
      const initial = randomBoard(rng);
      if (rng() < 0.35) forceFullRow(initial, (rng() * HEIGHT) | 0);
      if (rng() < 0.2) forceFullRow(initial, (rng() * HEIGHT) | 0);

      const js = clearJs(initial);
      core.playfieldView.set(initial);
      const wasmLines = core.clearFullLines(
        core.playfieldView,
        WIDTH,
        HEIGHT,
        (x, y) => getCell(core.playfieldView, x, y)
      );

      expect(wasmLines).toEqual(js.lines);
      expect(Array.from(core.playfieldView)).toEqual(Array.from(js.board));
    }
  });

  it('findFullRows + collapsePlayfield matches clearLines', () => {
    const core = WasmCore.get();
    const exports = core['exports'] as Record<string, (...args: number[]) => number>;
    const findFullRows = exports.findFullRows;
    const collapsePlayfield = exports.collapsePlayfield;
    const clearLines = exports.clearLines;

    let seed = 0xabc123;
    const rng = () => {
      seed = (seed * 1103515245 + 12345) >>> 0;
      return seed / 0x100000000;
    };

    for (let trial = 0; trial < 50; trial++) {
      const initial = randomBoard(rng);
      if (rng() < 0.4) forceFullRow(initial, (rng() * HEIGHT) | 0);

      const js = clearJs(initial);

      core.playfieldView.set(initial);
      const splitCount = findFullRows();
      if (splitCount > 0) collapsePlayfield();
      const splitBoard = copyBoard(core.playfieldView);

      core.playfieldView.set(initial);
      const combinedCount = clearLines();
      const combinedBoard = copyBoard(core.playfieldView);

      expect(combinedCount).toBe(js.lines.length);
      expect(splitCount).toBe(js.lines.length);
      expect(Array.from(combinedBoard)).toEqual(Array.from(js.board));
      expect(Array.from(splitBoard)).toEqual(Array.from(js.board));
    }
  });

  it('hardDropDistance matches JS ghost scan', () => {
    const core = WasmCore.get();
    const board = new Int8Array(WIDTH * HEIGHT);
    for (let y = 10; y < HEIGHT; y++) {
      board[y * WIDTH + 4] = 1;
    }
    core.playfieldView.set(board);

    const pieceX = 3;
    const pieceY = 2;
    const coords = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 0, y: 1 },
      { x: 1, y: 1 },
    ];

    const wasmDist = core.hardDropDistance(pieceX, pieceY, coords);

    let jsY = pieceY;
    while (true) {
      const nextY = jsY + 1;
      const blocked = coords.some(({ x, y }) => {
        const tx = pieceX + x;
        const ty = nextY + y;
        if (tx < 0 || tx >= WIDTH || ty >= HEIGHT) return true;
        if (ty < 0) return false;
        return board[ty * WIDTH + tx] !== 0;
      });
      if (blocked) break;
      jsY = nextY;
    }

    expect(wasmDist).toBe(jsY - pieceY);
  });

  it('JS fallback path matches lineUtils when playfield is not the WASM view', () => {
    const core = WasmCore.get();
    const local = new Int8Array(WIDTH * HEIGHT);
    forceFullRow(local, HEIGHT - 1);
    local[(HEIGHT - 2) * WIDTH + 1] = 5;

    const js = clearJs(local);
    const fallback = core.clearFullLines(
      local,
      WIDTH,
      HEIGHT,
      (x, y) => getCell(local, x, y)
    );

    expect(fallback).toEqual(js.lines);
    expect(Array.from(local)).toEqual(Array.from(js.board));
  });
});

describe('WASM board 1 parity', () => {
  beforeAll(async () => {
    const core = WasmCore.get();
    if (!core.hasDualBoard) {
      throw new Error('WASM dual-board exports not loaded');
    }
  });

  it('matches JS for a single bottom-row clear on board 1', () => {
    const core = WasmCore.get();
    const board1 = core.getPlayfieldView(1);
    const initial = new Int8Array(WIDTH * HEIGHT);
    forceFullRow(initial, HEIGHT - 1);
    initial[(HEIGHT - 2) * WIDTH] = 2;

    const js = clearJs(initial);
    board1.set(initial);
    const wasmLines = core.clearFullLines(
      board1,
      WIDTH,
      HEIGHT,
      (x, y) => getCell(board1, x, y)
    );

    expect(wasmLines).toEqual(js.lines);
    expect(Array.from(board1)).toEqual(Array.from(js.board));
  });

  it('matches JS across random boards on board 1', () => {
    const core = WasmCore.get();
    const board1 = core.getPlayfieldView(1);
    let seed = 0xface;
    const rng = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 0x100000000;
    };

    for (let trial = 0; trial < 50; trial++) {
      const initial = randomBoard(rng);
      if (rng() < 0.35) forceFullRow(initial, (rng() * HEIGHT) | 0);

      const js = clearJs(initial);
      board1.set(initial);
      const wasmLines = core.clearFullLines(
        board1,
        WIDTH,
        HEIGHT,
        (x, y) => getCell(board1, x, y)
      );

      expect(wasmLines).toEqual(js.lines);
      expect(Array.from(board1)).toEqual(Array.from(js.board));
    }
  });

  it('does not mutate board 0 when clearing board 1', () => {
    const core = WasmCore.get();
    const board0 = core.getPlayfieldView(0);
    const board1 = core.getPlayfieldView(1);

    const board0Snapshot = new Int8Array(WIDTH * HEIGHT);
    for (let i = 0; i < board0Snapshot.length; i++) {
      board0Snapshot[i] = ((i * 3 + 1) % 8);
    }
    board0.set(board0Snapshot);

    const initial = new Int8Array(WIDTH * HEIGHT);
    forceFullRow(initial, HEIGHT - 1);
    board1.set(initial);

    core.clearFullLines(board1, WIDTH, HEIGHT, (x, y) => getCell(board1, x, y));

    expect(Array.from(board0)).toEqual(Array.from(board0Snapshot));
  });

  it('findFullRowsBoard + collapsePlayfieldBoard matches clearLinesBoard', () => {
    const core = WasmCore.get();
    const board1 = core.getPlayfieldView(1);
    const exports = core['exports'] as Record<string, (...args: number[]) => number>;
    const findFullRowsBoard = exports.findFullRowsBoard;
    const collapsePlayfieldBoard = exports.collapsePlayfieldBoard;
    const clearLinesBoard = exports.clearLinesBoard;

    let seed = 0x123abc;
    const rng = () => {
      seed = (seed * 1103515245 + 12345) >>> 0;
      return seed / 0x100000000;
    };

    for (let trial = 0; trial < 25; trial++) {
      const initial = randomBoard(rng);
      if (rng() < 0.4) forceFullRow(initial, (rng() * HEIGHT) | 0);

      const js = clearJs(initial);

      board1.set(initial);
      const splitCount = findFullRowsBoard(1);
      if (splitCount > 0) collapsePlayfieldBoard(1);
      const splitBoard = copyBoard(board1);

      board1.set(initial);
      const combinedCount = clearLinesBoard(1);
      const combinedBoard = copyBoard(board1);

      expect(combinedCount).toBe(js.lines.length);
      expect(splitCount).toBe(js.lines.length);
      expect(Array.from(combinedBoard)).toEqual(Array.from(js.board));
      expect(Array.from(splitBoard)).toEqual(Array.from(js.board));
    }
  });

  it('hardDropDistance on board 1 matches JS ghost scan', () => {
    const core = WasmCore.get();
    const board1 = core.getPlayfieldView(1);
    const board = new Int8Array(WIDTH * HEIGHT);
    for (let y = 10; y < HEIGHT; y++) {
      board[y * WIDTH + 4] = 1;
    }
    board1.set(board);

    const pieceX = 3;
    const pieceY = 2;
    const coords = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 0, y: 1 },
      { x: 1, y: 1 },
    ];

    const wasmDist = core.hardDropDistance(pieceX, pieceY, coords, 1);

    let jsY = pieceY;
    while (true) {
      const nextY = jsY + 1;
      const blocked = coords.some(({ x, y }) => {
        const tx = pieceX + x;
        const ty = nextY + y;
        if (tx < 0 || tx >= WIDTH || ty >= HEIGHT) return true;
        if (ty < 0) return false;
        return board[ty * WIDTH + tx] !== 0;
      });
      if (blocked) break;
      jsY = nextY;
    }

    expect(wasmDist).toBe(jsY - pieceY);
  });

  it('checkPieceCollisionBoard detects overlap on board 1', () => {
    const core = WasmCore.get();
    const board1 = core.getPlayfieldView(1);
    board1.fill(0);
    board1[19 * WIDTH + 5] = 1;

    const hit = core.checkCollision(
      [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }],
      4,
      18,
      1,
    );
    expect(hit).toBe(true);
  });
});
