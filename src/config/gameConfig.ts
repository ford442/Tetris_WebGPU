/**
 * Game mechanics configuration
 * Centralized constants for game rules, timing, and mechanics
 */

// Input timing (milliseconds)
export const INPUT_CONFIG = {
  /** Delayed Auto Shift - initial delay before auto-repeat */
  DAS: 120,
  /** Auto Repeat Rate - speed of repeated movement */
  ARR: 10,
  /** Soft drop speed (sonic drop) */
  SOFT_DROP_SPEED: 1,
  /** Input buffer window for movement (ms) */
  MOVE_BUFFER_WINDOW: 80,
  /** Input buffer window for rotation (ms) - tighter to prevent double-rotations */
  ROTATE_BUFFER_WINDOW: 60,
} as const;

// Lock delay mechanics (milliseconds)
export const LOCK_DELAY_CONFIG = {
  /** Standard lock delay time */
  LOCK_DELAY_MS: 500,
  /** Maximum number of lock delay resets (Infinity-like behavior) */
  MAX_LOCK_RESETS: 25,
} as const;

// Playfield dimensions
export const PLAYFIELD_CONFIG = {
  WIDTH: 10,
  HEIGHT: 20,
  VISIBLE_HEIGHT: 20,
} as const;

// Scoring and leveling
export const SCORING_CONFIG = {
  /** Base points for single line clear */
  SINGLE_LINE_BASE: 100,
  /** Points multiplier for level */
  LEVEL_MULTIPLIER: 1,
  /** Lines needed to advance level */
  LINES_PER_LEVEL: 10,
} as const;

// Ghost piece
export const GHOST_CONFIG = {
  /** Ghost piece alpha transparency */
  ALPHA: 0.3,
  /** Whether to show ghost piece */
  ENABLED: true,
} as const;

// Default exports for convenience
export default {
  INPUT: INPUT_CONFIG,
  LOCK_DELAY: LOCK_DELAY_CONFIG,
  PLAYFIELD: PLAYFIELD_CONFIG,
  SCORING: SCORING_CONFIG,
  GHOST: GHOST_CONFIG,
};
