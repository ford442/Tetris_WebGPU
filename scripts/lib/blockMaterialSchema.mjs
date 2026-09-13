/**
 * Node-side reader/validator for the authored block material contract.
 *
 * The *schema* is data (shared/blockMaterialSchema.json), so this file and the
 * TypeScript validator (src/webgpu/blockMaterial.ts) check the same field list,
 * ranges and cross-field rules. Keeping the rules in JSON is what stops the build
 * gate and the runtime loader from disagreeing about what a valid material is.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

export const SCHEMA_PATH = join(ROOT, 'shared', 'blockMaterialSchema.json');
export const MATERIAL_PATH = join(ROOT, 'public', 'block-material.json');

export function loadSchema(path = SCHEMA_PATH) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function getPath(root, path) {
  let node = root;
  for (const key of path.split('.')) {
    if (node == null || typeof node !== 'object') return undefined;
    node = node[key];
  }
  return node;
}

function leafPaths(obj, prefix = '') {
  const out = [];
  for (const [key, value] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value != null && typeof value === 'object' && !Array.isArray(value)) {
      out.push(...leafPaths(value, path));
    } else {
      out.push(path);
    }
  }
  return out;
}

function checkNumber(path, value, field, errors) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    errors.push(`${path}: expected a finite number, got ${JSON.stringify(value)}`);
    return;
  }
  if (field.min != null && value < field.min) errors.push(`${path}: ${value} < minimum ${field.min}`);
  if (field.max != null && value > field.max) errors.push(`${path}: ${value} > maximum ${field.max}`);
}

/** Mirror of validateAuthoredBlockMaterial() in src/webgpu/blockMaterial.ts. */
export function validateMaterial(json, schema = loadSchema()) {
  const errors = [];
  if (json == null || typeof json !== 'object' || Array.isArray(json)) {
    return { ok: false, errors: ['block-material.json must be a JSON object'] };
  }

  for (const field of schema.fields) {
    const value = getPath(json, field.path);
    if (value === undefined || value === null) {
      if (field.required) errors.push(`${field.path}: required field is missing`);
      continue;
    }
    if (field.kind === 'number') {
      checkNumber(field.path, value, field, errors);
    } else if (field.kind === 'string') {
      if (typeof value !== 'string' || value.length === 0) {
        errors.push(`${field.path}: expected a non-empty string`);
      }
    } else if (field.kind === 'boolean') {
      if (typeof value !== 'boolean') errors.push(`${field.path}: expected a boolean`);
    } else if (field.kind === 'vec3') {
      if (!Array.isArray(value) || value.length !== 3) {
        errors.push(`${field.path}: expected 3 numbers`);
      } else {
        value.forEach((c, i) => checkNumber(`${field.path}[${i}]`, c, field, errors));
      }
    }
  }

  const known = new Set(schema.fields.map((f) => f.path));
  for (const path of leafPaths(json)) {
    if (path.startsWith('$')) continue;
    if (!known.has(path)) errors.push(`${path}: unknown field (not in blockMaterialSchema.json)`);
  }

  for (const rule of schema.rules ?? []) {
    const left = getPath(json, rule.left);
    const right = getPath(json, rule.right);
    if (typeof left !== 'number' || typeof right !== 'number') continue;
    if (rule.kind === 'lte' && left > right) errors.push(rule.message);
  }

  return { ok: errors.length === 0, errors };
}

/** Read + validate public/block-material.json. Reports every error at once. */
export function readValidatedMaterial(path = MATERIAL_PATH) {
  const json = JSON.parse(readFileSync(path, 'utf8'));
  const { ok, errors } = validateMaterial(json);
  if (!ok) {
    throw new Error(`${path} is invalid:\n  - ${errors.join('\n  - ')}`);
  }
  return json;
}
