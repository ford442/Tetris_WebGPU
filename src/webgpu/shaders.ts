/**
 * WebGPU Shader Modules
 * Barrel re-export — shader code lives in ./shaders/ split by category.
 */

export {
  PostProcessShaders,
  EnhancedPostProcessShaders,
  MaterialAwarePostProcessShaders,
  createBlockShaders,
  PBRBlockShaders,
  createBlockBindGroupEntries,
  BLOCK_PIPELINE_BINDINGS,
  assertBlockShaderBindings,
  ParticleShaders,
} from './shaders/index.js';

export {
  GridShader,
  BackgroundShaders,
  VideoBackgroundShaders,
  Shaders,
  FrostedGlassShaders,
} from './shaders/index.js';

// Re-export texture sampling utilities for external use
export {
  getTextureSamplingWGSL,
  getSimpleTextureSamplingWGSL,
  getTextureSamplingDefines,
} from './textureSampling.js';
