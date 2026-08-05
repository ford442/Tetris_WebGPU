/**
 * Material System for Premium Block Rendering
 * PBR-inspired materials: Gold, Chrome, Glass, Gem
 * All textures generated procedurally - no external dependencies
 */

export interface Material {
  name: string;
  baseColor: [number, number, number];
  metallic: number;      // 0.0 - 1.0
  roughness: number;     // 0.0 - 1.0
  transmission: number;  // 0.0 - 1.0 (glass)
  ior: number;           // Index of refraction
  subsurface: number;    // Subsurface scattering
  emissive: [number, number, number];
  clearcoat: number;     // Clear coat layer
  anisotropic: number;   // Anisotropic reflection
  dispersion: number;    // Chromatic dispersion (gems)

  // Only used by the authored `imageSampled` path (block.png/frame+glass sampling).
  // Defines how glassOpacity ramps with Fresnel (edgeFresnel = 1 - NdotV).
  authoredGlassMin?: number;
  authoredGlassMax?: number;
  authoredGlassFresnelPower?: number;
}

export const Materials: Record<string, Material> = {
  // Classic Tetris look with modern PBR
  classic: {
    name: 'Classic',
    baseColor: [0.9, 0.9, 0.9],
    metallic: 0.0,
    roughness: 0.3,
    transmission: 0.0,
    ior: 1.0,
    subsurface: 0.0,
    emissive: [0, 0, 0],
    clearcoat: 0.0,
    anisotropic: 0.0,
    dispersion: 0.0,
  },
  
  // Warm, soft gold with anisotropic highlights
  gold: {
    name: 'Gold',
    baseColor: [1.0, 0.78, 0.28],
    metallic: 0.95,
    roughness: 0.15,
    transmission: 0.0,
    ior: 0.47, // Complex IOR for gold
    subsurface: 0.0,
    emissive: [0, 0, 0],
    clearcoat: 0.3,
    anisotropic: 0.4,
    dispersion: 0.0,
  },
  
  // Mirror-like chrome
  chrome: {
    name: 'Chrome',
    baseColor: [0.95, 0.95, 0.95],
    metallic: 1.0,
    roughness: 0.05,
    transmission: 0.0,
    ior: 1.5,
    subsurface: 0.0,
    emissive: [0, 0, 0],
    clearcoat: 1.0,
    anisotropic: 0.0,
    dispersion: 0.0,
  },
  
  // Refractive glass with Fresnel opacity
  glass: {
    name: 'Glass',
    baseColor: [0.95, 0.98, 1.0],
    metallic: 0.0,
    roughness: 0.02,
    transmission: 0.95,
    ior: 1.5,
    subsurface: 0.0,
    emissive: [0, 0, 0],
    clearcoat: 0.0,
    anisotropic: 0.0,
    dispersion: 0.03, // Slight rainbow at edges
  },
  
  // Saturated gem with internal glow
  ruby: {
    name: 'Ruby',
    baseColor: [0.9, 0.1, 0.15],
    metallic: 0.0,
    roughness: 0.1,
    transmission: 0.4,
    ior: 1.77,
    subsurface: 0.8,
    emissive: [0.1, 0.01, 0.02],
    clearcoat: 0.5,
    anisotropic: 0.0,
    dispersion: 0.1,
  },
  
  sapphire: {
    name: 'Sapphire',
    baseColor: [0.1, 0.3, 0.9],
    metallic: 0.0,
    roughness: 0.1,
    transmission: 0.4,
    ior: 1.77,
    subsurface: 0.8,
    emissive: [0.01, 0.03, 0.1],
    clearcoat: 0.5,
    anisotropic: 0.0,
    dispersion: 0.1,
  },
  
  emerald: {
    name: 'Emerald',
    baseColor: [0.1, 0.9, 0.3],
    metallic: 0.0,
    roughness: 0.1,
    transmission: 0.4,
    ior: 1.58,
    subsurface: 0.7,
    emissive: [0.02, 0.15, 0.05],
    clearcoat: 0.5,
    anisotropic: 0.0,
    dispersion: 0.08,
  },
  
  // Cyberpunk neon with emissive edges
  cyber: {
    name: 'Cyber',
    baseColor: [0.05, 0.05, 0.05],
    metallic: 0.8,
    roughness: 0.2,
    transmission: 0.0,
    ior: 1.5,
    subsurface: 0.0,
    emissive: [0, 0.8, 1.0],
    clearcoat: 0.8,
    anisotropic: 0.2,
    dispersion: 0.0,
  },

  // Image Sampled - use texture directly with minimal material interference
  imageSampled: {
    name: 'Image Sampled',
    baseColor: [1.0, 1.0, 1.0],
    metallic: 0.1,
    roughness: 0.4,
    transmission: 0.0,
    ior: 1.0,
    subsurface: 0.0,
    emissive: [0, 0, 0],
    clearcoat: 0.1,
    anisotropic: 0.0,
    dispersion: 0.0,
    authoredGlassMin: 0.15,
    authoredGlassMax: 0.70,
    authoredGlassFresnelPower: 2.0,
  },

  // Lava - high emissive red-orange glow, starts smooth/hot, cools (rougher) as piece falls
  lava: {
    name: 'Lava',
    baseColor: [0.85, 0.28, 0.06],
    metallic: 0.25,
    roughness: 0.12,   // Hot lava starts relatively smooth/flowing
    transmission: 0.0,
    ior: 1.35,
    subsurface: 0.25,
    emissive: [0.95, 0.32, 0.06],  // High emissive for magma glow
    clearcoat: 0.15,
    anisotropic: 0.15,
    dispersion: 0.0,
  },

  // Hologram - translucent projection with animated scanlines (added per request)
  hologram: {
    name: 'Hologram',
    baseColor: [0.7, 0.9, 1.0],
    metallic: 0.1,
    roughness: 0.35,
    transmission: 0.4,  // semi-transparent for holographic feel
    ior: 1.2,
    subsurface: 0.1,
    emissive: [0.1, 0.2, 0.3], // subtle blue holo glow
    clearcoat: 0.2,
    anisotropic: 0.0,
    dispersion: 0.0,
  },
};

/** Image-sampled blocks only — one material preset for all piece types. */
export const MaterialThemes: Record<string, Material[]> = {
  imageSampled: Array(8).fill(Materials.imageSampled),
};

export const getPieceMaterial = (_theme: string, pieceType: number): Material => {
  const themeSet = MaterialThemes.imageSampled;
  return themeSet[pieceType] || Materials.imageSampled;
};
