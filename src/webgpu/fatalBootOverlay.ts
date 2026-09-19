/**
 * Blocking fatal overlay shown when the active WebGPU renderer (TS or cpp)
 * cannot acquire a device. No 2D/GL board is drawn behind it — this replaces
 * the game entirely until the page is reloaded on a working setup. See
 * docs/webgpu-boot-probe.md.
 */
import type { WebgpuProbeResult } from './bootProbe.js';

export const FATAL_WEBGPU_OVERLAY_ID = 'tetris-fatal-webgpu-overlay';

function rendererLabel(renderer: WebgpuProbeResult['renderer']): string {
  return renderer === 'cpp' ? 'C++ WebGPU renderer' : 'TS WebGPU renderer';
}

export function showFatalWebgpuOverlay(container: HTMLElement | null | undefined, probe: WebgpuProbeResult): void {
  if (typeof document === 'undefined') return;
  removeFatalWebgpuOverlay();

  const overlay = document.createElement('div');
  overlay.id = FATAL_WEBGPU_OVERLAY_ID;
  overlay.setAttribute('role', 'alertdialog');
  overlay.setAttribute('aria-live', 'assertive');
  overlay.style.cssText = [
    'position:fixed', 'inset:0', 'z-index:100000',
    'display:flex', 'flex-direction:column', 'align-items:center', 'justify-content:center',
    'gap:12px', 'padding:24px', 'text-align:center', 'box-sizing:border-box',
    'font-family:sans-serif', 'color:#fff', 'background:#0a0a0f',
    'pointer-events:auto',
  ].join(';');

  const title = document.createElement('h1');
  title.textContent = 'WebGPU is required';
  title.style.cssText = 'font-size:22px;margin:0;';

  const body = document.createElement('p');
  body.style.cssText = 'max-width:560px;font-size:15px;line-height:1.5;color:#ccc;margin:0;';
  body.textContent = `The ${rendererLabel(probe.renderer)} could not get a GPU device on ${probe.browser}. `
    + (probe.reason ? `Reason: ${probe.reason}` : 'Reason unknown.');

  const hint = document.createElement('p');
  hint.style.cssText = 'max-width:560px;font-size:13px;color:#888;margin:0;';
  hint.textContent = 'WebGL fallback is intentionally disabled for this build — see docs/webgpu-boot-probe.md.';

  overlay.append(title, body, hint);
  (container ?? document.body).appendChild(overlay);
}

export function removeFatalWebgpuOverlay(): void {
  if (typeof document === 'undefined') return;
  document.getElementById(FATAL_WEBGPU_OVERLAY_ID)?.remove();
}
