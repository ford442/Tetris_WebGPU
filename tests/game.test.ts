// tests/game.test.ts
import { describe, it, expect, beforeAll, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import Game from '../src/game';
import { WasmCore } from '../src/wasm/WasmCore';

// Mock global.fetch to load the local WASM file
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

describe('Tetris WASM Core & Game Integration', () => {
  let game: Game;

  beforeAll(async () => {
    // Initialize the WASM Core before tests run
    await WasmCore.init();

    // STRICT CHECK: Ensure we are NOT using the JS fallback for this test run
    // We verify the underlying buffer is larger than the 200-byte playfield
    const core = WasmCore.get();
    if (core.playfieldView.buffer.byteLength <= 200) {
      throw new Error("Test Environment failed to load WASM! (Using JS fallback)");
    }

    // Initialize Game
    game = new Game();
  });

  it('should initialize with shared WASM memory', () => {
    // Verify the playfield is a view into the WASM buffer (length 200)
    expect(game.playfield).toBeInstanceOf(Int8Array);
    expect(game.playfield.length).toBe(200);
    expect(game.playfield.buffer.byteLength).toBeGreaterThan(200); // Ensures it's using WASM memory
  });

  it('should detect collision using WASM kernel', () => {
    // Setup: Place a block at (5, 19) directly in shared memory
    game.setCell(5, 19, 1);

    // Create a mock piece that would overlap (5, 19)
    const piece = {
      x: 4,
      y: 18,
      blocks: [
        [1, 1],
        [1, 1]
      ]
    } as any;

    const result = game.hasCollisionPiece(piece);
    expect(result).toBe(true);
  });

  it('should clear lines and update shared memory correctly', () => {
    // Setup: Fill the bottom row (y=19)
    for (let x = 0; x < 10; x++) {
      game.setCell(x, 19, 1);
    }
    // Fill one block above (0, 18) to test shifting
    game.setCell(0, 18, 2);

    // Verify setup
    expect(game.getCell(0, 19)).toBe(1);
    expect(game.getCell(9, 19)).toBe(1);

    // Act
    const cleared = game.clearLine();

    // Assert
    expect(cleared).toEqual([19]);
    expect(game.getCell(0, 19)).toBe(2);
    expect(game.getCell(1, 19)).toBe(0);

    // Verify WASM view is still attached/valid after the operation
    expect(game.playfield.buffer.byteLength).toBeGreaterThan(0);
  });
});