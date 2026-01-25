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
  vertexUniformData_CACHE!: Float32Array; // CPU-side cache for batched updates
  vertexUniformBuffer_border!: GPUBuffer;
  uniformBindGroup_ARRAY: GPUBindGroup[] = [];
  uniformBindGroup_CACHE: GPUBindGroup[] = []; // Cache for dynamic blocks
  uniformBindGroup_ARRAY_border: GPUBindGroup[] = [];
  x: number = 0;

  lastEffectCounter: number = 0;
  useGlitch: boolean = false;
  flashIntensity: number = 0.0;

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
  lastFrameTime: number;

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

  constructor(element: HTMLElement, width: number, height: number, rows: number, coloms: number, nextPieceContext: CanvasRenderingContext2D, holdPieceContext: CanvasRenderingContext2D) {
    this.element = element;
    this.width = width;
    this.height = height;
    this.nextPieceContext = nextPieceContext;
    this.holdPieceContext = holdPieceContext;
    this.startTime = performance.now();
    this.lastFrameTime = this.startTime;

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

          ctx.save();

          // 1. Soft Outer Glow
          ctx.shadowBlur = 15;
          ctx.shadowColor = `rgba(${color[0] * 255}, ${color[1] * 255}, ${color[2] * 255}, 0.6)`;

          // 2. Main Glassy Fill (Radial for depth)
          const centerX = px + blockSize / 2;
          const centerY = py + blockSize / 2;
          const grad = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, blockSize);

          grad.addColorStop(0.0, `rgba(${color[0] * 255}, ${color[1] * 255}, ${color[2] * 255}, 0.2)`);
          grad.addColorStop(0.4, `rgba(${color[0] * 255}, ${color[1] * 255}, ${color[2] * 255}, 0.6)`);
          grad.addColorStop(0.9, `rgba(${color[0] * 255}, ${color[1] * 255}, ${color[2] * 255}, 0.9)`); // Darker edge for volume
          grad.addColorStop(1.0, `rgba(${color[0] * 255}, ${color[1] * 255}, ${color[2] * 255}, 1.0)`);

          ctx.fillStyle = grad;
          ctx.fillRect(px + 1, py + 1, blockSize - 2, blockSize - 2);
          ctx.restore();

          // 3. Inner Core (Diamond shape)
          ctx.save();
          ctx.translate(centerX, centerY);
          ctx.rotate(Math.PI / 4);
          ctx.fillStyle = `rgba(255, 255, 255, 0.3)`;
          const coreSize = blockSize * 0.5;
          ctx.fillRect(-coreSize / 2, -coreSize / 2, coreSize, coreSize);

          // Core Hotspot
          ctx.fillStyle = `rgba(255, 255, 255, 0.8)`;
          ctx.fillRect(-coreSize / 4, -coreSize / 4, coreSize / 2, coreSize / 2);
          ctx.restore();

          // 4. Rim Highlight (Sharp White Edge)
          ctx.strokeStyle = `rgba(255, 255, 255, 0.5)`;
          ctx.lineWidth = 1.5;
          ctx.strokeRect(px + 1.5, py + 1.5, blockSize - 3, blockSize - 3);

          // 5. Bevel Reflection (Top Left Corner)
          ctx.beginPath();
          ctx.moveTo(px + 2, py + blockSize - 2);
          ctx.lineTo(px + 2, py + 2);
          ctx.lineTo(px + blockSize - 2, py + 2);
          ctx.strokeStyle = `rgba(255, 255, 255, 0.8)`;
          ctx.lineWidth = 1.0;
          ctx.stroke();
        }
      });
    });
  }

  showFloatingText(text: string, subText: string = '', color: string = '#fff') {
      const container = document.getElementById('ui-container');
      if (!container) return;

      const el = document.createElement('div');
      el.className = 'floating-text';
      el.innerHTML = `<div>${text}</div><div style="font-size: 1.5rem; color: #ccc;">${subText}</div>`;
      el.style.color = color;

      // Randomize position slightly around center
      const offsetX = (Math.random() - 0.5) * 100;
      const offsetY = (Math.random() - 0.5) * 50;
      el.style.left = `calc(50% + ${offsetX}px)`;
      el.style.top = `calc(50% + ${offsetY}px)`;

      container.appendChild(el);

      // Clean up
      setTimeout(() => {
          if (el.parentNode) el.parentNode.removeChild(el);
      }, 1200);
  }

  onLineClear(lines: number[], isTSpin: boolean = false, isMini: boolean = false) {
      this.visualEffects.triggerFlash(0.6); // Strong flash
      this.flashIntensity = 0.8; // Screen flash

      const isTetris = lines.length === 4;
      let shakeIntensity = 4.0;

      if (isTSpin) {
           this.showFloatingText("T-SPIN", isMini ? "MINI" : "DOUBLE", "#f0f"); // Magenta
           shakeIntensity = 8.0;
      } else if (isTetris) {
           this.showFloatingText("TETRIS", "", "#fd0"); // Gold
           shakeIntensity = 8.0;
      }

      if (isTetris || isTSpin) shakeIntensity = 8.0; // Massive shake for big clears

      this.visualEffects.triggerShake(shakeIntensity, 0.8);

      // Emit particles for each cleared line
      lines.forEach(y => {
          const worldY = y * -2.2;
          // Sweep across the line
          for (let c=0; c<10; c++) {
              const worldX = c * 2.2;

              let color = [0.0, 1.0, 1.0, 1.0]; // Cyan default
              let count = 80;
              let speed = 18.0;

              if (isTSpin) {
                  color = [1.0, 0.0, 1.0, 1.0]; // Magenta for T-Spin
                  count = 300; // Massive particle burst
                  speed = 35.0;
                  if (isMini) {
                    count = 150;
                    speed = 25.0;
                  }
              } else if (isTetris) {
                  color = [1.0, 0.85, 0.0, 1.0]; // Bright Gold for Tetris
                  count = 200;
                  speed = 30.0;
              } else {
                   // Random cool colors
                   const rand = Math.random();
                   if (rand < 0.33) color = [0.0, 0.6, 1.0, 1.0];
                   else if (rand < 0.66) color = [0.6, 0.0, 1.0, 1.0];
                   else color = [0.0, 1.0, 0.8, 1.0];

                  count = 80;
                  speed = 20.0;
              }

              // Radial burst
              this.particleSystem.emitParticlesRadial(worldX, worldY, 0.0, Math.random() * Math.PI * 2, speed, color);
              // General chaotic burst
              this.particleSystem.emitParticles(worldX, worldY, 0.0, count, color);
          }
      });
  }

  onLock() {
      this.visualEffects.triggerLock(0.4);
      this.visualEffects.triggerShake(0.5, 0.25);
  }

  onHold() {
      // Visual feedback for hold
      this.visualEffects.triggerFlash(0.3); // Quick flash
      this.flashIntensity = 0.3;
      // Maybe some particles at the center?
      this.particleSystem.emitParticles(4.5 * 2.2, -10.0 * 2.2, 0.0, 50, [0.6, 0.2, 1.0, 1.0]); // Purple flash
  }

  onHardDrop(x: number, y: number, distance: number) {
      // Trigger Flash
      this.flashIntensity = 0.5;

      // Create a vertical trail of particles
      const worldX = x * 2.2;
      // Start from top of drop
      const startRow = y - distance;

      // Emit particles at the start position (slam effect)
      this.particleSystem.emitParticles(worldX, startRow * -2.2, 0.0, 20, [1.0, 1.0, 1.0, 1.0]);

      for(let i=0; i<distance; i++) {
          const r = startRow + i;
          const worldY = r * -2.2;
          // More particles per block, electric blue trail
          // Vary the X slightly for a thicker trail
          this.particleSystem.emitParticles(worldX, worldY, 0.0, 25, [0.5, 0.9, 1.0, 1.0]);
      }

      const impactY = y * -2.2;

      // 1. Radial Burst
      for (let i=0; i<120; i++) {
          const angle = (i / 120) * Math.PI * 2;
          const speed = 30.0 + Math.random() * 20.0;
          this.particleSystem.emitParticlesRadial(worldX, impactY, 0.0, angle, speed, [0.8, 1.0, 1.0, 1.0]);
      }

      // 2. Floor Splash (Cone upwards)
      for (let i=0; i<80; i++) {
          // Angle between PI/4 and 3PI/4 (upwards)
          const angle = Math.PI/4 + Math.random() * (Math.PI/2);
          const speed = 40.0 + Math.random() * 30.0;
          // Offset slightly from center
          const offsetX = (Math.random() - 0.5) * 4.0;
          this.particleSystem.emitParticlesRadial(worldX + offsetX, impactY, 0.0, angle, speed, [1.0, 1.0, 1.0, 0.8]);
      }

      // Trigger Shockwave Effect
      // Convert world pos to screen UV (approximate)
      const camY = -20.0;
      const camZ = 75.0;
      const fov = (35 * Math.PI) / 180;
      const visibleHeight = 2.0 * Math.tan(fov / 2.0) * camZ; // ~47.3
      const visibleWidth = visibleHeight * (this.canvasWebGPU.width / this.canvasWebGPU.height);

      const uvX = 0.5 + (worldX - 10.0) / visibleWidth; // 10.0 is approx center X
      const uvY = 0.5 - (impactY - camY) / visibleHeight;

      // Dynamic shockwave based on drop distance
      // More aggressive parameters
      const strength = 0.3 + Math.min(distance * 0.05, 0.8); // Stronger base
      const width = 0.2 + Math.min(distance * 0.05, 0.5); // Wider
      const aberration = 0.15 + Math.min(distance * 0.04, 0.5); // More glitch

      this.visualEffects.triggerShockwave([uvX, uvY], width, strength, aberration);

      // Increase shake
      this.visualEffects.triggerShake(5.0 + distance * 0.5, 0.5);
  }

  renderMainScreen(state: any) {
    // Update local state for the Frame loop
    this.state = state;

    // Check for new visual effects from Game Logic
    if (state.effectCounter > this.lastEffectCounter) {
        this.lastEffectCounter = state.effectCounter;
        // Effect handling delegated to specific event methods called by Controller
    }

    // Check if level has changed and update video accordingly
    if (state.level !== this.visualEffects.currentLevel) {
      this.visualEffects.currentLevel = state.level;
      this.visualEffects.updateVideoForLevel(this.visualEffects.currentLevel, this.currentTheme.levelVideos);
    }

    // 3D Rendering is handled by the Frame() loop to ensure synchronization with swap chain
    // this.renderPlayfild_WebGPU(state);

    // 2D/DOM Updates
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
        size: 64, // time(4)+pad(4)+res(8) + 3*colors(16*3=48) = 64
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
                // Interleaved buffer: pos(4:xyz+rot) + color(4) + scale(1) + pad(3) = 12 floats = 48 bytes
                {
                    arrayStride: 48,
                    stepMode: 'instance', // We are drawing quads (6 verts) per instance
                    attributes: [
                        { shaderLocation: 0, format: 'float32x4', offset: 0 },  // pos + rot
                        { shaderLocation: 1, format: 'float32x4', offset: 16 }, // color
                        { shaderLocation: 2, format: 'float32',   offset: 32 }, // scale
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
    // 48 bytes per particle * maxParticles
    this.particleVertexBuffer = this.device.createBuffer({
        size: 48 * this.particleSystem.maxParticles,
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });

    this.particleUniformBuffer = this.device.createBuffer({
        size: 80, // Mat4 (64) + Time (4) + Padding (12)
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

    const vertexUniformBufferSize = this.state.playfield.length * 10 * 256;
    this.vertexUniformBuffer = this.device.createBuffer({
      size: vertexUniformBufferSize,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    // Create CPU-side data cache (Float32)
    this.vertexUniformData_CACHE = new Float32Array(vertexUniformBufferSize / 4);

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

    const now = performance.now();
    const dt = (now - this.lastFrameTime) / 1000.0;
    this.lastFrameTime = now;

    // Decay Flash Intensity
    if (this.flashIntensity > 0) {
        this.flashIntensity -= dt * 4.0; // Fast decay
        if (this.flashIntensity < 0) this.flashIntensity = 0;
    }

    // Update visual effects
    this.visualEffects.updateEffects(dt);

    // --- Camera Sway & Shake ---
    const time = (now - this.startTime) / 1000.0;

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
    // Update time (offset 64)
    this.device.queue.writeBuffer(this.particleUniformBuffer, 64, new Float32Array([time]));

    // Update time for background and blocks
    // used 'time' calculated at start of frame

    // Background time & level
    this.device.queue.writeBuffer(this.backgroundUniformBuffer, 0, new Float32Array([time]));
    this.device.queue.writeBuffer(this.backgroundUniformBuffer, 4, new Float32Array([this.visualEffects.currentLevel]));
    this.device.queue.writeBuffer(this.backgroundUniformBuffer, 8, new Float32Array([this.canvasWebGPU.width, this.canvasWebGPU.height]));

    // Update Lock Warning
    let lockPercent = 0.0;
    if (this.state && this.state.lockDelayTime > 0) {
        lockPercent = this.state.lockTimer / this.state.lockDelayTime;
    }

    // Block shader time (global update once per frame)
    // 48 is the offset for 'time' in fragmentUniformBuffer
    // We update time, glitch, lockPercent, flashIntensity (offsets 48, 52, 56, 60)
    this.device.queue.writeBuffer(this.fragmentUniformBuffer, 48, new Float32Array([
        time,
        this.useGlitch ? 1.0 : 0.0,
        lockPercent,
        this.flashIntensity
    ]));

    // Update Grid Shader Uniforms
    // Particle Uniform Buffer Layout: VPMatrix(64) + Time(4) + LockPercent(68)
    this.device.queue.writeBuffer(this.particleUniformBuffer, 68, new Float32Array([lockPercent]));

    // Update Shockwave Uniforms
    // Layout: time(0), useGlitch(4), center(8, 12), time_shock(16), flashIntensity(20), pad(24,28), params(32)
    // We write the first chunk: time, glitch, center(x,y), time_shock, flashIntensity, pad(x,y) = 8 floats = 32 bytes
    this.device.queue.writeBuffer(this.postProcessUniformBuffer, 0, new Float32Array([
        time, this.useGlitch ? 1.0 : 0.0,
        this.visualEffects.shockwaveCenter[0], this.visualEffects.shockwaveCenter[1],
        this.visualEffects.shockwaveTimer, this.flashIntensity, 0, 0
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
    let hasData = false;

    // Use float offsets (byte offset / 4)
    // Stride per block = 256 bytes = 64 floats
    const stride = 64;

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

        // Calculate base float index for this block
        const baseIndex = blockIndex * stride;

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

        // Update CPU cache (Float32Array)
        // Offset 0: VP Matrix (16 floats)
        this.vertexUniformData_CACHE.set(this.vpMatrix, baseIndex + 0);

        // Offset 16: Model Matrix (16 floats) (64 bytes / 4)
        this.vertexUniformData_CACHE.set(this.MODELMATRIX, baseIndex + 16);

        // Offset 32: Normal Matrix (16 floats) (128 bytes / 4)
        this.vertexUniformData_CACHE.set(this.NORMALMATRIX, baseIndex + 32);

        // Offset 48: Color (4 floats) (192 bytes / 4)
        this.vertexUniformData_CACHE.set([...color, alpha], baseIndex + 48);

        this.uniformBindGroup_ARRAY.push(uniformBindGroup_next);

        blockIndex++;
        hasData = true;
      }
    }

    // Perform a single write to the GPU buffer if we have data
    if (hasData) {
        // We only need to upload data for the number of blocks used
        // Size = blockIndex * 64 floats
        const usedSize = blockIndex * 64;
        const dataView = this.vertexUniformData_CACHE.subarray(0, usedSize);
        this.device.queue.writeBuffer(this.vertexUniformBuffer, 0, dataView);
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
