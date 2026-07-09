/**
 * Unified Post-Process Uniform Buffer System
 * 
 * This module ensures perfect alignment between JS and WGSL uniform buffers.
 * All structs are explicitly sized with padding comments for maintainability.
 * 
 * Buffer Layout (192 bytes total — WGSL vec3/vec4 alignment):
 * 0-15:   time, useGlitch, shockwaveCenter(xy), shockwaveTime
 * 16-31:  shockwaveParams(vec4)
 * 32-47:  level, warpSurge, enableFXAA, enableBloom, enableFilmGrain, enableCRT, padding(2)
 * 48-63:  screenResolution(xy), bloomIntensity, bloomThreshold
 * 64-79:  materialAwareBloom, padding(3)
 * 80-95:  aberrationPulse (hard drop)
 * 96-143: reserved (dangerLevel at 96, aberration at 100, levelUpFlash at 104/116, gameOverKaleidoTime at 120 for 2s board kaleidoscope)
 * 176:    neonBurst (hard-drop radial glow/distortion)
 */

// ============================================================================
// WGSL STRUCT DEFINITIONS (copy-paste ready)
// ============================================================================

export const PostProcessUniformsWGSL = `
// ============================================================================
// POST-PROCESS UNIFORMS - 192 bytes, 16-byte aligned
// ============================================================================
struct PostProcessUniforms {
    // Frame 0: Basic effects (offset 0)
    time: f32,              // 0
    useGlitch: f32,         // 4
    shockwaveCenter: vec2f, // 8
    shockwaveTime: f32,     // 16
    _pad0: f32,             // 20 (pad to 8-byte align shockwaveParams)
    
    // Frame 1: Shockwave params (offset 24, but aligned to 32)
    _pad1: f32,             // 24
    _pad2: f32,             // 28
    shockwaveParams: vec4f, // 32 - width, strength, aberration, speed
    
    // Frame 2: Feature toggles (offset 48)
    level: f32,             // 48
    warpSurge: f32,         // 52
    enableFXAA: f32,        // 56
    enableBloom: f32,       // 60
    
    // Frame 3: More toggles + bloom settings (offset 64)
    enableFilmGrain: f32,   // 64
    enableCRT: f32,         // 68
    bloomIntensity: f32,    // 72
    bloomThreshold: f32,    // 76
    
    // Frame 4: Material-aware bloom + screen (offset 80)
    materialAwareBloom: f32, // 80 - 1.0 = preserve textures, 0.0 = uniform bloom
    screenWidth: f32,       // 84
    screenHeight: f32,      // 88
    _pad3: f32,             // 92
    
    // Frame 5-9: Reserved (offset 96+)
    dangerLevel: f32,             // 96
    aberrationPulse: f32,         // 100
    hardDropBoost: f32,           // 104
    _padFlashAlign: f32,          // 108

    levelUpFlashColor: vec3f,     // 112
    levelUpFlashIntensity: f32,   // 124
    gameOverKaleidoTime: f32,     // 128
    _padBeforeLaser: f32,         // 132
    _padLaserAlign: vec2f,        // 136 (vec4 requires 16-byte alignment)
    lineClearLaserY: vec4f,       // 144
    lineClearLaserIntensity: f32, // 160
    blackHoleTime: f32,           // 164
    blackHoleCenter: vec2f,       // 168
    neonBurst: f32,               // 176 - hard-drop radial glow/distortion
    _padTail0: f32,               // 180
    _padTail1: f32,               // 184
    _padTail2: f32,               // 188
};
`;

// ============================================================================
// JS UNIFORM BUFFER MANAGER
// ============================================================================

export interface PostProcessUniformData {
  // Frame 0
  time: number;
  useGlitch: number;
  shockwaveCenter: [number, number];
  shockwaveTime: number;
  
  // Frame 1
  shockwaveParams: [number, number, number, number]; // width, strength, aberration, speed
  
