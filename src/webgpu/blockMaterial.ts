/**
 * Authored block material — the *visual contract* for the go.1ink.us look.
 *
 * The look used to live as constants scattered across the TS shader, the GLSL
 * fallback and the C++ port. This module makes it data: one `block-material.json`
 * next to `block.png`, validated against `shared/blockMaterialSchema.json`, packed
 * into a single uniform block (`AuthoredMaterialParams`) that every renderer reads.
 *
 * Consequence — and the point of the exercise: swapping a brick (obsidian, ice,
 * neon steel) is a new PNG + JSON, not a shader fork. Anything a content pack is
 * allowed to change must be reachable from {@link AuthoredBlockMaterial}; if you
 * find yourself editing WGSL to ship a new tile, the contract is missing a field.
 */

import schema from '../../shared/blockMaterialSchema.json';
import {
  DEFAULT_GLASS_PARAMS,
  DEFAULT_GLASS_REFRACTION_PARAMS,
  GOLD_GRADE_MIX,
  GOLD_GRADE_SHADE_MAX,
  GOLD_GRADE_SHADE_MIN,
  GOLD_JEWELRY_ALBEDO,
  resolveBlockTextureAssetUrl,
} from './blockTexture.js';

export interface AuthoredBlockMaterialMaps {
  /** Canonical albedo source (atlas or single tile). PNG — always present. */
  albedo: string;
  /** Optional pre-compressed upgrade, used only when `texture-compression-bc` exists. */
  albedoKtx2?: string;
  /** Optional companion metal/glass mask (white = metal). */
  metalMask?: string;
  /** Packed runtime map: R=normal.x, G=normal.y, B=roughness, A=metallic. */
  material?: string;
  /** Optional viewable tangent-space normal map (baked from albedo when absent). */
  normal?: string;
}

export interface AuthoredBlockMaterialGlass {
  min: number;
  max: number;
  fresnelPower: number;
  ior: number;
  thickness: number;
}

export interface AuthoredBlockMaterialGold {
  /** F0 / albedo tint the atlas metal is graded toward. */
  tint: [number, number, number];
  mix: number;
  shadeMin: number;
  shadeMax: number;
}

export interface AuthoredBlockMaterialRoughness {
  /** Base roughness of the gold frame. */
  metal: number;
  /** Base roughness of the crystal (transmissive, near-polished). */
  glass: number;
  /** How strongly high-frequency albedo detail modulates roughness. */
  detail: number;
}

export interface AuthoredBlockMaterialContract {
  /** Mean metal mask over the border ring must be at least this. */
  borderMetalMin: number;
  /** Mean glass mask over the tile centre must be at least this. */
  centerGlassMin: number;
  /** Fraction of pixels allowed in the soft halo band (0 < a < 255). */
  haloMaxFraction: number;
}

export interface AuthoredBlockMaterial {
  version: number;
  name: string;
  maps: AuthoredBlockMaterialMaps;
  glass: AuthoredBlockMaterialGlass;
  gold: AuthoredBlockMaterialGold;
  roughness: AuthoredBlockMaterialRoughness;
  normal: { strength: number };
  contract: AuthoredBlockMaterialContract;
}

/**
 * The shipped reference brick. Values mirror the constants the renderers used
 * before the contract existed, so loading no JSON at all reproduces the current
 * go.1ink.us frame exactly.
 */
export const DEFAULT_AUTHORED_BLOCK_MATERIAL: AuthoredBlockMaterial = {
  version: 1,
  name: 'Reference gold + crystal',
  maps: { albedo: 'block.png' },
  glass: {
    min: DEFAULT_GLASS_PARAMS.min,
    max: DEFAULT_GLASS_PARAMS.max,
    fresnelPower: DEFAULT_GLASS_PARAMS.fresnelPower,
    ior: DEFAULT_GLASS_REFRACTION_PARAMS.ior,
    thickness: DEFAULT_GLASS_REFRACTION_PARAMS.thickness,
  },
  gold: {
    tint: [...GOLD_JEWELRY_ALBEDO] as [number, number, number],
    mix: GOLD_GRADE_MIX,
    shadeMin: GOLD_GRADE_SHADE_MIN,
    shadeMax: GOLD_GRADE_SHADE_MAX,
  },
  // Gold jewelry reads as polished-but-worked metal; the crystal is near-glass.
  roughness: { metal: 0.12, glass: 0.05, detail: 0.18 },
  // Hinges must stay readable at playfield size, so the default is deliberately low.
  normal: { strength: 0.35 },
  contract: { borderMetalMin: 0.85, centerGlassMin: 0.6, haloMaxFraction: 0.12 },
};

