import type { IView } from './IView.js';

export const RENDERER_BADGE_ID = 'renderer-badge';

/** Short on-screen label for the backend that is actually drawing. */
export function rendererBadgeLabel(view: Pick<IView, 'rendererName' | 'fallbackReason'>): string {
  switch (view.rendererName) {
    case 'webgl2':
      return view.fallbackReason ? 'WebGL2 (no WebGPU)' : 'WebGL2';
    case 'webgpu-cpp':
      return 'WebGPU (C++)';
    default:
      return 'WebGPU';
  }
}

/**
 * Show which backend is active (bottom-right). Idempotent: an existing badge is
 * replaced. The C++ view manages its own, more detailed badge, so it's skipped.
 */
export function showRendererBadge(view: Pick<IView, 'rendererName' | 'fallbackReason'>): HTMLElement | null {
  if (typeof document === 'undefined' || view.rendererName === 'webgpu-cpp') return null;
  document.getElementById(RENDERER_BADGE_ID)?.remove();

  const badge = document.createElement('div');
  badge.id = RENDERER_BADGE_ID;
  badge.textContent = rendererBadgeLabel(view);
  if (view.fallbackReason) {
    badge.title = `WebGPU unavailable: ${view.fallbackReason}`;
  }
  badge.style.cssText =
    'position:fixed;bottom:8px;right:8px;z-index:9999;padding:4px 8px;' +
    'font:12px monospace;background:rgba(0,0,0,0.55);border-radius:4px;pointer-events:none;' +
    `color:${view.rendererName === 'webgl2' ? '#8cf' : '#9f9'};`;
  document.body.appendChild(badge);
  return badge;
}
