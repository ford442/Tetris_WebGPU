import * as Matrix from "gl-matrix";
import { LINE_CLEAR_RESULTS_BYTE_SIZE } from './webgpu/compute.js';
import { JellyfishParticleSystem } from './webgpu/jellyfishParticles.js';
import {
  BOARD_WORLD_CENTER_X,
  BOARD_WORLD_CENTER_Y,
} from './webgpu/renderMetrics.js';
import { themes, type ThemeColors, type Themes } from './webgpu/themes.js';
import type { IView } from './view/IView.js';
import type { ViewEventHost, WebGPUViewHost } from './view/viewTypes.js';
import type { MaterialViewLike } from './webgpu/viewMaterials.js';
import type { ViewLike } from './webgpu/viewPremium.js';
import type { GameState } from './game/gameState.js';
import { createEmptyGameState } from './game/gameState.js';
import type { Piece } from './game/pieces.js';
import { ParticleSystem } from './webgpu/particles.js';
import { VisualEffects } from './webgpu/effects.js';
import { ReactiveVideoBackground, applyReactiveVideoSources } from './webgpu/reactiveVideo.js';
import { type ReactiveMusicSystem } from './webgpu/reactiveMusic.js';
import { lineFlashEffect } from './effects/lineFlashEffect.js';
import { ParticleMaterialInteraction } from './webgpu/particleMaterialInteraction.js';
import { ChaosModeController } from './webgpu/chaosMode.js';
import { type BloomSystem, type BloomParameters } from './webgpu/bloomSystem.js';
import {
  setPremiumVisualsPreset as setPremiumPresetImpl,
  onLineClearReactive as onLineClearReactiveImpl,
  onTSpinReactive as onTSpinReactiveImpl,
  onPerfectClearReactive as onPerfectClearReactiveImpl,
  onLevelUpReactive as onLevelUpReactiveImpl,
  onGameOverReactive as onGameOverReactiveImpl,
  initReactiveMusic as initReactiveMusicImpl,
  toggleFXAA as toggleFXAAImpl,
  toggleFilmGrain as toggleFilmGrainImpl,
  toggleCRT as toggleCRTImpl,
  toggleBloom as toggleBloomImpl,
  setBloomIntensity as setBloomIntensityImpl,
  toggleMultiPassBloom as toggleMultiPassBloomImpl,
  setBloomParameters as setBloomParametersImpl,
  applyGameSettings as applyGameSettingsImpl,
} from './webgpu/viewPremium.js';
import type { GameSettings } from './config/gameSettings.js';
import { renderLogger } from './utils/logger.js';
import {
  initFrostedGlassBackboard as initFrostedGlassImpl,
  updateFrostedGlassUniforms as updateFrostedGlassUniformsImpl,
} from './webgpu/viewFrostedGlass.js';
import {
  BlockRenderer,
} from './webgpu/renderers/blockRenderer.js';
import { BackgroundRenderer } from './webgpu/renderers/backgroundRenderer.js';
import { PostProcessor } from './webgpu/renderers/postProcessor.js';
import {
  setMaterialTheme as setMaterialThemeImpl,
  updateMaterialUniforms as updateMaterialUniformsImpl,
  cycleTheme as cycleThemeImpl,
  renderPiece as renderPieceImpl,
  setWireframe as setWireframeImpl,
} from './webgpu/viewMaterials.js';
import {
  generateMipmaps as generateMipmapsUtil,
  recreateRenderTargets as recreateRenderTargetsImpl,
} from './webgpu/viewTextures.js';
import {
  onHardDrop as handleHardDrop,
  onHold as handleHold,
  onLineClear as handleLineClear,
  onLock as handleLock,
  onMove as handleMove,
  onRotate as handleRotate,
  renderEndScreen as handleRenderEndScreen,
  renderMainScreen as handleRenderMainScreen,
  renderPauseScreen as handleRenderPauseScreen,
  showFloatingText as handleShowFloatingText,
  triggerImpactEffects as handleImpactEffects,
} from './webgpu/viewGameEvents.js';
import { executeRenderLoop } from './webgpu/viewRenderLoop.js';
import { acquireGpuContext, resizeGpuContext, pushGpuErrorScopes, popGpuErrorScopes } from './webgpu/gpuContext.js';
import { loadBlockTexture, initGpuResources } from './webgpu/viewPipelines.js';
import { GpuPassTimers } from './webgpu/gpuPassTimers.js';
import {
  createAdaptiveControllerState,
  budgetMsForTarget,
  detectFrameBudgetTarget,
  adaptiveDisablesIbl,
  type AdaptiveQualityControllerState,
} from './webgpu/adaptiveQuality.js';
import { PerfOverlay, isPerfOverlayEnabled } from './webgpu/perfOverlay.js';
import type { PerfOverlayAdapterInfo } from './webgpu/perfOverlay.js';
import { loadGameSettings } from './config/gameSettings.js';

