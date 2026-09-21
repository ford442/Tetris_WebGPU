import type { IView } from './IView.js';
import ViewWebGPU from '../viewWebGPU.js';
import ViewWebGL2 from '../viewWebGL2/viewWebGL2.js';
import { getRendererPreference } from './rendererPreference.js';
import { buildWebgpuProbe, getWebgpuProbe, type WebgpuProbeResult } from '../webgpu/bootProbe.js';
import { showFatalWebgpuOverlay } from '../webgpu/fatalBootOverlay.js';

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

/**
 * Thrown when the session's single active WebGPU renderer (TS or cpp — never
 * both) can't get a GPU device. This game is WebGPU-only: that failure is
 * fatal, not a cue to quietly stand up a WebGL board instead. See
 * docs/webgpu-boot-probe.md.
 */
export class WebgpuBootFailure extends Error {
  readonly probe: WebgpuProbeResult;

  constructor(probe: WebgpuProbeResult) {
    super(`WebGPU unavailable (${probe.renderer}): ${probe.reason ?? 'unknown reason'}`);
    this.name = 'WebgpuBootFailure';
    this.probe = probe;
  }
}

async function createCppView(...args: ViewFactoryArgs): Promise<IView> {
  const mod = await import('../viewCpp/EmscriptenView.js');
  const EmscriptenView = mod.default;
  if (!EmscriptenView?.create) {
    throw new WebgpuBootFailure(buildWebgpuProbe('cpp', false, 'cpp-module-export-missing'));
  }

  const view = await EmscriptenView.create(...args);
  if (!view.isGpuReady) {
    view.dispose?.();
    throw new WebgpuBootFailure(getWebgpuProbe() ?? buildWebgpuProbe('cpp', false));
  }
  return view as unknown as IView;
}

async function createWebGPUView(...args: ViewFactoryArgs): Promise<IView> {
  const view = await ViewWebGPU.create(...args);
  const isWebGPU = (view as { isWebGPU?: { result: boolean; description?: string } }).isWebGPU;
  if (!isWebGPU?.result) {
    // `preRender()` (and its own probe) never runs when `navigator.gpu` is
    // absent entirely — fall back to the constructor's own description so
    // that case still gets a real reason instead of "unknown-failure".
    throw new WebgpuBootFailure(
      getWebgpuProbe() ?? buildWebgpuProbe('ts', false, isWebGPU?.description ?? 'navigator.gpu-unavailable'),
    );
  }
  return view as unknown as IView;
}

async function createWebGL2View(...args: ViewFactoryArgs): Promise<IView> {
  return ViewWebGL2.create(...args);
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

  // Explicit `?renderer=webgl2` is a deliberate manual choice — not an
  // automatic rescue for a WebGPU failure — so it's left untouched.
  if (pref === 'webgl2') {
    return createWebGL2View(...args);
  }

  const activeRenderer: 'cpp' | 'ts' = pref === 'webgpu-cpp' ? 'cpp' : 'ts';

  try {
    return activeRenderer === 'cpp' ? await createCppView(...args) : await createWebGPUView(...args);
  } catch (err) {
    // Never start a second device as a rescue (TS after cpp, or WebGL2 after
    // either) — the active path failing is fatal, full stop (#485).
    const probe = err instanceof WebgpuBootFailure
      ? err.probe
      : buildWebgpuProbe(activeRenderer, false, err instanceof Error ? err.message : String(err));
    showFatalWebgpuOverlay(element, probe);
    throw err instanceof WebgpuBootFailure ? err : new WebgpuBootFailure(probe);
  }
}
