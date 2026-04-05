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
 * 80-143: reserved for future expansion
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
    
    // Frame 5-8: Reserved (offset 96-144)
    reserved: vec4f,        // 96
    reserved2: vec4f,       // 112
    reserved3: vec2f,       // 128
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
}

export class PostProcessUniformManager {
  // 144 bytes = 9 vec4s (with padding)
  private data = new Float32Array(36); // 36 floats = 144 bytes
  
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
    
    // Reserved (offset 96 = floats 24-35)
    for (let i = 24; i < 36; i++) {
      this.data[i] = 0;
    }
    
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