export default class View implements IView, ViewEventHost, WebGPUViewHost {
  readonly rendererName = 'webgpu' as const;
  element: HTMLElement;
  width: number;
  height: number;
  nextPieceContext: CanvasRenderingContext2D;
  holdPieceContext: CanvasRenderingContext2D;
  canvasWebGPU: HTMLCanvasElement;
  ctxWebGPU: GPUCanvasContext;
  isWebGPU: { result: boolean; description: string };
  playfildBorderWidth: number;
  playfildX: number;
  playfildY: number;
  playfildWidth: number;
  playfildHeight: number;
  playfildInnerWidth: number;
  playfildInnerHeight: number;
  blockWidth: number;
  blockHeight: number;
  panelX: number;
  panelY: number;
  panelWidth: number;
  panelHeight: number;
  visualX: number = 0;
  visualY: number = 0;
  visualX2: number = 0;
  visualY2: number = 0;
  splitScreen: { active: boolean; stateB: GameState | null; previousActivePieceB: Piece | null } = {
    active: false,
    stateB: null,
    previousActivePieceB: null,
  };
  _previousActivePiece: Piece | null = null;
  state: GameState = createEmptyGameState();
  device!: GPUDevice;
  numberOfVertices!: number;
  vertexBuffer!: GPUBuffer;
  normalBuffer!: GPUBuffer;
  uvBuffer!: GPUBuffer;
  pipeline!: GPURenderPipeline;
  fragmentUniformBuffer!: GPUBuffer;
  MODELMATRIX: Matrix.mat4;
  NORMALMATRIX: Matrix.mat4;
  VIEWMATRIX: Matrix.mat4;
  PROJMATRIX: Matrix.mat4;
  vpMatrix: Matrix.mat4;
  vertexUniformBuffer!: GPUBuffer;
  vertexUniformBuffer_border!: GPUBuffer;
  uniformBindGroup_ARRAY: GPUBindGroup[] = [];
  uniformBindGroup_CACHE: GPUBindGroup[] = [];
  uniformBindGroup_ARRAY_border: GPUBindGroup[] = [];
  blockRenderer!: BlockRenderer;

  useGlitch: boolean = false;
  useParticles: boolean = true;
  useShockwave: boolean = true;
  useFilmGrain: boolean = true;
  useCRT: boolean = false;
  useFXAA: boolean = true;
  _shakeOffsetSmoothed = { x: 0, y: 0 };

  // Grid
  gridPipeline!: GPURenderPipeline;
  gridVertexBuffer!: GPUBuffer;
  gridVertexCount!: number;
  gridBindGroup!: GPUBindGroup;

  // Background specific
  backgroundPipeline!: GPURenderPipeline;
  videoBackgroundPipeline!: GPURenderPipeline;
  backgroundVertexBuffer!: GPUBuffer;
  backgroundUniformBuffer!: GPUBuffer;
  backgroundBindGroup!: GPUBindGroup;
  videoCoverScaleUniformBuffer!: GPUBuffer;
  backgroundRenderer!: BackgroundRenderer;
  startTime: number;

  // Frosted Glass Backboard (Ethereal Hardware Panel)
  frostedGlassPipeline!: GPURenderPipeline;
  frostedGlassVertexBuffer!: GPUBuffer;
  frostedGlassUniformBuffer!: GPUBuffer;
  frostedGlassBindGroup!: GPUBindGroup;
  frostedGlassTexture!: GPUTexture;
  frostedGlassTextureView!: GPUTextureView;
  useFrostedGlass: boolean = true;

  // Post Processing
  postProcessPipeline!: GPURenderPipeline;
  postProcessBindGroup!: GPUBindGroup;
  postProcessUniformBuffer!: GPUBuffer;
  offscreenTexture!: GPUTexture;
  depthTexture!: GPUTexture;
  _bloomInputTexture: GPUTexture | null = null;
  sampler!: GPUSampler;
  postProcessor!: PostProcessor;
  iblSpecularTexture!: GPUTexture;
  iblBrdfLutTexture!: GPUTexture;
  iblSampler!: GPUSampler;
  iblEnabled: boolean = true;
  hdrPlayfield: boolean = false;
  sceneColorFormat!: GPUTextureFormat;
  gpuPowerPreference?: GPUPowerPreference;

