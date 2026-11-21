/**
 * Render-resolution policy: how many pixels the canvas backing store (and with it
 * every full-screen target — offscreen, bloom input, backdrop, bloom pyramid) gets.
 *
 * Before this, backing size was `innerWidth * devicePixelRatio * renderScale`
 * unconditionally, so a 4K panel at DPR 2 with 1.5x supersampling quietly rendered
 * ~19 MP of bloom. Two independent, pure pieces (unit-tested with plain numbers):
 *
 *  1. {@link resolveBackingSize} — a *static* cap: DPR is clamped, the pixel count
 *     is held to a per-quality budget, and the result never exceeds the device's
 *     `maxTextureDimension2D` (an oversized canvas is a validation error, not a
 *     slow frame). Screens that fit the budget get exactly what they got before.
 *  2. {@link tickResolutionGovernor} — a *dynamic* factor driven by measured frame
 *     time. Deliberately slower than `adaptiveQuality.ts` (which reacts first with
 *     its cumulative steps) and quantised to a few levels, because every change
 *     recreates all full-screen targets.
 *
 * Both only ever *reduce* relative to what the player's settings ask for.
 */

import type { GameSettings } from '../config/gameSettings.js';
import { RENDER_SCALE_CONFIG } from '../config/renderConfig.js';

/** Backing-store DPR ceiling: phones report 3, and nobody can see the third pixel. */
export const MAX_BACKING_DPR = 2;

/** Pixel budget per quality tier (full-screen targets). `ultra` fits a native 4K frame. */
export const PIXEL_BUDGET: Record<GameSettings['quality'], number> = {
  low: 2_100_000, // ~1080p
  medium: 3_700_000, // ~1440p
  high: 5_600_000,
  ultra: 8_500_000, // 3840x2160 = 8.29 MP
  custom: 8_500_000,
};

export type BackingCap = 'none' | 'dpr' | 'pixel-budget' | 'texture-limit';

export interface BackingSizeInput {
  /** Layout (CSS) size of the canvas. */
  cssWidth: number;
  cssHeight: number;
  devicePixelRatio: number;
  /** The player's render scale (already includes adaptive-quality deltas). */
  renderScale: number;
  quality: GameSettings['quality'];
  /** Governor factor in (0, 1]; 1 when it is not engaged. */
  factor?: number;
  /** `device.limits.maxTextureDimension2D`; omitted = unknown (assume the spec default 8192). */
  maxTextureDimension?: number;
}

export interface BackingSize {
  width: number;
  height: number;
  /** Effective pixels per CSS pixel, per axis. */
  scale: number;
  /** The strongest cap that applied (`none` = what the settings asked for). */
  cap: BackingCap;
}

const DEFAULT_MAX_TEXTURE_DIMENSION = 8192;

export function resolveBackingSize(input: BackingSizeInput): BackingSize {
  const cssWidth = Math.max(1, input.cssWidth);
  const cssHeight = Math.max(1, input.cssHeight);
  const dpr = Number.isFinite(input.devicePixelRatio) && input.devicePixelRatio > 0 ? input.devicePixelRatio : 1;
  const scaleSetting = Number.isFinite(input.renderScale) && input.renderScale > 0 ? input.renderScale : 1;
  const factor = input.factor !== undefined && input.factor > 0 ? Math.min(1, input.factor) : 1;

  let cap: BackingCap = 'none';
  let scale = Math.min(dpr, MAX_BACKING_DPR);
  if (dpr > MAX_BACKING_DPR) cap = 'dpr';
  scale *= scaleSetting;
  if (factor < 1) scale *= factor;

  const budget = PIXEL_BUDGET[input.quality] ?? PIXEL_BUDGET.ultra;
  const pixels = cssWidth * scale * cssHeight * scale;
  if (pixels > budget) {
    scale *= Math.sqrt(budget / pixels);
    cap = 'pixel-budget';
  }

  const maxDim = input.maxTextureDimension ?? DEFAULT_MAX_TEXTURE_DIMENSION;
  const longest = Math.max(cssWidth, cssHeight) * scale;
  if (longest > maxDim) {
    scale *= maxDim / longest;
    cap = 'texture-limit';
  }

  return {
    width: Math.max(1, Math.min(maxDim, Math.floor(cssWidth * scale))),
    height: Math.max(1, Math.min(maxDim, Math.floor(cssHeight * scale))),
    scale,
    cap,
  };
}

