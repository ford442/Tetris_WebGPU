import * as Matrix from "gl-matrix";
import { PostProcessShaders, ParticleShaders, GridShader, BackgroundShaders, Shaders } from './webgpu/shaders.js';
import { ParticleComputeShader } from './webgpu/compute.js';
import { CubeData, FullScreenQuadData, GridData } from './webgpu/geometry.js';
import { themes, ThemeColors, Themes } from './webgpu/themes.js';
import { ParticleSystem } from './webgpu/particles.js';
import { VisualEffects } from './webgpu/effects.js';
// @ts-ignore
const glMatrix = Matrix;

////

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
  state: { playfield: number[][] };
  blockData: any;
  device!: GPUDevice;
  numberOfVertices!: number;
  vertexBuffer!: GPUBuffer;
  normalBuffer!: GPUBuffer;
  uvBuffer!: GPUBuffer; // Add UV buffer
  pipeline!: GPURenderPipeline;
  fragmentUniformBuffer!: GPUBuffer;
  MODELMATRIX: any;
  NORMALMATRIX: any;
  VIEWMATRIX: any;
  PROJMATRIX: any;
  vpMatrix: any;
  renderPassDescription!: GPURenderPassDescriptor;
  vertexUniformBuffer!: GPUBuffer;
  vertexUniformBuffer_border!: GPUBuffer;
  blockBindGroup!: GPUBindGroup;
  borderBindGroup!: GPUBindGroup;
  x: number = 0;

  useGlitch: boolean = false;

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
  msaaTexture!: GPUTexture; // MSAA texture for anti-aliasing
  depthTexture!: GPUTexture;
  sampler!: GPUSampler;

  // Particles
  particlePipeline!: GPURenderPipeline;
  particleVertexBuffer!: GPUBuffer;
  particleUniformBuffer!: GPUBuffer;
  particleBindGroup!: GPUBindGroup;
  
  // Particle Compute
  particleComputePipeline!: GPUComputePipeline;
  particleComputeBindGroup!: GPUBindGroup;
  particleComputeUniformBuffer!: GPUBuffer;

  // Subsystems
  particleSystem: ParticleSystem;
  visualEffects: VisualEffects;

  // Themes
  themes: Themes = themes;
  currentTheme: ThemeColors = themes.neon;

  // Cache
  private blockUniformData: ArrayBuffer;
  private borderUniformData: ArrayBuffer;
  private borderCount: number = 0;
  private readonly MAX_BLOCKS = 250; // 200 grid + extra for safety
  private readonly BLOCK_UNIFORM_SIZE = 256;

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
    this.isWebGPU = { result: false, description: "Checking..." };

    this.playfildBorderWidth = 4;
    this.playfildX = this.playfildBorderWidth + 1;
    this.playfildY = this.playfildBorderWidth + 1;
    this.playfildWidth = (this.width * 2) / 3;
    this.playfildHeight = this.height;
    this.playfildInnerWidth = this.playfildWidth - this.playfildBorderWidth * 2;
    this.playfildInnerHeight =
      this.playfildHeight - this.playfildBorderWidth * 2 - 2;

    this.blockWidth = this.playfildInnerWidth / coloms;
    this.blockHeight = this.playfildInnerHeight / rows;

    this.panelX = this.playfildWidth + 10;
    this.panelY = 0;
    this.panelWidth = this.width / 3;
    this.panelHeight = this.height;

    this.state = {
      playfield: [
        [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      ],
    };
    this.blockData = {};

    // Initialize buffers
    this.blockUniformData = new ArrayBuffer(this.MAX_BLOCKS * this.BLOCK_UNIFORM_SIZE);
    // Border is fixed size around 60 blocks, give it safe 100
    this.borderUniformData = new ArrayBuffer(100 * this.BLOCK_UNIFORM_SIZE);

    this.MODELMATRIX = Matrix.mat4.create();
    this.NORMALMATRIX = Matrix.mat4.create();
    this.VIEWMATRIX = Matrix.mat4.create();
    this.PROJMATRIX = Matrix.mat4.create();
    this.vpMatrix = Matrix.mat4.create();

    // Create a temporary loading/error message
    let divStatus = document.createElement("div");
    divStatus.innerText = this.isWebGPU.description;
    this.element.appendChild(divStatus);

    // Call async check and handle result when it resolves
    this.CheckWebGPU().then((status) => {
        // Remove status message
        if (divStatus.parentNode) {
            divStatus.parentNode.removeChild(divStatus);
        }

        if (status.result) {
            this.element.appendChild(this.canvasWebGPU);
            this.preRender();
            window.addEventListener('resize', this.resize.bind(this));
        } else {
            let divError = document.createElement("div");
            divError.innerText = status.description;
            divError.style.color = "red";
            this.element.appendChild(divError);
        }
    });
  }

  async CheckWebGPU() {
      if (!navigator.gpu) {
          this.isWebGPU = { result: false, description: "WebGPU not supported in this browser." };
          return this.isWebGPU;
      }
      try {
          const adapter = await navigator.gpu.requestAdapter();
          if (!adapter) {
              this.isWebGPU = { result: false, description: "No appropriate GPU adapter found." };
              return this.isWebGPU;
          }
          this.isWebGPU = { result: true, description: "WebGPU enabled." };
          return this.isWebGPU;
      } catch (e) {
          this.isWebGPU = { result: false, description: "WebGPU error: " + e };
          return this.isWebGPU;
      }
  }

  resize() {
    if (!this.device) return;
    const dpr = window.devicePixelRatio || 1;
    const newWidth = window.innerWidth;
    const newHeight = window.innerHeight;

    // Only resize if dimensions changed significantly
    if (this.width === newWidth && this.height === newHeight) return;

    this.width = newWidth;
    this.height = newHeight;

    // Set internal resolution higher than CSS resolution
    this.canvasWebGPU.width = this.width * dpr;
    this.canvasWebGPU.height = this.height * dpr;

    // Recalculate playfield dimensions
    this.playfildWidth = (this.width * 2) / 3;
    this.playfildHeight = this.height;
    this.playfildInnerWidth = this.playfildWidth - this.playfildBorderWidth * 2;
    this.playfildInnerHeight = this.playfildHeight - this.playfildBorderWidth * 2 - 2;

    // Update video position with new dimensions
    this.visualEffects.updateVideoPosition(this.width, this.height);

    const presentationFormat = navigator.gpu.getPreferredCanvasFormat();

    this.ctxWebGPU.configure({
      device: this.device,
      format: presentationFormat,
      alphaMode: 'premultiplied',
    });

    // Recreate offscreen texture with higher precision
    if (this.offscreenTexture) {
        this.offscreenTexture.destroy();
    }
    this.offscreenTexture = this.device.createTexture({
        size: [this.canvasWebGPU.width, this.canvasWebGPU.height, 1],
        format: 'rgba16float', // Higher precision format
        usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING
    });

    // Recreate MSAA texture
    if (this.msaaTexture) {
        this.msaaTexture.destroy();
    }
    this.msaaTexture = this.device.createTexture({
        size: [this.canvasWebGPU.width, this.canvasWebGPU.height, 1],
        sampleCount: 4, // 4x MSAA
        format: 'rgba16float',
        usage: GPUTextureUsage.RENDER_ATTACHMENT,
    });

    // Recreate depth texture with MSAA
    if (this.depthTexture) {
        this.depthTexture.destroy();
    }
    this.depthTexture = this.device.createTexture({
      size: [this.canvasWebGPU.width, this.canvasWebGPU.height, 1],
      format: "depth24plus",
      usage: GPUTextureUsage.RENDER_ATTACHMENT,
      sampleCount: 4, // MSAA for depth as well
    });

    // Recreate bindgroup with new texture
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
    this.visualEffects.currentLevel = 0; // Reset to level 0 when theme changes

    // Handle Video Background - start with level 0 video
    this.visualEffects.updateVideoForLevel(0, this.currentTheme.levelVideos);

    if (this.device) {
        // Just update border colors in the buffer, don't recreate geometry
        // Iterate over stored border data and update color offset
        // Border color is at offset +192 (16 bytes)
        const color = new Float32Array([...this.currentTheme.border, 1.0]);
        const view = new Float32Array(this.borderUniformData);

        // We know we have this.borderCount blocks
        for (let i = 0; i < this.borderCount; i++) {
             const offsetFloats = (i * 256 + 192) / 4;
             view.set(color, offsetFloats);
        }
        // Upload updated buffer
        this.device.queue.writeBuffer(this.vertexUniformBuffer_border, 0, this.borderUniformData, 0, this.borderCount * 256);

        // Update background colors
        const bgColors = this.currentTheme.backgroundColors;
        this.device.queue.writeBuffer(this.backgroundUniformBuffer, 16, new Float32Array(bgColors[0]));
        this.device.queue.writeBuffer(this.backgroundUniformBuffer, 32, new Float32Array(bgColors[1]));
        this.device.queue.writeBuffer(this.backgroundUniformBuffer, 48, new Float32Array(bgColors[2]));
    }
  }

  renderPiece(ctx: CanvasRenderingContext2D, piece: any) {
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    if (!piece) return;

    const { blocks } = piece;
    const blockSize = 20;
    // @ts-ignore
    const themeColors = Object.values(this.currentTheme);

    const offsetX = (ctx.canvas.width - blocks[0].length * blockSize) / 2;
    const offsetY = (ctx.canvas.height - blocks.length * blockSize) / 2;

    blocks.forEach((row: number[], y: number) => {
      row.forEach((value: number, x: number) => {
        if (value > 0) {
          const color = themeColors[value] as number[];
          const px = offsetX + x * blockSize;
          const py = offsetY + y * blockSize;

          // Main fill
          ctx.fillStyle = `rgb(${color[0] * 255}, ${color[1] * 255}, ${color[2] * 255})`;
          ctx.fillRect(px, py, blockSize, blockSize);

          // Top/Left Highlight (Bevel)
          ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
          ctx.beginPath();
          ctx.moveTo(px, py + blockSize);
          ctx.lineTo(px, py);
          ctx.lineTo(px + blockSize, py);
          ctx.lineTo(px + blockSize - 4, py + 4);
          ctx.lineTo(px + 4, py + 4);
          ctx.lineTo(px + 4, py + blockSize - 4);
          ctx.closePath();
          ctx.fill();

          // Bottom/Right Shadow (Bevel)
          ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
          ctx.beginPath();
          ctx.moveTo(px + blockSize, py);
          ctx.lineTo(px + blockSize, py + blockSize);
          ctx.lineTo(px, py + blockSize);
          ctx.lineTo(px + 4, py + blockSize - 4);
          ctx.lineTo(px + blockSize - 4, py + blockSize - 4);
          ctx.lineTo(px + blockSize - 4, py + 4);
          ctx.closePath();
          ctx.fill();

          // Center Highlight
          ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
          ctx.fillRect(px + 5, py + 5, blockSize - 10, blockSize - 10);
        }
      });
    });
  }

  onLineClear(lines: number[]) {
      this.visualEffects.triggerFlash(1.0);
      this.visualEffects.triggerShake(0.5, 0.5);
      this.visualEffects.triggerAberration(1.0);

      // Emit particles for each cleared line
      lines.forEach(y => {
          const worldY = y * -2.2;
          // Sweep across the line
          for (let c=0; c<10; c++) {
              const worldX = c * 2.2;
              // Mix of Gold and Cyan for victory feel
              // Add variety based on line count
              const isTetris = lines.length === 4;
              // Rainbow palette for Tetris, specific colors for singles/doubles/triples
              let color = [0.0, 1.0, 1.0, 1.0]; // Cyan default
              if (isTetris) {
                  const hue = (worldX + 11.0) / 22.0; // Gradient across board
                  // Simple HSV to RGB approximation or just cycling colors
                  if (hue < 0.33) color = [1.0, 0.2, 0.2, 1.0]; // Red
                  else if (hue < 0.66) color = [0.2, 1.0, 0.2, 1.0]; // Green
                  else color = [0.2, 0.2, 1.0, 1.0]; // Blue
                  // Mix with Gold
                  color = [color[0]*0.5 + 0.5, color[1]*0.5 + 0.4, color[2]*0.5, 1.0];
              } else {
                  // Random Neon
                   color = (Math.random() > 0.5 ? [0.0, 1.0, 1.0, 1.0] : [0.8, 0.0, 1.0, 1.0]);
              }

              const count = isTetris ? 60 : 30; // Increased particle count
              this.particleSystem.emitParticles(worldX, worldY, 0.0, count, color);
          }
      });
  }

  onLock() {
      this.visualEffects.triggerLock(0.3);
      this.visualEffects.triggerShake(0.2, 0.15);
  }

  onHold() {
      this.visualEffects.triggerFlash(0.2);
      this.particleSystem.emitParticles(4.5 * 2.2, -10.0 * 2.2, 0.0, 30, [0.5, 0.0, 1.0, 1.0]);
  }

  onHardDrop(x: number, y: number, distance: number) {
      const worldX = x * 2.2;
      const startRow = y - distance;

      // Trail particles
      for(let i=0; i<distance; i++) {
          const r = startRow + i;
          const worldY = r * -2.2;
          this.particleSystem.emitParticles(worldX, worldY, 0.0, 8, [0.4, 0.9, 1.0, 0.5]);
      }

      // Impact Splash
      const impactY = y * -2.2;
      for (let i=0; i<60; i++) {
          const angle = (i / 60) * Math.PI * 2;
          const speed = 15.0 + Math.random() * 10.0;
          // White/Cyan Splash
          const color = Math.random() > 0.5 ? [1.0, 1.0, 1.0, 1.0] : [0.0, 1.0, 1.0, 1.0];
          this.particleSystem.emitParticlesRadial(worldX, impactY, 0.0, angle, speed, color);
      }

      const camY = -20.0;
      const camZ = 75.0;
      const fov = (35 * Math.PI) / 180;
      const visibleHeight = 2.0 * Math.tan(fov / 2.0) * camZ;
      const visibleWidth = visibleHeight * (this.canvasWebGPU.width / this.canvasWebGPU.height);

      const uvX = 0.5 + (worldX - 10.0) / visibleWidth;
      const uvY = 0.5 - (impactY - camY) / visibleHeight;

      this.visualEffects.triggerShockwave([uvX, uvY]);
      this.visualEffects.triggerShake(1.2, 0.2);
      this.visualEffects.triggerAberration(1.5);
  }

  renderPlayfield_WebGPU(state: any) {
    this.state = state;
  }

  renderMainScreen(state: any) {
    if (state.level !== this.visualEffects.currentLevel) {
      this.visualEffects.currentLevel = state.level;
      this.visualEffects.updateVideoForLevel(this.visualEffects.currentLevel, this.currentTheme.levelVideos);
    }

    this.renderPlayfield_WebGPU(state);
    this.renderPiece(this.nextPieceContext, state.nextPiece);
    this.renderPiece(this.holdPieceContext, state.holdPiece);

    const scoreEl = document.getElementById('score');
    if (scoreEl) scoreEl.textContent = state.score;

    const linesEl = document.getElementById('lines');
    if (linesEl) linesEl.textContent = state.lines;

    const levelEl = document.getElementById('level');
    if (levelEl) levelEl.textContent = state.level;
  }

  clearScreen({ lines, score }: any) {}
  renderStartScreen() {}
  renderPauseScreen() {}
  renderEndScreen({ score }: any) {
    const el = document.getElementById('game-over');
    if (el) el.style.display = 'block';
  }

  //// ***** WEBGPU ***** ////

  async preRender() {
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) return;
    this.device = await adapter.requestDevice();

    const dpr = window.devicePixelRatio || 1;
    this.canvasWebGPU.width = this.width * dpr;
    this.canvasWebGPU.height = this.height * dpr;

    const presentationFormat = navigator.gpu.getPreferredCanvasFormat();

    this.ctxWebGPU.configure({
      device: this.device,
      format: presentationFormat,
      alphaMode: 'premultiplied',
    });

    // --- Main Block Pipeline ---
    const shader = Shaders();
    const cubeData = CubeData();

    this.numberOfVertices = cubeData.positions.length / 3;
    this.vertexBuffer = this.CreateGPUBuffer(this.device, cubeData.positions);
    this.normalBuffer = this.CreateGPUBuffer(this.device, cubeData.normals);
    this.uvBuffer = this.CreateGPUBuffer(this.device, cubeData.uvs);

    // Create explicit layout to support Dynamic Offsets
    const bindGroupLayout = this.device.createBindGroupLayout({
        entries: [
            {
                binding: 0,
                visibility: GPUShaderStage.VERTEX,
                buffer: { type: 'uniform', hasDynamicOffset: true, minBindingSize: 208 } // VP(64)+Model(64)+Normal(64)+Color(16)=208
            },
            {
                binding: 1,
                visibility: GPUShaderStage.FRAGMENT,
                buffer: { type: 'uniform' }
            }
        ]
    });

    this.pipeline = this.device.createRenderPipeline({
      label: 'main pipeline',
      layout: this.device.createPipelineLayout({ bindGroupLayouts: [bindGroupLayout] }),
      vertex: {
        module: this.device.createShaderModule({ code: shader.vertex }),
        entryPoint: "main",
        buffers: [
          { arrayStride: 12, attributes: [{ shaderLocation: 0, format: "float32x3", offset: 0 }] }, // pos
          { arrayStride: 12, attributes: [{ shaderLocation: 1, format: "float32x3", offset: 0 }] }, // normal
          { arrayStride: 8,  attributes: [{ shaderLocation: 2, format: "float32x2", offset: 0 }] }, // uv
        ],
      },
      fragment: {
        module: this.device.createShaderModule({ code: shader.fragment }),
        entryPoint: "main",
        targets: [
          {
            format: 'rgba16float', // Higher precision format
            blend: {
              color: { srcFactor: "src-alpha", dstFactor: "one-minus-src-alpha", operation: "add" },
              alpha: { srcFactor: "one", dstFactor: "one-minus-src-alpha", operation: "add" },
            },
        }],
      },
      primitive: { topology: "triangle-list" },
      depthStencil: {
        format: "depth24plus",
        depthWriteEnabled: true,
        depthCompare: "less",
      },
      multisample: {
        count: 4, // 4x MSAA
      },
    });

    // --- Background Pipeline ---
    const backgroundShader = BackgroundShaders();
    const bgData = FullScreenQuadData();
    this.backgroundVertexBuffer = this.CreateGPUBuffer(this.device, bgData.positions);

    this.backgroundPipeline = this.device.createRenderPipeline({
        label: 'background pipeline',
        layout: 'auto',
        vertex: {
            module: this.device.createShaderModule({ code: backgroundShader.vertex }),
            entryPoint: 'main',
            buffers: [{ arrayStride: 12, attributes: [{ shaderLocation: 0, format: 'float32x3', offset: 0 }] }]
        },
        fragment: {
            module: this.device.createShaderModule({ code: backgroundShader.fragment }),
            entryPoint: 'main',
            targets: [{ format: 'rgba16float' }] // Higher precision format
        },
        primitive: { topology: 'triangle-list' },
        multisample: {
            count: 4, // 4x MSAA to match render pass
        }
    });

    this.backgroundUniformBuffer = this.device.createBuffer({
        size: 64,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
    });

    this.backgroundBindGroup = this.device.createBindGroup({
        layout: this.backgroundPipeline.getBindGroupLayout(0),
        entries: [{ binding: 0, resource: { buffer: this.backgroundUniformBuffer } }]
    });

    const bgColors = this.currentTheme.backgroundColors;
    this.device.queue.writeBuffer(this.backgroundUniformBuffer, 16, new Float32Array(bgColors[0]));
    this.device.queue.writeBuffer(this.backgroundUniformBuffer, 32, new Float32Array(bgColors[1]));
    this.device.queue.writeBuffer(this.backgroundUniformBuffer, 48, new Float32Array(bgColors[2]));

    // --- Grid Pipeline ---
    const gridShader = GridShader();
    const gridData = GridData();
    this.gridVertexCount = gridData.length / 3;
    this.gridVertexBuffer = this.CreateGPUBuffer(this.device, gridData);

    this.gridPipeline = this.device.createRenderPipeline({
        label: 'grid pipeline',
        layout: 'auto',
        vertex: {
            module: this.device.createShaderModule({ code: gridShader.vertex }),
            entryPoint: 'main',
            buffers: [{ arrayStride: 12, attributes: [{ shaderLocation: 0, format: 'float32x3', offset: 0 }] }]
        },
        fragment: {
            module: this.device.createShaderModule({ code: gridShader.fragment }),
            entryPoint: 'main',
            targets: [{
                format: 'rgba16float', // Higher precision format
                blend: {
                    color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha', operation: 'add' },
                    alpha: { srcFactor: 'one', dstFactor: 'one', operation: 'add' },
                }
            }]
        },
        primitive: { topology: 'line-list' },
        depthStencil: {
            format: "depth24plus",
            depthWriteEnabled: false,
            depthCompare: "less",
        },
        multisample: {
            count: 4, // 4x MSAA
        }
    });


    // --- Particle Pipeline ---
    const particleShader = ParticleShaders();

    this.particlePipeline = this.device.createRenderPipeline({
        label: 'particle pipeline',
        layout: 'auto',
        vertex: {
            module: this.device.createShaderModule({ code: particleShader.vertex }),
            entryPoint: 'main',
            buffers: [{
                    arrayStride: 64, // Struct is 64 bytes (padded)
                    stepMode: 'instance',
                    attributes: [
                        { shaderLocation: 0, format: 'float32x3', offset: 0 },   // pos
                        { shaderLocation: 1, format: 'float32x4', offset: 32 },  // color (at 32 due to alignment?)
                        { shaderLocation: 2, format: 'float32',   offset: 48 },  // scale
                        // velocity(16) and life(52) etc are skipped in vertex shader input
                    ]
                }]
        },
        fragment: {
            module: this.device.createShaderModule({ code: particleShader.fragment }),
            entryPoint: 'main',
            targets: [{
                format: 'rgba16float', // Higher precision format
                blend: {
                    color: { srcFactor: 'src-alpha', dstFactor: 'one', operation: 'add' },
                    alpha: { srcFactor: 'one', dstFactor: 'one', operation: 'add' },
                }
            }]
        },
        primitive: { topology: 'triangle-list' },
        depthStencil: {
            format: 'depth24plus',
            depthWriteEnabled: false, // Particles don't write to depth
            depthCompare: 'less',
        },
        multisample: {
            count: 4, // 4x MSAA
        }
    });

    // Particle Storage Buffer
    this.particleVertexBuffer = this.device.createBuffer({
        size: 64 * this.particleSystem.maxParticles, // 64 bytes per particle
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });

    this.particleUniformBuffer = this.device.createBuffer({
        size: 64,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
    });

    this.particleComputeUniformBuffer = this.device.createBuffer({
        size: 16, // deltaTime(4) + time(4) + padding
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
    });

    this.particleBindGroup = this.device.createBindGroup({
        layout: this.particlePipeline.getBindGroupLayout(0),
        entries: [{ binding: 0, resource: { buffer: this.particleUniformBuffer } }]
    });

    // --- Particle Compute Pipeline ---
    this.particleComputePipeline = this.device.createComputePipeline({
        label: 'particle compute pipeline',
        layout: 'auto',
        compute: {
            module: this.device.createShaderModule({ code: ParticleComputeShader }),
            entryPoint: 'main',
        },
    });

    this.particleComputeBindGroup = this.device.createBindGroup({
        layout: this.particleComputePipeline.getBindGroupLayout(0),
        entries: [
            { binding: 0, resource: { buffer: this.particleVertexBuffer } },
            { binding: 1, resource: { buffer: this.particleComputeUniformBuffer } }
        ]
    });

    this.gridBindGroup = this.device.createBindGroup({
        layout: this.gridPipeline.getBindGroupLayout(0),
        entries: [{ binding: 0, resource: { buffer: this.particleUniformBuffer } }]
    });

    // --- Post Process Pipeline ---
    const ppShader = PostProcessShaders();

    this.postProcessPipeline = this.device.createRenderPipeline({
        label: 'post process pipeline',
        layout: 'auto',
        vertex: {
            module: this.device.createShaderModule({ code: ppShader.vertex }),
            entryPoint: 'main',
            buffers: [{ arrayStride: 12, attributes: [{ shaderLocation: 0, format: 'float32x3', offset: 0 }] }]
        },
        fragment: {
            module: this.device.createShaderModule({ code: ppShader.fragment }),
            entryPoint: 'main',
            targets: [{ format: presentationFormat }]
        },
        primitive: { topology: 'triangle-list' }
    });

    this.postProcessUniformBuffer = this.device.createBuffer({
        size: 32,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
    });

    this.sampler = this.device.createSampler({
        magFilter: 'linear',
        minFilter: 'linear',
        mipmapFilter: 'linear', // Use if you have mipmaps
        maxAnisotropy: 16, // Critical for angled surfaces
    });

    // Offscreen Texture creation with higher precision format
    this.offscreenTexture = this.device.createTexture({
        size: [this.canvasWebGPU.width, this.canvasWebGPU.height, 1],
        format: 'rgba16float', // Higher precision format
        usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING
    });

    // MSAA Texture for anti-aliasing
    this.msaaTexture = this.device.createTexture({
        size: [this.canvasWebGPU.width, this.canvasWebGPU.height, 1],
        sampleCount: 4, // 4x MSAA
        format: 'rgba16float',
        usage: GPUTextureUsage.RENDER_ATTACHMENT,
    });

    this.depthTexture = this.device.createTexture({
      size: [this.canvasWebGPU.width, this.canvasWebGPU.height, 1],
      format: "depth24plus",
      usage: GPUTextureUsage.RENDER_ATTACHMENT,
      sampleCount: 4, // MSAA for depth as well
    });

    this.postProcessBindGroup = this.device.createBindGroup({
        layout: this.postProcessPipeline.getBindGroupLayout(0),
        entries: [
            { binding: 0, resource: { buffer: this.postProcessUniformBuffer } },
            { binding: 1, resource: this.sampler },
            { binding: 2, resource: this.offscreenTexture.createView() }
        ]
    });

    this.fragmentUniformBuffer = this.device.createBuffer({
      size: 96,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    let eyePosition = [9.9, -20.9, 85.0];
    if (this.shakeTimer > 0) {
        const shakeX = (Math.random() - 0.5) * this.shakeMagnitude;
        const shakeY = (Math.random() - 0.5) * this.shakeMagnitude;
        eyePosition[0] += shakeX;
        eyePosition[1] += shakeY;
    }

    let lightPosition = new Float32Array([-5.0, 0.0, 0.0]);

    Matrix.mat4.identity(this.VIEWMATRIX);
    Matrix.mat4.lookAt(this.VIEWMATRIX, eyePosition, [9.9, -20.9, 0.0], [0.0, 1.0, 0.0]);

    Matrix.mat4.identity(this.PROJMATRIX);
    let fovy = (35 * Math.PI) / 180;
    Matrix.mat4.perspective(this.PROJMATRIX, fovy, this.canvasWebGPU.width / this.canvasWebGPU.height, 1, 150);

    Matrix.mat4.multiply(this.vpMatrix, this.PROJMATRIX, this.VIEWMATRIX);

    this.device.queue.writeBuffer(this.fragmentUniformBuffer, 0, lightPosition);
    this.device.queue.writeBuffer(this.fragmentUniformBuffer, 16, new Float32Array(eyePosition));
    // Pad color to vec4 (R, G, B, 1.0)
    const themeColor = [...this.currentTheme[5]];
    if (themeColor.length === 3) themeColor.push(1.0);
    this.device.queue.writeBuffer(this.fragmentUniformBuffer, 32, new Float32Array(themeColor));

    this.device.queue.writeBuffer(this.fragmentUniformBuffer, 52, new Float32Array([this.useGlitch ? 1.0 : 0.0]));
    // Padding/New Uniforms: 56, 60 available

    // --- BORDER INITIALIZATION (STATIC) ---
    this.createBorderBuffers();

    // --- BLOCKS INITIALIZATION ---
    // Create one large buffer for all blocks
    this.vertexUniformBuffer = this.device.createBuffer({
      size: this.MAX_BLOCKS * 256,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    // Create ONE BindGroup for blocks with dynamic offset
    this.blockBindGroup = this.device.createBindGroup({
        layout: bindGroupLayout,
        entries: [
            {
                binding: 0,
                resource: {
                    buffer: this.vertexUniformBuffer,
                    offset: 0,
                    size: 208
                }
            },
            {
                binding: 1,
                resource: {
                    buffer: this.fragmentUniformBuffer
                }
            }
        ]
    });

    // Create ONE BindGroup for border (uses same layout and buffer type)
    this.borderBindGroup = this.device.createBindGroup({
        layout: bindGroupLayout,
        entries: [
            {
                binding: 0,
                resource: {
                    buffer: this.vertexUniformBuffer_border,
                    offset: 0,
                    size: 208
                }
            },
            {
                binding: 1,
                resource: {
                    buffer: this.fragmentUniformBuffer
                }
            }
        ]
    });

    this.Frame();
  }

  CreateGPUBuffer = (
    device: any,
    data: any,
    usageFlag = GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST
  ) => {
    const buffer = device.createBuffer({
      size: data.byteLength,
      usage: usageFlag,
      mappedAtCreation: true,
    });
    new Float32Array(buffer.getMappedRange()).set(data);
    buffer.unmap();
    return buffer;
  };

  Frame = () => {
    if (!this.device) return;
    const dt = 1.0/60.0;

    this.visualEffects.updateEffects(dt);

    const time = (performance.now() - this.startTime) / 1000.0;
    let camX = 9.9;
    let camY = -20.9;
    let camZ = 85.0;

    camX += Math.sin(time * 0.2) * 2.0;
    camY += Math.cos(time * 0.3) * 1.0;

    const shake = this.visualEffects.getShakeOffset();
    camX += shake.x;
    camY += shake.y;

    const eyePosition = new Float32Array([camX, camY, camZ]);
    Matrix.mat4.lookAt(this.VIEWMATRIX, eyePosition, [9.9, -20.9, 0.0], [0.0, 1.0, 0.0]);
    Matrix.mat4.multiply(this.vpMatrix, this.PROJMATRIX, this.VIEWMATRIX);

    this.device.queue.writeBuffer(this.fragmentUniformBuffer, 16, eyePosition);

    // --- PARTICLES UPDATE (COMPUTE) ---
    // 1. Upload new particles
    if (this.particleSystem.pendingUploads.length > 0) {
        for(const upload of this.particleSystem.pendingUploads) {
            // Calculate byte offset in storage buffer (index * 64 bytes)
            const byteOffset = upload.index * 64;
            this.device.queue.writeBuffer(this.particleVertexBuffer, byteOffset, upload.data);
        }
        this.particleSystem.clearPending();
    }

    // 2. Dispatch Compute
    this.device.queue.writeBuffer(this.particleComputeUniformBuffer, 0, new Float32Array([dt, time]));

    const commandEncoder = this.device.createCommandEncoder();
    const computePass = commandEncoder.beginComputePass();
    computePass.setPipeline(this.particleComputePipeline);
    computePass.setBindGroup(0, this.particleComputeBindGroup);
    computePass.dispatchWorkgroups(Math.ceil(this.particleSystem.maxParticles / 64));
    computePass.end();

    this.device.queue.writeBuffer(this.particleUniformBuffer, 0, this.vpMatrix as Float32Array);
    this.device.queue.writeBuffer(this.backgroundUniformBuffer, 0, new Float32Array([time]));
    this.device.queue.writeBuffer(this.backgroundUniformBuffer, 8, new Float32Array([this.canvasWebGPU.width, this.canvasWebGPU.height]));
    this.device.queue.writeBuffer(this.fragmentUniformBuffer, 48, new Float32Array([time]));
    this.device.queue.writeBuffer(this.fragmentUniformBuffer, 52, new Float32Array([this.useGlitch ? 1.0 : 0.0]));

    // Calculate Lock Percent
    let lockPercent = 0.0;
    if (this.state && (this.state as any).lockTimer !== undefined && (this.state as any).lockDelayTime > 0) {
        lockPercent = (this.state as any).lockTimer / (this.state as any).lockDelayTime;
    }
    this.device.queue.writeBuffer(this.fragmentUniformBuffer, 56, new Float32Array([lockPercent]));

    this.device.queue.writeBuffer(this.postProcessUniformBuffer, 0, new Float32Array([
        time, this.useGlitch ? 1.0 : 0.0,
        this.visualEffects.shockwaveCenter[0], this.visualEffects.shockwaveCenter[1],
        this.visualEffects.shockwaveTimer, this.visualEffects.aberrationIntensity, 0, 0
    ]));

    // *** Render Pass 1: Draw Scene to Offscreen Texture with MSAA ***
    const textureViewOffscreen = this.offscreenTexture.createView();

    // Render everything in a single MSAA pass
    const renderVideo = this.visualEffects.isVideoPlaying;
    const clearColors = this.visualEffects.getClearColors();

    // 2. Render Playfield
    const blockCount = this.updateBlockUniforms(this.state);

    this.renderPassDescription = {
      colorAttachments: [{
          view: this.msaaTexture.createView(), // Render to MSAA texture
          resolveTarget: textureViewOffscreen, // Resolve to offscreen texture
          clearValue: { r: clearColors.r, g: clearColors.g, b: clearColors.b, a: 0.0 },
          loadOp: 'clear', // Must clear MSAA textures
          storeOp: "store",
      }],
      depthStencilAttachment: {
        view: this.depthTexture.createView(),
        depthClearValue: 1.0,
        depthLoadOp: 'clear',
        depthStoreOp: 'store'
      },
    };

    const passEncoder = commandEncoder.beginRenderPass(this.renderPassDescription);

    // Render Background first (if not using video)
    if (!renderVideo) {
        passEncoder.setPipeline(this.backgroundPipeline);
        passEncoder.setVertexBuffer(0, this.backgroundVertexBuffer);
        passEncoder.setBindGroup(0, this.backgroundBindGroup);
        passEncoder.draw(6);
    }

    // Render Grid
    passEncoder.setPipeline(this.gridPipeline);
    passEncoder.setBindGroup(0, this.gridBindGroup);
    passEncoder.setVertexBuffer(0, this.gridVertexBuffer);
    passEncoder.draw(this.gridVertexCount);

    passEncoder.setPipeline(this.pipeline);
    passEncoder.setVertexBuffer(0, this.vertexBuffer);
    passEncoder.setVertexBuffer(1, this.normalBuffer);
    passEncoder.setVertexBuffer(2, this.uvBuffer);

    // Draw Static Border
    let borderOffset = 0;
    for (let i = 0; i < this.borderCount; i++) {
      passEncoder.setBindGroup(0, this.borderBindGroup, [borderOffset]);
      passEncoder.draw(this.numberOfVertices);
      borderOffset += 256;
    }

    // Draw Blocks (Dynamic)
    let blockOffset = 0;
    for (let i = 0; i < blockCount; i++) {
      passEncoder.setBindGroup(0, this.blockBindGroup, [blockOffset]);
      passEncoder.draw(this.numberOfVertices);
      blockOffset += 256;
    }

    // Draw Particles
    // Use instance count = maxParticles, but we check life in shader?
    // Or we should manage active count.
    // Compute shader clears life when < 0.
    // Vertex shader can discard? Or we draw all and discard in frag.
    // Drawing 4000 quads is cheap.
    passEncoder.setPipeline(this.particlePipeline);
    passEncoder.setBindGroup(0, this.particleBindGroup);
    passEncoder.setVertexBuffer(0, this.particleVertexBuffer);
    passEncoder.draw(6, this.particleSystem.maxParticles, 0, 0);

    passEncoder.end();

    const textureViewScreen = this.ctxWebGPU.getCurrentTexture().createView();
    const ppPassDescriptor: GPURenderPassDescriptor = {
        colorAttachments: [{
            view: textureViewScreen,
            clearValue: { r: 0.0, g: 0.0, b: 0.0, a: 0.0 },
            loadOp: 'clear',
            storeOp: 'store'
        }]
    };

    const ppPassEncoder = commandEncoder.beginRenderPass(ppPassDescriptor);
    ppPassEncoder.setPipeline(this.postProcessPipeline);
    ppPassEncoder.setBindGroup(0, this.postProcessBindGroup);
    ppPassEncoder.setVertexBuffer(0, this.backgroundVertexBuffer);
    ppPassEncoder.draw(6);
    ppPassEncoder.end();

    this.device.queue.submit([commandEncoder.finish()]);
    requestAnimationFrame(this.Frame);
  };

  updateBlockUniforms({ playfield }: any): number {
    if (!this.device) return 0;

    let blockIndex = 0;
    const playfield_length = playfield.length;

    // Create view on pre-allocated buffer
    const floatView = new Float32Array(this.blockUniformData);

    for (let row = 0; row < playfield_length; row++) {
      for (let colom = 0; colom < playfield[row].length; colom++) {
        if (!playfield[row][colom]) continue;
        if (blockIndex >= this.MAX_BLOCKS) break;

        let value = playfield[row][colom];
        let colorBlockindex = Math.abs(value);
        let alpha = value < 0 ? 0.3 : 0.85;

        let color = this.currentTheme[colorBlockindex];
        if (!color) color = this.currentTheme[0];

        // Offset in floats (256 bytes = 64 floats)
        const offsetFloats = blockIndex * 64;

        Matrix.mat4.identity(this.MODELMATRIX);
        Matrix.mat4.translate(this.MODELMATRIX, this.MODELMATRIX, [colom * 2.2, row * -2.2, 0.0]);

        Matrix.mat4.identity(this.NORMALMATRIX);
        Matrix.mat4.invert(this.NORMALMATRIX, this.MODELMATRIX);
        Matrix.mat4.transpose(this.NORMALMATRIX, this.NORMALMATRIX);

        // Fill data: VP(0) + Model(16) + Normal(32) + Color(48)
        floatView.set(this.vpMatrix, offsetFloats + 0);
        floatView.set(this.MODELMATRIX, offsetFloats + 16);
        floatView.set(this.NORMALMATRIX, offsetFloats + 32);

        // Color is vec4
        floatView[offsetFloats + 48] = color[0];
        floatView[offsetFloats + 49] = color[1];
        floatView[offsetFloats + 50] = color[2];
        floatView[offsetFloats + 51] = alpha;

        blockIndex++;
      }
    }

    // Upload only used portion
    if (blockIndex > 0) {
        this.device.queue.writeBuffer(
            this.vertexUniformBuffer,
            0,
            this.blockUniformData,
            0,
            blockIndex * 256
        );
    }
    return blockIndex;
  }

  // Renamed and refactored to just create buffer, not render
  createBorderBuffers() {
    if (!this.device) return;

    const state_Border = {
      playfield: [
        [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
        [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
        [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
        [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
        [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
        [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
        [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
        [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
        [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
        [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
        [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
        [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
        [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
        [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
        [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
        [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
        [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
        [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
        [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
        [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
        [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
        [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
      ],
    };

    const playfield_length = state_Border.playfield.length;
    const vertexUniformSizeBuffer = 256 * 100; // Safe upper bound for border blocks

    this.vertexUniformBuffer_border = this.device.createBuffer({
      size: vertexUniformSizeBuffer,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    const floatView = new Float32Array(this.borderUniformData);
    let borderIndex = 0;

    for (let row = 0; row < playfield_length; row++) {
      for (let colom = 0; colom < state_Border.playfield[row].length; colom++) {
        if (!state_Border.playfield[row][colom]) continue;

        Matrix.mat4.identity(this.MODELMATRIX);
        Matrix.mat4.translate(this.MODELMATRIX, this.MODELMATRIX, [colom * 2.2 - 2.2, row * -2.2 + 2.2, 0.0]);

        Matrix.mat4.identity(this.NORMALMATRIX);
        Matrix.mat4.invert(this.NORMALMATRIX, this.MODELMATRIX);
        Matrix.mat4.transpose(this.NORMALMATRIX, this.NORMALMATRIX);

        const offsetFloats = borderIndex * 64;
        floatView.set(this.vpMatrix, offsetFloats + 0);
        floatView.set(this.MODELMATRIX, offsetFloats + 16);
        floatView.set(this.NORMALMATRIX, offsetFloats + 32);

        const color = [...this.currentTheme.border, 1.0];
        floatView[offsetFloats + 48] = color[0];
        floatView[offsetFloats + 49] = color[1];
        floatView[offsetFloats + 50] = color[2];
        floatView[offsetFloats + 51] = 1.0;

        borderIndex++;
      }
    }

    this.borderCount = borderIndex;
    this.device.queue.writeBuffer(this.vertexUniformBuffer_border, 0, this.borderUniformData, 0, borderIndex * 256);
  }
}
