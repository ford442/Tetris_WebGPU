/**
 * Unified GPU particle emitter — staging buffer + ring-buffer slot allocation.
 * Simulation runs in compute.ts; this module only enqueues spawns.
 */

import {
  MAX_EMITS_PER_FRAME,
  PARTICLE_LAYOUT as L,
  PARTICLE_STRIDE_FLOATS,
  particleBudgetForQuality,
} from './layout.js';
import { ParticleMetrics } from './metrics.js';
import type { SettingsQuality } from '../../config/gameSettings.js';

export type EmitMode = 'burst' | 'radial' | 'stream' | 'explosion';

export class ParticleEmitter {
  maxParticles = 5000;
  readonly metrics = new ParticleMetrics();

  /** Ring-buffer write head into GPU storage. */
  private emitIndex = 0;

  /** Staging uploads consumed by viewRenderLoop.uploadParticles */
  readonly pendingUploads: Float32Array;
  pendingUploadCount = 0;
  readonly pendingUploadIndices: Uint32Array;

  /** Seconds (performance.now/1000) — used to skip quiet compute dispatches. */
  lastEmitTime = 0;

  constructor(maxParticles?: number) {
    if (maxParticles) this.maxParticles = maxParticles;
    this.pendingUploads = new Float32Array(MAX_EMITS_PER_FRAME * PARTICLE_STRIDE_FLOATS);
    this.pendingUploadIndices = new Uint32Array(MAX_EMITS_PER_FRAME);
  }

  setMaxParticles(count: number): void {
    this.maxParticles = Math.max(64, count);
    this.emitIndex = this.emitIndex % this.maxParticles;
  }

  applyQualityBudget(quality: SettingsQuality): void {
    this.setMaxParticles(particleBudgetForQuality(quality));
  }

  clearPending(): void {
    this.pendingUploadCount = 0;
  }

  /** @deprecated CPU sim removed — compute shader owns integration. */
  updateParticles(_dt: number): void {
    /* no-op */
  }

  getParticleData(): Float32Array {
    return new Float32Array(0);
  }

  emitParticles(x: number, y: number, z: number, count: number, color: number[]): void {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const phi = Math.random() * Math.PI;
      const speed = this.rand(5.0, 20.0);
      this.enqueue(
        x, y, z,
        Math.cos(angle) * Math.sin(phi) * speed,
        Math.cos(phi) * speed + 10.0,
        Math.sin(angle) * Math.sin(phi) * speed,
        color,
        0.5 + Math.random() * 0.5,
        Math.random() * 0.3 + 0.2,
      );
    }
  }

  emitParticlesRadial(
    x: number,
    y: number,
    z: number,
    count: number,
    speed: number,
    color: number[],
  ): void {
    const radius = 1.0;
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2;
      const vx = Math.cos(angle) * speed;
      const vz = Math.sin(angle) * speed;
      this.enqueue(
        x + Math.cos(angle) * radius,
        y,
        z + Math.sin(angle) * radius,
        vx,
        this.rand(0.0, 5.0),
        vz,
        color,
        0.8 + Math.random() * 0.4,
        0.3,
      );
    }
  }

  emitStream(
    x: number,
    y: number,
    z: number,
    count: number,
    dirX: number,
    dirY: number,
    color: number[],
  ): void {
    for (let i = 0; i < count; i++) {
      const speed = this.rand(2.0, 5.0);
      this.enqueue(
        x + this.rand(-0.5, 0.5),
        y + this.rand(-0.5, 0.5),
        z,
        dirX * speed * -0.5,
        dirY * speed * -0.5,
        0.0,
        color,
        0.4 + Math.random() * 0.3,
        0.15 + Math.random() * 0.1,
      );
    }
  }

  emitExplosion(x: number, y: number, z: number, count: number, color: number[]): void {
    for (let i = 0; i < count; i++) {
      const theta = Math.random() * 2.0 * Math.PI;
      const phi = Math.acos(2.0 * Math.random() - 1.0);
      const speed = this.rand(10.0, 35.0);
      const vx = Math.sin(phi) * Math.cos(theta) * speed;
      const vy = Math.sin(phi) * Math.sin(theta) * speed;
      const vz = Math.cos(phi) * speed;
      this.enqueue(x, y, z, vx, vy, vz, color, 1.0 + Math.random() * 0.5, 0.3 + Math.random() * 0.3);
    }
  }

  /** Low-level enqueue — writes staging buffer + ring index. */
  protected enqueue(
    x: number,
    y: number,
    z: number,
    vx: number,
    vy: number,
    vz: number,
    color: number[],
    life: number,
    scale: number,
  ): void {
    this.lastEmitTime = performance.now() / 1000.0;

    if (this.pendingUploadCount >= this.pendingUploadIndices.length) {
      this.metrics.recordDropped(1);
      return;
    }

    const offset = this.pendingUploadCount * PARTICLE_STRIDE_FLOATS;
    const u = this.pendingUploads;
    u[offset + L.POS_X] = x;
    u[offset + L.POS_Y] = y;
    u[offset + L.POS_Z] = z;
    u[offset + L.VEL_X] = vx;
    u[offset + L.VEL_Y] = vy;
    u[offset + L.VEL_Z] = vz;
    u[offset + L.COLOR_R] = color[0] ?? 1;
    u[offset + L.COLOR_G] = color[1] ?? 1;
    u[offset + L.COLOR_B] = color[2] ?? 1;
    u[offset + L.COLOR_A] = color[3] ?? 1;
    u[offset + L.SCALE] = scale;
    u[offset + L.LIFE] = life;
    u[offset + L.MAX_LIFE] = life;

    this.pendingUploadIndices[this.pendingUploadCount] = this.emitIndex;
    this.pendingUploadCount++;
    this.metrics.recordEmit(1, life);

    this.emitIndex = (this.emitIndex + 1) % this.maxParticles;
  }

  protected rand(min: number, max: number): number {
    return Math.random() * (max - min) + min;
  }
}
