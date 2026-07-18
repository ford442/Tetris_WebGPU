/**
 * In-game graphics settings — persisted to localStorage (`tetris_settings`).
 * Quality presets map through renderConfig; individual toggles override preset to "custom".
 */

import {
  QUALITY_PRESET_VALUES,
  type QualityPreset,
  type QualityPresetValues,
} from './renderConfig.js';
import { VOLUME_CONFIG } from './audioConfig.js';
import { GHOST_CONFIG, NEXT_QUEUE_CONFIG } from './gameConfig.js';
import type { ColorPaletteId } from '../a11y/colorPalettes.js';
import { parseColorPaletteId } from '../a11y/colorPalettes.js';
import type { ReducedMotionPref } from '../a11y/accessibility.js';

export type { QualityPreset } from './renderConfig.js';

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
  /** Master mute — persisted. */
  mute: boolean;
  /** SFX bus 0–1 */
  sfxVolume: number;
  /** Music bus 0–1 */
  musicVolume: number;
  /** Next-piece preview depth (1–5, 7-bag order). */
  nextQueueDepth: number;
  /** Ghost trail along hard-drop path. */
  ghostDropTrail: boolean;
  /** Piece tint palette for color vision accessibility. */
  colorPalette: ColorPaletteId;
  /** Reduced motion: auto follows OS, on/off override. */
  reducedMotion: ReducedMotionPref;
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
    if (presetMatches({
      ...createDefaultSettings(),
      ...settings,
      quality: preset,
      version: 1,
      reactiveVideo: false,
      glitch: false,
      gpuPower: 'auto',
    }, preset)) {
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
    mute: false,
    sfxVolume: VOLUME_CONFIG.SFX,
    musicVolume: VOLUME_CONFIG.MUSIC,
    nextQueueDepth: NEXT_QUEUE_CONFIG.DEFAULT_DEPTH,
    ghostDropTrail: GHOST_CONFIG.DROP_TRAIL,
    colorPalette: 'default',
    reducedMotion: 'auto',
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

function parseReducedMotion(value: unknown, fallback: ReducedMotionPref): ReducedMotionPref {
  if (value === 'auto' || value === 'on' || value === 'off') return value;
  return fallback;
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
    mute: parseBool(o.mute, fallback.mute),
    sfxVolume: parseNumber(o.sfxVolume, fallback.sfxVolume),
    musicVolume: parseNumber(o.musicVolume, fallback.musicVolume),
    nextQueueDepth: Math.max(
      NEXT_QUEUE_CONFIG.MIN_DEPTH,
      Math.min(NEXT_QUEUE_CONFIG.MAX_DEPTH, parseNumber(o.nextQueueDepth, fallback.nextQueueDepth)),
    ),
    ghostDropTrail: parseBool(o.ghostDropTrail, fallback.ghostDropTrail),
    colorPalette: parseColorPaletteId(
      typeof o.colorPalette === 'string' ? o.colorPalette : fallback.colorPalette,
    ),
    reducedMotion: parseReducedMotion(o.reducedMotion, fallback.reducedMotion),
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
