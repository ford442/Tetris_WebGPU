import type { GameSettings } from '../config/gameSettings.js';
import type { GameState } from '../game/gameState.js';
import type { Piece } from '../game/pieces.js';
import type { VisualEffects } from '../webgpu/effects.js';
import type { ThemeColors, Themes } from '../webgpu/themes.js';
import type { ParticleSystemLike } from './viewTypes.js';

/** Shared surface area used by Controller and index.ts for any renderer backend. */
export interface IView {
  state: GameState | null;
  rendererName: 'webgpu' | 'webgl2' | 'webgpu-cpp';
  canvasWebGPU: HTMLCanvasElement;
  currentTheme: ThemeColors;
  visualEffects?: VisualEffects;
  particleSystem?: ParticleSystemLike;
  useGlitch?: boolean;
  useReactiveVideo?: boolean;
  useReactiveMusic?: boolean;
  bloomEnabled?: boolean;
  useWireframe?: boolean;

  render(dt: number): void;
  renderMainScreen(state: GameState): void;
  renderEndScreen(state: GameState): void;
  renderPauseScreen(): void;
  renderPiece(ctx: CanvasRenderingContext2D, piece: Piece | null, blockSize?: number): void;
  showFloatingText(text: string, subText?: string): void;

  setTheme(themeName: keyof Themes): void;
  setMaterialTheme?(themeName: string, pieceType?: number): void;
  setPremiumVisualsPreset?(options?: Record<string, unknown>): void;
  applyGameSettings?(settings: GameSettings): void;
  initReactiveMusic?(audioContext: AudioContext, masterGain: GainNode): void;

  toggleGlitch?(): void;
  toggleBloom?(enabled?: boolean): void;
  setWireframe?(enabled: boolean): void;

  onLineClear?(
    lines: number[],
    tSpin?: boolean,
    combo?: number,
    backToBack?: boolean,
    isAllClear?: boolean,
  ): void;
  onLock?(isTSpin?: boolean): void;
  onHardDrop?(x: number, ghostY: number, dropDist: number, colorIdx: number): void;
  onMove?(x: number, y: number): void;
  onRotate?(): void;
  onHold?(): void;
  triggerNeonBloomFlashEffects?(intensity: number): void;
  triggerBackgroundResonance?(intensity: number, durationMs?: number): void;

  /** Premium / reactive hooks (WebGPU primary; optional on fallbacks). */
  onLineClearReactive?(
    linesCleared: number,
    combo: number,
    isTSpin: boolean,
    isAllClear: boolean,
  ): void;
  onLevelUpReactive?(newLevel: number): void;
  onTSpinReactive?(type?: string): void;
  onPerfectClearReactive?(): void;
  onGameOverReactive?(): void;

  /** GPU line-clear path (WebGPU only). */
  gpuLineClearReady?: boolean;
  detectLinesGpu?(playfield: Int8Array): Promise<number[]>;
  syncBoardToGPU?(playfield: Int8Array): void;
}