  // Render pass caching - GC optimized (lazy init pattern)
  _offscreenTextureView!: GPUTextureView;
  _depthTextureView!: GPUTextureView;
  _backgroundPassDescriptor!: GPURenderPassDescriptor;
  _mainPassDescriptor!: GPURenderPassDescriptor;
  _ppPassDescriptor!: GPURenderPassDescriptor;

  // Particles
  particlePipeline!: GPURenderPipeline;
  particleStorageBuffer!: GPUBuffer;
  particleComputeUniformBuffer!: GPUBuffer;
  particleComputeBindGroup!: GPUBindGroup;
  particleRenderBindGroup!: GPUBindGroup;
  particleComputePipeline!: GPUComputePipeline;
  particleUniformBuffer!: GPUBuffer; // Added missing declaration

  // Clear-dissolve + GPU line detection (GPU-resident board, clear flags, results).
  dissolveBuffer!: GPUBuffer;
  boardBuffer!: GPUBuffer;
  clearFlagsBuffer!: GPUBuffer;
  lineClearResultsBuffer!: GPUBuffer;
  lineClearResultsStaging!: GPUBuffer;
  lineClearComputePipeline!: GPUComputePipeline;
  lineClearComputeBindGroup!: GPUBindGroup;
  lineClearUniformBuffer!: GPUBuffer;
  private _lineClearUniform = new Float32Array(4);   // dt, decayRate, pad2
  private _boardSyncScratch = new Uint32Array(200);
  private _clearFlagsScratch = new Uint32Array(20);
  private _lineClearResultsReset = new Uint32Array(21); // clearedCount + mask[20]
  private _lineClearActiveTimer = 0;                   // seconds remaining of active fade
  private _lineClearFadeSeconds = 0.3;
  /** True once line-clear compute pipeline + buffers are initialized */
  gpuLineClearReady = false;

  // Subsystems
  particleSystem: ParticleSystem;
  jellyfishSystem: JellyfishParticleSystem; // NEW: Bioluminescent jellyfish
  visualEffects: VisualEffects;

  // Themes
  themes: Themes = themes;
  currentTheme: ThemeColors = themes.imageSampled;

  // Block Texture and Sampler
  blockTexture!: GPUTexture;
  blockSampler!: GPUSampler;
  /** True when block.png loaded; false when procedural/solid fallback is in use. */
  authoredBlockTextureLoaded: boolean = false;

  // Pre-allocated Float32Arrays for reduced GC pressure
  _f32_1 = new Float32Array(1);
  _f32_2 = new Float32Array(2);
  _f32_3 = new Float32Array(3);
  _f32_4 = new Float32Array(4);
  _f32_8 = new Float32Array(8);
  _f32_12 = new Float32Array(12);
  _camEye = new Float32Array(3);
  _camTarget = new Float32Array([BOARD_WORLD_CENTER_X, BOARD_WORLD_CENTER_Y, 0.0]);
  _camUp = new Float32Array([0.0, 1.0, 0.0]);

  // Material properties for premium rendering
  materialUniformBuffer!: GPUBuffer;
  usePremiumMaterials: boolean = false;
  currentMaterial: any = null;
  useWireframe: boolean = false;  // wireframe option for block pipeline (edges only, neon, transparent interior)

  // NEW: Supersampling / Render Scale (1.0 = native, 1.5 = 1.5x, 2.0 = 2x)
  renderScale: number = 1.0;
  useEnhancedPostProcess: boolean = true;
  bloomEnabled: boolean = true;
  bloomIntensity: number = 1.0;

  // NEW: Reactive Systems
  reactiveVideoBackground!: ReactiveVideoBackground;
  reactiveMusicSystem!: ReactiveMusicSystem;
  useReactiveVideo: boolean = true;
  useReactiveMusic: boolean = true;

  // NEW: Agent 2 - Particle-Material Interaction
  particleMaterialInteraction!: ParticleMaterialInteraction;
  useParticleInteraction: boolean = true;

  // NEW: Agent 3 - Chaos Mode
  chaosMode!: ChaosModeController;
  useChaosMode: boolean = false;

  // NEW: Multi-pass Bloom System
  bloomSystem!: BloomSystem;
  useMultiPassBloom: boolean = true; // Toggle between old and new bloom