export const BLOCK_MATERIAL_JSON = 'block-material.json';

// ---------------------------------------------------------------------------
// Schema-driven validation (shared with scripts/validate-block-material.mjs)
// ---------------------------------------------------------------------------

export type SchemaFieldKind = 'number' | 'string' | 'vec3' | 'boolean';

export interface SchemaField {
  path: string;
  kind: SchemaFieldKind;
  min?: number;
  max?: number;
  required?: boolean;
}

export interface SchemaRule {
  kind: 'lte';
  left: string;
  right: string;
  message: string;
}

export const BLOCK_MATERIAL_SCHEMA = schema as unknown as {
  version: number;
  fields: SchemaField[];
  rules: SchemaRule[];
};

function getPath(root: unknown, path: string): unknown {
  let node: unknown = root;
  for (const key of path.split('.')) {
    if (node == null || typeof node !== 'object') return undefined;
    node = (node as Record<string, unknown>)[key];
  }
  return node;
}

function checkNumber(path: string, value: number, field: SchemaField, errors: string[]): void {
  if (!Number.isFinite(value)) {
    errors.push(`${path}: expected a finite number, got ${JSON.stringify(value)}`);
    return;
  }
  if (field.min != null && value < field.min) {
    errors.push(`${path}: ${value} is below the minimum ${field.min}`);
  }
  if (field.max != null && value > field.max) {
    errors.push(`${path}: ${value} is above the maximum ${field.max}`);
  }
}

/**
 * Validate a parsed `block-material.json` against the shared schema.
 * Unknown keys are an error, not a warning: a typo'd `glas.min` that silently
 * fell back to the default would regress the look with no signal at all.
 */
export function validateAuthoredBlockMaterial(
  json: unknown,
  schemaDoc = BLOCK_MATERIAL_SCHEMA,
): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  if (json == null || typeof json !== 'object' || Array.isArray(json)) {
    return { ok: false, errors: ['block-material.json must be a JSON object'] };
  }

  for (const field of schemaDoc.fields) {
    const value = getPath(json, field.path);
    if (value === undefined || value === null) {
      if (field.required) errors.push(`${field.path}: required field is missing`);
      continue;
    }
    switch (field.kind) {
      case 'number':
        checkNumber(field.path, value as number, field, errors);
        break;
      case 'string':
        if (typeof value !== 'string' || value.length === 0) {
          errors.push(`${field.path}: expected a non-empty string`);
        }
        break;
      case 'boolean':
        if (typeof value !== 'boolean') errors.push(`${field.path}: expected a boolean`);
        break;
      case 'vec3':
        if (!Array.isArray(value) || value.length !== 3) {
          errors.push(`${field.path}: expected 3 numbers`);
        } else {
          value.forEach((component, i) =>
            checkNumber(`${field.path}[${i}]`, component as number, field, errors),
          );
        }
        break;
    }
  }

  const known = new Set(schemaDoc.fields.map((f) => f.path));
  for (const path of enumerateLeafPaths(json as Record<string, unknown>)) {
    if (path.startsWith('$')) continue;
    if (!known.has(path)) errors.push(`${path}: unknown field (not in blockMaterialSchema.json)`);
  }

  for (const rule of schemaDoc.rules) {
    const left = getPath(json, rule.left);
    const right = getPath(json, rule.right);
    if (typeof left !== 'number' || typeof right !== 'number') continue;
    if (rule.kind === 'lte' && left > right) errors.push(rule.message);
  }

  return { ok: errors.length === 0, errors };
}

/** Dotted leaf paths of a plain JSON object (arrays count as leaves). */
export function enumerateLeafPaths(obj: Record<string, unknown>, prefix = ''): string[] {
  const out: string[] = [];
  for (const [key, value] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value != null && typeof value === 'object' && !Array.isArray(value)) {
      out.push(...enumerateLeafPaths(value as Record<string, unknown>, path));
    } else {
      out.push(path);
    }
  }
  return out;
}

/** Deep-merge a validated partial over the reference material. */
export function mergeAuthoredBlockMaterial(
  partial: unknown,
  base: AuthoredBlockMaterial = DEFAULT_AUTHORED_BLOCK_MATERIAL,
): AuthoredBlockMaterial {
  const p = (partial ?? {}) as Partial<AuthoredBlockMaterial>;
  return {
    version: p.version ?? base.version,
    name: p.name ?? base.name,
    maps: { ...base.maps, ...(p.maps ?? {}) },
    glass: { ...base.glass, ...(p.glass ?? {}) },
    gold: { ...base.gold, ...(p.gold ?? {}) },
    roughness: { ...base.roughness, ...(p.roughness ?? {}) },
    normal: { ...base.normal, ...(p.normal ?? {}) },
    contract: { ...base.contract, ...(p.contract ?? {}) },
  };
}

