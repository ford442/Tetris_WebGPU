import { describe, expect, it, afterEach, vi } from 'vitest';
import type { VideoManifestV1, VideoManifestV2 } from '../src/config/videoConfig.js';

describe('videoManifest loader', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    // Reset module state (we'd normally mock fetch and re-import or use vi.resetModules)
    // For simplicity, we just mock fetch and let loadVideoManifest run.
  });

  const mockFetch = (data: any, ok: boolean = true) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok,
      json: () => Promise.resolve(data)
    }));
  };

  it('loads a V1 manifest', async () => {
    // Need to reset the cached module state so it re-fetches.
    vi.resetModules();
    const { loadVideoManifest } = await import('../src/webgpu/videoManifest.js');
    const v1: VideoManifestV1 = { version: 1, basePath: './', files: ['bg1.mp4', 'bg2.mp4'], generated: false };
    mockFetch(v1);

    const manifest = await loadVideoManifest();
    expect(manifest?.version).toBe(1);
    if (manifest?.version === 1) {
      expect(manifest.files).toEqual(['bg1.mp4', 'bg2.mp4']);
    }
  });

  it('loads a V2 manifest and probes correctly', async () => {
    vi.resetModules();
    const { loadVideoManifest, probeVideoAvailability } = await import('../src/webgpu/videoManifest.js');
    const v2: VideoManifestV2 = {
      version: 2,
      basePath: './',
      files: [
        { name: 'bg1.mp4', required: true, hash: 'abc', resolution: '720x1280', license: 'MIT' },
        { name: 'bg4.mp4' }
      ]
    };
    mockFetch(v2);

    const manifest = await loadVideoManifest();
    expect(manifest?.version).toBe(2);
    if (manifest?.version === 2) {
      expect(manifest.files[0].name).toBe('bg1.mp4');
      expect(manifest.files[0].resolution).toBe('720x1280');
    }

    const available = await probeVideoAvailability();
    expect(available.has('bg1.mp4')).toBe(true);
    expect(available.has('bg4.mp4')).toBe(true);
    expect(available.has('bg2.mp4')).toBe(false);
  });

  it('rejects invalid manifests', async () => {
    vi.resetModules();
    const { loadVideoManifest } = await import('../src/webgpu/videoManifest.js');
    mockFetch({ version: 3, files: [] }); // Unsupported version

    expect(await loadVideoManifest()).toBeNull();

    vi.resetModules();
    const { loadVideoManifest: load2 } = await import('../src/webgpu/videoManifest.js');
    mockFetch({ version: 2, files: 'not an array' }); // Invalid files format
    expect(await load2()).toBeNull();

    vi.resetModules();
    const { loadVideoManifest: load3 } = await import('../src/webgpu/videoManifest.js');
    mockFetch({ version: 2, files: [{ invalid: 'missing name' }] }); // Invalid file object
    expect(await load3()).toBeNull();
  });
});
