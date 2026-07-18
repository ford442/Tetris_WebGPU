/**
 * Thin TypeScript adapter for the Emscripten C++ WebGPU renderer (#359).
 *
 * Loads public/cpp/tetris_renderer.{js,wasm} when present and hands off drawing
 * to render_frame. Falls back to TS Canvas2D placeholder when wasm is absent.
 */
import type { IView } from '../view/IView.js';
import type { ViewEventHost } from '../view/viewTypes.js';
import type { GameState } from '../game/gameState.js';
import { createEmptyGameState } from '../game/gameState.js';
import type { Piece } from '../game/pieces.js';
import { themes, type ThemeColors, type Themes } from '../webgpu/themes.js';
import { VisualEffects } from '../webgpu/effects.js';
import { ReactiveVideoBackground, applyReactiveVideoSources } from '../webgpu/reactiveVideo.js';
import {
  renderEndScreen as handleRenderEndScreen,
  renderMainScreen as handleRenderMainScreen,
  renderPauseScreen as handleRenderPauseScreen,
  showFloatingText as handleShowFloatingText,
  onHardDrop as handleHardDrop,
  onHold as handleHold,
  onLineClear as handleLineClear,
  onLock as handleLock,
  onMove as handleMove,
  onRotate as handleRotate,
} from '../webgpu/viewGameEvents.js';
import {
  onLineClearReactive as onLineClearReactiveImpl,
  onTSpinReactive as onTSpinReactiveImpl,
  onPerfectClearReactive as onPerfectClearReactiveImpl,
  onLevelUpReactive as onLevelUpReactiveImpl,
  onGameOverReactive as onGameOverReactiveImpl,
} from '../webgpu/viewPremium.js';
import { renderPiece as renderPieceImpl } from '../webgpu/viewMaterials.js';
import { renderLogger } from '../utils/logger.js';
import { CppRendererLoader, RendererBackend } from './CppRendererLoader.js';
import type { GpuDeviceLifecycleHost } from '../webgpu/gpuContext.js';
import { drawPlayfield2D, drawWipBanner } from './placeholderDraw.js';

const noopParticleSystem = {
  emitParticles: () => {},
  emitParticlesRadial: () => {},
  emitLineClearShards: () => {},
  emitTSpinCrown: () => {},
  emitPerfectClearText: () => {},
  maxParticles: 0,
};

export default class EmscriptenView implements IView, ViewEventHost {
  readonly rendererName = 'webgpu-cpp' as const;

  element: HTMLElement;
  width: number;
  height: number;
  nextPieceContext: CanvasRenderingContext2D;
  holdPieceContext: CanvasRenderingContext2D;
  canvasWebGPU: HTMLCanvasElement;
  currentTheme: ThemeColors = themes.imageSampled;
  state: GameState = createEmptyGameState();
  visualEffects: VisualEffects;
  reactiveVideoBackground: ReactiveVideoBackground;
  particleSystem = noopParticleSystem;

  useGlitch = false;
  useReactiveVideo = false;
  useReactiveMusic = false;
  bloomEnabled = false;
  useWireframe = false;
  lastEffectCounter = -1;
  lastScore = -1;

  private ctx2d: CanvasRenderingContext2D | null = null;
  private ready = false;
  private cppModuleReady = false;
  private gpuDrawActive = false;

  private themes = themes;

  constructor(
    element: HTMLElement,
    width: number,
    height: number,
    _rows: number,
    _cols: number,
    nextPieceContext: CanvasRenderingContext2D,
    holdPieceContext: CanvasRenderingContext2D,
  ) {
    this.element = element;
    this.width = width;
    this.height = height;
    this.nextPieceContext = nextPieceContext;
    this.holdPieceContext = holdPieceContext;

    this.visualEffects = new VisualEffects(element, width, height);
    this.reactiveVideoBackground = new ReactiveVideoBackground(element, width, height);

    this.canvasWebGPU = document.createElement('canvas');
    this.canvasWebGPU.id = 'canvaswebgpu';
    this.canvasWebGPU.style.position = 'absolute';
    this.canvasWebGPU.style.top = '0';
    this.canvasWebGPU.style.left = '0';
    this.canvasWebGPU.style.zIndex = '2';
    this.canvasWebGPU.style.pointerEvents = 'none';
    this.applyCanvasSize(width, height);

    this.state = createEmptyGameState();

    this.element.appendChild(this.canvasWebGPU);
    window.addEventListener('resize', this.resize.bind(this));
  }

