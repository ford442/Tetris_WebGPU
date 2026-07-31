/**
 * GPU particle storage layout — must match WGSL `Particle` in compute.ts / particle shaders.
 *
 * ```
 * struct Particle {          // 64 bytes / particle
 *   pos      : vec3<f32>,     // 0..11  (offset 0, align 16)
 *   velocity : vec3<f32>,     // 16..27 (offset 16)
 *   color    : vec4<f32>,     // 32..47 (offset 32)
 *   scale    : f32,           // 48
 *   life     : f32,           // 52
 *   maxLife  : f32,           // 56
 *   _pad     : f32,           // 60
 * };
 * ```
 */

import type { SettingsQuality } from '../../config/gameSettings.js';
import type { QualityPreset } from '../../config/renderConfig.js';

/** Floats per particle in staging uploads (matches GPU struct). */
export const PARTICLE_STRIDE_FLOATS = 16;

/** Bytes per particle in storage buffer. */
export const PARTICLE_STRIDE_BYTES = 64;

/** Max emissions queued per frame before dropping. */
export const MAX_EMITS_PER_FRAME = 1000;

/** Hard caps per quality preset (gameplay juice pool). */
export const PARTICLE_BUDGET: Record<QualityPreset, number> = {
  low: 800,
  medium: 2000,
  high: 4000,
  ultra: 5000,
};

export function particleBudgetForQuality(quality: SettingsQuality): number {
  let budget = PARTICLE_BUDGET.medium;
  if (quality === 'custom') {
    budget = PARTICLE_BUDGET.medium;
  } else if (quality in PARTICLE_BUDGET) {
    budget = PARTICLE_BUDGET[quality as QualityPreset];
  }
  return Math.min(budget, 5000);
}

/** CPU staging row layout (float index within one particle). */
export const PARTICLE_LAYOUT = {
  POS_X: 0,
  POS_Y: 1,
  POS_Z: 2,
  VEL_X: 4,
  VEL_Y: 5,
  VEL_Z: 6,
  COLOR_R: 8,
  COLOR_G: 9,
  COLOR_B: 10,
  COLOR_A: 11,
  SCALE: 12,
  LIFE: 13,
  MAX_LIFE: 14,
} as const;
