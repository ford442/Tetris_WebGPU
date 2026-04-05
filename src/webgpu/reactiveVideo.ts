/**
 * Reactive Video Background System
 * Speed ramps, effects, crossfades tied to gameplay
 */

export interface VideoEffect {
  name: string;
  apply(video: HTMLVideoElement, intensity: number): void;
}

export class ReactiveVideoBackground {
  videoElement: HTMLVideoElement;
  secondaryVideo: HTMLVideoElement; // For crossfades
  parentElement: HTMLElement;
  
  // Playback state
  basePlaybackRate: number = 1.0;
  targetPlaybackRate: number = 1.0;
  currentPlaybackRate: number = 1.0;
  
  // Effects state
  brightness: number = 1.0;
  saturation: number = 1.0;
  contrast: number = 1.0;
  hue: number = 0;
  glitchIntensity: number = 0;
  
  // Crossfade state
  isCrossfading: boolean = false;
  crossfadeProgress: number = 0;
  crossfadeDuration: number = 1.0;
  
  // Event triggers
  private lastLineClear: number = 0;
  private comboMultiplier: number = 1.0;
  private isSlowMotion: boolean = false;
  private slowMotionTimer: number = 0;
  private reversePlayback: boolean = false;
  
  // Video sources for different levels/themes
  videoSources: string[] = [];
  currentLevel: number = 0;
  currentTheme: string = 'neon';

  constructor(parentElement: HTMLElement, width: number, height: number) {
    this.parentElement = parentElement;
    
    // Primary video element
    this.videoElement = this.createVideoElement();
    this.secondaryVideo = this.createVideoElement();
    
    parentElement.appendChild(this.videoElement);
    parentElement.appendChild(this.secondaryVideo);
    
    this.updatePosition(width, height);
    
    // Setup animation loop for smooth effects
    this.animate();
  }

  private createVideoElement(): HTMLVideoElement {
    const video = document.createElement('video');
    video.autoplay = true;
    video.loop = true;
    video.muted = true;
    video.style.position = 'absolute';
    video.style.zIndex = '-1';
    video.style.objectFit = 'cover';
    video.style.transition = 'filter 0.1s ease-out';
    video.style.opacity = '0';
    
    video.addEventListener('error', () => {
      console.warn('[VideoBG] Failed to load video, using fallback');
      video.style.display = 'none';
    });
    
    video.addEventListener('playing', () => {
      video.style.opacity = '1';
    });
    
    return video;
  }

  updatePosition(width: number, height: number): void {
    const portalHeight = height * 0.9;
    const portalWidth = portalHeight * 0.5;
    const centerX = (width - portalWidth) / 2;
    const centerY = (height - portalHeight) / 2;

    [this.videoElement, this.secondaryVideo].forEach(video => {
      video.style.left = `${centerX}px`;
      video.style.top = `${centerY}px`;
      video.style.width = `${portalWidth}px`;
      video.style.height = `${portalHeight}px`;
      video.style.boxShadow = '0 0 50px rgba(0, 200, 255, 0.3)';
      video.style.borderRadius = '8px';
    });
  }

  // Set video sources for current theme
  setVideoSources(sources: string[]): void {
    this.videoSources = sources.filter(src => src); // Remove empty
  }

  // Update for level change with crossfade
  updateForLevel(level: number, instant: boolean = false): void {
    if (!this.videoSources.length) return;
    
    this.currentLevel = level;
    
    // Cycle frequency increases with level
    const cycleMultiplier = 1 + Math.floor(level / this.videoSources.length);
    const videoIndex = (level * cycleMultiplier) % this.videoSources.length;
    const newSrc = this.videoSources[videoIndex];
    
    if (!newSrc || this.videoElement.src === newSrc) return;
    
    if (instant) {
      this.videoElement.src = newSrc;
      this.videoElement.play().catch(() => {});
    } else {
      this.startCrossfade(newSrc);
    }
  }

  private startCrossfade(newSrc: string): void {
    if (this.isCrossfading) return;
    
    this.isCrossfading = true;
    this.crossfadeProgress = 0;
    
    // Load new video in secondary
    this.secondaryVideo.src = newSrc;
    this.secondaryVideo.play().catch(() => {});
    
    // Start crossfade when secondary is ready
    this.secondaryVideo.onplaying = () => {
      const fadeInterval = setInterval(() => {
        this.crossfadeProgress += 0.05;
        
        if (this.crossfadeProgress >= 1) {
          clearInterval(fadeInterval);
          // Swap videos
          this.videoElement.src = newSrc;
          this.videoElement.play().catch(() => {});
          this.secondaryVideo.style.opacity = '0';
          this.videoElement.style.opacity = '1';
          this.isCrossfading = false;
          this.crossfadeProgress = 0;
        } else {
          // Fade out primary, fade in secondary
          this.videoElement.style.opacity = String(1 - this.crossfadeProgress);
          this.secondaryVideo.style.opacity = String(this.crossfadeProgress);
        }
      }, 50);
    };
  }

