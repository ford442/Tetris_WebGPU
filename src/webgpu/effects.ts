/**
 * Visual Effects
 * Manages visual effects like shake, flash, shockwave, and video backgrounds
 */

import { videoLogger, renderLogger, audioLogger } from '../utils/logger.js';

export class VisualEffects {
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

    // Neon Bloom state
    neonBloomIntensity: number = 0;
    neonBloomBaseIntensity: number = 1.0;

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
        this.shakeIntensity *= Math.exp(-dt * 15.0);
        this.aberrationIntensity *= aberrationDecay;

        // Warp surge decay
        this.warpSurge *= 1.0 / (1.0 + dt * 1.5);
        if (this.warpSurge < 0.01) this.warpSurge = 0;

        // Glitch decay
        this.glitchIntensity *= 1.0 / (1.0 + dt * 3.0);
        if (this.glitchIntensity < 0.01) this.glitchIntensity = 0;

        // Neon Bloom decay
        this.neonBloomIntensity *= 1.0 / (1.0 + dt * 6.0); // Fast decay for snappy flash
        if (this.neonBloomIntensity < 0.01) this.neonBloomIntensity = 0;

        if (this.shakeIntensity < 0.01) this.shakeIntensity = 0;
        if (this.aberrationIntensity < 0.01) this.aberrationIntensity = 0;

        if (this.shockwaveTimer > 0) {
            this.shockwaveTimer += dt * 0.8; // Speed
            if (this.shockwaveTimer > 1.0) this.shockwaveTimer = 0.0;
        }

        // Video crossfade animation is now managed by ReactiveVideoBackground
    }

    triggerFlash(duration: number = 1.0): void {
        this.flashTimer = duration;
    }

    triggerRotate(duration: number = 0.2): void {
        this.rotationFlashTimer = duration;
    }

    triggerLock(duration: number = 0.3): void {
        this.lockTimer = duration;
    }

    triggerShake(magnitude: number, duration: number): void {
        // Additive shake for impact accumulation (duration ignored in favor of decay)
        this.shakeIntensity += magnitude;
        this.shakeIntensity = Math.min(this.shakeIntensity, 5.0); // JUICE: Increased max shake
    }

    triggerAberration(magnitude: number): void {
        this.aberrationIntensity += magnitude;
        this.aberrationIntensity = Math.min(this.aberrationIntensity, 3.0); // JUICE: Increased max aberration
    }

    triggerNeonBloomFlash(strength: number = 1.0): void {
        this.neonBloomIntensity += strength;
        this.neonBloomIntensity = Math.min(this.neonBloomIntensity, 3.0); // Cap max bloom explosion
    }

    triggerGlitch(intensity: number): void {
        this.glitchIntensity = intensity;
    }

    triggerLevelUp(level: number = 1): void {
        // Scale effects with level
        const intensity = Math.min(1.0 + (level * 0.1), 2.0);
        
        this.warpSurge = 8.0 + (level * 0.5);
        this.triggerFlash(intensity);
        this.triggerShockwave([0.5, 0.5], 2.0 * intensity, 0.25 * intensity, 0.15, 3.0);
        this.triggerGlitch(0.8 + (level * 0.05));
        this.triggerAberration(0.5 + (level * 0.05));
        this.triggerShake(2.0 + (level * 0.2), 0.8);
    }

    triggerShockwave(center: number[], width: number = 0.15, strength: number = 0.08, aberration: number = 0.03, speed: number = 2.0): void {
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

    // ==================== REACTIVE VIDEO & MUSIC ====================
    private reactiveVideoEnabled: boolean = false;
    private reactiveMusicEnabled: boolean = false;
    private videoPlaybackRate: number = 1.0;

    setReactiveVideoEnabled(enabled: boolean): void {
        this.reactiveVideoEnabled = enabled;
        renderLogger.info('Reactive video:', enabled ? 'enabled' : 'disabled');
    }

    setReactiveMusicEnabled(enabled: boolean): void {
        this.reactiveMusicEnabled = enabled;
        renderLogger.info('Reactive music:', enabled ? 'enabled' : 'disabled');
    }

    triggerReactiveVideo(eventType: 'lineClear' | 'levelUp' | 'tSpin' | 'gameOver', intensity: number, data?: any): void {
        if (!this.reactiveVideoEnabled) return;

        switch (eventType) {
            case 'lineClear':
                // Speed up video on line clears
                this.videoPlaybackRate = 1.0 + (intensity * 2.0);
                this.videoElement.playbackRate = Math.min(this.videoPlaybackRate, 4.0);
                
                // Glitch effect for big clears
                if (intensity > 0.5) {
                    this.triggerGlitch(intensity * 0.5);
                }
                break;
                
            case 'levelUp':
                // Reverse video momentarily on level up
                this.videoElement.playbackRate = -2.0;
                setTimeout(() => {
                    if (this.videoElement) {
                        this.videoElement.playbackRate = 1.0;
                    }
                }, 300);
                this.triggerWarpSurge(1.0);
                break;
                
            case 'tSpin':
                // Slow motion for T-Spin
                this.videoElement.playbackRate = 0.3;
                setTimeout(() => {
                    if (this.videoElement) {
                        this.videoElement.playbackRate = 1.0;
                    }
                }, 500);
                break;
                
            case 'gameOver':
                // Freeze frame
                this.videoElement.pause();
                break;
        }
    }

    triggerReactiveMusic(eventType: 'lineClear' | 'levelUp' | 'tSpin' | 'gameOver', intensity: number, data?: any): void {
        if (!this.reactiveMusicEnabled) return;

        // These are hooks for music system integration
        // The actual music manipulation would be handled by the SoundManager
        // We just log for now - the real implementation would emit events
        switch (eventType) {
            case 'lineClear':
                // Music would: pitch shift up, add filter sweep
                audioLogger.debug('Line clear - intensity:', intensity.toFixed(2));
                break;
            case 'levelUp':
                // Music would: transition to next section, add layer
                audioLogger.debug('Level up - new section');
                break;
            case 'tSpin':
                // Music would: accent hit, stutter effect
                audioLogger.debug('T-Spin - accent');
                break;
            case 'gameOver':
                // Music would: slow down, fade out
                audioLogger.debug('Game over - fade');
                break;
        }
    }

    triggerWarpSurge(intensity: number = 1.0): void {
        this.warpSurge = intensity * 10.0;
    }
}
