/**
 * Particle-Material Interaction System
 * Makes particles interact with premium block materials:
 * - Glass blocks: refract particle trails (distortion)
 * - Gold/Chrome blocks: bright specular flashes when hit by particles
 * - Cyber blocks: emit small neon bursts
 */

import { MaterialProperties } from './materials.js';

export interface ParticleHit {
  blockX: number;
  blockY: number;
  blockZ: number;
  particleX: number;
  particleY: number;
  particleZ: number;
  intensity: number;
  materialType: string;
}

export interface MaterialInteraction {
  type: 'refraction' | 'specular_flash' | 'neon_burst' | 'none';
  intensity: number;
  decay: number;
  color?: number[];
}

export class ParticleMaterialInteraction {
  // Active interactions per block position (key: "x,y,z")
  private activeInteractions: Map<string, MaterialInteraction> = new Map();
  
  // Material-specific interaction params
  private materialParams: Record<string, {
    refractionStrength: number;
    specularFlashIntensity: number;
    neonBurstIntensity: number;
    interactionRadius: number;
  }> = {
    glass: {
      refractionStrength: 0.8,
      specularFlashIntensity: 0.2,
      neonBurstIntensity: 0.0,
      interactionRadius: 2.0
    },
    gold: {
      refractionStrength: 0.0,
      specularFlashIntensity: 1.5,
      neonBurstIntensity: 0.0,
      interactionRadius: 3.0
    },
    chrome: {
      refractionStrength: 0.1,
      specularFlashIntensity: 2.0,
      neonBurstIntensity: 0.0,
      interactionRadius: 3.5
    },
    cyber: {
      refractionStrength: 0.0,
      specularFlashIntensity: 0.5,
      neonBurstIntensity: 1.0,
      interactionRadius: 2.5
    },
    gem: {
      refractionStrength: 0.5,
      specularFlashIntensity: 0.8,
      neonBurstIntensity: 0.3,
      interactionRadius: 2.5
    }
  };

  constructor() {}

  // Process a particle hit on a block
  processHit(hit: ParticleHit): MaterialInteraction | null {
    const { materialType, intensity, blockX, blockY, blockZ } = hit;
    const params = this.materialParams[materialType];
    
    if (!params) return null;
    
    const blockKey = `${blockX},${blockY},${blockZ}`;
    
    let interaction: MaterialInteraction | null = null;
    
    switch (materialType) {
      case 'glass':
        interaction = {
          type: 'refraction',
          intensity: intensity * params.refractionStrength,
          decay: 0.92,
          color: [1.0, 1.0, 1.0, 0.3]
        };
        break;
        
      case 'gold':
      case 'chrome':
        interaction = {
          type: 'specular_flash',
          intensity: intensity * params.specularFlashIntensity,
          decay: 0.85,
          color: materialType === 'gold' ? [1.0, 0.84, 0.0, 1.0] : [0.9, 0.95, 1.0, 1.0]
        };
        break;
        
      case 'cyber':
        interaction = {
          type: 'neon_burst',
          intensity: intensity * params.neonBurstIntensity,
          decay: 0.88,
          color: [0.0, 1.0, 1.0, 0.8] // Cyan neon
        };
        break;
        
      case 'gem':
        // Gems get both refraction and specular
        interaction = {
          type: Math.random() > 0.5 ? 'refraction' : 'specular_flash',
          intensity: intensity * (Math.random() > 0.5 ? params.refractionStrength : params.specularFlashIntensity),
          decay: 0.90,
          color: [1.0, 0.2, 0.8, 0.6] // Pink/magenta
        };
        break;
    }
    
    if (interaction) {
      // Stack intensity if already interacting
      const existing = this.activeInteractions.get(blockKey);
      if (existing && existing.type === interaction.type) {
        interaction.intensity = Math.min(3.0, existing.intensity + interaction.intensity);
      }
      this.activeInteractions.set(blockKey, interaction);
    }
    
    return interaction;
  }

