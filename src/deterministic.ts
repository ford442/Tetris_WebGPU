/**
 * `?deterministic` — reproducible frames for visual regression.
 *
 *   ?deterministic            seed 1
 *   ?deterministic&seed=42    explicit seed
 *
 * What it pins, and what it deliberately leaves alone:
 *   - `Math.random` becomes a seeded Mulberry32 stream, so the 7-bag (via the replay seed the
 *     controller generates), the particle emitter, camera shake and every other `Math.random()`
 *     call replay identically. Same seed + same call order => same numbers.
 *   - `<video>` background elements are paused on their first frame. A playing video is the one
 *     moving part of a settled frame that no clock override can reach.
 *   - Time is NOT touched here: tests drive it with Playwright's `page.clock`, which controls
 *     `performance.now`, timers and `requestAnimationFrame` together. Gameplay (gravity, DAS) is
 *     covered by the replay simulator, not by wall-clock input.
 *
 * Off by default and inert unless the flag is present: the shipped game never takes this path.
 */

import { createSeededRng } from './game/pieces.js';

export interface DeterministicConfig {
  enabled: boolean;
  seed: number;
}

export const DEFAULT_DETERMINISTIC_SEED = 1;

/** Parse `?deterministic` / `?deterministic=1` and optional `?seed=N` (non-negative integer). */
export function parseDeterministic(search: string): DeterministicConfig {
  const params = new URLSearchParams(search);
  if (!params.has('deterministic')) return { enabled: false, seed: DEFAULT_DETERMINISTIC_SEED };
  const flag = params.get('deterministic');
  if (flag === '0' || flag === 'false') return { enabled: false, seed: DEFAULT_DETERMINISTIC_SEED };
  const raw = params.get('seed');
  const parsed = raw !== null && /^\d+$/.test(raw) ? Number(raw) : NaN;
  return {
    enabled: true,
    seed: Number.isSafeInteger(parsed) ? parsed >>> 0 : DEFAULT_DETERMINISTIC_SEED,
  };
}

/** Minimal window surface used here, so the install is unit-testable without a DOM. */
export interface DeterministicHost {
  Math: { random: () => number };
  document?: {
    documentElement?: { dataset?: Record<string, string | undefined> };
    addEventListener(type: string, listener: (e: { target: unknown }) => void, capture: boolean): void;
  };
}

interface VideoLike {
  pause(): void;
  currentTime: number;
}

function isVideo(target: unknown): target is VideoLike {
  return !!target && typeof (target as VideoLike).pause === 'function' && 'currentTime' in (target as object);
}

/**
 * Apply the deterministic runtime to `host`. Returns the config it applied, or null when the flag
 * is absent (in which case nothing is touched).
 */
export function installDeterministicRuntime(host: DeterministicHost, search: string): DeterministicConfig | null {
  const config = parseDeterministic(search);
  if (!config.enabled) return null;

  host.Math.random = createSeededRng(config.seed);

  const doc = host.document;
  if (doc) {
    if (doc.documentElement?.dataset) doc.documentElement.dataset.deterministic = String(config.seed);
    // `play` does not bubble, so listen in the capture phase to catch every <video>, including ones
    // the reactive background creates later. A video that starts playing is stopped on frame 0.
    const freeze = (e: { target: unknown }): void => {
      if (!isVideo(e.target)) return;
      e.target.pause();
      e.target.currentTime = 0;
    };
    doc.addEventListener('play', freeze, true);
    doc.addEventListener('playing', freeze, true);
  }
  return config;
}
