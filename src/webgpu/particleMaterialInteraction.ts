/**
 * Particle-Material Interaction System
 * Makes particles interact with premium block materials:
 * - Glass blocks: refract particle trails (distortion)
 * - Gold/Chrome blocks: bright specular flashes when hit by particles
 * - Cyber blocks: emit small neon bursts
 */

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
    },
    lava: {
      refractionStrength: 0.0,
      specularFlashIntensity: 0.9,
      neonBurstIntensity: 1.8,
      interactionRadius: 2.2
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

      case 'lava':
        interaction = {
          type: 'neon_burst',
          intensity: intensity * params.neonBurstIntensity,
          decay: 0.65,
          color: [1.0, 0.45, 0.1, 0.95] // Lava embers / sparks
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

  private _activeInteractionsArray: { key: string; interaction: MaterialInteraction }[] = [];

  // Get all active interactions for shader upload
  getActiveInteractionsArray(): { key: string; interaction: MaterialInteraction }[] {
    let index = 0;
    for (const [key, interaction] of this.activeInteractions) {
      if (index < this._activeInteractionsArray.length) {
        this._activeInteractionsArray[index].key = key;
        this._activeInteractionsArray[index].interaction = interaction;
      } else {
        this._activeInteractionsArray.push({ key, interaction });
      }
      index++;
    }
    this._activeInteractionsArray.length = index;
    return this._activeInteractionsArray;
  }

  // Clear all interactions
  clear(): void {
    this.activeInteractions.clear();
  }
}

export default ParticleMaterialInteraction;
