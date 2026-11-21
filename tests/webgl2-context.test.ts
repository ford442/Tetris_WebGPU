import { describe, expect, it } from 'vitest';
import { grantedDesynchronized, webgl2ContextAttributes } from '../src/viewWebGL2/contextAttributes.js';

describe('webgl2ContextAttributes', () => {
  it('pins the context attributes', () => {
    expect(webgl2ContextAttributes('', null)).toEqual({
      alpha: true,
      premultipliedAlpha: true,
      antialias: false,
      depth: true,
      stencil: false,
      powerPreference: 'high-performance',
      desynchronized: true,
      preserveDrawingBuffer: false,
    });
  });

  it('turns MSAA off: the scene goes through an FBO chain', () => {
    expect(webgl2ContextAttributes('', null).antialias).toBe(false);
  });

  it('keeps the video-portal contract (alpha + premultiplied)', () => {
    const a = webgl2ContextAttributes('', null);
    expect(a.alpha).toBe(true);
    expect(a.premultipliedAlpha).toBe(true);
  });

  it('shares the WebGPU power policy: ?gpu=low, then the persisted setting', () => {
    expect(webgl2ContextAttributes('?gpu=low', null).powerPreference).toBe('low-power');
    expect(webgl2ContextAttributes('?gpu=high', 'low').powerPreference).toBe('high-performance');
    expect(webgl2ContextAttributes('', 'low-power').powerPreference).toBe('low-power');
    expect(webgl2ContextAttributes('', 'high-performance').powerPreference).toBe('high-performance');
  });
});

describe('grantedDesynchronized', () => {
  it('reports what the browser actually granted', () => {
    expect(grantedDesynchronized({ getContextAttributes: () => ({ desynchronized: true }) })).toBe(true);
    expect(grantedDesynchronized({ getContextAttributes: () => ({ desynchronized: false }) })).toBe(false);
    expect(grantedDesynchronized({ getContextAttributes: () => ({}) })).toBe(false);
    expect(grantedDesynchronized({ getContextAttributes: () => null })).toBe(false);
  });
});
