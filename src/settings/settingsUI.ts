/**
 * Pause-menu graphics settings UI — binds controls to GameSettings + view applicator.
 */

import type { IView } from '../view/IView.js';
import {
  applyQualityPreset,
  inferQualityFromToggles,
  loadGameSettings,
  saveGameSettings,
  type GameSettings,
  type GpuPowerPreference,
  type QualityPreset,
  type SettingsQuality,
} from '../config/gameSettings.js';
import { getRendererPreference } from '../view/rendererPreference.js';
import type { ColorPaletteId } from '../a11y/colorPalettes.js';
import type { ReducedMotionPref } from '../a11y/accessibility.js';

type SettingsView = IView & {
  applyGameSettings?(settings: GameSettings): void;
  setPremiumVisualsPreset?(options?: Record<string, unknown>): void;
  toggleGlitch?(): void;
  toggleBloom?(enabled?: boolean): void;
  useGlitch?: boolean;
  bloomEnabled?: boolean;
};

const RENDERER_LABELS: Record<string, string> = {
  auto: 'Auto (WebGPU → WebGL2)',
  webgpu: 'WebGPU (TypeScript)',
  webgl2: 'WebGL2 fallback',
  'webgpu-cpp': 'WebGPU C++ (Emscripten)',
};

function applyToView(view: SettingsView, settings: GameSettings): void {
  if (typeof view.applyGameSettings === 'function') {
    view.applyGameSettings(settings);
    return;
  }
  // Fallback backends: best-effort mapping
  view.setPremiumVisualsPreset?.({
    renderScale: settings.renderScale,
    enhancedPostProcess: settings.fxaa || settings.filmGrain || settings.crt,
    reactiveVideo: settings.reactiveVideo,
    reactiveMusic: true,
    particleInteraction: settings.particles,
  });
  view.toggleBloom?.(settings.bloom);
  if (view.useGlitch !== undefined) {
    view.useGlitch = settings.glitch;
  }
}

export interface SettingsUIHandle {
  settings: GameSettings;
  syncControls(): void;
  applyCurrent(): void;
}

