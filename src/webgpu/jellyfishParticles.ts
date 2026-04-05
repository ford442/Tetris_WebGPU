/**
 * Jellyfish Particle System for Bioluminescent Level
 * 
 * Features:
 * - Floating jellyfish that drift upward
 * - Tentacle animation via shader
 * - Glow pulses that react to line clears
 * - Scatter on clear events
 * - Performance optimized (max 50 jellyfish)
 */

export interface JellyfishParticle {
    position: Float32Array;  // x, y, z
    velocity: Float32Array;  // vx, vy, vz
    color: Float32Array;     // r, g, b, glow intensity
    scale: number;           // Size
    pulsePhase: number;      // For tentacle animation
    driftOffset: number;     // For wandering motion
    life: number;            // 0-1
}

export class JellyfishParticleSystem {
    jellyfish: JellyfishParticle[] = [];
    maxJellyfish: number = 50;
    
    // Spawn control
    spawnTimer: number = 0;
    spawnInterval: number = 2.0; // Spawn every 2 seconds
    
    // Reactivity
    pulseIntensity: number = 0;  // Increases on line clears
    scatterActive: boolean = false;
    scatterForce: number = 0;
    
    // GPU upload buffer
    public pendingUploads: Float32Array;
    public pendingUploadCount: number = 0;
    public pendingUploadIndices: Uint32Array;
    private emitIndex: number = 0;
    
    // Colors for different jellyfish types
    private jellyfishColors = [
        [0.4, 0.9, 1.0, 0.8], // Cyan
        [0.9, 0.4, 1.0, 0.8], // Magenta
        [0.4, 1.0, 0.6, 0.8], // Green
        [1.0, 0.8, 0.4, 0.8], // Gold
    ];

    constructor() {
        const maxPerFrame = 10;
        this.pendingUploads = new Float32Array(maxPerFrame * 16);
        this.pendingUploadIndices = new Uint32Array(maxPerFrame);
    }

    private rand(min: number, max: number): number {
        return Math.random() * (max - min) + min;
    }

    /**
     * Spawn a new jellyfish at the bottom of the board
     */
    spawnJellyfish(): void {
        if (this.jellyfish.length >= this.maxJellyfish) return;
        
        // Spawn at bottom, random X across board width
        const x = this.rand(-8, 8);
        const y = -15;
        const z = this.rand(-2, 2);
        
        // Gentle upward drift with wandering
        const vx = this.rand(-0.5, 0.5);
        const vy = this.rand(1.0, 2.5); // Upward drift
        const vz = this.rand(-0.3, 0.3);
        
        const colorIdx = Math.floor(this.rand(0, this.jellyfishColors.length));
        const baseColor = this.jellyfishColors[colorIdx];
        
        const jellyfish: JellyfishParticle = {
            position: new Float32Array([x, y, z]),
            velocity: new Float32Array([vx, vy, vz]),
            color: new Float32Array(baseColor),
            scale: this.rand(0.3, 0.8),
            pulsePhase: this.rand(0, Math.PI * 2),
            driftOffset: this.rand(0, 100),
            life: 1.0
        };
        
        this.jellyfish.push(jellyfish);
        
        // Add to GPU upload
        this.addToUploadBuffer(jellyfish);
    }

    /**
     * React to line clear - pulse all jellyfish and scatter
     */
    onLineClear(lines: number, combo: number): void {
        // Increase pulse intensity
        this.pulseIntensity = Math.min(1.0, lines * 0.2 + combo * 0.1);
        
        // Scatter effect
        this.scatterActive = true;
        this.scatterForce = lines * 2.0 + combo * 0.5;
        
        // Spawn extra jellyfish on big clears
        if (lines >= 4 || combo >= 3) {
            for (let i = 0; i < 3; i++) {
                this.spawnJellyfish();
            }
        }
    }

    /**
     * React to T-spin - dramatic pulse
     */
    onTSpin(): void {
        this.pulseIntensity = 1.0;
        // Change all jellyfish to cyan
        this.jellyfish.forEach(j => {
            j.color[0] = 0.2;
            j.color[1] = 1.0;
            j.color[2] = 1.0;
        });
    }

