/**
 * Rolling frame-time budget + adaptive quality controller (pure logic, unit-testable).
 *
 * Reduces quality in ordered steps when over budget; recovers slowly with hysteresis.
 * Respects `lockQuality` — user preset is the ceiling, adaptive only scales down.
 *
 * Versus split-screen: particle cap never exceeds `SPLIT_PARTICLE_CAP` (800) when
 * `splitScreenActive` is true — adaptive reductions stack on top of that hard cap.
 */

import type { GameSettings } from '../config/gameSettings.js';
import { QUALITY_PRESET_VALUES } from '../config/renderConfig.js';
import { particleBudgetForQuality } from './particles/layout.js';
import { SPLIT_PARTICLE_CAP } from '../versus/splitScreen.js';
import { RENDER_SCALE_CONFIG } from '../config/renderConfig.js';

/** Target frame budgets in milliseconds. */
export const FRAME_BUDGET_MS = {
  FPS_60: 1000 / 60,
  FPS_120: 1000 / 120,
} as const;

export type FrameBudgetTarget = keyof typeof FRAME_BUDGET_MS;

export interface AdaptiveQualityConfig {
  budgetMs: number;
  /** Frames over budget before stepping down (hysteresis). */
  downgradeFrames: number;
  /** Frames under budget before stepping up (slower recovery). */
  upgradeFrames: number;
  /** Over-budget ratio to trigger downgrade (e.g. 1.12 = 12% over). */
  downgradeRatio: number;
  /** Under-budget ratio to trigger upgrade (e.g. 0.88). */
  upgradeRatio: number;
  emaAlpha: number;
}

export const DEFAULT_ADAPTIVE_CONFIG: AdaptiveQualityConfig = {
  budgetMs: FRAME_BUDGET_MS.FPS_60,
  downgradeFrames: 4,
  upgradeFrames: 45,
  downgradeRatio: 1.12,
  upgradeRatio: 0.88,
  emaAlpha: 0.15,
};

/** Ordered reduction steps (index 0 = first cut, cumulative with baseline). */
export const ADAPTIVE_STEP_COUNT = 6;

export interface AdaptiveStepEffect {
  renderScaleDelta: number;
  disableCrt: boolean;
  disableFilmGrain: boolean;
  particleCap: number | null;
  disableReactiveVideo: boolean;
}

/** Each step applies on top of the user's baseline settings. */
export const ADAPTIVE_STEPS: readonly AdaptiveStepEffect[] = [
  { renderScaleDelta: -0.1, disableCrt: false, disableFilmGrain: false, particleCap: null, disableReactiveVideo: false },
  { renderScaleDelta: -0.15, disableCrt: false, disableFilmGrain: false, particleCap: null, disableReactiveVideo: false },
  { renderScaleDelta: -0.2, disableCrt: true, disableFilmGrain: false, particleCap: null, disableReactiveVideo: false },
  { renderScaleDelta: 0, disableCrt: true, disableFilmGrain: true, particleCap: null, disableReactiveVideo: false },
  { renderScaleDelta: 0, disableCrt: true, disableFilmGrain: true, particleCap: 1500, disableReactiveVideo: false },
  { renderScaleDelta: 0, disableCrt: true, disableFilmGrain: true, particleCap: 800, disableReactiveVideo: true },
];

export interface BudgetSampleInput {
  frameMs: number;
  config?: Partial<AdaptiveQualityConfig>;
}

export interface BudgetSampleResult {
  emaMs: number;
  overBudget: boolean;
  underBudget: boolean;
  consecutiveOver: number;
  consecutiveUnder: number;
  shouldDowngrade: boolean;
  shouldUpgrade: boolean;
}

/**
 * Pure rolling budget evaluator — no allocations when `state` is reused.
 */
export function sampleFrameBudget(
  state: {
    emaMs: number;
    consecutiveOver: number;
    consecutiveUnder: number;
  },
  input: BudgetSampleInput,
): BudgetSampleResult {
  const cfg = { ...DEFAULT_ADAPTIVE_CONFIG, ...input.config };
  const alpha = cfg.emaAlpha;
  state.emaMs = state.emaMs === 0 ? input.frameMs : state.emaMs * (1 - alpha) + input.frameMs * alpha;

  const overBudget = state.emaMs > cfg.budgetMs * cfg.downgradeRatio;
  const underBudget = state.emaMs < cfg.budgetMs * cfg.upgradeRatio;

  if (overBudget) {
    state.consecutiveOver++;
    state.consecutiveUnder = 0;
  } else if (underBudget) {
    state.consecutiveUnder++;
    state.consecutiveOver = 0;
  } else {
    state.consecutiveOver = 0;
    state.consecutiveUnder = 0;
  }

  return {
    emaMs: state.emaMs,
    overBudget,
    underBudget,
    consecutiveOver: state.consecutiveOver,
    consecutiveUnder: state.consecutiveUnder,
    shouldDowngrade: state.consecutiveOver >= cfg.downgradeFrames,
    shouldUpgrade: state.consecutiveUnder >= cfg.upgradeFrames,
  };
}

export interface ApplyAdaptiveStepOptions {
  baseline: GameSettings;
  stepIndex: number;
  splitScreenActive?: boolean;
}

/**
 * Merge baseline user settings with cumulative adaptive step reductions.
 * Returns a new settings object (does not mutate baseline).
 */