  // GPU pass timers + adaptive quality + perf overlay
  passTimers: GpuPassTimers | null = null;
  adaptiveState: AdaptiveQualityControllerState | null = null;
  perfOverlay: PerfOverlay | null = null;
  userGameSettings: GameSettings | null = null;
  frameBudgetMs: number = budgetMsForTarget('FPS_60');
  adaptiveParticleCap: number = 0;
  gpuAdapterInfo: PerfOverlayAdapterInfo | null = null;

  // NEW: Explicit uniform binding for Neon Burst (Neon Bricklayer)
  neonBurstUniform: Float32Array = new Float32Array([0]);

  // Fresnel Rim Lighting uniform (new for Neon Bricklayer task)
  fresnelParamsUniform!: GPUBuffer;
  fresnelParams = {
      intensity: 0.65,
      fresnelPower: 2.8,
      hardDropBoost: 0,
      _pad1: 0,
  };

  lastEffectCounter = -1;
  lastScore = -1;
  _hardDropBoostTimer: number = 0;
  _neonHyperInversionTimer: number = 0;

  // Pre-allocated object for post process parameters to avoid GC
  _postProcessParams = {
    time: 0,
    useGlitch: 0,
    shockwaveCenter: [0, 0] as [number, number],
    shockwaveTime: 0,
    blackHoleTime: 0,
    blackHoleCenter: [0, 0] as [number, number],
    shockwaveParams: [0, 0, 0, 0] as [number, number, number, number],
    level: 0,
    warpSurge: 0,
    enableFXAA: 0,
    enableBloom: 0,
    enableFilmGrain: 1.0,
    enableCRT: 0.0,
    bloomIntensity: 1.0,
    bloomThreshold: 0.35,
    materialAwareBloom: 0,
    screenResolution: [0, 0] as [number, number],
    aberrationPulse: 0,  // hard drop 300ms chromatic spike -> u_aberrationPulse
    hardDropBoost: 0,
    dangerLevel: 0,      // board height fill ratio 0-1 for danger vignette (postProcess)
    lineClearLaserY: [0, 0, 0, 0] as [number, number, number, number],
    lineClearLaserIntensity: 0,
    neonBurst: 0,        // hard-drop radial glow/distortion (Neon Bricklayer)
    neonHyperInversionTime: 0, // Inversion effect on Tetris
  };

  constructor(element: HTMLElement, width: number, height: number, rows: number, coloms: number, nextPieceContext: CanvasRenderingContext2D, holdPieceContext: CanvasRenderingContext2D) {
    this.element = element;
    this.width = width;
    this.height = height;
    this.nextPieceContext = nextPieceContext;
    this.holdPieceContext = holdPieceContext;
    this.startTime = performance.now();

    // Initialize subsystems
    this.particleSystem = new ParticleSystem();
    this.jellyfishSystem = new JellyfishParticleSystem(); // NEW: Jellyfish for underwater level
    this.visualEffects = new VisualEffects(element, width, height);
    
    // NEW: Initialize reactive systems
    this.reactiveVideoBackground = new ReactiveVideoBackground(element, width, height);
    // Music system initialized in preRender after audio context is ready

    // NEW: Initialize particle-material interaction
    this.particleMaterialInteraction = new ParticleMaterialInteraction();

    // NEW: Initialize chaos mode
    this.chaosMode = new ChaosModeController();
    this.backgroundRenderer = new BackgroundRenderer(this);
    this.blockRenderer = new BlockRenderer(this);
    this.postProcessor = new PostProcessor(this);

    this.canvasWebGPU = document.createElement("canvas");
    this.canvasWebGPU.id = "canvaswebgpu";
    this.canvasWebGPU.style.position = 'absolute';
    this.canvasWebGPU.style.top = '0';
    this.canvasWebGPU.style.left = '0';
    this.canvasWebGPU.style.zIndex = '2';
    this.canvasWebGPU.style.pointerEvents = 'none';
    this.canvasWebGPU.width = this.width;
    this.canvasWebGPU.height = this.height;

    this.ctxWebGPU = this.canvasWebGPU.getContext("webgpu") as GPUCanvasContext;
    this.isWebGPU = this.CheckWebGPU();

    this.playfildBorderWidth = 4;
    this.playfildX = this.playfildBorderWidth + 1;
    this.playfildY = this.playfildBorderWidth + 1;
    this.playfildWidth = (this.width * 2) / 3;
    this.playfildHeight = this.height;
    this.playfildInnerWidth = this.playfildWidth - this.playfildBorderWidth * 2;
    this.playfildInnerHeight = this.playfildHeight - this.playfildBorderWidth * 2 - 2;

    this.blockWidth = this.playfildInnerWidth / coloms;
    this.blockHeight = this.playfildInnerHeight / rows;

    this.panelX = this.playfildWidth + 10;
    this.panelY = 0;
    this.panelWidth = this.width / 3;
    this.panelHeight = this.height;

    this.state = createEmptyGameState();
    this.MODELMATRIX = Matrix.mat4.create();
    this.NORMALMATRIX = Matrix.mat4.create();
    this.VIEWMATRIX = Matrix.mat4.create();
    this.PROJMATRIX = Matrix.mat4.create();
    this.vpMatrix = Matrix.mat4.create();
    if (this.isWebGPU.result) {
      this.element.appendChild(this.canvasWebGPU);
      window.addEventListener('resize', this.resize.bind(this));
    } else {
      let divError = document.createElement("div");
      divError.innerText = this.isWebGPU.description;
      this.element.appendChild(divError);
    }
  }

