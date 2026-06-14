import type { IView } from './IView.js';
import ViewWebGPU from '../viewWebGPU.js';
import ViewWebGL2 from '../viewWebGL2/viewWebGL2.js';

export type RendererPreference = 'auto' | 'webgpu' | 'webgl2';

export function getRendererPreference(): RendererPreference {
  const param = new URLSearchParams(window.location.search).get('renderer');
  if (param === 'webgl2' || param === 'webgpu') return param;
  const stored = localStorage.getItem('tetris_renderer');
  if (stored === 'webgl2' || stored === 'webgpu') return stored;
  return 'auto';
}

export function setRendererPreference(pref: RendererPreference): void {
  if (pref === 'auto') {
    localStorage.removeItem('tetris_renderer');
  } else {
    localStorage.setItem('tetris_renderer', pref);
  }
}

async function createWebGPUView(
  element: HTMLElement,
  width: number,
  height: number,
  rows: number,
  cols: number,
  nextPieceContext: CanvasRenderingContext2D,
  holdPieceContext: CanvasRenderingContext2D,
): Promise<IView | null> {
  if (!navigator.gpu) return null;
  const view = await ViewWebGPU.create(element, width, height, rows, cols, nextPieceContext, holdPieceContext);
  if (!(view as { isWebGPU?: { result: boolean } }).isWebGPU?.result) return null;
  return view as unknown as IView;
}

export async function createView(
  element: HTMLElement,
  width: number,
  height: number,
  rows: number,
  cols: number,
  nextPieceContext: CanvasRenderingContext2D,
  holdPieceContext: CanvasRenderingContext2D,
): Promise<IView> {
  const pref = getRendererPreference();

  if (pref === 'webgl2') {
    return ViewWebGL2.create(element, width, height, rows, cols, nextPieceContext, holdPieceContext);
  }

  if (pref === 'webgpu') {
    const gpuView = await createWebGPUView(element, width, height, rows, cols, nextPieceContext, holdPieceContext);
    if (gpuView) return gpuView;
    console.warn('WebGPU requested but unavailable — falling back to WebGL2.');
    return ViewWebGL2.create(element, width, height, rows, cols, nextPieceContext, holdPieceContext);
  }

  const gpuView = await createWebGPUView(element, width, height, rows, cols, nextPieceContext, holdPieceContext);
  if (gpuView) return gpuView;

  console.warn('WebGPU unavailable — using WebGL2 fallback renderer.');
  return ViewWebGL2.create(element, width, height, rows, cols, nextPieceContext, holdPieceContext);
}
