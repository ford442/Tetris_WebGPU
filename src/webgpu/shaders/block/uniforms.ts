/**
 * Authoritative block fragment uniform layout.
 * WGSL struct + CPU byte offsets — keep in sync; tests assert binding size.
 * WGSL struct source of truth: ../wgsl/block/uniforms.wgsl (loaded raw).
 */
import wgsl from '../wgsl/block/uniforms.wgsl?raw';

/** WGSL FragmentUniforms struct (224 bytes with tail padding). */
export const BLOCK_FRAGMENT_UNIFORM_WGSL = wgsl;

/** CPU writeBuffer offsets — must match BLOCK_FRAGMENT_UNIFORM_WGSL comments. */
export const BLOCK_FRAGMENT_UNIFORM_OFFSETS = {
  lightPosition: 0,
  eyePosition: 16,
  time: 32,
  useGlitch: 36,
  lockPercent: 40,
  level: 44,
  metallic: 48,
  roughness: 52,
  transmission: 56,
  ior: 60,
  subsurface: 64,
  clearcoat: 68,
  anisotropic: 72,
  dispersion: 76,
  materialType: 80,
  particleIntensity: 84,
  enablePBR: 88,
  textureMix: 92,
  movementFlash: 96,
  lineClearFlash: 100,
  magnetWorldX: 104,
  magnetWorldY: 108,
  magnetStrength: 112,
  _pad116: 116,
  reserved2: 120,
  padHeights: 128,
  columnHeights: 144,
  bassLevel: 184,
  midLevel: 188,
  trebleLevel: 192,
  comboEnergy: 196,
  iblEnable: 200,
} as const;

export const BLOCK_FRAGMENT_UNIFORM_SIZE = 224;
export const BLOCK_VERTEX_UNIFORM_SIZE = 208;