  static async create(element: HTMLElement, width: number, height: number, rows: number, coloms: number, nextPieceContext: CanvasRenderingContext2D, holdPieceContext: CanvasRenderingContext2D): Promise<View> {
    const view = new View(element, width, height, rows, coloms, nextPieceContext, holdPieceContext);
    if (view.isWebGPU.result) {
      await view.preRender();
    }
    return view;
  }

  resize() { resizeGpuContext(this); }

  recreateRenderTargets() { void recreateRenderTargetsImpl(this); } // Note: recreateRenderTargetsImpl is now async

  // NEW: Set render scale (1.0 = native, 1.5 = 1.5x, 2.0 = 2x supersampling)
  setRenderScale(scale: number) {
    this.renderScale = Math.max(0.5, Math.min(2.0, scale));
    this.resize();
    renderLogger.info(`Scale set to ${this.renderScale}x (${this.canvasWebGPU.width}x${this.canvasWebGPU.height})`);
  }

  toggleGlitch() {
    this.useGlitch = !this.useGlitch;
  }

  setTheme(themeName: keyof Themes) {
    this.currentTheme = this.themes[themeName];
    this.visualEffects.currentLevel = 0;

    if (this.useReactiveVideo && this.reactiveVideoBackground && this.currentTheme.levelVideos) {
        applyReactiveVideoSources(
          this.reactiveVideoBackground,
          this.currentTheme.levelVideos,
          0,
          true,
        );
    }

    if (this.device) {
        void this.renderPlayfield_Border_WebGPU();
        const bgColors = this.currentTheme.backgroundColors;
        this.backgroundRenderer.setThemeColors(bgColors as [number, number, number][]);
    }

    this.setMaterialTheme(themeName);
  }

  renderPiece(ctx: CanvasRenderingContext2D, piece: Piece | null, blockSize: number = 20) {
    renderPieceImpl(ctx, piece, this.currentTheme, blockSize);
  }

  showFloatingText(text: string, subText: string = "") {
      handleShowFloatingText(this, text, subText);
  }

  onLineClear(lines: number[], tSpin: boolean = false, combo: number = 0, backToBack: boolean = false, isAllClear: boolean = false) {
      // Trigger DOM-based line flash effect
      lineFlashEffect.flashLines(lines);

      // Push cleared rows to the GPU clearFlags buffer (compute re-arms dissolve to 1.0).
      this.triggerLineClear(lines);

      // Trigger the main line clear effects
      handleLineClear(this, lines, tSpin, combo, backToBack, isAllClear);
  }

  onLock(isTSpin: boolean = false) { handleLock(this, isTSpin); }
  onHold() { handleHold(this); }
  onRotate() { handleRotate(this); }
  triggerImpactEffects(worldX: number, impactY: number, distance: number) {
      handleImpactEffects(this, worldX, impactY, distance);
  }
  onHardDrop(x: number, y: number, distance: number, colorIdx: number = 0) {
      handleHardDrop(this, x, y, distance, colorIdx);
  }

  triggerNeonBloomFlash(strength: number = 1.0) {
    this.visualEffects.triggerNeonBloomFlash(strength);
  }

  // We added neonBloomFlash to visualEffects for smooth exponential decay per frame.
  // This helper enables components to directly trigger the flash through the view.
  triggerNeonBloomFlashEffects(strength: number = 1.0) {
    this.visualEffects.triggerNeonBloomFlash(strength);
  }

