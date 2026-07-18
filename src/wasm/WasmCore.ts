// src/wasm/WasmCore.ts

import { clearFullLines as clearFullLinesJs } from '../game/lineUtils.js';
import { wasmLogger } from '../utils/logger.js';

/** Playfield cells per board (10×20). */
export const WASM_PLAYFIELD_BYTES = 200;
export const WASM_BOARD_COUNT = 2;
export const WASM_ROW_SCRATCH_BYTES = 20;
export const WASM_SCRATCH_BLOCK_BYTES = WASM_ROW_SCRATCH_BYTES * 2;
export const WASM_SCRATCH_REGION_BASE = WASM_PLAYFIELD_BYTES * WASM_BOARD_COUNT;
export const WASM_MEMORY_BYTES = WASM_SCRATCH_REGION_BASE + WASM_SCRATCH_BLOCK_BYTES * WASM_BOARD_COUNT;

/** Board 0 scratch offset (legacy parity with assembly exports). */
export const WASM_ROW_SCRATCH_OFFSET = WASM_SCRATCH_REGION_BASE;

export class WasmCore {
  private static instance: WasmCore;
  private wasmMemory!: WebAssembly.Memory;
  private exports!: Record<string, WebAssembly.ExportValue>;

  private playfieldViews: Int8Array[] = [];
  private rowScratchViews: Int8Array[] = [];

  private constructor() {}

  static async init(): Promise<void> {
    if (this.instance) return;

    this.instance = new WasmCore();

    const imports = {
      env: {
        abort: (_msg: number, _file: number, line: number, column: number) => {
          wasmLogger.error(`Abort at ${line}:${column}`);
        },
        seed: () => Math.random()
      }
    };

    this.instance.wasmMemory = new WebAssembly.Memory({ initial: 1 });
    (imports as { env: Record<string, unknown> }).env.memory = this.instance.wasmMemory;

    try {
        const candidates = [
            './release.wasm',
            '/release.wasm'
        ];
        let buffer: ArrayBuffer | null = null;
        let fetchedUrl = '';
        for (const url of candidates) {
            try {
                const res = await fetch(url);
                if (!res.ok) {
                    wasmLogger.warn(`Fetch ${url} failed: ${res.status}`);
                    continue;
                }
                const ab = await res.arrayBuffer();
                const magic = new Uint8Array(ab.slice(0, 4));
                if (magic[0] === 0x00 && magic[1] === 0x61 && magic[2] === 0x73 && magic[3] === 0x6d) {
                    buffer = ab;
                    fetchedUrl = url;
                    break;
                } else {
                    wasmLogger.warn(`Fetch ${url} returned non-wasm content (magic: ${Array.from(magic).map(b => b.toString(16)).join(' ')})`);
                }
            } catch (e) {
                wasmLogger.warn(`Fetch ${url} failed:`, e);
            }
        }

        if (!buffer) {
            throw new Error('WASM module not found or invalid');
        }

        const module = await WebAssembly.instantiate(buffer, imports);

        this.instance.exports = (module.instance.exports || {}) as Record<string, WebAssembly.ExportValue>;

        if (!this.instance.wasmMemory || this.instance.wasmMemory.buffer.byteLength === 0) {
            throw new Error("WASM memory is 0 bytes after instantiation");
        }

        this.instance.attachMemoryViews();

        wasmLogger.info(`Physics Core Initialized (memory=${this.instance.wasmMemory.buffer.byteLength} bytes) from`, fetchedUrl);
    } catch (e) {
        wasmLogger.warn("Init Failed (Using JS Fallback):", e);
    }
  }

  static get(): WasmCore {
    if (!this.instance) this.instance = new WasmCore();
    return this.instance;
  }

  private attachMemoryViews(): void {
    const buf = this.wasmMemory.buffer;
    if (buf.byteLength < WASM_MEMORY_BYTES) {
      wasmLogger.warn(`WASM memory smaller than expected (${buf.byteLength} < ${WASM_MEMORY_BYTES})`);
    }

    this.playfieldViews.length = 0;
    this.rowScratchViews.length = 0;
    for (let boardId = 0; boardId < WASM_BOARD_COUNT; boardId++) {
      const playfieldOffset = boardId * WASM_PLAYFIELD_BYTES;
      const scratchOffset = WASM_SCRATCH_REGION_BASE + boardId * WASM_SCRATCH_BLOCK_BYTES;
      this.playfieldViews.push(new Int8Array(buf, playfieldOffset, WASM_PLAYFIELD_BYTES));
      this.rowScratchViews.push(new Int8Array(buf, scratchOffset, WASM_ROW_SCRATCH_BYTES));
    }
  }

