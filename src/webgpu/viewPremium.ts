/**
 * Premium visuals, reactive system event hooks, and effect toggles.
 * Extracted from viewWebGPU.ts to keep file sizes manageable.
 *
 * All functions accept a View instance as the first argument.
 */

import type { BloomParameters } from './bloomSystem.js';
import { ReactiveMusicSystem } from './reactiveMusic.js';
import { renderLogger, audioLogger } from '../utils/logger.js';

/** The subset of View that these helpers need. */
export interface ViewLike {
  device: GPUDevice;
  setRenderScale(scale: number): void;
  useEnhancedPostProcess: boolean;
  useReactiveVideo: boolean;
  useReactiveMusic: boolean;
  useParticleInteraction: boolean;
  useChaosMode: boolean;
  bloomEnabled: boolean;
  bloomIntensity: number;
  useMultiPassBloom: boolean;
  currentTheme: any;
  reactiveVideoBackground: any;
  reactiveMusicSystem: any;
  jellyfishSystem: any;
  chaosMode: any;
  bloomSystem: any;
  visualEffects: any;
  setMaterialTheme(name: string): void;
  fragmentUniformBuffer: GPUBuffer;
  backgroundUniformBuffer: GPUBuffer;
  currentMaterial: any;
  usePremiumMaterials: boolean;
  particleInteractionUniforms: {
    particleInfluence: number;
    glassDistortion: number;
    goldSpecularBoost: number;
    cyberEmissivePulse: number;
  };
  particleSystem: any;
  state: any;
}

export function setPremiumVisualsPreset(view: ViewLike, options: {
  renderScale?: number;
  enhancedPostProcess?: boolean;
  reactiveVideo?: boolean;
  reactiveMusic?: boolean;
  materialTheme?: string;
  chaosMode?: boolean;
  particleInteraction?: boolean;
} = {}) {
  const {
    renderScale = 1.5,
    enhancedPostProcess = true,
    reactiveVideo = true,
    reactiveMusic = true,
    materialTheme,
    chaosMode = false,
    particleInteraction = true
  } = options;

  view.setRenderScale(renderScale);

  view.useEnhancedPostProcess = enhancedPostProcess;
  renderLogger.info(`Enhanced post-processing ${enhancedPostProcess ? 'enabled' : 'disabled'}`);

  view.useReactiveVideo = reactiveVideo;
  if (reactiveVideo && view.currentTheme.levelVideos) {
    view.reactiveVideoBackground.setVideoSources(view.currentTheme.levelVideos);
    view.reactiveVideoBackground.updateForLevel(view.visualEffects.currentLevel || 0, true);
  }

  view.useReactiveMusic = reactiveMusic;
  renderLogger.info(`Reactive music ${reactiveMusic ? 'enabled' : 'disabled'}`);

  view.useParticleInteraction = particleInteraction;
  renderLogger.info(`Particle interaction ${particleInteraction ? 'enabled' : 'disabled'}`);

  if (chaosMode) {
    view.useChaosMode = true;
    view.chaosMode.toggle();
  }

  if (materialTheme !== undefined) {
    view.setMaterialTheme(materialTheme);
  }

  if (view.bloomSystem) {
    view.bloomSystem.setParameters({
      threshold: 0.72,  // Only the brightest ~28% of pixels bloom — blocks stay clean
      intensity: 0.35,  // ~70% reduction vs the previous 1.2 — pleasant accent, not washout
      scatter: 0.52,    // Tighter, sharper bloom
      clamp: 65472,
      knee: 0.1
    });
  }

  const matLabel = materialTheme ?? (view.currentTheme as any)?.materialTheme ?? 'unchanged';
  renderLogger.info(`Visual preset applied: ${renderScale}x supersampling, ${matLabel} materials, chaos: ${chaosMode}`);
}

export function onLineClearReactive(view: ViewLike, lines: number, combo: number, isTSpin: boolean, isAllClear: boolean) {
  if (view.useReactiveVideo) {
    if (view.useChaosMode && view.chaosMode.state.enabled) {
      view.reactiveVideoBackground.triggerReverse(0.3);
      view.reactiveVideoBackground.targetPlaybackRate = 2.5;
    } else {
      view.reactiveVideoBackground.onLineClear(lines, combo, isTSpin, isAllClear);
    }
  }

  if (view.useReactiveMusic && view.reactiveMusicSystem) {
    view.reactiveMusicSystem.onLineClear(lines, combo, lines === 4);
  }

  if (view.reactiveVideoBackground?.isSeaCreatureLevel) {
    view.jellyfishSystem.onLineClear(lines, combo);
  }

  if (view.useChaosMode && view.chaosMode.state.enabled) {
    view.chaosMode.getChaosPulse();
  }
}

