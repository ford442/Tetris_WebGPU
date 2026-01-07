
import * as Matrix from "gl-matrix";
import { ParticleShaders, GridShader, ParticleComputeShader } from './webgpu/shaders';
import { GridData } from './webgpu/geometry.js';
import { themes, ThemeColors, Themes } from './webgpu/themes.js';
import { ParticleSystem } from './webgpu/particles.js';
import { VisualEffects } from './webgpu/effects.js';
import { GameState } from './game.js';
import { GPUContext } from "./webgpu/gpuContext";
import { BackgroundRenderer } from "./webgpu/backgroundRenderer";
import { BlockRenderer } from "./webgpu/blockRenderer";
import { PostProcessor } from "./webgpu/postProcessor";

// @ts-ignore
const glMatrix = Matrix;

export default class View {
  element: HTMLElement;
  width: number;
  height: number;
  nextPieceContext: CanvasRenderingContext2D;
  holdPieceContext: CanvasRenderingContext2D;
  canvasWebGPU: HTMLCanvasElement;

  // WebGPU components
  private gpuContext!: GPUContext;
  private backgroundRenderer!: BackgroundRenderer;
  private blockRenderer!: BlockRenderer;
  private postProcessor!: PostProcessor;

  // Camera and Matrices
  private VIEWMATRIX: Matrix.mat4;
  private PROJMATRIX: Matrix.mat4;
  private vpMatrix: Matrix.mat4;

  // Game State
  state!: GameState;

  // Effects and Particles
  private lockedMinos: Float32Array;
  private lockedMinoIndex: number = 0;
  private lastClearedLines: number[] = [];
  private lineClearTimer: number = 0;
  private lastFrameTime: number = 0;
  private startTime: number;
  private currentFPS: number = 60;
  private debugMode: boolean = false;
  
  // Subsystems
  particleSystem: ParticleSystem;
  visualEffects: VisualEffects;

  // Themes
  themes: Themes = themes;
  currentTheme: ThemeColors = themes.neon;

  // Grid
  private gridPipeline!: GPURenderPipeline;
  private gridVertexBuffer!: GPUBuffer;
  private gridVertexCount!: number;
  private gridBindGroup!: GPUBindGroup;

  // Particles
  private particlePipeline!: GPURenderPipeline;
  private particleVertexBuffer!: GPUBuffer;
  private particleUniformBuffer!: GPUBuffer;
  private particleBindGroup!: GPUBindGroup;

  // Particle Compute
  private particleComputePipeline!: GPUComputePipeline;
  private particleComputeBindGroup!: GPUBindGroup;
  private particleComputeUniformBuffer!: GPUBuffer;

  constructor(element: HTMLElement, width: number, height: number, rows: number, coloms: number, nextPieceContext: CanvasRenderingContext2D, holdPieceContext: CanvasRenderingContext2D) {
    this.element = element;
    this.width = width;
    this.height = height;
    this.nextPieceContext = nextPieceContext;
    this.holdPieceContext = holdPieceContext;
    this.startTime = performance.now();
    this.lastFrameTime = performance.now();

    this.lockedMinos = new Float32Array(200 * 4);
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

    this.state = { playfield: [] } as unknown as GameState;

    this.VIEWMATRIX = Matrix.mat4.create();
    this.PROJMATRIX = Matrix.mat4.create();
    this.vpMatrix = Matrix.mat4.create();

    this.initialize();
  }

