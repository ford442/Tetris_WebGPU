/**
 * Dev hotkey for the material inspector.
 *
 * `Shift+M` cycles final → albedo → metal → glass → roughness → normals → final.
 * The selected view is a uniform (AuthoredMaterialParams.mapParams.w), so switching
 * costs a 48-byte buffer write — no pipeline rebuild, no page reload, and the board
 * keeps playing underneath. That is what makes it usable for checking a new
 * `block-*.png` against the contract by eye.
 *
 * Unlike `?debug` (src/webgpu/debug_shaders.ts), which swaps the whole fragment
 * shader at startup, this inspects the *production* shading path.
 */

import { MaterialDebugView } from '../webgpu/blockMaterial.js';
import { renderLogger } from '../utils/logger.js';

const CYCLE = [
  MaterialDebugView.off,
  MaterialDebugView.albedo,
  MaterialDebugView.metalMask,
  MaterialDebugView.glassMask,
  MaterialDebugView.roughness,
  MaterialDebugView.normal,
] as const;

const LABELS = ['final', 'albedo', 'metal mask', 'glass mask', 'roughness', 'normals'];

export const MATERIAL_DEBUG_STORAGE_KEY = 'tetris_material_debug_view';

export interface MaterialDebugTarget {
  setMaterialDebugView?(mode: number): void;
}

/** Next view in the cycle (exported for tests — no DOM needed). */
export function nextMaterialDebugView(current: number): number {
  const index = CYCLE.indexOf(current as (typeof CYCLE)[number]);
  return CYCLE[(index + 1) % CYCLE.length];
}

export function materialDebugViewLabel(mode: number): string {
  return LABELS[mode] ?? `view ${mode}`;
}

/**
 * Install the hotkey. No-ops on renderers that do not implement the inspector, so
 * the WebGL2 and C++ paths can adopt it without touching this file.
 */
export function installMaterialDebugHotkey(view: MaterialDebugTarget): () => void {
  if (typeof document === 'undefined' || typeof view.setMaterialDebugView !== 'function') {
    return () => {};
  }

  let current = 0;
  try {
    current = Number(localStorage.getItem(MATERIAL_DEBUG_STORAGE_KEY) ?? 0) || 0;
  } catch {
    current = 0;
  }
  if (current !== 0) view.setMaterialDebugView(current);

  const onKeyDown = (e: KeyboardEvent) => {
    if (!e.shiftKey || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key !== 'M' && e.key !== 'm') return;
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    current = nextMaterialDebugView(current);
    view.setMaterialDebugView?.(current);
    try {
      localStorage.setItem(MATERIAL_DEBUG_STORAGE_KEY, String(current));
    } catch {
      // Private browsing — the view still applies, it just will not persist.
    }
    renderLogger.info(`Material inspector: ${materialDebugViewLabel(current)}`);
  };

  document.addEventListener('keydown', onKeyDown);
  return () => document.removeEventListener('keydown', onKeyDown);
}
