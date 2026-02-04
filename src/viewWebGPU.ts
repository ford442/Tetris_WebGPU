import * as Matrix from "gl-matrix";
import { PostProcessShaders, ParticleShaders, GridShader, BackgroundShaders, getBlockShader, VideoBackgroundShader } from './webgpu/shaders.js';
import { ParticleComputeShader } from './webgpu/compute.js';
import { CubeData, FullScreenQuadData, GridData } from './webgpu/geometry.js';
import { themes, ThemeColors, Themes } from './webgpu/themes.js';
import { ParticleSystem } from './webgpu/particles.js';
import { VisualEffects } from './webgpu/effects.js';
import { GameState } from './game.js';
// @ts-ignore
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
  // resolves when WebGPU (and preRender) initialization is complete — callers should await this
  ready: Promise<void>;
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
  state!: GameState;
  blockData: any;
  device!: GPUDevice;
  numberOfVertices!: number;
  vertexBuffer!: GPUBuffer;
  normalBuffer!: GPUBuffer;
  uvBuffer!: GPUBuffer;
  pipeline!: GPURenderPipeline;
  blockBindGroupLayout!: GPUBindGroupLayout;
  fragmentUniformBuffer!: GPUBuffer;
  MODELMATRIX: any;
  NORMALMATRIX: any;
  VIEWMATRIX: any;
  PROJMATRIX: any;
  vpMatrix: any;
  renderPassDescription!: GPURenderPassDescriptor;
  vertexUniformBuffer!: GPUBuffer;
  vertexUniformData_CACHE!: Float32Array;
  vertexUniformBuffer_border!: GPUBuffer;
  blockBindGroup!: GPUBindGroup;
  borderBindGroup!: GPUBindGroup;
  x: number = 0;
  useGlitch: boolean = false;
  flashIntensity: number = 0.0;
  private lockedMinos: Float32Array;
  private lockedMinoIndex: number = 0;
  private lastClearedLines: number[] = [];
  private lineClearTimer: number = 0;
  private lastFrameTime: number = 0;
  private currentFPS: number = 60;
  private debugMode: boolean = false;
  gridPipeline!: GPURenderPipeline;
  gridVertexBuffer!: GPUBuffer;
  gridVertexCount!: number;
  gridBindGroup!: GPUBindGroup;
  backgroundPipeline!: GPURenderPipeline;
  backgroundVertexBuffer!: GPUBuffer;
  backgroundUniformBuffer!: GPUBuffer;
  backgroundBindGroup!: GPUBindGroup;
  videoPipeline!: GPURenderPipeline;
  videoUniformBuffer!: GPUBuffer;
  startTime: number;
  postProcessPipeline!: GPURenderPipeline;
  postProcessBindGroup!: GPUBindGroup;
  postProcessUniformBuffer!: GPUBuffer;
  offscreenTexture!: GPUTexture;
  msaaTexture!: GPUTexture;
  depthTexture!: GPUTexture;
  sampler!: GPUSampler;
  backgroundPassTexture!: GPUTexture;
  msaaBackgroundTexture!: GPUTexture;
  copyPipeline!: GPURenderPipeline;
  particlePipeline!: GPURenderPipeline;
  particleVertexBuffer!: GPUBuffer;
  particleUniformBuffer!: GPUBuffer;
  particleBindGroup!: GPUBindGroup;
  particleComputePipeline!: GPUComputePipeline;
  particleComputeBindGroup!: GPUBindGroup;
  particleComputeUniformBuffer!: GPUBuffer;
  particleSystem: ParticleSystem;
  visualEffects: VisualEffects;
  themes: Themes = themes;
  currentTheme: ThemeColors = themes.neon;
  currentBlockStyle: string = 'tech';
  pipelineCache: Map<string, GPURenderPipeline> = new Map();
  blockTexture!: GPUTexture;
  private blockUniformData: ArrayBuffer;
  private borderUniformData: ArrayBuffer;
  private borderCount: number = 0;
  private readonly MAX_BLOCKS = 250;
  private readonly BLOCK_UNIFORM_SIZE = 256;

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
    this.visualEffects.flashTimer = 0.0;
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
    this.ready = Promise.resolve();
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
    this.state = {} as GameState;
    this.blockData = {};
    this.useGlitch = false;
    this.blockUniformData = new ArrayBuffer(this.MAX_BLOCKS * this.BLOCK_UNIFORM_SIZE);
    this.borderUniformData = new ArrayBuffer(100 * this.BLOCK_UNIFORM_SIZE);
    this.MODELMATRIX = Matrix.mat4.create();
    this.NORMALMATRIX = Matrix.mat4.create();
    this.VIEWMATRIX = Matrix.mat4.create();
    this.PROJMATRIX = Matrix.mat4.create();
    this.vpMatrix = Matrix.mat4.create();
    let divStatus = document.createElement("div");
    divStatus.innerText = this.isWebGPU.description;
    this.element.appendChild(divStatus);

    // expose a readiness promise so callers (Controller) can wait for GPU initialization
    this.ready = this.CheckWebGPU().then((status) => {
        if (divStatus.parentNode) {
            divStatus.parentNode.removeChild(divStatus);
        }
        if (status.result) {
            this.element.appendChild(this.canvasWebGPU);
            // ensure preRender completion is awaited by callers relying on `ready`
            return Promise.resolve(this.preRender());
        } else {
            let divError = document.createElement("div");
            divError.innerText = status.description;
            divError.style.color = "red";
            this.element.appendChild(divError);
            return Promise.resolve();
        }
    });
  }

  // ... rest of the merged file ...
}