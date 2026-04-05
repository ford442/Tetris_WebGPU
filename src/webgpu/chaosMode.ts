/**
 * Visual Chaos Mode System
 * Extreme cyberpunk overload effects
 * Toggle with 'C' key or UI button
 */

export interface ChaosModeState {
  enabled: boolean;
  intensity: number; // 0.0 - 1.0
  startTime: number;
}

export class ChaosModeController {
  state: ChaosModeState = {
    enabled: false,
    intensity: 0.0,
    startTime: 0
  };

  // Effect multipliers when chaos mode is active
  readonly effectMultipliers = {
    bloom: 3.0,           // Extreme bloom
    shake: 2.5,           // Constant screen shake
    aberration: 2.0,      // Heavy chromatic aberration
    filmGrain: 3.0,       // 3x film grain
    scanlines: 2.5,       // Stronger scanlines
    videoReverse: 1.0,    // Reverse on every clear
    videoSpeed: 2.0,      // Faster video ramps
    glitch: 2.0,          // More glitch
    pulse: 1.0            // Constant chromatic pulse
  };

  // Base values to restore when disabling
  private baseValues: {
    bloomIntensity: number;
    enableShake: boolean;
    aberrationStrength: number;
    filmGrainAmount: number;
    scanlineStrength: number;
  } | null = null;

  constructor() {
    this.setupKeyListener();
  }

  private setupKeyListener(): void {
    document.addEventListener('keydown', (e) => {
      // Toggle chaos mode with 'C' key
      if (e.key === 'c' || e.key === 'C') {
        // Don't trigger if typing in an input
        if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
          return;
        }
        this.toggle();
      }
    });
  }

  toggle(): boolean {
    this.state.enabled = !this.state.enabled;
    
    if (this.state.enabled) {
      this.activate();
    } else {
      this.deactivate();
    }
    
    return this.state.enabled;
  }

  private activate(): void {
    this.state.startTime = performance.now();
    this.state.intensity = 1.0;
    
    console.log('[CHAOS MODE] ACTIVATED 🔥🔥🔥');
    
    // Visual feedback
    this.showNotification('CHAOS MODE ACTIVATED');
  }

  private deactivate(): void {
    this.state.intensity = 0.0;
    
    console.log('[CHAOS MODE] Deactivated');
    
    this.showNotification('Chaos Mode Off');
  }

  private showNotification(text: string): void {
    const notification = document.createElement('div');
    notification.textContent = text;
    notification.style.cssText = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      font-family: 'Courier New', monospace;
      font-size: 48px;
      font-weight: bold;
      color: #ff00ff;
      text-shadow: 
        0 0 10px #ff00ff,
        0 0 20px #ff00ff,
        0 0 40px #ff00ff,
        0 0 80px #ff00ff;
      pointer-events: none;
      z-index: 9999;
      animation: chaosPulse 0.5s ease-out;
    `;
    
    // Add animation keyframes if not present
    if (!document.getElementById('chaos-animations')) {
      const style = document.createElement('style');
      style.id = 'chaos-animations';
      style.textContent = `
        @keyframes chaosPulse {
          0% { transform: translate(-50%, -50%) scale(0.5); opacity: 0; }
          20% { transform: translate(-50%, -50%) scale(1.2); opacity: 1; }
          100% { transform: translate(-50%, -50%) scale(1); opacity: 0; }
        }
      `;
      document.head.appendChild(style);
    }
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
      notification.remove();
    }, 1000);
  }

  // Get current chaos-adjusted values
  getBloomMultiplier(): number {
    return this.state.enabled ? this.effectMultipliers.bloom : 1.0;
  }

  getShakeMultiplier(): number {
    return this.state.enabled ? this.effectMultipliers.shake : 0.0;
  }

  getAberrationMultiplier(): number {
    return this.state.enabled ? this.effectMultipliers.aberration : 1.0;
  }

  getFilmGrainMultiplier(): number {
    return this.state.enabled ? this.effectMultipliers.filmGrain : 1.0;
  }

  getScanlineMultiplier(): number {
    return this.state.enabled ? this.effectMultipliers.scanlines : 1.0;
  }

  shouldReverseOnClear(): boolean {
    return this.state.enabled;
  }

  getVideoSpeedMultiplier(): number {
    return this.state.enabled ? this.effectMultipliers.videoSpeed : 1.0;
  }

  // Get chaos pulse value (0-1 oscillating)
  getChaosPulse(): number {
    if (!this.state.enabled) return 0;
    const elapsed = (performance.now() - this.state.startTime) / 1000;
    return (Math.sin(elapsed * 3) * 0.5 + 0.5) * this.state.intensity;
  }

  // Get chaotic random value for glitch effects
  getChaosRandom(): number {
    if (!this.state.enabled) return 0;
    return Math.random() * this.state.intensity;
  }

  // Update loop
  update(dt: number): void {
    if (!this.state.enabled) return;
    
    // Gradually ramp up intensity
    this.state.intensity = Math.min(1.0, this.state.intensity + dt * 0.5);
  }

  // Create UI button for chaos mode
  createUIButton(): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.textContent = 'CHAOS: OFF';
    btn.id = 'chaos-mode-btn';
    btn.style.cssText = `
      background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
      border: 2px solid #ff00ff;
      color: #ff00ff;
      font-family: 'Courier New', monospace;
      font-weight: bold;
      padding: 8px 16px;
      border-radius: 4px;
      cursor: pointer;
      transition: all 0.3s;
      text-shadow: 0 0 5px #ff00ff;
    `;
    
    btn.addEventListener('mouseenter', () => {
      btn.style.boxShadow = '0 0 15px #ff00ff';
    });
    
    btn.addEventListener('mouseleave', () => {
      btn.style.boxShadow = 'none';
    });
    
    btn.addEventListener('click', () => {
      const enabled = this.toggle();
      btn.textContent = enabled ? 'CHAOS: ON 🔥' : 'CHAOS: OFF';
      btn.style.borderColor = enabled ? '#ff00ff' : '#444';
      btn.style.color = enabled ? '#ff00ff' : '#888';
      
      if (enabled) {
        // Pulsing animation when active
        const pulse = () => {
          if (!this.state.enabled) {
            btn.style.textShadow = '0 0 5px #ff00ff';
            return;
          }
          const intensity = this.getChaosPulse();
          btn.style.textShadow = `0 0 ${5 + intensity * 20}px #ff00ff`;
          requestAnimationFrame(pulse);
        };
        pulse();
      }
    });
    
    return btn;
  }
}

