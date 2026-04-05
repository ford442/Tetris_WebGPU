/**
 * Visual Chaos Mode System
 * Extreme effects with underwater theme support
 * Toggle with 'C' key or UI button
 * 
 * Underwater Chaos: Deep sea storm - turbulent caustics, bioluminescent surge
 * Standard Chaos: Cyberpunk overload - glitch, extreme bloom, chromatic aberration
 */

export interface ChaosModeState {
  enabled: boolean;
  intensity: number; // 0.0 - 1.0
  startTime: number;
  isUnderwater: boolean; // NEW: Underwater theme mode
}

export class ChaosModeController {
  state: ChaosModeState = {
    enabled: false,
    intensity: 0.0,
    startTime: 0,
    isUnderwater: false
  };

  // Standard cyberpunk effect multipliers
  readonly standardMultipliers = {
    bloom: 3.0,
    shake: 2.5,
    aberration: 2.0,
    filmGrain: 3.0,
    scanlines: 2.5,
    videoReverse: 1.0,
    videoSpeed: 2.0,
    glitch: 2.0,
    pulse: 1.0,
    colorShift: 1.0
  };

  // NEW: Underwater deep sea storm multipliers
  readonly underwaterMultipliers = {
    bloom: 2.5,           // Slightly less bloom for clarity
    shake: 1.5,           // Gentler sway like current
    aberration: 3.0,      // Heavy water refraction
    filmGrain: 1.5,       // Particle swirl instead of grain
    scanlines: 0.5,       // Less scanlines, more caustics
    videoReverse: 1.0,    // Turbulent current reverses
    videoSpeed: 1.5,      // Rushing water
    glitch: 0.5,          // Less glitch, more organic
    pulse: 2.0,           // Strong bioluminescent pulse
    colorShift: 1.5       // Cyan/magenta deep sea colors
  };

  constructor() {
    this.setupKeyListener();
  }

  // NEW: Set underwater mode
  setUnderwaterMode(isUnderwater: boolean): void {
    this.state.isUnderwater = isUnderwater;
    if (this.state.enabled) {
      console.log(isUnderwater ? 
        '[CHAOS MODE] 🌊 Deep Sea Storm activated' : 
        '[CHAOS MODE] 🔥 Cyber Overload activated'
      );
    }
  }

