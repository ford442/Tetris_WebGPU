/**
 * Visual Effects
 * Manages visual effects like shake, flash, shockwave, and video backgrounds
 */

export class VisualEffects {
    // Visual effect timers
    flashTimer: number = 0;
    lockTimer: number = 0;
    shakeTimer: number = 0;
    shakeMagnitude: number = 0;
    
    // Shockwave state
    shockwaveTimer: number = 0;
    shockwaveCenter: number[] = [0.5, 0.5];

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
        // 1. Calculate a "Portal" size that matches the Tetris aspect ratio (10 cols x 20 rows = 1:2)
        // We base it on height to ensure it fits on screen
        const portalHeight = height * 0.9; // 90% of screen height
        const portalWidth = portalHeight * 0.5; // Aspect ratio 0.5 (10/20)

        // 2. Center the video container on the screen
        const centerX = (width - portalWidth) / 2;
        const centerY = (height - portalHeight) / 2;

        this.videoElement.style.left = `${centerX}px`;
        this.videoElement.style.top = `${centerY}px`;
        this.videoElement.style.width = `${portalWidth}px`;
        this.videoElement.style.height = `${portalHeight}px`;

        // 3. Ensure the video fills this portal completely
        this.videoElement.style.objectFit = 'cover';

        // 4. Optional: Add a border/glow to the video to frame the portal
        this.videoElement.style.boxShadow = '0 0 50px rgba(0, 200, 255, 0.2)';
        this.videoElement.style.borderRadius = '4px';
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

        // Cap level to available videos (uses last video for levels exceeding array length)
        const videoIndex = Math.min(level, levelVideos.length - 1);
        const videoSrc = levelVideos[videoIndex];

        // Only update if the source is different from what we're tracking
        if (this.currentVideoSrc === videoSrc) {
            return; // Already playing the correct video
        }

        this.currentVideoSrc = videoSrc;
        this.isVideoPlaying = false; // Reset state
        if (videoSrc) {
            this.videoElement.src = videoSrc;
            // Don't show immediately, wait for 'playing' event
            this.videoElement.play().catch(e => {
                console.log("Video autoplay failed", e);
                // Fallback handled by catch + error listener
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

        if (this.shakeTimer > 0) this.shakeTimer -= dt;
        if (this.shakeTimer < 0) this.shakeTimer = 0;

        if (this.shockwaveTimer > 0) {
            this.shockwaveTimer += dt * 0.8; // Speed
            if (this.shockwaveTimer > 1.0) this.shockwaveTimer = 0.0;
        }
    }

    triggerFlash(duration: number = 1.0): void {
        this.flashTimer = duration;
    }

    triggerLock(duration: number = 0.3): void {
        this.lockTimer = duration;
    }

    triggerShake(magnitude: number, duration: number): void {
        this.shakeTimer = duration;
        this.shakeMagnitude = magnitude;
    }

    triggerShockwave(center: number[]): void {
        this.shockwaveCenter = center;
        this.shockwaveTimer = 0.01; // Start effect
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
        if (this.shakeTimer > 0) {
            return {
                x: (Math.random() - 0.5) * this.shakeMagnitude,
                y: (Math.random() - 0.5) * this.shakeMagnitude
            };
        }
        return { x: 0, y: 0 };
    }
}
