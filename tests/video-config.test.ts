import { describe, expect, it, afterEach, beforeEach, vi } from 'vitest';
import {
  allLevelVideoPaths,
  getVideoAssetBaseUrl,
  levelToVideoIndex,
  levelVideoPath,
  resolveVideoUrl,
  setVideoAssetBaseUrl,
  LEVEL_VIDEO_COUNT,
} from '../src/config/videoConfig.js';
import { resolveLevelVideoSrc } from '../src/webgpu/videoManifest.js';

function createStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear() {
      map.clear();
    },
    getItem(key: string) {
      return map.has(key) ? map.get(key)! : null;
    },
    key(index: number) {
      return [...map.keys()][index] ?? null;
    },
    removeItem(key: string) {
      map.delete(key);
    },
    setItem(key: string, value: string) {
      map.set(key, value);
    },
  };
}

describe('videoConfig', () => {
  let storage: Storage;

  beforeEach(() => {
    storage = createStorage();
    vi.stubGlobal('localStorage', storage);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    setVideoAssetBaseUrl(null);
  });

  it('lists 15 level video paths', () => {
    const paths = allLevelVideoPaths();
    expect(paths).toHaveLength(LEVEL_VIDEO_COUNT);
    expect(paths[0]).toBe('./assets/video/bg1.mp4');
    expect(paths[14]).toBe('./assets/video/bg15.mp4');
  });

  it('maps levels to video indices with cap at 15', () => {
    expect(levelToVideoIndex(0)).toBe(1);
    expect(levelToVideoIndex(14)).toBe(15);
    expect(levelToVideoIndex(99)).toBe(15);
  });

  it('resolves CDN base from localStorage', () => {
    setVideoAssetBaseUrl('https://cdn.example.com/game');
    expect(getVideoAssetBaseUrl()).toBe('https://cdn.example.com/game');
    expect(resolveVideoUrl(levelVideoPath(3))).toBe(
      'https://cdn.example.com/game/assets/video/bg3.mp4',
    );
  });

  it('resolveLevelVideoSrc falls back to bg1', () => {
    const available = new Set(['bg1.mp4', 'bg3.mp4']);
    expect(resolveLevelVideoSrc(2, available)).toContain('bg3.mp4');
    expect(resolveLevelVideoSrc(10, available)).toContain('bg1.mp4');
  });

  it('resolveLevelVideoSrc returns null when nothing available', () => {
    expect(resolveLevelVideoSrc(0, new Set())).toBeNull();
    expect(resolveLevelVideoSrc(0, null)).toBeNull();
  });
});
