/**
 * Enhanced Reactive Video Background System
 * 6 new premium backgrounds with extended speed control, glitch overlay, and dynamic tinting
 */

// NEW: Video background library with 6 premium themes
export const VIDEO_BACKGROUNDS = {
  // Level 0-1: Cyber Liquid Metal - Flowing mercury with neon edge detection
  cyberLiquidMetal: {
    id: 'cyber_liquid_metal',
    name: 'Cyber Liquid Metal',
    src: './assets/video/bg_liquid_metal.mp4',
    fallbackSrc: './assets/video/bg1.mp4',
    style: 'flowing-mercury',
    baseParams: { brightness: 1.1, contrast: 1.2, saturation: 0.8 }
  },
  
  // Level 2-3: Abstract Data Stream - Matrix-like falling data with color cycling
  abstractDataStream: {
    id: 'abstract_data_stream',
    name: 'Abstract Data Stream',
    src: './assets/video/bg_data_stream.mp4',
    fallbackSrc: './assets/video/bg2.mp4',
    style: 'matrix-data',
    baseParams: { brightness: 0.9, contrast: 1.1, saturation: 1.3 }
  },
  
  // Level 4-5: Neon Grid - Retro-futuristic perspective grid with pulsing lines
  neonGrid: {
    id: 'neon_grid',
    name: 'Neon Grid',
    src: './assets/video/bg_neon_grid.mp4',
    fallbackSrc: './assets/video/bg3.mp4',
    style: 'retro-grid',
    baseParams: { brightness: 1.0, contrast: 1.3, saturation: 1.5 }
  },
  
  // Level 6-7: Volumetric Fog - Deep atmospheric fog with light shafts
  volumetricFog: {
    id: 'volumetric_fog',
    name: 'Volumetric Fog',
    src: './assets/video/bg_volumetric_fog.mp4',
    fallbackSrc: './assets/video/bg4.mp4',
    style: 'atmospheric-fog',
    baseParams: { brightness: 0.85, contrast: 1.0, saturation: 0.9 }
  },
  
  // Level 8-9: Glitch Field - Corrupted digital artifacts with chromatic splits
  glitchField: {
    id: 'glitch_field',
    name: 'Glitch Field',
    src: './assets/video/bg_glitch_field.mp4',
    fallbackSrc: './assets/video/bg5.mp4',
    style: 'digital-corruption',
    baseParams: { brightness: 1.0, contrast: 1.4, saturation: 1.2 }
  },
  
  // Level 10+: Holographic Particles - 3D particle field with depth parallax
  holographicParticles: {
    id: 'holographic_particles',
    name: 'Holographic Particles',
    src: './assets/video/bg_holo_particles.mp4',
    fallbackSrc: './assets/video/bg6.mp4',
    style: 'holographic-depth',
    baseParams: { brightness: 1.2, contrast: 1.1, saturation: 1.4 }
  }
};

export type VideoBackgroundKey = keyof typeof VIDEO_BACKGROUNDS;

export interface VideoEffect {
  name: string;
  apply(video: HTMLVideoElement, intensity: number): void;
}

export class ReactiveVideoBackground {
  videoElement: HTMLVideoElement;
  secondaryVideo: HTMLVideoElement;
  glitchOverlay: HTMLDivElement; // NEW: Glitch overlay element
  parentElement: HTMLElement;
  
  // Playback state - ENHANCED: Extended range 0.3x - 2.5x
  basePlaybackRate: number = 1.0;
  targetPlaybackRate: number = 1.0;
  currentPlaybackRate: number = 1.0;
  minPlaybackRate: number = 0.3;  // NEW: Slower slow-mo
  maxPlaybackRate: number = 2.5;  // NEW: Faster speed ramp
  
  // Effects state
  brightness: number = 1.0;
  saturation: number = 1.0;
  contrast: number = 1.0;
  hue: number = 0;
  sepia: number = 0;           // NEW: Sepia tint
  invert: number = 0;          // NEW: Invert effect
  glitchIntensity: number = 0;
  
