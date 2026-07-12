/**
 * WebGPU device and canvas lifecycle helpers for the View renderer.
 * Extracted from viewWebGPU.ts to keep the orchestrator thin.
 */

/**
 * Request a GPU adapter/device and configure the canvas context.
 * Sizes the backing canvas to the device pixel ratio.
 *
 * Returns the preferred presentation format on success, or `null` if no
 * adapter is available (caller should abort initialization).
 */
export async function acquireGpuContext(view: any): Promise<GPUTextureFormat | null> {
  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) return null;
  view.device = await adapter.requestDevice();

  const dpr = window.devicePixelRatio || 1;
  view.canvasWebGPU.width = view.width * dpr;
  view.canvasWebGPU.height = view.height * dpr;

  const presentationFormat = navigator.gpu.getPreferredCanvasFormat();
  view.ctxWebGPU.configure({
    device: view.device,
    format: presentationFormat,
    alphaMode: 'premultiplied',
  });

  view.reactiveVideoBackground.setWebGPUDevice(view.device);
  return presentationFormat;
}

/**
 * Handle a window resize: recompute canvas backing size (with render scale),
 * reconfigure the context, and resize render targets / bloom.
 */
export function resizeGpuContext(view: any) {
  if (!view.device) return;
  const dpr = window.devicePixelRatio || 1;
  view.width = window.innerWidth;
  view.height = window.innerHeight;

  // Apply render scale for supersampling.
  const scaledWidth = Math.floor(view.width * dpr * view.renderScale);
  const scaledHeight = Math.floor(view.height * dpr * view.renderScale);

  view.canvasWebGPU.width = scaledWidth;
  view.canvasWebGPU.height = scaledHeight;
  // CSS keeps it at screen size, internal resolution is higher.
  view.canvasWebGPU.style.width = `${view.width}px`;
  view.canvasWebGPU.style.height = `${view.height}px`;

  view.playfildWidth = (view.width * 2) / 3;
  view.playfildHeight = view.height;
  view.playfildInnerWidth = view.playfildWidth - view.playfildBorderWidth * 2;
  view.playfildInnerHeight = view.playfildHeight - view.playfildBorderWidth * 2 - 2;

  view.visualEffects.updateVideoPosition(view.width, view.height);

  const presentationFormat = navigator.gpu.getPreferredCanvasFormat();
  view.ctxWebGPU.configure({
    device: view.device,
    format: presentationFormat,
    alphaMode: 'premultiplied',
  });

  view.postProcessor.resize(scaledWidth, scaledHeight);

  // Resize bloom system (async - GPU syncs before destroying old textures).
  if (view.bloomSystem) {
    view.bloomSystem.resize(scaledWidth, scaledHeight).catch(() => {});
  }
}
