import { describe, expect, it, vi, beforeEach } from 'vitest';
import { loadVideoManifest, validateManifest, ManifestValidationError, resolveLevelVideoSrc } from '../src/webgpu/videoManifest.js';

describe('VideoManifest Loader and Validator', () => {
  it('validates a valid v2 manifest', () => {
    const raw = {
      version: 2,
      themePackId: 'custom-pack',
      fallbackBehavior: 'procedural',
      basePath: './assets/video/',
      files: ['bg1.mp4', 'bg2.mp4'],
      generated: false
    };

    const manifest = validateManifest(raw);
    expect(manifest.version).toBe(2);
    expect(manifest.themePackId).toBe('custom-pack');
    expect(manifest.fallbackBehavior).toBe('procedural');
    expect(manifest.files).toEqual(['bg1.mp4', 'bg2.mp4']);
  });

  it('migrates a v1 manifest to v2 format', () => {
    const raw = {
      version: 1,
      basePath: './assets/video/',
      files: ['bg1.mp4'],
      generated: true
    };

    const manifest = validateManifest(raw);
    expect(manifest.version).toBe(2);
    expect(manifest.themePackId).toBe('default-v1-migrated');
    expect(manifest.fallbackBehavior).toBe('bg1');
    expect(manifest.files).toEqual(['bg1.mp4']);
  });

  it('throws ManifestValidationError on missing version', () => {
    const raw = {
      basePath: './assets/video/',
      files: ['bg1.mp4'],
      generated: true
    };
    expect(() => validateManifest(raw)).toThrow(ManifestValidationError);
    expect(() => validateManifest(raw)).toThrow('Manifest must have version 1 or 2');
  });

  it('throws ManifestValidationError on invalid version', () => {
    const raw = {
      version: 3,
      basePath: './assets/video/',
      files: ['bg1.mp4'],
      generated: true
    };
    expect(() => validateManifest(raw)).toThrow(ManifestValidationError);
    expect(() => validateManifest(raw)).toThrow('Manifest must have version 1 or 2');
  });

  it('throws ManifestValidationError on missing files array', () => {
    const raw = {
      version: 2,
      basePath: './assets/video/',
      generated: true
    };
    expect(() => validateManifest(raw)).toThrow(ManifestValidationError);
    expect(() => validateManifest(raw)).toThrow('Manifest must have a files array');
  });

  it('throws ManifestValidationError when raw is not an object', () => {
    expect(() => validateManifest(null)).toThrow(ManifestValidationError);
    expect(() => validateManifest('string')).toThrow(ManifestValidationError);
  });
});

describe('resolveLevelVideoSrc', () => {
  it('respects fallbackBehavior = bg1 (default)', () => {
    const available = new Set(['bg1.mp4']);
    const manifest = { version: 2, fallbackBehavior: 'bg1' } as any;
    expect(resolveLevelVideoSrc(5, available, manifest)).toContain('bg1.mp4');
  });

  it('respects fallbackBehavior = procedural (returns null)', () => {
    const available = new Set(['bg1.mp4']);
    const manifest = { version: 2, fallbackBehavior: 'procedural' } as any;
    expect(resolveLevelVideoSrc(5, available, manifest)).toBeNull();
  });

  it('respects fallbackBehavior = none (returns null)', () => {
    const available = new Set(['bg1.mp4']);
    const manifest = { version: 2, fallbackBehavior: 'none' } as any;
    expect(resolveLevelVideoSrc(5, available, manifest)).toBeNull();
  });

  it('returns preferred video when available', () => {
    // Note: level 5 maps to bg6.mp4
    const available = new Set(['bg1.mp4', 'bg6.mp4']);
    const manifest = { version: 2, fallbackBehavior: 'procedural' } as any;
    const resolved = resolveLevelVideoSrc(5, available, manifest);
    expect(resolved).not.toBeNull();
    expect(resolved).toContain('bg6.mp4');
  });
});
