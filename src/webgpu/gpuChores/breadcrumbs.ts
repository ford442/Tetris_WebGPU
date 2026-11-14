/**
 * Breadcrumb trail for the GPU chore subsystem.
 *
 * Chores are best-effort helpers: every failure path degrades instead of
 * throwing, which makes "why did the juice go flat?" hard to answer from a
 * screenshot. Every state transition therefore drops a breadcrumb into a small
 * ring buffer that is mirrored onto `window.__tetrisGpuChores` so a bug report
 * can be read off the console without a rebuild:
 *
 *   > __tetrisGpuChores.breadcrumbs()
 *   [{ t: 1234.5, event: 'device:adopted', detail: 'tetris-main-device' }, ...]
 *
 * Pure and dependency-free (no WebGPU, no DOM required) so it is unit-testable
 * and safe to import from the C++/Emscripten adapter path too.
 */

import { createLogger } from '../../utils/logger.js';

export const choreLogger = createLogger('gpu-chores');

export interface ChoreBreadcrumb {
  /** Milliseconds since page start (or Date.now() when performance is absent). */
  t: number;
  /** Stable, greppable event id, e.g. `device:adopted` or `luma:disabled`. */
  event: string;
  /** Free-form detail — kept short; it lands in console output verbatim. */
  detail?: string;
}

/** Ring capacity — big enough for a whole session's transitions, small enough to log. */
export const BREADCRUMB_CAPACITY = 64;

const trail: ChoreBreadcrumb[] = [];

function now(): number {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now();
  }
  return Date.now();
}

/**
 * Record a chore state transition. Never throws — a breadcrumb failing must not
 * take down the frame it was describing.
 */
export function recordChoreBreadcrumb(event: string, detail?: string): ChoreBreadcrumb {
  const crumb: ChoreBreadcrumb = detail === undefined ? { t: now(), event } : { t: now(), event, detail };
  trail.push(crumb);
  if (trail.length > BREADCRUMB_CAPACITY) trail.splice(0, trail.length - BREADCRUMB_CAPACITY);
  choreLogger.debug(event, detail ?? '');
  return crumb;
}

/** Snapshot of the trail, oldest first. */
export function getChoreBreadcrumbs(): ChoreBreadcrumb[] {
  return trail.slice();
}

/** Drop the trail (tests, and device re-init on a fresh session). */
export function clearChoreBreadcrumbs(): void {
  trail.length = 0;
}

/** Most recent crumb whose event matches, or `null`. */
export function lastChoreBreadcrumb(event?: string): ChoreBreadcrumb | null {
  for (let i = trail.length - 1; i >= 0; i--) {
    if (!event || trail[i].event === event) return trail[i];
  }
  return null;
}

interface ChoreDebugHandle {
  breadcrumbs(): ChoreBreadcrumb[];
  clear(): void;
  status?: () => unknown;
}

/**
 * Publish the trail (and an optional status probe) on `window.__tetrisGpuChores`.
 * No-op outside a browser.
 */
export function exposeChoreDebugHandle(status?: () => unknown): void {
  if (typeof window === 'undefined') return;
  const handle: ChoreDebugHandle = {
    breadcrumbs: getChoreBreadcrumbs,
    clear: clearChoreBreadcrumbs,
  };
  if (status) handle.status = status;
  (window as unknown as Record<string, unknown>).__tetrisGpuChores = handle;
}
