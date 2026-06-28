import { describe, it, expect } from 'vitest';
import { VALID_RENDERERS, withRendererParam } from '../scripts/rendererUrl.mjs';

describe('rendererUrl (screenshot scripts)', () => {
  it('accepts webgpu-cpp in VALID_RENDERERS', () => {
    expect(VALID_RENDERERS).toContain('webgpu-cpp');
  });

  it('appends renderer query param', () => {
    expect(withRendererParam('http://localhost:5173/', 'webgpu-cpp')).toBe(
      'http://localhost:5173/?renderer=webgpu-cpp',
    );
  });

  it('leaves URL unchanged for auto', () => {
    expect(withRendererParam('http://localhost:5173/', 'auto')).toBe('http://localhost:5173/');
  });
});
