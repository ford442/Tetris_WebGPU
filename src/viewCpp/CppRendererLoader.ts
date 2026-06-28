/**
 * Loads and drives the Emscripten C++ renderer module.
 * Pattern mirrors src/wasm/WasmCore.ts (multi-path fetch, magic check, HEAP view).
 */
import { renderLogger } from '../utils/logger.js';
import { flattenPlayfieldGrid } from './cppPlayfieldSync.js';

export const PLAYFIELD_BYTES = 200;

export const JS_CANDIDATES = [
  './cpp/tetris_renderer.js',
  '/cpp/tetris_renderer.js',
  '../cpp/tetris_renderer.js',
];

export const WASM_CANDIDATES = [
  './cpp/tetris_renderer.wasm',
  '/cpp/tetris_renderer.wasm',
  '../cpp/tetris_renderer.wasm',
];

export interface CppRendererModule {
  cwrap(name: string, returnType: string | null, argTypes: string[]): (...args: unknown[]) => unknown;
  ccall?: (
    name: string,
    returnType: string | null,
    argTypes: string[],
    args: unknown[],
  ) => unknown;
  HEAP8: Int8Array;
  HEAPU8: Uint8Array;
  canvas?: HTMLCanvasElement;
  _malloc?: (size: number) => number;
  _free?: (ptr: number) => void;
}

type CreateModuleFn = (options?: Record<string, unknown>) => Promise<CppRendererModule>;

function isWasmMagic(buffer: ArrayBuffer): boolean {
  if (buffer.byteLength < 4) return false;
  const magic = new Uint8Array(buffer, 0, 4);
  return magic[0] === 0x00 && magic[1] === 0x61 && magic[2] === 0x73 && magic[3] === 0x6d;
}

async function fetchWasmModule(): Promise<{ url: string; buffer: ArrayBuffer } | null> {
  for (const url of WASM_CANDIDATES) {
    try {
      const res = await fetch(url);
      if (!res.ok) {
        renderLogger.warn(`[cpp] fetch ${url} failed: ${res.status}`);
        continue;
      }
      const buffer = await res.arrayBuffer();
      if (!isWasmMagic(buffer)) {
        renderLogger.warn(`[cpp] ${url} is not a wasm module`);
        continue;
      }
      return { url, buffer };
    } catch (err) {
      renderLogger.warn(`[cpp] fetch ${url} failed:`, err);
    }
  }
  return null;
}

async function importCreateModule(): Promise<{ create: CreateModuleFn; jsUrl: string } | null> {
  for (const jsUrl of JS_CANDIDATES) {
    try {
      const mod = await import(/* @vite-ignore */ jsUrl);
      const create = (mod.default ?? mod.createTetrisRendererModule) as CreateModuleFn | undefined;
      if (typeof create === 'function') {
        return { create, jsUrl };
      }
    } catch (err) {
      renderLogger.warn(`[cpp] import ${jsUrl} failed:`, err);
    }
  }
  return null;
}

export class CppRendererLoader {
  private static module: CppRendererModule | null = null;
  private static playfieldView: Int8Array | null = null;
  private static playfieldPtr = 0;
  private static loadedUrl = '';
  private static loaded = false;

  private static initFn: ((w: number, h: number) => number) | null = null;
  private static resizeFn: ((w: number, h: number) => void) | null = null;
  private static renderFn: ((dt: number) => void) | null = null;
  private static getPlayfieldPtrFn: (() => number) | null = null;
  private static updatePlayfieldFn: ((ptr: number, len: number) => void) | null = null;

  static isLoaded(): boolean {
    return this.loaded;
  }

  static getLoadedUrl(): string {
    return this.loadedUrl;
  }

  /** Shared HEAP view into the C++ playfield buffer (200 bytes). */
  static getPlayfieldView(): Int8Array | null {
    return this.playfieldView;
  }

  static async init(width: number, height: number, canvas: HTMLCanvasElement): Promise<boolean> {
    if (this.loaded) return true;

    const wasmProbe = await fetchWasmModule();
    if (!wasmProbe) {
      renderLogger.warn('[cpp] wasm not found — run npm run cpp:release');
      return false;
    }

    const imported = await importCreateModule();
    if (!imported) {
      renderLogger.warn('[cpp] glue JS not found');
      return false;
    }

    try {
      const instance = await imported.create({ canvas });
      this.module = instance;
      this.loadedUrl = `${imported.jsUrl} (wasm from ${wasmProbe.url})`;

      this.initFn = instance.cwrap('init_renderer', 'number', ['number', 'number']) as (
        w: number,
        h: number,
      ) => number;
      this.resizeFn = instance.cwrap('resize_renderer', null, ['number', 'number']) as (
        w: number,
        h: number,
      ) => void;
      this.renderFn = instance.cwrap('render_frame', null, ['number']) as (dt: number) => void;
      this.getPlayfieldPtrFn = instance.cwrap('get_playfield_ptr', 'number', []) as () => number;
      this.updatePlayfieldFn = instance.cwrap('update_playfield', null, ['number', 'number']) as (
        ptr: number,
        len: number,
      ) => void;

      const ok = this.initFn(width, height);
      if (ok !== 1) {
        throw new Error(`init_renderer returned ${ok}`);
      }

      this.bindPlayfieldView();

      this.loaded = true;
      renderLogger.info(`[cpp] module ready from ${this.loadedUrl}`);
      return true;
    } catch (err) {
      renderLogger.warn('[cpp] init failed:', err);
      this.reset();
      return false;
    }
  }

  static resize(width: number, height: number): void {
    this.resizeFn?.(width, height);
  }

  static render(dt: number): void {
    this.renderFn?.(dt);
  }

  /**
   * Copy projected playfield grid into wasm memory.
   * Uses zero-copy HEAP view when available; falls back to update_playfield + temp buffer.
   */
  static syncPlayfieldFromGrid(playfield: number[][] | undefined): void {
    if (!this.loaded || !playfield) return;

    this.ensurePlayfieldView();
    const flat = flattenPlayfieldGrid(playfield);

    if (this.playfieldView) {
      this.playfieldView.set(flat);
      return;
    }

    if (this.module && this.updatePlayfieldFn && this.module._malloc && this.module._free) {
      const ptr = this.module._malloc(PLAYFIELD_BYTES);
      try {
        this.module.HEAPU8.set(flat, ptr);
        this.updatePlayfieldFn(ptr, PLAYFIELD_BYTES);
      } finally {
        this.module._free(ptr);
      }
    }
  }

  private static bindPlayfieldView(): void {
    if (!this.module || !this.getPlayfieldPtrFn) return;
    this.playfieldPtr = this.getPlayfieldPtrFn();
    this.playfieldView = new Int8Array(this.module.HEAP8.buffer, this.playfieldPtr, PLAYFIELD_BYTES);
  }

  /** Re-bind after ALLOW_MEMORY_GROWTH replaces the ArrayBuffer. */
  private static ensurePlayfieldView(): void {
    if (!this.module || !this.getPlayfieldPtrFn) return;
    if (!this.playfieldView || this.playfieldView.buffer !== this.module.HEAP8.buffer) {
      this.bindPlayfieldView();
    }
  }

  private static reset(): void {
    this.module = null;
    this.playfieldView = null;
    this.playfieldPtr = 0;
    this.loadedUrl = '';
    this.initFn = null;
    this.resizeFn = null;
    this.renderFn = null;
    this.getPlayfieldPtrFn = null;
    this.updatePlayfieldFn = null;
    this.loaded = false;
  }
}
