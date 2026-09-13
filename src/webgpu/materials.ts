/**
 * Runtime material state for the block pipeline.
 *
 * This file used to carry eleven PBR presets (gold, chrome, glass, ruby, sapphire,
 * emerald, cyber, lava, hologram, ...) that nothing could reach: `setMaterialTheme`
 * resolves every theme to `imageSampled`, so those presets described a look the
 * renderer never produced while the look it *did* produce lived in shader constants.
 *
 * Now there is one runtime material — the authored block.png path — and variants are
 * deltas on the authored material contract instead of parallel presets. See
 * `materialModifiers.ts` for where gold/ice/lava-style bricks live, and
 * `blockMaterial.ts` for the contract they modify.
 */

import { DEFAULT_GLASS_PARAMS } from './blockTexture.js';

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
  
  // Image Sampled - use texture directly with minimal material interference
  imageSampled: {
    name: 'Image Sampled',
    baseColor: [1.0, 1.0, 1.0],
    metallic: 0.92,
    roughness: 0.12,
    transmission: 0.0,
    ior: 1.0,
    subsurface: 0.0,
    emissive: [0, 0, 0],
    clearcoat: 0.3,
    anisotropic: 0.45,
    dispersion: 0.0,
    authoredGlassMin: DEFAULT_GLASS_PARAMS.min,
    authoredGlassMax: DEFAULT_GLASS_PARAMS.max,
    authoredGlassFresnelPower: DEFAULT_GLASS_PARAMS.fresnelPower,
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