  // Frame 2
  level: number;
  warpSurge: number;
  enableFXAA: number;
  enableBloom: number;
  
  // Frame 3
  enableFilmGrain: number;
  enableCRT: number;
  bloomIntensity: number;
  bloomThreshold: number;
  
  // Frame 4
  materialAwareBloom: number;
  screenResolution: [number, number];

  // Hard drop aberration pulse (new for enhanced post-process chromatic spike)
  aberrationPulse?: number;

  // Hard drop explicitly driven shockwave boost (as requested by Neon Bricklayer)
  hardDropBoost?: number;
  neonBurst?: number;

  // Board danger / fill level (0-1) for contracting red vignette on postProcess
  dangerLevel?: number;

  // Level-up color burn flash (additive fullscreen quad in final composite, 400ms fade, color = theme bg[0])
  levelUpFlashColor?: [number, number, number];
  levelUpFlashIntensity?: number;

  // Game over: 2s spinning 6-segment kaleidoscope mirror on captured final board state (post-process UV transform)
  gameOverKaleidoTime?: number;

  // Supernova line clear laser effect
  lineClearLaserY?: [number, number, number, number];
  lineClearLaserIntensity?: number;
  blackHoleTime?: number;
  blackHoleCenter?: [number, number];

  // Hard-drop neon burst radial glow (Neon Bricklayer)
  neonBurst?: number;
}

export class PostProcessUniformManager {
  // 192 bytes — matches WGSL PostProcessUniforms minBindingSize
  private data = new Float32Array(48); // 48 floats = 192 bytes
  
  // Default values
  defaults: PostProcessUniformData = {
    time: 0,
    useGlitch: 0,
    shockwaveCenter: [0.5, 0.5],
    shockwaveTime: 0,
    shockwaveParams: [0.15, 0.08, 0.03, 2.0],
    level: 1,
    warpSurge: 0,
    enableFXAA: 1,
    enableBloom: 1,
    enableFilmGrain: 1,
    enableCRT: 0,
    bloomIntensity: 0.8,
    bloomThreshold: 0.35,
    materialAwareBloom: 1.0, // Enable material-aware bloom by default
    screenResolution: [1920, 1080],
    aberrationPulse: 0,
    hardDropBoost: 0,
    neonBurst: 0,
    dangerLevel: 0,
    levelUpFlashColor: [0.2, 0.6, 1.0],
    levelUpFlashIntensity: 0,
    gameOverKaleidoTime: 0,
    lineClearLaserY: [0, 0, 0, 0],
    lineClearLaserIntensity: 0,
    blackHoleTime: 0,
    blackHoleCenter: [0.5, 0.5],
  };

