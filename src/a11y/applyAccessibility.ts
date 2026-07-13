/**
 * Apply accessibility settings to view + document.
 */

import type { IView } from '../view/IView.js';
import type { GameSettings } from '../config/gameSettings.js';
import {
  buildThemeColors,
  type ThemeColors,
} from '../webgpu/themes.js';
import {
  applyReducedMotionDocumentClass,
  isReducedMotionActive,
  motionSafeSettings,
} from './accessibility.js';
import type { ColorPaletteId } from './colorPalettes.js';

type A11yView = IView & {
  visualEffects?: { reducedMotion: boolean };
  currentTheme?: ThemeColors;
  themes?: { imageSampled: ThemeColors };
  setTheme?(name: 'imageSampled'): void;
};

export function applyAccessibilitySettings(view: A11yView, settings: GameSettings): GameSettings {
  const reduced = isReducedMotionActive(settings);
  applyReducedMotionDocumentClass(reduced);

  document.documentElement.classList.toggle(
    'a11y-high-contrast',
    settings.colorPalette === 'highContrast',
  );

  if (view.visualEffects) {
    view.visualEffects.reducedMotion = reduced;
    if (reduced) {
      view.visualEffects.shakeIntensity = 0;
      view.visualEffects.shockwaveTimer = 0;
      view.visualEffects.flashTimer = 0;
      view.visualEffects.gameOverKaleidoTimer = 0;
      view.visualEffects.hardDropAberrationPulse = 0;
      view.visualEffects.lineClearLaserIntensity = 0;
    }
  }

  applyColorPalette(view, settings.colorPalette);

  return motionSafeSettings(settings);
}

export function applyColorPalette(view: A11yView, paletteId: ColorPaletteId): void {
  const merged = buildThemeColors(paletteId);
  if (view.themes) {
    view.themes.imageSampled = merged;
  }
  if (view.currentTheme) {
    for (let i = 0; i <= 8; i++) {
      if (merged[i]) view.currentTheme[i] = merged[i];
    }
    view.currentTheme.paletteId = paletteId;
    view.currentTheme.border = merged.border;
  }
}
