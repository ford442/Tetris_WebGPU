/**
 * Visual Effects
 * Manages visual effects like shake, flash, shockwave, and video backgrounds
 */

import { renderLogger } from '../utils/logger.js';


export interface EchoTrail {
    x: number;
    y: number;
    blocks: number[][];
    colorIdx: number;
    age: number;
    intensity: number;
}

export class VisualEffects {
    echoTrails: EchoTrail[] = [];
    /** When true, skip shake / shockwave / flash / heavy FX (a11y). */
    reducedMotion = false;

    // Visual effect timers
    flashTimer: number = 0;
    rotationFlashTimer: number = 0;
    lockTimer: number = 0;
    shakeIntensity: number = 0;
    aberrationIntensity: number = 0;
    glitchIntensity: number = 0;
    warpSurge: number = 0;
    
    // Shockwave state
    shockwaveTimer: number = 0;
    shockwaveCenter: number[] = [0.5, 0.5];
    shockwaveParams: number[] = [0.15, 0.08, 0.03, 2.0]; // width, strength, aberration, speed

    // Black Hole state
    blackHoleTime: number = 0;
    blackHoleCenter: number[] = [0.5, 0.5];

    // Neon Bloom state
    neonBloomIntensity: number = 0;
    neonBloomBaseIntensity: number = 1.0;

    // Line Clear Escalation state
    saturationBoost: number = 0;

    // Resonant Glass Fracture state
    backgroundResonance: number = 0;

    // Block Emissive state
    particleHitTimer: number = 0;
    movementFlashTimer: number = 0;
    comboEnergy: number = 0; // Decaying combo escalation energy
    lineClearFlashTimer: number = 0;

    // Continuous soft-drop pressure (0..1)
    softDropPressure: number = 0;
    softDropActive: boolean = false;

    // Supernova Line Clear Laser state
    lineClearLaserY: Float32Array = new Float32Array([0.0, 0.0, 0.0, 0.0]);
    lineClearLaserIntensity: number = 0.0;

    // Ghost/shadow vertical light-trail state (animates 200ms after piece move)
    ghostTrailTimer: number = 0;

    /** Vertical trail along hard-drop path (optional, ~350ms). */
    hardDropTrail = {
      active: false,
      startRow: 0,
      endRow: 0,
      pieceX: 0,
      blocks: null as number[][] | null,
      colorIdx: 4,
      timer: 0,
      duration: 0.35,
    };

    // Dedicated short-lived (300ms exp decay) chromatic aberration pulse for hard drops
    // (separate from general aberrationIntensity; fed to u_aberrationPulse uniform in enhanced post-process)
    hardDropAberrationPulse: number = 0;

    // Music/Event driven base chromatic intensity (exponential decay)
    baseChromaticIntensity: number = 0;

    // Grid radial ripple from last lock (epicenter + 0..0.5s wave time for 500ms outward fade on grid lines)
    gridRippleCenter: [number, number] = [0.0, 0.0];
    gridRippleTime: number = 0.0;

    // Level-up color burn flash (WebGPU additive fullscreen quad, 400ms exact fade, color from theme.backgroundColors[0])
    levelUpFlashColor: [number, number, number] = [0.2, 0.6, 1.0];
    levelUpFlashIntensity: number = 0;

    // Magnetic UV wobble for placed blocks near active piece (set each frame in viewPlayfield; vanishes on lock when !activePiece)
    magnetWorldX: number = 0;
    magnetWorldY: number = 0;
    magnetStrength: number = 0;

    // Game over kaleidoscope on final board state (WebGPU post-process 6-triangle spin 2s)
    gameOverKaleidoTimer: number = 0;

    // Video background state (delegated to ReactiveVideoBackground)
    isVideoPlaying: boolean = false;
    currentLevel: number = 0;

    constructor(_parentElement: HTMLElement, _width: number, _height: number) {
        // Video elements are now managed by ReactiveVideoBackground
    }

    updateVideoPosition(_width: number, _height: number): void {
        // Positioning is now managed by ReactiveVideoBackground
    }

    updateVideoForLevel(_level: number, _levelVideos?: string[]): void {
        // Video level updates are now managed by ReactiveVideoBackground
    }

    startCrossfade(): void {
        // Crossfading is now managed by ReactiveVideoBackground
    }

    completeCrossfade(): void {
        // Crossfading is now managed by ReactiveVideoBackground
    }