// Chaos mode post-process shader modifications
export const ChaosModeShaderHooks = {
  // Inject into enhanced post-process fragment shader
  fragmentUniforms: `
    // Chaos mode uniforms
    chaosModeEnabled: f32,
    chaosIntensity: f32,
    chaosTime: f32,
  `,

  // Additional effects to inject before final return
  fragmentEffects: `
    // Chaos mode effects
    if (uniforms.chaosModeEnabled > 0.5) {
      let chaos = uniforms.chaosIntensity;
      let t = uniforms.chaosTime;
      
      // Extreme chromatic pulse
      let pulse = sin(t * 5.0) * 0.5 + 0.5;
      let aberrationBoost = 0.1 * chaos * pulse;
      
      r = textureSample(myTexture, mySampler, finalUV + vec2<f32>(totalAberration + aberrationBoost, 0.0)).r;
      b = textureSample(myTexture, mySampler, finalUV - vec2<f32>(totalAberration + aberrationBoost, 0.0)).b;
      color = vec3<f32>(r, g, b);
      
      // Color inversion pulse
      if (pulse > 0.8) {
        color = vec3<f32>(1.0) - color;
      }
      
      // Extreme scanlines
      let chaosScan = sin(finalUV.y * 800.0 + t * 10.0) * 0.05 * chaos;
      color -= vec3<f32>(chaosScan);
      
      // RGB shift glitch
      if (fract(t * 3.0) > 0.95) {
        color = color.bgr;
      }
    }
  `
};

export default ChaosModeController;
