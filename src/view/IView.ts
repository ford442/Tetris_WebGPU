import type { Themes } from '../webgpu/themes.js';

/** Shared surface area used by Controller and index.ts for either renderer backend. */
export interface IView {
  state: any;
  rendererName: 'webgpu' | 'webgl2';
  canvasWebGPU: HTMLCanvasElement;
  currentTheme: any;
  useGlitch?: boolean;
  useReactiveVideo?: boolean;
  useReactiveMusic?: boolean;
  bloomEnabled?: boolean;
  useWireframe?: boolean;

  render(dt: number): void;
  renderMainScreen(state: any): void;
  renderEndScreen(state: any): void;
  renderPauseScreen(): void;
  renderPiece(ctx: CanvasRenderingContext2D, piece: any, blockSize?: number): void;
  showFloatingText(text: string, subText?: string): void;

  setTheme(themeName: keyof Themes): void;
  setMaterialTheme?(themeName: string, pieceType?: number): void;
  setPremiumVisualsPreset?(options?: Record<string, unknown>): void;
  initReactiveMusic?(audioContext: AudioContext, masterGain: GainNode): void;

  toggleGlitch?(): void;
  toggleBloom?(enabled?: boolean): void;
  setWireframe?(enabled: boolean): void;

  onLineClear?(lines: number[], tSpin?: boolean, combo?: number, backToBack?: boolean, isAllClear?: boolean): void;
  onLock?(isTSpin?: boolean): void;
  onHardDrop?(x: number, ghostY: number, dropDist: number, colorIdx: number): void;
  onMove?(x: number, y: number): void;
  onRotate?(): void;
  onHold?(): void;
  triggerNeonBloomFlashEffects?(intensity: number): void;
}