  // NEW: Dynamic tinting based on gameplay
  comboTint: number = 0;       // 0-1 intensity based on combo
  tSpinTint: boolean = false;  // Cyan flash for T-spins
  
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
  private reverseDuration: number = 0;
  
  // Video sources for different levels/themes
  videoSources: string[] = [];
  currentLevel: number = 0;
  currentTheme: string = 'neon';
  
  // NEW: Track current background config
  currentBackground: VideoBackgroundKey | null = null;

  constructor(parentElement: HTMLElement, width: number, height: number) {
    this.parentElement = parentElement;
    
    // Primary video element
    this.videoElement = this.createVideoElement();
    this.secondaryVideo = this.createVideoElement();
    this.glitchOverlay = this.createGlitchOverlay(); // NEW
    
    parentElement.appendChild(this.videoElement);
    parentElement.appendChild(this.secondaryVideo);
    parentElement.appendChild(this.glitchOverlay);
    
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
      // Try fallback if available
      const currentSrc = video.src;
      const bgKey = this.getBackgroundForLevel(this.currentLevel);
      const bgConfig = VIDEO_BACKGROUNDS[bgKey];
      if (bgConfig && bgConfig.fallbackSrc && currentSrc === bgConfig.src) {
        console.log('[VideoBG] Attempting fallback...');
        video.src = bgConfig.fallbackSrc;
        video.play().catch(() => {});
      } else {
        video.style.display = 'none';
      }
    });
    
    video.addEventListener('playing', () => {
      video.style.opacity = '1';
    });
    
    return video;
  }

  // NEW: Create glitch overlay element
  private createGlitchOverlay(): HTMLDivElement {
    const overlay = document.createElement('div');
    overlay.style.position = 'absolute';
    overlay.style.zIndex = '-1';
    overlay.style.pointerEvents = 'none';
    overlay.style.opacity = '0';
    overlay.style.background = `
      repeating-linear-gradient(
        0deg,
        transparent,
        transparent 2px,
        rgba(255, 0, 0, 0.1) 2px,
        rgba(255, 0, 0, 0.1) 4px
      )
    `;
    overlay.style.mixBlendMode = 'overlay';
    return overlay;
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
    
    // NEW: Update glitch overlay position
    this.glitchOverlay.style.left = `${centerX}px`;
    this.glitchOverlay.style.top = `${centerY}px`;
    this.glitchOverlay.style.width = `${portalWidth}px`;
    this.glitchOverlay.style.height = `${portalHeight}px`;
    this.glitchOverlay.style.borderRadius = '8px';
  }

  // NEW: Get background key for level
  private getBackgroundForLevel(level: number): VideoBackgroundKey {
    if (level >= 10) return 'holographicParticles';
    if (level >= 8) return 'glitchField';
    if (level >= 6) return 'volumetricFog';
    if (level >= 4) return 'neonGrid';
    if (level >= 2) return 'abstractDataStream';
    return 'cyberLiquidMetal';
  }

  // ENHANCED: Set video sources using new background library
  setVideoSources(sources: string[]): void {
    // If sources provided, use them; otherwise use library
    if (sources && sources.length > 0) {
      this.videoSources = sources.filter(src => src);
    } else {
      // Use library defaults
      this.videoSources = Object.values(VIDEO_BACKGROUNDS).map(bg => bg.src);
    }
  }

  // ENHANCED: Update for level with smooth crossfade and background selection
  updateForLevel(level: number, instant: boolean = false): void {
    this.currentLevel = level;
    
    // NEW: Select background based on level
    const bgKey = this.getBackgroundForLevel(level);
    const bgConfig = VIDEO_BACKGROUNDS[bgKey];
    
    if (!bgConfig) return;
    
    // Apply base params for this background
    this.brightness = bgConfig.baseParams.brightness;
    this.contrast = bgConfig.baseParams.contrast;
    this.saturation = bgConfig.baseParams.saturation;
    
    const newSrc = bgConfig.src;
    
    if (!newSrc || this.videoElement.src === newSrc) return;
    
    this.currentBackground = bgKey;
    
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

  // ENHANCED GAMEPLAY REACTIVITY

  onLineClear(lines: number, combo: number, isTSpin: boolean, isAllClear: boolean): void {
    const now = performance.now();
    const timeSinceLast = now - this.lastLineClear;
    this.lastLineClear = now;
    
    // ENHANCED: Speed ramp 0.3x - 2.5x based on line count and combo
    const speedBoost = 1.0 + (lines * 0.4) + (combo * 0.15);
    this.targetPlaybackRate = Math.min(speedBoost, this.maxPlaybackRate);
    
    // Visual effects
    this.saturation = 1.0 + (lines * 0.25);
    this.brightness = 1.0 + (lines * 0.12);
    
    // NEW: Combo tint intensifies with higher combos
    this.comboTint = Math.min(1.0, combo * 0.15);
    
    if (isTSpin || isAllClear) {
      // ENHANCED: Slower slow-motion (0.3x)
      this.triggerSlowMotion(0.3, 0.4);
    }
    
    if (isAllClear) {
      this.glitchIntensity = 1.0;
      this.invert = 0.5; // NEW: Flash invert
    }
    
    // Decay effects over time
    setTimeout(() => {
      this.saturation = VIDEO_BACKGROUNDS[this.currentBackground || 'cyberLiquidMetal']?.baseParams.saturation || 1.0;
      this.brightness = VIDEO_BACKGROUNDS[this.currentBackground || 'cyberLiquidMetal']?.baseParams.brightness || 1.0;
      this.comboTint = 0;
      this.invert = 0;
    }, 600);
  }

  onTSpin(): void {
    // ENHANCED: Extreme slow-motion (0.25x)
    this.triggerSlowMotion(0.25, 0.5);
    this.hue = 180; // Cyan shift
    this.tSpinTint = true; // NEW: Enable T-spin tint
    this.glitchIntensity = 0.6;
    
    setTimeout(() => { 
      this.hue = 0; 
      this.tSpinTint = false;
    }, 800);
  }

  onPerfectClear(): void {
    // ENHANCED: Longer reverse playback
    this.triggerReverse(0.8);
    this.glitchIntensity = 1.0;
    this.saturation = 2.2;
    this.invert = 0.3;
    this.sepia = 0.2;
    
    setTimeout(() => { 
      this.saturation = VIDEO_BACKGROUNDS[this.currentBackground || 'cyberLiquidMetal']?.baseParams.saturation || 1.0;
      this.invert = 0;
      this.sepia = 0;
    }, 1000);
  }

  onLevelUp(): void {
    // ENHANCED: Faster speed burst
    this.targetPlaybackRate = this.maxPlaybackRate; // 2.5x
    this.brightness = 1.6;
    this.contrast = 1.4;
    this.saturation = 1.6;
    this.comboTint = 0.5;
    
    // Trigger crossfade to new background if level changed tiers
    this.updateForLevel(this.currentLevel);
    
    setTimeout(() => {
      this.targetPlaybackRate = 1.0;
      this.brightness = VIDEO_BACKGROUNDS[this.currentBackground || 'cyberLiquidMetal']?.baseParams.brightness || 1.0;
      this.contrast = VIDEO_BACKGROUNDS[this.currentBackground || 'cyberLiquidMetal']?.baseParams.contrast || 1.0;
      this.saturation = VIDEO_BACKGROUNDS[this.currentBackground || 'cyberLiquidMetal']?.baseParams.saturation || 1.0;
      this.comboTint = 0;
    }, 2000);
  }

  onGameOver(): void {
    this.targetPlaybackRate = 0.15;
    this.saturation = 0.0;
    this.contrast = 0.4;
    this.sepia = 0.5;
    this.invert = 0.2;
  }

  // ENHANCED: Trigger slow motion with configurable rate
  triggerSlowMotion(rate: number, duration: number): void {
    this.isSlowMotion = true;
    this.slowMotionTimer = duration;
    this.basePlaybackRate = Math.max(this.minPlaybackRate, rate);
  }

  // ENHANCED: Trigger reverse with configurable duration
  triggerReverse(duration: number): void {
    this.reversePlayback = true;
    this.reverseDuration = duration;
    setTimeout(() => { 
      this.reversePlayback = false; 
    }, duration * 1000);
  }

  // ENHANCED: Apply CSS filters with glitch overlay and dynamic tinting
  private applyFilters(): void {
    // Build dynamic color tint based on combo/T-spin
    let tintFilter = '';
    if (this.comboTint > 0) {
      // Orange/red tint for high combos
      const r = Math.floor(255 * this.comboTint);
      tintFilter += ` drop-shadow(0 0 ${10 * this.comboTint}px rgb(${r}, 100, 0))`;
    }
    if (this.tSpinTint) {
      // Cyan tint for T-spins
      tintFilter += ` drop-shadow(0 0 15px rgb(0, 255, 255))`;
    }
    
    const filterString = `
      brightness(${this.brightness}) 
      saturate(${this.saturation}) 
      contrast(${this.contrast})
      hue-rotate(${this.hue}deg)
      sepia(${this.sepia})
      invert(${this.invert})
      ${tintFilter}
    `;
    
    this.videoElement.style.filter = filterString;
    if (this.isCrossfading) {
      this.secondaryVideo.style.filter = filterString;
    }
    
    // NEW: Update glitch overlay
    if (this.glitchIntensity > 0) {
      this.glitchOverlay.style.opacity = String(this.glitchIntensity * 0.3);
      this.glitchOverlay.style.transform = `translateX(${Math.random() * 4 - 2}px)`;
    } else {
      this.glitchOverlay.style.opacity = '0';
    }
  }

  // ENHANCED: Animation loop with extended playback range
  private animate(): void {
    // Smooth playback rate transition
    const rateDiff = this.targetPlaybackRate - this.currentPlaybackRate;
    this.currentPlaybackRate += rateDiff * 0.08; // Slightly smoother
    
    // Clamp to extended range
    this.currentPlaybackRate = Math.max(this.minPlaybackRate, 
      Math.min(this.maxPlaybackRate, this.currentPlaybackRate));
    
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
    
    // Set playback rate (with safety clamp)
    const safeRate = Math.max(-this.maxPlaybackRate, Math.min(this.maxPlaybackRate, finalRate));
    if (this.videoElement.playbackRate !== safeRate) {
      this.videoElement.playbackRate = safeRate;
    }
    
    // Handle reverse playback by seeking
    if (this.reversePlayback && this.videoElement.currentTime > 0.1) {
      this.videoElement.currentTime -= 0.04; // ~25fps reverse
    }
    
    // Decay target rate back to normal
    this.targetPlaybackRate = Math.max(1.0, this.targetPlaybackRate * 0.992);
    
    // Decay glitch
    this.glitchIntensity *= 0.94;
    if (this.glitchIntensity < 0.01) this.glitchIntensity = 0;
    
    // Decay combo tint
    this.comboTint *= 0.97;
    if (this.comboTint < 0.01) this.comboTint = 0;
    
    // Decay invert/sepia
    this.invert *= 0.95;
    this.sepia *= 0.95;
    
    // Apply filters
    this.applyFilters();
    
    requestAnimationFrame(() => this.animate());
  }

  // ENHANCED: Get video suggestions with level mapping
  static getVideoSuggestions(): { id: string; name: string; style: string; levelRange: string }[] {
    return [
      { id: 'cyber_liquid_metal', name: 'Cyber Liquid Metal', style: 'Flowing mercury with neon edge detection', levelRange: '0-1' },
      { id: 'abstract_data_stream', name: 'Abstract Data Stream', style: 'Matrix-like falling data with color cycling', levelRange: '2-3' },
      { id: 'neon_grid', name: 'Neon Grid', style: 'Retro-futuristic perspective grid with pulsing lines', levelRange: '4-5' },
      { id: 'volumetric_fog', name: 'Volumetric Fog', style: 'Deep atmospheric fog with light shafts', levelRange: '6-7' },
      { id: 'glitch_field', name: 'Glitch Field', style: 'Corrupted digital artifacts with chromatic splits', levelRange: '8-9' },
      { id: 'holographic_particles', name: 'Holographic Particles', style: '3D particle field with depth parallax', levelRange: '10+' },
    ];
  }
}

export default ReactiveVideoBackground;
