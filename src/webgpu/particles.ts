
/**
 * Particle System
 * Handles particle effects for line clears, hard drops, and other game events
 * CPU-simulated, GPU-rendered (via View)
 */

export interface Particle {
    x: number; y: number; z: number;
    vx: number; vy: number; vz: number;
    color: number[];    // r, g, b, a
    scale: number;
    life: number;           // remaining life (0-1)
    maxLife: number;
}

export class ParticleSystem {
    particles: Particle[] = [];
    maxParticles: number = 4000;

    constructor() {}

    // Helper to get random float
    private rand(min: number, max: number) {
        return Math.random() * (max - min) + min;
    }

    emitParticles(x: number, y: number, z: number, count: number, color: number[]): void {
        for(let i=0; i<count; i++) {
             const angle = Math.random() * Math.PI * 2;
             const speed = this.rand(2.0, 10.0);
             // Spread out
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
        if (this.particles.length >= this.maxParticles) {
            this.particles.shift(); // Remove oldest
        }
        this.particles.push({
            x, y, z,
            vx, vy, vz,
            color,
            life,
            maxLife: life,
            scale
        });
    }

    updateParticles(dt: number): void {
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            p.life -= dt;

            if (p.life <= 0) {
                this.particles.splice(i, 1);
                continue;
            }

            // Physics
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            p.z += p.vz * dt;

            // Gravity
            p.vy -= 20.0 * dt;

            // Drag
            p.vx *= 0.95;
            p.vy *= 0.95;
            p.vz *= 0.95;
        }
    }

    // Generate Float32Array for GPU buffer
    // Layout: pos(3), color(4), scale(1) = 8 floats = 32 bytes
    getParticleData(): Float32Array {
        const data = new Float32Array(this.particles.length * 8);
        let offset = 0;
        for (const p of this.particles) {
            data[offset+0] = p.x;
            data[offset+1] = p.y;
            data[offset+2] = p.z;

            data[offset+3] = p.color[0];
            data[offset+4] = p.color[1];
            data[offset+5] = p.color[2];
            data[offset+6] = p.color[3] * (p.life / p.maxLife); // Fade out alpha

            data[offset+7] = p.scale;

            offset += 8;
        }
        return data;
    }
}
