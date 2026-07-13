import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  applyQualityPreset,
  createDefaultSettings,
  detectDefaultQuality,
  inferQualityFromToggles,
  loadGameSettings,
  parseGameSettings,
  saveGameSettings,
  settingsFromPreset,
  SETTINGS_STORAGE_KEY,
} from '../src/config/gameSettings.js';
import { QUALITY_PRESET_VALUES } from '../src/config/renderConfig.js';

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

describe('gameSettings', () => {
  let storage: Storage;

  beforeEach(() => {
    storage = createStorage();
    vi.stubGlobal('localStorage', storage);
  });

  it('maps quality presets to renderConfig values', () => {
    const low = settingsFromPreset('low');
    expect(low.renderScale).toBe(QUALITY_PRESET_VALUES.low.renderScale);
    expect(low.bloom).toBe(false);
    expect(low.particles).toBe(false);

    const ultra = settingsFromPreset('ultra');
    expect(ultra.renderScale).toBe(QUALITY_PRESET_VALUES.ultra.renderScale);
    expect(ultra.crt).toBe(true);
    expect(ultra.fxaa).toBe(true);
  });

  it('persists and reloads settings', () => {
    const settings = settingsFromPreset('medium', { reactiveVideo: false, glitch: true });
    saveGameSettings(settings);
    const raw = storage.getItem(SETTINGS_STORAGE_KEY);
    expect(raw).toBeTruthy();
    const loaded = loadGameSettings();
    expect(loaded.quality).toBe('medium');
    expect(loaded.reactiveVideo).toBe(false);
    expect(loaded.glitch).toBe(true);
  });

  it('migrates legacy reactive video flag when settings missing', () => {
    storage.setItem('tetris_use_reactive_video', 'false');
    const loaded = loadGameSettings();
    expect(loaded.reactiveVideo).toBe(false);
  });

  it('applyQualityPreset preserves reactive video, glitch, and gpu power', () => {
    const current = settingsFromPreset('ultra', { reactiveVideo: false, glitch: true, gpuPower: 'low-power' });
    const next = applyQualityPreset(current, 'low');
    expect(next.quality).toBe('low');
    expect(next.renderScale).toBe(0.75);
    expect(next.reactiveVideo).toBe(false);
    expect(next.glitch).toBe(true);
    expect(next.gpuPower).toBe('low-power');
  });

  it('infers custom when toggles diverge from presets', () => {
    const custom = {
      ...settingsFromPreset('medium'),
      bloom: false,
    };
    expect(inferQualityFromToggles(custom)).toBe('custom');
  });

  it('parseGameSettings rejects invalid gpu power', () => {
    const parsed = parseGameSettings({ version: 1, quality: 'high', gpuPower: 'turbo' });
    expect(parsed.gpuPower).toBe('auto');
  });
});

describe('detectDefaultQuality', () => {
  it('returns medium for mobile user agents', () => {
    vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)' });
    vi.stubGlobal('window', { devicePixelRatio: 3 });
    expect(detectDefaultQuality()).toBe('medium');
  });

  it('returns ultra for desktop-like agents', () => {
    vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120' });
    vi.stubGlobal('window', { devicePixelRatio: 2 });
    expect(detectDefaultQuality()).toBe('ultra');
  });

  it('createDefaultSettings uses detectDefaultQuality', () => {
    vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (Linux; Android 14)' });
    vi.stubGlobal('window', { devicePixelRatio: 2.5 });
    const defaults = createDefaultSettings();
    expect(defaults.quality).toBe('medium');
  });
});
