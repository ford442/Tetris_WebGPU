/**
 * WebGPU Shader Modules
 * Barrel re-export — shader code lives in ./shaders/ split by category.
 */

export { 
  PostProcessShaders, 
  EnhancedPostProcessShaders, 
  MaterialAwarePostProcessShaders,
  PBRBlockShaders,
  UnderwaterBlockShaders,
  ParticleShaders 
} from './shaders/index.js';

export {
  GridShader, 
  BackgroundShaders, 
  Shaders,
  PremiumBlockShaders,
  FrostedGlassShaders
} from './shaders/index.js';

// Re-export texture sampling utilities for external use
export {
  getTextureSamplingWGSL,
  getSimpleTextureSamplingWGSL,
  getTextureSamplingDefines,
} from './textureSampling.js';