  static async create(
    element: HTMLElement,
    width: number,
    height: number,
    rows: number,
    cols: number,
    nextPieceContext: CanvasRenderingContext2D,
    holdPieceContext: CanvasRenderingContext2D,
  ): Promise<EmscriptenView> {
    const view = new EmscriptenView(element, width, height, rows, cols, nextPieceContext, holdPieceContext);
    await view.init();
    return view;
  }

  private rendererBadge: HTMLDivElement | null = null;

  private async init(): Promise<void> {
    const lifecycleHost: GpuDeviceLifecycleHost = {
      device: null as unknown as GPUDevice,
      element: this.element,
      onFatalDeviceLoss: () => {
        if (this.rendererBadge) {
          this.rendererBadge.textContent = 'GPU lost';
        }
      },
    };

    this.cppModuleReady = await CppRendererLoader.init(
      this.canvasWebGPU.width,
      this.canvasWebGPU.height,
      this.canvasWebGPU,
      lifecycleHost,
    );

    this.gpuDrawActive = this.cppModuleReady &&
      CppRendererLoader.getRendererBackend() === RendererBackend.WEBGPU;

    if (!this.gpuDrawActive) {
      this.ctx2d = this.canvasWebGPU.getContext('2d', { alpha: true });
      if (!this.cppModuleReady && !this.ctx2d) {
        throw new Error('Canvas2D is not available for EmscriptenView placeholder.');
      }
    }

    this.ready = true;
    this.showRendererBadge();
    renderLogger.info(
      this.gpuDrawActive
        ? `EmscriptenView: C++ WebGPU draw active (${CppRendererLoader.getLoadedUrl()})`
        : this.cppModuleReady
          ? `EmscriptenView: C++ Canvas2D fallback (${CppRendererLoader.getLoadedUrl()})`
          : 'EmscriptenView: TS Canvas2D placeholder (wasm not built)',
    );
  }

  private showRendererBadge(): void {
    const badge = document.createElement('div');
    badge.id = 'renderer-badge';
    badge.textContent = this.gpuDrawActive
      ? 'C++ GPU'
      : this.cppModuleReady
        ? 'C++ wasm'
        : 'C++ WIP';
    badge.style.cssText =
      'position:fixed;bottom:8px;right:8px;z-index:9999;padding:4px 8px;' +
      'font:12px monospace;background:rgba(0,0,0,0.55);color:#f8c;border-radius:4px;pointer-events:none;';
    document.body.appendChild(badge);
    this.rendererBadge = badge;
  }

  private applyCanvasSize(cssWidth: number, cssHeight: number): void {
    const dpr = window.devicePixelRatio || 1;
    this.canvasWebGPU.width = Math.floor(cssWidth * dpr);
    this.canvasWebGPU.height = Math.floor(cssHeight * dpr);
    this.canvasWebGPU.style.width = `${cssWidth}px`;
    this.canvasWebGPU.style.height = `${cssHeight}px`;
  }

  resize(): void {
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.applyCanvasSize(this.width, this.height);
    this.visualEffects.updateVideoPosition(this.width, this.height);
    if (this.cppModuleReady) {
      CppRendererLoader.resize(this.canvasWebGPU.width, this.canvasWebGPU.height);
    }
  }

  /** Push latest projected playfield + piece state into wasm HEAP. */
  private syncPlayfieldToCpp(): void {
    if (!this.cppModuleReady) return;
    const ghostY = (this as { game?: { getGhostY?: () => number } }).game?.getGhostY?.() ?? 0;
    CppRendererLoader.syncFromGameState(this.state, ghostY);
  }

  private cppRender(dt: number): void {
    this.syncPlayfieldToCpp();
    CppRendererLoader.render(dt);
  }

  private placeholderRender(): void {
    if (!this.ctx2d) return;
    const ctx = this.ctx2d;
    const w = this.canvasWebGPU.width;
    const h = this.canvasWebGPU.height;
    ctx.clearRect(0, 0, w, h);
    drawPlayfield2D(ctx, this.state?.playfield, this.currentTheme, w, h);
    drawWipBanner(ctx, w, h, false);
  }

