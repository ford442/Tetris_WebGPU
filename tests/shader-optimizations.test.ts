import { describe, expect, it } from 'vitest';
import { CubeData } from '../src/webgpu/geometry.js';
import { BackgroundShaders } from '../src/webgpu/shaders/background.js';
import { PostProcessShaders } from '../src/webgpu/shaders/postProcess.js';
import { EnhancedPostProcessShaders } from '../src/webgpu/shaders/enhancedPostProcess.js';
import { MaterialAwarePostProcessShaders } from '../src/webgpu/shaders/materialAwarePostProcess.js';
import { PBRBlockShaders } from '../src/webgpu/shaders/pbrBlocks.js';
import { CompositeShader } from '../src/webgpu/bloomShaders.js';

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

it('samples block image detail from explicit mip 0 in the PBR shader', () => {
  const { fragment } = PBRBlockShaders();
  expect(fragment).toContain('textureSampleLevel(blockTexture, blockSampler, texUV, 0.0)');
});

it('keeps metal opaque while glass uses dynamic alpha for video reveal', () => {
  const { fragment } = PBRBlockShaders();
  expect(fragment).toContain('var finalAlpha = 1.0;');
  expect(fragment).toContain('let materialAlpha = mix(finalAlpha, 1.0, metalMask);');
  expect(fragment).not.toContain('let materialAlpha = mix(0.85, 0.98, metalMask);');
});

it('composes gold frame and tinted glass using geometric UV frame mask', () => {
  const { fragment } = PBRBlockShaders();
  expect(fragment).toContain('composeMaterialBaseColor');
  expect(fragment).toContain('useAuthoredSampling');
  expect(fragment).toContain('borderThickness = 0.15');
  expect(fragment).toContain('let metalColor = texColor.rgb * 1.38');
    expect(fragment).toContain('let glassOpacity = mix(0.82, 0.97, fresnelSq)');
  expect(fragment).toContain('combinedMetalMask');
  expect(fragment).toContain('isBorderBlock');
});

it('premultiplies post-process output for the premultiplied-alpha canvas', () => {
  const { fragment } = MaterialAwarePostProcessShaders();
  expect(fragment).toContain('return vec4<f32>(color * sampledAlpha, sampledAlpha);');
});

it('preserves alpha in the multi-pass bloom composite for glass transparency', () => {
  expect(CompositeShader).toContain('return vec4<f32>(result * alpha, alpha);');
});
  
});
