/**
 * Particle System
 * Handles particle effects for line clears, hard drops, and other game events
 * Now GPU-driven via Compute Shader
 */

import { ParticleComputeShader } from './compute.js';

export interface Particle {
    position: Float32Array; // x, y, z
    velocity: Float32Array; // vx, vy, vz
    color: Float32Array;    // r, g, b, a
    scale: number;
    life: number;           // remaining life (0-1)
    maxLife: number;
}

export class ParticleSystem {
    particles: Particle[] = [];
    maxParticles: number = 8000; // Increased count for GPU

    // Ring Buffer strategy for emissions
    private emitIndex: number = 0;

    // Pending uploads for the View to handle
    public pendingUploads: { index: number, data: Float32Array }[] = [];

    constructor() {
    }

    // Helper to get random float
    private rand(min: number, max: number) {
        return Math.random() * (max - min) + min;
    }

    emitParticles(x: number, y: number, z: number, count: number, color: number[]): void {
        for(let i=0; i<count; i++) {
             const angle = Math.random() * Math.PI * 2;
             const speed = this.rand(2.0, 14.0);

             this.addParticle(
                 x, y, z,
                 Math.cos(angle)*speed, Math.sin(angle)*speed + 8.0, (Math.random()-0.5)*15.0,
                 color,
                 0.8 + Math.random() * 0.6,
                 Math.random() * 0.3 + 0.15
             );
        }
    }

    emitParticlesRadial(x: number, y: number, z: number, angle: number, speed: number, color: number[]): void {
        this.addParticle(
            x, y, z,
            Math.cos(angle)*speed, Math.sin(angle)*speed * 0.5, (Math.random()-0.5)*5.0,
            color,
            0.5 + Math.random() * 0.3,
            Math.random() * 0.3 + 0.2
        );
    }

    private addParticle(x: number, y: number, z: number, vx: number, vy: number, vz: number, color: number[], life: number, scale: number) {
        // GPU Layout: 16 floats (64 bytes)
        // 0-2: Pos
        // 3: pad
        // 4-6: Vel
        // 7: pad
        // 8-11: Color
        // 12: Scale
        // 13: Life
        // 14: MaxLife
        // 15: Pad1

        const pData = new Float32Array(16);
        pData[0] = x; pData[1] = y; pData[2] = z; // Pos
        pData[4] = vx; pData[5] = vy; pData[6] = vz; // Vel (Offset 4 float = 16 bytes)
        pData[8] = color[0]; pData[9] = color[1]; pData[10] = color[2]; pData[11] = color[3]; // Color (Offset 8 float = 32 bytes)
        pData[12] = scale;
        pData[13] = life;
        pData[14] = life; // maxLife

        // Push to a queue for the View to handle
        this.pendingUploads.push({ index: this.emitIndex, data: pData });

        // Advance ring buffer
        this.emitIndex = (this.emitIndex + 1) % this.maxParticles;
    }

    // Clear pending after upload
    clearPending() {
        this.pendingUploads = [];
    }

    updateParticles(dt: number): void {
        // CPU Update logic REMOVED.
        // Now handled by Compute Shader.
    }

    // Legacy support removal
    getParticleData(): Float32Array { return new Float32Array(0); }
}
