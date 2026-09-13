/**
 * Material System Test Suite
 */

import { describe, it, expect } from 'vitest';
import { Materials, MaterialThemes, getPieceMaterial } from './materials.js';
import {
  applyMaterialModifier,
  getMaterialModifier,
  MaterialModifiers,
} from './materialModifiers.js';
import { DEFAULT_AUTHORED_BLOCK_MATERIAL, validateAuthoredBlockMaterial } from './blockMaterial.js';

describe('Material System', () => {
  it('should have imageSampled material with valid properties', () => {
    const mat = Materials.imageSampled;
    expect(mat.metallic).toBeGreaterThanOrEqual(0);
    expect(mat.metallic).toBeLessThanOrEqual(1);
    expect(mat.roughness).toBeGreaterThanOrEqual(0);
    expect(mat.roughness).toBeLessThanOrEqual(1);
    expect(mat.ior).toBeGreaterThanOrEqual(0);
    expect(mat.ior).toBeLessThanOrEqual(3);
    expect(mat.name).toBe('Image Sampled');
  });

  it('should expose only the imageSampled theme mapping', () => {
    expect(Object.keys(MaterialThemes)).toEqual(['imageSampled']);
    expect(MaterialThemes.imageSampled.length).toBe(8);
  });

  it('should return imageSampled for all piece lookups', () => {
    for (let pieceType = 0; pieceType < 8; pieceType++) {
      const mat = getPieceMaterial('imageSampled', pieceType);
      expect(mat).toBe(Materials.imageSampled);
    }
    expect(getPieceMaterial('gold', 1)).toBe(Materials.imageSampled);
  });

  it('no longer ships presets the runtime cannot reach', () => {
    // gold/chrome/glass/ruby/sapphire/emerald/cyber/lava/hologram described a look
    // nothing could select; they are modifiers over the authored material now.
    expect(Object.keys(Materials).sort()).toEqual(['classic', 'imageSampled']);
  });
});

describe('Material modifiers', () => {
  it('identity modifier leaves the authored material untouched', () => {
    expect(applyMaterialModifier(MaterialModifiers.none)).toEqual({
      ...DEFAULT_AUTHORED_BLOCK_MATERIAL,
      name: `${DEFAULT_AUTHORED_BLOCK_MATERIAL.name} + Reference`,
    });
  });

  it('every shipped modifier still produces a schema-valid material', () => {
    // A modifier must not be able to smuggle a value past the visual contract.
    for (const [key, modifier] of Object.entries(MaterialModifiers)) {
      const material = applyMaterialModifier(modifier);
      const { ok, errors } = validateAuthoredBlockMaterial({
        version: material.version,
        name: material.name,
        maps: { albedo: material.maps.albedo },
        glass: material.glass,
        gold: material.gold,
        roughness: material.roughness,
        normal: material.normal,
        contract: material.contract,
      });
      expect(ok, `${key}: ${errors.join(', ')}`).toBe(true);
    }
  });

  it('scales roughness and re-tints the frame rather than replacing the maps', () => {
    const obsidian = applyMaterialModifier(MaterialModifiers.obsidian);
    expect(obsidian.gold.tint).toEqual([0.22, 0.22, 0.26]);
    expect(obsidian.roughness.metal).toBeGreaterThan(DEFAULT_AUTHORED_BLOCK_MATERIAL.roughness.metal);
    // The maps themselves are inherited: a variant is a delta, not a new pipeline.
    expect(obsidian.maps).toEqual(DEFAULT_AUTHORED_BLOCK_MATERIAL.maps);
  });

  it('keeps the crystal smoother than the frame even under extreme scaling', () => {
    const wild = applyMaterialModifier({ name: 'Wild', glassRoughnessScale: 50, roughnessScale: 0.1 });
    expect(wild.roughness.metal).toBeGreaterThanOrEqual(0.02);
    expect(wild.roughness.glass).toBeLessThanOrEqual(wild.roughness.metal);
    // And the result is still something the validator accepts.
    expect(validateAuthoredBlockMaterial({
      version: wild.version,
      maps: { albedo: wild.maps.albedo },
      glass: wild.glass,
      gold: wild.gold,
      roughness: wild.roughness,
      normal: wild.normal,
      contract: wild.contract,
    }).ok).toBe(true);
  });

  it('falls back to the reference modifier for an unknown name', () => {
    expect(getMaterialModifier('not-a-brick')).toBe(MaterialModifiers.none);
  });
});
