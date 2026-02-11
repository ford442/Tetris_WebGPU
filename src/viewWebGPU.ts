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
  state: { playfield: number[][], lockTimer?: number, lockDelayTime?: number, level?: number, nextPiece?: any, holdPiece?: any, activePiece?: any, score?: number, lines?: number, effectEvent?: string, effectCounter?: number, lastDropPos?: any, lastDropDistance?: number, scoreEvent?: any };
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
  particleStorageBuffer!: GPUBuffer; // Renamed from particleVertexBuffer
  particleComputeUniformBuffer!: GPUBuffer; // Renamed
  particleComputeBindGroup!: GPUBindGroup;
  particleRenderBindGroup!: GPUBindGroup; // Renamed
  particleComputePipeline!: GPUComputePipeline;
  
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

          // 1. Glow (ENHANCED)
          ctx.shadowBlur = 15;
          ctx.shadowColor = cssColor;

          // 2. Stroke (Neon Tube)
          ctx.strokeStyle = cssColor;
          ctx.lineWidth = 3;
          ctx.strokeRect(px + 2, py + 2, blockSize - 4, blockSize - 4);

          // 3. Faint Inner Fill (Glass) - Gradient for Hotspot
          const gradient = ctx.createRadialGradient(
              px + blockSize / 2, py + blockSize / 2, 0,
              px + blockSize / 2, py + blockSize / 2, blockSize / 1.5
          );
          gradient.addColorStop(0, `rgba(${r}, ${g}, ${b}, 0.6)`); // Hot center
          gradient.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0.1)`); // Fade edge
          ctx.fillStyle = gradient;
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

  showFloatingText(text: string, subText: string = "") {
      const container = document.getElementById('ui-container');
      if (!container) return;

      const el = document.createElement('div');
      el.className = 'floating-text';
      // Center of screen usually good, but maybe slightly up
      el.style.left = '50%';
      el.style.top = '40%';

      let html = `<span class="main-text">${text}</span>`;
      if (subText) {
          html += `<br><span class="sub-text">${subText}</span>`;
      }
      el.innerHTML = html;

      // Add specific classes for styling based on text content
      if (text.includes("TETRIS")) el.classList.add("tetris");
      if (text.includes("T-SPIN")) el.classList.add("tspin");
      if (text.includes("COMBO")) el.classList.add("combo");

      container.appendChild(el);

      // Remove after animation
      setTimeout(() => {
          el.remove();
      }, 2000);
  }

  onLineClear(lines: number[], tSpin: boolean = false, combo: number = 0, backToBack: boolean = false, isAllClear: boolean = false) {
      this.visualEffects.triggerFlash(1.0);
      // NEON BRICKLAYER: Grid Ripple on Clear
      this.visualEffects.warpSurge = 0.5 + lines.length * 0.1;

      // NEON BRICKLAYER: Combo increases shake
      const shakeBase = tSpin ? 0.8 : 0.5;
      const shakeBonus = Math.min(combo * 0.1, 1.0);
      this.visualEffects.triggerShake(shakeBase + shakeBonus, tSpin ? 0.6 : 0.5);

      // Emit particles for each cleared line
      lines.forEach(y => {
          const worldY = y * -2.2;

          // NEW: Flash Burst (Large particles) across the line for impact
          for (let i=0; i<5; i++) {
               const lx = Math.random() * 10.0 * 2.2;
               const angle = Math.random() * Math.PI * 2;
               // White flash particles
               this.particleSystem.emitParticlesRadial(lx, worldY, 0.0, angle, 30.0, [1.0, 1.0, 1.0, 1.0]);
          }

          // Sweep across the line
          for (let c=0; c<10; c++) {
              const worldX = c * 2.2;

              let color = [0.0, 1.0, 1.0, 1.0]; // Default Cyan
              // Juice: Combo increases particle density
              let count = 20 + (combo * 5);

              // T-SPIN (Purple/Magenta)
              if (tSpin) {
                  color = [1.0, 0.0, 1.0, 1.0]; // MAGENTA
                  count = 150 + (combo * 25); // NEON BRICKLAYER: Massive T-Spin Burst
              } else if (lines.length === 4) {
                  color = [0.0, 1.0, 1.0, 1.0]; // CYAN (Tetris)
                  // If Back-to-Back, make it Gold
                  if (backToBack) {
                      color = [1.0, 0.8, 0.0, 1.0]; // GOLD
                  }
                  count = 200 + (combo * 20); // NEON BRICKLAYER: Screen-filling Tetris Rain
              } else {
                  // Standard line clear
                  color = (Math.random() > 0.5 ? [0.0, 1.0, 1.0, 1.0] : [0.5, 0.0, 1.0, 1.0]); // Cyan/Purple

                  // Combo Color (Red/Orange)
                  if (combo > 1) {
                       color = [1.0, 0.5 * (1.0/combo), 0.0, 1.0]; // Shift to Red as combo increases
                  }
              }

              // NEON BRICKLAYER: Back-to-Back Streak Effect (Boost count)
              if (backToBack) {
                  count = Math.floor(count * 1.5); // More particles!
              }

              this.particleSystem.emitParticles(worldX, worldY, 0.0, count, color);

              // COMBO SPARKS (Radial burst for high combos)
              if (combo > 2 && c === 5) { // Center of line
                   for (let i=0; i<20 + combo * 5; i++) {
                      const angle = Math.random() * Math.PI * 2;
                      const speed = 15.0 + combo * 2.0;
                      this.particleSystem.emitParticlesRadial(worldX, worldY, 0.0, angle, speed, [1.0, 0.2, 0.0, 1.0]); // Red Sparks
                   }
              }

              // If T-Spin, add a radial burst at the center of the line
              if (tSpin && c === 5) {
                   for (let i=0; i<40; i++) {
                      const angle = (i / 40) * Math.PI * 2;
                      const speed = 25.0;
                      this.particleSystem.emitParticlesRadial(worldX, worldY, 0.0, angle, speed, [1.0, 0.0, 1.0, 1.0]); // Magenta
                   }
                   // Add extra shockwave/aberration for T-Spin
                   this.visualEffects.triggerShockwave([0.5, 0.5], 0.3, 0.15, 0.1, 3.0);
                   this.visualEffects.triggerGlitch(0.5);
              }

              // JUICE: Tetris Clear (4 lines) extra impact
              if (lines.length === 4 && c === 5) {
                   this.visualEffects.triggerShockwave([0.5, 0.5], 0.4, 0.2, 0.1, 3.0); // Strong shockwave for Tetris
              }
          }
      });

      // NEON BRICKLAYER: ALL CLEAR JUICE
      if (isAllClear) {
           this.visualEffects.triggerShockwave([0.5, 0.5], 0.5, 0.3, 0.2, 4.0); // Massive Shockwave
           this.visualEffects.triggerShake(1.5, 0.8); // Long Shake

           // Rainbow Burst
           const centerX = 5.0 * 2.2;
           const centerY = 10.0 * -2.2;

           for (let i = 1; i <= 7; i++) {
               // Cycle through theme colors
               let color = this.currentTheme[i];
               if (!color) color = [1.0, 1.0, 1.0];
               const particleColor = [...color, 1.0];

               // Radial burst for each color
               for (let p = 0; p < 50; p++) {
                    const angle = Math.random() * Math.PI * 2;
                    const speed = 10.0 + Math.random() * 25.0; // High speed
                    this.particleSystem.emitParticlesRadial(centerX, centerY, 0.0, angle, speed, particleColor);
               }
           }
      }
  }

  onLock() {
      this.visualEffects.triggerLock(0.3);
      this.visualEffects.triggerShake(0.2, 0.15);

      // Trigger a central shockwave on lock for impact
      // This satisfies the "Shockwave" implementation requirement and adds "Juice"
      // width, strength, aberration
      this.visualEffects.triggerShockwave([0.5, 0.5], 0.2, 0.1, 0.05, 2.5);
  }

  onHold() {
      // Visual feedback for hold
      this.visualEffects.triggerFlash(0.2); // Quick flash
      // Maybe some particles at the center?
      this.particleSystem.emitParticles(4.5 * 2.2, -10.0 * 2.2, 0.0, 30, [0.5, 0.0, 1.0, 1.0]); // Purple flash
  }

  onRotate() {
      this.visualEffects.triggerRotate(0.2);

      if (this.state && this.state.activePiece) {
          const { x, y } = this.state.activePiece;
          const worldX = (x + 1.5) * 2.2;
          const worldY = (y + 1.5) * -2.2;
          for (let i = 0; i < 12; i++) {
              const angle = Math.random() * Math.PI * 2;
              this.particleSystem.emitParticlesRadial(worldX, worldY, 0.0, angle, 15.0, [0.8, 1.0, 1.0, 0.8]);
          }
      }
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
      const strength = 0.8 + Math.min(distance * 0.08, 0.7); // JUICE: MAXIMUM IMPACT
      const width = 0.4 + Math.min(distance * 0.04, 0.5);     // JUICE: Massive ripple
      const aberration = 0.2 + Math.min(distance * 0.03, 0.5); // JUICE: Heavy glitch
      const speed = 3.0 + Math.min(distance * 0.2, 2.0); // JUICE: Hyper speed shockwave

      this.visualEffects.triggerShockwave([uvX, uvY], width, strength, aberration, speed);

      // JUICE: Warp Surge on impact to distort grid
      this.visualEffects.warpSurge = 0.5 + Math.min(distance * 0.1, 1.0);

      // Increase shake intensity
      this.visualEffects.triggerShake(4.0 + distance * 0.3, 0.4); // NEON BRICKLAYER: Seismometer-breaking shake
  }

  onHardDrop(x: number, y: number, distance: number, colorIdx: number = 0) {
      // Create a vertical trail of particles
      const worldX = x * 2.2;
      // Start from top of drop
      const startRow = y - distance;

      // NEON BRICKLAYER: Use actual piece color for trail
      const themeColors = this.currentTheme[colorIdx] || [0.4, 0.8, 1.0];
      const trailColor = [...themeColors, 0.8]; // Add alpha

      // ENHANCED: Smoother, denser trail (Interpolated steps)
      for(let i=0; i<distance * 2; i++) {
          const r = startRow + i * 0.5;
          const worldY = r * -2.2;
          this.particleSystem.emitParticles(worldX, worldY, 0.0, 12, trailColor);
      }

      // Impact particles at bottom
      const impactY = y * -2.2;
      const burstColor = [...themeColors, 1.0];
      for (let i=0; i<80; i++) { // More particles!
          const angle = (i / 80) * Math.PI * 2;
          const speed = 20.0;
          this.particleSystem.emitParticlesRadial(worldX, impactY, 0.0, angle, speed, burstColor);
      }

      // Add a floor splash ripple
      // Emit particles shooting left and right along the floor with upward bias
      for (let i = 0; i < 20; i++) {
          // Left side (aiming up-left)
          const speedL = 8.0 + Math.random() * 12.0;
          const angleL = Math.PI - Math.random() * 0.5; // 180 to ~150 degrees
          this.particleSystem.emitParticlesRadial(worldX, impactY, 0.0, angleL, speedL, burstColor);

          // Right side (aiming up-right)
          const speedR = 8.0 + Math.random() * 12.0;
          const angleR = Math.random() * 0.5; // 0 to ~30 degrees
          this.particleSystem.emitParticlesRadial(worldX, impactY, 0.0, angleR, speedR, burstColor);
      }

      // NEON BRICKLAYER: Impact Ring Shockwave
      for (let i = 0; i < 40; i++) {
          const angle = (i / 40) * Math.PI * 2;
          const speed = 40.0; // High speed for shockwave
          this.particleSystem.emitParticlesRadial(worldX, impactY, 0.0, angle, speed, burstColor);
      }

      this.triggerImpactEffects(worldX, impactY, distance);
  }

  renderMainScreen(state: any) {
    this.state = state;
    // JUICE: Removed redundant triggerImpactEffects loop check.
    // Impact effects are triggered immediately by Controller -> onHardDrop for zero latency.

    // Check if level has changed and update video accordingly
    if (state.level !== this.visualEffects.currentLevel) {
      this.visualEffects.currentLevel = state.level;
      this.visualEffects.triggerLevelUp();
      this.visualEffects.updateVideoForLevel(this.visualEffects.currentLevel, this.currentTheme.levelVideos);
      this.showFloatingText("LEVEL UP!", "WARP SPEED");

      // Warp Speed Particles (Radial Burst)
      const centerX = 5.0 * 2.2;
      const centerY = 10.0 * -2.2;
      for (let i = 0; i < 100; i++) {
           const angle = Math.random() * Math.PI * 2;
           const speed = 20.0 + Math.random() * 30.0;
           // Cyan/White color
           this.particleSystem.emitParticlesRadial(centerX, centerY, 0.0, angle, speed, [0.8, 1.0, 1.0, 1.0]);
      }
    }

    // Check for Score Event (Floating Text)
    if (state.scoreEvent) {
        // Simple deduplication based on frame or ID would be better, but since renderMainScreen is called every frame,
        // we need to make sure we don't trigger this 60 times a second for the same event.
        // However, Game.ts only returns the event ONCE (implied).
        // Wait, Game.ts state is persistent.
        // We need a mechanism to consume the event.
        // Or checking against a lastEventID.
        // Let's implement a simple counter check.
        if (state.effectCounter !== this.lastEffectCounter && state.scoreEvent.text) {
             this.showFloatingText(state.scoreEvent.text, state.scoreEvent.points > 0 ? `+${state.scoreEvent.points}` : "");

             // NEON BRICKLAYER: Visual glitch for Back-to-Back for extra impact
             if (state.scoreEvent.backToBack) {
                 this.visualEffects.triggerGlitch(0.3);
             }

             this.lastEffectCounter = state.effectCounter;
        }

        // Actually Game.ts increments effectCounter on 'hardDrop', not score.
        // So we need to ensure Game.ts increments something for Score too?
        // Let's rely on the fact that if scoreEvent is present, it's a NEW event?
        // No, Game.getState() returns the current state.
        // I should modify Game.ts to clear scoreEvent after it's been read?
        // Or add a sequence number to ScoreEvent.
        // For now, let's assume we can compare objects or use a timestamp.
        // But since I can't easily change Game.ts logic loop consumption model without refactoring,
        // I'll add a 'timestamp' or ID to ScoreEvent.

        // BETTER: Use score as a trigger? Score changes.
        if (this.lastScore !== state.score && state.scoreEvent.text) {
            this.showFloatingText(state.scoreEvent.text, state.scoreEvent.points > 0 ? `+${state.scoreEvent.points}` : "");
            this.lastScore = state.score;
        }
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

    // NEON BRICKLAYER: SYSTEM FAILURE EFFECT
    this.visualEffects.triggerGlitch(1.0);
    this.visualEffects.triggerAberration(1.0);
    this.visualEffects.triggerFlash(0.5);
  }

  onMove(x: number, y: number) {
      // NEON BRICKLAYER: DAS Trail
      // Emit faint particles at the active piece center to visualize speed
      const worldX = (x + 1.5) * 2.2;
      const worldY = (y + 1.5) * -2.2;
      // Faint cyan trail
      this.particleSystem.emitParticles(worldX, worldY, 0.0, 5, [0.4, 0.9, 1.0, 0.8]);
  }

  /**
   * Generate mipmaps for a texture using WebGPU render pipeline
   * This creates progressively smaller versions of the texture for optimal sampling at different distances
   */
  generateMipmaps(texture: GPUTexture, width: number, height: number, mipLevelCount: number) {
    // Create a simple mipmap generation pipeline using blit operations
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
      vertex: {
        module: shaderModule,
        entryPoint: 'vertexMain',
      },
      fragment: {
        module: shaderModule,
        entryPoint: 'fragmentMain',
        targets: [{ format: 'rgba8unorm' }],
      },
    });

    const sampler = this.device.createSampler({
      minFilter: 'linear',
      magFilter: 'linear',
    });

    const commandEncoder = this.device.createCommandEncoder();

    for (let i = 1; i < mipLevelCount; i++) {
      const srcView = texture.createView({
        baseMipLevel: i - 1,
        mipLevelCount: 1,
      });

      const dstView = texture.createView({
        baseMipLevel: i,
        mipLevelCount: 1,
      });

      const bindGroup = this.device.createBindGroup({
        layout: pipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: srcView },
          { binding: 1, resource: sampler },
        ],
      });

      const passEncoder = commandEncoder.beginRenderPass({
        colorAttachments: [{
          view: dstView,
          loadOp: 'clear',
          storeOp: 'store',
          clearValue: { r: 0, g: 0, b: 0, a: 0 },
        }],
      });

      passEncoder.setPipeline(pipeline);
      passEncoder.setBindGroup(0, bindGroup);
      passEncoder.draw(6, 1, 0, 0);
      passEncoder.end();
    }

    this.device.queue.submit([commandEncoder.finish()]);
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
    // Use high-quality sampling with mipmaps and anisotropic filtering
    // to reduce pixelation and improve rendering quality
    this.blockSampler = this.device.createSampler({
      magFilter: 'linear',
      minFilter: 'linear',
      mipmapFilter: 'linear', // Enable trilinear filtering for smooth LOD transitions
      addressModeU: 'repeat',
      addressModeV: 'repeat',
      maxAnisotropy: 16, // Enable anisotropic filtering for better quality at angles
    });

    try {
        const img = document.createElement('img');
        // Use block.png as it exists in the repo
        img.src = 'block.png';
        await img.decode();
        const imageBitmap = await createImageBitmap(img);

        // Calculate number of mip levels for optimal quality
        const mipLevelCount = Math.floor(Math.log2(Math.max(imageBitmap.width, imageBitmap.height))) + 1;

        this.blockTexture = this.device.createTexture({
          size: [imageBitmap.width, imageBitmap.height, 1],
          format: 'rgba8unorm',
          mipLevelCount: mipLevelCount, // Enable mipmaps for better quality at different distances
          usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT
        });
        this.device.queue.copyExternalImageToTexture(
          { source: imageBitmap },
          { texture: this.blockTexture },
          [imageBitmap.width, imageBitmap.height]
        );

        // Generate mipmaps using bilinear filtering
        // This significantly improves quality by preventing aliasing at different viewing distances
        this.generateMipmaps(this.blockTexture, imageBitmap.width, imageBitmap.height, mipLevelCount);
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


    // --- Particle Compute Pipeline ---
    // Initialize storage buffer (Shared between Compute and Render)
    this.particleStorageBuffer = this.device.createBuffer({
        size: 64 * this.particleSystem.maxParticles, // 64 bytes per particle
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });

    this.particleComputeUniformBuffer = this.device.createBuffer({
        size: 48, // dt, time, swTimer, pad, swCenter(2), pad(2), swParams(4)
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
    });

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
            { binding: 0, resource: { buffer: this.particleStorageBuffer } },
            { binding: 1, resource: { buffer: this.particleComputeUniformBuffer } }
        ]
    });


    // --- Particle Render Pipeline ---
    const particleShader = ParticleShaders();

    this.particlePipeline = this.device.createRenderPipeline({
        label: 'particle pipeline',
        layout: 'auto',
        vertex: {
            module: this.device.createShaderModule({ code: particleShader.vertex }),
            entryPoint: 'main',
            buffers: [
                // Use Storage Buffer as Vertex Buffer
                // Stride: 64 bytes
                {
                    arrayStride: 64,
                    stepMode: 'instance',
                    attributes: [
                        { shaderLocation: 0, format: 'float32x3', offset: 0 },  // pos
                        { shaderLocation: 1, format: 'float32x4', offset: 32 }, // color (offset 32)
                        { shaderLocation: 2, format: 'float32',   offset: 48 }, // scale (offset 48)
                        { shaderLocation: 3, format: 'float32',   offset: 52 }, // life (offset 52)
                        { shaderLocation: 4, format: 'float32',   offset: 56 }, // maxLife (offset 56)
                        { shaderLocation: 5, format: 'float32x3', offset: 16 }, // velocity (offset 16)
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
                    color: { srcFactor: 'src-alpha', dstFactor: 'one', operation: 'add' }, // Additive blending
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

    // ViewProjection for particles
    this.particleUniformBuffer = this.device.createBuffer({
        size: 80, // Mat4 (64) + Time (4) + Pad (12) = 80
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
    });

    this.particleRenderBindGroup = this.device.createBindGroup({
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

    // Create post-process sampler with high-quality filtering
    this.sampler = this.device.createSampler({
        magFilter: 'linear',
        minFilter: 'linear',
        mipmapFilter: 'linear', // Enable trilinear filtering
        addressModeU: 'clamp-to-edge', // Prevent edge artifacts in post-processing
        addressModeV: 'clamp-to-edge',
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

  render = (dt: number) => {
    if (!this.device) return;

    // Update visual effects
    this.visualEffects.updateEffects(dt);

    // --- Camera Sway & Shake ---
    const time = (performance.now() - this.startTime) / 1000.0;

    // Base position
    let camX = 0.0;
    let camY = -20.0;
    let camZ = 75.0;

    // "Breathing" sway
    camX += Math.sin(time * 0.2) * 0.5;
    camY += Math.cos(time * 0.3) * 0.25;

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

    // --- PARTICLE UPDATE (COMPUTE) ---
    // 1. Upload new particles
    if (this.particleSystem.pendingUploads.length > 0) {
        // Optimization: Coalesce writes if possible, but simplest is 1 write per batch
        // Or write individual particles
        for(const upload of this.particleSystem.pendingUploads) {
            this.device.queue.writeBuffer(
                this.particleStorageBuffer,
                upload.index * 64, // 64 bytes stride
                upload.data
            );
        }
        this.particleSystem.clearPending();
    }

    // 2. Update uniforms (dt, time)
    const swParams = this.visualEffects.getShockwaveParams();
    const swCenter = this.visualEffects.shockwaveCenter;
    const swTimer = this.visualEffects.shockwaveTimer;
    // Layout: dt, time, swTimer, pad | swCenter(2), pad(2) | swParams(4)
    const computeData = new Float32Array([
        dt, time, swTimer, 0.0,
        swCenter[0], swCenter[1], 0.0, 0.0,
        swParams[0], swParams[1], swParams[2], swParams[3]
    ]);
    this.device.queue.writeBuffer(this.particleComputeUniformBuffer, 0, computeData);

    // 3. Dispatch Compute
    const commandEncoder = this.device.createCommandEncoder();
    const computePass = commandEncoder.beginComputePass();
    computePass.setPipeline(this.particleComputePipeline);
    computePass.setBindGroup(0, this.particleComputeBindGroup);
    // Workgroup size 64. Count = maxParticles.
    computePass.dispatchWorkgroups(Math.ceil(this.particleSystem.maxParticles / 64));
    computePass.end();


    // Update uniforms for particles (Render VP) & grid
    this.device.queue.writeBuffer(this.particleUniformBuffer, 0, this.vpMatrix as Float32Array);
    this.device.queue.writeBuffer(this.particleUniformBuffer, 64, new Float32Array([time])); // Write time at offset 64

    // NEON BRICKLAYER: Ghost Piece Landing Zone
    let ghostX = -100.0;
    let ghostWidth = 0.0;
    // For UV Projection
    let ghostUVX = -1.0;
    let ghostUVW = 0.0;

    if (this.state && this.state.activePiece) {
        const widthInBlocks = this.state.activePiece.blocks[0].length;
        const gridCenterX = this.state.activePiece.x + widthInBlocks / 2.0;
        ghostX = gridCenterX * 2.2;
        ghostWidth = widthInBlocks * 2.2;

        // Calculate UV space coordinates for Projection Beam
        const camZ = 75.0;
        const fov = (35 * Math.PI) / 180;
        const visibleHeight = 2.0 * Math.tan(fov / 2.0) * camZ;
        const visibleWidth = visibleHeight * (this.canvasWebGPU.width / this.canvasWebGPU.height);

        // 10.0 is approx logical center X
        ghostUVX = 0.5 + (ghostX - 10.0) / visibleWidth;
        ghostUVW = ghostWidth / visibleWidth;
    }
    this.device.queue.writeBuffer(this.particleUniformBuffer, 68, new Float32Array([ghostX]));
    this.device.queue.writeBuffer(this.particleUniformBuffer, 72, new Float32Array([ghostWidth]));
    this.device.queue.writeBuffer(this.particleUniformBuffer, 76, new Float32Array([this.visualEffects.warpSurge]));

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
    this.device.queue.writeBuffer(this.backgroundUniformBuffer, 68, new Float32Array([this.visualEffects.warpSurge]));
    // Projection Beam Uniforms
    this.device.queue.writeBuffer(this.backgroundUniformBuffer, 72, new Float32Array([ghostUVX]));
    this.device.queue.writeBuffer(this.backgroundUniformBuffer, 76, new Float32Array([ghostUVW]));


    // Block shader time (global update once per frame)
    // 48 is the offset for 'time' in fragmentUniformBuffer
    this.device.queue.writeBuffer(this.fragmentUniformBuffer, 48, new Float32Array([time]));
    // Update glitch state for blocks
    this.device.queue.writeBuffer(this.fragmentUniformBuffer, 52, new Float32Array([this.useGlitch ? 1.0 : 0.0]));
    // Update lock percent for blocks (red pulse)
    this.device.queue.writeBuffer(this.fragmentUniformBuffer, 56, new Float32Array([lockPercent]));
    // Update level for blocks (glass refraction evolution)
    this.device.queue.writeBuffer(this.fragmentUniformBuffer, 60, new Float32Array([this.visualEffects.currentLevel]));

    // Update Shockwave Uniforms
    // Layout: time(0), useGlitch(4), center(8, 12), time_shock(16), pad(20,24,28), params(32..48)
    // Offset 48: level
    this.device.queue.writeBuffer(this.postProcessUniformBuffer, 0, new Float32Array([
        time, Math.max(this.useGlitch ? 1.0 : 0.0, this.visualEffects.glitchIntensity),
        this.visualEffects.shockwaveCenter[0], this.visualEffects.shockwaveCenter[1],
        this.visualEffects.shockwaveTimer, 0, 0, 0
    ]));
    // Write params at offset 32 (vec4 alignment)
    this.device.queue.writeBuffer(this.postProcessUniformBuffer, 32, this.visualEffects.getShockwaveParams());

    // Write level at offset 48 (NEON BRICKLAYER)
    this.device.queue.writeBuffer(this.postProcessUniformBuffer, 48, new Float32Array([this.visualEffects.currentLevel]));
    // Write warpSurge at offset 52
    this.device.queue.writeBuffer(this.postProcessUniformBuffer, 52, new Float32Array([this.visualEffects.warpSurge]));

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
    // Always draw max particles, the shader will discard invisible/dead ones (scale=0 or alpha=0)
    // Or we could track active count, but tracking active count with ring buffer is complex.
    // Drawing all 4000 quads is cheap.
    passEncoder.setPipeline(this.particlePipeline);
    passEncoder.setBindGroup(0, this.particleRenderBindGroup);
    passEncoder.setVertexBuffer(0, this.particleStorageBuffer); // Use storage buffer as vertex buffer
    passEncoder.draw(6, this.particleSystem.maxParticles, 0, 0);

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
  };

  async renderPlayfild_WebGPU(state: any) {
    if (!this.device) return;
    const { playfield, activePiece } = state;

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

        // NEON BRICKLAYER: Rotation Flash
        // If this block is part of the active piece, brighten it during rotation
        if (this.visualEffects.rotationFlashTimer > 0 && activePiece) {
             const relX = colom - activePiece.x;
             const relY = row - activePiece.y;
             if (relY >= 0 && relY < activePiece.blocks.length && relX >= 0 && relX < activePiece.blocks[0].length) {
                  if (activePiece.blocks[relY][relX] !== 0) {
                      // Add flash intensity
                      const flash = this.visualEffects.rotationFlashTimer * 3.0;
                      color = [
                          Math.min(color[0] + flash, 1.0),
                          Math.min(color[1] + flash, 1.0),
                          Math.min(color[2] + flash, 1.0)
                      ];
                  }
             }
        }

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
