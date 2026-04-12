/**
 * Audio configuration
 * Centralized constants for sound and music
 */

// Volume levels (0-1)
export const VOLUME_CONFIG = {
  /** Master volume */
  MASTER: 1.0,
  /** Music volume */
  MUSIC: 0.3,
  /** Sound effects volume */
  SFX: 0.5,
} as const;

// Music settings
export const MUSIC_CONFIG = {
  /** Whether to use procedural music fallback */
  USE_PROCEDURAL_FALLBACK: true,
  /** Whether music should loop */
  LOOP: true,
  /** Crossfade duration in seconds */
  CROSSFADE_DURATION: 2.0,
} as const;

// Sound effect categories
export const SFX_CATEGORIES = {
  /** Movement sounds (left/right/down) */
  MOVEMENT: 'movement',
  /** Rotation sounds */
  ROTATION: 'rotation',
  /** Lock/hard drop sounds */
  IMPACT: 'impact',
  /** Line clear sounds */
  CLEAR: 'clear',
  /** UI/Menu sounds */
  UI: 'ui',
} as const;

// Procedural music settings
export const PROCEDURAL_MUSIC_CONFIG = {
  /** Base tempo (BPM) */
  TEMPO: 128,
  /** Number of simultaneous tracks */
  TRACKS: 4,
} as const;

// Default exports
export default {
  VOLUME: VOLUME_CONFIG,
  MUSIC: MUSIC_CONFIG,
  SFX: SFX_CATEGORIES,
  PROCEDURAL: PROCEDURAL_MUSIC_CONFIG,
};
