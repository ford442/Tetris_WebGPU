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
