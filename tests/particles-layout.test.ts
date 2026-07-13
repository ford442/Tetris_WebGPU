import { describe, expect, it } from 'vitest';
import {
  PARTICLE_BUDGET,
  PARTICLE_LAYOUT,
  PARTICLE_STRIDE_BYTES,
  PARTICLE_STRIDE_FLOATS,
  particleBudgetForQuality,
} from '../src/webgpu/particles/layout.js';

describe('particle layout', () => {
  it('matches 64-byte GPU struct stride', () => {
    expect(PARTICLE_STRIDE_FLOATS * 4).toBe(PARTICLE_STRIDE_BYTES);
    expect(PARTICLE_LAYOUT.MAX_LIFE).toBeLessThan(PARTICLE_STRIDE_FLOATS);
  });

  it('maps quality presets to monotonic budgets', () => {
    expect(PARTICLE_BUDGET.low).toBeLessThan(PARTICLE_BUDGET.medium);
    expect(PARTICLE_BUDGET.medium).toBeLessThan(PARTICLE_BUDGET.high);
    expect(PARTICLE_BUDGET.high).toBeLessThanOrEqual(PARTICLE_BUDGET.ultra);
  });

  it('resolves settings quality to a budget', () => {
    expect(particleBudgetForQuality('low')).toBe(800);
    expect(particleBudgetForQuality('ultra')).toBe(5000);
    expect(particleBudgetForQuality('custom')).toBe(PARTICLE_BUDGET.medium);
  });
});