  setTheme(themeName: keyof Themes): void {
    this.currentTheme = this.themes[themeName];
    this.visualEffects.currentLevel = 0;
    if (this.useReactiveVideo && this.currentTheme.levelVideos) {
      applyReactiveVideoSources(this.reactiveVideoBackground, this.currentTheme.levelVideos, 0, true);
    }
    this.setMaterialTheme(themeName);
  }

  setMaterialTheme(_themeName?: string, _pieceType = 1): void {
    this.currentTheme = themes.imageSampled;
  }

  setPremiumVisualsPreset(options: Record<string, unknown> = {}): void {
    if (typeof options.reactiveVideo === 'boolean') {
      this.useReactiveVideo = options.reactiveVideo;
      if (this.useReactiveVideo && this.currentTheme?.levelVideos) {
        applyReactiveVideoSources(
          this.reactiveVideoBackground,
          this.currentTheme.levelVideos,
          this.state?.level ?? 0,
          true,
        );
      }
    }
    if (typeof options.reactiveMusic === 'boolean') {
      this.useReactiveMusic = options.reactiveMusic;
    }
    if (typeof options.enhancedPostProcess === 'boolean') {
      this.bloomEnabled = options.enhancedPostProcess;
    }
  }

  initReactiveMusic(_audioContext: AudioContext, _masterGain: GainNode): void {
    this.useReactiveMusic = false;
  }

  toggleGlitch(): void {
    this.useGlitch = !this.useGlitch;
  }

  toggleBloom(_enabled?: boolean): void {
    this.bloomEnabled = !this.bloomEnabled;
  }

  setWireframe(_enabled: boolean): void {}

  renderPiece(ctx: CanvasRenderingContext2D, piece: Piece | null, blockSize = 20): void {
    renderPieceImpl(ctx, piece, this.currentTheme, blockSize);
  }

  showFloatingText(text: string, subText = ''): void {
    handleShowFloatingText(this, text, subText);
  }

  renderMainScreen(state: GameState): void {
    handleRenderMainScreen(this, state);
    this.syncPlayfieldToCpp();
  }

  renderPlayfield_WebGPU(_state: GameState): void {}

  renderEndScreen(state: GameState): void {
    handleRenderEndScreen(this, state);
  }

  renderPauseScreen(): void {
    handleRenderPauseScreen(this);
  }

  onLineClear(lines: number[], tSpin = false, combo = 0, backToBack = false, isAllClear = false): void {
    handleLineClear(this, lines, tSpin, combo, backToBack, isAllClear);
  }

  onLock(isTSpin = false): void {
    handleLock(this, isTSpin);
  }

  onHardDrop(x: number, ghostY: number, dropDist: number, colorIdx: number): void {
    handleHardDrop(this, x, ghostY, dropDist, colorIdx);
  }

  onMove(x: number, y: number): void {
    handleMove(this, x, y);
  }

  onRotate(): void {
    handleRotate(this);
  }

  onHold(): void {
    handleHold(this);
  }

  triggerNeonBloomFlashEffects(intensity: number): void {
    this.visualEffects.triggerNeonBloomFlash?.(intensity);
  }

  onLineClearReactive(lines: number, combo: number, isTSpin: boolean, isAllClear: boolean): void {
    onLineClearReactiveImpl(this as any, lines, combo, isTSpin, isAllClear);
  }

  onTSpinReactive(): void {
    onTSpinReactiveImpl(this as any);
  }

  onPerfectClearReactive(): void {
    onPerfectClearReactiveImpl(this as any);
  }

  onLevelUpReactive(level: number): void {
    onLevelUpReactiveImpl(this as any, level);
  }

  onGameOverReactive(): void {
    onGameOverReactiveImpl(this as any);
  }

  render(dt: number): void {
    if (!this.ready) return;

    const clampedDt = Math.min(dt, 0.1);
    this.visualEffects.updateEffects(clampedDt);

    if (this.cppModuleReady) {
      this.cppRender(clampedDt);
    } else {
      this.placeholderRender();
    }
  }
}
