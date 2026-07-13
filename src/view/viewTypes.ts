/**
 * View-layer shared types beyond the public IView contract.
 */

import type { VisualEffects } from '../webgpu/effects.js';
import type { ReactiveVideoBackground } from '../webgpu/reactiveVideo.js';
import type { ThemeColors } from '../webgpu/themes.js';
import type { GameState } from '../game/gameState.js';
import type { GameMode } from '../game/modes/types.js';
import type { Piece } from '../game/pieces.js';
import type { IView } from './IView.js';

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
  game?: {
    getHighScoreManager?: () => HighScoreManager;
    getMode?: () => GameMode;
    getModeLeaderboardDisplay?: () => string;
  };
  controller?: { reset?: () => void };
  renderPlayfield_WebGPU(state: GameState): void | Promise<void>;
}

/** WebGPU renderer internals accessed by viewRenderLoop / viewUniforms. */
export interface WebGPUViewHost extends ViewEventHost {
  device: GPUDevice;
  visualX: number;
  visualY: number;
  visualX2?: number;
  visualY2?: number;
  splitScreen?: {
    active: boolean;
    stateB: GameState | null;
    previousActivePieceB: Piece | null;
  };
  _previousActivePiece: Piece | null;
  _f32_1: Float32Array;
  _f32_2: Float32Array;
  _f32_3: Float32Array;
  _f32_12: Float32Array;
  _camEye: Float32Array;
  vpMatrix: Float32Array;
  canvasWebGPU: HTMLCanvasElement;
  particleComputeUniformBuffer: GPUBuffer;
  particleComputePipeline: GPUComputePipeline;
  particleComputeBindGroup: GPUBindGroup;
  particleSystem: ParticleSystemLike & {
    lastEmitTime?: number;
    pendingUploadCount: number;
    maxParticles: number;
  };
  particleUniformBuffer: GPUBuffer;
  backgroundUniformBuffer: GPUBuffer;
  fragmentUniformBuffer: GPUBuffer;
  postProcessUniformBuffer: GPUBuffer;
  shockwaveParamsUniformBuffer?: GPUBuffer;
  shockwaveParamsUniform?: Float32Array;
  _postProcessParams: { hardDropBoost?: number };
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
  reactiveVideoBackground?: ReactiveVideoBackground;
  _backgroundPassDescriptor: GPURenderPassDescriptor;
  _mainPassDescriptor: GPURenderPassDescriptor;
  _ppPassDescriptor: GPURenderPassDescriptor;
  _depthTextureView: GPUTextureView;
  blockRenderer: {
    updateUniforms(state: GameState, visualX?: number, visualY?: number, worldOffsetX?: number): void;
    refreshBorder(worldOffsetX?: number): void;
    draw(encoder: GPURenderPassEncoder): void;
  };
  backgroundRenderer: { render(encoder: GPURenderPassEncoder, time: number): void };
  postProcessor: { render(encoder: GPURenderPassEncoder): void };
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
}