  triggerBackgroundResonance(intensity: number, _durationMs: number = 280) {
    this.visualEffects.triggerBackgroundResonance(intensity);
  }
  renderMainScreen(state: GameState) { handleRenderMainScreen(this, state); }
  renderEndScreen(state: GameState) { handleRenderEndScreen(this, state); }
  renderPauseScreen() { handleRenderPauseScreen(this); }
  onMove(x: number, y: number) { handleMove(this, x, y); }

  generateMipmaps(texture: GPUTexture, width: number, height: number, mipLevelCount: number) {
    generateMipmapsUtil(this.device, texture, width, height, mipLevelCount);
  }

  async preRender() {
    const presentationFormat = await acquireGpuContext(this);
    if (!presentationFormat) return;

    this.passTimers = new GpuPassTimers(this.device);
    this.adaptiveState = createAdaptiveControllerState();
    this.userGameSettings = loadGameSettings();
    this.frameBudgetMs = budgetMsForTarget(detectFrameBudgetTarget());

    const showPerf = this.userGameSettings.showPerfOverlay || isPerfOverlayEnabled();
    this.perfOverlay = new PerfOverlay(this.element);
    this.perfOverlay.setVisible(showPerf);

    await this.captureGpuAdapterInfo();

    await loadBlockTexture(this);

    // Scope pipeline/buffer creation so WGSL + allocation failures are logged
    // with actionable context instead of surfacing as opaque uncaptured errors.
    pushGpuErrorScopes(this, 'GPU resource setup');
    try {
      await initGpuResources(this, presentationFormat);
    } finally {
      await popGpuErrorScopes(this);
    }

    if (this.userGameSettings) {
      this.applyGameSettings(this.userGameSettings);
    }
  }

  private async captureGpuAdapterInfo(): Promise<void> {
    if (!navigator.gpu) return;
    try {
      const adapter = await navigator.gpu.requestAdapter();
      if (!adapter) return;
      type AdapterInfoCapable = GPUAdapter & {
        requestAdapterInfo?: () => Promise<GPUAdapterInfo>;
        info?: GPUAdapterInfo;
      };
      const capable = adapter as AdapterInfoCapable;
      const info = capable.requestAdapterInfo
        ? await capable.requestAdapterInfo()
        : capable.info;
      if (!info) return;
      this.gpuAdapterInfo = {
        vendor: info.vendor,
        architecture: info.architecture,
        device: info.device,
        description: info.description,
      };
    } catch {
      /* adapter info is optional for overlay */
    }
  }

  CreateGPUBuffer(device: any, data: any, usageFlag = GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST) {
    const buffer = device.createBuffer({ size: data.byteLength, usage: usageFlag, mappedAtCreation: true });
    new Float32Array(buffer.getMappedRange()).set(data);
    buffer.unmap();
    return buffer;
  }

  // Frosted glass backboard (delegated to viewFrostedGlass.ts)
  async initFrostedGlassBackboard() {
    if (!this.device) return;
    const res = await initFrostedGlassImpl(this.device, this.canvasWebGPU, this.CreateGPUBuffer, this.sceneColorFormat);
    this.frostedGlassPipeline = res.frostedGlassPipeline;
    this.frostedGlassVertexBuffer = res.frostedGlassVertexBuffer;
    this.frostedGlassUniformBuffer = res.frostedGlassUniformBuffer;
    this.frostedGlassTexture = res.frostedGlassTexture;
    this.frostedGlassTextureView = res.frostedGlassTextureView;
  }

  updateFrostedGlassUniforms() {
    if (!this.device || !this.useFrostedGlass) return;
    this.frostedGlassBindGroup = updateFrostedGlassUniformsImpl(
      this.device, this.frostedGlassPipeline, this.frostedGlassUniformBuffer,
      this.sampler, this.frostedGlassTextureView,
      this.vpMatrix as Float32Array, this.currentTheme.border
    );
  }

  public setFresnelBoost(boost: number) {
      this.fresnelParams.hardDropBoost = boost;
  }

  render(dt: number) {
    // Decay Fresnel boost if any
    if (this.fresnelParams.hardDropBoost > 0) {
      this.fresnelParams.hardDropBoost *= Math.exp(-dt * 10.0);
      if (this.fresnelParams.hardDropBoost < 0.01) {
        this.fresnelParams.hardDropBoost = 0;
      }
    }
    if (this.device) {
      this.device.queue.writeBuffer(
          this.fresnelParamsUniform,
          0,
          new Float32Array([
              this.fresnelParams.intensity,
              this.fresnelParams.fresnelPower,
              this.fresnelParams.hardDropBoost,
              0
          ])
      );
    }

    executeRenderLoop(this, dt);
  }

