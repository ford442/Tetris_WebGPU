import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  getRendererPreference,
  setRendererPreference,
  parseRendererPreference,
} from '../src/view/rendererPreference.js';

function createStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (key: string) => (map.has(key) ? map.get(key)! : null),
    key: (index: number) => Array.from(map.keys())[index] ?? null,
    removeItem: (key: string) => {
      map.delete(key);
    },
    setItem: (key: string, value: string) => {
      map.set(key, value);
    },
  };
}

function mockBrowser(search: string, storage: Storage): void {
  vi.stubGlobal('window', {
    location: { search },
    localStorage: storage,
  });
}

describe('getRendererPreference', () => {
  let storage: Storage;

  beforeEach(() => {
    storage = createStorage();
    mockBrowser('', storage);
  });

  it('returns auto when no query or storage', () => {
    expect(getRendererPreference()).toBe('auto');
  });

  it('reads ?renderer=webgpu-cpp from URL', () => {
    mockBrowser('?renderer=webgpu-cpp', storage);
    expect(getRendererPreference()).toBe('webgpu-cpp');
  });

  it('reads webgpu-cpp from localStorage', () => {
    storage.setItem('tetris_renderer', 'webgpu-cpp');
    expect(getRendererPreference()).toBe('webgpu-cpp');
  });

  it('prefers URL over localStorage', () => {
    storage.setItem('tetris_renderer', 'webgl2');
    mockBrowser('?renderer=webgpu-cpp', storage);
    expect(getRendererPreference()).toBe('webgpu-cpp');
  });

  it('ignores unknown renderer values', () => {
    mockBrowser('?renderer=invalid', storage);
    storage.setItem('tetris_renderer', 'nope');
    expect(getRendererPreference()).toBe('auto');
  });

  it('persists webgpu-cpp via setRendererPreference', () => {
    setRendererPreference('webgpu-cpp');
    expect(storage.getItem('tetris_renderer')).toBe('webgpu-cpp');
    expect(getRendererPreference()).toBe('webgpu-cpp');
  });

  it('parseRendererPreference accepts known values only', () => {
    expect(parseRendererPreference('webgpu-cpp')).toBe('webgpu-cpp');
    expect(parseRendererPreference('webgpu')).toBe('webgpu');
    expect(parseRendererPreference('webgl2')).toBe('webgl2');
    expect(parseRendererPreference('bogus')).toBeNull();
  });
});
