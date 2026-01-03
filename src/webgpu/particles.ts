/**
 * Particle System
 * Handles particle effects for line clears, hard drops, and other game events
 */

export interface Particle {
    position: Float32Array; // x, y, z
    velocity: Float32Array; // vx, vy, vz
    color: Float32Array;    // r, g, b, a
    life: number;           // remaining life (0-1)
    scale: number;
}

export class ParticleSystem {
    particles: Particle[] = [];
    maxParticles: number = 4000;

    emitParticles(x: number, y: number, z: number, count: number, color: number[]): void {
        for(let i=0; i<count; i++) {
            if (this.particles.length >= this.maxParticles) break;

            const angle = Math.random() * Math.PI * 2;
            // More explosive speed
            const speed = Math.random() * 12.0 + 2.0;

            this.particles.push({
                position: new Float32Array([x, y, z]),
                velocity: new Float32Array([
                    Math.cos(angle)*speed,
                    Math.sin(angle)*speed + 8.0, // Stronger Upward bias
                    (Math.random()-0.5)*15.0
                ]),
                color: new Float32Array(color),
                life: 0.8 + Math.random() * 0.6,
                scale: Math.random() * 0.3 + 0.15
            });
        }
    }

    emitParticlesRadial(x: number, y: number, z: number, angle: number, speed: number, color: number[]): void {
        if (this.particles.length >= this.maxParticles) return;

        this.particles.push({
            position: new Float32Array([x, y, z]),
            velocity: new Float32Array([
                Math.cos(angle)*speed,
                Math.sin(angle)*speed * 0.5, // Flattened ring
                (Math.random()-0.5)*5.0
            ]),
            color: new Float32Array(color),
            life: 0.5 + Math.random() * 0.3, // Short life
            scale: Math.random() * 0.3 + 0.2
        });
    }

    updateParticles(dt: number): void {
        for(let i=this.particles.length-1; i>=0; i--) {
            const p = this.particles[i];
            p.life -= dt;
            if (p.life > 0) {
                // Update pos
                p.position[0] += p.velocity[0] * dt;
                p.position[1] += p.velocity[1] * dt;
                p.position[2] += p.velocity[2] * dt;

                // Gravity with some turbulence
                p.velocity[1] -= 9.8 * dt;

                // Simple drag
                p.velocity[0] *= 0.98;
                p.velocity[2] *= 0.98;

                // Add turbulence
                p.velocity[0] += (Math.random() - 0.5) * 2.0 * dt;
                p.velocity[2] += (Math.random() - 0.5) * 2.0 * dt;
            } else {
                this.particles.splice(i, 1);
            }
        }
    }

    getParticleData(): Float32Array {
        const data = new Float32Array(this.particles.length * 8);
        for(let i=0; i<this.particles.length; i++) {
            const p = this.particles[i];
            const offset = i * 8;
            data[offset+0] = p.position[0];
            data[offset+1] = p.position[1];
            data[offset+2] = p.position[2];

            data[offset+3] = p.color[0];
            data[offset+4] = p.color[1];
            data[offset+5] = p.color[2];
            data[offset+6] = p.color[3] * p.life; // Fade out

            data[offset+7] = p.scale * p.life; // Shrink
        }
        return data;
    }

    clear(): void {
        this.particles = [];
    }
}
