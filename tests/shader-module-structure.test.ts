import { describe, expect, it } from 'vitest';
import {
  BlockShaders,
  Shaders,
  VideoBackgroundShader,
  VideoBackgroundShaders,
  ParticleShaders,
} from '../src/webgpu/shaders/index.js';

describe('shader module facade exports', () => {
  it('exposes block shader factory alias from the modular shader index', () => {
    expect(BlockShaders).toBeTypeOf('function');
    expect(BlockShaders).toBe(Shaders);
  });

  it('exposes both video shader export names for compatibility', () => {
    expect(VideoBackgroundShader).toBeTypeOf('function');
    expect(VideoBackgroundShader).toBe(VideoBackgroundShaders);
  });

  it('continues to expose particle shader factory', () => {
    const shader = ParticleShaders();
    expect(shader.vertex.length).toBeGreaterThan(0);
    expect(shader.fragment.length).toBeGreaterThan(0);
  });
});
