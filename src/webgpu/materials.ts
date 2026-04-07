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
};

// Material presets for each tetromino type
export const MaterialThemes: Record<string, Material[]> = {
  classic: Array(8).fill(Materials.classic),
  gold: Array(8).fill(Materials.gold),
  chrome: Array(8).fill(Materials.chrome),
  glass: Array(8).fill(Materials.glass),
  premium: [Materials.ruby, Materials.sapphire, Materials.emerald, Materials.gold, 
            Materials.chrome, Materials.glass, Materials.ruby, Materials.sapphire],
  cyber: Array(8).fill(Materials.cyber),
};

// Piece type to material mapping (for themed pieces)
export const getPieceMaterial = (theme: string, pieceType: number): Material => {
  const themeSet = MaterialThemes[theme] || MaterialThemes.classic;
  return themeSet[pieceType] || Materials.classic;
};