  /** Upload CPU playfield (Int8Array 200) to the GPU-resident board buffer. */
  syncBoardToGPU(playfield: Int8Array) {
    if (!this.device || !this.boardBuffer) return;
    for (let i = 0; i < 200; i++) {
      this._boardSyncScratch[i] = playfield[i] > 0 ? playfield[i] : 0;
    }
    this.device.queue.writeBuffer(this.boardBuffer, 0, this._boardSyncScratch);
  }

  private resetLineClearResults() {
    if (!this.device) return;
    this._lineClearResultsReset.fill(0);
    this.device.queue.writeBuffer(this.lineClearResultsBuffer, 0, this._lineClearResultsReset);
  }

  private writeLineClearUniforms(dt: number) {
    this._lineClearUniform[0] = dt;
    this._lineClearUniform[1] = 1.0 / this._lineClearFadeSeconds;
    this.device.queue.writeBuffer(this.lineClearUniformBuffer, 0, this._lineClearUniform);
  }

  /**
   * GPU line detection after piece lock. Syncs board, dispatches compute, readbacks
   * the tiny results buffer (clearedCount + 20-row mask). CPU still owns compaction.
   */
  async detectLinesGpu(playfield: Int8Array): Promise<number[]> {
    if (!this.gpuLineClearReady) return [];

    this.syncBoardToGPU(playfield);
    this.resetLineClearResults();
    this.writeLineClearUniforms(0);

    const encoder = this.device.createCommandEncoder({ label: 'line-detect encoder' });
    const pass = encoder.beginComputePass({ label: 'line-detect pass' });
    pass.setPipeline(this.lineClearComputePipeline);
    pass.setBindGroup(0, this.lineClearComputeBindGroup);
    pass.dispatchWorkgroups(Math.ceil(200 / 64));
    pass.end();
    encoder.copyBufferToBuffer(
      this.lineClearResultsBuffer, 0,
      this.lineClearResultsStaging, 0,
      LINE_CLEAR_RESULTS_BYTE_SIZE,
    );
    this.device.queue.submit([encoder.finish()]);

    await this.device.queue.onSubmittedWorkDone();
    await this.lineClearResultsStaging.mapAsync(GPUMapMode.READ);
    const mapped = new Uint32Array(this.lineClearResultsStaging.getMappedRange());
    const lines: number[] = [];
    for (let r = 0; r < 20; r++) {
      if (mapped[1 + r]) lines.push(r);
    }
    this.lineClearResultsStaging.unmap();

    if (lines.length > 0) {
      this._lineClearActiveTimer = this._lineClearFadeSeconds;
    }
    return lines;
  }

  // Write cleared-row flags to the GPU storage buffer and arm the fade window.
  triggerLineClear(lines: number[]) {
    if (!lines || lines.length === 0 || !this.device || !this.clearFlagsBuffer) return;
    this._clearFlagsScratch.fill(0);
    for (const row of lines) {
      if (row >= 0 && row < 20) this._clearFlagsScratch[row] = 1;
    }
    this.device.queue.writeBuffer(this.clearFlagsBuffer, 0, this._clearFlagsScratch);
    this._lineClearActiveTimer = this._lineClearFadeSeconds;
  }

  // Run line-clear + dissolve compute while the post-clear fade is active.
  dispatchLineClearAndDissolve(
    commandEncoder: GPUCommandEncoder,
    dt: number,
    passTimers?: GpuPassTimers,
  ) {
    if (!this.gpuLineClearReady || this._lineClearActiveTimer <= 0) return;
    this._lineClearActiveTimer = Math.max(0, this._lineClearActiveTimer - dt);
    this.writeLineClearUniforms(dt);

    const pass = commandEncoder.beginComputePass({ label: 'line-clear dissolve pass' });
    passTimers?.beginRegion(pass, 'dissolveCompute');
    pass.setPipeline(this.lineClearComputePipeline);
    pass.setBindGroup(0, this.lineClearComputeBindGroup);
    pass.dispatchWorkgroups(Math.ceil(200 / 64));
    passTimers?.endRegion(pass, 'dissolveCompute');
    pass.end();
  }

  /** @deprecated Use triggerLineClear */
  triggerDissolve(lines: number[]) {
    this.triggerLineClear(lines);
  }

  /** @deprecated Use dispatchLineClearAndDissolve */
  dispatchDissolveCompute(commandEncoder: GPUCommandEncoder, dt: number) {
    this.dispatchLineClearAndDissolve(commandEncoder, dt);
  }

