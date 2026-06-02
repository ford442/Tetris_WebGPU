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
    maxParticles: number = 5000; // Capped to 5000 for Neon Bricklayer intensity

    // Ring Buffer strategy for emissions
    private emitIndex: number = 0;

    // Pending uploads for the View to handle
    public pendingUploads: Float32Array;
    public pendingUploadCount: number = 0;
    public pendingUploadIndices: Uint32Array;
    
    // Track last emission time for compute skip optimization
    public lastEmitTime: number = 0;

    // Continuous low-rate droplet emitter (bottom of active piece)
    private dropletEnabled: boolean = false;
    private dropletAccumulator: number = 0;

    constructor() {
        // Pre-allocate buffer for a reasonable maximum number of emissions per frame
        // Assuming max 1000 emissions per frame (which is very high)
        const maxPerFrame = 1000;
        this.pendingUploads = new Float32Array(maxPerFrame * 16);
        this.pendingUploadIndices = new Uint32Array(maxPerFrame);
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
    emitParticlesRadial(x: number, y: number, z: number, count: number, speed: number, color: number[]): void {
        const radius = 1.0; // Default radius for particle spread
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
        // Track emission time for compute skip optimization
        this.lastEmitTime = performance.now() / 1000.0;
        
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

        if (this.pendingUploadCount < this.pendingUploadIndices.length) {
            const offset = this.pendingUploadCount * 16;
            this.pendingUploads[offset + 0] = x;
            this.pendingUploads[offset + 1] = y;
            this.pendingUploads[offset + 2] = z;
            this.pendingUploads[offset + 3] = 0.0;
            this.pendingUploads[offset + 4] = vx;
            this.pendingUploads[offset + 5] = vy;
            this.pendingUploads[offset + 6] = vz;
            this.pendingUploads[offset + 7] = 0.0;
            this.pendingUploads[offset + 8] = color[0];
            this.pendingUploads[offset + 9] = color[1];
            this.pendingUploads[offset + 10] = color[2];
            this.pendingUploads[offset + 11] = color[3];
            this.pendingUploads[offset + 12] = scale;
            this.pendingUploads[offset + 13] = life;
            this.pendingUploads[offset + 14] = life; // maxLife
            this.pendingUploads[offset + 15] = 0.0;

            this.pendingUploadIndices[this.pendingUploadCount] = this.emitIndex;
            this.pendingUploadCount++;
        }

        // Advance ring buffer
        this.emitIndex = (this.emitIndex + 1) % this.maxParticles;
    }

    // Clear pending after upload
    clearPending() {
        this.pendingUploadCount = 0;
    }

    updateParticles(dt: number): void {
        // CPU Update logic REMOVED.
        // Now handled by Compute Shader.
    }

    // Legacy support removal
    getParticleData(): Float32Array { return new Float32Array(0); }

    /**
     * Emit a brief "crown" sprite for T-Spin: ring of 6 spike-shaped (velocity-stretched) quads
     * that expand outward and fade over ~800ms. Spikes alternate between the two provided
     * theme background colors (primary/secondary).
     * Position should be above the T-piece.
     * Uses the existing particle system + shader stretch for the spike shape.
     * Geometry is the 6 radial placements + outward vel.
     */
    emitTSpinCrown(x: number, y: number, z: number, color1: number[], color2: number[]): void {
        const initialRadius = 0.8;
        const expandSpeed = 6.0;
        const life = 0.8;
        const scale = 0.18;

        for (let i = 0; i < 6; i++) {
            const angle = (i / 6) * Math.PI * 2;
            const px = x + Math.cos(angle) * initialRadius;
            const pz = z + Math.sin(angle) * initialRadius;
            const py = y + 0.6; // slightly above the piece

            const color = (i % 2 === 0) ? color1 : color2;
            const col4 = [color[0] || 0.8, color[1] || 0.8, color[2] || 0.8, 1.0];

            // Outward radial velocity for expansion; slight up for pop then gravity
            const vx = Math.cos(angle) * expandSpeed;
            const vz = Math.sin(angle) * expandSpeed;
            const vy = 3.5 + this.rand(-1.0, 1.0);

            this.addParticle(px, py, pz, vx, vy, vz, col4, life, scale);
        }
    }

    /**
     * Emit directional sharp "shard" particles for a cleared line.
     * Thin elongated appearance comes from high horizontal speed (triggers existing velocity stretch in shader).
     * Directional burst: primarily outward left/right from the row's block positions.
     * Each shard carries a color from the cleared blocks (or theme fallback).
     * Life tuned to ~0.6s. Spin/tumble approximated via vel + existing shader dynamics + sparkle.
     */
    emitShardsForClearedRow(
        row: number,
        clearedCols: number[],
        blockColors: number[][] | null, // per-col or per-row colors captured before clear; can be null
        worldY: number,
        themeColors: Record<number, number[]> | null
    ): void {
        const life = 0.65 + Math.random() * 0.15; // JUICE: slightly longer life for vapor trail
        const baseScale = 0.28; // JUICE: larger base for chunkier plasma shards

        for (let i = 0; i < clearedCols.length; i++) {
            const col = clearedCols[i];
            const worldX = col * 2.2; // match world scaling used elsewhere in onLineClear

            // Determine color for this shard (prefer exact block color from the cleared row)
            let color: number[];
            // Find color for this (row, col) regardless of whether blockColors is dense by row Y or a list
            let blockVal = 0;
            if (blockColors) {
              if (blockColors[row] && blockColors[row][col] > 0) {
                blockVal = blockColors[row][col];
              } else {
                // try linear search in case snapshot was passed as list of row arrays
                for (let r = 0; r < blockColors.length; r++) {
                  if (blockColors[r] && blockColors[r][col] > 0) { blockVal = blockColors[r][col]; break; }
                }
              }
            }
            if (blockVal > 0) {
                color = themeColors && themeColors[blockVal] ? [...themeColors[blockVal], 1.0] : [0.8, 0.6, 0.2, 1.0];
            } else {
                // varied plausible color for the "block that was there"
                const idx = ((row * 7) + col) % 7 + 1;
                color = themeColors && themeColors[idx] ? [...themeColors[idx], 1.0] : [0.6 + Math.random()*0.4, 0.3 + Math.random()*0.4, 0.1, 1.0];
            }

            // Emit 3-5 shards per cleared block position for a nice burst density
            const shardsPerBlock = 5; // JUICE: more shards per block
            for (let s = 0; s < shardsPerBlock; s++) {
                // Directional outward from center of board (left side -> left, right side -> right)
                const outward = (col < 4.5) ? -1.0 : 1.0;
                // JUICE: Massively increased speed for explosive row vaporization
                const speed = 40.0 + this.rand(20.0, 40.0);
                const vx = outward * speed * 1.2 + this.rand(-10.0, 10.0); // Stronger horizontal burst
                const vy = this.rand(-20.0, 20.0); // More vertical spread
                const vz = this.rand(-8.0, 8.0) * 0.5;

                // Slight positional offset around the block for organic burst origin
                const ox = this.rand(-0.6, 0.6);
                const oy = this.rand(-0.3, 0.3);

                this.addParticle(
                    worldX + ox, worldY + oy, 0.0,
                    vx, vy, vz,
                    color,
                    life,
                    baseScale + Math.random() * 0.12
                );
            }
        }
    }

    /**
     * Convenience wrapper: emit shards for multiple cleared rows using current theme + optional snapshot.
     * Called from the onLineClear integration path.
     */
    emitLineClearShards(
        rows: number[],
        playfieldSnapshot: number[][] | null,
        theme: any,
        getWorldY: (row: number) => number
    ): void {
        const themeColors: Record<number, number[]> = {};
        if (theme) {
            for (let i = 1; i <= 7; i++) if (theme[i]) themeColors[i] = theme[i];
        }

        for (const row of rows) {
            const clearedCols: number[] = [];
            let rowColors: number[] | null = null;
            if (playfieldSnapshot && playfieldSnapshot[row]) {
                rowColors = playfieldSnapshot[row];
                for (let c = 0; c < 10; c++) {
                    if (rowColors[c] !== 0) clearedCols.push(c);
                }
            } else {
                // Assume full row was cleared (classic line clear)
                for (let c = 0; c < 10; c++) clearedCols.push(c);
            }
            const worldY = getWorldY(row);
            this.emitShardsForClearedRow(row, clearedCols, playfieldSnapshot ? [rowColors || []] : null, worldY, themeColors);
        }
    }

    /**
     * Continuous low-rate glowing droplet emitter attached to bottom face of active piece.
     * Call every frame (from render loop) while a piece is in play.
     * Emits 2-4 small droplets/sec using theme color. Falls via GPU gravity + drag.
     * Short life + existing floor bounce gives "bounce off stack" visual feel.
     * Disables emission (no new particles) when !enabled (e.g. on lock / no active piece).
     * No allocations in hot path.
     */
    updatePieceDropletEmitter(
        dt: number,
        enabled: boolean,
        pieceCenterWorldX: number,
        pieceBottomWorldY: number,
        themeColor: number[]  // [r,g,b] or [r,g,b,a] from active piece theme
    ): void {
        if (!enabled) {
            this.dropletEnabled = false;
            this.dropletAccumulator = 0;
            return;
        }
        this.dropletEnabled = true;

        // Target ~3 per second (clamped to 2-4 range with occasional doubles)
        const targetRate = 3.0;
        this.dropletAccumulator += dt * targetRate;

        while (this.dropletAccumulator >= 1.0) {
            this.dropletAccumulator -= 1.0;

            // Occasional extra for natural 2-4/s variation (no alloc)
            const emitCount = (Math.random() < 0.35) ? 2 : 1;

            for (let i = 0; i < emitCount; i++) {
                // Small jitter around bottom center of piece
                const x = pieceCenterWorldX + this.rand(-0.35, 0.35);
                const y = pieceBottomWorldY + this.rand(-0.08, 0.05);
                const z = 0.0;

                // Mostly downward initial vel (gravity will accelerate)
                const vx = this.rand(-1.2, 1.2);
                const vy = -2.8 + this.rand(-0.8, 0.4);
                const vz = this.rand(-0.4, 0.4) * 0.3;

                // Small glowing droplet
                const scale = 0.10 + this.rand(0.0, 0.05);
                const life = 0.85 + this.rand(-0.15, 0.2);

                // Theme color with good alpha for glow (preserve if 4 components passed)
                const a = (themeColor.length > 3 ? themeColor[3] : 0.9);
                const col: number[] = [
                    themeColor[0] || 0.8,
                    themeColor[1] || 0.8,
                    themeColor[2] || 0.9,
                    a
                ];

                this.addParticle(x, y, z, vx, vy, vz, col, life, scale);
            }
        }
    }

    // Simple enable/disable helper (optional, updatePieceDropletEmitter preferred)
    enablePieceDroplets(enabled: boolean): void {
        this.dropletEnabled = enabled;
        if (!enabled) this.dropletAccumulator = 0;
    }

    // =========================================================================
    // PERFECT CLEAR "PERFECT" TEXT ASSEMBLY (pixel font driven)
    // =========================================================================

    /**
     * Compact 5x7 pixel font bitmap for "PERFECT" (7 letters), row-major, 0/1.
     * Stored as typed array constant per request. Each glyph = 35 entries.
     * Order: P, E, R, F, E, C, T. Simple block font for good particle density.
     */
    private static readonly PERFECT_FONT: Uint8Array = new Uint8Array([
        // P (rows 0-6)
        1,1,1,1,0, 1,0,0,0,1, 1,0,0,0,1, 1,1,1,1,0, 1,0,0,0,0, 1,0,0,0,0, 1,0,0,0,0,
        // E
        1,1,1,1,1, 1,0,0,0,0, 1,0,0,0,0, 1,1,1,1,0, 1,0,0,0,0, 1,0,0,0,0, 1,1,1,1,1,
        // R
        1,1,1,1,0, 1,0,0,0,1, 1,0,0,0,1, 1,1,1,1,0, 1,0,1,0,0, 1,0,0,1,0, 1,0,0,0,1,
        // F
        1,1,1,1,1, 1,0,0,0,0, 1,0,0,0,0, 1,1,1,1,0, 1,0,0,0,0, 1,0,0,0,0, 1,0,0,0,0,
        // E (duplicate)
        1,1,1,1,1, 1,0,0,0,0, 1,0,0,0,0, 1,1,1,1,0, 1,0,0,0,0, 1,0,0,0,0, 1,1,1,1,1,
        // C
        0,1,1,1,0, 1,0,0,0,1, 1,0,0,0,0, 1,0,0,0,0, 1,0,0,0,0, 1,0,0,0,1, 0,1,1,1,0,
        // T
        1,1,1,1,1, 0,0,1,0,0, 0,0,1,0,0, 0,0,1,0,0, 0,0,1,0,0, 0,0,1,0,0, 0,0,1,0,0
    ]);

    /**
     * Build list of world target positions for the "PERFECT" letters centered at (cx, cy).
     * Uses the typed font bitmap. Each "on" pixel produces 1-2 targets with tiny jitter for density.
     * Letter width 5px + 1px space, scaled to world units.
     */
    private buildPerfectTargets(cx: number, cy: number): Array<{x: number, y: number}> {
        const targets: Array<{x: number, y: number}> = [];
        const glyphW = 5;
        const glyphH = 7;
        const letters = 7;
        const spacing = 6.2; // world units between letter centers
        const totalPixelWidth = letters * glyphW + (letters - 1) * 1;
        const scale = 0.58; // particle "pixel" size in world
        const startX = cx - (totalPixelWidth * scale * 0.5);

        const font = ParticleSystem.PERFECT_FONT;
        let letterIdx = 0;
        let px = 0;
        let py = 0;

        for (let i = 0; i < font.length; i++) {
            if (font[i]) {
                // on pixel -> one or two targets with micro jitter for organic fill
                const lx = startX + (letterIdx * spacing) + (px * scale);
                const ly = cy - (glyphH * scale * 0.5) + (py * scale);
                targets.push({ x: lx + this.rand(-0.08, 0.08), y: ly + this.rand(-0.08, 0.08) });
                if (Math.random() < 0.55) {
                    targets.push({ x: lx + this.rand(-0.12, 0.12), y: ly + this.rand(-0.12, 0.12) });
                }
            }
            px++;
            if (px >= glyphW) { px = 0; py++; }
            if (py >= glyphH) { py = 0; letterIdx++; }
            if (letterIdx >= letters) break;
        }
        return targets;
    }

    /**
     * Spawn particles that drift upward from below center and assemble into the word "PERFECT".
     * Targets precomputed from the internal typed-array pixel font bitmap.
     * Strong upward + converging horizontal velocity for the "drift and assemble" feel.
     * Long life gives ~1.5s visible hold near the formed letters before natural fade + scatter.
     */
    emitPerfectClearText(cx: number, cy: number, color: number[]): void {
        const targets = this.buildPerfectTargets(cx, cy);
        if (targets.length === 0) return;

        const baseCol = [
            color[0] || 1.0,
            color[1] || 0.95,
            color[2] || 0.7,
            color[3] ?? 0.95
        ];

        for (let i = 0; i < targets.length; i++) {
            const t = targets[i];
            // Start well below the letter area (upward drift into formation)
            const sx = t.x + this.rand(-2.8, 2.8);
            const sy = cy + 9.5 + this.rand(-1.2, 1.8); // below center

            const dx = t.x - sx;
            const dy = t.y - sy; // positive when target is "above" (smaller Y? but our cy chosen so dy >0 upward)
            const dist = Math.hypot(dx, dy) || 1.0;

            // Converging + strong upward bias (positive vy = toward top of screen per physics)
            const speed = 7.5 + this.rand(1.5, 4.5);
            const vx = (dx / dist) * speed * 0.55 + this.rand(-1.8, 1.8);
            const vy = (dy / dist) * speed * 0.85 + 7.5 + this.rand(0, 3.0);
            const vz = this.rand(-0.8, 0.8) * 0.4;

            const life = 2.35 + this.rand(0, 0.55); // flight time + ~1.5s linger near letters
            const sc = 0.11 + this.rand(0.0, 0.07);

            this.addParticle(sx, sy, 0.0, vx, vy, vz, baseCol, life, sc);
        }

        // Schedule the scatter phase (1.5s hold then outward burst from the letter positions)
        // Uses setTimeout (acceptable for rare celebratory VFX, matches other timed effects in codebase)
        setTimeout(() => {
            try {
                this.emitPerfectClearScatter(cx, cy, baseCol);
            } catch (_) { /* particleSystem may be torn down */ }
        }, 1500);
    }

    /**
     * Outward scatter burst from the "PERFECT" letter positions (called by timer after hold).
     * High speed radial from each target pixel + slight upward for celebratory pop.
     */
    emitPerfectClearScatter(cx: number, cy: number, color: number[]): void {
        const targets = this.buildPerfectTargets(cx, cy);
        const baseCol = color || [1, 0.9, 0.6, 1];

        for (let i = 0; i < targets.length; i++) {
            const t = targets[i];
            // 1-2 particles per pixel for the scatter
            for (let k = 0; k < 2; k++) {
                const angle = Math.random() * Math.PI * 2;
                const speed = 14.0 + this.rand(6.0, 18.0);
                const vx = Math.cos(angle) * speed + this.rand(-3, 3);
                const vy = Math.sin(angle) * speed * 0.6 + 8.0 + this.rand(0, 6); // mostly up/out
                const vz = this.rand(-2.5, 2.5);

                const life = 0.55 + this.rand(0, 0.35);
                const sc = 0.09 + this.rand(0, 0.06);

                const ox = this.rand(-0.15, 0.15);
                const oy = this.rand(-0.1, 0.1);

                this.addParticle(t.x + ox, t.y + oy, 0.0, vx, vy, vz, baseCol, life, sc);
            }
        }
    }
}