    updateEffects(dt: number): void {
        if (this.flashTimer > 0) this.flashTimer -= dt;
        if (this.flashTimer < 0) this.flashTimer = 0;

        if (this.lockTimer > 0) this.lockTimer -= dt;
        if (this.lockTimer < 0) this.lockTimer = 0;

        // Exponential decay for smooth game feel (fast algebraic approximation for aberration, true exponential for shake)
        const aberrationDecay = 1.0 / (1.0 + dt * 3.0);
        this.shakeIntensity = this.shakeIntensity * Math.exp(-dt * 15.0);
        this.aberrationIntensity *= aberrationDecay;

        // Supernova Line Clear Laser decay (rapid exponential decay targeting ~150ms)
        if (this.lineClearLaserIntensity > 0) {
            this.lineClearLaserIntensity *= 1.0 / (1.0 + dt / 0.06);
            if (this.lineClearLaserIntensity < 0.005) {
                this.lineClearLaserIntensity = 0;
                this.lineClearLaserY.fill(0);
            }
        }

        // Warp surge decay
        this.warpSurge *= 1.0 / (1.0 + dt * 1.5);
        if (this.warpSurge < 0.01) this.warpSurge = 0;

        // Update combo energy (smooth decay towards 0 if no combo)
        this.comboEnergy *= 1.0 / (1.0 + dt * 2.0);
        if (this.comboEnergy < 0.001) this.comboEnergy = 0;

        // Saturation Boost decay
        this.saturationBoost *= 1.0 / (1.0 + dt * 2.0);
        if (this.saturationBoost < 0.01) this.saturationBoost = 0;


        // Update echo trails
        for (let i = this.echoTrails.length - 1; i >= 0; i--) {
            this.echoTrails[i].age += dt;
            if (this.echoTrails[i].age > 0.22) {
                this.echoTrails.splice(i, 1);
            }
        }

        // Glitch decay
        this.glitchIntensity *= 1.0 / (1.0 + dt * 3.0);
        if (this.glitchIntensity < 0.01) this.glitchIntensity = 0;

        // Neon Bloom decay
        this.neonBloomIntensity = this.neonBloomIntensity * Math.exp(-dt * 10.0); // NEON BRICKLAYER: True exponential decay for snappy flash
        if (this.neonBloomIntensity < 0.01) this.neonBloomIntensity = 0;

        // Background Resonance decay
        this.backgroundResonance *= 1.0 / (1.0 + dt * 6.0);
        if (this.backgroundResonance < 0.01) this.backgroundResonance = 0;


        // Block Emissive decay
        if (this.particleHitTimer > 0) {
            this.particleHitTimer *= 1.0 / (1.0 + dt * 8.0); // Fast decay for snappy hits
            if (this.particleHitTimer < 0.01) this.particleHitTimer = 0;
        }

        this.movementFlashTimer *= 1.0 / (1.0 + dt * 8.0);
        if (this.movementFlashTimer < 0.01) this.movementFlashTimer = 0;

        this.lineClearFlashTimer *= 1.0 / (1.0 + dt * 4.0);
        if (this.lineClearFlashTimer < 0.01) this.lineClearFlashTimer = 0;

        this.softDropPressure *= 1.0 / (1.0 + dt * 4.0); // slower decay than movement flash
        if (this.softDropPressure < 0.01) {
            this.softDropPressure = 0;
            this.softDropActive = false;
        }

        // Ghost trail decay (200ms window after moves)
        if (this.ghostTrailTimer > 0) this.ghostTrailTimer -= dt;
        if (this.ghostTrailTimer < 0) this.ghostTrailTimer = 0;

        if (this.hardDropTrail.active) {
          this.hardDropTrail.timer -= dt;
          if (this.hardDropTrail.timer <= 0) {
            this.hardDropTrail.active = false;
            this.hardDropTrail.timer = 0;
          }
        }

        // Hard drop chromatic aberration pulse: exponential decay targeting ~300ms
        // (e^(-dt/0.08) gives strong initial dropoff, effectively gone after 0.3s)
        this.hardDropAberrationPulse *= 1.0 / (1.0 + dt / 0.08);
        if (this.hardDropAberrationPulse < 0.005) this.hardDropAberrationPulse = 0;

        // Base chromatic aberration intensity decay
        this.baseChromaticIntensity *= Math.exp(-dt * 3.0);
        if (this.baseChromaticIntensity < 0.005) this.baseChromaticIntensity = 0;

        // Grid ripple decay (age the wave; render loop / shader handles visual fade at 500ms)
        if (this.gridRippleTime > 0.0) {
            this.gridRippleTime += dt;
            if (this.gridRippleTime > 0.5) this.gridRippleTime = 0.0;
        }

        // Level-up color burn flash: linear fade over exactly 400ms (high initial opacity additive)
        if (this.levelUpFlashIntensity > 0) {
            this.levelUpFlashIntensity -= dt / 0.4;
            if (this.levelUpFlashIntensity < 0) this.levelUpFlashIntensity = 0;
        }

        // Game over kaleidoscope: 2s spin + fade on captured final board in post-process
        if (this.gameOverKaleidoTimer > 0) {
            this.gameOverKaleidoTimer -= dt;
            if (this.gameOverKaleidoTimer < 0) this.gameOverKaleidoTimer = 0;
        }

        if (this.shakeIntensity < 0.01) this.shakeIntensity = 0;
        if (this.aberrationIntensity < 0.01) this.aberrationIntensity = 0;

        if (this.blackHoleTime > 0) {
            this.blackHoleTime += dt * 0.8;
            if (this.blackHoleTime > 1.0) this.blackHoleTime = 0.0;
        }

        if (this.shockwaveTimer > 0) {
            this.shockwaveTimer += dt * 0.8; // Speed
            if (this.shockwaveTimer > 1.0) this.shockwaveTimer = 0.0;
        }

        // Video crossfade animation is now managed by ReactiveVideoBackground
    }