  // GAMEPLAY REACTIVITY

  onLineClear(lines: number, combo: number, isTSpin: boolean, isAllClear: boolean): void {
    const now = performance.now();
    const timeSinceLast = now - this.lastLineClear;
    this.lastLineClear = now;
    
    // Speed ramp based on line count and combo
    const speedBoost = 1.0 + (lines * 0.3) + (combo * 0.1);
    this.targetPlaybackRate = Math.min(speedBoost, 4.0);
    
    // Visual effects
    this.saturation = 1.0 + (lines * 0.2);
    this.brightness = 1.0 + (lines * 0.1);
    
    if (isTSpin || isAllClear) {
      // Slow motion for special moves
      this.triggerSlowMotion(0.3, 0.3); // 0.3x speed for 0.3 seconds
    }
    
    if (isAllClear) {
      this.glitchIntensity = 1.0;
    }
    
    // Decay effects over time
    setTimeout(() => {
      this.saturation = 1.0;
      this.brightness = 1.0;
    }, 500);
  }

  onTSpin(): void {
    this.triggerSlowMotion(0.25, 0.4); // Quarter speed
    this.hue = 180; // Cyan shift
    setTimeout(() => { this.hue = 0; }, 600);
  }

  onPerfectClear(): void {
    this.triggerReverse(0.5); // Reverse for 0.5 seconds
    this.glitchIntensity = 0.8;
    this.saturation = 2.0;
    setTimeout(() => { this.saturation = 1.0; }, 800);
  }

  onLevelUp(): void {
    this.targetPlaybackRate = 3.0;
    this.brightness = 1.5;
    this.contrast = 1.3;
    
    setTimeout(() => {
      this.targetPlaybackRate = 1.0;
      this.brightness = 1.0;
      this.contrast = 1.0;
    }, 1500);
  }

  onGameOver(): void {
    this.targetPlaybackRate = 0.1;
    this.saturation = 0.0;
    this.contrast = 0.5;
  }

  private triggerSlowMotion(rate: number, duration: number): void {
    this.isSlowMotion = true;
    this.slowMotionTimer = duration;
    this.basePlaybackRate = rate;
  }

  private triggerReverse(duration: number): void {
    this.reversePlayback = true;
    setTimeout(() => { this.reversePlayback = false; }, duration * 1000);
  }

  // Apply CSS filters based on current state
  private applyFilters(): void {
    const filterString = `
      brightness(${this.brightness}) 
      saturate(${this.saturation}) 
      contrast(${this.contrast})
      hue-rotate(${this.hue}deg)
    `;
    
    this.videoElement.style.filter = filterString;
    if (this.isCrossfading) {
      this.secondaryVideo.style.filter = filterString;
    }
  }

  // Animation loop for smooth updates
  private animate(): void {
    // Smooth playback rate transition
    const rateDiff = this.targetPlaybackRate - this.currentPlaybackRate;
    this.currentPlaybackRate += rateDiff * 0.1;
    
    // Apply slow motion override
    let finalRate = this.currentPlaybackRate;
    if (this.isSlowMotion) {
      finalRate = this.basePlaybackRate;
      this.slowMotionTimer -= 0.016;
      if (this.slowMotionTimer <= 0) {
        this.isSlowMotion = false;
        this.basePlaybackRate = 1.0;
      }
    }
    
    // Apply reverse
    if (this.reversePlayback) {
      finalRate = -Math.abs(finalRate);
    }
    
    // Set playback rate
    if (this.videoElement.playbackRate !== finalRate) {
      this.videoElement.playbackRate = finalRate;
    }
    
    // Handle reverse playback by seeking
    if (this.reversePlayback && this.videoElement.currentTime > 0) {
      this.videoElement.currentTime -= 0.033; // ~30fps reverse
    }
    
    // Decay target rate back to normal
    this.targetPlaybackRate = Math.max(1.0, this.targetPlaybackRate * 0.995);
    
    // Decay glitch
    this.glitchIntensity *= 0.95;
    if (this.glitchIntensity < 0.01) this.glitchIntensity = 0;
    
    // Apply filters
    this.applyFilters();
    
    requestAnimationFrame(() => this.animate());
  }

  // New video background suggestions (these would be actual video files)
  static getVideoSuggestions(): { id: string; name: string; style: string }[] {
    return [
      { id: 'cyber_grid', name: 'Cyber Grid', style: 'Retro-futuristic grid with neon pulses' },
      { id: 'liquid_metal', name: 'Liquid Metal', style: 'Mercury-like fluid morphing' },
      { id: 'particle_field', name: 'Particle Field', style: '3D particle system with depth' },
      { id: 'abstract_waves', name: 'Abstract Waves', style: 'Colorful flowing gradients' },
      { id: 'holographic_city', name: 'Holo City', style: 'Cyberpunk cityscape with scanlines' },
      { id: 'energy_core', name: 'Energy Core', style: 'Pulsing reactor core with plasma' },
    ];
  }
}

export default ReactiveVideoBackground;
