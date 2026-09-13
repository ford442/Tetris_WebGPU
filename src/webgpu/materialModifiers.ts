/**
 * Material modifiers — the replacement for the dead `Materials.gold/chrome/ruby/...`
 * preset graph.
 *
 * Those presets were a parallel description of "what a block looks like" that the
 * runtime never reached: `setMaterialTheme` collapsed every theme to `imageSampled`,
 * so nine of the eleven presets could not affect a pixel, while the look that actually
 * shipped lived in shader constants. Two descriptions of one thing, one of them dead.
 *
 * A modifier is not a second material system: it is a *delta* on the authored
 * {@link AuthoredBlockMaterial} — scale roughness, re-tint the frame, soften or
 * strengthen the normal map, shift the glass curve. The authored maps stay the source
 * of the look, so a variant cannot bypass the visual contract; it is re-validated
 * against the same schema after the delta is applied.
 *
 * This is where swappable bricks plug in: obsidian, ice and neon steel below are
 * modifiers over the reference tile, and a content pack can ship its own as JSON.
 */

import {
  DEFAULT_AUTHORED_BLOCK_MATERIAL,
  mergeAuthoredBlockMaterial,
  type AuthoredBlockMaterial,
} from './blockMaterial.js';

export interface MaterialModifier {
  name: string;
  /** Multiplies the authored metal roughness (>1 = more matte). */
  roughnessScale?: number;
  /** Multiplies the authored crystal roughness. */
  glassRoughnessScale?: number;
  /** Replaces the jewelry tint the metal frame is graded toward. */
  goldTint?: [number, number, number];
  /** Multiplies the grade mix (0 = keep the raw tile hue). */
  goldMixScale?: number;
  /** Multiplies normal-map strength (0 = flat, >1 = deeper hinges). */
  normalStrengthScale?: number;
  /** Multiplies the face-on and grazing glass opacities. */
  glassOpacityScale?: number;
  /**
   * Emissive added by the premium uniforms rather than by the maps — an emissive
   * brick is still the same albedo/metal/roughness set, lit differently.
   */
  emissive?: [number, number, number];
  /**
   * Optional premium material type the fragment shader already understands
   * (6 = lava, 7 = hologram). Left undefined for plain reskins.
   */
  materialType?: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Apply a modifier to an authored material. Every result is clamped into the ranges
 * `shared/blockMaterialSchema.json` allows, so a modifier cannot produce a material
 * the validator would reject.
 */
export function applyMaterialModifier(
  modifier: MaterialModifier,
  base: AuthoredBlockMaterial = DEFAULT_AUTHORED_BLOCK_MATERIAL,
): AuthoredBlockMaterial {
  const glassScale = modifier.glassOpacityScale ?? 1;
  const metalRough = clamp(base.roughness.metal * (modifier.roughnessScale ?? 1), 0.02, 1);
  // The schema rule "crystal must be smoother than the gold frame" holds for modifier
  // output too: a transmissive interior with a rougher surface than the frame reads as
  // frosted plastic, which is not a variant of this look.
  const glassRough = Math.min(
    metalRough,
    clamp(base.roughness.glass * (modifier.glassRoughnessScale ?? 1), 0.01, 1),
  );
  return mergeAuthoredBlockMaterial(
    {
      name: `${base.name} + ${modifier.name}`,
      glass: {
        ...base.glass,
        min: clamp(base.glass.min * glassScale, 0, 1),
        max: clamp(base.glass.max * glassScale, 0, 1),
      },
      gold: {
        ...base.gold,
        tint: modifier.goldTint ?? base.gold.tint,
        mix: clamp(base.gold.mix * (modifier.goldMixScale ?? 1), 0, 1),
      },
      roughness: {
        ...base.roughness,
        metal: metalRough,
        glass: glassRough,
      },
      normal: {
        strength: clamp(base.normal.strength * (modifier.normalStrengthScale ?? 1), 0, 2),
      },
    },
    base,
  );
}

/**
 * Shipped modifiers. `none` is the identity — the reference go.1ink.us brick.
 * The rest are starting points for content packs, not themes the game switches
 * between today.
 */
export const MaterialModifiers: Record<string, MaterialModifier> = {
  none: { name: 'Reference' },

  /** Black glass in a dark setting: matte frame, deeper hinges, less transmission. */
  obsidian: {
    name: 'Obsidian',
    goldTint: [0.22, 0.22, 0.26],
    roughnessScale: 2.4,
    normalStrengthScale: 1.4,
    glassOpacityScale: 1.35,
  },

  /** Cold and near-clear: polished frame, very transmissive crystal, flat surface. */
  ice: {
    name: 'Ice',
    goldTint: [0.74, 0.86, 0.95],
    roughnessScale: 0.6,
    glassRoughnessScale: 0.5,
    normalStrengthScale: 0.7,
    glassOpacityScale: 0.7,
  },

  /** Brushed steel frame with a neon core — emissive, not a different material. */
  neonSteel: {
    name: 'Neon steel',
    goldTint: [0.82, 0.84, 0.88],
    roughnessScale: 1.8,
    goldMixScale: 0.85,
    emissive: [0.0, 0.55, 0.85],
  },

  /** Premium material type 6: magma glow on top of the authored maps. */
  lava: {
    name: 'Lava',
    goldTint: [0.85, 0.28, 0.06],
    roughnessScale: 1.2,
    emissive: [0.95, 0.32, 0.06],
    materialType: 6,
  },

  /** Premium material type 7: holographic projection, near-flat and translucent. */
  hologram: {
    name: 'Hologram',
    goldTint: [0.7, 0.9, 1.0],
    roughnessScale: 2.0,
    normalStrengthScale: 0.4,
    glassOpacityScale: 0.6,
    emissive: [0.1, 0.2, 0.3],
    materialType: 7,
  },
};

export function getMaterialModifier(name: string): MaterialModifier {
  return MaterialModifiers[name] ?? MaterialModifiers.none;
}
