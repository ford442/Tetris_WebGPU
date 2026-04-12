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

    // Video background state with smooth crossfading
    videoElement: HTMLVideoElement;
    standbyVideoElement: HTMLVideoElement;
    isVideoPlaying: boolean = false;
    currentLevel: number = 0;
    currentVideoSrc: string = '';
    pendingVideoSrc: string = '';
    
    // Crossfade state
    isCrossfading: boolean = false;
    crossfadeProgress: number = 0;
    crossfadeDuration: number = 2.0; // 2 seconds
    primaryOpacity: number = 1.0;
    standbyOpacity: number = 0.0;

    constructor(parentElement: HTMLElement, width: number, height: number) {
        // Setup Primary Video Element
        this.videoElement = document.createElement('video');
        this.videoElement.autoplay = true;
        this.videoElement.loop = true;
        this.videoElement.muted = true;
        this.videoElement.style.position = 'absolute';
        this.videoElement.style.zIndex = '-1'; // Behind canvas
        this.videoElement.style.display = 'none';
        this.videoElement.style.objectFit = 'contain';
        this.videoElement.style.transition = 'opacity 0.1s linear';

        // Setup Standby Video Element (for crossfading)
        this.standbyVideoElement = document.createElement('video');
        this.standbyVideoElement.autoplay = false;
        this.standbyVideoElement.loop = true;
        this.standbyVideoElement.muted = true;
        this.standbyVideoElement.style.position = 'absolute';
        this.standbyVideoElement.style.zIndex = '-2'; // Behind primary
        this.standbyVideoElement.style.display = 'none';
        this.standbyVideoElement.style.objectFit = 'contain';
        this.standbyVideoElement.style.opacity = '0';
        this.standbyVideoElement.style.transition = 'opacity 0.1s linear';

        // Fallback detection for primary
        this.videoElement.addEventListener('error', () => {
            videoLogger.warn('Failed to load, falling back to shader');
            this.isVideoPlaying = false;
            this.videoElement.style.display = 'none';
        });
        this.videoElement.addEventListener('playing', () => {
            this.isVideoPlaying = true;
            this.videoElement.style.display = 'block';
        });

        // Standby video events
        this.standbyVideoElement.addEventListener('canplay', () => {
            if (this.pendingVideoSrc) {
                this.startCrossfade();
            }
        });

        parentElement.appendChild(this.videoElement);
        parentElement.appendChild(this.standbyVideoElement);
        this.updateVideoPosition(width, height);
    }

    updateVideoPosition(width: number, height: number): void {
        // 1. Calculate a "Portal" size that matches the Tetris aspect ratio (10 cols x 20 rows = 1:2)
        const portalHeight = height * 0.9; // 90% of screen height
        const portalWidth = portalHeight * 0.5; // Aspect ratio 0.5 (10/20)

        // 2. Center the video container on the screen
        const centerX = (width - portalWidth) / 2;
        const centerY = (height - portalHeight) / 2;

        // Apply to both primary and standby videos
        [this.videoElement, this.standbyVideoElement].forEach(video => {
            video.style.left = `${centerX}px`;
            video.style.top = `${centerY}px`;
            video.style.width = `${portalWidth}px`;
            video.style.height = `${portalHeight}px`;
            video.style.objectFit = 'cover';
            video.style.boxShadow = '0 0 50px rgba(0, 200, 255, 0.2)';
            video.style.borderRadius = '4px';
        });
    }

    updateVideoForLevel(level: number, levelVideos?: string[]): void {
        if (!levelVideos || levelVideos.length === 0) {
            // No videos configured for this theme
            this.videoElement.pause();
            this.videoElement.src = "";
            this.videoElement.style.display = 'none';
            this.isVideoPlaying = false;
            return;
        }

        // Increase cycling frequency at higher levels
        const cycleMultiplier = 1 + Math.floor(level / levelVideos.length);
        const videoIndex = (level * cycleMultiplier) % levelVideos.length;
        const videoSrc = levelVideos[videoIndex];

        // Only update if the source is different
        if (this.currentVideoSrc === videoSrc) {
            return; // Already playing the correct video
        }

        // Start crossfade: load new video into standby
        this.pendingVideoSrc = videoSrc;
        this.standbyVideoElement.src = videoSrc;
        this.standbyVideoElement.load();
        
        // If already crossfading, reset
        if (this.isCrossfading) {
            this.isCrossfading = false;
            this.crossfadeProgress = 0;
        }
    }

    startCrossfade(): void {
        if (!this.pendingVideoSrc) return;
        
        this.isCrossfading = true;
        this.crossfadeProgress = 0;
        
        // Start playing standby video
        this.standbyVideoElement.play().catch(e => {
            videoLogger.debug("Standby autoplay failed", e);
        });
        
        videoLogger.info('Starting crossfade to:', this.pendingVideoSrc);
    }

    completeCrossfade(): void {
        if (!this.pendingVideoSrc) return;
        
        // Swap videos: standby becomes primary
        const oldPrimary = this.videoElement;
        this.videoElement = this.standbyVideoElement;
        this.standbyVideoElement = oldPrimary;
        
        // Update z-index
        this.videoElement.style.zIndex = '-1';
        this.standbyVideoElement.style.zIndex = '-2';
        
        // Reset opacity
        this.videoElement.style.opacity = '1';
        this.standbyVideoElement.style.opacity = '0';
        this.standbyVideoElement.style.display = 'none';
        
        // Update state
        this.currentVideoSrc = this.pendingVideoSrc;
        this.pendingVideoSrc = '';
        this.isCrossfading = false;
        this.crossfadeProgress = 0;
        this.isVideoPlaying = true;
        
        videoLogger.info('Crossfade complete, now playing:', this.currentVideoSrc);
    }

    updateEffects(dt: number): void {
        if (this.flashTimer > 0) this.flashTimer -= dt;
        if (this.flashTimer < 0) this.flashTimer = 0;

        if (this.lockTimer > 0) this.lockTimer -= dt;
        if (this.lockTimer < 0) this.lockTimer = 0;

        // Exponential decay for smooth game feel (fast algebraic approximation)
        const decay = 1.0 / (1.0 + dt * 3.0);
        this.shakeIntensity *= decay;
        this.aberrationIntensity *= decay;

        // Warp surge decay
        this.warpSurge *= 1.0 / (1.0 + dt * 1.5);
        if (this.warpSurge < 0.01) this.warpSurge = 0;

        // Glitch decay
        this.glitchIntensity *= 1.0 / (1.0 + dt * 3.0);
        if (this.glitchIntensity < 0.01) this.glitchIntensity = 0;

        if (this.shakeIntensity < 0.01) this.shakeIntensity = 0;
        if (this.aberrationIntensity < 0.01) this.aberrationIntensity = 0;

        if (this.shockwaveTimer > 0) {
            this.shockwaveTimer += dt * 0.8; // Speed
            if (this.shockwaveTimer > 1.0) this.shockwaveTimer = 0.0;
        }

        // Handle video crossfade animation
        if (this.isCrossfading) {
            this.crossfadeProgress += dt / this.crossfadeDuration;
            
            if (this.crossfadeProgress >= 1.0) {
                // Crossfade complete
                this.completeCrossfade();
            } else {
                // Update opacity during crossfade
                const t = this.crossfadeProgress;
                // Smoothstep for smoother transition
                const smoothT = t * t * (3.0 - 2.0 * t);
                this.primaryOpacity = 1.0 - smoothT;
                this.standbyOpacity = smoothT;
                
                this.videoElement.style.opacity = this.primaryOpacity.toString();
                this.standbyVideoElement.style.opacity = this.standbyOpacity.toString();
                this.standbyVideoElement.style.display = 'block';
            }
        }
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
        
        this.shockwaveCenter = center;
        this.shockwaveParams = [width, strength, aberration, speed];
        // Start effect at 0.01 to avoid 0.0 check failure
        // The shader uses time * 2.0 for radius, so 0.01 is a small starting circle
        this.shockwaveTimer = 0.01;
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
            clearR = this.flashTimer * 0.5;
            clearG = this.flashTimer * 0.5;
            clearB = this.flashTimer * 0.2;
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
