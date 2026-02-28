/**
 * Particle System
 * Handles particle effects for line clears, hard drops, and other game events
 * Now GPU-driven via Compute Shader
 */

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
    maxParticles: number = 10000; // Increased to 10000 for Neon Bricklayer intensity

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

    // Standard omni-directional burst
    emitParticles(x: number, y: number, z: number, count: number, color: number[]): void {
        for(let i=0; i<count; i++) {
             const angle = Math.random() * Math.PI * 2;
             const phi = Math.random() * Math.PI; // 3D spread
             const speed = this.rand(5.0, 20.0); // JUICE: Faster particles

             this.addParticle(
                 x, y, z,
                 Math.cos(angle) * Math.sin(phi) * speed,
                 Math.cos(phi) * speed + 10.0, // Upward bias
                 Math.sin(angle) * Math.sin(phi) * speed,
                 color,
                 0.5 + Math.random() * 0.5,
                 Math.random() * 0.3 + 0.2
             );
        }
    }

    // Radial ring explosion (for hard drops / impacts)
    emitParticlesRadial(x: number, y: number, z: number, count: number, radius: number, speed: number, color: number[]): void {
        for (let i = 0; i < count; i++) {
            const angle = (i / count) * Math.PI * 2;
            // Velocity purely horizontal
            const vx = Math.cos(angle) * speed;
            const vz = Math.sin(angle) * speed;

            this.addParticle(
                x + Math.cos(angle) * radius,
                y,
                z + Math.sin(angle) * radius,
                vx,
                this.rand(0.0, 5.0), // Slight upward pop
                vz,
                color,
                0.8 + Math.random() * 0.4,
                0.3 // Uniform scale
            );
        }
    }

    // Directional stream (for movement trails)
    emitStream(x: number, y: number, z: number, count: number, dirX: number, dirY: number, color: number[]): void {
        for (let i = 0; i < count; i++) {
            const speed = this.rand(2.0, 5.0);
            this.addParticle(
                x + this.rand(-0.5, 0.5),
                y + this.rand(-0.5, 0.5),
                z,
                dirX * speed * -0.5, // Trail behind
                dirY * speed * -0.5,
                0.0,
                color,
                0.4 + Math.random() * 0.3,
                0.15 + Math.random() * 0.1
            );
        }
    }

    // Massive Explosion (Line Clears)
    emitExplosion(x: number, y: number, z: number, count: number, color: number[]): void {
        for (let i = 0; i < count; i++) {
            // Sphere sampling
            const theta = Math.random() * 2.0 * Math.PI;
            const phi = Math.acos(2.0 * Math.random() - 1.0);
            const speed = this.rand(10.0, 35.0); // High speed

            const vx = Math.sin(phi) * Math.cos(theta) * speed;
            const vy = Math.sin(phi) * Math.sin(theta) * speed;
            const vz = Math.cos(phi) * speed;

            this.addParticle(
                x, y, z,
                vx, vy, vz,
                color,
                1.0 + Math.random() * 0.5, // Longer life
                0.3 + Math.random() * 0.3  // Larger scale
            );
        }
    }

    public addParticle(x: number, y: number, z: number, vx: number, vy: number, vz: number, color: number[], life: number, scale: number) {
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