    addEchoTrail(x: number, y: number, blocks: number[][], colorIdx: number, intensity: number = 1.0): void {
        if (this.reducedMotion) return;
        this.echoTrails.push({ x, y, blocks, colorIdx, age: 0, intensity });
        if (this.echoTrails.length > 5) {
            this.echoTrails.shift();
        }
    }

    triggerFlash(duration: number = 1.0): void {
        if (this.reducedMotion) return;
        this.flashTimer = duration;
    }

    triggerRotate(duration: number = 0.2): void {
        this.rotationFlashTimer = duration;
    }


    triggerParticleHit(strength: number = 1.0): void {
        if (this.reducedMotion) return;
        this.particleHitTimer += strength;
        this.particleHitTimer = Math.min(this.particleHitTimer, 2.0); // Cap
    }

    triggerMovementFlash(duration: number = 1.0): void {
        this.movementFlashTimer = duration;
    }

    triggerLineClearFlash(duration: number = 1.0): void {
        if (this.reducedMotion) return;
        this.lineClearFlashTimer = duration;
    }

    triggerSoftDropPressure(strength: number = 0.25): void {
        if (this.reducedMotion) return;
        this.softDropPressure = Math.min(1.0, this.softDropPressure + strength);
        this.softDropActive = true;
    }

    triggerLock(duration: number = 0.3): void {
        this.lockTimer = duration;
    }

    /**
     * Manually trigger the ghost light-trail animation (e.g. on hard drop or special moves).
     */
    triggerGhostTrail(duration: number = 0.2): void {
        this.ghostTrailTimer = duration;
    }

    triggerHardDropTrail(
      startRow: number,
      endRow: number,
      pieceX: number,
      blocks: number[][],
      colorIdx: number,
      duration = 0.35,
    ): void {
      if (this.reducedMotion) return;
      this.hardDropTrail.active = true;
      this.hardDropTrail.startRow = startRow;
      this.hardDropTrail.endRow = endRow;
      this.hardDropTrail.pieceX = pieceX;
      this.hardDropTrail.blocks = blocks;
      this.hardDropTrail.colorIdx = colorIdx;
      this.hardDropTrail.duration = duration;
      this.hardDropTrail.timer = duration;
      this.triggerGhostTrail(Math.min(0.45, duration + 0.1));
    }

    triggerShake(magnitude: number, _duration: number): void {
        if (this.reducedMotion) return;
        // Additive shake for impact accumulation (duration ignored in favor of decay)
        this.shakeIntensity += magnitude;
        this.shakeIntensity = Math.min(this.shakeIntensity, 5.0); // JUICE: Increased max shake
    }

    triggerAberration(magnitude: number): void {
        if (this.reducedMotion) return;
        this.aberrationIntensity += magnitude;
        this.aberrationIntensity = Math.min(this.aberrationIntensity, 3.0); // JUICE: Increased max aberration
    }

