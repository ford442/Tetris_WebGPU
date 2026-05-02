import * as Matrix from "gl-matrix";
import {
  PostProcessShaders,
  EnhancedPostProcessShaders,
  MaterialAwarePostProcessShaders,
  PBRBlockShaders,
  UnderwaterBlockShaders,
  ParticleShaders,
  GridShader,
  BackgroundShaders,
  Shaders,
  PremiumBlockShaders,
} from './webgpu/shaders.js';
import { ParticleComputeShader } from './webgpu/compute.js';
import { JellyfishParticleSystem } from './webgpu/jellyfishParticles.js';
import { CubeData, FullScreenQuadData, GridData } from './webgpu/geometry.js';
import {
  BLOCK_WORLD_SIZE,
  BOARD_WORLD_CENTER_X,
  BOARD_WORLD_CENTER_Y,
} from './webgpu/renderMetrics.js';
import { themes, ThemeColors, Themes } from './webgpu/themes.js';
import { ParticleSystem } from './webgpu/particles.js';
import { VisualEffects } from './webgpu/effects.js';
import { ReactiveVideoBackground } from './webgpu/reactiveVideo.js';
import { ReactiveMusicSystem } from './webgpu/reactiveMusic.js';
import { lineClearAnimator } from './effects/lineClearAnimation.js';
import { lineFlashEffect } from './effects/lineFlashEffect.js';
import { ParticleMaterialInteraction } from './webgpu/particleMaterialInteraction.js';
import { ChaosModeController } from './webgpu/chaosMode.js';
import { BloomSystem, BloomParameters } from './webgpu/bloomSystem.js';
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
} from './webgpu/viewPremium.js';
import {
  resolveBlockTextureUrl,
  getTextureMipLevelCount,
} from './webgpu/blockTexture.js';
import { renderLogger, textureLogger, shaderLogger } from './utils/logger.js';
import {
  initFrostedGlassBackboard as initFrostedGlassImpl,
  updateFrostedGlassUniforms as updateFrostedGlassUniformsImpl,
} from './webgpu/viewFrostedGlass.js';
import {
  renderPlayfieldBlocks,
  renderPlayfieldBorder,
} from './webgpu/viewPlayfield.js';
import {
  setMaterialTheme as setMaterialThemeImpl,
  updateMaterialUniforms as updateMaterialUniformsImpl,
  cycleTheme as cycleThemeImpl,
  renderPiece as renderPieceImpl,
} from './webgpu/viewMaterials.js';
import { updateFrameUniforms } from './webgpu/viewUniforms.js';
import { postProcessUniforms } from './webgpu/postProcessUniforms.js';
import {
  generateMipmaps as generateMipmapsUtil,
  createSolidFallbackTexture,
  createProceduralFallbackTexture,
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

const glMatrix = Matrix;

export default class View {
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
  private _previousActivePiece: any = null;
  state: { playfield: number[][], lockTimer?: number, lockDelayTime?: number, level?: number, nextPiece?: any, holdPiece?: any, activePiece?: any, score?: number, lines?: number, effectEvent?: string | null, effectCounter?: number, lastDropPos?: any, lastDropDistance?: number, scoreEvent?: any };
  blockData: any;
  device!: GPUDevice;
  numberOfVertices!: number;
  vertexBuffer!: GPUBuffer;
  normalBuffer!: GPUBuffer;
  uvBuffer!: GPUBuffer;
  pipeline!: GPURenderPipeline;
  fragmentUniformBuffer!: GPUBuffer;
  MODELMATRIX: any;
  NORMALMATRIX: any;
  VIEWMATRIX: any;
  PROJMATRIX: any;
  vpMatrix: any;
  vertexUniformBuffer!: GPUBuffer;
  vertexUniformBuffer_border!: GPUBuffer;
  uniformBindGroup_ARRAY: GPUBindGroup[] = [];
  uniformBindGroup_CACHE: GPUBindGroup[] = [];
  uniformBindGroup_ARRAY_border: GPUBindGroup[] = [];
  x: number = 0;

  lastEffectCounter: number = 0;
  useGlitch: boolean = false;
  private _shakeOffsetSmoothed = {x: 0, y: 0};

  // Grid
  gridPipeline!: GPURenderPipeline;
  gridVertexBuffer!: GPUBuffer;
  gridVertexCount!: number;
  gridBindGroup!: GPUBindGroup;

  // Background specific
  backgroundPipeline!: GPURenderPipeline;
  backgroundVertexBuffer!: GPUBuffer;
  backgroundUniformBuffer!: GPUBuffer;
  backgroundBindGroup!: GPUBindGroup;
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

  // Render pass caching - GC optimized (lazy init pattern)
  private _offscreenTextureView!: GPUTextureView;
  private _depthTextureView!: GPUTextureView;
  private _backgroundPassDescriptor!: GPURenderPassDescriptor;
  private _mainPassDescriptor!: GPURenderPassDescriptor;
  private _ppPassDescriptor!: GPURenderPassDescriptor;

  // Particles
  particlePipeline!: GPURenderPipeline;
  particleStorageBuffer!: GPUBuffer;
  particleComputeUniformBuffer!: GPUBuffer;
  particleComputeBindGroup!: GPUBindGroup;
  particleRenderBindGroup!: GPUBindGroup;
  particleComputePipeline!: GPUComputePipeline;
  particleUniformBuffer!: GPUBuffer; // Added missing declaration
  
  // Subsystems
  particleSystem: ParticleSystem;
  jellyfishSystem: JellyfishParticleSystem; // NEW: Bioluminescent jellyfish
  visualEffects: VisualEffects;

  // Themes
  themes: Themes = themes;
  currentTheme: ThemeColors = themes.neon;

  // Block Texture and Sampler
  blockTexture!: GPUTexture;
  blockSampler!: GPUSampler;

  // Pre-allocated Float32Arrays for reduced GC pressure
  private _f32_1 = new Float32Array(1);
  private _f32_2 = new Float32Array(2);
  private _f32_3 = new Float32Array(3);
  private _f32_4 = new Float32Array(4);
  private _f32_8 = new Float32Array(8);
  private _f32_12 = new Float32Array(12);
  private _camEye = new Float32Array(3);
  private _camTarget = new Float32Array([BOARD_WORLD_CENTER_X, BOARD_WORLD_CENTER_Y, 0.0]);
  private _camUp = new Float32Array([0.0, 1.0, 0.0]);

  // Material properties for premium rendering
  materialUniformBuffer!: GPUBuffer;
  usePremiumMaterials: boolean = false;
  currentMaterial: any = null;

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

  // Pre-allocated object for post process parameters to avoid GC
  private _postProcessParams = {
    time: 0,
    useGlitch: 0,
    shockwaveCenter: [0, 0] as [number, number],
    shockwaveTime: 0,
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
    screenResolution: [0, 0] as [number, number]
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

    this.state = {
      playfield: Array(20).fill(null).map(() => Array(10).fill(0)),
      lockTimer: 0,
      lockDelayTime: 500,
    };
    this.MODELMATRIX = Matrix.mat4.create();
    this.NORMALMATRIX = Matrix.mat4.create();
    this.VIEWMATRIX = Matrix.mat4.create();
    this.PROJMATRIX = Matrix.mat4.create();
    this.vpMatrix = Matrix.mat4.create();
    this.blockData = {};
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

  resize() {
    if (!this.device) return;
    const dpr = window.devicePixelRatio || 1;
    this.width = window.innerWidth;
    this.height = window.innerHeight;

    // NEW: Apply render scale for supersampling
    const scaledWidth = Math.floor(this.width * dpr * this.renderScale);
    const scaledHeight = Math.floor(this.height * dpr * this.renderScale);

    this.canvasWebGPU.width = scaledWidth;
    this.canvasWebGPU.height = scaledHeight;
    // CSS keeps it at screen size, internal resolution is higher
    this.canvasWebGPU.style.width = `${this.width}px`;
    this.canvasWebGPU.style.height = `${this.height}px`;

    this.playfildWidth = (this.width * 2) / 3;
    this.playfildHeight = this.height;
    this.playfildInnerWidth = this.playfildWidth - this.playfildBorderWidth * 2;
    this.playfildInnerHeight = this.playfildHeight - this.playfildBorderWidth * 2 - 2;

    this.visualEffects.updateVideoPosition(this.width, this.height);

    const presentationFormat = navigator.gpu.getPreferredCanvasFormat();

    this.ctxWebGPU.configure({
      device: this.device,
      format: presentationFormat,
      alphaMode: 'premultiplied',
    });

    this.recreateRenderTargets(); // Fire and forget - async is handled internally

    // Resize bloom system (async - GPU syncs before destroying old textures)
    if (this.bloomSystem) {
      const dpr = window.devicePixelRatio || 1;
      this.bloomSystem.resize(
        Math.floor(this.width * dpr * this.renderScale),
        Math.floor(this.height * dpr * this.renderScale)
      ).catch(() => {});
    }
  }

  private recreateRenderTargets() { recreateRenderTargetsImpl(this); } // Note: recreateRenderTargetsImpl is now async

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
        this.reactiveVideoBackground.setVideoSources(this.currentTheme.levelVideos);
        this.reactiveVideoBackground.updateForLevel(0, true);
    }

    if (this.device) {
        this.renderPlayfild_Border_WebGPU();
        const bgColors = this.currentTheme.backgroundColors;
        this._f32_3.set(bgColors[0]);
        this.device.queue.writeBuffer(this.backgroundUniformBuffer, 16, this._f32_3);
        this._f32_3.set(bgColors[1]);
        this.device.queue.writeBuffer(this.backgroundUniformBuffer, 32, this._f32_3);
        this._f32_3.set(bgColors[2]);
        this.device.queue.writeBuffer(this.backgroundUniformBuffer, 48, this._f32_3);
    }
  }

  renderPiece(ctx: CanvasRenderingContext2D, piece: any, blockSize: number = 20) {
    renderPieceImpl(ctx, piece, this.currentTheme, blockSize);
  }

  showFloatingText(text: string, subText: string = "") {
      handleShowFloatingText(this, text, subText);
  }

  onLineClear(lines: number[], tSpin: boolean = false, combo: number = 0, backToBack: boolean = false, isAllClear: boolean = false) {
      // Trigger DOM-based line flash effect
      lineFlashEffect.flashLines(lines);
      
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
  renderMainScreen(state: any) { handleRenderMainScreen(this, state); }
  renderEndScreen(state: any) { handleRenderEndScreen(this, state); }
  renderPauseScreen() { handleRenderPauseScreen(this); }
  onMove(x: number, y: number) { handleMove(this, x, y); }

  generateMipmaps(texture: GPUTexture, width: number, height: number, mipLevelCount: number) {
    generateMipmapsUtil(this.device, texture, width, height, mipLevelCount);
  }

  private createSolidFallbackTexture(): GPUTexture {
    return createSolidFallbackTexture(this.device);
  }

  private createProceduralFallbackTexture(): GPUTexture {
    return createProceduralFallbackTexture(this.device);
  }

  async preRender() {
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) return;
    this.device = await adapter.requestDevice();

    const dpr = window.devicePixelRatio || 1;
    this.canvasWebGPU.width = this.width * dpr;
    this.canvasWebGPU.height = this.height * dpr;

    const presentationFormat = navigator.gpu.getPreferredCanvasFormat();
    this.ctxWebGPU.configure({ device: this.device, format: presentationFormat, alphaMode: 'premultiplied' });

    this.blockSampler = this.device.createSampler({
      magFilter: 'nearest', minFilter: 'nearest', mipmapFilter: 'nearest',
      addressModeU: 'clamp-to-edge', addressModeV: 'clamp-to-edge',
    });

    try {
        const textureUrl = resolveBlockTextureUrl(import.meta.url);
        textureLogger.info('Loading from:', textureUrl);
        const textureLoadTimeoutMs = 10000;

        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.src = textureUrl;

        await new Promise<void>((resolve, reject) => {
          let timeoutId = 0;
          const cleanup = () => {
            window.clearTimeout(timeoutId);
            img.onload = null;
            img.onerror = null;
          };
          timeoutId = window.setTimeout(() => {
            cleanup();
            reject(new Error(`Timed out loading ${textureUrl} after ${textureLoadTimeoutMs}ms`));
          }, textureLoadTimeoutMs);
          img.onload = () => {
            cleanup();
            resolve();
          };
          img.onerror = () => {
            cleanup();
            reject(new Error(`Failed to load ${textureUrl}`));
          };
        });

        // Preserve the authored texture data for direct WebGPU upload without browser-side premultiplication or color transforms.
        const imageBitmap = await createImageBitmap(img, {
          premultiplyAlpha: 'none',
          colorSpaceConversion: 'none',
        });
        const mipLevelCount = getTextureMipLevelCount(imageBitmap.width, imageBitmap.height);
        this.blockTexture = this.device.createTexture({
          size: [imageBitmap.width, imageBitmap.height, 1],
          format: 'rgba8unorm',
          mipLevelCount,
          usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT
        });
        this.device.queue.copyExternalImageToTexture({ source: imageBitmap }, { texture: this.blockTexture }, [imageBitmap.width, imageBitmap.height]);
        this.generateMipmaps(this.blockTexture, imageBitmap.width, imageBitmap.height, mipLevelCount);
        textureLogger.info('Loaded successfully:', imageBitmap.width, 'x', imageBitmap.height, 'mips:', mipLevelCount);
    } catch (e) {
        textureLogger.error('Failed to load block texture:', e);
        try {
          this.blockTexture = this.createProceduralFallbackTexture();
          textureLogger.warn('Using procedural fallback texture');
        } catch (fallbackError) {
          textureLogger.error('Procedural fallback failed, using solid texture:', fallbackError);
          this.blockTexture = this.createSolidFallbackTexture();
        }
    }

    const shader = Shaders();
    const cubeData = CubeData();
    this.numberOfVertices = cubeData.positions.length / 3;
    this.vertexBuffer = this.CreateGPUBuffer(this.device, cubeData.positions);
    this.normalBuffer = this.CreateGPUBuffer(this.device, cubeData.normals);
    this.uvBuffer = this.CreateGPUBuffer(this.device, cubeData.uvs);

    const vertexModule = this.device.createShaderModule({ code: shader.vertex });
    const fragmentModule = this.device.createShaderModule({ code: shader.fragment });
    
    vertexModule.getCompilationInfo().then(info => { if (info.messages.length > 0) shaderLogger.warn('Vertex:', info.messages); });
    fragmentModule.getCompilationInfo().then(info => { if (info.messages.length > 0) shaderLogger.warn('Fragment:', info.messages); });
    
    this.pipeline = this.device.createRenderPipeline({
      label: 'main pipeline', layout: "auto",
      vertex: { module: vertexModule, entryPoint: "main", buffers: [
        { arrayStride: 12, attributes: [{ shaderLocation: 0, format: "float32x3", offset: 0 }] },
        { arrayStride: 12, attributes: [{ shaderLocation: 1, format: "float32x3", offset: 0 }] },
        { arrayStride: 8, attributes: [{ shaderLocation: 2, format: "float32x2", offset: 0 }] },
      ]},
      fragment: { module: fragmentModule, entryPoint: "main", targets: [{ format: presentationFormat, blend: {
        color: { srcFactor: "src-alpha", dstFactor: "one-minus-src-alpha", operation: "add" },
        alpha: { srcFactor: "one", dstFactor: "one-minus-src-alpha", operation: "add" },
      }}]},
      primitive: { topology: "triangle-list" },
      depthStencil: { format: "depth24plus", depthWriteEnabled: true, depthCompare: "less" },
    });

    const backgroundShader = BackgroundShaders();
    const bgData = FullScreenQuadData();
    this.backgroundVertexBuffer = this.CreateGPUBuffer(this.device, bgData.positions);
    this.backgroundPipeline = this.device.createRenderPipeline({
        label: 'background pipeline', layout: 'auto',
        vertex: { module: this.device.createShaderModule({ code: backgroundShader.vertex }), entryPoint: 'main', buffers: [{ arrayStride: 12, attributes: [{ shaderLocation: 0, format: 'float32x3', offset: 0 }] }] },
        fragment: { module: this.device.createShaderModule({ code: backgroundShader.fragment }), entryPoint: 'main', targets: [{ format: presentationFormat }] },
        primitive: { topology: 'triangle-list' }
    });

    this.backgroundUniformBuffer = this.device.createBuffer({ size: 80, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    this.backgroundBindGroup = this.device.createBindGroup({ layout: this.backgroundPipeline.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: this.backgroundUniformBuffer } }] });
    
    // Initialize Frosted Glass Backboard
    await this.initFrostedGlassBackboard();
    
    const bgColors = this.currentTheme.backgroundColors;
    this._f32_3.set(bgColors[0]); this.device.queue.writeBuffer(this.backgroundUniformBuffer, 16, this._f32_3);
    this._f32_3.set(bgColors[1]); this.device.queue.writeBuffer(this.backgroundUniformBuffer, 32, this._f32_3);
    this._f32_3.set(bgColors[2]); this.device.queue.writeBuffer(this.backgroundUniformBuffer, 48, this._f32_3);

    const gridShader = GridShader();
    const gridData = GridData();
    this.gridVertexCount = gridData.length / 3;
    this.gridVertexBuffer = this.CreateGPUBuffer(this.device, gridData);
    this.gridPipeline = this.device.createRenderPipeline({
        label: 'grid pipeline', layout: 'auto',
        vertex: { module: this.device.createShaderModule({ code: gridShader.vertex }), entryPoint: 'main', buffers: [{ arrayStride: 12, attributes: [{ shaderLocation: 0, format: 'float32x3', offset: 0 }] }] },
        fragment: { module: this.device.createShaderModule({ code: gridShader.fragment }), entryPoint: 'main', targets: [{ format: presentationFormat, blend: {
            color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha', operation: 'add' },
            alpha: { srcFactor: 'one', dstFactor: 'one', operation: 'add' },
        }}]},
        primitive: { topology: 'line-list' },
        depthStencil: { format: "depth24plus", depthWriteEnabled: false, depthCompare: "less" }
    });

    this.particleStorageBuffer = this.device.createBuffer({
        size: 64 * this.particleSystem.maxParticles,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
    this.particleComputeUniformBuffer = this.device.createBuffer({ size: 48, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    this.particleComputePipeline = this.device.createComputePipeline({
        label: 'particle compute pipeline', layout: 'auto',
        compute: { module: this.device.createShaderModule({ code: ParticleComputeShader }), entryPoint: 'main' },
    });
    this.particleComputeBindGroup = this.device.createBindGroup({
        layout: this.particleComputePipeline.getBindGroupLayout(0),
        entries: [{ binding: 0, resource: { buffer: this.particleStorageBuffer } }, { binding: 1, resource: { buffer: this.particleComputeUniformBuffer } }]
    });

    const particleShader = ParticleShaders();
    this.particlePipeline = this.device.createRenderPipeline({
        label: 'particle pipeline', layout: 'auto',
        vertex: { module: this.device.createShaderModule({ code: particleShader.vertex }), entryPoint: 'main', buffers: [{
            arrayStride: 64, stepMode: 'instance',
            attributes: [
                { shaderLocation: 0, format: 'float32x3', offset: 0 },
                { shaderLocation: 1, format: 'float32x4', offset: 32 },
                { shaderLocation: 2, format: 'float32', offset: 48 },
                { shaderLocation: 3, format: 'float32', offset: 52 },
                { shaderLocation: 4, format: 'float32', offset: 56 },
                { shaderLocation: 5, format: 'float32x3', offset: 16 },
            ]
        }]},
        fragment: { module: this.device.createShaderModule({ code: particleShader.fragment }), entryPoint: 'main', targets: [{ format: presentationFormat, blend: {
            color: { srcFactor: 'one', dstFactor: 'one', operation: 'add' },
            alpha: { srcFactor: 'one', dstFactor: 'one', operation: 'add' },
        }}]},
        primitive: { topology: 'triangle-list' },
        depthStencil: { format: 'depth24plus', depthWriteEnabled: false, depthCompare: 'less' }
    });

    this.particleUniformBuffer = this.device.createBuffer({ size: 96, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    this.particleRenderBindGroup = this.device.createBindGroup({ layout: this.particlePipeline.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: this.particleUniformBuffer } }] });
    this.gridBindGroup = this.device.createBindGroup({ layout: this.gridPipeline.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: this.particleUniformBuffer } }] });

    const ppShader = this.useEnhancedPostProcess ? MaterialAwarePostProcessShaders() : PostProcessShaders();
    this.postProcessPipeline = this.device.createRenderPipeline({
        label: 'post process pipeline', layout: 'auto',
        vertex: { module: this.device.createShaderModule({ code: ppShader.vertex }), entryPoint: 'main', buffers: [{ arrayStride: 12, attributes: [{ shaderLocation: 0, format: 'float32x3', offset: 0 }] }] },
        fragment: { module: this.device.createShaderModule({ code: ppShader.fragment }), entryPoint: 'main', targets: [{ format: presentationFormat }] },
        primitive: { topology: 'triangle-list' }
    });

    this.postProcessUniformBuffer = this.device.createBuffer({ size: 144, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    this.sampler = this.device.createSampler({ magFilter: 'linear', minFilter: 'linear', mipmapFilter: 'linear', addressModeU: 'clamp-to-edge', addressModeV: 'clamp-to-edge' });

    this.offscreenTexture = this.device.createTexture({
        size: [this.canvasWebGPU.width, this.canvasWebGPU.height, 1],
        format: presentationFormat, usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING
    });
    this._offscreenTextureView = this.offscreenTexture.createView();
    this.depthTexture = this.device.createTexture({ size: [this.canvasWebGPU.width, this.canvasWebGPU.height, 1], format: "depth24plus", usage: GPUTextureUsage.RENDER_ATTACHMENT });
    this._bloomInputTexture = this.device.createTexture({
        size: [this.canvasWebGPU.width, this.canvasWebGPU.height, 1],
        format: presentationFormat,
        usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING
    });
    this._depthTextureView = this.depthTexture.createView();

    // Initialize Pass Descriptors once - GC optimized
    this._backgroundPassDescriptor = {
        colorAttachments: [{ view: this._offscreenTextureView, clearValue: { r: 0.0, g: 0.0, b: 0.0, a: 0.0 }, loadOp: 'clear', storeOp: 'store' }]
    };
    this._mainPassDescriptor = {
      colorAttachments: [{ view: this._offscreenTextureView, loadOp: 'load', storeOp: "store" }],
      depthStencilAttachment: { view: this._depthTextureView, depthClearValue: 1.0, depthLoadOp: 'clear', depthStoreOp: 'store' },
    };
    this._ppPassDescriptor = {
        colorAttachments: [{ view: undefined as any, clearValue: { r: 0.0, g: 0.0, b: 0.0, a: 0.0 }, loadOp: 'clear', storeOp: 'store' }]
    };

    this.postProcessBindGroup = this.device.createBindGroup({
        layout: this.postProcessPipeline.getBindGroupLayout(0),
        entries: [{ binding: 0, resource: { buffer: this.postProcessUniformBuffer } }, { binding: 1, resource: this.sampler }, { binding: 2, resource: this.offscreenTexture.createView() }]
    });

    // Initialize multi-pass bloom system
    this.bloomSystem = new BloomSystem(
      this.device, 
      this.canvasWebGPU.width, 
      this.canvasWebGPU.height
    );
    // Set initial parameters — conservative values to prevent block washout
    this.bloomSystem.setParameters({
      threshold: 0.72,
      intensity: this.bloomIntensity,
      scatter: 0.52,
      clamp: 65472,
      knee: 0.1
    });

    // Expanded to 144 bytes for underwater uniforms (was 96)
    this.fragmentUniformBuffer = this.device.createBuffer({ size: 144, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });

    let eyePosition = [0.0, BOARD_WORLD_CENTER_Y, 75.0];
    let lightPosition = this._f32_3;
    lightPosition.set([-5.0, 0.0, 0.0]);

    Matrix.mat4.identity(this.VIEWMATRIX);
    Matrix.mat4.lookAt(this.VIEWMATRIX, eyePosition, [BOARD_WORLD_CENTER_X, BOARD_WORLD_CENTER_Y, 0.0], [0.0, 1.0, 0.0]);
    Matrix.mat4.identity(this.PROJMATRIX);
    // Increased FOV (42° vs 35°) for more dramatic depth on floating panel
    Matrix.mat4.perspective(this.PROJMATRIX, (42 * Math.PI) / 180, this.canvasWebGPU.width / this.canvasWebGPU.height, 1, 150);
    Matrix.mat4.identity(this.vpMatrix);
    Matrix.mat4.multiply(this.vpMatrix, this.PROJMATRIX, this.VIEWMATRIX);

    this.device.queue.writeBuffer(this.fragmentUniformBuffer, 0, lightPosition);
    this._f32_3.set(eyePosition);
    this.device.queue.writeBuffer(this.fragmentUniformBuffer, 16, this._f32_3);
    this._f32_4.set(this.currentTheme[5] || [1.0, 1.0, 1.0, 1.0]);
    this.device.queue.writeBuffer(this.fragmentUniformBuffer, 32, this._f32_4);
    this._f32_1[0] = this.useGlitch ? 1.0 : 0.0;
    this.device.queue.writeBuffer(this.fragmentUniformBuffer, 52, this._f32_1);

    // Create material uniform buffer for PBR (binding 4) - MUST be before renderPlayfild_Border_WebGPU
    this.materialUniformBuffer = this.device.createBuffer({
      size: 16, // 4 floats: metallic, roughness, transmission, padding
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    // Initialize with default material values
    const materialDefaults = new Float32Array([0.5, 0.3, 0.0, 0.0]); // metallic, roughness, transmission, padding
    this.device.queue.writeBuffer(this.materialUniformBuffer, 0, materialDefaults);

    this.renderPlayfild_Border_WebGPU();

    this.vertexUniformBuffer = this.device.createBuffer({
      size: this.state.playfield.length * 10 * 256,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    const maxBlocks = 200;
    this.uniformBindGroup_CACHE = [];
    for (let i = 0; i < maxBlocks; i++) {
        const bindGroup = this.device.createBindGroup({
            label: `block_bindgroup_${i}`, layout: this.pipeline.getBindGroupLayout(0),
            entries: [
                { binding: 0, resource: { buffer: this.vertexUniformBuffer, offset: i * 256, size: 208 } },
                { binding: 1, resource: { buffer: this.fragmentUniformBuffer, offset: 0, size: 144 } },
                { binding: 2, resource: this.blockTexture.createView({ format: 'rgba8unorm', dimension: '2d', baseMipLevel: 0, mipLevelCount: this.blockTexture.mipLevelCount }) },
                { binding: 3, resource: this.blockSampler },
                { binding: 4, resource: { buffer: this.materialUniformBuffer, offset: 0, size: 16 } }
            ],
        });
        this.uniformBindGroup_CACHE.push(bindGroup);
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
    const res = await initFrostedGlassImpl(this.device, this.canvasWebGPU, this.CreateGPUBuffer);
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

  render(dt: number) {
    if (!this.device) return;

    // Safety cap dt to prevent massive jumps on lag spikes
    const clampedDt = Math.min(dt, 0.1);

    // Smooth Piece Interpolation (Exponential Decay Lerp)
    if (this.state && this.state.activePiece) {
      const targetX = this.state.activePiece.x;
      const targetY = this.state.activePiece.y;

      // If the active piece object reference changed (e.g. piece spawned or held), snap instantly
      if (this._previousActivePiece !== this.state.activePiece) {
        this.visualX = targetX;
        this.visualY = targetY;
        this._previousActivePiece = this.state.activePiece;
      } else {
        const smoothingFactor = 25.0; // Higher = Snappier, Lower = Smoother
        const expDecayPiece = 1.0 / (1.0 + clampedDt * smoothingFactor);
        this.visualX = targetX + (this.visualX - targetX) * expDecayPiece;
        this.visualY = targetY + (this.visualY - targetY) * expDecayPiece;
      }
    } else {
      this._previousActivePiece = null;
    }

    this.visualEffects.updateEffects(clampedDt);
    lineClearAnimator.update(clampedDt);
    const time = (performance.now() - this.startTime) / 1000.0;

    // Camera updates - Ethereal Floating Panel View
    let camX = 0.0 + Math.sin(time * 0.2) * 0.5;
    let camY = BOARD_WORLD_CENTER_Y + Math.cos(time * 0.3) * 0.25 + 2.0; // Slight downward tilt (+2.0 Y offset)
    const shake = this.visualEffects.getShakeOffset();

    // Smooth Camera Shake Interpolation using exponential decay
    const shakeDecay = Math.exp(-clampedDt * 10.0);
    this._shakeOffsetSmoothed.x = shake.x + (this._shakeOffsetSmoothed.x - shake.x) * shakeDecay;
    this._shakeOffsetSmoothed.y = shake.y + (this._shakeOffsetSmoothed.y - shake.y) * shakeDecay;

    camX += this._shakeOffsetSmoothed.x;
    camY += this._shakeOffsetSmoothed.y;

    this._camEye[0] = camX; this._camEye[1] = camY; this._camEye[2] = 75.0;
    Matrix.mat4.lookAt(this.VIEWMATRIX, this._camEye, this._camTarget, this._camUp);
    Matrix.mat4.multiply(this.vpMatrix, this.PROJMATRIX, this.VIEWMATRIX);
    this.device.queue.writeBuffer(this.fragmentUniformBuffer, 16, this._camEye);

    // Particle upload
    if (this.particleSystem.pendingUploadCount > 0) {
        for(let i = 0; i < this.particleSystem.pendingUploadCount; i++) {
            const index = this.particleSystem.pendingUploadIndices[i];
            const offset = i * 16;
            const dataSlice = this.particleSystem.pendingUploads.subarray(offset, offset + 16);
            this.device.queue.writeBuffer(this.particleStorageBuffer, index * 64, dataSlice);
        }
        this.particleSystem.clearPending();
    }

    // Compute uniforms
    const swParams = this.visualEffects.getShockwaveParams();
    const swCenter = this.visualEffects.shockwaveCenter;
    const swTimer = this.visualEffects.shockwaveTimer;
    this._f32_12[0] = dt; this._f32_12[1] = time; this._f32_12[2] = swTimer; this._f32_12[3] = 0.0;
    this._f32_12[4] = swCenter[0]; this._f32_12[5] = swCenter[1]; this._f32_12[6] = 0.0; this._f32_12[7] = 0.0;
    this._f32_12[8] = swParams[0]; this._f32_12[9] = swParams[1]; this._f32_12[10] = swParams[2]; this._f32_12[11] = swParams[3];
    this.device.queue.writeBuffer(this.particleComputeUniformBuffer, 0, this._f32_12);

    const result = updateFrameUniforms(this, dt, time);
    const commandEncoder = result.commandEncoder;
    
    // Check if particles are active from the update result
    if (result.hasActiveParticles) {
        const computePass = commandEncoder.beginComputePass();
        computePass.setPipeline(this.particleComputePipeline);
        computePass.setBindGroup(0, this.particleComputeBindGroup);
        computePass.dispatchWorkgroups(Math.ceil(this.particleSystem.maxParticles / 64));
        computePass.end();
    }

    // Update render uniforms
    this.device.queue.writeBuffer(this.particleUniformBuffer, 0, this.vpMatrix as Float32Array);
    this._f32_1[0] = time;
    this.device.queue.writeBuffer(this.particleUniformBuffer, 64, this._f32_1);

    // Ghost piece
    let ghostX = -100.0, ghostWidth = 0.0, ghostUVX = -1.0, ghostUVW = 0.0;
    if (this.state?.activePiece) {
        const widthInBlocks = this.state.activePiece.blocks[0].length;
        const gridCenterX = this.state.activePiece.x + widthInBlocks / 2.0;
        ghostX = gridCenterX * BLOCK_WORLD_SIZE;
        ghostWidth = widthInBlocks * BLOCK_WORLD_SIZE;
        const camZ = 75.0;
        const fov = (35 * Math.PI) / 180;
        const visibleHeight = 2.0 * Math.tan(fov / 2.0) * camZ;
        const visibleWidth = visibleHeight * (this.canvasWebGPU.width / this.canvasWebGPU.height);
        ghostUVX = 0.5 + (ghostX - BOARD_WORLD_CENTER_X) / visibleWidth;
        ghostUVW = ghostWidth / visibleWidth;
    }
    
    let lockPercent = 0.0;
    if (this.state?.lockTimer !== undefined && this.state?.lockDelayTime) {
        lockPercent = Math.min(this.state.lockTimer / this.state.lockDelayTime, 1.0);
    }

    this._f32_1[0] = ghostX;
    this.device.queue.writeBuffer(this.particleUniformBuffer, 68, this._f32_1);
    this._f32_1[0] = ghostWidth;
    this.device.queue.writeBuffer(this.particleUniformBuffer, 72, this._f32_1);
    this._f32_1[0] = this.visualEffects.warpSurge;
    this.device.queue.writeBuffer(this.particleUniformBuffer, 76, this._f32_1);
    this._f32_1[0] = lockPercent;
    this.device.queue.writeBuffer(this.particleUniformBuffer, 80, this._f32_1);

    // Background uniforms
    this._f32_1[0] = time;
    this.device.queue.writeBuffer(this.backgroundUniformBuffer, 0, this._f32_1);
    this._f32_1[0] = this.visualEffects.currentLevel;
    this.device.queue.writeBuffer(this.backgroundUniformBuffer, 4, this._f32_1);
    this._f32_2[0] = this.canvasWebGPU.width; this._f32_2[1] = this.canvasWebGPU.height;
    this.device.queue.writeBuffer(this.backgroundUniformBuffer, 8, this._f32_2);
    this._f32_1[0] = lockPercent;
    this.device.queue.writeBuffer(this.backgroundUniformBuffer, 64, this._f32_1);
    this._f32_1[0] = this.visualEffects.warpSurge;
    this.device.queue.writeBuffer(this.backgroundUniformBuffer, 68, this._f32_1);
    this._f32_1[0] = ghostUVX;
    this.device.queue.writeBuffer(this.backgroundUniformBuffer, 72, this._f32_1);
    this._f32_1[0] = ghostUVW;
    this.device.queue.writeBuffer(this.backgroundUniformBuffer, 76, this._f32_1);

    // Block uniforms - standard
    this._f32_1[0] = time;
    this.device.queue.writeBuffer(this.fragmentUniformBuffer, 48, this._f32_1);
    this._f32_1[0] = this.useGlitch ? 1.0 : 0.0;
    this.device.queue.writeBuffer(this.fragmentUniformBuffer, 52, this._f32_1);
    this._f32_1[0] = lockPercent;
    this.device.queue.writeBuffer(this.fragmentUniformBuffer, 56, this._f32_1);
    this._f32_1[0] = this.visualEffects.currentLevel;
    this.device.queue.writeBuffer(this.fragmentUniformBuffer, 60, this._f32_1);

    // NEW: Underwater uniforms (offset 96-127 in fragment shader)
    // Check if we're in bioluminescent level
    const isUnderwaterLevel = this.reactiveVideoBackground?.isSeaCreatureLevel ?? false;
    if (isUnderwaterLevel && this.reactiveVideoBackground) {
      this._f32_1[0] = 1.0; // isUnderwater
      this.device.queue.writeBuffer(this.fragmentUniformBuffer, 96, this._f32_1);
      this._f32_1[0] = 0.6; // causticIntensity
      this.device.queue.writeBuffer(this.fragmentUniformBuffer, 100, this._f32_1);
      this._f32_1[0] = 0.8; // godRayStrength
      this.device.queue.writeBuffer(this.fragmentUniformBuffer, 104, this._f32_1);
      this._f32_1[0] = 0.5; // bioluminescence
      this.device.queue.writeBuffer(this.fragmentUniformBuffer, 108, this._f32_1);
      this._f32_1[0] = this.reactiveVideoBackground.seaCreatureIntensity; // creatureIntensity
      this.device.queue.writeBuffer(this.fragmentUniformBuffer, 112, this._f32_1);
      this._f32_1[0] = this.reactiveVideoBackground.creatureSwimOffset; // creatureSwimOffset
      this.device.queue.writeBuffer(this.fragmentUniformBuffer, 116, this._f32_1);
      this._f32_1[0] = 5.0; // waterDepth
      this.device.queue.writeBuffer(this.fragmentUniformBuffer, 120, this._f32_1);
      
      // Update chaos mode for underwater theme
      this.chaosMode.setUnderwaterMode(true);
      
      // Update jellyfish system
      this.jellyfishSystem.update(dt, time);
    } else {
      // Not underwater - zero out underwater uniforms
      this._f32_1[0] = 0.0;
      for (let offset = 96; offset <= 120; offset += 4) {
        this.device.queue.writeBuffer(this.fragmentUniformBuffer, offset, this._f32_1);
      }
      this.chaosMode.setUnderwaterMode(false);
    }

    // Post-process uniforms - using new unified system
    this._postProcessParams.time = time;
    this._postProcessParams.useGlitch = Math.max(this.useGlitch ? 1.0 : 0.0, this.visualEffects.glitchIntensity);
    this._postProcessParams.shockwaveCenter[0] = this.visualEffects.shockwaveCenter[0];
    this._postProcessParams.shockwaveCenter[1] = this.visualEffects.shockwaveCenter[1];
    this._postProcessParams.shockwaveTime = this.visualEffects.shockwaveTimer;
    const currentShockwaveParams = this.visualEffects.getShockwaveParams();
    this._postProcessParams.shockwaveParams[0] = currentShockwaveParams[0];
    this._postProcessParams.shockwaveParams[1] = currentShockwaveParams[1];
    this._postProcessParams.shockwaveParams[2] = currentShockwaveParams[2];
    this._postProcessParams.shockwaveParams[3] = currentShockwaveParams[3];
    this._postProcessParams.level = this.visualEffects.currentLevel;
    this._postProcessParams.warpSurge = this.visualEffects.warpSurge;
    this._postProcessParams.enableFXAA = this.useEnhancedPostProcess ? 1.0 : 0.0;
    // When multi-pass bloom is active it handles bloom exclusively — disable the
    // in-shader 13-tap bloom to avoid double-blooming that washes out the board.
    const inShaderBloom = this.useEnhancedPostProcess && this.bloomEnabled && !this.useMultiPassBloom;
    this._postProcessParams.enableBloom = inShaderBloom ? 1.0 : 0.0;
    this._postProcessParams.enableFilmGrain = 1.0;
    this._postProcessParams.enableCRT = 0.0;
    this._postProcessParams.bloomIntensity = this.bloomIntensity;
    this._postProcessParams.bloomThreshold = 0.72;
    this._postProcessParams.materialAwareBloom = (this.useEnhancedPostProcess && !this.useMultiPassBloom) ? 1.0 : 0.0;
    this._postProcessParams.screenResolution[0] = this.canvasWebGPU.width;
    this._postProcessParams.screenResolution[1] = this.canvasWebGPU.height;

    const ppUniforms = postProcessUniforms.pack(this._postProcessParams);
    this.device.queue.writeBuffer(this.postProcessUniformBuffer, 0, ppUniforms);

    // RENDER PASSES
    
    // 1. Background (Video or Shader)
    const renderVideo = this.reactiveVideoBackground?.isVideoPlaying ?? false;
    const clearColors = this.visualEffects.getClearColors();
    const colorAttachment0 = (this._backgroundPassDescriptor.colorAttachments as GPURenderPassColorAttachment[])[0];
    const clearValue = colorAttachment0.clearValue as GPUColorDict;
    clearValue.r = clearColors.r;
    clearValue.g = clearColors.g;
    clearValue.b = clearColors.b;
    clearValue.a = 0.0;

    if (!renderVideo) {
        const bgPassEncoder = commandEncoder.beginRenderPass(this._backgroundPassDescriptor);
        bgPassEncoder.setPipeline(this.backgroundPipeline);
        bgPassEncoder.setVertexBuffer(0, this.backgroundVertexBuffer);
        bgPassEncoder.setBindGroup(0, this.backgroundBindGroup);
        bgPassEncoder.draw(6);
        bgPassEncoder.end();
    } else {
        const bgPassEncoder = commandEncoder.beginRenderPass(this._backgroundPassDescriptor);
        bgPassEncoder.end();
    }

    // 2. Frosted Glass Backboard (Ethereal Hardware Panel)
    if (this.useFrostedGlass && this.frostedGlassPipeline) {
        this.updateFrostedGlassUniforms();
        const glassPassEncoder = commandEncoder.beginRenderPass({
            colorAttachments: [{ 
                view: this._offscreenTextureView, 
                loadOp: 'load', 
                storeOp: 'store' 
            }],
            depthStencilAttachment: { 
                view: this._depthTextureView, 
                depthLoadOp: 'load', 
                depthStoreOp: 'store' 
            }
        });
        glassPassEncoder.setPipeline(this.frostedGlassPipeline);
        glassPassEncoder.setVertexBuffer(0, this.frostedGlassVertexBuffer);
        glassPassEncoder.setBindGroup(0, this.frostedGlassBindGroup);
        glassPassEncoder.draw(6);
        glassPassEncoder.end();
    }

    // 3. Main scene (Blocks, Grid, Particles)
    this.renderPlayfild_WebGPU(this.state);
    const passEncoder = commandEncoder.beginRenderPass(this._mainPassDescriptor);
    
    // Grid
    passEncoder.setPipeline(this.gridPipeline);
    passEncoder.setBindGroup(0, this.gridBindGroup);
    passEncoder.setVertexBuffer(0, this.gridVertexBuffer);
    passEncoder.draw(this.gridVertexCount);

    // Blocks
    passEncoder.setPipeline(this.pipeline);
    passEncoder.setVertexBuffer(0, this.vertexBuffer);
    passEncoder.setVertexBuffer(1, this.normalBuffer);
    passEncoder.setVertexBuffer(2, this.uvBuffer);

    for (let index = 0; index < this.uniformBindGroup_ARRAY_border.length; index++) {
      passEncoder.setBindGroup(0, this.uniformBindGroup_ARRAY_border[index]);
      passEncoder.draw(this.numberOfVertices);
    }

    for (let index = 0; index < this.uniformBindGroup_ARRAY.length; index++) {
      passEncoder.setBindGroup(0, this.uniformBindGroup_ARRAY[index]);
      passEncoder.draw(this.numberOfVertices);
    }

    // OPTIMIZED: Only render particles if potentially active (emitted recently or shockwave active)
    if (result.hasActiveParticles) {
        passEncoder.setPipeline(this.particlePipeline);
        passEncoder.setBindGroup(0, this.particleRenderBindGroup);
        passEncoder.setVertexBuffer(0, this.particleStorageBuffer);
        passEncoder.draw(6, this.particleSystem.maxParticles, 0, 0);
    }

    passEncoder.end();

    // 4. Post-process with optional multi-pass bloom
    if (this.useMultiPassBloom && this.bloomEnabled && this._bloomInputTexture) {
      // Use new multi-pass bloom system
      // Render post-process without bloom to the persistent _bloomInputTexture
      const ppColorAttachment0 = (this._ppPassDescriptor.colorAttachments as GPURenderPassColorAttachment[])[0];
      ppColorAttachment0.view = this._bloomInputTexture.createView();

      const ppPassEncoder = commandEncoder.beginRenderPass(this._ppPassDescriptor);
      ppPassEncoder.setPipeline(this.postProcessPipeline);
      ppPassEncoder.setBindGroup(0, this.postProcessBindGroup);
      ppPassEncoder.setVertexBuffer(0, this.backgroundVertexBuffer);
      ppPassEncoder.draw(6);
      ppPassEncoder.end();

      // Apply multi-pass bloom
      const textureViewScreen = this.ctxWebGPU.getCurrentTexture().createView();
      this.bloomSystem.render(
        this._bloomInputTexture.createView(),
        textureViewScreen,
        commandEncoder
      );
    } else {
      // Use original simple bloom
      const textureViewScreen = this.ctxWebGPU.getCurrentTexture().createView();
      const ppColorAttachment0 = (this._ppPassDescriptor.colorAttachments as GPURenderPassColorAttachment[])[0];
      ppColorAttachment0.view = textureViewScreen;
      
      const ppPassEncoder = commandEncoder.beginRenderPass(this._ppPassDescriptor);
      ppPassEncoder.setPipeline(this.postProcessPipeline);
      ppPassEncoder.setBindGroup(0, this.postProcessBindGroup);
      ppPassEncoder.setVertexBuffer(0, this.backgroundVertexBuffer);
      ppPassEncoder.draw(6);
      ppPassEncoder.end();
    }

    this.device.queue.submit([commandEncoder.finish()]);
  };

  // Pre-allocated buffer for batched uniform updates (max 200 blocks * 64 floats per block)
  private _uniformBatchBuffer = new Float32Array(200 * 64);

  // Playfield rendering (delegated to viewPlayfield.ts)
  async renderPlayfild_WebGPU(state: any) {
    if (!this.device || !this.blockTexture) return;
    renderPlayfieldBlocks(
      this.device, state, this.currentTheme, this.visualEffects,
      this.visualX, this.visualY, this.vpMatrix as Float32Array,
      this.uniformBindGroup_CACHE, this.uniformBindGroup_ARRAY,
      this.vertexUniformBuffer, this._uniformBatchBuffer,
      this._f32_3, this._f32_4, this.MODELMATRIX, this.NORMALMATRIX
    );
  }

  async renderPlayfild_Border_WebGPU() {
    if (!this.device) return;
    const result = renderPlayfieldBorder(
      this.device, this.pipeline, this.fragmentUniformBuffer,
      this.blockTexture, this.blockSampler, this.materialUniformBuffer,
      this.vpMatrix as Float32Array, this.currentTheme,
      this._f32_3, this._f32_4, this.MODELMATRIX, this.NORMALMATRIX
    );
    this.vertexUniformBuffer_border = result.vertexUniformBuffer;
    this.uniformBindGroup_ARRAY_border = result.bindGroups;
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
  setMaterialTheme(themeName: string, pieceType: number = 1) { setMaterialThemeImpl(this as any, themeName, pieceType); }
  updateMaterialUniforms() { updateMaterialUniformsImpl(this as any); }
  cycleTheme() { cycleThemeImpl(this as any); }

  // Premium visuals and reactive system hooks (delegated to viewPremium.ts)
  setPremiumVisualsPreset(options: any = {}) { setPremiumPresetImpl(this as any, options); }
  onLineClearReactive(lines: number, combo: number, isTSpin: boolean, isAllClear: boolean) { onLineClearReactiveImpl(this as any, lines, combo, isTSpin, isAllClear); }
  onTSpinReactive() { onTSpinReactiveImpl(this as any); }
  onPerfectClearReactive() { onPerfectClearReactiveImpl(this as any); }
  onLevelUpReactive(level: number) { onLevelUpReactiveImpl(this as any, level); }
  onGameOverReactive() { onGameOverReactiveImpl(this as any); }
  initReactiveMusic(audioContext: AudioContext, masterGain: GainNode) { initReactiveMusicImpl(this as any, audioContext, masterGain); }
  toggleFXAA(enabled: boolean) { toggleFXAAImpl(this as any, enabled); }
  toggleFilmGrain(enabled: boolean) { toggleFilmGrainImpl(this as any, enabled); }
  toggleCRT(enabled: boolean) { toggleCRTImpl(this as any, enabled); }
  toggleBloom(enabled?: boolean) { toggleBloomImpl(this as any, enabled); }
  setBloomIntensity(intensity: number) { setBloomIntensityImpl(this as any, intensity); }
  toggleMultiPassBloom() { return toggleMultiPassBloomImpl(this as any); }
  setBloomParameters(params: Partial<BloomParameters>) { setBloomParametersImpl(this as any, params); }
}
