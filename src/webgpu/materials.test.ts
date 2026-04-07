/**
 * Material System Test Suite
 * Run this to verify all premium materials work correctly
 */

import { describe, it, expect } from 'vitest';
import { Materials, MaterialThemes, getPieceMaterial } from './materials.js';

describe('Material System', () => {
  it('should have all materials with valid properties', () => {
    Object.entries(Materials).forEach(([name, mat]) => {
      expect(mat.metallic).toBeGreaterThanOrEqual(0);
      expect(mat.metallic).toBeLessThanOrEqual(1);
      expect(mat.roughness).toBeGreaterThanOrEqual(0);
      expect(mat.roughness).toBeLessThanOrEqual(1);
      expect(mat.ior).toBeGreaterThanOrEqual(0);
      expect(mat.ior).toBeLessThanOrEqual(3);
      expect(mat.name).toBeDefined();
    });
  });

  it('should have theme mappings for all themes', () => {
    expect(Object.keys(MaterialThemes).length).toBeGreaterThan(0);
    Object.entries(MaterialThemes).forEach(([theme, mats]) => {
      expect(mats.length).toBe(8); // 7 pieces + border
    });
  });

  it('should return correct materials for piece lookups', () => {
    const classic = getPieceMaterial('classic', 1);
    expect(classic).toBeDefined();
    expect(classic.name).toBe('Classic');
    
    const gold = getPieceMaterial('gold', 1);
    expect(gold.name).toBe('Gold');
  });
});
