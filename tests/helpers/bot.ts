import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { BotCore } from '../../src/bot/BotCore.js';
import { PieceGenerator, type Piece } from '../../src/game/pieces.js';
import { rotatePieceBlocks } from '../../src/game/rotation.js';
import { createSeededRng } from '../../src/game/pieces.js';
import type { BotPosition } from '../../src/bot/types.js';

export const WASM_PATH = resolve(__dirname, '../../public/release.wasm');

export function readWasmBytes(): Buffer {
  return readFileSync(WASM_PATH);
}

let compiled: WebAssembly.Module | null = null;

/** A fresh BotCore (own memory) from the committed/built public/release.wasm. */
export async function makeBotCore(): Promise<BotCore> {
  compiled ??= new WebAssembly.Module(readWasmBytes());
  return BotCore.create(compiled);
}

/** Deterministic random board: `fill` of cells set, every row guaranteed to keep >= 1 hole. */
export function randomCells(seed: number, rows: number, fill = 0.55): Int8Array {
  const rng = createSeededRng(seed);
  const cells = new Int8Array(200);
  for (let y = 20 - rows; y < 20; y++) {
    for (let x = 0; x < 10; x++) cells[y * 10 + x] = rng() < fill ? ((rng() * 7) | 0) + 1 : 0;
    if (cells.subarray(y * 10, y * 10 + 10).every((v) => v !== 0)) cells[y * 10 + ((rng() * 10) | 0)] = 0;
  }
  return cells;
}

/** A piece of `type` at (x, y) in rotation `rot`, with real game-style blocks. */
export function makePiece(type: string, x: number, y: number, rot: number): Piece {
  const gen = new PieceGenerator();
  const piece = gen.createPieceByType(type);
  let blocks = piece.blocks;
  for (let i = 0; i < rot; i++) blocks = rotatePieceBlocks(blocks, true).map((r) => r.slice());
  piece.blocks = blocks;
  piece.x = x;
  piece.y = y;
  piece.rotation = rot;
  return piece;
}

export function emptyPosition(overrides: Partial<BotPosition> = {}): BotPosition {
  return {
    cells: new Int8Array(200),
    active: 'T',
    hold: null,
    canHold: true,
    next: ['I', 'O', 'S', 'Z', 'L'],
    combo: -1,
    b2b: false,
    incoming: 0,
    ...overrides,
  };
}