  /** Board 0 playfield view (backward compatible). */
  get playfieldView(): Int8Array {
    return this.getPlayfieldView(0);
  }

  getPlayfieldView(boardId: number): Int8Array {
    return this.playfieldViews[boardId];
  }

  resolveBoardId(playfield: Int8Array): number | null {
    if (!this.wasmMemory || playfield.buffer !== this.wasmMemory.buffer) return null;
    const byteOffset = playfield.byteOffset;
    if (byteOffset % WASM_PLAYFIELD_BYTES !== 0) return null;
    const boardId = byteOffset / WASM_PLAYFIELD_BYTES;
    if (boardId < 0 || boardId >= WASM_BOARD_COUNT) return null;
    if (playfield !== this.playfieldViews[boardId]) return null;
    return boardId;
  }

  get isReady(): boolean {
    return Boolean(this.exports?.checkPieceCollision);
  }

  get hasLineClear(): boolean {
    return Boolean(this.exports?.clearLines);
  }

  get hasHardDrop(): boolean {
    return Boolean(this.exports?.hardDropDistance);
  }

  get hasDualBoard(): boolean {
    return Boolean(this.exports?.clearLinesBoard);
  }

  // --- API Wrappers ---

  checkCollision(
    coords: {x: number, y: number}[],
    offsetX: number,
    offsetY: number,
    boardId = 0,
  ): boolean {
    const boardFn = this.exports?.checkPieceCollisionBoard as ((...args: number[]) => number) | undefined;
    const legacyFn = this.exports?.checkPieceCollision as ((...args: number[]) => number) | undefined;
    const fn = boardFn ?? (boardId === 0 ? legacyFn : undefined);
    if (!fn) return false;

    const args = [
      coords[0].x + offsetX, coords[0].y + offsetY,
      coords[1].x + offsetX, coords[1].y + offsetY,
      coords[2].x + offsetX, coords[2].y + offsetY,
      coords[3].x + offsetX, coords[3].y + offsetY,
    ];

    if (boardFn) {
      return boardFn(boardId, ...args) === 1;
    }
    return fn(...args) === 1;
  }

  /**
   * Clear full lines in shared playfield memory.
   * Falls back to the JS implementation when WASM is unavailable.
   */
  clearFullLines(
    playfield: Int8Array,
    playfieldWidth: number,
    playfieldHeight: number,
    getCell: (x: number, y: number) => number,
    outLinesCleared?: number[]
  ): number[] {
    const out = outLinesCleared || [];
    out.length = 0;

    const boardId = this.resolveBoardId(playfield);
    const clearBoardFn = this.exports?.clearLinesBoard as ((id: number) => number) | undefined;
    const clearFn = this.exports?.clearLines as (() => number) | undefined;

    if (boardId !== null && (clearBoardFn || (boardId === 0 && clearFn))) {
      const count = clearBoardFn ? clearBoardFn(boardId) : clearFn!();
      const scratch = this.rowScratchViews[boardId];
      for (let i = 0; i < count; i++) {
        out.push(scratch[i]);
      }
      return out;
    }

    return clearFullLinesJs(playfield, playfieldWidth, playfieldHeight, getCell, out);
  }

  hardDropDistance(
    pieceX: number,
    pieceY: number,
    coords: { x: number; y: number }[],
    boardId = 0,
  ): number {
    const boardFn = this.exports?.hardDropDistanceBoard as ((...args: number[]) => number) | undefined;
    const legacyFn = this.exports?.hardDropDistance as ((...args: number[]) => number) | undefined;
    const fn = boardFn ?? (boardId === 0 ? legacyFn : undefined);
    if (!fn) return -1;

    const blockArgs = [
      coords[0].x, coords[0].y,
      coords[1].x, coords[1].y,
      coords[2].x, coords[2].y,
      coords[3].x, coords[3].y,
    ];

    if (boardFn) {
      return boardFn(boardId, pieceX, pieceY, ...blockArgs);
    }
    return fn(pieceX, pieceY, ...blockArgs);
  }
}
