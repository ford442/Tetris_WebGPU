import { describe, expect, it } from 'vitest';
import { CubeData } from '../src/webgpu/geometry.js';
import { BackgroundShaders } from '../src/webgpu/shaders/background.js';
import { PostProcessShaders } from '../src/webgpu/shaders/postProcess.js';
import { EnhancedPostProcessShaders } from '../src/webgpu/shaders/enhancedPostProcess.js';
import { MaterialAwarePostProcessShaders } from '../src/webgpu/shaders/materialAwarePostProcess.js';
import { createBlockShaders as PBRBlockShaders } from '../src/webgpu/shaders/block/blockShader.js';
import { CompositeShader } from '../src/webgpu/bloomShaders.js';
import { DebugTextureShaders } from '../src/webgpu/debug_shaders.js';

describe('shader optimization updates', () => {
  it('uses squared distance for background orbital light falloff', () => {
    const { fragment } = BackgroundShaders();
    expect(fragment).toContain('let lightDiff = uv - lightPos;');
    expect(fragment).toContain('let distSq = dot(lightDiff, lightDiff);');
    expect(fragment).toContain('let intensity = 0.12 / (distSq + 0.015);');
  });

  it('uses squared center distance in post-process chromatic aberration path', () => {
    const { fragment } = PostProcessShaders();
    expect(fragment).toContain('let distFromCenterSq = dot(centeredFromCenter, centeredFromCenter);');
    expect(fragment).not.toContain('distance(uv, vec2<f32>(0.5))');
  });

  it('uses squared center distance in enhanced post-process chromatic aberration path', () => {
    const { fragment } = EnhancedPostProcessShaders();
    expect(fragment).toContain('let distFromCenterSq = dot(centeredFromCenter, centeredFromCenter);');
    expect(fragment).not.toContain('distance(uv, vec2<f32>(0.5))');
  });

  it('uses squared center distance in material-aware post-process chromatic aberration path', () => {
    const { fragment } = MaterialAwarePostProcessShaders();
    expect(fragment).toContain('let distFromCenterSq = dot(centeredFromCenter, centeredFromCenter);');
    expect(fragment).not.toContain('distance(uv, vec2<f32>(0.5))');
  });

  it('uses a wider texture UV scale for sharper sampled block detail', () => {
    const { uvs } = CubeData();
    let minUV = Number.POSITIVE_INFINITY;
    let maxUV = Number.NEGATIVE_INFINITY;
    for (const uv of uvs) {
      minUV = Math.min(minUV, uv);
      maxUV = Math.max(maxUV, uv);
    }
    expect(minUV).toBeLessThan(0.06);
    expect(minUV).toBeGreaterThan(0.005);
    expect(maxUV).toBeGreaterThan(0.94);
    expect(maxUV).toBeLessThan(0.995);
  });

it('samples albedo with the linear color sampler and mask with nearest mip 0', () => {
  const { fragment } = PBRBlockShaders();
  expect(fragment).toContain('textureSampleBias(blockTexture, blockSamplerColor, texUV, 0.0)');
  expect(fragment).toContain('textureSampleLevel(blockTextureMask, blockSamplerMask, texUV, 0.0)');
  expect(fragment).not.toContain('borderThickness = 0.14');
});

it('keeps metal opaque while glass uses dynamic alpha for video reveal', () => {
  const { fragment } = PBRBlockShaders();
  expect(fragment).toContain('var finalAlpha = 1.0;');
  expect(fragment).toContain('let materialAlpha = mix(finalAlpha, 1.0, metalOpaque);');
});

it('composes gold frame and tinted glass using authored baked alpha', () => {
  const { fragment } = PBRBlockShaders();
  expect(fragment).toContain('composeMaterialBaseColor');
  expect(fragment).toContain('useAuthoredSampling');
  expect(fragment).toContain('let metalColor = gradeGoldMetalAlbedo(texColor.rgb)');
  // Opacity curve moved into the shared authored module (also embedded by the C++
  // renderer); the fragment shader calls it instead of inlining the mix.
  expect(fragment).toContain('let glassOpacity = authoredGlassOpacity(');
  expect(fragment).toContain('mix(glassMin, glassMax, glassFresnel)');
  expect(fragment).toContain('metalMask = clamp(texColor.a, 0.0, 1.0)');
  expect(fragment).toContain('let metalOpaque = step(0.5, metalMask)');
  expect(fragment).toContain('let glassMaskAlpha = 1.0 - metalOpaque');
  expect(fragment).toContain('finalAlpha = mix(1.0, glassOpacity, glassMaskAlpha);');
  expect(fragment).toContain('fUniforms.glassParams.min');
  expect(fragment).toContain('fUniforms.glassParams.fresnelPower');
  expect(fragment).not.toContain('combinedMetalMask');
  expect(fragment).not.toContain('reserved2');
  expect(fragment).toContain('isBorderBlock');
});

it('premultiplies post-process output for the premultiplied-alpha canvas', () => {
  const { fragment } = MaterialAwarePostProcessShaders();
  expect(fragment).toContain('return vec4<f32>(color * sampledAlpha, sampledAlpha);');
});

it('preserves alpha in the multi-pass bloom composite for glass transparency', () => {
  expect(CompositeShader).toContain('return vec4<f32>(mapped * alpha, alpha);');
});

it('debug mask views nearest-sample baked alpha and hard-threshold metal', () => {
  const dbg = DebugTextureShaders();
  expect(dbg.fragmentBakedMetalAlpha).toContain('textureLoad(blockTexture, px, 0).a');
  expect(dbg.fragmentGlassMask).toContain('textureLoad(blockTexture, px, 0).a');
  expect(dbg.fragmentFinalAlphaApprox).toContain('step(0.5, texMaskA)');
  expect(dbg.fragmentFinalAlphaApprox).not.toContain('smoothstep(0.45, 0.65, texColor.a)');
});
  
});