export function onTSpinReactive(view: ViewLike) {
  if (view.useReactiveVideo) {
    view.reactiveVideoBackground.onTSpin();
  }
  if (view.useReactiveMusic && view.reactiveMusicSystem) {
    view.reactiveMusicSystem.onTSpin();
  }
  if (view.reactiveVideoBackground?.isSeaCreatureLevel) {
    view.jellyfishSystem.onTSpin();
  }

  // NEW: Brief procedural crown sprite above the T-piece on T-Spin
  if (view.particleSystem && view.state?.activePiece) {
    const p = view.state.activePiece;
    const cx = (p.x + (p.blocks[0]?.length || 4) / 2) * 2.2;
    const cz = 0; // board is mostly 2D in world Z
    const cy = (p.y + (p.blocks.length || 3) / 2) * -2.2 + 2.5; // above the piece

    const bg = (view.currentTheme as any).backgroundColors || [[0.8,0.8,0.8], [0.6,0.6,0.6]];
    const c1 = bg[0] || [0.8, 0.8, 0.8];
    const c2 = bg[1] || [0.6, 0.6, 0.6];

    view.particleSystem.emitTSpinCrown(cx, cy, cz, c1, c2);
  }
}

export function onPerfectClearReactive(view: ViewLike) {
  if (view.useReactiveVideo) {
    view.reactiveVideoBackground.onPerfectClear();
  }

  // Extend with particle "PERFECT" text assembly (upward drift -> targets from pixel font -> 1.5s hold -> scatter)
  if (view.particleSystem) {
    const theme = (view.currentTheme as any) || {};
    const bg = theme.backgroundColors || [[0.4, 0.9, 1.0], [1.0, 0.85, 0.3]];
    // Bright celebratory color (primary bg or warm highlight)
    const bright: number[] = [
      (bg[0]?.[0] ?? 0.6) * 0.7 + 0.3,
      (bg[0]?.[1] ?? 0.85) * 0.7 + 0.3,
      (bg[0]?.[2] ?? 0.95) * 0.6 + 0.4,
      0.95
    ];

    // Center of screen, floating above mid-board (tuned to world coords from renderMetrics)
    const cx = 11.0;
    const cy = -9.0;
    view.particleSystem.emitPerfectClearText(cx, cy, bright);
  }
}

export function onLevelUpReactive(view: ViewLike, level: number) {
  if (view.useReactiveVideo && view.currentTheme.levelVideos) {
    view.reactiveVideoBackground.updateForLevel(level);
  }
  if (view.useReactiveMusic && view.reactiveMusicSystem) {
    view.reactiveMusicSystem.onLevelUp(level);
  }
}

export function onGameOverReactive(view: ViewLike) {
  if (view.useReactiveVideo) {
    view.reactiveVideoBackground.onGameOver();
  }
  if (view.useReactiveMusic && view.reactiveMusicSystem) {
    view.reactiveMusicSystem.onGameOver();
  }
}

export function initReactiveMusic(view: ViewLike, audioContext: AudioContext, masterGain: GainNode) {
  if (!view.useReactiveMusic) return;
  view.reactiveMusicSystem = new ReactiveMusicSystem(audioContext, masterGain);
  audioLogger.info('Reactive music system initialized');
}

export function toggleFXAA(view: ViewLike, enabled: boolean) { view.useEnhancedPostProcess = enabled; }
export function toggleFilmGrain(_view: ViewLike, _enabled: boolean) { /* Future: add granular control */ }
export function toggleCRT(_view: ViewLike, _enabled: boolean) { /* Future: add granular control */ }

export function toggleBloom(view: ViewLike, enabled?: boolean) {
  if (enabled !== undefined) {
    view.bloomEnabled = enabled;
  } else {
    view.bloomEnabled = !view.bloomEnabled;
  }
}

export function setBloomIntensity(view: ViewLike, intensity: number) {
  view.bloomIntensity = Math.max(0, Math.min(2, intensity));
  if (view.bloomSystem) {
    view.bloomSystem.setParameters({ intensity });
  }
}

export function toggleMultiPassBloom(view: ViewLike): boolean {
  view.useMultiPassBloom = !view.useMultiPassBloom;
  renderLogger.info(`Multi-pass bloom: ${view.useMultiPassBloom ? 'ON' : 'OFF'}`);
  return view.useMultiPassBloom;
}

export function setBloomParameters(view: ViewLike, params: Partial<BloomParameters>) {
  if (view.bloomSystem) {
    view.bloomSystem.setParameters(params);
  }
  if (params.intensity !== undefined) {
    view.bloomIntensity = params.intensity;
  }
}
