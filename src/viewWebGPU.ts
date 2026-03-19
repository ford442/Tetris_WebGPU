import * as Matrix from "gl-matrix";
import { PostProcessShaders, ParticleShaders, GridShader, BackgroundShaders, Shaders } from './webgpu/shaders.js';
import { ParticleComputeShader } from './webgpu/compute.js';
import { CubeData, FullScreenQuadData, GridData } from './webgpu/geometry.js';
import {
  BLOCK_WORLD_SIZE,
  BOARD_WORLD_CENTER_X,
  BOARD_WORLD_CENTER_Y,
  boardWorldX,
  boardWorldY,
  borderWorldX,
  borderWorldY,
} from './webgpu/renderMetrics.js';
import { themes, ThemeColors, Themes } from './webgpu/themes.js';
import { ParticleSystem } from './webgpu/particles.js';
import { VisualEffects } from './webgpu/effects.js';
import {
  PROCEDURAL_BLOCK_TEXTURE_SIZE,
  getTextureMipLevelCount,
  paintProceduralBlockTexture,
  resolveBlockTextureUrl,
} from './webgpu/blockTexture.js';
import {
  onHardDrop as handleHardDrop,
  onHold as handleHold,
  onLineClear as handleLineClear,
  onLock as handleLock,
  onMove as handleMove,
  onRotate as handleRotate,
  renderEndScreen as handleRenderEndScreen,
  renderMainScreen as handleRenderMainScreen,
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
  state: { playfield: number[][], lockTimer?: number, lockDelayTime?: number, level?: number, nextPiece?: any, holdPiece?: any, activePiece?: any, score?: number, lines?: number, effectEvent?: string, effectCounter?: number, lastDropPos?: any, lastDropDistance?: number, scoreEvent?: any };
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

  // Post Processing
  postProcessPipeline!: GPURenderPipeline;
  postProcessBindGroup!: GPUBindGroup;
  postProcessUniformBuffer!: GPUBuffer;
  offscreenTexture!: GPUTexture;
  depthTexture!: GPUTexture;
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

  constructor(element: HTMLElement, width: number, height: number, rows: number, coloms: number, nextPieceContext: CanvasRenderingContext2D, holdPieceContext: CanvasRenderingContext2D) {
    this.element = element;
    this.width = width;
    this.height = height;
    this.nextPieceContext = nextPieceContext;
    this.holdPieceContext = holdPieceContext;
    this.startTime = performance.now();

    // Initialize subsystems
    this.particleSystem = new ParticleSystem();
    this.visualEffects = new VisualEffects(element, width, height);

    this.canvasWebGPU = document.createElement("canvas");
    this.canvasWebGPU.id = "canvaswebgpu";
    this.canvasWebGPU.style.position = 'absolute';
    this.canvasWebGPU.style.top = '0';
    this.canvasWebGPU.style.left = '0';
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

    this.canvasWebGPU.width = this.width * dpr;
    this.canvasWebGPU.height = this.height * dpr;

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

    if (this.offscreenTexture) {
        this.offscreenTexture.destroy();
    }
    this.offscreenTexture = this.device.createTexture({
        size: [this.canvasWebGPU.width, this.canvasWebGPU.height, 1],
        format: presentationFormat,
        usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING
    });
    this._offscreenTextureView = this.offscreenTexture.createView();

    if (this.depthTexture) {
        this.depthTexture.destroy();
    }
    this.depthTexture = this.device.createTexture({
      size: [this.canvasWebGPU.width, this.canvasWebGPU.height, 1],
      format: "depth24plus",
      usage: GPUTextureUsage.RENDER_ATTACHMENT,
    });
    this._depthTextureView = this.depthTexture.createView();

    // Update descriptors with new views - GC optimized pattern
    if (this._backgroundPassDescriptor?.colorAttachments) {
        const colorAttachment = (this._backgroundPassDescriptor.colorAttachments as GPURenderPassColorAttachment[])[0];
        colorAttachment.view = this._offscreenTextureView;
    }
    if (this._mainPassDescriptor?.colorAttachments) {
        const colorAttachment = (this._mainPassDescriptor.colorAttachments as GPURenderPassColorAttachment[])[0];
        colorAttachment.view = this._offscreenTextureView;
    }
    if (this._mainPassDescriptor?.depthStencilAttachment) {
        this._mainPassDescriptor.depthStencilAttachment.view = this._depthTextureView;
    }

    if (this.postProcessPipeline) {
        this.postProcessBindGroup = this.device.createBindGroup({
            layout: this.postProcessPipeline.getBindGroupLayout(0),
            entries: [
                { binding: 0, resource: { buffer: this.postProcessUniformBuffer } },
                { binding: 1, resource: this.sampler },
                { binding: 2, resource: this.offscreenTexture.createView() }
            ]
        });
    }

    Matrix.mat4.identity(this.PROJMATRIX);
    let fovy = (35 * Math.PI) / 180;
    Matrix.mat4.perspective(
      this.PROJMATRIX,
      fovy,
      this.canvasWebGPU.width / this.canvasWebGPU.height,
      1,
      150
    );

    this.vpMatrix = Matrix.mat4.create();
    Matrix.mat4.identity(this.vpMatrix);
    Matrix.mat4.multiply(this.vpMatrix, this.PROJMATRIX, this.VIEWMATRIX);
  }

  toggleGlitch() {
    this.useGlitch = !this.useGlitch;
  }

  setTheme(themeName: keyof Themes) {
    this.currentTheme = this.themes[themeName];
    this.visualEffects.currentLevel = 0;

    this.visualEffects.updateVideoForLevel(0, this.currentTheme.levelVideos);

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
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.lineWidth = 1;
    const gridSize = blockSize;

    ctx.beginPath();
    for (let x = 0; x <= ctx.canvas.width; x += gridSize) {
        ctx.moveTo(x, 0);
        ctx.lineTo(x, ctx.canvas.height);
    }
    for (let y = 0; y <= ctx.canvas.height; y += gridSize) {
        ctx.moveTo(0, y);
        ctx.lineTo(ctx.canvas.width, y);
    }
    ctx.stroke();

    if (!piece) return;

    const { blocks } = piece;
    const themeColors = Object.values(this.currentTheme);

    const offsetX = (ctx.canvas.width - blocks[0].length * blockSize) / 2;
    const offsetY = (ctx.canvas.height - blocks.length * blockSize) / 2;

    blocks.forEach((row: number[], y: number) => {
      row.forEach((value: number, x: number) => {
        if (value > 0) {
          const color = themeColors[value] as number[];
          const px = offsetX + x * blockSize;
          const py = offsetY + y * blockSize;

          const r = Math.floor(color[0] * 255);
          const g = Math.floor(color[1] * 255);
          const b = Math.floor(color[2] * 255);
          const cssColor = `rgb(${r}, ${g}, ${b})`;
          const brightColor = `rgb(${Math.min(r + 50, 255)}, ${Math.min(g + 50, 255)}, ${Math.min(b + 50, 255)})`;

          ctx.save();
          ctx.shadowColor = cssColor;
          ctx.shadowBlur = 30;
          ctx.fillStyle = `rgba(${r}, ${g}, ${b}, 0.2)`;
          ctx.fillRect(px + 2, py + 2, blockSize - 4, blockSize - 4);

          ctx.shadowColor = cssColor;
          ctx.shadowBlur = 15;
          ctx.strokeStyle = brightColor;
          ctx.lineWidth = 2;
          ctx.strokeRect(px + 2, py + 2, blockSize - 4, blockSize - 4);

          ctx.shadowColor = 'white';
          ctx.shadowBlur = 5;
          ctx.fillStyle = `rgba(255, 255, 255, 0.4)`;
          ctx.fillRect(px + 4, py + 4, blockSize - 8, blockSize - 8);

          ctx.restore();

          ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
          ctx.beginPath();
          ctx.moveTo(px + 2, py + blockSize - 2);
          ctx.lineTo(px + 2, py + 2);
          ctx.lineTo(px + blockSize - 2, py + 2);
          ctx.lineTo(px + blockSize - 6, py + 6);
          ctx.lineTo(px + 6, py + 6);
          ctx.lineTo(px + 6, py + blockSize - 6);
          ctx.closePath();
          ctx.fill();
        }
      });
    });
  }

  showFloatingText(text: string, subText: string = "") {
      handleShowFloatingText(this, text, subText);
  }

  onLineClear(lines: number[], tSpin: boolean = false, combo: number = 0, backToBack: boolean = false, isAllClear: boolean = false) {
      handleLineClear(this, lines, tSpin, combo, backToBack, isAllClear);
  }

  onLock() { handleLock(this); }
  onHold() { handleHold(this); }
  onRotate() { handleRotate(this); }
  triggerImpactEffects(worldX: number, impactY: number, distance: number) {
      handleImpactEffects(this, worldX, impactY, distance);
  }
  onHardDrop(x: number, y: number, distance: number, colorIdx: number = 0) {
      handleHardDrop(this, x, y, distance, colorIdx);
  }
  renderMainScreen(state: any) { handleRenderMainScreen(this, state); }
  renderEndScreen({ score }: any) { handleRenderEndScreen(this); }
  onMove(x: number, y: number) { handleMove(this, x, y); }

  generateMipmaps(texture: GPUTexture, width: number, height: number, mipLevelCount: number) {
    const blitShader = `
      @group(0) @binding(0) var srcTexture: texture_2d<f32>;
      @group(0) @binding(1) var srcSampler: sampler;
      struct VertexOutput {
        @builtin(position) position: vec4<f32>,
        @location(0) uv: vec2<f32>,
      };
      @vertex
      fn vertexMain(@builtin(vertex_index) vertexIndex: u32) -> VertexOutput {
        var pos = array<vec2<f32>, 6>(
          vec2<f32>(-1.0, -1.0), vec2<f32>(1.0, -1.0), vec2<f32>(-1.0, 1.0),
          vec2<f32>(-1.0, 1.0), vec2<f32>(1.0, -1.0), vec2<f32>(1.0, 1.0)
        );
        var uv = array<vec2<f32>, 6>(
          vec2<f32>(0.0, 1.0), vec2<f32>(1.0, 1.0), vec2<f32>(0.0, 0.0),
          vec2<f32>(0.0, 0.0), vec2<f32>(1.0, 1.0), vec2<f32>(1.0, 0.0)
        );
        var output: VertexOutput;
        output.position = vec4<f32>(pos[vertexIndex], 0.0, 1.0);
        output.uv = uv[vertexIndex];
        return output;
      }
      @fragment
      fn fragmentMain(@location(0) uv: vec2<f32>) -> @location(0) vec4<f32> {
        return textureSample(srcTexture, srcSampler, uv);
      }
    `;

    const shaderModule = this.device.createShaderModule({ code: blitShader });
    const pipeline = this.device.createRenderPipeline({
      layout: 'auto',
      vertex: { module: shaderModule, entryPoint: 'vertexMain' },
      fragment: { module: shaderModule, entryPoint: 'fragmentMain', targets: [{ format: 'rgba8unorm' }] },
    });

    const sampler = this.device.createSampler({ minFilter: 'linear', magFilter: 'linear' });
    const commandEncoder = this.device.createCommandEncoder();

    for (let i = 1; i < mipLevelCount; i++) {
      const srcView = texture.createView({ baseMipLevel: i - 1, mipLevelCount: 1 });
      const dstView = texture.createView({ baseMipLevel: i, mipLevelCount: 1 });
      const bindGroup = this.device.createBindGroup({
        layout: pipeline.getBindGroupLayout(0),
        entries: [{ binding: 0, resource: srcView }, { binding: 1, resource: sampler }],
      });
      const passEncoder = commandEncoder.beginRenderPass({
        colorAttachments: [{ view: dstView, loadOp: 'clear', storeOp: 'store', clearValue: { r: 0, g: 0, b: 0, a: 0 } }],
      });
      passEncoder.setPipeline(pipeline);
      passEncoder.setBindGroup(0, bindGroup);
      passEncoder.draw(6, 1, 0, 0);
      passEncoder.end();
    }
    this.device.queue.submit([commandEncoder.finish()]);
  }

  private createSolidFallbackTexture(): GPUTexture {
    const texture = this.device.createTexture({
      size: [1, 1, 1],
      format: 'rgba8unorm',
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
    });
    this.device.queue.writeTexture(
      { texture },
      new Uint8Array([255, 255, 255, 255]),
      { bytesPerRow: 4 },
      [1, 1, 1]
    );
    return texture;
  }

  private createProceduralFallbackTexture(): GPUTexture {
    const size = PROCEDURAL_BLOCK_TEXTURE_SIZE;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Unable to create procedural fallback texture context');
    }

    paintProceduralBlockTexture(ctx, size);

    const mipLevelCount = getTextureMipLevelCount(size, size);
    const texture = this.device.createTexture({
      size: [size, size, 1],
      format: 'rgba8unorm',
      mipLevelCount,
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
    });

    this.device.queue.copyExternalImageToTexture(
      { source: canvas },
      { texture },
      [size, size]
    );
    this.generateMipmaps(texture, size, size, mipLevelCount);

    return texture;
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
      magFilter: 'linear', minFilter: 'linear', mipmapFilter: 'linear',
      addressModeU: 'repeat', addressModeV: 'repeat', maxAnisotropy: 16,
    });

    try {
        const textureUrl = resolveBlockTextureUrl(import.meta.url);
        console.log('[Texture] Loading from:', textureUrl);
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
        console.log('[Texture] Loaded successfully:', imageBitmap.width, 'x', imageBitmap.height, 'mips:', mipLevelCount);
    } catch (e) {
        console.error('[Texture] Failed to load block texture:', e);
        try {
          this.blockTexture = this.createProceduralFallbackTexture();
          console.warn('[Texture] Using procedural fallback texture');
        } catch (fallbackError) {
          console.error('[Texture] Procedural fallback failed, using solid texture:', fallbackError);
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
    
    vertexModule.getCompilationInfo().then(info => { if (info.messages.length > 0) console.log('[Shader] Vertex:', info.messages); });
    fragmentModule.getCompilationInfo().then(info => { if (info.messages.length > 0) console.log('[Shader] Fragment:', info.messages); });
    
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
            color: { srcFactor: 'src-alpha', dstFactor: 'one', operation: 'add' },
            alpha: { srcFactor: 'one', dstFactor: 'one', operation: 'add' },
        }}]},
        primitive: { topology: 'triangle-list' },
        depthStencil: { format: 'depth24plus', depthWriteEnabled: false, depthCompare: 'less' }
    });

    this.particleUniformBuffer = this.device.createBuffer({ size: 96, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    this.particleRenderBindGroup = this.device.createBindGroup({ layout: this.particlePipeline.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: this.particleUniformBuffer } }] });
    this.gridBindGroup = this.device.createBindGroup({ layout: this.gridPipeline.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: this.particleUniformBuffer } }] });

    const ppShader = PostProcessShaders();
    this.postProcessPipeline = this.device.createRenderPipeline({
        label: 'post process pipeline', layout: 'auto',
        vertex: { module: this.device.createShaderModule({ code: ppShader.vertex }), entryPoint: 'main', buffers: [{ arrayStride: 12, attributes: [{ shaderLocation: 0, format: 'float32x3', offset: 0 }] }] },
        fragment: { module: this.device.createShaderModule({ code: ppShader.fragment }), entryPoint: 'main', targets: [{ format: presentationFormat }] },
        primitive: { topology: 'triangle-list' }
    });

    this.postProcessUniformBuffer = this.device.createBuffer({ size: 64, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    this.sampler = this.device.createSampler({ magFilter: 'linear', minFilter: 'linear', mipmapFilter: 'linear', addressModeU: 'clamp-to-edge', addressModeV: 'clamp-to-edge' });

    this.offscreenTexture = this.device.createTexture({
        size: [this.canvasWebGPU.width, this.canvasWebGPU.height, 1],
        format: presentationFormat, usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING
    });
    this._offscreenTextureView = this.offscreenTexture.createView();
    this.depthTexture = this.device.createTexture({ size: [this.canvasWebGPU.width, this.canvasWebGPU.height, 1], format: "depth24plus", usage: GPUTextureUsage.RENDER_ATTACHMENT });
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

    this.fragmentUniformBuffer = this.device.createBuffer({ size: 96, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });

    let eyePosition = [0.0, BOARD_WORLD_CENTER_Y, 75.0];
    let lightPosition = this._f32_3;
    lightPosition.set([-5.0, 0.0, 0.0]);

    Matrix.mat4.identity(this.VIEWMATRIX);
    Matrix.mat4.lookAt(this.VIEWMATRIX, eyePosition, [BOARD_WORLD_CENTER_X, BOARD_WORLD_CENTER_Y, 0.0], [0.0, 1.0, 0.0]);
    Matrix.mat4.identity(this.PROJMATRIX);
    Matrix.mat4.perspective(this.PROJMATRIX, (35 * Math.PI) / 180, this.canvasWebGPU.width / this.canvasWebGPU.height, 1, 150);
    Matrix.mat4.identity(this.vpMatrix);
    Matrix.mat4.multiply(this.vpMatrix, this.PROJMATRIX, this.VIEWMATRIX);

    this.device.queue.writeBuffer(this.fragmentUniformBuffer, 0, lightPosition);
    this._f32_3.set(eyePosition);
    this.device.queue.writeBuffer(this.fragmentUniformBuffer, 16, this._f32_3);
    this._f32_4.set(this.currentTheme[5] || [1.0, 1.0, 1.0, 1.0]);
    this.device.queue.writeBuffer(this.fragmentUniformBuffer, 32, this._f32_4);
    this._f32_1[0] = this.useGlitch ? 1.0 : 0.0;
    this.device.queue.writeBuffer(this.fragmentUniformBuffer, 52, this._f32_1);

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
                { binding: 1, resource: { buffer: this.fragmentUniformBuffer, offset: 0, size: 80 } },
                { binding: 2, resource: this.blockTexture.createView({ format: 'rgba8unorm', dimension: '2d', baseMipLevel: 0, mipLevelCount: this.blockTexture.mipLevelCount }) },
                { binding: 3, resource: this.blockSampler }
            ],
        });
        this.uniformBindGroup_CACHE.push(bindGroup);
    }
  }

  CreateGPUBuffer = (device: any, data: any, usageFlag = GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST) => {
    const buffer = device.createBuffer({ size: data.byteLength, usage: usageFlag, mappedAtCreation: true });
    new Float32Array(buffer.getMappedRange()).set(data);
    buffer.unmap();
    return buffer;
  };

  render = (dt: number) => {
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
        this.visualX = targetX + (this.visualX - targetX) * Math.exp(-clampedDt * smoothingFactor);
        this.visualY = targetY + (this.visualY - targetY) * Math.exp(-clampedDt * smoothingFactor);
      }
    } else {
      this._previousActivePiece = null;
    }

    this.visualEffects.updateEffects(clampedDt);
    const time = (performance.now() - this.startTime) / 1000.0;

    // Camera updates
    let camX = 0.0 + Math.sin(time * 0.2) * 0.5;
    let camY = BOARD_WORLD_CENTER_Y + Math.cos(time * 0.3) * 0.25;
    const shake = this.visualEffects.getShakeOffset();
    this._shakeOffsetSmoothed.x += (shake.x - this._shakeOffsetSmoothed.x) * 15.0 * dt;
    this._shakeOffsetSmoothed.y += (shake.y - this._shakeOffsetSmoothed.y) * 15.0 * dt;
    camX += this._shakeOffsetSmoothed.x;
    camY += this._shakeOffsetSmoothed.y;

    const eyePosition = this._f32_3;
    eyePosition[0] = camX; eyePosition[1] = camY; eyePosition[2] = 75.0;
    this._camEye[0] = camX; this._camEye[1] = camY; this._camEye[2] = 75.0;
    Matrix.mat4.lookAt(this.VIEWMATRIX, this._camEye, this._camTarget, this._camUp);
    Matrix.mat4.multiply(this.vpMatrix, this.PROJMATRIX, this.VIEWMATRIX);
    this.device.queue.writeBuffer(this.fragmentUniformBuffer, 16, eyePosition);

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

    const commandEncoder = this.device.createCommandEncoder();
    const computePass = commandEncoder.beginComputePass();
    computePass.setPipeline(this.particleComputePipeline);
    computePass.setBindGroup(0, this.particleComputeBindGroup);
    computePass.dispatchWorkgroups(Math.ceil(this.particleSystem.maxParticles / 64));
    computePass.end();

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

    // Block uniforms
    this._f32_1[0] = time;
    this.device.queue.writeBuffer(this.fragmentUniformBuffer, 48, this._f32_1);
    this._f32_1[0] = this.useGlitch ? 1.0 : 0.0;
    this.device.queue.writeBuffer(this.fragmentUniformBuffer, 52, this._f32_1);
    this._f32_1[0] = lockPercent;
    this.device.queue.writeBuffer(this.fragmentUniformBuffer, 56, this._f32_1);
    this._f32_1[0] = this.visualEffects.currentLevel;
    this.device.queue.writeBuffer(this.fragmentUniformBuffer, 60, this._f32_1);

    // Post-process uniforms
    this._f32_8[0] = time;
    this._f32_8[1] = Math.max(this.useGlitch ? 1.0 : 0.0, this.visualEffects.glitchIntensity);
    this._f32_8[2] = this.visualEffects.shockwaveCenter[0];
    this._f32_8[3] = this.visualEffects.shockwaveCenter[1];
    this._f32_8[4] = this.visualEffects.shockwaveTimer;
    this._f32_8[5] = 0; this._f32_8[6] = 0; this._f32_8[7] = 0;
    this.device.queue.writeBuffer(this.postProcessUniformBuffer, 0, this._f32_8);
    this.device.queue.writeBuffer(this.postProcessUniformBuffer, 32, this.visualEffects.getShockwaveParams());
    this._f32_1[0] = this.visualEffects.currentLevel;
    this.device.queue.writeBuffer(this.postProcessUniformBuffer, 48, this._f32_1);
    this._f32_1[0] = this.visualEffects.warpSurge;
    this.device.queue.writeBuffer(this.postProcessUniformBuffer, 52, this._f32_1);

    // RENDER PASSES
    
    // 1. Background
    const renderVideo = this.visualEffects.isVideoPlaying;
    const clearColors = this.visualEffects.getClearColors();
    const colorAttachment0 = (this._backgroundPassDescriptor.colorAttachments as GPURenderPassColorAttachment[])[0];
    colorAttachment0.clearValue = { r: clearColors.r, g: clearColors.g, b: clearColors.b, a: 0.0 };

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

    // 2. Main scene
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

    // Particles
    passEncoder.setPipeline(this.particlePipeline);
    passEncoder.setBindGroup(0, this.particleRenderBindGroup);
    passEncoder.setVertexBuffer(0, this.particleStorageBuffer);
    passEncoder.draw(6, this.particleSystem.maxParticles, 0, 0);

    passEncoder.end();

    // 3. Post-process
    const textureViewScreen = this.ctxWebGPU.getCurrentTexture().createView();
    const ppColorAttachment0 = (this._ppPassDescriptor.colorAttachments as GPURenderPassColorAttachment[])[0];
    ppColorAttachment0.view = textureViewScreen;
    
    const ppPassEncoder = commandEncoder.beginRenderPass(this._ppPassDescriptor);
    ppPassEncoder.setPipeline(this.postProcessPipeline);
    ppPassEncoder.setBindGroup(0, this.postProcessBindGroup);
    ppPassEncoder.setVertexBuffer(0, this.backgroundVertexBuffer);
    ppPassEncoder.draw(6);
    ppPassEncoder.end();

    this.device.queue.submit([commandEncoder.finish()]);
  };

  async renderPlayfild_WebGPU(state: any) {
    if (!this.device) return;
    if (!this.blockTexture) {
      console.warn('[Render] blockTexture not initialized');
      return;
    }
    const { playfield, activePiece } = state;
    let arrayLength = 0;
    let blockIndex = 0;

    for (let row = 0; row < playfield.length; row++) {
      for (let colom = 0; colom < playfield[row].length; colom++) {
        if (!playfield[row][colom]) continue;
        if (blockIndex >= this.uniformBindGroup_CACHE.length) break;

        let value = playfield[row][colom];
        let colorBlockindex = Math.abs(value);
        let alpha = value < 0 ? 0.3 : 0.9;
        let color = this.currentTheme[colorBlockindex] || this.currentTheme[0];

        this._f32_4[0] = color[0]; this._f32_4[1] = color[1]; this._f32_4[2] = color[2]; this._f32_4[3] = alpha;

        let isSolidActivePieceBlock = false;

        // Visual Active Piece Interpolation
        if (activePiece) {
             const relX = colom - activePiece.x;
             const relY = row - activePiece.y;
             if (relY >= 0 && relY < activePiece.blocks.length && relX >= 0 && relX < activePiece.blocks[0].length) {
                  if (activePiece.blocks[relY][relX] !== 0 && value > 0) {
                      isSolidActivePieceBlock = true;

                      // Rotation flash
                      if (this.visualEffects.rotationFlashTimer > 0) {
                          const flash = this.visualEffects.rotationFlashTimer * 3.0;
                          this._f32_4[0] = Math.min(color[0] + flash, 1.0);
                          this._f32_4[1] = Math.min(color[1] + flash, 1.0);
                          this._f32_4[2] = Math.min(color[2] + flash, 1.0);
                      }
                  }
             }
        }

        const uniformBindGroup_next = this.uniformBindGroup_CACHE[blockIndex];
        const offset_ARRAY = blockIndex * 256;

        Matrix.mat4.identity(this.MODELMATRIX);
        Matrix.mat4.identity(this.NORMALMATRIX);

        if (isSolidActivePieceBlock) {
             const relX = colom - activePiece.x;
             const relY = row - activePiece.y;
             this._f32_3[0] = boardWorldX(this.visualX + relX);
             this._f32_3[1] = boardWorldY(this.visualY + relY);
             this._f32_3[2] = 0.0;
        } else {
             this._f32_3[0] = boardWorldX(colom);
             this._f32_3[1] = boardWorldY(row);
             this._f32_3[2] = 0.0;
        }
        Matrix.mat4.translate(this.MODELMATRIX, this.MODELMATRIX, this._f32_3);
        Matrix.mat4.invert(this.NORMALMATRIX, this.MODELMATRIX);
        Matrix.mat4.transpose(this.NORMALMATRIX, this.NORMALMATRIX);

        this.device.queue.writeBuffer(this.vertexUniformBuffer, offset_ARRAY + 0, this.vpMatrix);
        this.device.queue.writeBuffer(this.vertexUniformBuffer, offset_ARRAY + 64, this.MODELMATRIX);
        this.device.queue.writeBuffer(this.vertexUniformBuffer, offset_ARRAY + 128, this.NORMALMATRIX);
        this.device.queue.writeBuffer(this.vertexUniformBuffer, offset_ARRAY + 192, this._f32_4);

        this.uniformBindGroup_ARRAY[arrayLength++] = uniformBindGroup_next;
        blockIndex++;
      }
    }
    this.uniformBindGroup_ARRAY.length = arrayLength;
  }

  async renderPlayfild_Border_WebGPU() {
    if (!this.device) return;
    
    const state_Border = {
      playfield: [
        [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
        ...Array(20).fill([1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1]),
        [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
      ],
    };

    const vertexUniformSizeBuffer = 200 * 256;
    this.vertexUniformBuffer_border = this.device.createBuffer({ size: vertexUniformSizeBuffer, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    this.uniformBindGroup_ARRAY_border = [];
    let offset_ARRAY = 0;

    for (let row = 0; row < state_Border.playfield.length; row++) {
      for (let colom = 0; colom < state_Border.playfield[row].length; colom++) {
        if (!state_Border.playfield[row][colom]) continue;

        const uniformBindGroup_next = this.device.createBindGroup({
          label: "uniformBindGroup_next 635", layout: this.pipeline.getBindGroupLayout(0),
          entries: [
            { binding: 0, resource: { buffer: this.vertexUniformBuffer_border, offset: offset_ARRAY, size: 208 } },
            { binding: 1, resource: { buffer: this.fragmentUniformBuffer, offset: 0, size: 80 } },
            { binding: 2, resource: this.blockTexture.createView({ format: 'rgba8unorm', dimension: '2d', baseMipLevel: 0, mipLevelCount: this.blockTexture.mipLevelCount }) },
            { binding: 3, resource: this.blockSampler }
          ],
        });

        Matrix.mat4.identity(this.MODELMATRIX);
        Matrix.mat4.identity(this.NORMALMATRIX);
        this._f32_3[0] = borderWorldX(colom); this._f32_3[1] = borderWorldY(row); this._f32_3[2] = 0.0;
        Matrix.mat4.translate(this.MODELMATRIX, this.MODELMATRIX, this._f32_3);
        Matrix.mat4.invert(this.NORMALMATRIX, this.MODELMATRIX);
        Matrix.mat4.transpose(this.NORMALMATRIX, this.NORMALMATRIX);

        this.device.queue.writeBuffer(this.vertexUniformBuffer_border, offset_ARRAY + 0, this.vpMatrix);
        this.device.queue.writeBuffer(this.vertexUniformBuffer_border, offset_ARRAY + 64, this.MODELMATRIX);
        this.device.queue.writeBuffer(this.vertexUniformBuffer_border, offset_ARRAY + 128, this.NORMALMATRIX);
        this._f32_4.set(this.currentTheme.border);
        this._f32_4[3] = 1.0;
        this.device.queue.writeBuffer(this.vertexUniformBuffer_border, offset_ARRAY + 192, this._f32_4);

        this.uniformBindGroup_ARRAY_border.push(uniformBindGroup_next);
        offset_ARRAY += 256;
      }
    }
  }

  CheckWebGPU = () => {
    let description = "Great, your current browser supports WebGPU!";
    let result = true;
    if (!navigator.gpu) {
      description = `Your current browser does not support WebGPU! Make sure you are on a system with WebGPU enabled.`;
      result = false;
    }
    return { result, description };
  };
}