/**
 * The longest backing dimension this policy can ask for on a screen — what the device
 * must be able to allocate. Used to request `maxTextureDimension2D` only when the
 * default 8192 would not be enough.
 */
export function maxBackingDimension(screenCssWidth: number, screenCssHeight: number, dpr: number): number {
  const size = resolveBackingSize({
    cssWidth: screenCssWidth,
    cssHeight: screenCssHeight,
    devicePixelRatio: dpr,
    renderScale: RENDER_SCALE_CONFIG.MAX,
    quality: 'ultra',
    maxTextureDimension: Number.MAX_SAFE_INTEGER,
  });
  return Math.max(size.width, size.height);
}

// ---------------------------------------------------------------------------
// Governor
// ---------------------------------------------------------------------------

/** Quantised linear-scale factors. Four small steps; each change recreates the targets. */
export const GOVERNOR_FACTORS: readonly number[] = [1, 0.85, 0.72, 0.61, 0.52];

export interface ResolutionGovernorConfig {
  /** Over this multiple of the budget counts as over. */
  overRatio: number;
  /** Under this multiple counts as comfortably under. */
  underRatio: number;
  /** Consecutive over-budget frames before stepping down (~1.5 s at 60 fps). */
  downFrames: number;
  /** Consecutive under-budget frames before stepping back up (~5 s). */
  upFrames: number;
  /** Never govern a backing store at or below this many pixels. */
  minGovernedPixels: number;
}

export const DEFAULT_GOVERNOR_CONFIG: ResolutionGovernorConfig = {
  overRatio: 1.25,
  underRatio: 0.8,
  downFrames: 90,
  upFrames: 300,
  minGovernedPixels: 1_500_000,
};

export interface ResolutionGovernorState {
  /** Index into {@link GOVERNOR_FACTORS}. */
  level: number;
  consecutiveOver: number;
  consecutiveUnder: number;
}

export function createResolutionGovernor(): ResolutionGovernorState {
  return { level: 0, consecutiveOver: 0, consecutiveUnder: 0 };
}

export function governorFactor(state: ResolutionGovernorState): number {
  return GOVERNOR_FACTORS[state.level] ?? 1;
}

export interface GovernorTick {
  /** Smoothed frame time (`adaptiveState.emaMs`); 0 = no measurement yet. */
  emaMs: number;
  budgetMs: number;
  /** False when the player disabled adaptive quality or locked it: the governor then releases. */
  enabled: boolean;
  /** Current backing store size in pixels. */
  backingPixels: number;
  config?: Partial<ResolutionGovernorConfig>;
}

/**
 * Advance one frame. Returns true when the factor changed (the caller resizes).
 * Allocation-free once `config` is omitted.
 */
export function tickResolutionGovernor(state: ResolutionGovernorState, tick: GovernorTick): boolean {
  const cfg = tick.config ? { ...DEFAULT_GOVERNOR_CONFIG, ...tick.config } : DEFAULT_GOVERNOR_CONFIG;

  if (!tick.enabled) {
    const changed = state.level !== 0;
    state.level = 0;
    state.consecutiveOver = 0;
    state.consecutiveUnder = 0;
    return changed;
  }
  if (tick.emaMs <= 0) return false;

  const over = tick.emaMs > tick.budgetMs * cfg.overRatio;
  const under = tick.emaMs < tick.budgetMs * cfg.underRatio;
  if (over) {
    state.consecutiveOver++;
    state.consecutiveUnder = 0;
  } else if (under) {
    state.consecutiveUnder++;
    state.consecutiveOver = 0;
  } else {
    state.consecutiveOver = 0;
    state.consecutiveUnder = 0;
  }

  if (
    state.consecutiveOver >= cfg.downFrames &&
    state.level < GOVERNOR_FACTORS.length - 1 &&
    tick.backingPixels > cfg.minGovernedPixels
  ) {
    state.level++;
    state.consecutiveOver = 0;
    return true;
  }
  if (state.consecutiveUnder >= cfg.upFrames && state.level > 0) {
    state.level--;
    state.consecutiveUnder = 0;
    return true;
  }
  return false;
}
