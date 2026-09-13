/**
 * The material contract is only worth something if a bad material is *rejected*,
 * and rejected identically by the runtime loader and the build gate. These tests
 * pin both validators to the shared schema and to each other.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { validateMaterial } from '../scripts/lib/blockMaterialSchema.mjs';
import {
  AUTHORED_MATERIAL_PARAMS_SIZE,
  BLOCK_MATERIAL_SCHEMA,
  DEFAULT_AUTHORED_BLOCK_MATERIAL,
  MaterialDebugView,
  materialGlassConfigOverrides,
  materialParamsToFloat32Array,
  mergeAuthoredBlockMaterial,
  validateAuthoredBlockMaterial,
} from '../src/webgpu/blockMaterial.js';

const ROOT = process.cwd();

function reference(): Record<string, unknown> {
  return JSON.parse(readFileSync(join(ROOT, 'public/block-material.json'), 'utf8'));
}

/** Clone with one dotted path replaced. */
function withPath(path: string, value: unknown): Record<string, unknown> {
  const json = reference();
  const keys = path.split('.');
  let node: Record<string, unknown> = json;
  for (const key of keys.slice(0, -1)) node = node[key] as Record<string, unknown>;
  node[keys[keys.length - 1]] = value;
  return json;
}

describe('authored material schema', () => {
  it('accepts the shipped material', () => {
    expect(validateAuthoredBlockMaterial(reference())).toEqual({ ok: true, errors: [] });
    expect(validateMaterial(reference())).toEqual({ ok: true, errors: [] });
  });

  it('rejects an out-of-range value in both validators', () => {
    const bad = withPath('glass.ior', 9);
    expect(validateAuthoredBlockMaterial(bad).ok).toBe(false);
    expect(validateMaterial(bad).ok).toBe(false);
  });

  it('rejects a missing required field in both validators', () => {
    const bad = reference();
    delete (bad.glass as Record<string, unknown>).min;
    expect(validateAuthoredBlockMaterial(bad).ok).toBe(false);
    expect(validateMaterial(bad).ok).toBe(false);
  });

  it('rejects a typo rather than silently falling back to the default', () => {
    // The failure mode worth catching: `glas.min` would load "successfully" and
    // quietly render the built-in curve instead of the authored one.
    const bad = reference();
    (bad as Record<string, unknown>).glas = { min: 0.4 };
    const ts = validateAuthoredBlockMaterial(bad);
    expect(ts.ok).toBe(false);
    expect(ts.errors.join(' ')).toMatch(/unknown field/);
    expect(validateMaterial(bad).ok).toBe(false);
  });

  it('enforces the cross-field rules (glass min <= max, crystal <= gold roughness)', () => {
    expect(validateAuthoredBlockMaterial(withPath('glass.min', 0.9)).errors.join(' '))
      .toMatch(/glass.min must be <= glass.max/);
    expect(validateAuthoredBlockMaterial(withPath('roughness.glass', 0.9)).errors.join(' '))
      .toMatch(/crystal must be smoother/);
  });

  it('rejects a non-object document', () => {
    expect(validateAuthoredBlockMaterial(null).ok).toBe(false);
    expect(validateAuthoredBlockMaterial([]).ok).toBe(false);
    expect(validateMaterial([]).ok).toBe(false);
  });

  it('every schema field is reachable on the reference material', () => {
    // Guards against a schema field that no material can ever satisfy because the
    // default object has no such path.
    const merged = mergeAuthoredBlockMaterial(reference()) as unknown as Record<string, unknown>;
    for (const field of BLOCK_MATERIAL_SCHEMA.fields) {
      if (field.path.startsWith('maps.') && field.path !== 'maps.albedo') continue;
      let node: unknown = merged;
      for (const key of field.path.split('.')) {
        node = (node as Record<string, unknown>)[key];
      }
      expect(node, `${field.path} missing from the merged material`).toBeDefined();
    }
  });
});

describe('AuthoredMaterialParams packing', () => {
  it('packs three vec4s in the order the WGSL struct declares', () => {
    const params = materialParamsToFloat32Array(DEFAULT_AUTHORED_BLOCK_MATERIAL, {
      materialMapEnabled: true,
      debugView: MaterialDebugView.roughness,
    });
    expect(params.length * 4).toBe(AUTHORED_MATERIAL_PARAMS_SIZE);
    expect([...params]).toEqual([
      0.9, 0.68, 0.22, 0.78,          // goldTint: tint.rgb, mix
      0.38, 1.23, 0.12, 0.05,          // goldShade: shadeMin, shadeMax, metal, glass
      0.35, 1, 0.18, 4,                // mapParams: normal, mapEnable, detail, debug
    ].map((v) => Math.fround(v)));
  });

  it('reports the flat fallback when no baked map is bound', () => {
    const params = materialParamsToFloat32Array(DEFAULT_AUTHORED_BLOCK_MATERIAL, {});
    expect(params[9]).toBe(0);
    expect(params[11]).toBe(0);
  });

  it('feeds the glass curve into the texture config the renderers already read', () => {
    const overrides = materialGlassConfigOverrides(DEFAULT_AUTHORED_BLOCK_MATERIAL);
    expect(overrides.authoredGlassMin).toBe(DEFAULT_AUTHORED_BLOCK_MATERIAL.glass.min);
    expect(overrides.authoredGlassIor).toBe(DEFAULT_AUTHORED_BLOCK_MATERIAL.glass.ior);
    expect(overrides.url).toBe('block.png');
    expect(overrides.maskUrl).toBeUndefined();
  });

  it('passes a companion mask through to the extractor config', () => {
    const withMask = mergeAuthoredBlockMaterial({ maps: { albedo: 'brick.png', metalMask: 'brick_mask.png' } });
    expect(materialGlassConfigOverrides(withMask).maskUrl).toBe('brick_mask.png');
  });
});
