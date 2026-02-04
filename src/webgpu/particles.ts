/**
 * Particle System
 * Manages particle effects for line clears, hard drops, and other game events
 * CPU-simulated, GPU-rendered (via View)
 */

export interface Particle {
    x: number; y: number; z: number;
    vx: number; vy: number; vz: number;
    rotation: number;
    rotSpeed: number;
    color: number[];    // r, g, b, a
    scale: number;
    life: number;           // remaining life (0-1)
    maxLife: number;
}

export class ParticleSystem {
    particles: Particle[] = [];
    maxParticles: number = 8000;

    private emitIndex: number = 0;
    public pendingUploads: { index: number, data: Float32Array }[] = [];

    constructor() {}

    private rand(min: number, max: number) {
        return Math.random() * (max - min) + min;
    }

    emitParticles(x: number, y: number, z: number, count: number, color: number[]): void {
        for(let i=0; i<count; i++) {
             const angle = Math.random() * Math.PI * 2;
             const speed = this.rand(2.0, 10.0);
             const spread = 2.0;

             this.addParticle(
                 x + (Math.random()-0.5)*spread,
                 y + (Math.random()-0.5)*spread,
                 z,
                 Math.cos(angle)*speed, Math.sin(angle)*speed + 5.0, (Math.random()-0.5)*5.0,
                 color,
                 0.5 + Math.random() * 0.5,
                 Math.random() * 0.2 + 0.1
             );
        }
    }

    emitParticlesRadial(x: number, y: number, z: number, angle: number, speed: number, color: number[]): void {
        this.addParticle(
            x, y, z,
            Math.cos(angle)*speed, Math.sin(angle)*speed, (Math.random()-0.5)*2.0,
            color,
            0.5 + Math.random() * 0.3,
            Math.random() * 0.2 + 0.1
        );
    }

    private addParticle(x: number, y: number, z: number, vx: number, vy: number, vz: number, color: number[], life: number, scale: number) {
        const pData = new Float32Array(16);
        pData[0] = x; pData[1] = y; pData[2] = z;
        pData[4] = vx; pData[5] = vy; pData[6] = vz;
        pData[8] = color[0]; pData[9] = color[1]; pData[10] = color[2]; pData[11] = color[3];
        pData[12] = scale;
        pData[13] = life;
        pData[14] = life;

        this.pendingUploads.push({ index: this.emitIndex, data: pData });
        this.emitIndex = (this.emitIndex + 1) % this.maxParticles;
    }

    clearPending() {
        this.pendingUploads = [];
    }

    updateParticles(dt: number): void {
        // This is now handled on the GPU
    }

    getParticleData(): Float32Array {
        // This is now handled on the GPU
        return new Float32Array();
    }
}