    /**
     * Trigger the dedicated hard-drop aberration pulse (decays exp over ~300ms).
     * This feeds the u_aberrationPulse uniform for a sharp RGB channel spike in enhanced post-process.
     */
    triggerHardDropAberrationPulse(strength: number = 1.0): void {
        if (this.reducedMotion) return;
        this.hardDropAberrationPulse = Math.max(this.hardDropAberrationPulse, strength);
    }

    /**
     * Trigger a spike in base chromatic intensity (e.g. from line clears, combo, or hard drop)
     */
    triggerChromaticSpike(strength: number = 1.0): void {
        if (this.reducedMotion) return;
        this.baseChromaticIntensity = Math.min(3.0, this.baseChromaticIntensity + strength);
    }

    /**
     * Start a 500ms radial ripple on the grid originating from a lock position.
     * Epicenter in world coords; render loop passes to grid uniforms + shader does distortion + fade.
     */
    triggerGridRipple(x: number, y: number): void {
        if (this.reducedMotion) return;
        this.gridRippleCenter[0] = x;
        this.gridRippleCenter[1] = y;
        this.gridRippleTime = 0.001; // start the outward wave
    }

    /**
     * Trigger the WebGPU-side fullscreen additive color-burn flash on level up.
     * Color comes from the new level's theme.backgroundColors[0]; fades over 400ms at high opacity.
     */
    triggerLevelUpColorFlash(color: [number, number, number], _duration: number = 0.4): void {
        if (this.reducedMotion) return;
        this.levelUpFlashColor = color && color.length >= 3 ? [color[0], color[1], color[2]] : [0.3, 0.7, 1.0];
        this.levelUpFlashIntensity = 1.0; // start at high opacity for burn
    }

    triggerSaturationBoost(strength: number = 1.0): void {
        if (this.reducedMotion) return;
        this.saturationBoost += strength;
        this.saturationBoost = Math.min(this.saturationBoost, 3.0);
    }

    triggerNeonBloomFlash(strength: number = 1.0): void {
        if (this.reducedMotion) return;
        this.neonBloomIntensity += strength;
        this.neonBloomIntensity = Math.min(this.neonBloomIntensity, 3.0); // Cap max bloom explosion
    }

    triggerBackgroundResonance(intensity: number): void {
        this.backgroundResonance += intensity;
        this.backgroundResonance = Math.min(this.backgroundResonance, 2.0); // Cap max resonance
    }

    triggerLineClearLaser(lines: number[], strength: number = 1.0): void {
        if (this.reducedMotion) return;
        this.lineClearLaserIntensity = strength;
        this.lineClearLaserY.fill(0); // Clear previous

        // Map world Y back to UV Y
        const camY = -20.0;
        const camZ = 75.0;
        const fov = (35 * Math.PI) / 180;
        const visibleHeight = 2.0 * Math.tan(fov / 2.0) * camZ;

        for (let i = 0; i < Math.min(lines.length, 4); i++) {
            const worldY = lines[i] * -2.2;
            const uvY = 0.5 - (worldY - camY) / visibleHeight;
            this.lineClearLaserY[i] = uvY;
        }
    }

    triggerGlitch(intensity: number): void {
        if (this.reducedMotion) return;
        this.glitchIntensity = intensity;
    }

    triggerLevelUp(level: number = 1): void {
        if (this.reducedMotion) return;
        // Scale effects with level
        const intensity = Math.min(1.0 + (level * 0.1), 2.0);
        
        this.warpSurge = 8.0 + (level * 0.5);
        this.triggerFlash(intensity);
        this.triggerShockwave([0.5, 0.5], 2.0 * intensity, 0.25 * intensity, 0.15, 3.0);
        this.triggerGlitch(0.8 + (level * 0.05));
        this.triggerAberration(0.5 + (level * 0.05));
        this.triggerShake(2.0 + (level * 0.2), 0.8);
    }

    triggerBlackHole(center: number[]): void {
        if (this.reducedMotion) return;
        this.blackHoleCenter = center;
        this.blackHoleTime = 0.01;
    }