  private setupKeyListener(): void {
    document.addEventListener('keydown', (e) => {
      if (e.key === 'c' || e.key === 'C') {
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
    
    // NEW: Underwater-themed notification
    if (this.state.isUnderwater) {
      console.log('[CHAOS MODE] 🌊 DEEP SEA STORM ACTIVATED');
      this.showNotification('🌊 DEEP SEA STORM', true);
    } else {
      console.log('[CHAOS MODE] ACTIVATED 🔥🔥🔥');
      this.showNotification('CHAOS MODE ACTIVATED', false);
    }
  }

  private deactivate(): void {
    this.state.intensity = 0.0;
    console.log('[CHAOS MODE] Deactivated');
    this.showNotification('Chaos Mode Off', this.state.isUnderwater);
  }

  private showNotification(text: string, isUnderwater: boolean): void {
    const notification = document.createElement('div');
    notification.textContent = text;
    
    // NEW: Underwater styling
    if (isUnderwater) {
      notification.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        font-family: 'Courier New', monospace;
        font-size: 48px;
        font-weight: bold;
        color: #00ffff;
        text-shadow: 
          0 0 10px #00ffff,
          0 0 30px #0088ff,
          0 0 60px #0044ff,
          0 10px 40px rgba(0, 100, 255, 0.5);
        pointer-events: none;
        z-index: 9999;
        animation: underwaterPulse 1s ease-out;
        letter-spacing: 4px;
      `;
    } else {
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
    }
    
    // Add animations if not present
    if (!document.getElementById('chaos-animations')) {
      const style = document.createElement('style');
      style.id = 'chaos-animations';
      style.textContent = `
        @keyframes chaosPulse {
          0% { transform: translate(-50%, -50%) scale(0.5); opacity: 0; }
          20% { transform: translate(-50%, -50%) scale(1.2); opacity: 1; }
          100% { transform: translate(-50%, -50%) scale(1); opacity: 0; }
        }
        @keyframes underwaterPulse {
          0% { transform: translate(-50%, -50%) scale(0.5) translateY(20px); opacity: 0; }
          30% { transform: translate(-50%, -50%) scale(1.1) translateY(-10px); opacity: 1; }
          100% { transform: translate(-50%, -50%) scale(1) translateY(0); opacity: 0; }
        }
      `;
      document.head.appendChild(style);
    }
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
      notification.remove();
    }, isUnderwater ? 1500 : 1000);
  }

  // Get current multipliers based on mode
  private getMultipliers() {
    return this.state.isUnderwater ? 
      this.underwaterMultipliers : 
      this.standardMultipliers;
  }

  getBloomMultiplier(): number {
    return this.state.enabled ? this.getMultipliers().bloom : 1.0;
  }

  getShakeMultiplier(): number {
    return this.state.enabled ? this.getMultipliers().shake : 0.0;
  }

  getAberrationMultiplier(): number {
    return this.state.enabled ? this.getMultipliers().aberration : 1.0;
  }

  getFilmGrainMultiplier(): number {
    return this.state.enabled ? this.getMultipliers().filmGrain : 1.0;
  }

  getScanlineMultiplier(): number {
    return this.state.enabled ? this.getMultipliers().scanlines : 1.0;
  }

  shouldReverseOnClear(): boolean {
    return this.state.enabled;
  }

  getVideoSpeedMultiplier(): number {
    return this.state.enabled ? this.getMultipliers().videoSpeed : 1.0;
  }

  // NEW: Get pulse multiplier (stronger underwater)
  getPulseMultiplier(): number {
    return this.state.enabled ? this.getMultipliers().pulse : 0.0;
  }

  // NEW: Get color shift for underwater bioluminescence
  getColorShift(): { r: number; g: number; b: number } {
    if (!this.state.enabled) return { r: 0, g: 0, b: 0 };
    
    const pulse = this.getChaosPulse();
    if (this.state.isUnderwater) {
      // Cyan/magenta bioluminescent shift
      return {
        r: pulse * 0.2,
        g: 0.3 + pulse * 0.4,
        b: 0.5 + pulse * 0.5
      };
    }
    // Standard magenta shift
    return {
      r: pulse * 0.5,
      g: 0,
      b: pulse * 0.5
    };
  }

  getChaosPulse(): number {
    if (!this.state.enabled) return 0;
    const elapsed = (performance.now() - this.state.startTime) / 1000;
    const speed = this.state.isUnderwater ? 2.0 : 3.0; // Slower pulse underwater
    return (Math.sin(elapsed * speed) * 0.5 + 0.5) * this.state.intensity;
  }

  getChaosRandom(): number {
    if (!this.state.enabled) return 0;
    return Math.random() * this.state.intensity;
  }

  update(dt: number): void {
    if (!this.state.enabled) return;
    this.state.intensity = Math.min(1.0, this.state.intensity + dt * 0.5);
  }

  createUIButton(): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.textContent = 'CHAOS: OFF';
    btn.id = 'chaos-mode-btn';
    
    // NEW: Underwater button styling
    const underwaterStyles = `
      background: linear-gradient(135deg, #001a2e 0%, #003d5c 100%);
      border: 2px solid #00ffff;
      color: #00ffff;
      font-family: 'Courier New', monospace;
      font-weight: bold;
      padding: 8px 16px;
      border-radius: 4px;
      cursor: pointer;
      transition: all 0.3s;
      text-shadow: 0 0 5px #00ffff;
    `;
    
    const standardStyles = `
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
    
    btn.style.cssText = this.state.isUnderwater ? underwaterStyles : standardStyles;
    
    btn.addEventListener('mouseenter', () => {
      const glowColor = this.state.isUnderwater ? '#00ffff' : '#ff00ff';
      btn.style.boxShadow = `0 0 15px ${glowColor}`;
    });
    
    btn.addEventListener('mouseleave', () => {
      btn.style.boxShadow = 'none';
    });
    
    btn.addEventListener('click', () => {
      const enabled = this.toggle();
      
      // Update button styling based on mode
      if (this.state.isUnderwater) {
        btn.textContent = enabled ? '🌊 STORM ON' : '🌊 STORM: OFF';
        btn.style.borderColor = enabled ? '#00ffff' : '#004466';
        btn.style.color = enabled ? '#00ffff' : '#4488aa';
      } else {
        btn.textContent = enabled ? 'CHAOS: ON 🔥' : 'CHAOS: OFF';
        btn.style.borderColor = enabled ? '#ff00ff' : '#444';
        btn.style.color = enabled ? '#ff00ff' : '#888';
      }
      
      if (enabled) {
        const pulse = () => {
          if (!this.state.enabled) {
            btn.style.textShadow = this.state.isUnderwater ? 
              '0 0 5px #00ffff' : '0 0 5px #ff00ff';
            return;
          }
          const intensity = this.getChaosPulse();
          const glowColor = this.state.isUnderwater ? '#00ffff' : '#ff00ff';
          btn.style.textShadow = `0 0 ${5 + intensity * 20}px ${glowColor}`;
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