    /**
     * Update all jellyfish positions and animation
     */
    update(dt: number, time: number): void {
        this.spawnTimer += dt;
        
        // Spawn new jellyfish periodically
        if (this.spawnTimer >= this.spawnInterval) {
            this.spawnJellyfish();
            this.spawnTimer = 0;
        }
        
        // Decay pulse intensity
        this.pulseIntensity *= 0.95;
        if (this.pulseIntensity < 0.01) this.pulseIntensity = 0;
        
        // Decay scatter
        if (this.scatterActive) {
            this.scatterForce *= 0.9;
            if (this.scatterForce < 0.1) {
                this.scatterActive = false;
                this.scatterForce = 0;
            }
        }
        
        // Update each jellyfish
        for (let i = this.jellyfish.length - 1; i >= 0; i--) {
            const j = this.jellyfish[i];
            
            // Wandering drift motion
            const driftX = Math.sin(time * 0.5 + j.driftOffset) * 0.02;
            const driftZ = Math.cos(time * 0.3 + j.driftOffset) * 0.01;
            
            j.velocity[0] += driftX;
            j.velocity[2] += driftZ;
            
            // Scatter force from clears
            if (this.scatterActive) {
                j.velocity[1] += this.scatterForce * 0.1; // Push up
                j.velocity[0] += (Math.random() - 0.5) * this.scatterForce * 0.05;
            }
            
            // Apply velocity
            j.position[0] += j.velocity[0] * dt;
            j.position[1] += j.velocity[1] * dt;
            j.position[2] += j.velocity[2] * dt;
            
            // Dampen horizontal velocity
            j.velocity[0] *= 0.98;
            j.velocity[2] *= 0.98;
            
            // Update pulse phase for tentacle animation
            j.pulsePhase += dt * (2.0 + this.pulseIntensity * 4.0);
            
            // Color pulse on line clear
            if (this.pulseIntensity > 0) {
                j.color[3] = 0.8 + this.pulseIntensity * 0.5;
            } else {
                j.color[3] = 0.6 + Math.sin(time + j.driftOffset) * 0.2;
            }
            
            // Remove if too high
            if (j.position[1] > 20) {
                this.jellyfish.splice(i, 1);
            }
        }
    }

    /**
     * Get particle data formatted for GPU upload
     */
    getParticleData(): Float32Array {
        // 16 floats per particle (64 bytes)
        const data = new Float32Array(this.jellyfish.length * 16);
        
        for (let i = 0; i < this.jellyfish.length; i++) {
            const j = this.jellyfish[i];
            const offset = i * 16;
            
            // Position
            data[offset + 0] = j.position[0];
            data[offset + 1] = j.position[1];
            data[offset + 2] = j.position[2];
            data[offset + 3] = 0;
            
            // Velocity + pulse phase packed
            data[offset + 4] = j.velocity[0];
            data[offset + 5] = j.velocity[1];
            data[offset + 6] = j.velocity[2];
            data[offset + 7] = j.pulsePhase;
            
            // Color
            data[offset + 8] = j.color[0];
            data[offset + 9] = j.color[1];
            data[offset + 10] = j.color[2];
            data[offset + 11] = j.color[3];
            
            // Scale, life, and extras
            data[offset + 12] = j.scale;
            data[offset + 13] = j.life;
            data[offset + 14] = this.pulseIntensity; // Shader can use this
            data[offset + 15] = 0;
        }
        
        return data;
    }

    private addToUploadBuffer(jellyfish: JellyfishParticle): void {
        if (this.pendingUploadCount >= this.pendingUploadIndices.length) return;
        
        const offset = this.pendingUploadCount * 16;
        this.pendingUploads[offset + 0] = jellyfish.position[0];
        this.pendingUploads[offset + 1] = jellyfish.position[1];
        this.pendingUploads[offset + 2] = jellyfish.position[2];
        this.pendingUploads[offset + 3] = 0;
        this.pendingUploads[offset + 4] = jellyfish.velocity[0];
        this.pendingUploads[offset + 5] = jellyfish.velocity[1];
        this.pendingUploads[offset + 6] = jellyfish.velocity[2];
        this.pendingUploads[offset + 7] = jellyfish.pulsePhase;
        this.pendingUploads[offset + 8] = jellyfish.color[0];
        this.pendingUploads[offset + 9] = jellyfish.color[1];
        this.pendingUploads[offset + 10] = jellyfish.color[2];
        this.pendingUploads[offset + 11] = jellyfish.color[3];
        this.pendingUploads[offset + 12] = jellyfish.scale;
        this.pendingUploads[offset + 13] = jellyfish.life;
        this.pendingUploads[offset + 14] = 1.0;
        this.pendingUploads[offset + 15] = 0;
        
        this.pendingUploadIndices[this.pendingUploadCount] = this.emitIndex;
        this.pendingUploadCount++;
        this.emitIndex = (this.emitIndex + 1) % this.maxJellyfish;
    }

    clearPending(): void {
        this.pendingUploadCount = 0;
    }

    /**
     * Reset system
     */
    reset(): void {
        this.jellyfish = [];
        this.pulseIntensity = 0;
        this.scatterActive = false;
        this.spawnTimer = 0;
    }
}

export default JellyfishParticleSystem;
