/**
 * View-layer shared types beyond the public IView contract.
 */

import type { VisualEffects } from '../webgpu/effects.js';
import type { ReactiveVideoBackground } from '../webgpu/reactiveVideo.js';
import type { ThemeColors } from '../webgpu/themes.js';
import type { GameState } from '../game/gameState.js';
import type { GameMode } from '../game/modes/types.js';
import type { Piece } from '../game/pieces.js';
import type { HighScoreManager } from '../game/scoring.js';
import type { PostProcessUniformData } from '../webgpu/postProcessUniforms.js';
import type { IView } from './IView.js';
import type * as Matrix from 'gl-matrix';

/** Minimal particle API used by viewGameEvents across render backends. */
export interface ParticleSystemLike {
  emitParticles(x: number, y: number, z: number, count: number, color: number[]): void;
  emitParticlesRadial(
    x: number,
    y: number,
    z: number,
    angle: number,
    speed: number,
    color: number[],
  ): void;
  emitLineClearShards?(
    lines: number[],
    snapshot: number[][] | null,
    theme: ThemeColors,
    getWorldY: (row: number) => number,
  ): void;
  maxParticles: number;
  lastEmitTime?: number;
  pendingUploadCount?: number;
  metrics?: {
    beginDispatch(): void;
    endDispatch(ran: boolean, pendingAfter: number): void;
  };
}

/**
 * Extended surface used by viewGameEvents / HUD helpers.
 * All three renderer adapters satisfy this via structural typing.
 */
export interface ViewEventHost extends IView {
  visualEffects: VisualEffects;
  particleSystem: ParticleSystemLike;
  reactiveVideoBackground?: ReactiveVideoBackground;
  nextPieceContext: CanvasRenderingContext2D;
  holdPieceContext: CanvasRenderingContext2D;
  lastEffectCounter: number;
  lastScore: number;
  neonBurstUniform?: Float32Array;
  setFresnelBoost?(boost: number): void;
  game?: {
    getHighScoreManager?: () => HighScoreManager;
    getMode?: () => GameMode;
    getModeLeaderboardDisplay?: () => string;
    getHardDropSnapshot?: () => { blocks: number[][]; x: number } | null;
  };
  controller?: { reset?: () => void };
  renderPlayfield_WebGPU(state: GameState): void | Promise<void>;
}

/** WebGPU particle upload surface used by the render loop. */
export interface WebGPUParticleSystemLike extends ParticleSystemLike {
  lastEmitTime?: number;
  pendingUploadCount: number;
  maxParticles: number;
  pendingUploadIndices: Uint32Array;
  pendingUploads: Float32Array;
  clearPending(): void;
}

/** WebGPU renderer internals accessed by viewRenderLoop / viewUniforms. */
export interface WebGPUViewHost extends ViewEventHost {
  device: GPUDevice;
  startTime: number;
  visualX: number;
  visualY: number;
  visualX2?: number;
  visualY2?: number;
  splitScreen: {
    active: boolean;
    stateB: GameState | null;
    previousActivePieceB: Piece | null;
  };
  _previousActivePiece: Piece | null;
  _hardDropBoostTimer: number;
  _shakeOffsetSmoothed: { x: number; y: number };
  _lastEchoTrailX?: number;
  _lastEchoTrailY?: number;
  _lastEchoTrailTime?: number;
  _lastEchoTrailX2?: number;
  _lastEchoTrailY2?: number;
  _lastEchoTrailTime2?: number;
  _f32_1: Float32Array;
  _f32_2: Float32Array;
  _f32_3: Float32Array;
  _f32_12: Float32Array;
  _camEye: Float32Array;
  _camTarget: Float32Array;
  _camUp: Float32Array;
  VIEWMATRIX: Matrix.mat4;
  PROJMATRIX: Matrix.mat4;
  vpMatrix: Float32Array | Matrix.mat4;
  canvasWebGPU: HTMLCanvasElement;
  particleStorageBuffer: GPUBuffer;
  particleComputeUniformBuffer: GPUBuffer;
  particleComputePipeline: GPUComputePipeline;
  particleComputeBindGroup: GPUBindGroup;
  particleSystem: WebGPUParticleSystemLike;
  particleUniformBuffer: GPUBuffer;
  backgroundUniformBuffer: GPUBuffer;
  fragmentUniformBuffer: GPUBuffer;
  postProcessUniformBuffer: GPUBuffer;
  vertexUniformBuffer_border?: GPUBuffer;
  shockwaveParamsUniformBuffer?: GPUBuffer;
  shockwaveParamsUniform: Float32Array;
  _postProcessParams: PostProcessUniformData;
  _offscreenTextureView: GPUTextureView;
  _uniformBatchBuffer: Float32Array;
  useEnhancedPostProcess: boolean;
  bloomEnabled: boolean;
  useMultiPassBloom: boolean;
  bloomIntensity: number;
  useGlitch: boolean;
  useParticles?: boolean;
  useShockwave?: boolean;
  useFilmGrain?: boolean;
  useCRT?: boolean;
  useFXAA?: boolean;
  chaosMode: { setUnderwaterMode(enabled: boolean): void };
  jellyfishSystem: { update(dt: number, time: number): void };
  reactiveVideoBackground?: ReactiveVideoBackground & { isSeaCreatureLevel?: boolean };
  reactiveMusicSystem?: { getFrequencyBands?(): { bass: number; mid: number; treble: number } };
  bloomSystem?: { setParameters(params: Partial<{ intensity: number }>): void };
  _backgroundPassDescriptor: GPURenderPassDescriptor;
  _mainPassDescriptor: GPURenderPassDescriptor;
  _ppPassDescriptor: GPURenderPassDescriptor;
  _depthTextureView: GPUTextureView;
  blockRenderer: {
    updateUniforms(state: GameState | null, visualX?: number, visualY?: number, worldOffsetX?: number): void;
    refreshBorder(worldOffsetX?: number): void;
    draw(encoder: GPURenderPassEncoder): void;
  };
  backgroundRenderer: {
    draw(
      encoder: GPURenderPassEncoder,
      isVideoPlaying: boolean,
      videoTexture: GPUExternalTexture | null,
    ): void;
  };
  postProcessor: { render(encoder: GPUCommandEncoder, vpMatrix: Float32Array): void };
  gridPipeline: GPURenderPipeline;
  gridVertexBuffer: GPUBuffer;
  gridVertexCount: number;
  gridBindGroup: GPUBindGroup;
  particlePipeline: GPURenderPipeline;
  particleRenderBindGroup: GPUBindGroup;
  numberOfVertices: number;
  useFrostedGlass: boolean;
  frostedGlassPipeline?: GPURenderPipeline;
  frostedGlassVertexBuffer?: GPUBuffer;
  frostedGlassBindGroup?: GPUBindGroup;
  offscreenTexture?: GPUTexture;
  postProcessPipeline: GPURenderPipeline;
  postProcessBindGroup: GPUBindGroup;
  neonBurstUniform?: Float32Array;
  setFresnelBoost(boost: number): void;
  dispatchLineClearAndDissolve(commandEncoder: GPUCommandEncoder, dt: number): void;
  updateMaterialUniforms(): void;
  updateFrostedGlassUniforms(): void;
}
