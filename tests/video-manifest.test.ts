import { describe, expect, it, afterEach, vi } from 'vitest';
import type { VideoManifestV1, VideoManifestV2 } from '../src/config/videoConfig.js';
import { resolveLevelVideoSrc } from '../src/webgpu/videoManifest.js';

describe('videoManifest loader', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const mockFetch = (data: unknown, ok: boolean = true) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok,
      json: () => Promise.resolve(data),
    }));
  };

  it('loads a V1 manifest', async () => {
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
        { name: 'bg4.mp4' },
      ],
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

  it('keeps theme pack id and fallback behavior on a V2 manifest', async () => {
    vi.resetModules();
    const { loadVideoManifest } = await import('../src/webgpu/videoManifest.js');
    const v2: VideoManifestV2 = {
      version: 2,
      themePackId: 'custom-pack',
      fallbackBehavior: 'procedural',
      files: [{ name: 'bg1.mp4' }],
    };
    mockFetch(v2);

    const manifest = await loadVideoManifest();
    expect(manifest?.version).toBe(2);
    if (manifest?.version === 2) {
      expect(manifest.themePackId).toBe('custom-pack');
      expect(manifest.fallbackBehavior).toBe('procedural');
      expect(manifest.files[0].name).toBe('bg1.mp4');
    }
  });

  it('rejects invalid manifests', async () => {
    vi.resetModules();
    const { loadVideoManifest } = await import('../src/webgpu/videoManifest.js');
    mockFetch({ version: 3, files: [] });

    expect(await loadVideoManifest()).toBeNull();

    vi.resetModules();
    const { loadVideoManifest: load2 } = await import('../src/webgpu/videoManifest.js');
    mockFetch({ version: 2, files: 'not an array' });
    expect(await load2()).toBeNull();

    vi.resetModules();
    const { loadVideoManifest: load3 } = await import('../src/webgpu/videoManifest.js');
    mockFetch({ version: 2, files: [{ invalid: 'missing name' }] });
    expect(await load3()).toBeNull();

    vi.resetModules();
    const { loadVideoManifest: load4 } = await import('../src/webgpu/videoManifest.js');
    mockFetch({ version: 2, fallbackBehavior: 'loop', files: [{ name: 'bg1.mp4' }] });
    expect(await load4()).toBeNull();
  });
});

describe('resolveLevelVideoSrc', () => {
  const procedural: VideoManifestV2 = {
    version: 2,
    fallbackBehavior: 'procedural',
    files: [{ name: 'bg1.mp4' }],
  };

  it('falls back to bg1 when the manifest does not say otherwise', () => {
    const available = new Set(['bg1.mp4']);
    expect(resolveLevelVideoSrc(5, available)).toContain('bg1.mp4');
    const explicit: VideoManifestV2 = { version: 2, fallbackBehavior: 'bg1', files: [{ name: 'bg1.mp4' }] };
    expect(resolveLevelVideoSrc(5, available, explicit)).toContain('bg1.mp4');
  });

  it('returns null for procedural and none fallbacks', () => {
    const available = new Set(['bg1.mp4']);
    expect(resolveLevelVideoSrc(5, available, procedural)).toBeNull();
    const none: VideoManifestV2 = { version: 2, fallbackBehavior: 'none', files: [{ name: 'bg1.mp4' }] };
    expect(resolveLevelVideoSrc(5, available, none)).toBeNull();
  });

  it('returns the preferred video when it is available', () => {
    const available = new Set(['bg1.mp4', 'bg6.mp4']);
    const resolved = resolveLevelVideoSrc(5, available, procedural);
    expect(resolved).not.toBeNull();
    expect(resolved).toContain('bg6.mp4');
  });
});
