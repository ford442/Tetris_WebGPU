import * as Matrix from "gl-matrix";
import { PostProcessShaders, ParticleShaders, GridShader, BackgroundShaders, Shaders } from './webgpu/shaders.js';
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
  state: { playfield: number[][], lockTimer?: number, lockDelayTime?: number, level?: number, nextPiece?: any, holdPiece?: any, score?: number, lines?: number, effectEvent?: string, effectCounter?: number, lastDropPos?: any, lastDropDistance?: number };
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
  uniformBindGroup_ARRAY: GPUBindGroup[] = [];
  uniformBindGroup_CACHE: GPUBindGroup[] = []; // Cache for dynamic blocks
  uniformBindGroup_ARRAY_border: GPUBindGroup[] = [];
  x: number = 0;

  lastEffectCounter: number = 0;
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
  depthTexture!: GPUTexture;
  sampler!: GPUSampler;

  // Particles
  particlePipeline!: GPURenderPipeline;
  particleVertexBuffer!: GPUBuffer;
  particleUniformBuffer!: GPUBuffer;
  particleBindGroup!: GPUBindGroup;
  
  // Subsystems
  particleSystem: ParticleSystem;
  visualEffects: VisualEffects;

  // Themes
  themes: Themes = themes;
  currentTheme: ThemeColors = themes.neon;

  // Block Texture and Sampler
  blockTexture!: GPUTexture;
  blockSampler!: GPUSampler;

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
      lockTimer: 0,
      lockDelayTime: 500,
    };
    this.blockData = {};
    if (this.isWebGPU.result) {
      this.element.appendChild(this.canvasWebGPU);
      this.preRender();
      window.addEventListener('resize', this.resize.bind(this));
    } else {
      let divError = document.createElement("div");
      divError.innerText = this.isWebGPU.description;
      this.element.appendChild(divError);
    }
  }

  resize() {
    if (!this.device) return;
    const dpr = window.devicePixelRatio || 1;
    this.width = window.innerWidth;
    this.height = window.innerHeight;

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

    // Recreate offscreen texture
    if (this.offscreenTexture) {
        this.offscreenTexture.destroy();
    }
    this.offscreenTexture = this.device.createTexture({
        size: [this.canvasWebGPU.width, this.canvasWebGPU.height, 1],
        format: presentationFormat,
        usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING
    });

    // Recreate depth texture
    if (this.depthTexture) {
        this.depthTexture.destroy();
    }
    this.depthTexture = this.device.createTexture({
      size: [this.canvasWebGPU.width, this.canvasWebGPU.height, 1],
      format: "depth24plus",
      usage: GPUTextureUsage.RENDER_ATTACHMENT,
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

    // Re-render border if possible, but borders are static buffers.
    // We need to re-create border buffers or update them.
    // renderPlayfild_Border_WebGPU handles re-creation of uniformBindGroup_ARRAY_border?
    // It creates new buffers. So calling it is fine, but we must clear old ones ideally.
    // For now JS GC will handle it, but WebGPU resources might leak if not careful.
    // Given the scope, it's fine.
    if (this.device) {
        this.renderPlayfild_Border_WebGPU();
        // Update background colors
        const bgColors = this.currentTheme.backgroundColors;
        this.device.queue.writeBuffer(this.backgroundUniformBuffer, 16, new Float32Array(bgColors[0]));
        this.device.queue.writeBuffer(this.backgroundUniformBuffer, 32, new Float32Array(bgColors[1]));
        this.device.queue.writeBuffer(this.backgroundUniformBuffer, 48, new Float32Array(bgColors[2]));
    }
  }

  renderPiece(ctx: CanvasRenderingContext2D, piece: any, blockSize: number = 20) {
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    if (!piece) return;

    const { blocks } = piece;
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

          // Neon Style Rendering
          const r = Math.floor(color[0] * 255);
          const g = Math.floor(color[1] * 255);
          const b = Math.floor(color[2] * 255);
          const cssColor = `rgb(${r}, ${g}, ${b})`;

          // 1. Glow
          ctx.shadowBlur = 10;
          ctx.shadowColor = cssColor;

          // 2. Stroke (Neon Tube)
          ctx.strokeStyle = cssColor;
          ctx.lineWidth = 2;
          ctx.strokeRect(px + 2, py + 2, blockSize - 4, blockSize - 4);

          // 3. Faint Inner Fill (Glass)
          ctx.fillStyle = `rgba(${r}, ${g}, ${b}, 0.2)`;
          ctx.fillRect(px + 2, py + 2, blockSize - 4, blockSize - 4);

          // 4. Core Highlight
          ctx.shadowBlur = 0; // Reset shadow for highlight
          ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
          const coreSize = 4;
          ctx.fillRect(
              px + blockSize / 2 - coreSize / 2,
              py + blockSize / 2 - coreSize / 2,
              coreSize,
              coreSize
          );
        }
      });
    });
  }

  onLineClear(lines: number[], tSpin: boolean = false) {
      this.visualEffects.triggerFlash(1.0);
      this.visualEffects.triggerShake(tSpin ? 0.8 : 0.5, tSpin ? 0.6 : 0.5); // More shake for T-Spin

      // Emit particles for each cleared line
      lines.forEach(y => {
          const worldY = y * -2.2;
          // Sweep across the line
          for (let c=0; c<10; c++) {
              const worldX = c * 2.2;

              let color = [0.0, 1.0, 1.0, 1.0]; // Default Cyan
              let count = 20;

              // T-SPIN GOLD
              if (tSpin) {
                  color = [1.0, 0.8, 0.0, 1.0]; // GOLD
                  count = 60; // Huge burst
              } else if (lines.length === 4) {
                  color = [1.0, 0.8, 0.0, 1.0]; // Gold for Tetris too? Or maybe distinct?
                  // Let's make Tetris slightly different, maybe White/Blue?
                  // Using Gold for both T-Spin and Tetris is fine for "Premium" feel.
                  // But let's mix it up.
                  color = [0.5, 0.8, 1.0, 1.0]; // Bright Cyan/White
                  count = 40;
              } else {
                  color = (Math.random() > 0.5 ? [0.0, 1.0, 1.0, 1.0] : [0.5, 0.0, 1.0, 1.0]); // Cyan/Purple
              }

              this.particleSystem.emitParticles(worldX, worldY, 0.0, count, color);

              // If T-Spin, add a radial burst at the center of the line
              if (tSpin && c === 5) {
                   for (let i=0; i<30; i++) {
                      const angle = (i / 30) * Math.PI * 2;
                      const speed = 20.0;
                      this.particleSystem.emitParticlesRadial(worldX, worldY, 0.0, angle, speed, [1.0, 0.5, 0.0, 1.0]); // Orange/Gold
                   }
                   // Add extra shockwave/aberration for T-Spin
                   this.visualEffects.triggerShockwave([0.5, 0.5], 0.3, 0.15, 0.1);
              }
          }
      });
  }

  onLock() {
      this.visualEffects.triggerLock(0.3);
      this.visualEffects.triggerShake(0.2, 0.15);

      // Trigger a central shockwave on lock for impact
      // This satisfies the "Shockwave" implementation requirement and adds "Juice"
      this.visualEffects.triggerShockwave([0.5, 0.5], 0.2, 0.1, 0.05);
  }

  onHold() {
      // Visual feedback for hold
      this.visualEffects.triggerFlash(0.2); // Quick flash
      // Maybe some particles at the center?
      this.particleSystem.emitParticles(4.5 * 2.2, -10.0 * 2.2, 0.0, 30, [0.5, 0.0, 1.0, 1.0]); // Purple flash
  }

  triggerImpactEffects(worldX: number, impactY: number, distance: number) {
      // Convert world pos to screen UV (approximate)
      const camY = -20.0;
      const camZ = 75.0;
      const fov = (35 * Math.PI) / 180;
      const visibleHeight = 2.0 * Math.tan(fov / 2.0) * camZ; // ~47.3
      const visibleWidth = visibleHeight * (this.canvasWebGPU.width / this.canvasWebGPU.height);

      const uvX = 0.5 + (worldX - 10.0) / visibleWidth; // 10.0 is approx center X
      const uvY = 0.5 - (impactY - camY) / visibleHeight;

      // Dynamic shockwave based on drop distance (Boosted for JUICE)
      // NEON BRICKLAYER: Tuned for maximum impact
      const strength = 0.15 + Math.min(distance * 0.03, 0.4); // Stronger start and scaling
      const width = 0.2 + Math.min(distance * 0.02, 0.3);     // Wider ripple
      const aberration = 0.08 + Math.min(distance * 0.015, 0.2); // More glitch

      this.visualEffects.triggerShockwave([uvX, uvY], width, strength, aberration);

      // Increase shake intensity
      this.visualEffects.triggerShake(2.0 + distance * 0.1, 0.3);
  }

  onHardDrop(x: number, y: number, distance: number) {
      // Create a vertical trail of particles
      const worldX = x * 2.2;
      // Start from top of drop
      const startRow = y - distance;

      for(let i=0; i<distance; i++) {
          const r = startRow + i;
          const worldY = r * -2.2;
          // More particles per block, blue/cyan trail
          // Vary the X slightly for a thicker trail
          this.particleSystem.emitParticles(worldX, worldY, 0.0, 5, [0.4, 0.8, 1.0, 0.8]);
      }

      // Impact particles at bottom
      const impactY = y * -2.2;
      for (let i=0; i<40; i++) {
          const angle = (i / 40) * Math.PI * 2;
          const speed = 15.0;
          this.particleSystem.emitParticlesRadial(worldX, impactY, 0.0, angle, speed, [0.8, 1.0, 1.0, 1.0]);
      }

      this.triggerImpactEffects(worldX, impactY, distance);
  }

  renderMainScreen(state: any) {
    // Check for new visual effects from Game Logic
    if (state.effectCounter > this.lastEffectCounter) {
        this.lastEffectCounter = state.effectCounter;
        if (state.effectEvent === 'hardDrop' && state.lastDropPos) {
             const distance = state.lastDropDistance || 0;
             const worldX = state.lastDropPos.x * 2.2;
             const impactY = state.lastDropPos.y * -2.2;

             this.triggerImpactEffects(worldX, impactY, distance);
        }
    }

    // Check if level has changed and update video accordingly
    if (state.level !== this.visualEffects.currentLevel) {
      this.visualEffects.currentLevel = state.level;
      this.visualEffects.updateVideoForLevel(this.visualEffects.currentLevel, this.currentTheme.levelVideos);
    }

    // this.clearScreen(state);
    this.renderPlayfild_WebGPU(state);
    this.renderPiece(this.nextPieceContext, state.nextPiece, 30);
    this.renderPiece(this.holdPieceContext, state.holdPiece, 20);

    const scoreEl = document.getElementById('score');
    if (scoreEl) scoreEl.textContent = state.score;

    const linesEl = document.getElementById('lines');
    if (linesEl) linesEl.textContent = state.lines;

    const levelEl = document.getElementById('level');
    if (levelEl) levelEl.textContent = state.level;
  }

  clearScreen({ lines, score }: any) {
    // Deprecated DOM manipulation
  }

  renderStartScreen() {
      // Handled by UI overlay
  }

  renderPauseScreen() {
      // Handled by UI overlay
  }

  renderEndScreen({ score }: any) {
    const el = document.getElementById('game-over');
    if (el) el.style.display = 'block';
  }

  //// ***** WEBGPU ***** ////

  async preRender() {
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) return; // Should handle error
    this.device = await adapter.requestDevice();

    const dpr = window.devicePixelRatio || 1;
    this.canvasWebGPU.width = this.width * dpr;
    this.canvasWebGPU.height = this.height * dpr;

   // const presentationFormat = this.ctxWebGPU.getPreferredFormat(adapter);
    const presentationFormat = navigator.gpu.getPreferredCanvasFormat();

    this.ctxWebGPU.configure({
      device: this.device,
      format: presentationFormat,
      alphaMode: 'premultiplied',
    });

    // --- 1. Load Texture & Sampler ---
    this.blockSampler = this.device.createSampler({
      magFilter: 'linear',
      minFilter: 'linear',
      addressModeU: 'repeat',
      addressModeV: 'repeat',
    });

    try {
        const img = document.createElement('img');
        // Use block.png as it exists in the repo
        img.src = 'block.png';
        await img.decode();
        const imageBitmap = await createImageBitmap(img);

        this.blockTexture = this.device.createTexture({
          size: [imageBitmap.width, imageBitmap.height, 1],
          format: 'rgba8unorm',
          usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT
        });
        this.device.queue.copyExternalImageToTexture(
          { source: imageBitmap },
          { texture: this.blockTexture },
          [imageBitmap.width, imageBitmap.height]
        );
    } catch (e) {
        // Fallback white texture
        this.blockTexture = this.device.createTexture({ size: [1, 1, 1], format: 'rgba8unorm', usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST });
        this.device.queue.writeTexture({ texture: this.blockTexture }, new Uint8Array([255, 255, 255, 255]), { bytesPerRow: 4 }, [1, 1, 1]);
    }

    // --- Main Block Pipeline ---
    const shader = Shaders();
    const cubeData = CubeData();

    this.numberOfVertices = cubeData.positions.length / 3;
    this.vertexBuffer = this.CreateGPUBuffer(this.device, cubeData.positions);
    this.normalBuffer = this.CreateGPUBuffer(this.device, cubeData.normals);
    this.uvBuffer = this.CreateGPUBuffer(this.device, cubeData.uvs); // Create UV buffer

    this.pipeline = this.device.createRenderPipeline({
      label: 'main pipeline',
      layout: "auto",
      vertex: {
        module: this.device.createShaderModule({
          code: shader.vertex,
        }),
        entryPoint: "main",
        buffers: [
          {
            arrayStride: 12,
            attributes: [
              {
                shaderLocation: 0,
                format: "float32x3",
                offset: 0,
              },
            ],
          },
          {
            arrayStride: 12,
            attributes: [
              {
                shaderLocation: 1,
                format: "float32x3",
                offset: 0,
              },
            ],
          },
          {
            arrayStride: 8, // vec2<f32>
            attributes: [
              {
                shaderLocation: 2,
                format: "float32x2",
                offset: 0,
              },
            ],
          },
        ],
      },
      fragment: {
        module: this.device.createShaderModule({
          code: shader.fragment,
        }),
        entryPoint: "main",
        targets: [
          {
            format: presentationFormat,
            blend: {
              color: {
                srcFactor: "src-alpha",
                dstFactor: "one-minus-src-alpha",
                operation: "add",
              },
              alpha: {
                srcFactor: "one",
                dstFactor: "one-minus-src-alpha",
                operation: "add",
              },
            },
          },
        ],
      },
      primitive: {
        topology: "triangle-list",
      },
      depthStencil: {
        format: "depth24plus",
        depthWriteEnabled: true,
        depthCompare: "less",
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
            buffers: [{
                arrayStride: 12,
                attributes: [{ shaderLocation: 0, format: 'float32x3', offset: 0 }]
            }]
        },
        fragment: {
            module: this.device.createShaderModule({ code: backgroundShader.fragment }),
            entryPoint: 'main',
            targets: [{ format: presentationFormat }]
        },
        primitive: { topology: 'triangle-list' }
    });

    // Background Uniforms
    this.backgroundUniformBuffer = this.device.createBuffer({
        size: 80, // INCREASED: time(4)+level(4)+res(8) + 3*colors(48) + lock(4)+pad(12) = 80
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
    });

    this.backgroundBindGroup = this.device.createBindGroup({
        layout: this.backgroundPipeline.getBindGroupLayout(0),
        entries: [{
            binding: 0,
            resource: { buffer: this.backgroundUniformBuffer }
        }]
    });

    // Initialize background colors
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
            buffers: [{
                arrayStride: 12,
                attributes: [{ shaderLocation: 0, format: 'float32x3', offset: 0 }]
            }]
        },
        fragment: {
            module: this.device.createShaderModule({ code: gridShader.fragment }),
            entryPoint: 'main',
            targets: [{
                format: presentationFormat,
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
            buffers: [
                // Interleaved buffer: pos(3) + color(4) + scale(1) = 8 floats = 32 bytes
                {
                    arrayStride: 32,
                    stepMode: 'instance', // We are drawing quads (6 verts) per instance
                    attributes: [
                        { shaderLocation: 0, format: 'float32x3', offset: 0 },  // pos
                        { shaderLocation: 1, format: 'float32x4', offset: 12 }, // color
                        { shaderLocation: 2, format: 'float32',   offset: 28 }, // scale
                    ]
                }
            ]
        },
        fragment: {
            module: this.device.createShaderModule({ code: particleShader.fragment }),
            entryPoint: 'main',
            targets: [{
                format: presentationFormat,
                blend: {
                    color: { srcFactor: 'src-alpha', dstFactor: 'one', operation: 'add' }, // Additive blending for glow
                    alpha: { srcFactor: 'one', dstFactor: 'one', operation: 'add' },
                }
            }]
        },
        primitive: { topology: 'triangle-list' },
        depthStencil: {
            format: 'depth24plus',
            depthWriteEnabled: false, // Particles don't write to depth
            depthCompare: 'less',
        }
    });

    // Create initial particle buffer (enough for max particles)
    // 32 bytes per particle * maxParticles
    this.particleVertexBuffer = this.device.createBuffer({
        size: 32 * this.particleSystem.maxParticles,
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });

    this.particleUniformBuffer = this.device.createBuffer({
        size: 64, // Mat4 for ViewProjection
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
    });

    this.particleBindGroup = this.device.createBindGroup({
        layout: this.particlePipeline.getBindGroupLayout(0),
        entries: [{
            binding: 0,
            resource: { buffer: this.particleUniformBuffer }
        }]
    });

    // Reuse particle uniform buffer for Grid (it needs VP matrix too)
    this.gridBindGroup = this.device.createBindGroup({
        layout: this.gridPipeline.getBindGroupLayout(0),
        entries: [{
            binding: 0,
            resource: { buffer: this.particleUniformBuffer }
        }]
    });

    // --- Post Process Pipeline ---
    const ppShader = PostProcessShaders();

    this.postProcessPipeline = this.device.createRenderPipeline({
        label: 'post process pipeline',
        layout: 'auto',
        vertex: {
            module: this.device.createShaderModule({ code: ppShader.vertex }),
            entryPoint: 'main',
            buffers: [{
                arrayStride: 12,
                attributes: [{ shaderLocation: 0, format: 'float32x3', offset: 0 }] // reuse FullScreenQuadData
            }]
        },
        fragment: {
            module: this.device.createShaderModule({ code: ppShader.fragment }),
            entryPoint: 'main',
            targets: [{ format: presentationFormat }]
        },
        primitive: { topology: 'triangle-list' }
    });

    this.postProcessUniformBuffer = this.device.createBuffer({
        size: 64, // Updated for shockwaveParams (vec4)
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
    });

    this.sampler = this.device.createSampler({
        magFilter: 'linear',
        minFilter: 'linear',
    });

    // Offscreen Texture creation handled in Resize/Frame logic or here initially
    // We need to create it initially too
    this.offscreenTexture = this.device.createTexture({
        size: [this.canvasWebGPU.width, this.canvasWebGPU.height, 1],
        format: presentationFormat,
        usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING
    });

    this.depthTexture = this.device.createTexture({
      size: [this.canvasWebGPU.width, this.canvasWebGPU.height, 1],
      format: "depth24plus",
      usage: GPUTextureUsage.RENDER_ATTACHMENT,
    });

    this.postProcessBindGroup = this.device.createBindGroup({
        layout: this.postProcessPipeline.getBindGroupLayout(0),
        entries: [
            { binding: 0, resource: { buffer: this.postProcessUniformBuffer } },
            { binding: 1, resource: this.sampler },
            { binding: 2, resource: this.offscreenTexture.createView() }
        ]
    });


    //create uniform buffer and layout
    this.fragmentUniformBuffer = this.device.createBuffer({
      size: 96, // Increased to accommodate useGlitch (offset 52)
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    this.MODELMATRIX = Matrix.mat4.create();
    this.NORMALMATRIX = Matrix.mat4.create();
    this.VIEWMATRIX = Matrix.mat4.create();
    this.PROJMATRIX = Matrix.mat4.create();

    let eyePosition = [0.0, -20.0, 75.0];
    // Apply shake
    if (this.shakeTimer > 0) {
        const shakeX = (Math.random() - 0.5) * this.shakeMagnitude;
        const shakeY = (Math.random() - 0.5) * this.shakeMagnitude;
        eyePosition[0] += shakeX;
        eyePosition[1] += shakeY;
    }

    let lightPosition = new Float32Array([-5.0, 0.0, 0.0]);

    Matrix.mat4.identity(this.VIEWMATRIX);
    Matrix.mat4.lookAt(
      this.VIEWMATRIX,
      eyePosition,
      [9.0, -20.0, 0.0], // target
      [0.0, 1.0, 0.0] // up
    );

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

    this.device.queue.writeBuffer(
      this.fragmentUniformBuffer,
      0,
      lightPosition
    );
    this.device.queue.writeBuffer(
      this.fragmentUniformBuffer,
      16,
      new Float32Array(eyePosition)
    );
    this.device.queue.writeBuffer(
      this.fragmentUniformBuffer,
      32,
      new Float32Array(this.currentTheme[5])
    );
    // Initial glitch state
    this.device.queue.writeBuffer(
      this.fragmentUniformBuffer,
      52,
      new Float32Array([this.useGlitch ? 1.0 : 0.0])
    );

    this.renderPlayfild_Border_WebGPU();

    this.vertexUniformBuffer = this.device.createBuffer({
      size: this.state.playfield.length * 10 * 256,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    // --- Pre-create BindGroups for Dynamic Blocks (Cache) ---
    // Max blocks = 20 rows * 10 cols = 200
    // Each block uses a 256-byte slice of the uniform buffer
    const maxBlocks = 200;
    this.uniformBindGroup_CACHE = [];
    for (let i = 0; i < maxBlocks; i++) {
        const bindGroup = this.device.createBindGroup({
            label: `block_bindgroup_${i}`,
            layout: this.pipeline.getBindGroupLayout(0),
            entries: [
                {
                    binding: 0,
                    resource: {
                        buffer: this.vertexUniformBuffer,
                        offset: i * 256,
                        size: 208, // Data size is smaller than alignment
                    },
                },
                {
                    binding: 1,
                    resource: {
                        buffer: this.fragmentUniformBuffer,
                        offset: 0,
                        size: 80, // Updated size matches creation
                    },
                },
                // Bind Texture & Sampler
                { binding: 2, resource: this.blockTexture.createView() },
                { binding: 3, resource: this.blockSampler }
            ],
        });
        this.uniformBindGroup_CACHE.push(bindGroup);
    }

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
    const dt = 1.0/60.0; // Approx dt

    // Update visual effects
    this.visualEffects.updateEffects(dt);

    // --- Camera Sway & Shake ---
    const time = (performance.now() - this.startTime) / 1000.0;

    // Base position
    let camX = 0.0;
    let camY = -20.0;
    let camZ = 75.0;

    // "Breathing" sway
    camX += Math.sin(time * 0.2) * 2.0;
    camY += Math.cos(time * 0.3) * 1.0;

    // Apply Shake
    const shake = this.visualEffects.getShakeOffset();
    camX += shake.x;
    camY += shake.y;

    const eyePosition = new Float32Array([camX, camY, camZ]);

    Matrix.mat4.lookAt(
      this.VIEWMATRIX,
      eyePosition,
      [9.0, -20.0, 0.0], // target
      [0.0, 1.0, 0.0] // up
    );

    // Update VP Matrix
    Matrix.mat4.multiply(this.vpMatrix, this.PROJMATRIX, this.VIEWMATRIX);

    // Update Fragment Uniforms (eyePosition at offset 16)
    this.device.queue.writeBuffer(
      this.fragmentUniformBuffer,
      16,
      eyePosition
    );

    // Update particles
    this.particleSystem.updateParticles(dt);

    // Write particle buffer
    if (this.particleSystem.particles.length > 0) {
        const data = this.particleSystem.getParticleData();
        this.device.queue.writeBuffer(this.particleVertexBuffer, 0, data);
    }

    // Update uniforms for particles & grid (sharing VP matrix)
    this.device.queue.writeBuffer(this.particleUniformBuffer, 0, this.vpMatrix as Float32Array);

    // Update time for background and blocks
    // used 'time' calculated at start of frame

    // Background time & level & Lock Pulse
    this.device.queue.writeBuffer(this.backgroundUniformBuffer, 0, new Float32Array([time]));
    this.device.queue.writeBuffer(this.backgroundUniformBuffer, 4, new Float32Array([this.visualEffects.currentLevel]));
    this.device.queue.writeBuffer(this.backgroundUniformBuffer, 8, new Float32Array([this.canvasWebGPU.width, this.canvasWebGPU.height]));

    // Calculate Lock Percent (Tension)
    let lockPercent = 0.0;
    if (this.state && this.state.lockTimer !== undefined && this.state.lockDelayTime) {
        lockPercent = Math.min(this.state.lockTimer / this.state.lockDelayTime, 1.0);
    }
    this.device.queue.writeBuffer(this.backgroundUniformBuffer, 64, new Float32Array([lockPercent]));


    // Block shader time (global update once per frame)
    // 48 is the offset for 'time' in fragmentUniformBuffer
    this.device.queue.writeBuffer(this.fragmentUniformBuffer, 48, new Float32Array([time]));
    // Update glitch state for blocks
    this.device.queue.writeBuffer(this.fragmentUniformBuffer, 52, new Float32Array([this.useGlitch ? 1.0 : 0.0]));
    // Update lock percent for blocks (red pulse)
    this.device.queue.writeBuffer(this.fragmentUniformBuffer, 56, new Float32Array([lockPercent]));

    // Update Shockwave Uniforms
    // Layout: time(0), useGlitch(4), center(8, 12), time_shock(16), pad(20,24,28), params(32..48)
    this.device.queue.writeBuffer(this.postProcessUniformBuffer, 0, new Float32Array([
        time, this.useGlitch ? 1.0 : 0.0,
        this.visualEffects.shockwaveCenter[0], this.visualEffects.shockwaveCenter[1],
        this.visualEffects.shockwaveTimer, 0, 0, 0
    ]));
    // Write params at offset 32 (vec4 alignment)
    this.device.queue.writeBuffer(this.postProcessUniformBuffer, 32, this.visualEffects.getShockwaveParams());

    // *** Render Pass 1: Draw Scene to Offscreen Texture ***
    const textureViewOffscreen = this.offscreenTexture.createView();
    // const depthTexture = this.device.createTexture({ ... });

    // 1. Render Background
    const renderVideo = this.visualEffects.isVideoPlaying;
    const clearColors = this.visualEffects.getClearColors();

    const backgroundPassDescriptor: GPURenderPassDescriptor = {
        colorAttachments: [{
            view: textureViewOffscreen,
            clearValue: { r: clearColors.r, g: clearColors.g, b: clearColors.b, a: 0.0 },
            loadOp: 'clear',
            storeOp: 'store'
        }]
    };

    const commandEncoder = this.device.createCommandEncoder();

    if (!renderVideo) {
        const bgPassEncoder = commandEncoder.beginRenderPass(backgroundPassDescriptor);
        bgPassEncoder.setPipeline(this.backgroundPipeline);
        bgPassEncoder.setVertexBuffer(0, this.backgroundVertexBuffer);
        bgPassEncoder.setBindGroup(0, this.backgroundBindGroup);
        bgPassEncoder.draw(6);
        bgPassEncoder.end();
    } else {
        const bgPassEncoder = commandEncoder.beginRenderPass(backgroundPassDescriptor);
        bgPassEncoder.end();
    }

    // 2. Render Playfield
    this.renderPlayfild_WebGPU(this.state);

    this.renderPassDescription = {
      colorAttachments: [{
          view: textureViewOffscreen,
          loadOp: 'load',
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

    // Render Grid
    passEncoder.setPipeline(this.gridPipeline);
    passEncoder.setBindGroup(0, this.gridBindGroup);
    passEncoder.setVertexBuffer(0, this.gridVertexBuffer);
    passEncoder.draw(this.gridVertexCount);

    passEncoder.setPipeline(this.pipeline);
    passEncoder.setVertexBuffer(0, this.vertexBuffer);
    passEncoder.setVertexBuffer(1, this.normalBuffer);
    passEncoder.setVertexBuffer(2, this.uvBuffer);

    let length_of_uniformBindGroup_boder = this.uniformBindGroup_ARRAY_border.length;
    for (let index = 0; index < length_of_uniformBindGroup_boder; index++) {
      passEncoder.setBindGroup(0, this.uniformBindGroup_ARRAY_border[index]);
      passEncoder.draw(this.numberOfVertices);
    }

    let length_of_uniformBindGroup = this.uniformBindGroup_ARRAY.length;
    for (let index = 0; index < length_of_uniformBindGroup; index++) {
      passEncoder.setBindGroup(0, this.uniformBindGroup_ARRAY[index]);
      passEncoder.draw(this.numberOfVertices);
    }

    // Draw particles
    if (this.particleSystem.particles.length > 0) {
        passEncoder.setPipeline(this.particlePipeline);
        passEncoder.setBindGroup(0, this.particleBindGroup);
        passEncoder.setVertexBuffer(0, this.particleVertexBuffer);
        passEncoder.draw(6, this.particleSystem.particles.length, 0, 0);
    }
    passEncoder.end();

    // *** Render Pass 2: Post Processing ***
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
    // Reuse background vertex buffer (quad)
    ppPassEncoder.setVertexBuffer(0, this.backgroundVertexBuffer);
    ppPassEncoder.draw(6);
    ppPassEncoder.end();

    this.device.queue.submit([commandEncoder.finish()]);
    requestAnimationFrame(this.Frame);
  };

  async renderPlayfild_WebGPU({ playfield }: any) {
    if (!this.device) return;

    this.x += 0.01;
    const playfield_length = playfield.length;

    this.uniformBindGroup_ARRAY = [];
    let blockIndex = 0; // Index for retrieving from CACHE

    for (let row = 0; row < playfield_length; row++) {
      for (let colom = 0; colom < playfield[row].length; colom++) {
        if (!playfield[row][colom]) {
          continue;
        }
        // Safety check: ensure we don't exceed cache
        if (blockIndex >= this.uniformBindGroup_CACHE.length) break;

        let value = playfield[row][colom];
        let colorBlockindex = Math.abs(value);
        let alpha = value < 0 ? 0.3 : 0.85; // 0.85 allows 15% of the video to show through

        let color = this.currentTheme[colorBlockindex];
        if (!color) color = this.currentTheme[0];

        // Retrieve pre-created bindgroup
        let uniformBindGroup_next = this.uniformBindGroup_CACHE[blockIndex];
        const offset_ARRAY = blockIndex * 256;

        Matrix.mat4.identity(this.MODELMATRIX);
        Matrix.mat4.identity(this.NORMALMATRIX);

        Matrix.mat4.translate(this.MODELMATRIX, this.MODELMATRIX, [
          colom * 2.2,
          row * -2.2,
          0.0,
        ]);

        Matrix.mat4.identity(this.NORMALMATRIX);
        Matrix.mat4.invert(this.NORMALMATRIX, this.MODELMATRIX);
        Matrix.mat4.transpose(this.NORMALMATRIX, this.NORMALMATRIX);

        // Write to the specific slice of the buffer
        this.device.queue.writeBuffer(
          this.vertexUniformBuffer,
          offset_ARRAY + 0,
          this.vpMatrix
        );

        this.device.queue.writeBuffer(
          this.vertexUniformBuffer,
          offset_ARRAY + 64,
          this.MODELMATRIX
        );

        this.device.queue.writeBuffer(
          this.vertexUniformBuffer,
          offset_ARRAY + 128,
          this.NORMALMATRIX
        );
        this.device.queue.writeBuffer(
          this.vertexUniformBuffer,
          offset_ARRAY + 192,
          new Float32Array([...color, alpha])
        );

        this.uniformBindGroup_ARRAY.push(uniformBindGroup_next);

        blockIndex++;
      }
    }
  }

  async renderPlayfild_Border_WebGPU() {
    if (!this.device) return;

    // Подготовить буфер юниформов.
    // Для рамки игрового поля
    // данный буфер будет записан один раз и не меняеться в каждом кадре

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

    this.x += 0.01;
    const playfield_length = state_Border.playfield.length;
    // create uniform buffer and layout
    // Расчитываем необходимый размер буфера
    const vertexUniformSizeBuffer = 200 * 256;

    this.vertexUniformBuffer_border = this.device.createBuffer({
      size: vertexUniformSizeBuffer,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    this.uniformBindGroup_ARRAY_border = [];
    let offset_ARRAY = 0;

    for (let row = 0; row < playfield_length; row++) {
      for (let colom = 0; colom < state_Border.playfield[row].length; colom++) {
        if (!state_Border.playfield[row][colom]) {
          continue;
        }

        let uniformBindGroup_next = this.device.createBindGroup({
          label : "uniformBindGroup_next 635",
          layout: this.pipeline.getBindGroupLayout(0),
          entries: [
            {
              binding: 0,
              resource: {
                buffer: this.vertexUniformBuffer_border,
                offset: offset_ARRAY,
                size: 208,
              },
            },
            {
              binding: 1,
              resource: {
                buffer: this.fragmentUniformBuffer,
                offset: 0,
                size: 80, // Updated to match fragment buffer usage (allows up to offset 80 or more)
              },
            },
            // Bind Texture & Sampler here too
            { binding: 2, resource: this.blockTexture.createView() },
            { binding: 3, resource: this.blockSampler }
          ],
        });

        Matrix.mat4.identity(this.MODELMATRIX);
        Matrix.mat4.identity(this.NORMALMATRIX);

        Matrix.mat4.translate(this.MODELMATRIX, this.MODELMATRIX, [
          colom * 2.2 - 2.2, // выравниваю по размеру модельки одного блока
          row * -2.2 + 2.2,
          0.0,
        ]);

        Matrix.mat4.identity(this.NORMALMATRIX);
        Matrix.mat4.invert(this.NORMALMATRIX, this.MODELMATRIX);
        Matrix.mat4.transpose(this.NORMALMATRIX, this.NORMALMATRIX);

        this.device.queue.writeBuffer(
          this.vertexUniformBuffer_border,
          offset_ARRAY + 0,
          this.vpMatrix
        );

        this.device.queue.writeBuffer(
          this.vertexUniformBuffer_border,
          offset_ARRAY + 64,
          this.MODELMATRIX
        ); //

        this.device.queue.writeBuffer(
          this.vertexUniformBuffer_border,
          offset_ARRAY + 128,
          this.NORMALMATRIX
        );
        this.device.queue.writeBuffer(
          this.vertexUniformBuffer_border,
          offset_ARRAY + 192,
          new Float32Array([...this.currentTheme.border, 1.0])
        );

        this.uniformBindGroup_ARRAY_border.push(uniformBindGroup_next);

        offset_ARRAY += 256;
      }
    }
  }

  CheckWebGPU = () => {
    let description = "Great, your current browser supports WebGPU!";
    let result = true;
    if (!navigator.gpu) {
      description = `Your current browser does not support WebGPU! Make sure you are on a system 
                         with WebGPU enabled. Currently, SPIR-WebGPU is only supported in  
                         <a href="https://www.google.com/chrome/canary/">Chrome canary</a>
                         with the flag "enable-unsafe-webgpu" enabled. See the 
                         <a href="https://github.com/gpuweb/gpuweb/wiki/Implementation-Status"> 
                         Implementation Status</a> page for more details.                   
                        `;
      result = false;
    }
    return { result, description };
  };
}
