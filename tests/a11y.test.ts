import { describe, expect, it } from 'vitest';
import {
  PIECE_PALETTES,
  paletteMinPairwiseDistance,
} from '../src/a11y/colorPalettes.js';
import {
  isReducedMotionActive,
  motionSafeSettings,
} from '../src/a11y/accessibility.js';
import { createDefaultSettings } from '../src/config/gameSettings.js';

describe('color palettes', () => {
  it('distinguishes all 7 piece colors in accessibility palettes', () => {
    for (const id of ['deuteranopia', 'protanopia', 'highContrast'] as const) {
      const minDist = paletteMinPairwiseDistance(PIECE_PALETTES[id]);
      expect(minDist).toBeGreaterThan(0.15);
    }
  });
});

describe('reduced motion', () => {
  it('forces safe settings when reduced motion is on', () => {
    const base = createDefaultSettings();
    const safe = motionSafeSettings({ ...base, reducedMotion: 'on' });
    expect(safe.shockwave).toBe(false);
    expect(safe.particles).toBe(false);
    expect(safe.glitch).toBe(false);
    expect(safe.ghostDropTrail).toBe(false);
  });

  it('respects explicit off override', () => {
    const base = createDefaultSettings();
    expect(isReducedMotionActive({ ...base, reducedMotion: 'off' })).toBe(false);
    expect(isReducedMotionActive({ ...base, reducedMotion: 'on' })).toBe(true);
  });
});
