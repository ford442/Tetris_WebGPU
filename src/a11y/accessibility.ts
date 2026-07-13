/**
 * Reduced motion + system preference helpers.
 */

import type { GameSettings } from '../config/gameSettings.js';

export type ReducedMotionPref = 'auto' | 'on' | 'off';

export function systemPrefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function isReducedMotionActive(
  settings: Pick<GameSettings, 'reducedMotion'>,
): boolean {
  if (settings.reducedMotion === 'on') return true;
  if (settings.reducedMotion === 'off') return false;
  return systemPrefersReducedMotion();
}

/** Strip vestibular / flash-heavy toggles when reduced motion is active. */
export function motionSafeSettings(settings: GameSettings): GameSettings {
  if (!isReducedMotionActive(settings)) return settings;
  return {
    ...settings,
    shockwave: false,
    particles: false,
    glitch: false,
    filmGrain: false,
    crt: false,
    ghostDropTrail: false,
    bloom: settings.bloom && settings.quality === 'low' ? false : settings.bloom,
  };
}

export function applyReducedMotionDocumentClass(active: boolean): void {
  document.documentElement.classList.toggle('reduced-motion', active);
}

export function watchReducedMotion(
  settings: GameSettings,
  onChange: (active: boolean) => void,
): () => void {
  if (typeof window === 'undefined' || !window.matchMedia) return () => {};
  const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
  const handler = () => {
    if (settings.reducedMotion === 'auto') {
      onChange(mq.matches);
    }
  };
  mq.addEventListener('change', handler);
  return () => mq.removeEventListener('change', handler);
}
