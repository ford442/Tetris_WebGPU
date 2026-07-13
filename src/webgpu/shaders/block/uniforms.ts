/**
 * Authoritative block fragment uniform layout.
 * WGSL struct + CPU byte offsets — keep in sync; tests assert binding size.
 */

/** WGSL FragmentUniforms struct (224 bytes with tail padding). */
export const BLOCK_FRAGMENT_UNIFORM_WGSL = `
struct FragmentUniforms {
    lightPosition : vec4f,      // 0-15
    eyePosition   : vec4f,      // 16-31
    time          : f32,        // 32
    useGlitch     : f32,        // 36
    lockPercent   : f32,        // 40
    level         : f32,        // 44
    metallic      : f32,        // 48
    roughness     : f32,        // 52
    transmission  : f32,        // 56
    ior           : f32,        // 60
    subsurface    : f32,        // 64
    clearcoat     : f32,        // 68
    anisotropic   : f32,        // 72
    dispersion    : f32,        // 76
    materialType  : u32,        // 80 (0=classic,6=lava,7=hologram)
    particleIntensity : f32,    // 84
    enablePBR     : f32,        // 88
    textureMix    : f32,        // 92
    movementFlash : f32,        // 96
    lineClearFlash: f32,        // 100
    magnetWorldX  : f32,        // 104
    magnetWorldY  : f32,        // 108
    magnetStrength: f32,        // 112
    particleMaterialType: u32,  // 116
    reserved2     : vec4f,      // 120-127
    padHeights    : vec4f,      // 128-143 (underwater flash timers at 128/132)
    columnHeights : array<f32, 10>, // 144
    bassLevel     : f32,        // 184
    midLevel      : f32,        // 188
    trebleLevel   : f32,        // 192
    padAudio      : f32,        // 196
    _structPad    : vec2f,      // 200 (WGSL pads struct to 224B minBindingSize)
};
`;

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
  particleMaterialType: 116,
  reserved2: 120,
  padHeights: 128,
  columnHeights: 144,
  bassLevel: 184,
  midLevel: 188,
  trebleLevel: 192,
  padAudio: 196,
} as const;

export const BLOCK_FRAGMENT_UNIFORM_SIZE = 224;
export const BLOCK_VERTEX_UNIFORM_SIZE = 208;
