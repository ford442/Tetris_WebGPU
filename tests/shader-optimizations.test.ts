import { describe, expect, it } from 'vitest';
import { CubeData } from '../src/webgpu/geometry.js';
import { BackgroundShaders } from '../src/webgpu/shaders/background.js';
import { PostProcessShaders } from '../src/webgpu/shaders/postProcess.js';
import { EnhancedPostProcessShaders } from '../src/webgpu/shaders/enhancedPostProcess.js';
import { MaterialAwarePostProcessShaders } from '../src/webgpu/shaders/materialAwarePostProcess.js';
import { PBRBlockShaders } from '../src/webgpu/shaders/pbrBlocks.js';

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
    expect(minUV).toBeLessThan(0.04);
    expect(minUV).toBeGreaterThan(0.02);
    expect(maxUV).toBeGreaterThan(0.96);
    expect(maxUV).toBeLessThan(0.98);
  });

  it('uses reduced glass tint mixing to preserve color clarity', () => {
    const { fragment } = PBRBlockShaders();
    expect(fragment).toContain('let glassTint = mix(vec3f(1.0), vColor.rgb, 0.05);');
  });
});
