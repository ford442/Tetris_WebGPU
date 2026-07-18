/**
 * Loads and drives the Emscripten C++ renderer module.
 * Pattern mirrors src/wasm/WasmCore.ts (multi-path fetch, magic check, HEAP view).
 */
import { renderLogger } from '../utils/logger.js';
import {
  attachDeviceLifecycleHandlers,
  requestGpuAdapterAndDevice,
  type GpuDeviceLifecycleHost,
} from '../webgpu/gpuContext.js';
import {
  flattenPlayfieldGrid,
  packPieceState,
  PIECE_STATE_BYTES,
  PLAYFIELD_CELL_COUNT,
} from './cppPlayfieldSync.js';
import { resolveBlockTextureUrl } from '../webgpu/blockTexture.js';
import type { GameState } from '../game/gameState.js';

export const PLAYFIELD_BYTES = PLAYFIELD_CELL_COUNT;

/** Matches cpp/src/renderer_backend.h — get_renderer_backend() return values. */
export const RendererBackend = {
  NONE: 0,
  CANVAS2D: 1,
  WEBGPU: 2,
} as const;

export type RendererBackendId = (typeof RendererBackend)[keyof typeof RendererBackend];

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
  preinitializedWebGPUDevice?: GPUDevice;
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

async function createWebGpuDevice(
  lifecycleHost?: GpuDeviceLifecycleHost,
): Promise<GPUDevice | null> {
  const bundle = await requestGpuAdapterAndDevice();
  if (!bundle) return null;

  if (lifecycleHost) {
    lifecycleHost.device = bundle.device;
    attachDeviceLifecycleHandlers(lifecycleHost);
  }

  return bundle.device;
}

export class CppRendererLoader {
  private static module: CppRendererModule | null = null;
  private static playfieldView: Int8Array | null = null;
  private static pieceStateView: Int8Array | null = null;
  private static playfieldPtr = 0;
  private static pieceStatePtr = 0;
  private static loadedUrl = '';
  private static loaded = false;
  private static backend: RendererBackendId = RendererBackend.NONE;

  private static initFn: ((w: number, h: number) => number) | null = null;
  private static resizeFn: ((w: number, h: number) => void) | null = null;
  private static renderFn: ((dt: number) => void) | null = null;
  private static getPlayfieldPtrFn: (() => number) | null = null;
  private static getPieceStatePtrFn: (() => number) | null = null;
  private static updatePlayfieldFn: ((ptr: number, len: number) => void) | null = null;
  private static updatePieceStateFn: ((
    pieceType: number,
    rotation: number,
    x: number,
    y: number,
    ghostY: number,
    lockFlash: number,
  ) => void) | null = null;
  private static isGpuActiveFn: (() => number) | null = null;
  private static getBackendFn: (() => number) | null = null;
  private static setBlockTextureFn: ((ptr: number, w: number, h: number, len: number) => number) | null = null;
  private static blockTextureReady = false;

  static isLoaded(): boolean {
    return this.loaded;
  }

  static isGpuActive(): boolean {
    return this.backend === RendererBackend.WEBGPU;
  }

  static getRendererBackend(): RendererBackendId {
    return this.backend;
  }

  static getLoadedUrl(): string {
    return this.loadedUrl;
  }

  /** Shared HEAP view into the C++ playfield buffer (200 bytes). */
  static getPlayfieldView(): Int8Array | null {
    return this.playfieldView;
  }

  static hasBlockTexture(): boolean {
    return this.blockTextureReady;
  }

