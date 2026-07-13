import * as Matrix from 'gl-matrix';
import type { GameState } from '../game/gameState.js';
import { createEmptyGameState } from '../game/gameState.js';
import type { Piece } from '../game/pieces.js';
import type { IView } from '../view/IView.js';
import type { ViewEventHost } from '../view/viewTypes.js';
import { buildPlayfieldInstances } from '../view/playfieldInstances.js';
import { GLBlockRenderer } from './glBlockRenderer.js';
import { themes, type ThemeColors, type Themes } from '../webgpu/themes.js';
import {
  BOARD_WORLD_CENTER_X,
  BOARD_WORLD_CENTER_Y,
} from '../webgpu/renderMetrics.js';
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
import { renderPiece as renderPieceImpl } from '../webgpu/viewMaterials.js';
import { renderLogger } from '../utils/logger.js';

const glMatrix = Matrix;

const noopParticleSystem = {
  emitParticles: () => {},
  emitParticlesRadial: () => {},
  emitLineClearShards: () => {},
  maxParticles: 0,
};

export default class ViewWebGL2 implements IView, ViewEventHost {
  readonly rendererName = 'webgl2' as const;

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
  useReactiveVideo = true;
  useReactiveMusic = false;
  bloomEnabled = false;
  useWireframe = false;
  authoredBlockTextureLoaded = false;
  lastEffectCounter = -1;
  lastScore = -1;

  private gl!: WebGL2RenderingContext;
  private blockRenderer!: GLBlockRenderer;
  private ready = false;
  private startTime = performance.now();

  private visualX = 0;
  private visualY = 0;
  private _previousActivePiece: Piece | null = null;
  private _shakeOffsetSmoothed = { x: 0, y: 0 };

  private VIEWMATRIX = glMatrix.mat4.create();
  private PROJMATRIX = glMatrix.mat4.create();
  private vpMatrix = glMatrix.mat4.create();
  private _camEye = glMatrix.vec3.fromValues(0, BOARD_WORLD_CENTER_Y + 2, 75);
  private _camTarget = glMatrix.vec3.fromValues(BOARD_WORLD_CENTER_X, BOARD_WORLD_CENTER_Y, 0);
  private _camUp = glMatrix.vec3.fromValues(0, 1, 0);
  private _lightPos = glMatrix.vec3.fromValues(12, 18, 28);

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
    this.canvasWebGPU.width = width;
    this.canvasWebGPU.height = height;

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
  ): Promise<ViewWebGL2> {
    const view = new ViewWebGL2(element, width, height, rows, cols, nextPieceContext, holdPieceContext);
    await view.init();
    return view;
  }

  private async init(): Promise<void> {
    const gl = this.canvasWebGPU.getContext('webgl2', {
      alpha: true,
      premultipliedAlpha: true,
      antialias: true,
    });
    if (!gl) {
      throw new Error('WebGL2 is not available in this browser.');
    }
    this.gl = gl;
    this.blockRenderer = new GLBlockRenderer(gl);
    this.authoredBlockTextureLoaded = await this.blockRenderer.init(import.meta.url);
    this.updateProjection();
    this.ready = true;
    this.showRendererBadge();
    renderLogger.info('WebGL2 fallback renderer initialized');
  }

  private showRendererBadge(): void {
    const badge = document.createElement('div');
    badge.id = 'renderer-badge';
    badge.textContent = 'WebGL2';
    badge.style.cssText =
      'position:fixed;bottom:8px;right:8px;z-index:9999;padding:4px 8px;' +
      'font:12px monospace;background:rgba(0,0,0,0.55);color:#8cf;border-radius:4px;pointer-events:none;';
    document.body.appendChild(badge);
  }

  resize(): void {
    const dpr = window.devicePixelRatio || 1;
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.canvasWebGPU.width = Math.floor(this.width * dpr);
    this.canvasWebGPU.height = Math.floor(this.height * dpr);
    this.canvasWebGPU.style.width = `${this.width}px`;
    this.canvasWebGPU.style.height = `${this.height}px`;
    this.visualEffects.updateVideoPosition(this.width, this.height);
    this.updateProjection();
  }

  private updateProjection(): void {
    if (!this.gl) return;
    this.gl.viewport(0, 0, this.canvasWebGPU.width, this.canvasWebGPU.height);
    glMatrix.mat4.perspective(
      this.PROJMATRIX,
      (42 * Math.PI) / 180,
      this.canvasWebGPU.width / this.canvasWebGPU.height,
      1,
      150,
    );
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
    renderLogger.info('[WebGL2] imageSampled material (block.png)');
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
  }

  initReactiveMusic(): void {
    this.useReactiveMusic = false;
  }

  toggleGlitch(): void {
    this.useGlitch = !this.useGlitch;
  }

  toggleBloom(): void {
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
  }

  /** No-op for WebGL2 — playfield instances are built during render(). */
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

  triggerNeonBloomFlashEffects(_intensity: number): void {}

  render(dt: number): void {
    if (!this.ready || !this.gl) return;

    const clampedDt = Math.min(dt, 0.1);
    this.updatePieceInterpolation(clampedDt);
    this.visualEffects.updateEffects(clampedDt);

    const time = (performance.now() - this.startTime) / 1000;
    this.updateCamera(clampedDt, time);

    const gl = this.gl;
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    const instances = buildPlayfieldInstances(
      this.state,
      this.currentTheme,
      this.visualX,
      this.visualY,
    );

    const textureMix = this.authoredBlockTextureLoaded ? 0.94 : 0.55;

    this.blockRenderer.draw(
      this.vpMatrix as unknown as Float32Array,
      [this._camEye[0], this._camEye[1], this._camEye[2]],
      [this._lightPos[0], this._lightPos[1], this._lightPos[2]],
      textureMix,
      0,
      instances,
    );
  }

  private updatePieceInterpolation(clampedDt: number): void {
    if (this.state?.activePiece) {
      const targetX = this.state.activePiece.x;
      const targetY = this.state.activePiece.y;
      if (this._previousActivePiece !== this.state.activePiece) {
        this.visualX = targetX;
        this.visualY = targetY;
        this._previousActivePiece = this.state.activePiece;
      } else {
        const expDecay = 1.0 / (1.0 + clampedDt * 25.0);
        this.visualX = targetX + (this.visualX - targetX) * expDecay;
        this.visualY = targetY + (this.visualY - targetY) * expDecay;
      }
    } else {
      this._previousActivePiece = null;
    }
  }

  private updateCamera(clampedDt: number, time: number): void {
    let camX = Math.sin(time * 0.2) * 0.5;
    let camY = BOARD_WORLD_CENTER_Y + Math.cos(time * 0.3) * 0.25 + 2.0;
    const shake = this.visualEffects.getShakeOffset();
    const shakeDecay = 1.0 / (1.0 + clampedDt * 10.0);
    this._shakeOffsetSmoothed.x = shake.x + (this._shakeOffsetSmoothed.x - shake.x) * shakeDecay;
    this._shakeOffsetSmoothed.y = shake.y + (this._shakeOffsetSmoothed.y - shake.y) * shakeDecay;
    camX += this._shakeOffsetSmoothed.x;
    camY += this._shakeOffsetSmoothed.y;

    this._camEye[0] = camX;
    this._camEye[1] = camY;
    this._camEye[2] = 75;

    glMatrix.mat4.lookAt(this.VIEWMATRIX, this._camEye, this._camTarget, this._camUp);
    glMatrix.mat4.multiply(this.vpMatrix, this.PROJMATRIX, this.VIEWMATRIX);
  }
}
