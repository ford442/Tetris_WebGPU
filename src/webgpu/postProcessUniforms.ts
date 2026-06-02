/**
 * Unified Post-Process Uniform Buffer System
 * 
 * This module ensures perfect alignment between JS and WGSL uniform buffers.
 * All structs are explicitly sized with padding comments for maintainability.
 * 
 * Buffer Layout (144 bytes total):
 * 0-15:   time, useGlitch, shockwaveCenter(xy), shockwaveTime
 * 16-31:  shockwaveParams(vec4)
 * 32-47:  level, warpSurge, enableFXAA, enableBloom, enableFilmGrain, enableCRT, padding(2)
 * 48-63:  screenResolution(xy), bloomIntensity, bloomThreshold
 * 64-79:  materialAwareBloom, padding(3)
 * 80-95:  aberrationPulse (hard drop)
 * 96-143: reserved (dangerLevel at 96, aberration at 100, levelUpFlash at 104/116, gameOverKaleidoTime at 120 for 2s board kaleidoscope)
 */

// ============================================================================
// WGSL STRUCT DEFINITIONS (copy-paste ready)
// ============================================================================

export const PostProcessUniformsWGSL = `
// ============================================================================
// POST-PROCESS UNIFORMS - 144 bytes, 16-byte aligned
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
    
    // Frame 5-9: Reserved (offset 96-160)
    dangerLevel: f32,       // 96  (board height fill ratio 0-1, contracts vignette inner radius as stack rises)
    aberrationPulse: f32,   // 100 (short-lived hard-drop chromatic aberration spike, 300ms exp decay)
    levelUpFlashColor: vec3f,   // 104 (r,g,b from theme.backgroundColors[0] for level-up additive burn)
    levelUpFlashIntensity: f32, // 116 (high opacity -> 0 over exactly 400ms)
    gameOverKaleidoTime: f32,   // 120 (2s spinning 6-triangle kaleidoscope mirror on final board state + fade; post-process UV)
    _pad4: f32,                 // 124 (pad to 16-byte boundary for vec4f)
    lineClearLaserY: vec4f,     // 128 (up to 4 y-coordinates for line clear laser beams)
    lineClearLaserIntensity: f32, // 144
    // Struct size is automatically padded to 160 by WGSL (multiple of 16)
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
}

export class PostProcessUniformManager {
  // 160 bytes = 10 vec4s (with padding)
  private data = new Float32Array(40); // 40 floats = 160 bytes
  
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
    dangerLevel: 0,
    levelUpFlashColor: [0.2, 0.6, 1.0],
    levelUpFlashIntensity: 0,
    gameOverKaleidoTime: 0,
    lineClearLaserY: [0, 0, 0, 0],
    lineClearLaserIntensity: 0,
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
    
    // dangerLevel at 96 (float 24), aberration at 100 (float 25)
    this.data[24] = (v as any).dangerLevel || 0;     // u_dangerLevel for board-fill vignette
    this.data[25] = (v as any).aberrationPulse || 0;
    // levelUpFlash at 104 (floats 26-28 color, 29 intensity) - 400ms additive color burn from theme bg[0]
    const flashCol = (v as any).levelUpFlashColor || [0, 0, 0];
    this.data[26] = flashCol[0] || 0;
    this.data[27] = flashCol[1] || 0;
    this.data[28] = flashCol[2] || 0;
    this.data[29] = (v as any).levelUpFlashIntensity || 0;
    // gameOverKaleidoTime at 120 (float 30) - 2s board kaleidoscope spin + fade in post-process
    this.data[30] = (v as any).gameOverKaleidoTime || 0;
    
    this.data[31] = 0; // _pad4 at 124

    const laserY = (v as any).lineClearLaserY || [0, 0, 0, 0];
    this.data[32] = laserY[0]; // offset 128
    this.data[33] = laserY[1];
    this.data[34] = laserY[2];
    this.data[35] = laserY[3];
    this.data[36] = (v as any).lineClearLaserIntensity || 0; // offset 144
    this.data[37] = 0;
    this.data[38] = 0;
    this.data[39] = 0;

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