  private async initialize() {
    try {
        this.gpuContext = await GPUContext.create(this.canvasWebGPU);
        this.element.appendChild(this.canvasWebGPU);

        this.backgroundRenderer = new BackgroundRenderer(this.gpuContext, this.visualEffects);
        this.postProcessor = new PostProcessor(this.gpuContext);

        await this.postProcessor.initialize();

        this.blockRenderer = new BlockRenderer(this.gpuContext, this.postProcessor.offscreenTexture.createView(), this.postProcessor.sampler);

        await this.backgroundRenderer.initialize(this.currentTheme);
        await this.blockRenderer.initialize(this.currentTheme);

        await this.setupGridAndParticles();

        this.resize();
        window.addEventListener('resize', this.resize.bind(this));

        (window as any).setBlockStyle = (style: 'tech' | 'glass') => this.setBlockStyle(style);

        this.setTheme('neon');
        this.Frame();
    } catch (e: any) {
        let divError = document.createElement("div");
        divError.innerText = e.message;
        divError.style.color = "red";
        this.element.appendChild(divError);
        console.error(e);
    }
  }

  private async setupGridAndParticles() {
    const device = this.gpuContext.device;
    // Grid
    const gridShader = GridShader();
    const gridData = GridData();
    this.gridVertexCount = gridData.length / 3;
    this.gridVertexBuffer = this.createGPUBuffer(device, gridData);
    this.gridPipeline = await device.createRenderPipelineAsync({
        label: 'grid pipeline',
        layout: 'auto',
        vertex: { module: device.createShaderModule({ code: gridShader.vertex }), entryPoint: 'main', buffers: [{ arrayStride: 12, attributes: [{ shaderLocation: 0, format: 'float32x3', offset: 0 }] }] },
        fragment: { module: device.createShaderModule({ code: gridShader.fragment }), entryPoint: 'main', targets: [{ format: 'rgba16float', blend: { color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha' }, alpha: { srcFactor: 'one', dstFactor: 'one' } } }] },
        primitive: { topology: 'line-list' },
        depthStencil: { format: "depth24plus", depthWriteEnabled: false, depthCompare: "less" },
        multisample: { count: 4 }
    });

    // Particles
    const particleShader = ParticleShaders();
    this.particlePipeline = await device.createRenderPipelineAsync({
        label: 'particle pipeline',
        layout: 'auto',
        vertex: { module: device.createShaderModule({ code: particleShader.vertex }), entryPoint: 'main', buffers: [{ arrayStride: 64, stepMode: 'instance', attributes: [{ shaderLocation: 0, format: 'float32x3', offset: 0 }, { shaderLocation: 1, format: 'float32x4', offset: 32 }, { shaderLocation: 2, format: 'float32', offset: 48 }] }] },
        fragment: { module: device.createShaderModule({ code: particleShader.fragment }), entryPoint: 'main', targets: [{ format: 'rgba16float', blend: { color: { srcFactor: 'src-alpha', dstFactor: 'one' }, alpha: { srcFactor: 'one', dstFactor: 'one' } } }] },
        primitive: { topology: 'triangle-list' },
        depthStencil: { format: 'depth24plus', depthWriteEnabled: false, depthCompare: 'less' },
        multisample: { count: 4 }
    });

    this.particleVertexBuffer = device.createBuffer({ size: 64 * this.particleSystem.maxParticles, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
    this.particleUniformBuffer = device.createBuffer({ size: 64, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    this.particleComputeUniformBuffer = device.createBuffer({ size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    this.particleBindGroup = device.createBindGroup({ layout: this.particlePipeline.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: this.particleUniformBuffer } }] });
    this.gridBindGroup = device.createBindGroup({ layout: this.gridPipeline.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: this.particleUniformBuffer } }] });

    // Particle Compute
    this.particleComputePipeline = await device.createComputePipelineAsync({
        label: 'particle compute pipeline',
        layout: 'auto',
        compute: { module: device.createShaderModule({ code: ParticleComputeShader }), entryPoint: 'main' }
    });
    this.particleComputeBindGroup = device.createBindGroup({ layout: this.particleComputePipeline.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: this.particleVertexBuffer } }, { binding: 1, resource: { buffer: this.particleComputeUniformBuffer } }] });
  }

  resize() {
    if (!this.gpuContext) return;
    const dpr = window.devicePixelRatio || 1;
    this.width = window.innerWidth;
    this.height = window.innerHeight;

    this.canvasWebGPU.width = this.width * dpr;
    this.canvasWebGPU.height = this.height * dpr;

    this.visualEffects.updateVideoPosition(this.width, this.height);
    this.gpuContext.configureCanvas();
    this.postProcessor.resize(this.canvasWebGPU.width, this.canvasWebGPU.height);
    this.blockRenderer.resize(this.postProcessor.offscreenTexture.createView());

    Matrix.mat4.identity(this.PROJMATRIX);
    let fovy = (35 * Math.PI) / 180;
    Matrix.mat4.perspective(this.PROJMATRIX, fovy, this.canvasWebGPU.width / this.canvasWebGPU.height, 1, 150);
  }

  setTheme(themeName: keyof Themes) {
    this.currentTheme = this.themes[themeName];
    this.visualEffects.currentLevel = 0;
    this.visualEffects.updateVideoForLevel(0, this.currentTheme.levelVideos);

    if (this.gpuContext) {
        this.blockRenderer.setTheme(this.currentTheme);
        const bgColors = this.currentTheme.backgroundColors;
        this.gpuContext.device.queue.writeBuffer(this.backgroundRenderer.backgroundUniformBuffer, 32, new Float32Array(bgColors[0]));
        this.gpuContext.device.queue.writeBuffer(this.backgroundRenderer.backgroundUniformBuffer, 48, new Float32Array(bgColors[1]));
        this.gpuContext.device.queue.writeBuffer(this.backgroundRenderer.backgroundUniformBuffer, 64, new Float32Array(bgColors[2]));
    }
  }

  private Frame = () => {
    if (!this.gpuContext) return;

    const now = performance.now();
    const dt = (now - this.lastFrameTime) / 1000.0;
    this.lastFrameTime = now;
    const time = (now - this.startTime) / 1000.0;

    // Update effects and camera
    this.visualEffects.updateEffects(dt);
    this.updateCamera(time);

    // Update Uniforms
    this.updateUniforms(dt, time);
    const blockCount = this.blockRenderer.updateBlockUniforms(this.state, this.vpMatrix, this.currentTheme);

    const commandEncoder = this.gpuContext.device.createCommandEncoder();

    // Compute Pass for particles
    const computePass = commandEncoder.beginComputePass();
    computePass.setPipeline(this.particleComputePipeline);
    computePass.setBindGroup(0, this.particleComputeBindGroup);
    computePass.dispatchWorkgroups(Math.ceil(this.particleSystem.maxParticles / 64));
    computePass.end();

    // Render Pass to offscreen texture
    const renderPassDescriptor: GPURenderPassDescriptor = {
        colorAttachments: [{
            view: this.postProcessor.msaaTexture.createView(),
            resolveTarget: this.postProcessor.offscreenTexture.createView(),
            clearValue: { r: 0.0, g: 0.0, b: 0.0, a: 0.0 },
            loadOp: 'clear',
            storeOp: "store",
        }],
        depthStencilAttachment: {
          view: this.postProcessor.depthTexture.createView(),
          depthClearValue: 1.0,
          depthLoadOp: 'clear',
          depthStoreOp: 'store'
        },
    };
    const passEncoder = commandEncoder.beginRenderPass(renderPassDescriptor);

    this.backgroundRenderer.draw(passEncoder);

    passEncoder.setPipeline(this.gridPipeline);
    passEncoder.setBindGroup(0, this.gridBindGroup);
    passEncoder.setVertexBuffer(0, this.gridVertexBuffer);
    passEncoder.draw(this.gridVertexCount);

    this.blockRenderer.draw(passEncoder, blockCount);

    passEncoder.setPipeline(this.particlePipeline);
    passEncoder.setBindGroup(0, this.particleBindGroup);
    passEncoder.setVertexBuffer(0, this.particleVertexBuffer);
    passEncoder.draw(6, this.particleSystem.maxParticles, 0, 0);

    passEncoder.end();

    // Post-processing pass
    this.postProcessor.draw(commandEncoder);

    this.gpuContext.device.queue.submit([commandEncoder.finish()]);
    requestAnimationFrame(this.Frame);
  };

  private updateCamera(time: number) {
    let camX = 9.9 + Math.sin(time * 0.2) * 2.0;
    let camY = -20.9 + Math.cos(time * 0.3) * 1.0;
    let camZ = 85.0;

    const shake = this.visualEffects.getShakeOffset();
    camX += shake.x;
    camY += shake.y;

    const eyePosition = new Float32Array([camX, camY, camZ]);
    Matrix.mat4.lookAt(this.VIEWMATRIX, eyePosition, [9.9, -20.9, 0.0], [0.0, 1.0, 0.0]);
    Matrix.mat4.multiply(this.vpMatrix, this.PROJMATRIX, this.VIEWMATRIX);
    this.blockRenderer.updateFragmentUniforms(time, eyePosition, this.state, this.canvasWebGPU.width, this.canvasWebGPU.height);
  }

  private updateUniforms(dt: number, time: number) {
    const device = this.gpuContext.device;
    // Update particle system
    if (this.particleSystem.pendingUploads.length > 0) {
        for(const upload of this.particleSystem.pendingUploads) {
            device.queue.writeBuffer(this.particleVertexBuffer, upload.index * 64, upload.data);
        }
        this.particleSystem.clearPending();
    }
    device.queue.writeBuffer(this.particleComputeUniformBuffer, 0, new Float32Array([dt, time]));
    device.queue.writeBuffer(this.particleUniformBuffer, 0, this.vpMatrix as Float32Array);

    // Update background
    device.queue.writeBuffer(this.backgroundRenderer.backgroundUniformBuffer, 0, new Float32Array([time]));
    device.queue.writeBuffer(this.backgroundRenderer.backgroundUniformBuffer, 4, new Float32Array([this.visualEffects.currentLevel || 0]));
    device.queue.writeBuffer(this.backgroundRenderer.backgroundUniformBuffer, 16, new Float32Array([this.canvasWebGPU.width, this.canvasWebGPU.height]));

    // Update video uniforms
    if (this.visualEffects.isVideoPlaying && this.state.activePiece) {
        this.updateVideoUniforms(dt, time);
    }

    // Update post-processing
    this.updatePostProcessUniforms(time);
  }

  private updateVideoUniforms(dt: number, time: number) {
    const activeP = this.state.activePiece;
    let colorIndex = 1;
    outer: for (let r = 0; r < activeP.blocks.length; r++) {
        for (let c = 0; c < activeP.blocks[r].length; c++) {
            if (activeP.blocks[r][c] !== 0) {
                colorIndex = Math.abs(activeP.blocks[r][c]);
                break outer;
            }
        }
    }
    const color = this.currentTheme[colorIndex] || [1, 1, 1, 1];

    let videoW = 1920, videoH = 1080;
    if (this.visualEffects.videoElement && this.visualEffects.videoElement.readyState >= 1) {
         videoW = Math.max(1, this.visualEffects.videoElement.videoWidth || 1920);
         videoH = Math.max(1, this.visualEffects.videoElement.videoHeight || 1080);
    }

    const lines = [0,0,0,0];
    for(let i=0; i<this.lastClearedLines.length && i<4; i++) lines[i] = this.lastClearedLines[i];

    const quality = Math.min(1.0, this.currentFPS / 60.0);
    const baseData = new Float32Array([
         this.canvasWebGPU.width, this.canvasWebGPU.height, time, dt,
         activeP.x, activeP.y, videoW, videoH,
         color[0], color[1], color[2], 1.0,
         lines[0], lines[1], lines[2], lines[3],
         this.lastClearedLines.length, this.lineClearTimer, 0, 0,
         (this.state.level || 1), (this.state.score || 0), quality, this.debugMode ? 1:0
    ]);
    this.gpuContext.device.queue.writeBuffer(this.backgroundRenderer.videoUniformBuffer, 0, baseData);
    this.gpuContext.device.queue.writeBuffer(this.backgroundRenderer.videoUniformBuffer, 96, this.lockedMinos);
  }

  private updatePostProcessUniforms(time: number) {
    const flashIntensity = Math.max(0, Math.min(this.visualEffects.flashTimer, 1.0));
    const flashColor = [0.6, 0.4, 0.8];
    const postProcessUniforms = [
        time, 0.0, this.visualEffects.shockwaveCenter[0], this.visualEffects.shockwaveCenter[1],
        this.visualEffects.shockwaveTimer, this.visualEffects.aberrationIntensity, 0.0, 0.0,
        flashIntensity, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0,
        flashColor[0], flashColor[1], flashColor[2], 0.0
    ];
    this.gpuContext.device.queue.writeBuffer(this.postProcessor.postProcessUniformBuffer, 0, new Float32Array(postProcessUniforms));
  }

  private createGPUBuffer = (device: GPUDevice, data: Float32Array, usageFlag = GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST) => {
    const buffer = device.createBuffer({
      size: data.byteLength,
      usage: usageFlag,
      mappedAtCreation: true,
    });
    new Float32Array(buffer.getMappedRange()).set(data);
    buffer.unmap();
    return buffer;
  };

  public async setBlockStyle(style: 'tech' | 'glass') {
      if (this.blockRenderer) {
        await this.blockRenderer.setBlockStyle(style);
      }
  }

  public renderMainScreen(state: any) {
    if (state.level !== this.visualEffects.currentLevel) {
      this.visualEffects.currentLevel = state.level;
      this.visualEffects.updateVideoForLevel(this.visualEffects.currentLevel, this.currentTheme.levelVideos);
    }

    this.state = state;
    this.renderPiece(this.nextPieceContext, state.nextPiece);
    this.renderPiece(this.holdPieceContext, state.holdPiece);

    const scoreEl = document.getElementById('score');
    if (scoreEl) scoreEl.textContent = state.score;
    const linesEl = document.getElementById('lines');
    if (linesEl) linesEl.textContent = state.lines;
    const levelEl = document.getElementById('level');
    if (levelEl) levelEl.textContent = state.level;
  }
  onLineClear(lines: number[]) {
    this.visualEffects.triggerFlash(1.0);
    this.visualEffects.triggerShake(0.5, 0.5);
    this.visualEffects.triggerAberration(0.01);

    if (lines.length > 0) {
        this.lineClearTimer = 1.0;
    }

    this.lastClearedLines = lines.slice(0, 4);
    this.lineClearTimer = 1.0;
    lines.forEach(y => {
        const worldY = y * -2.2;
        for (let c=0; c<10; c++) {
            const worldX = c * 2.2;
            const isTetris = lines.length === 4;
            let color = [0.0, 1.0, 1.0, 1.0];
            if (isTetris) {
                const hue = (worldX + 11.0) / 22.0;
                if (hue < 0.33) color = [1.0, 0.2, 0.2, 1.0];
                else if (hue < 0.66) color = [0.2, 1.0, 0.2, 1.0];
                else color = [0.2, 0.2, 1.0, 1.0];
            } else {
                 color = (Math.random() > 0.5 ? [0.0, 1.0, 1.0, 1.0] : [0.8, 0.0, 1.0, 1.0]);
            }
            const count = isTetris ? 300 : 100;
            this.particleSystem.emitParticles(worldX, worldY, 0.0, count, color);
        }
    });
}
onLock() {
  this.visualEffects.triggerLock(0.8);
  this.visualEffects.triggerShake(0.3, 0.2);
  if (this.state && (this.state as any).activePiece) {
      const piece = (this.state as any).activePiece;
      const { x, y, blocks } = piece;
      for(let r=0; r<blocks.length; r++) {
          for(let c=0; c<blocks[r].length; c++) {
              if (blocks[r][c]) {
                  const worldX = x + c;
                  const worldY = y + r;
                  const idx = this.lockedMinoIndex * 4;
                  this.lockedMinos[idx] = worldX;
                  this.lockedMinos[idx+1] = worldY;
                  this.lockedMinos[idx+2] = 1.0;
                  this.lockedMinos[idx+3] = 0.0;
                  this.lockedMinoIndex = (this.lockedMinoIndex + 1) % 200;
              }
          }
      }
  }
}
onHold() {
  this.visualEffects.triggerFlash(0.2);
  this.particleSystem.emitParticles(4.5 * 2.2, -10.0 * 2.2, 0.0, 50, [0.5, 0.0, 1.0, 1.0]);
}

onHardDrop(x: number, y: number, distance: number) {
  const worldX = x * 2.2;
  const startRow = y - distance;

  for(let i=0; i<distance; i++) {
      const r = startRow + i;
      const worldY = r * -2.2;
      this.particleSystem.emitParticles(worldX, worldY, 0.0, 10, [0.4, 0.9, 1.0, 0.5]);
  }
  const impactY = y * -2.2;
  for (let i=0; i<80; i++) {
      const angle = (i / 80) * Math.PI * 2;
      const speed = 15.0 + Math.random() * 10.0;
      const color = Math.random() > 0.5 ? [1.0, 1.0, 1.0, 1.0] : [0.0, 1.0, 1.0, 1.0];
      this.particleSystem.emitParticlesRadial(worldX, impactY, 0.0, angle, speed, color);
  }
  for (let i=0; i<40; i++) {
      const angle = (i / 40) * Math.PI * 2;
      const speed = 30.0 + Math.random() * 5.0;
      const color = [0.8, 0.2, 1.0, 1.0];
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
  this.visualEffects.triggerShake(0.4, 0.1);
  this.visualEffects.triggerAberration(0.005);
}
renderPiece(ctx: CanvasRenderingContext2D, piece: any) {
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  if (!piece) return;

  const { blocks } = piece;
  const blockSize = 30;
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
        const gradient = ctx.createLinearGradient(px, py, px + blockSize, py + blockSize);
        gradient.addColorStop(0, `rgb(${color[0] * 255}, ${color[1] * 255}, ${color[2] * 255})`);
        gradient.addColorStop(1, `rgb(${color[0] * 180}, ${color[1] * 180}, ${color[2] * 180})`);

        ctx.fillStyle = gradient;
        ctx.fillRect(px + 1, py + 1, blockSize - 2, blockSize - 2);
        ctx.fillStyle = `rgba(0,0,0,0.2)`;
        ctx.fillRect(px + 4, py + 4, blockSize - 8, blockSize - 8);
        const bevel = ctx.createLinearGradient(px, py, px + blockSize, py + blockSize);
        bevel.addColorStop(0.0, `rgba(255, 255, 255, 0.8)`);
        bevel.addColorStop(0.2, `rgba(255, 255, 255, 0.0)`);
        bevel.addColorStop(0.8, `rgba(255, 255, 255, 0.0)`);
        bevel.addColorStop(1.0, `rgba(0, 0, 0, 0.4)`);

        ctx.fillStyle = bevel;
        ctx.fillRect(px + 1, py + 1, blockSize - 2, blockSize - 2);
        ctx.strokeStyle = `rgba(${color[0] * 255}, ${color[1] * 255}, ${color[2] * 255}, 0.8)`;
        ctx.lineWidth = 2;
        ctx.strokeRect(px + 1, py + 1, blockSize - 2, blockSize - 2);
        ctx.fillStyle = `rgba(255, 255, 255, 0.9)`;
        ctx.beginPath();
        ctx.arc(px + blockSize * 0.3, py + blockSize * 0.3, 2, 0, Math.PI * 2);
        ctx.fill();
      }
    });
  });
}
  clearScreen({ lines, score }: any) {}
  renderStartScreen() {}
  renderPauseScreen() {}
  renderEndScreen({ score }: any) {
    const el = document.getElementById('game-over');
    if (el) el.style.display = 'block';
  }
}