    triggerShockwave(center: number[], width: number = 0.15, strength: number = 0.08, aberration: number = 0.03, speed: number = 2.0): void {
        if (this.reducedMotion) return;
        // NEON BRICKLAYER: Prevent weaker shockwaves from overwriting massive ones
        if (this.shockwaveTimer > 0 && this.shockwaveParams[1] > strength) {
            return;
        }

        this.shockwaveCenter = center;
        this.shockwaveParams = [width, strength, aberration, speed];
        // Start effect at 0.01 to avoid 0.0 check failure
        // The shader uses time * 2.0 for radius, so 0.01 is a small starting circle
        this.shockwaveTimer = 0.01;

        // JUICE: Massive shockwaves trigger a neon bloom flash
        if (strength > 0.6) {
            this.triggerNeonBloomFlash(strength * 1.8);
        }
    }

    private _shockwaveParamsF32 = new Float32Array(4);
    getShockwaveParams(): Float32Array {
        this._shockwaveParamsF32.set(this.shockwaveParams);
        return this._shockwaveParamsF32;
    }

    private _clearColors = { r: 0, g: 0, b: 0 };
    getClearColors(): { r: number, g: number, b: number } {
        let clearR = 0.0, clearG = 0.0, clearB = 0.0;

        if (this.flashTimer > 0) {
            // BALANCED RGB MULTIPLIERS - Reduced to prevent blinding flash with bloom
            //
            // DESIGN RATIONALE:
            // - Previous multipliers (0.5, 0.5, 0.2) created max RGB of (0.75, 0.75, 0.3)
            //   which was extremely bright when bloom added on top
            // - New multipliers (0.25, 0.22, 0.08) create max RGB of (0.21, 0.19, 0.07)
            //   which is ~74% reduction in brightness
            //
            // COLOR BALANCE:
            // - Red at 0.25 provides warm, energetic flash (primary intensity)
            // - Green at 0.22 keeps it slightly warmer than pure white
            // - Blue at 0.08 is minimal - prevents harsh white, adds warmth
            // - Result: Warm golden-white flash instead of harsh pure white
            //
            // BLOOM COMPATIBILITY:
            // - These lower base values allow bloom to enhance without overwhelming
            // - Flash remains visible and satisfying without washing out the screen
            // - Player can still see the board during the flash effect
            clearR = this.flashTimer * 0.25;  // Max 0.21 at peak flash (was 0.75!)
            clearG = this.flashTimer * 0.22;  // Max 0.19 at peak flash (was 0.75!)
            clearB = this.flashTimer * 0.08;  // Max 0.07 at peak flash (was 0.30!)
        } else if (this.lockTimer > 0) {
            clearB = this.lockTimer * 0.2;
        }

        this._clearColors.r = clearR;
        this._clearColors.g = clearG;
        this._clearColors.b = clearB;
        return this._clearColors;
    }

    private _shakeOffset = { x: 0, y: 0 };
    getShakeOffset(): { x: number, y: number } {
        if (this.shakeIntensity > 0) {
            this._shakeOffset.x = (Math.random() - 0.5) * this.shakeIntensity;
            this._shakeOffset.y = (Math.random() - 0.5) * this.shakeIntensity;
            return this._shakeOffset;
        }
        this._shakeOffset.x = 0;
        this._shakeOffset.y = 0;
        return this._shakeOffset;
    }

    setReactiveVideoEnabled(enabled: boolean): void {
        renderLogger.info('Reactive video:', enabled ? 'enabled' : 'disabled');
    }

    setReactiveMusicEnabled(enabled: boolean): void {
        renderLogger.info('Reactive music:', enabled ? 'enabled' : 'disabled');
    }

    triggerReactiveVideo(_eventType: 'lineClear' | 'levelUp' | 'tSpin' | 'gameOver', _intensity: number, _data?: any): void {
        // Handled by ReactiveVideoBackground
    }

    triggerReactiveMusic(_eventType: 'lineClear' | 'levelUp' | 'tSpin' | 'gameOver', _intensity: number, _data?: any): void {
        // Handled by SoundManager
    }

    triggerWarpSurge(intensity: number = 1.0): void {
        this.warpSurge = intensity * 10.0;
    }

    setTargetCombo(combo: number): void {
        // Build up energy smoothly based on combo
        const targetEnergy = Math.min(combo * 0.25, 2.5); // Max out at combo 10 (2.5 energy)
        if (this.comboEnergy < targetEnergy) {
            this.comboEnergy += (targetEnergy - this.comboEnergy) * 0.2;
        }
    }
}