  /**
   * Pack all uniforms into the Float32Array
   * Layout matches WGSL struct exactly
   */
  pack(values: Partial<PostProcessUniformData> = {}): Float32Array {
    const v = { ...this.defaults, ...values };
    
    // Frame 0 (offset 0, floats 0-3, but we need 5 with padding)
    this.data[0] = v.time;
    this.data[1] = v.useGlitch;
    this.data[2] = v.shockwaveCenter[0];
    this.data[3] = v.shockwaveCenter[1];
    this.data[4] = v.shockwaveTime;
    this.data[5] = 0; // _pad0
    
    // Frame 1 (offset 24, but align to 32 = floats 8-11)
    this.data[6] = 0; // _pad1
    this.data[7] = 0; // _pad2
    this.data[8] = v.shockwaveParams[0];  // width
    this.data[9] = v.shockwaveParams[1];  // strength
    this.data[10] = v.shockwaveParams[2]; // aberration
    this.data[11] = v.shockwaveParams[3]; // speed
    
    // Frame 2 (offset 48 = floats 12-15)
    this.data[12] = v.level;
    this.data[13] = v.warpSurge;
    this.data[14] = v.enableFXAA;
    this.data[15] = v.enableBloom;
    
    // Frame 3 (offset 64 = floats 16-19)
    this.data[16] = v.enableFilmGrain;
    this.data[17] = v.enableCRT;
    this.data[18] = v.bloomIntensity;
    this.data[19] = v.bloomThreshold;
    
    // Frame 4 (offset 80 = floats 20-23)
    this.data[20] = v.materialAwareBloom;
    this.data[21] = v.screenResolution[0];
    this.data[22] = v.screenResolution[1];
    this.data[23] = 0; // _pad3
    
    // dangerLevel @ 96 (float 24), aberration @ 100 (float 25)
    this.data[24] = (v as any).dangerLevel || 0;
    this.data[25] = (v as any).aberrationPulse || 0;
    this.data[26] = (v as any).hardDropBoost || 0; // hardDropBoost @ 104
    this.data[27] = 0; // removed duplicate neonBurst @ 108
    const flashCol = (v as any).levelUpFlashColor || [0, 0, 0];
    this.data[28] = flashCol[0] || 0; // levelUpFlashColor @ 112
    this.data[29] = flashCol[1] || 0;
    this.data[30] = flashCol[2] || 0;
    this.data[31] = (v as any).levelUpFlashIntensity || 0; // @ 124
    this.data[32] = (v as any).gameOverKaleidoTime || 0; // @ 128
    this.data[33] = 0; // _padBeforeLaser @ 132
    this.data[34] = 0; // _padLaserAlign.x @ 136
    this.data[35] = 0; // _padLaserAlign.y @ 140

    const laserY = (v as any).lineClearLaserY || [0, 0, 0, 0];
    this.data[36] = laserY[0]; // lineClearLaserY @ 144
    this.data[37] = laserY[1];
    this.data[38] = laserY[2];
    this.data[39] = laserY[3];
    this.data[40] = (v as any).lineClearLaserIntensity || 0; // @ 160
    this.data[41] = (v as any).blackHoleTime || 0; // @ 164
    const bhCenter = (v as any).blackHoleCenter || [0.5, 0.5];
    this.data[42] = bhCenter[0]; // blackHoleCenter @ 168
    this.data[43] = bhCenter[1];
    this.data[44] = v.neonBurst ?? 0; // neonBurst @ 176
    // floats 45-47: WGSL struct tail padding (192B)

    return this.data;
  }

  /**
   * Get individual field offsets for partial updates
   */
  static getOffsets() {
    return {
      time: 0,
      useGlitch: 4,
      shockwaveCenter: 8,
      shockwaveTime: 16,
      shockwaveParams: 32,
      level: 48,
      warpSurge: 52,
      enableFXAA: 56,
      enableBloom: 60,
      enableFilmGrain: 64,
      enableCRT: 68,
      bloomIntensity: 72,
      bloomThreshold: 76,
      materialAwareBloom: 80,
      screenResolution: 84,
    };
  }

  /**
   * Create a minimal uniform set for basic post-process
   */
  createBasicUniforms(params: {
    time: number;
    useGlitch: number;
    shockwaveCenter: [number, number];
    shockwaveTime: number;
    shockwaveParams: [number, number, number, number];
    level: number;
    warpSurge: number;
  }): Float32Array {
    return this.pack({
      ...params,
      enableFXAA: 0,
      enableBloom: 0,
      enableFilmGrain: 0,
      enableCRT: 0,
      materialAwareBloom: 0,
    });
  }

  /**
   * Create full premium uniform set
   */
  createPremiumUniforms(params: Partial<PostProcessUniformData> = {}): Float32Array {
    return this.pack({
      enableFXAA: 1,
      enableBloom: 1,
      enableFilmGrain: 1,
      enableCRT: 0,
      bloomIntensity: 0.8,
      bloomThreshold: 0.35,
      materialAwareBloom: 1.0,
      ...params,
    });
  }
}

// Singleton instance
export const postProcessUniforms = new PostProcessUniformManager();
export default postProcessUniforms;