export function initSettingsUI(view: SettingsView): SettingsUIHandle {
  let settings = loadGameSettings();
  let suppressEvents = false;

  const qualityInputs = Array.from(
    document.querySelectorAll<HTMLInputElement>('input[name="settings-quality"]'),
  );
  const toggleBloom = document.getElementById('settings-bloom') as HTMLInputElement | null;
  const toggleShockwave = document.getElementById('settings-shockwave') as HTMLInputElement | null;
  const toggleParticles = document.getElementById('settings-particles') as HTMLInputElement | null;
  const toggleReactiveVideo = document.getElementById('settings-reactive-video') as HTMLInputElement | null;
  const toggleGlitch = document.getElementById('settings-glitch') as HTMLInputElement | null;
  const toggleFilmGrain = document.getElementById('settings-film-grain') as HTMLInputElement | null;
  const toggleAdaptiveQuality = document.getElementById('settings-adaptive-quality') as HTMLInputElement | null;
  const toggleLockQuality = document.getElementById('settings-lock-quality') as HTMLInputElement | null;
  const togglePerfOverlay = document.getElementById('settings-perf-overlay') as HTMLInputElement | null;
  const gpuPowerSelect = document.getElementById('settings-gpu-power') as HTMLSelectElement | null;
  const colorPaletteSelect = document.getElementById('settings-color-palette') as HTMLSelectElement | null;
  const reducedMotionSelect = document.getElementById('settings-reduced-motion') as HTMLSelectElement | null;
  const rendererDisplay = document.getElementById('settings-renderer-display');
  const qualityCustomHint = document.getElementById('settings-quality-custom-hint');

  function updateRendererDisplay(): void {
    if (!rendererDisplay) return;
    const pref = getRendererPreference();
    const active = view.rendererName ?? 'webgpu';
    rendererDisplay.textContent = `${RENDERER_LABELS[pref] ?? pref} — active: ${active}`;
  }

  function setQualityRadios(quality: SettingsQuality): void {
    suppressEvents = true;
    for (const input of qualityInputs) {
      input.checked = input.value === quality;
    }
    if (qualityCustomHint) {
      qualityCustomHint.style.display = quality === 'custom' ? 'block' : 'none';
    }
    suppressEvents = false;
  }

  function syncControls(): void {
    settings = loadGameSettings();
    setQualityRadios(settings.quality);
    if (toggleBloom) toggleBloom.checked = settings.bloom;
    if (toggleShockwave) toggleShockwave.checked = settings.shockwave;
    if (toggleParticles) toggleParticles.checked = settings.particles;
    if (toggleReactiveVideo) toggleReactiveVideo.checked = settings.reactiveVideo;
    if (toggleGlitch) toggleGlitch.checked = settings.glitch;
    if (toggleFilmGrain) toggleFilmGrain.checked = settings.filmGrain;
    if (toggleAdaptiveQuality) toggleAdaptiveQuality.checked = settings.adaptiveQuality;
    if (toggleLockQuality) toggleLockQuality.checked = settings.lockQuality;
    if (togglePerfOverlay) togglePerfOverlay.checked = settings.showPerfOverlay;
    if (gpuPowerSelect) gpuPowerSelect.value = settings.gpuPower;
    if (colorPaletteSelect) colorPaletteSelect.value = settings.colorPalette;
    if (reducedMotionSelect) reducedMotionSelect.value = settings.reducedMotion;
    updateRendererDisplay();
  }

  function persistAndApply(next: GameSettings, options?: { reloadOnGpuChange?: boolean }): void {
    const prevGpu = settings.gpuPower;
    settings = next;
    saveGameSettings(settings);
    applyToView(view, settings);
    setQualityRadios(settings.quality);

    if (options?.reloadOnGpuChange && next.gpuPower !== prevGpu) {
      window.location.reload();
    }
  }

  function applyCurrent(): void {
    applyToView(view, settings);
  }

  function onIndividualToggleChange(): void {
    if (suppressEvents) return;
    settings = {
      ...settings,
      bloom: toggleBloom?.checked ?? settings.bloom,
      shockwave: toggleShockwave?.checked ?? settings.shockwave,
      particles: toggleParticles?.checked ?? settings.particles,
      reactiveVideo: toggleReactiveVideo?.checked ?? settings.reactiveVideo,
      glitch: toggleGlitch?.checked ?? settings.glitch,
      filmGrain: toggleFilmGrain?.checked ?? settings.filmGrain,
      adaptiveQuality: toggleAdaptiveQuality?.checked ?? settings.adaptiveQuality,
      lockQuality: toggleLockQuality?.checked ?? settings.lockQuality,
      showPerfOverlay: togglePerfOverlay?.checked ?? settings.showPerfOverlay,
    };
    settings.quality = inferQualityFromToggles(settings);
    persistAndApply(settings);
  }

  for (const input of qualityInputs) {
    input.addEventListener('change', () => {
      if (suppressEvents || !input.checked) return;
      const preset = input.value as QualityPreset;
      persistAndApply(applyQualityPreset(settings, preset));
    });
  }

  toggleBloom?.addEventListener('change', onIndividualToggleChange);
  toggleShockwave?.addEventListener('change', onIndividualToggleChange);
  toggleParticles?.addEventListener('change', onIndividualToggleChange);
  toggleReactiveVideo?.addEventListener('change', onIndividualToggleChange);
  toggleGlitch?.addEventListener('change', onIndividualToggleChange);
  toggleFilmGrain?.addEventListener('change', onIndividualToggleChange);
  toggleAdaptiveQuality?.addEventListener('change', onIndividualToggleChange);
  toggleLockQuality?.addEventListener('change', onIndividualToggleChange);
  togglePerfOverlay?.addEventListener('change', onIndividualToggleChange);

  gpuPowerSelect?.addEventListener('change', () => {
    if (suppressEvents) return;
    const gpuPower = (gpuPowerSelect.value as GpuPowerPreference) || 'auto';
    persistAndApply({ ...settings, gpuPower }, { reloadOnGpuChange: true });
  });

  colorPaletteSelect?.addEventListener('change', () => {
    if (suppressEvents) return;
    const colorPalette = (colorPaletteSelect.value as ColorPaletteId) || 'default';
    persistAndApply({ ...settings, colorPalette });
  });

  reducedMotionSelect?.addEventListener('change', () => {
    if (suppressEvents) return;
    const reducedMotion = (reducedMotionSelect.value as ReducedMotionPref) || 'auto';
    persistAndApply({ ...settings, reducedMotion });
  });

  syncControls();
  applyToView(view, settings);

  return {
    get settings() { return settings; },
    syncControls,
    applyCurrent,
  };
}
