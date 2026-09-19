/**
 * Enablement policy for GPU chores (pure logic, unit-testable).
 *
 * Chores are *post/juice helpers* — a luminance histogram that feeds the bloom
 * threshold, a downsample step for the bloom pyramid, an index compaction for
 * line-clear particle spawns. They never own board state, so the policy here
 * only decides how the juice is computed, never whether the game runs:
 *
 *   WebGPU compute  →  WASM/JS overlay FX (CPU)
 *
 * There is deliberately no WebGL2 rung: on the WebGL2 fallback renderer the
 * chores run on the CPU backend, which is exactly the "juice degrades, board
 * plays" behavior we want when WebGPU is missing or broken.
 */

/** Backends a chore can run on, best first. */
export type ChoreBackend = 'webgpu' | 'cpu';

/** Ordered fallback chain — there is intentionally no `webgl2` rung. */
export const CHORE_BACKEND_ORDER: readonly ChoreBackend[] = ['webgpu', 'cpu'] as const;

/** `?no_gpu_compute` (or `=1`/`=true`) and this storage key both force the CPU rung. */
export const NO_GPU_COMPUTE_STORAGE_KEY = 'tetris_no_gpu_compute';

export interface ChorePolicyInput {
  /** `window.location.search`, or an explicit query string in tests. */
  search?: string;
  /** Persisted kill-switch value (`localStorage[NO_GPU_COMPUTE_STORAGE_KEY]`). */
  storageValue?: string | null;
  /** Renderer that actually won the fallback chain and owns the device. */
  rendererName?: string;
  /** Whether that renderer handed us a live GPU device to adopt. */
  hasDevice?: boolean;
  /** Adapter power preference — `low-power` keeps extra compute off the budget. */
  powerPreference?: GPUPowerPreference | string;
  /** Quality preset; `low` skips the extra passes entirely. */
  quality?: string;
}

export interface ChorePolicy {
  backend: ChoreBackend;
  /** Stable, greppable reason id — also used as the breadcrumb detail. */
  reason: string;
}

function truthy(raw: string | null | undefined): boolean {
  if (raw == null) return false;
  const v = raw.toLowerCase();
  return v === '' || v === '1' || v === 'true' || v === 'yes' || v === 'on';
}

/**
 * Parse the `?no_gpu_compute` kill switch. Bare presence counts (`?no_gpu_compute`),
 * as does an explicit truthy value; `?no_gpu_compute=0` explicitly keeps GPU chores on
 * and overrides the persisted key.
 */
export function isGpuComputeKilled(search?: string, storageValue?: string | null): boolean {
  let raw: string | null = null;
  let present = false;
  const source = search ?? (typeof window !== 'undefined' ? window.location.search : '');
  try {
    const params = new URLSearchParams(source);
    present = params.has('no_gpu_compute');
    raw = params.get('no_gpu_compute');
  } catch {
    present = false;
    raw = null;
  }
  if (present) return truthy(raw);
  return truthy(storageValue ?? null);
}

/** Persisted kill-switch value, or `null` when storage is unavailable. */
export function readKillSwitchStorage(): string | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    return localStorage.getItem(NO_GPU_COMPUTE_STORAGE_KEY);
  } catch {
    return null;
  }
}

/**
 * Resolve which backend the chores should use. The result is advisory: the
 * runner can still fall to `cpu` at any point if a GPU call throws (that
 * transition is breadcrumbed as `*:disabled`).
 */
export function resolveChorePolicy(input: ChorePolicyInput = {}): ChorePolicy {
  if (isGpuComputeKilled(input.search, input.storageValue)) {
    return { backend: 'cpu', reason: 'kill-switch' };
  }
  if (input.hasDevice === false) {
    return { backend: 'cpu', reason: 'no-device' };
  }
  if (input.rendererName && input.rendererName !== 'webgpu' && input.rendererName !== 'webgpu-cpp') {
    return { backend: 'cpu', reason: `renderer:${input.rendererName}` };
  }
  if (input.quality === 'low') {
    return { backend: 'cpu', reason: 'quality:low' };
  }
  if (input.powerPreference === 'low-power') {
    return { backend: 'cpu', reason: 'power:low-power' };
  }
  return { backend: 'webgpu', reason: 'ok' };
}