export function applyAdaptiveStep(options: ApplyAdaptiveStepOptions): GameSettings {
  const { baseline, stepIndex } = options;
  const step = Math.max(0, Math.min(stepIndex, ADAPTIVE_STEP_COUNT - 1));

  let renderScale = baseline.renderScale;
  let crt = baseline.crt;
  let filmGrain = baseline.filmGrain;
  let reactiveVideo = baseline.reactiveVideo;
  let particles = baseline.particles;

  for (let i = 0; i <= step; i++) {
    const s = ADAPTIVE_STEPS[i];
    if (s.renderScaleDelta !== 0) {
      renderScale = Math.max(RENDER_SCALE_CONFIG.MIN, renderScale + s.renderScaleDelta);
    }
    if (s.disableCrt) crt = false;
    if (s.disableFilmGrain) filmGrain = false;
    if (s.disableReactiveVideo) reactiveVideo = false;
    if (s.particleCap !== null) {
      particles = true; // keep particles on but capped via applyGameSettings path
    }
  }

  const next: GameSettings = {
    ...baseline,
    quality: 'custom',
    renderScale,
    crt,
    filmGrain,
    reactiveVideo,
    particles,
  };

  return next;
}

/** Effective particle cap after adaptive step + versus split cap. */
export function adaptiveParticleCap(
  stepIndex: number,
  baselineQuality: GameSettings['quality'],
  splitScreenActive: boolean,
): number {
  const baselineBudget = particleBudgetForQuality(baselineQuality);
  let cap = baselineBudget;

  for (let i = 0; i <= stepIndex && i < ADAPTIVE_STEPS.length; i++) {
    const stepCap = ADAPTIVE_STEPS[i].particleCap;
    if (stepCap !== null) cap = Math.min(cap, stepCap);
  }

  if (splitScreenActive) {
    cap = Math.min(cap, SPLIT_PARTICLE_CAP);
  }

  return cap;
}

/** Pick frame budget from display refresh when available. */
export function detectFrameBudgetTarget(): FrameBudgetTarget {
  if (typeof window !== 'undefined' && typeof screen !== 'undefined') {
    const hz = (screen as Screen & { refreshRate?: number }).refreshRate;
    if (typeof hz === 'number' && hz >= 110) return 'FPS_120';
  }
  return 'FPS_60';
}

export function budgetMsForTarget(target: FrameBudgetTarget): number {
  return FRAME_BUDGET_MS[target];
}

export interface AdaptiveQualityControllerState {
  stepIndex: number;
  emaMs: number;
  consecutiveOver: number;
  consecutiveUnder: number;
  baseline: GameSettings | null;
  /** Pre-allocated scratch for applyAdaptiveStep output. */
  scratch: GameSettings;
}

export function createAdaptiveControllerState(): AdaptiveQualityControllerState {
  return {
    stepIndex: 0,
    emaMs: 0,
    consecutiveOver: 0,
    consecutiveUnder: 0,
    baseline: null,
    scratch: {} as GameSettings,
  };
}

export interface TickAdaptiveInput {
  frameMs: number;
  lockQuality: boolean;
  adaptiveEnabled: boolean;
  baseline: GameSettings;
  splitScreenActive: boolean;
  config?: Partial<AdaptiveQualityConfig>;
}

export interface TickAdaptiveResult {
  changed: boolean;
  stepIndex: number;
  settings: GameSettings;
  particleCap: number;
}

/**
 * Advance adaptive controller by one frame. Returns settings to apply when `changed`.
 * Reuses `state.scratch` — do not retain reference across frames.
 */
export function tickAdaptiveQuality(
  state: AdaptiveQualityControllerState,
  input: TickAdaptiveInput,
): TickAdaptiveResult {
  const cap = adaptiveParticleCap(state.stepIndex, input.baseline.quality, input.splitScreenActive);

  if (!input.adaptiveEnabled || input.lockQuality) {
    state.baseline = input.baseline;
    if (state.stepIndex !== 0) {
      state.stepIndex = 0;
      state.emaMs = 0;
      state.consecutiveOver = 0;
      state.consecutiveUnder = 0;
      Object.assign(state.scratch, input.baseline);
      return { changed: true, stepIndex: 0, settings: state.scratch, particleCap: cap };
    }
    Object.assign(state.scratch, input.baseline);
    return { changed: false, stepIndex: 0, settings: state.scratch, particleCap: cap };
  }

  state.baseline = input.baseline;

  const sample = sampleFrameBudget(state, {
    frameMs: input.frameMs,
    config: input.config,
  });

  let changed = false;
  if (sample.shouldDowngrade && state.stepIndex < ADAPTIVE_STEP_COUNT - 1) {
    state.stepIndex++;
    state.consecutiveOver = 0;
    state.consecutiveUnder = 0;
    changed = true;
  } else if (sample.shouldUpgrade && state.stepIndex > 0) {
    state.stepIndex--;
    state.consecutiveOver = 0;
    state.consecutiveUnder = 0;
    changed = true;
  }

  const merged = applyAdaptiveStep({
    baseline: input.baseline,
    stepIndex: state.stepIndex,
    splitScreenActive: input.splitScreenActive,
  });
  Object.assign(state.scratch, merged);

  const particleCap = adaptiveParticleCap(state.stepIndex, input.baseline.quality, input.splitScreenActive);

  return {
    changed,
    stepIndex: state.stepIndex,
    settings: state.scratch,
    particleCap,
  };
}

/** Document preset ceiling for a quality tier (for tests / overlay). */
export function baselineRenderScaleForQuality(quality: GameSettings['quality']): number {
  if (quality !== 'custom' && quality in QUALITY_PRESET_VALUES) {
    return QUALITY_PRESET_VALUES[quality as keyof typeof QUALITY_PRESET_VALUES].renderScale;
  }
  return RENDER_SCALE_CONFIG.DEFAULT;
}
