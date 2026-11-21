import { describe, expect, it } from 'vitest';
import {
  DEFAULT_GOVERNOR_CONFIG,
  GOVERNOR_FACTORS,
  MAX_BACKING_DPR,
  PIXEL_BUDGET,
  createResolutionGovernor,
  governorFactor,
  maxBackingDimension,
  resolveBackingSize,
  tickResolutionGovernor,
} from '../src/webgpu/renderResolution.js';

const base = { devicePixelRatio: 1, renderScale: 1, quality: 'ultra' as const };

describe('resolveBackingSize — screens that fit are untouched', () => {
  it('matches css * dpr * renderScale for a typical desktop', () => {
    const s = resolveBackingSize({ ...base, cssWidth: 1920, cssHeight: 1080, devicePixelRatio: 1.25, renderScale: 1.5 });
    expect(s.cap).toBe('none');
    expect(s.width).toBe(Math.floor(1920 * 1.25 * 1.5));
    expect(s.height).toBe(Math.floor(1080 * 1.25 * 1.5));
  });

  it('allows a native 4K frame on ultra', () => {
    const s = resolveBackingSize({ ...base, cssWidth: 3840, cssHeight: 2160 });
    expect(s).toMatchObject({ width: 3840, height: 2160, cap: 'none' });
  });
});

describe('resolveBackingSize — caps', () => {
  it('clamps DPR to the ceiling', () => {
    const s = resolveBackingSize({ ...base, cssWidth: 400, cssHeight: 800, devicePixelRatio: 3 });
    expect(s.width).toBe(400 * MAX_BACKING_DPR);
    expect(s.cap).toBe('dpr');
  });

  it('holds a 4K DPR-2 screen with 1.5x supersampling to the pixel budget (was ~19 MP)', () => {
    const s = resolveBackingSize({ ...base, cssWidth: 1920, cssHeight: 1080, devicePixelRatio: 2, renderScale: 1.5 });
    expect(s.cap).toBe('pixel-budget');
    expect(s.width * s.height).toBeLessThanOrEqual(PIXEL_BUDGET.ultra);
    expect(s.width * s.height).toBeGreaterThan(PIXEL_BUDGET.ultra * 0.99);
    // Aspect ratio preserved.
    expect(s.width / s.height).toBeCloseTo(1920 / 1080, 2);
  });

  it('uses a smaller budget on lower quality tiers', () => {
    const args = { ...base, cssWidth: 2560, cssHeight: 1440, devicePixelRatio: 1 };
    const low = resolveBackingSize({ ...args, quality: 'low' });
    const ultra = resolveBackingSize({ ...args, quality: 'ultra' });
    expect(low.width * low.height).toBeLessThanOrEqual(PIXEL_BUDGET.low);
    expect(low.width * low.height).toBeLessThan(ultra.width * ultra.height);
  });

  it('never exceeds the device texture limit, even under budget', () => {
    const s = resolveBackingSize({ ...base, cssWidth: 7000, cssHeight: 300, maxTextureDimension: 4096 });
    expect(s.cap).toBe('texture-limit');
    expect(Math.max(s.width, s.height)).toBeLessThanOrEqual(4096);
  });

  it('scales by the governor factor', () => {
    const full = resolveBackingSize({ ...base, cssWidth: 1600, cssHeight: 900 });
    const half = resolveBackingSize({ ...base, cssWidth: 1600, cssHeight: 900, factor: 0.5 });
    expect(half.width).toBe(Math.floor(full.width * 0.5));
  });

  it('survives junk input', () => {
    const s = resolveBackingSize({ ...base, cssWidth: 0, cssHeight: -5, devicePixelRatio: Number.NaN, renderScale: 0 });
    expect(s.width).toBeGreaterThanOrEqual(1);
    expect(s.height).toBeGreaterThanOrEqual(1);
  });
});

describe('maxBackingDimension', () => {
  it('stays within the default 8192 on common screens', () => {
    expect(maxBackingDimension(1920, 1080, 1)).toBeLessThanOrEqual(8192);
    expect(maxBackingDimension(1920, 1080, 2)).toBeLessThanOrEqual(8192);
    expect(maxBackingDimension(3840, 2160, 1)).toBeLessThanOrEqual(8192);
  });

  it('is bounded by the pixel budget, so even a 32:9 DPR-2 panel fits 8192', () => {
    expect(maxBackingDimension(5120, 1440, 2)).toBeLessThan(8192);
    expect(maxBackingDimension(7680, 4320, 2)).toBeLessThan(8192);
  });

  it('exceeds 8192 only for an extreme aspect ratio', () => {
    expect(maxBackingDimension(12000, 1000, 1)).toBeGreaterThan(8192);
  });
});

describe('resolution governor', () => {
  const over = { emaMs: 25, budgetMs: 16.67, enabled: true, backingPixels: 8_000_000 };
  const under = { emaMs: 8, budgetMs: 16.67, enabled: true, backingPixels: 8_000_000 };

  function run(state: ReturnType<typeof createResolutionGovernor>, tick: typeof over, frames: number): number {
    let changes = 0;
    for (let i = 0; i < frames; i++) if (tickResolutionGovernor(state, tick)) changes++;
    return changes;
  }

  it('steps down only after sustained over-budget frames', () => {
    const g = createResolutionGovernor();
    expect(run(g, over, DEFAULT_GOVERNOR_CONFIG.downFrames - 1)).toBe(0);
    expect(governorFactor(g)).toBe(1);
    expect(tickResolutionGovernor(g, over)).toBe(true);
    expect(governorFactor(g)).toBe(GOVERNOR_FACTORS[1]);
  });

  it('bottoms out at the last level', () => {
    const g = createResolutionGovernor();
    run(g, over, DEFAULT_GOVERNOR_CONFIG.downFrames * 20);
    expect(governorFactor(g)).toBe(GOVERNOR_FACTORS[GOVERNOR_FACTORS.length - 1]);
  });

  it('recovers slowly once comfortably under budget', () => {
    const g = createResolutionGovernor();
    run(g, over, DEFAULT_GOVERNOR_CONFIG.downFrames);
    expect(g.level).toBe(1);
    expect(run(g, under, DEFAULT_GOVERNOR_CONFIG.upFrames - 1)).toBe(0);
    expect(tickResolutionGovernor(g, under)).toBe(true);
    expect(g.level).toBe(0);
  });

  it('does not govern a small backing store', () => {
    const g = createResolutionGovernor();
    expect(run(g, { ...over, backingPixels: 1_000_000 }, DEFAULT_GOVERNOR_CONFIG.downFrames * 3)).toBe(0);
    expect(g.level).toBe(0);
  });

  it('releases when adaptive quality is disabled or locked', () => {
    const g = createResolutionGovernor();
    run(g, over, DEFAULT_GOVERNOR_CONFIG.downFrames * 2);
    expect(g.level).toBeGreaterThan(0);
    expect(tickResolutionGovernor(g, { ...over, enabled: false })).toBe(true);
    expect(g.level).toBe(0);
    expect(tickResolutionGovernor(g, { ...over, enabled: false })).toBe(false);
  });

  it('ignores frames with no measurement yet', () => {
    const g = createResolutionGovernor();
    expect(run(g, { ...over, emaMs: 0 }, 1000)).toBe(0);
  });

  it('dead zone between the ratios changes nothing', () => {
    const g = createResolutionGovernor();
    run(g, over, DEFAULT_GOVERNOR_CONFIG.downFrames);
    expect(run(g, { ...over, emaMs: 16.67 }, 2000)).toBe(0);
    expect(g.level).toBe(1);
  });
});
