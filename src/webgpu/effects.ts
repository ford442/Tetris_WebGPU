/**
 * Visual Effects
 * Manages visual effects like shake, flash, shockwave, and video backgrounds
 */

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

    // Video background state
    videoElement: HTMLVideoElement;
    isVideoPlaying: boolean = false;
    currentLevel: number = 0;
    currentVideoSrc: string = '';

    constructor(parentElement: HTMLElement, width: number, height: number) {
        // Setup Video Element
        this.videoElement = document.createElement('video');
        this.videoElement.autoplay = true;
        this.videoElement.loop = true;
        this.videoElement.muted = true;
        this.videoElement.style.position = 'absolute';
        this.videoElement.style.zIndex = '-1'; // Behind canvas
        this.videoElement.style.display = 'none';
        this.videoElement.style.objectFit = 'contain';

        // Fallback detection
        this.videoElement.addEventListener('error', () => {
            console.warn('Video background failed to load. Falling back to shader.');
            this.isVideoPlaying = false;
            this.videoElement.style.display = 'none';
        });
        this.videoElement.addEventListener('playing', () => {
            this.isVideoPlaying = true;
            this.videoElement.style.display = 'block';
        });

        parentElement.appendChild(this.videoElement);
        this.updateVideoPosition(width, height);
    }

    updateVideoPosition(width: number, height: number): void {
        const portalHeight = height * 0.9;
        const portalWidth = portalHeight * 0.5;

        const centerX = (width - portalWidth) / 2;
        const centerY = (height - portalHeight) / 2;

        this.videoElement.style.left = `${centerX}px`;
        this.videoElement.style.top = `${centerY}px`;
        this.videoElement.style.width = `${portalWidth}px`;
        this.videoElement.style.height = `${portalHeight}px`;

        this.videoElement.style.objectFit = 'cover';

        this.videoElement.style.boxShadow = '0 0 50px rgba(0, 200, 255, 0.2)';
        this.videoElement.style.borderRadius = '4px';
    }

    updateVideoForLevel(level: number, levelVideos?: string[]): void {
        if (!levelVideos || levelVideos.length === 0) {
            this.videoElement.pause();
            this.videoElement.src = "";
            this.videoElement.style.display = 'none';
            this.isVideoPlaying = false;
            return;
        }

        const videoIndex = Math.min(level, levelVideos.length - 1);
        const videoSrc = levelVideos[videoIndex];

        if (this.currentVideoSrc === videoSrc) {
            return;
        }

        this.currentVideoSrc = videoSrc;
        this.isVideoPlaying = false;
        if (videoSrc) {
            this.videoElement.src = videoSrc;
            this.videoElement.play().catch(e => {
                console.log("Video autoplay failed", e);
                this.isVideoPlaying = false;
                this.videoElement.style.display = 'none';
            });
        } else {
            this.videoElement.pause();
            this.videoElement.src = "";
            this.videoElement.style.display = 'none';
        }
    }

    updateEffects(dt: number): void {
        if (this.flashTimer > 0) this.flashTimer -= dt;
        if (this.flashTimer < 0) this.flashTimer = 0;

        if (this.lockTimer > 0) this.lockTimer -= dt;
        if (this.lockTimer < 0) this.lockTimer = 0;

        const decay = Math.exp(-dt * 5.0);
        this.shakeIntensity *= decay;
        this.aberrationIntensity *= decay;

        this.warpSurge *= Math.exp(-dt * 2.0);
        if (this.warpSurge < 0.01) this.warpSurge = 0;

        this.glitchIntensity *= Math.exp(-dt * 3.0);
        if (this.glitchIntensity < 0.01) this.glitchIntensity = 0;

        if (this.shakeIntensity < 0.01) this.shakeIntensity = 0;
        if (this.aberrationIntensity < 0.01) this.aberrationIntensity = 0;

        if (this.shockwaveTimer > 0) {
            this.shockwaveTimer += dt * 0.8;
            if (this.shockwaveTimer > 1.0) this.shockwaveTimer = 0.0;
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
        this.shakeIntensity += magnitude;
        this.shakeIntensity = Math.min(this.shakeIntensity, 8.0);
    }

    triggerAberration(magnitude: number): void {
        this.aberrationIntensity += magnitude;
        this.aberrationIntensity = Math.min(this.aberrationIntensity, 3.0);
    }

    triggerGlitch(intensity: number): void {
        this.glitchIntensity = intensity;
    }

    triggerLevelUp(): void {
        this.warpSurge = 8.0;
        this.triggerFlash(1.0);
        this.triggerShockwave([0.5, 0.5], 2.0, 0.2, 0.1);
        this.triggerGlitch(0.8);
    }

    triggerShockwave(center: number[], width: number = 0.15, strength: number = 0.08, aberration: number = 0.03, speed: number = 2.0): void {
        this.shockwaveCenter = center;
        this.shockwaveParams = [width, strength, aberration, speed];
        this.shockwaveTimer = 0.01;
    }

    getShockwaveParams(): Float32Array {
        return new Float32Array(this.shockwaveParams);
    }

    getClearColors(): { r: number, g: number, b: number } {
        let clearR = 0.0, clearG = 0.0, clearB = 0.0;

        if (this.flashTimer > 0) {
            clearR = this.flashTimer * 0.5;
            clearG = this.flashTimer * 0.5;
            clearB = this.flashTimer * 0.2;
        } else if (this.lockTimer > 0) {
            clearB = this.lockTimer * 0.2;
        }

        return { r: clearR, g: clearG, b: clearB };
    }

    getShakeOffset(): { x: number, y: number } {
        if (this.shakeIntensity > 0) {
            return {
                x: (Math.random() - 0.5) * this.shakeIntensity,
                y: (Math.random() - 0.5) * this.shakeIntensity
            };
        }
        return { x: 0, y: 0 };
    }
}