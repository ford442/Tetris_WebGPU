/**
 * Material System Test Suite
 */

import { describe, it, expect } from 'vitest';
import { Materials, MaterialThemes, getPieceMaterial } from './materials.js';

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
});
