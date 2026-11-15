import { describe, expect, it } from 'vitest';
import { PAGES_BASE, isRelativeBase, resolveBase } from '../scripts/lib/viteBase.mjs';

describe('resolveBase (VITE_BASE)', () => {
  it('defaults to the Pages path in production and / in dev', () => {
    expect(resolveBase({}, true)).toBe(PAGES_BASE);
    expect(PAGES_BASE).toBe('/tetris-webgpu/');
    expect(resolveBase({}, false)).toBe('/');
  });

  it('infers production from NODE_ENV when not told', () => {
    expect(resolveBase({ NODE_ENV: 'production' })).toBe('/tetris-webgpu/');
    expect(resolveBase({ NODE_ENV: 'development' })).toBe('/');
  });

  it('treats an empty VITE_BASE as unset', () => {
    expect(resolveBase({ VITE_BASE: '  ' }, true)).toBe(PAGES_BASE);
  });

  it('keeps a relative base for desktop/Tauri', () => {
    expect(resolveBase({ VITE_BASE: './' }, true)).toBe('./');
    expect(resolveBase({ VITE_BASE: '.' }, true)).toBe('./');
    expect(isRelativeBase('./')).toBe(true);
  });

  it('normalises a custom prefix to end in a single slash', () => {
    expect(resolveBase({ VITE_BASE: '/games/tetris' }, true)).toBe('/games/tetris/');
    expect(resolveBase({ VITE_BASE: '/games/tetris///' }, true)).toBe('/games/tetris/');
    expect(resolveBase({ VITE_BASE: 'https://cdn.example.com/t' }, true)).toBe('https://cdn.example.com/t/');
    expect(isRelativeBase('/games/tetris/')).toBe(false);
  });

  it('vite.config.ts and generate-sw.mjs both use the shared resolver', async () => {
    const { readFileSync } = await import('node:fs');
    expect(readFileSync('vite.config.ts', 'utf8')).toContain('resolveBase()');
    expect(readFileSync('scripts/generate-sw.mjs', 'utf8')).toContain('resolveBase(');
  });
});
