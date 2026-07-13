import { BOARD_WORLD_CENTER_X } from '../webgpu/renderMetrics.js';

/** World-space X offset so two boards sit side-by-side around the origin. */
export const SPLIT_BOARD_OFFSETS = {
  left: -BOARD_WORLD_CENTER_X - 14,
  right: BOARD_WORLD_CENTER_X + 14,
} as const;

/** Particle budget per board when split (keeps medium preset playable). */
export const SPLIT_PARTICLE_CAP = 800;
