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
    maxParticles: number = 4000;

    // GPU Resources (Managed by View but tracked here logically?)
    // Actually, View manages buffers. ParticleSystem mainly manages emission logic
    // and initial CPU state which then gets uploaded?
    // With GPU particles, we maintain a "pool" in GPU memory.
    // For simplicity in this step, we can keep the "Emit" logic on CPU
    // but the "Update" logic on GPU.
    // However, to do GPU updates, the data must persist on GPU.
    // So we need to stop re-uploading every frame.
    // We need a GPUBuffer for particles that stays on GPU.
    // When we emit, we write to a free slot in that buffer.

    // To properly implement GPU particles efficiently:
    // 1. Storage Buffer with all particles.
    // 2. CPU tracks "active count" or we use a dead/alive flag in shader.
    // 3. Emission: CPU finds free slots and updates them via queue.writeBuffer.

    // We need to know which slots are free.
    // Simple Ring Buffer strategy:
    // Keep an index `emitIndex`. Overwrite oldest particles.

    private emitIndex: number = 0;
    public needsUpdate: boolean = false;
    public newParticlesData: Float32Array; // Staging buffer for new emissions
    public newParticlesCount: number = 0;
    public newParticlesOffset: number = 0;

    constructor() {
        this.newParticlesData = new Float32Array(this.maxParticles * 16); // 16 floats per particle
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
        // struct Particle { pos(3), vel(3), color(4), scale(1), life(1), maxLife(1), pad(2) } = 16 floats = 64 bytes
        // But in shader struct align:
        // pos: vec3 (16 aligned?) -> actually vec3 is 12 bytes but usually aligned to 16 in array
        // Let's assume explicit padding in TS matches shader layout.
        // Shader:
        // struct Particle {
        //   position: vec3<f32>, (0,4,8)
        //   velocity: vec3<f32>, (16,20,24) -- Alignment rules usually bump vec3 to 16-byte alignment
        //   color: vec4<f32>,    (32,36,40,44)
        //   scale: f32,          (48)
        //   life: f32,           (52)
        //   maxLife: f32,        (56)
        //   pad1: f32,           (60)
        //   pad2: f32,           (64) - Total 64 bytes?
        // };
        // Wait, vec3 in WGSL array<Particle> stride.
        // vec3 align is 16. Size is 12.
        // offset 0: pos (12)
        // offset 12: gap (4) - implicit
        // offset 16: vel (12)
        // offset 28: gap (4) - implicit
        // offset 32: color (16)
        // offset 48: scale (4)
        // offset 52: life (4)
        // offset 56: maxLife (4)
        // offset 60: pad (4) - Explicit padding needed to reach 64 bytes alignment?
        // Struct size must be multiple of largest alignment (16).
        // 64 is multiple of 16. So this layout works.
        // 64 bytes = 16 floats.

        // We write to a specific slot index
        const index = this.emitIndex;
        this.emitIndex = (this.emitIndex + 1) % this.maxParticles;

        // We need to return this data to View so it can queue.writeBuffer to the specific offset
        // But we want to batch them?
        // Since we are just writing to a large array, View can take the logic.
        // Let's store the pending writes.

        // However, we are overwriting a specific index.
        // If we emit 5 particles, they might wrap around.
        // It's easiest if we expose a "pending updates" list: { index, data }
        // Or we just update a CPU mirror and upload changed ranges.
        // Updating 4000 particles on CPU every frame to upload is what we want to AVOID.
        // But uploading *new* particles is fine.

        // Let's define the particle data block (16 floats)
        const offset = 0; // Local buffer
        const pData = new Float32Array(16);
        pData[0] = x; pData[1] = y; pData[2] = z; // Pos
        pData[4] = vx; pData[5] = vy; pData[6] = vz; // Vel (Offset 4 float = 16 bytes)
        pData[8] = color[0]; pData[9] = color[1]; pData[10] = color[2]; pData[11] = color[3]; // Color (Offset 8 float = 32 bytes)
        pData[12] = scale;
        pData[13] = life;
        pData[14] = life; // maxLife

        // Push to a queue for the View to handle
        this.pendingUploads.push({ index, data: pData });
    }

    public pendingUploads: { index: number, data: Float32Array }[] = [];

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