  // Pre-allocated buffer for batched uniform updates (max 200 blocks * 64 floats per block)
  _uniformBatchBuffer = new Float32Array(200 * 64);

  // Playfield rendering (delegated to viewPlayfield.ts)
  async renderPlayfield_WebGPU(state: GameState) {
    this.blockRenderer.updateUniforms(state);
  }

  async renderPlayfield_Border_WebGPU() {
    this.blockRenderer.refreshBorder();
  }

  CheckWebGPU() {
    let description = "Great, your current browser supports WebGPU!";
    let result = true;
    if (!navigator.gpu) {
      description = `Your current browser does not support WebGPU! Make sure you are on a system with WebGPU enabled.`;
      result = false;
    }
    return { result, description };
  }

  // Material uniforms buffer (used by viewMaterials.ts)
  _materialUniforms = new Float32Array(12);

  // Particle interaction uniforms
  particleInteractionUniforms = {
    particleInfluence: 1.0,
    glassDistortion: 0.4,
    goldSpecularBoost: 2.2,
    cyberEmissivePulse: 0.0
  };

  // Material/theme management (delegated to viewMaterials.ts)
  setMaterialTheme(themeName: string, pieceType: number = 1) { setMaterialThemeImpl(this as MaterialViewLike, themeName, pieceType); }
  updateMaterialUniforms() { updateMaterialUniformsImpl(this as MaterialViewLike); }
  cycleTheme() { cycleThemeImpl(this as MaterialViewLike); }
  setWireframe(enabled: boolean) { setWireframeImpl(this as MaterialViewLike, enabled); }  // wireframe for blocks (see viewMaterials)

  // Premium visuals and reactive system hooks (delegated to viewPremium.ts)
  setPremiumVisualsPreset(options: Record<string, unknown> = {}) { setPremiumPresetImpl(this as ViewLike, options); }
  onLineClearReactive(lines: number, combo: number, isTSpin: boolean, isAllClear: boolean) { onLineClearReactiveImpl(this as ViewLike, lines, combo, isTSpin, isAllClear); }
  onTSpinReactive() { onTSpinReactiveImpl(this as ViewLike); }
  onPerfectClearReactive() { onPerfectClearReactiveImpl(this as ViewLike); }
  onLevelUpReactive(level: number) { onLevelUpReactiveImpl(this as ViewLike, level); }
  onGameOverReactive() { onGameOverReactiveImpl(this as ViewLike); }
  initReactiveMusic(audioContext: AudioContext, masterGain: GainNode) { initReactiveMusicImpl(this as ViewLike, audioContext, masterGain); }
  toggleFXAA(enabled: boolean) { toggleFXAAImpl(this as ViewLike, enabled); }
  toggleFilmGrain(enabled: boolean) { toggleFilmGrainImpl(this as ViewLike, enabled); }
  toggleCRT(enabled: boolean) { toggleCRTImpl(this as ViewLike, enabled); }
  toggleBloom(enabled?: boolean) { toggleBloomImpl(this as ViewLike, enabled); }
  setBloomIntensity(intensity: number) { setBloomIntensityImpl(this as ViewLike, intensity); }
  toggleMultiPassBloom() { return toggleMultiPassBloomImpl(this as ViewLike); }
  setBloomParameters(params: Partial<BloomParameters>) { setBloomParametersImpl(this as ViewLike, params); }
  applyGameSettings(settings: GameSettings) {
    this.userGameSettings = { ...settings };
    if (this.adaptiveState) {
      this.adaptiveState.stepIndex = 0;
      this.adaptiveState.emaMs = 0;
      this.adaptiveState.consecutiveOver = 0;
      this.adaptiveState.consecutiveUnder = 0;
    }
    if (this.perfOverlay) {
      this.perfOverlay.setVisible(settings.showPerfOverlay || isPerfOverlayEnabled());
    }
    applyGameSettingsImpl(this as ViewLike, settings);
  }

  /** Runtime adaptive reductions — does not mutate saved user baseline or adaptive step. */
  applyAdaptiveSettings(settings: GameSettings, particleCap: number) {
    applyGameSettingsImpl(this as ViewLike, settings);
    this.particleSystem.maxParticles = particleCap;
    this.adaptiveParticleCap = particleCap;
    const step = this.adaptiveState?.stepIndex ?? 0;
    this.iblEnabled = !(this.gpuPowerPreference === 'low-power' || settings.quality === 'low' || adaptiveDisablesIbl(step));
  }
}
