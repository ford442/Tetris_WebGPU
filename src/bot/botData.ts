/**
 * Runtime reader/validator for the CPU opponent's shared data. Mirror of scripts/lib/botData.mjs — both
 * check the SAME schema (shared/botDataSchema.json), so a file accepted by the build gate is accepted here.
 */

import schema from '../../shared/botDataSchema.json';
import attackJson from '../../shared/versusAttack.json';
import weightsJson from '../../shared/botWeights.json';

export type AttackTableName = 'none' | 'tSpinMini' | 'tSpin';
export type AttackTables = Readonly<Record<AttackTableName, readonly number[]>>;

export const WEIGHT_FEATURES: readonly string[] = schema.weights.features;
export const WEIGHT_CAPACITY: number = schema.weights.capacity;

/** Validate a candidate attack table set; returns problems (empty when valid). */
export function validateAttackTables(attack: unknown): string[] {
  const errors: string[] = [];
  if (attack == null || typeof attack !== 'object' || Array.isArray(attack)) {
    return ['versusAttack: must be an object'];
  }
  const record = attack as Record<string, unknown>;
  for (const name of schema.attack.tables) {
    const table = record[name];
    if (!Array.isArray(table) || table.length !== schema.attack.length) {
      errors.push(`versusAttack.${name}: expected an array of ${schema.attack.length} entries`);
      continue;
    }
    table.forEach((v: unknown, i) => {
      if (!Number.isInteger(v) || (v as number) < schema.attack.min || (v as number) > schema.attack.max) {
        errors.push(`versusAttack.${name}[${i}]: ${JSON.stringify(v)} is not an integer in ${schema.attack.min}..${schema.attack.max}`);
      }
    });
    if (table[0] !== 0) errors.push(`versusAttack.${name}[0]: zero lines must send 0`);
  }
  return errors;
}

/** Validate a name -> value weights object and return problems (empty when valid). */
export function validateWeightMap(map: unknown): string[] {
  const errors: string[] = [];
  if (map == null || typeof map !== 'object' || Array.isArray(map)) return ['weights: must be an object'];
  const record = map as Record<string, unknown>;
  for (const name of WEIGHT_FEATURES) {
    const v = record[name];
    if (typeof v !== 'number' || !Number.isFinite(v)) {
      errors.push(`weights.${name}: required finite number, got ${JSON.stringify(v)}`);
    } else if (v < schema.weights.min || v > schema.weights.max) {
      errors.push(`weights.${name}: ${v} outside ${schema.weights.min}..${schema.weights.max}`);
    }
  }
  for (const key of Object.keys(record)) {
    if (!WEIGHT_FEATURES.includes(key)) errors.push(`weights.${key}: unknown feature`);
  }
  return errors;
}

/** Pack a validated name -> value map into the f32 table layout the wasm reads (capacity-padded). */
export function packWeights(map: Readonly<Record<string, number>>): Float32Array {
  const errors = validateWeightMap(map);
  if (errors.length > 0) throw new Error(`invalid bot weights: ${errors.join('; ')}`);
  const out = new Float32Array(WEIGHT_CAPACITY);
  WEIGHT_FEATURES.forEach((name, i) => {
    out[i] = map[name]!;
  });
  return out;
}

const attackErrors = validateAttackTables(attackJson);
if (attackErrors.length > 0) {
  throw new Error(`shared/versusAttack.json is invalid: ${attackErrors.join('; ')}`);
}

/** The shared garbage table (also baked into the wasm). */
export const ATTACK_TABLES: AttackTables = {
  none: attackJson.none,
  tSpinMini: attackJson.tSpinMini,
  tSpin: attackJson.tSpin,
};

/** Shipped default weights (shared/botWeights.json), in wasm table order. */
export const DEFAULT_BOT_WEIGHTS_MAP: Readonly<Record<string, number>> = weightsJson.weights;
export function defaultBotWeights(): Float32Array {
  return packWeights(DEFAULT_BOT_WEIGHTS_MAP);
}