// ---------------------------------------------------------------------------
// Active material
// ---------------------------------------------------------------------------

let activeMaterial: AuthoredBlockMaterial = DEFAULT_AUTHORED_BLOCK_MATERIAL;

export function getAuthoredBlockMaterial(): AuthoredBlockMaterial {
  return activeMaterial;
}

export function setAuthoredBlockMaterial(material: AuthoredBlockMaterial): void {
  activeMaterial = material;
}

export function resetAuthoredBlockMaterial(): void {
  activeMaterial = DEFAULT_AUTHORED_BLOCK_MATERIAL;
}

/** Bound so a stalled block-material.json cannot hang renderer startup. */
export const MATERIAL_FETCH_TIMEOUT_MS = 4000;

export interface LoadAuthoredMaterialResult {
  /** True when a file was fetched, validated and applied. */
  applied: boolean;
  material: AuthoredBlockMaterial;
  errors: string[];
}

/**
 * Fetch + validate `public/block-material.json`. A malformed file keeps the
 * reference material and reports why, rather than shipping a half-applied look.
 */
export async function loadAuthoredBlockMaterial(
  fetchImpl: typeof fetch = fetch,
  timeoutMs = MATERIAL_FETCH_TIMEOUT_MS,
): Promise<LoadAuthoredMaterialResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(resolveBlockTextureAssetUrl(BLOCK_MATERIAL_JSON), {
      signal: controller.signal,
    });
    if (!res.ok) {
      return { applied: false, material: activeMaterial, errors: [`HTTP ${res.status}`] };
    }
    const json: unknown = await res.json();
    const { ok, errors } = validateAuthoredBlockMaterial(json);
    if (!ok) return { applied: false, material: activeMaterial, errors };
    const merged = mergeAuthoredBlockMaterial(json);
    setAuthoredBlockMaterial(merged);
    return { applied: true, material: merged, errors: [] };
  } catch (e) {
    return { applied: false, material: activeMaterial, errors: [String(e)] };
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// GPU packing
// ---------------------------------------------------------------------------

/** Debug visualisations selectable from the dev hotkey (see debug_shaders.ts). */
export const MaterialDebugView = {
  off: 0,
  albedo: 1,
  metalMask: 2,
  glassMask: 3,
  roughness: 4,
  normal: 5,
} as const;
export type MaterialDebugViewName = keyof typeof MaterialDebugView;

/** Bytes of the `AuthoredMaterialParams` uniform block (3 × vec4). */
export const AUTHORED_MATERIAL_PARAMS_SIZE = 48;

export interface MaterialParamsOptions {
  /** 1 when a baked packed material map is bound, 0 for the flat fallback. */
  materialMapEnabled?: boolean;
  debugView?: number;
}

/**
 * Pack the material into the uniform block the block shaders read.
 *
 *   goldTint  : rgb = jewelry tint, w = grade mix
 *   goldShade : x = shadeMin, y = shadeMax, z = metal roughness, w = glass roughness
 *   mapParams : x = normal strength, y = material-map enable, z = roughness detail,
 *               w = debug view
 */
export function materialParamsToFloat32Array(
  material: AuthoredBlockMaterial = getAuthoredBlockMaterial(),
  options: MaterialParamsOptions = {},
): Float32Array {
  return new Float32Array([
    material.gold.tint[0], material.gold.tint[1], material.gold.tint[2], material.gold.mix,
    material.gold.shadeMin, material.gold.shadeMax, material.roughness.metal, material.roughness.glass,
    material.normal.strength,
    options.materialMapEnabled ? 1 : 0,
    material.roughness.detail,
    options.debugView ?? 0,
  ]);
}

/** Glass curve in the shape `blockTexture.ts` already writes to the GPU. */
export function materialGlassConfigOverrides(
  material: AuthoredBlockMaterial = getAuthoredBlockMaterial(),
): {
  authoredGlassMin: number;
  authoredGlassMax: number;
  authoredGlassFresnelPower: number;
  authoredGlassIor: number;
  authoredGlassThickness: number;
  url: string;
  maskUrl?: string;
} {
  return {
    authoredGlassMin: material.glass.min,
    authoredGlassMax: material.glass.max,
    authoredGlassFresnelPower: material.glass.fresnelPower,
    authoredGlassIor: material.glass.ior,
    authoredGlassThickness: material.glass.thickness,
    url: material.maps.albedo,
    ...(material.maps.metalMask ? { maskUrl: material.maps.metalMask } : {}),
  };
}
