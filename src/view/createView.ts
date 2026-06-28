import type { IView } from './IView.js';
import ViewWebGPU from '../viewWebGPU.js';
import ViewWebGL2 from '../viewWebGL2/viewWebGL2.js';
import { getRendererPreference } from './rendererPreference.js';

export type { RendererPreference } from './rendererPreference.js';
export { getRendererPreference, setRendererPreference } from './rendererPreference.js';

type ViewFactoryArgs = [
  HTMLElement,
  number,
  number,
  number,
  number,
  CanvasRenderingContext2D,
  CanvasRenderingContext2D,
];

async function createCppView(...args: ViewFactoryArgs): Promise<IView | null> {
  try {
    const mod = await import('../viewCpp/EmscriptenView.js');
    const EmscriptenView = mod.default ?? mod.EmscriptenView;
    if (!EmscriptenView?.create) {
      console.warn('EmscriptenView module loaded but create() is missing');
      return null;
    }
    return await EmscriptenView.create(...args);
  } catch (err) {
    console.warn('WebGPU C++ renderer failed to load or initialize:', err);
    return null;
  }
}

async function createWebGPUView(...args: ViewFactoryArgs): Promise<IView | null> {
  if (!navigator.gpu) return null;
  const view = await ViewWebGPU.create(...args);
  if (!(view as { isWebGPU?: { result: boolean } }).isWebGPU?.result) return null;
  return view as unknown as IView;
}

async function createWebGL2View(...args: ViewFactoryArgs): Promise<IView> {
  return ViewWebGL2.create(...args);
}

/** webgpu-cpp → TS WebGPU → WebGL2 */
async function createWithCppFallback(...args: ViewFactoryArgs): Promise<IView> {
  const cppView = await createCppView(...args);
  if (cppView) return cppView;

  console.warn('WebGPU C++ requested but unavailable — falling back to WebGPU (TS).');
  const gpuView = await createWebGPUView(...args);
  if (gpuView) return gpuView;

  console.warn('WebGPU unavailable — falling back to WebGL2.');
  return createWebGL2View(...args);
}

/** webgpu → WebGL2 */
async function createWithWebGpuFallback(...args: ViewFactoryArgs): Promise<IView> {
  const gpuView = await createWebGPUView(...args);
  if (gpuView) return gpuView;

  console.warn('WebGPU requested but unavailable — falling back to WebGL2.');
  return createWebGL2View(...args);
}

/** auto: WebGPU then WebGL2 */
async function createAuto(...args: ViewFactoryArgs): Promise<IView> {
  const gpuView = await createWebGPUView(...args);
  if (gpuView) return gpuView;

  console.warn('WebGPU unavailable — using WebGL2 fallback renderer.');
  return createWebGL2View(...args);
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
  const args: ViewFactoryArgs = [
    element,
    width,
    height,
    rows,
    cols,
    nextPieceContext,
    holdPieceContext,
  ];

  const pref = getRendererPreference();

  if (pref === 'webgl2') {
    return createWebGL2View(...args);
  }

  if (pref === 'webgpu-cpp') {
    return createWithCppFallback(...args);
  }

  if (pref === 'webgpu') {
    return createWithWebGpuFallback(...args);
  }

  return createAuto(...args);
}