  /** Decode block.png in TS and upload RGBA pixels into the C++ bind group texture. */
  static async uploadBlockTexture(): Promise<boolean> {
    if (!this.module || !this.setBlockTextureFn || this.backend !== RendererBackend.WEBGPU) {
      return false;
    }
    if (!this.module._malloc || !this.module._free) {
      renderLogger.warn('[cpp] _malloc/_free unavailable for block texture upload');
      return false;
    }

    try {
      const url = resolveBlockTextureUrl();
      const res = await fetch(url);
      if (!res.ok) {
        renderLogger.warn(`[cpp] block texture fetch failed: ${res.status} ${url}`);
        return false;
      }
      const blob = await res.blob();
      const bitmap = await createImageBitmap(blob);
      const canvas = typeof OffscreenCanvas !== 'undefined'
        ? new OffscreenCanvas(bitmap.width, bitmap.height)
        : document.createElement('canvas');
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        renderLogger.warn('[cpp] 2D context unavailable for block texture decode');
        return false;
      }
      ctx.drawImage(bitmap, 0, 0);
      const imageData = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
      const bytes = imageData.data;
      const ptr = this.module._malloc(bytes.length);
      try {
        this.module.HEAPU8.set(bytes, ptr);
        const ok = this.setBlockTextureFn(ptr, bitmap.width, bitmap.height, bytes.length);
        this.blockTextureReady = ok === 1;
        if (this.blockTextureReady) {
          renderLogger.info(`[cpp] block texture uploaded (${bitmap.width}x${bitmap.height})`);
        }
        return this.blockTextureReady;
      } finally {
        this.module._free(ptr);
      }
    } catch (err) {
      renderLogger.warn('[cpp] block texture upload failed:', err);
      return false;
    }
  }

  static async init(
    width: number,
    height: number,
    canvas: HTMLCanvasElement,
    lifecycleHost?: GpuDeviceLifecycleHost,
  ): Promise<boolean> {
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

    const webgpuDevice = await createWebGpuDevice(lifecycleHost);

    try {
      const instance = await imported.create({
        canvas,
        preinitializedWebGPUDevice: webgpuDevice ?? undefined,
      });
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
      this.getPieceStatePtrFn = instance.cwrap('get_piece_state_ptr', 'number', []) as () => number;
      this.updatePlayfieldFn = instance.cwrap('update_playfield', null, ['number', 'number']) as (
        ptr: number,
        len: number,
      ) => void;
      this.updatePieceStateFn = instance.cwrap('update_piece_state', null, [
        'number', 'number', 'number', 'number', 'number', 'number',
      ]) as (
        pieceType: number,
        rotation: number,
        x: number,
        y: number,
        ghostY: number,
        lockFlash: number,
      ) => void;
      this.isGpuActiveFn = instance.cwrap('is_gpu_renderer_active', 'number', []) as () => number;
      this.getBackendFn = instance.cwrap('get_renderer_backend', 'number', []) as () => number;
      this.setBlockTextureFn = instance.cwrap('set_block_texture_rgba', 'number', [
        'number', 'number', 'number', 'number',
      ]) as (ptr: number, w: number, h: number, len: number) => number;

      const ok = this.initFn(width, height);
      if (ok !== 1) {
        throw new Error(`init_renderer returned ${ok}`);
      }

      this.bindHeapViews();
      this.backend = (this.getBackendFn?.() ?? this.isGpuActiveFn?.() ?? 0) as RendererBackendId;

      if (this.backend === RendererBackend.WEBGPU) {
        await this.uploadBlockTexture();
      }

      this.loaded = true;
      const backendLabel =
        this.backend === RendererBackend.WEBGPU ? 'WebGPU'
          : this.backend === RendererBackend.CANVAS2D ? 'Canvas2D fallback'
            : 'none';
      renderLogger.info(`[cpp] module ready (backend=${backendLabel}, id=${this.backend}) from ${this.loadedUrl}`);
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
   * Sync projected playfield + extended piece state into wasm memory.
   */
  static syncFromGameState(state: GameState | null | undefined, ghostY = 0): void {
    if (!this.loaded || !state) return;

    this.ensureHeapViews();
    this.syncPlayfieldFromGrid(state.playfield);

    const packed = packPieceState(state, ghostY);
    if (this.pieceStateView) {
      this.pieceStateView.set(packed);
      return;
    }

    this.updatePieceStateFn?.(
      packed[0],
      packed[1],
      packed[2],
      packed[3],
      packed[4],
      new DataView(packed.buffer).getFloat32(8, true),
    );
  }

  /**
   * Copy projected playfield grid into wasm memory.
   * Uses zero-copy HEAP view when available; falls back to update_playfield + temp buffer.
   */
  static syncPlayfieldFromGrid(playfield: number[][] | undefined): void {
    if (!this.loaded || !playfield) return;

    this.ensureHeapViews();
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

  private static bindHeapViews(): void {
    if (!this.module) return;

    if (this.getPlayfieldPtrFn) {
      this.playfieldPtr = this.getPlayfieldPtrFn();
      this.playfieldView = new Int8Array(this.module.HEAP8.buffer, this.playfieldPtr, PLAYFIELD_BYTES);
    }

    if (this.getPieceStatePtrFn) {
      this.pieceStatePtr = this.getPieceStatePtrFn();
      this.pieceStateView = new Int8Array(this.module.HEAP8.buffer, this.pieceStatePtr, PIECE_STATE_BYTES);
    }
  }

  /** Re-bind after ALLOW_MEMORY_GROWTH replaces the ArrayBuffer. */
  private static ensureHeapViews(): void {
    if (!this.module) return;
    if (!this.playfieldView || this.playfieldView.buffer !== this.module.HEAP8.buffer) {
      this.bindHeapViews();
    }
  }

  private static reset(): void {
    this.module = null;
    this.playfieldView = null;
    this.pieceStateView = null;
    this.playfieldPtr = 0;
    this.pieceStatePtr = 0;
    this.loadedUrl = '';
    this.initFn = null;
    this.resizeFn = null;
    this.renderFn = null;
    this.getPlayfieldPtrFn = null;
    this.getPieceStatePtrFn = null;
    this.updatePlayfieldFn = null;
    this.updatePieceStateFn = null;
    this.isGpuActiveFn = null;
    this.getBackendFn = null;
    this.setBlockTextureFn = null;
    this.blockTextureReady = false;
    this.backend = RendererBackend.NONE;
    this.loaded = false;
  }
}
