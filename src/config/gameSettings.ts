/**
 * In-game graphics settings — persisted to localStorage (`tetris_settings`).
 * Quality presets map through renderConfig; individual toggles override preset to "custom".
 */

import {
  QUALITY_PRESET_VALUES,
  type QualityPreset,
  type QualityPresetValues,
} from './renderConfig.js';

export type GpuPowerPreference = 'auto' | 'high-performance' | 'low-power';

export type SettingsQuality = QualityPreset | 'custom';

export interface GameSettings {
  version: 1;
  quality: SettingsQuality;
  renderScale: number;
  bloom: boolean;
  shockwave: boolean;
  particles: boolean;
  reactiveVideo: boolean;
  glitch: boolean;
  filmGrain: boolean;
  crt: boolean;
  fxaa: boolean;
  gpuPower: GpuPowerPreference;
}

export const SETTINGS_STORAGE_KEY = 'tetris_settings';

const VALID_GPU_POWER: GpuPowerPreference[] = ['auto', 'high-performance', 'low-power'];
const VALID_QUALITY: SettingsQuality[] = ['low', 'medium', 'high', 'ultra', 'custom'];

function presetMatches(settings: GameSettings, preset: QualityPreset): boolean {
  const p = QUALITY_PRESET_VALUES[preset];
  return (
    settings.renderScale === p.renderScale &&
    settings.bloom === p.bloom &&
    settings.particles === p.particles &&
    settings.filmGrain === p.filmGrain &&
    settings.crt === p.crt &&
    settings.fxaa === p.fxaa &&
    settings.shockwave === p.shockwave
  );
}

/** Infer quality label from current toggle values. */
export function inferQualityFromToggles(settings: Pick<GameSettings,
  'renderScale' | 'bloom' | 'particles' | 'filmGrain' | 'crt' | 'fxaa' | 'shockwave'
>): SettingsQuality {
  for (const preset of ['ultra', 'high', 'medium', 'low'] as QualityPreset[]) {
    if (presetMatches({ ...settings, quality: preset, version: 1, reactiveVideo: false, glitch: false, gpuPower: 'auto' }, preset)) {
      return preset;
    }
  }
  return 'custom';
}

/** Heuristic default: Ultra on desktop, Medium on mobile / low DPR. */
export function detectDefaultQuality(): QualityPreset {
  if (typeof navigator === 'undefined') return 'medium';
  const ua = navigator.userAgent ?? '';
  const isMobile = /Android|iPhone|iPad|iPod|Mobile|webOS|BlackBerry|IEMobile|Opera Mini/i.test(ua);
  const lowDpr = typeof window !== 'undefined' && (window.devicePixelRatio ?? 1) <= 1.25;
  if (isMobile || lowDpr) return 'medium';
  return 'ultra';
}

export function settingsFromPreset(
  preset: QualityPreset,
  overrides: Partial<Pick<GameSettings, 'reactiveVideo' | 'glitch' | 'gpuPower'>> = {},
): GameSettings {
  const p: QualityPresetValues = QUALITY_PRESET_VALUES[preset];
  return {
    version: 1,
    quality: preset,
    renderScale: p.renderScale,
    bloom: p.bloom,
    shockwave: p.shockwave,
    particles: p.particles,
    reactiveVideo: overrides.reactiveVideo ?? true,
    glitch: overrides.glitch ?? false,
    filmGrain: p.filmGrain,
    crt: p.crt,
    fxaa: p.fxaa,
    gpuPower: overrides.gpuPower ?? 'auto',
  };
}

export function createDefaultSettings(): GameSettings {
  return settingsFromPreset(detectDefaultQuality());
}

function parseBool(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function parseNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function parseGpuPower(value: unknown): GpuPowerPreference {
  if (typeof value === 'string' && (VALID_GPU_POWER as string[]).includes(value)) {
    return value as GpuPowerPreference;
  }
  return 'auto';
}

function parseQuality(value: unknown): SettingsQuality {
  if (typeof value === 'string' && (VALID_QUALITY as string[]).includes(value)) {
    return value as SettingsQuality;
  }
  return 'custom';
}

/** Parse raw JSON from localStorage into validated GameSettings. */
export function parseGameSettings(raw: unknown, fallback: GameSettings = createDefaultSettings()): GameSettings {
  if (!raw || typeof raw !== 'object') return { ...fallback };

  const o = raw as Record<string, unknown>;
  const quality = parseQuality(o.quality);
  const base = quality !== 'custom'
    ? settingsFromPreset(quality as QualityPreset, {
        reactiveVideo: parseBool(o.reactiveVideo, fallback.reactiveVideo),
        glitch: parseBool(o.glitch, fallback.glitch),
        gpuPower: parseGpuPower(o.gpuPower),
      })
    : { ...fallback };

  const settings: GameSettings = {
    version: 1,
    quality,
    renderScale: parseNumber(o.renderScale, base.renderScale),
    bloom: parseBool(o.bloom, base.bloom),
    shockwave: parseBool(o.shockwave, base.shockwave),
    particles: parseBool(o.particles, base.particles),
    reactiveVideo: parseBool(o.reactiveVideo, base.reactiveVideo),
    glitch: parseBool(o.glitch, base.glitch),
    filmGrain: parseBool(o.filmGrain, base.filmGrain),
    crt: parseBool(o.crt, base.crt),
    fxaa: parseBool(o.fxaa, base.fxaa),
    gpuPower: parseGpuPower(o.gpuPower),
  };

  if (settings.quality === 'custom') {
    settings.quality = inferQualityFromToggles(settings);
  }

  return settings;
}

export function loadGameSettings(): GameSettings {
  if (typeof localStorage === 'undefined') return createDefaultSettings();

  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (raw) {
      return parseGameSettings(JSON.parse(raw));
    }
  } catch {
    /* fall through to migration / defaults */
  }

  // Migrate legacy reactive-video flag
  const legacyVideo = localStorage.getItem('tetris_use_reactive_video');
  const defaults = createDefaultSettings();
  if (legacyVideo !== null) {
    defaults.reactiveVideo = legacyVideo !== 'false';
  }

  return defaults;
}

export function saveGameSettings(settings: GameSettings): void {
  if (typeof localStorage === 'undefined') return;
  const normalized = { ...settings };
  if (normalized.quality === 'custom') {
    normalized.quality = inferQualityFromToggles(normalized);
  }
  localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(normalized));
  // Keep legacy key in sync for any external tooling
  localStorage.setItem('tetris_use_reactive_video', String(normalized.reactiveVideo));
}

/** Apply a named quality preset, preserving user toggles for reactive video / glitch / GPU. */
export function applyQualityPreset(
  current: GameSettings,
  preset: QualityPreset,
): GameSettings {
  const next = settingsFromPreset(preset, {
    reactiveVideo: current.reactiveVideo,
    glitch: current.glitch,
    gpuPower: current.gpuPower,
  });
  return next;
}

/** WebGPU adapter request option (omit for auto). */
export function gpuPowerToAdapterOption(
  gpuPower: GpuPowerPreference,
): GPURequestAdapterOptions | undefined {
  if (gpuPower === 'auto') return undefined;
  return { powerPreference: gpuPower };
}
