/**
 * Rendering configuration
 * Centralized constants for WebGPU rendering, shaders, and visual effects
 */

// Camera settings
export const CAMERA_CONFIG = {
  /** Default camera Z position */
  DEFAULT_Z: 75.0,
  /** Field of view in degrees */
  FOV_DEGREES: 42,
  /** Near clip plane */
  NEAR_PLANE: 1,
  /** Far clip plane */
  FAR_PLANE: 150,
} as const;

// Render scale / supersampling
export const RENDER_SCALE_CONFIG = {
  /** Default render scale (1.0 = native) */
  DEFAULT: 1.0,
  /** Minimum render scale */
  MIN: 0.5,
  /** Maximum render scale */
  MAX: 2.0,
  /** Premium preset render scale */
  PREMIUM: 1.5,
} as const;

// Block rendering
export const BLOCK_CONFIG = {
  /** World size of a single block */
  WORLD_SIZE: 2.2,
  /** Half world size for calculations */
  get HALF_WORLD_SIZE() { return this.WORLD_SIZE / 2; },
} as const;

// Board dimensions
export const BOARD_CONFIG = {
  COLUMNS: 10,
  ROWS: 20,
  BORDER_WIDTH: 4,
} as const;

// Texture settings
export const TEXTURE_CONFIG = {
  /** Default atlas columns */
  ATLAS_COLUMNS: 4,
  /** Default atlas rows */
  ATLAS_ROWS: 3,
  /** Default tile column (0-indexed) */
  ATLAS_TILE_COLUMN: 1,
  /** Default tile row (0-indexed) */
  ATLAS_TILE_ROW: 1,
  /** Inset to avoid atlas bleeding */
  ATLAS_TILE_INSET: 0.03,
} as const;

// Visual effects
export const EFFECTS_CONFIG = {
  /** Bloom default intensity */
  BLOOM_INTENSITY: 1.0,
  /** Bloom threshold */
  BLOOM_THRESHOLD: 0.35,
  /** Film grain default amount */
  FILM_GRAIN: 0.03,
  /** Vignette strength */
  VIGNETTE: 0.4,
  /** Chromatic aberration base amount */
  CHROMATIC_ABERRATION: 0.06,
} as const;

// Particle system
export const PARTICLES_CONFIG = {
  /** Maximum number of particles */
  MAX_PARTICLES: 1000,
  /** Particle size multiplier */
  SIZE_MULTIPLIER: 1.0,
} as const;

// WebGPU uniform buffer sizes (must match WGSL struct layout / minBindingSize)
export const UNIFORM_BUFFER_SIZES = {
  /** PostProcessUniforms — vec3/vec4 alignment pads struct to 192B */
  POST_PROCESS: 192,
  /** shockwaveParamsUniform vec4 — hard-drop boost (binding 4) */
  SHOCKWAVE_PARAMS: 16,
  /** PBR FragmentUniforms — array tail padding to 224B */
  FRAGMENT: 224,
  /** PBR VertexUniforms — 3×mat4 + vec4 = 208B */
  VERTEX_BLOCK: 208,
} as const;

// Default exports
export default {
  CAMERA: CAMERA_CONFIG,
  RENDER_SCALE: RENDER_SCALE_CONFIG,
  BLOCK: BLOCK_CONFIG,
  BOARD: BOARD_CONFIG,
  TEXTURE: TEXTURE_CONFIG,
  EFFECTS: EFFECTS_CONFIG,
  PARTICLES: PARTICLES_CONFIG,
};
