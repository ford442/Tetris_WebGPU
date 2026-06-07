import { describe, expect, it } from 'vitest';
import { postProcessUniforms } from '../src/webgpu/postProcessUniforms.js';
import { PostProcessUniformsWGSL } from '../src/webgpu/postProcessUniforms.js';
import { UNIFORM_BUFFER_SIZES } from '../src/config/renderConfig.js';

describe('post-process uniform layout', () => {
  it('packs 192 bytes matching WGSL minBindingSize', () => {
    const packed = postProcessUniforms.pack();
    expect(packed.byteLength).toBe(UNIFORM_BUFFER_SIZES.POST_PROCESS);
    expect(packed.length).toBe(48);
  });

  it('declares explicit alignment padding before vec3/vec4 fields', () => {
    expect(PostProcessUniformsWGSL).toContain('_padFlashAlign: vec2f');
    expect(PostProcessUniformsWGSL).toContain('_padLaserAlign: vec2f');
    expect(PostProcessUniformsWGSL).toContain('levelUpFlashColor: vec3f');
    expect(PostProcessUniformsWGSL).toContain('lineClearLaserY: vec4f');
  });
});