  // Update all interactions (decay over time)
  update(dt: number): void {
    for (const [key, interaction] of this.activeInteractions) {
      // Fast algebraic approximation for decay: 1.0 / (1.0 + dt * factor)
      // We convert the decay multiplier (e.g. 0.9) to a factor.
      let factor = (1.0 / interaction.decay) - 1.0;
      interaction.intensity *= 1.0 / (1.0 + dt * 60 * factor);
      
      if (interaction.intensity < 0.01) {
        this.activeInteractions.delete(key);
      }
    }
  }

  // Get interaction for a specific block
  getInteraction(blockX: number, blockY: number, blockZ: number): MaterialInteraction | undefined {
    return this.activeInteractions.get(`${blockX},${blockY},${blockZ}`);
  }

  // Check if any active interactions exist
  hasActiveInteractions(): boolean {
    return this.activeInteractions.size > 0;
  }

  // Get all active interactions for shader upload
  getActiveInteractionsArray(): { key: string; interaction: MaterialInteraction }[] {
    return Array.from(this.activeInteractions.entries()).map(([key, interaction]) => ({
      key,
      interaction
    }));
  }

  // Clear all interactions
  clear(): void {
    this.activeInteractions.clear();
  }
}

// WGSL Shader code for material-particle interaction
export const ParticleMaterialInteractionWGSL = `
// Material-particle interaction uniforms
struct MaterialInteractionUniforms {
  interactionType: u32,      // 0=none, 1=refraction, 2=specular_flash, 3=neon_burst
  intensity: f32,
  color: vec4f,
  particlePos: vec3f,
  pad: f32,
};

// Glass refraction distortion
fn applyGlassRefraction(
  baseColor: vec3f, 
  normal: vec3f, 
  viewDir: vec3f,
  interactionIntensity: f32
) -> vec3f {
  // Calculate refraction offset based on view angle
  let refractFactor = 1.0 - abs(dot(normal, viewDir));
  let distortion = refractFactor * interactionIntensity * 0.3;
  
  // Add chromatic aberration for glass
  let r = baseColor.r * (1.0 + distortion * 0.5);
  let g = baseColor.g;
  let b = baseColor.b * (1.0 - distortion * 0.3);
  
  return vec3f(r, g, b) * (1.0 + interactionIntensity * 0.2);
}

// Gold/Chrome specular flash
fn applySpecularFlash(
  baseColor: vec3f,
  normal: vec3f,
  lightDir: vec3f,
  viewDir: vec3f,
  flashColor: vec3f,
  intensity: f32
) -> vec3f {
  // Calculate specular highlight
  let halfDir = normalize(lightDir + viewDir);
  let specAngle = max(dot(normal, halfDir), 0.0);
  let s2 = specAngle * specAngle;
  let s4 = s2 * s2;
  let s8 = s4 * s4;
  let s16 = s8 * s8;
  let s32 = s16 * s16;
  let specular = s32 * intensity * 2.0;
  
  // Add bloom-like glow
  let glow = flashColor * intensity * 0.5;
  
  return baseColor + specular + glow;
}

// Cyber neon burst
fn applyNeonBurst(
  baseColor: vec3f,
  emission: vec3f,
  intensity: f32
) -> vec3f {
  // Intense cyan/magenta emission
  let burst = vec3f(0.0, 1.0, 1.0) * intensity * 3.0;
  
  // Add pulse effect
  let pulse = sin(intensity * 10.0) * 0.3 + 0.7;
  
  return baseColor + (burst * pulse) + (emission * intensity);
}

// Main interaction function called from fragment shader
fn applyMaterialParticleInteraction(
  material: MaterialProperties,
  baseColor: vec3f,
  normal: vec3f,
  viewDir: vec3f,
  lightDir: vec3f,
  interactionType: u32,
  interactionIntensity: f32,
  interactionColor: vec3f
) -> vec3f {
  switch (interactionType) {
    case 1u: { // Refraction (glass)
      return applyGlassRefraction(baseColor, normal, viewDir, interactionIntensity);
    }
    case 2u: { // Specular flash (gold/chrome)
      return applySpecularFlash(baseColor, normal, lightDir, viewDir, interactionColor, interactionIntensity);
    }
    case 3u: { // Neon burst (cyber)
      return applyNeonBurst(baseColor, baseColor * 0.1, interactionIntensity);
    }
    default: {
      return baseColor;
    }
  }
}
`;

export default ParticleMaterialInteraction;
