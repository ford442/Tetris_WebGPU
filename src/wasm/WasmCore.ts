// src/wasm/WasmCore.ts

import { clearFullLines as clearFullLinesJs } from '../game/lineUtils.js';
import { wasmLogger } from '../utils/logger.js';

/** Playfield cells in shared linear memory (10×20). */
export const WASM_PLAYFIELD_BYTES = 200;
/** Scratch region immediately after playfield (row flags + cleared indices). */
export const WASM_ROW_SCRATCH_OFFSET = WASM_PLAYFIELD_BYTES;
export const WASM_ROW_SCRATCH_BYTES = 20;

export class WasmCore {
  private static instance: WasmCore;
  private wasmMemory!: WebAssembly.Memory;
  private exports!: Record<string, WebAssembly.ExportValue>;

  /** Direct view of playfield bytes 0..199 in WASM linear memory. */
  public playfieldView!: Int8Array;
  /** Scratch bytes 200..219 (row flags during ops; indices after clearLines). */
  private rowScratchView!: Int8Array;

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
    this.playfieldView = new Int8Array(buf, 0, WASM_PLAYFIELD_BYTES);
    this.rowScratchView = new Int8Array(buf, WASM_ROW_SCRATCH_OFFSET, WASM_ROW_SCRATCH_BYTES);
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

  // --- API Wrappers ---

  checkCollision(coords: {x: number, y: number}[], offsetX: number, offsetY: number): boolean {
    const fn = this.exports?.checkPieceCollision as ((...args: number[]) => number) | undefined;
    if (!fn) return false;

    return fn(
      coords[0].x + offsetX, coords[0].y + offsetY,
      coords[1].x + offsetX, coords[1].y + offsetY,
      coords[2].x + offsetX, coords[2].y + offsetY,
      coords[3].x + offsetX, coords[3].y + offsetY
    ) === 1;
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

    const clearFn = this.exports?.clearLines as (() => number) | undefined;
    if (clearFn && playfield === this.playfieldView) {
      const count = clearFn();
      for (let i = 0; i < count; i++) {
        out.push(this.rowScratchView[i]);
      }
      return out;
    }

    return clearFullLinesJs(playfield, playfieldWidth, playfieldHeight, getCell, out);
  }

  hardDropDistance(
    pieceX: number,
    pieceY: number,
    coords: { x: number; y: number }[]
  ): number {
    const fn = this.exports?.hardDropDistance as ((...args: number[]) => number) | undefined;
    if (!fn) return -1;

    return fn(
      pieceX, pieceY,
      coords[0].x, coords[0].y,
      coords[1].x, coords[1].y,
      coords[2].x, coords[2].y,
      coords[3].x, coords[3].y
    );
  }
}
