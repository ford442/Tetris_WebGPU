import { describe, it, expect } from 'vitest';
import {
  ADAPTIVE_STEP_COUNT,
  applyAdaptiveStep,
  adaptiveParticleCap,
  budgetMsForTarget,
  createAdaptiveControllerState,
  DEFAULT_ADAPTIVE_CONFIG,
  FRAME_BUDGET_MS,
  sampleFrameBudget,
  tickAdaptiveQuality,
} from '../src/webgpu/adaptiveQuality.js';
import { settingsFromPreset } from '../src/config/gameSettings.js';
import { SPLIT_PARTICLE_CAP } from '../src/versus/splitScreen.js';

describe('adaptiveQuality budget logic', () => {
  it('exposes 60fps and 120fps frame budgets', () => {
    expect(FRAME_BUDGET_MS.FPS_60).toBeCloseTo(16.67, 1);
    expect(FRAME_BUDGET_MS.FPS_120).toBeCloseTo(8.33, 1);
    expect(budgetMsForTarget('FPS_60')).toBe(FRAME_BUDGET_MS.FPS_60);
  });

  it('requires consecutive over-budget frames before downgrade', () => {
    const state = { emaMs: 0, consecutiveOver: 0, consecutiveUnder: 0 };
    const cfg = { ...DEFAULT_ADAPTIVE_CONFIG, downgradeFrames: 3, emaAlpha: 1 };

    sampleFrameBudget(state, { frameMs: 25, config: cfg });
    expect(state.consecutiveOver).toBe(1);
    let result = sampleFrameBudget(state, { frameMs: 25, config: cfg });
    expect(result.shouldDowngrade).toBe(false);

    sampleFrameBudget(state, { frameMs: 25, config: cfg });
    result = sampleFrameBudget(state, { frameMs: 25, config: cfg });
    expect(result.shouldDowngrade).toBe(true);
  });

  it('recovers slowly with upgrade hysteresis', () => {
    const state = { emaMs: 30, consecutiveOver: 0, consecutiveUnder: 0 };
    const cfg = {
      ...DEFAULT_ADAPTIVE_CONFIG,
      upgradeFrames: 2,
      emaAlpha: 1,
      downgradeRatio: 1.5,
      upgradeRatio: 0.9,
    };

    sampleFrameBudget(state, { frameMs: 10, config: cfg });
    let result = sampleFrameBudget(state, { frameMs: 10, config: cfg });
    expect(result.shouldUpgrade).toBe(true);
  });

  it('reduces render scale and premium toggles by step', () => {
    const baseline = settingsFromPreset('ultra');
    const step0 = applyAdaptiveStep({ baseline, stepIndex: 0 });
    expect(step0.renderScale).toBeLessThan(baseline.renderScale);

    const last = applyAdaptiveStep({ baseline, stepIndex: ADAPTIVE_STEP_COUNT - 1 });
    expect(last.crt).toBe(false);
    expect(last.filmGrain).toBe(false);
    expect(last.reactiveVideo).toBe(false);
  });

  it('caps particles at SPLIT_PARTICLE_CAP during versus split', () => {
    const cap = adaptiveParticleCap(ADAPTIVE_STEP_COUNT - 1, 'ultra', true);
    expect(cap).toBeLessThanOrEqual(SPLIT_PARTICLE_CAP);
    expect(cap).toBe(SPLIT_PARTICLE_CAP);
  });

  it('tickAdaptiveQuality steps down under sustained load', () => {
    const controller = createAdaptiveControllerState();
    const baseline = settingsFromPreset('ultra', { reactiveVideo: true });
    const fastCfg = {
      budgetMs: 16.67,
      downgradeFrames: 2,
      emaAlpha: 1,
      downgradeRatio: 1.05,
    };

    let step = 0;
    for (let i = 0; i < 8; i++) {
      const tick = tickAdaptiveQuality(controller, {
        frameMs: 28,
        lockQuality: false,
        adaptiveEnabled: true,
        baseline,
        splitScreenActive: false,
        config: fastCfg,
      });
      if (tick.changed) step = tick.stepIndex;
    }

    expect(step).toBeGreaterThan(0);
  });

  it('does not change quality when lockQuality is set', () => {
    const controller = createAdaptiveControllerState();
    const baseline = settingsFromPreset('ultra');
    baseline.lockQuality = true;

    for (let i = 0; i < 20; i++) {
      tickAdaptiveQuality(controller, {
        frameMs: 40,
        lockQuality: true,
        adaptiveEnabled: true,
        baseline,
        splitScreenActive: false,
        config: { downgradeFrames: 1, emaAlpha: 1 },
      });
    }

    expect(controller.stepIndex).toBe(0);
  });

  it('resets adaptive step when disabled', () => {
    const controller = createAdaptiveControllerState();
    controller.stepIndex = 3;
    const baseline = settingsFromPreset('high');

    const tick = tickAdaptiveQuality(controller, {
      frameMs: 12,
      lockQuality: false,
      adaptiveEnabled: false,
      baseline,
      splitScreenActive: false,
    });

    expect(tick.stepIndex).toBe(0);
    expect(tick.settings.renderScale).toBe(baseline.renderScale);
  });
});
