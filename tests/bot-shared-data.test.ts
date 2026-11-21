import { describe, it, expect, beforeAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import schema from '../shared/botDataSchema.json';
import attackJson from '../shared/versusAttack.json';
import weightsJson from '../shared/botWeights.json';
import { ATTACK_TABLES, defaultBotWeights, packWeights, validateAttackTables, validateWeightMap, WEIGHT_CAPACITY, WEIGHT_FEATURES } from '../src/bot/botData.js';
import { loadBotData, renderGenerated, validateBotData, GENERATED_PATH } from '../scripts/lib/botData.mjs';
import { attackRowsFromClear } from '../src/versus/garbage.js';
import type { BotCore } from '../src/bot/BotCore.js';
import { makeBotCore } from './helpers/bot.js';

const ROOT = resolve(__dirname, '..');

describe('shared bot data (attack table + evaluator weights)', () => {
  let core: BotCore;
  beforeAll(async () => {
    core = await makeBotCore();
  });

  it('the committed JSON validates against the schema in BOTH the build-gate and runtime validators', () => {
    expect(validateBotData(loadBotData())).toEqual([]);
    expect(validateAttackTables(attackJson)).toEqual([]);
    expect(validateWeightMap(weightsJson.weights)).toEqual([]);
  });

  it('both validators reject the same malformed files (they read one schema)', () => {
    const bad = {
      attack: [
        { ...attackJson, none: [1, 0, 1, 2, 4] }, // zero lines must send 0
        { ...attackJson, tSpin: [0, 2, 4] }, // wrong length
        { ...attackJson, none: [0, 0, 1.5, 2, 4] }, // not an integer
        { ...attackJson, bogus: [0, 0, 0, 0, 0] }, // unknown table (build gate only)
      ],
      weights: [
        { ...weightsJson.weights, holes: Number.NaN },
        { ...weightsJson.weights, holes: 5000 },
        { ...weightsJson.weights, nonsense: 1 },
        Object.fromEntries(Object.entries(weightsJson.weights).filter(([k]) => k !== 'danger')),
      ],
    };
    const data = loadBotData();
    for (const attack of bad.attack.slice(0, 3)) {
      expect(validateAttackTables(attack).length).toBeGreaterThan(0);
      expect(validateBotData({ ...data, attack }).length).toBeGreaterThan(0);
    }
    expect(validateBotData({ ...data, attack: bad.attack[3] }).length).toBeGreaterThan(0);
    for (const weights of bad.weights) {
      expect(validateWeightMap(weights).length).toBeGreaterThan(0);
      expect(validateBotData({ ...data, weights: { weights } }).length).toBeGreaterThan(0);
    }
  });

  it('assembly/bot/generated.ts is exactly what the generator produces (CI fails on a stale file)', () => {
    expect(readFileSync(GENERATED_PATH, 'utf8')).toBe(renderGenerated(loadBotData()));
    const out = execFileSync('node', ['scripts/generate-bot-constants.mjs', '--check'], { cwd: ROOT, encoding: 'utf8' });
    expect(out).toContain('up to date');
  });

  it('the generator emits an index constant for every schema feature, in schema order', () => {
    const text = readFileSync(GENERATED_PATH, 'utf8');
    WEIGHT_FEATURES.forEach((name, i) => {
      const snake = name.replace(/([A-Z])/g, '_$1').toUpperCase();
      expect(text).toContain(`export const W_${snake}: i32 = ${i};`);
    });
    expect(WEIGHT_FEATURES).toEqual(schema.weights.features);
  });

  it('src/versus/garbage.ts reads the shared table (no copy): editing the JSON changes it', () => {
    expect(ATTACK_TABLES.none).toEqual(attackJson.none);
    for (let lines = 1; lines <= 4; lines++) {
      expect(attackRowsFromClear(lines)).toBe(attackJson.none[lines]);
      expect(attackRowsFromClear(lines, 'mini')).toBe(attackJson.tSpinMini[lines]);
      expect(attackRowsFromClear(lines, 'normal')).toBe(attackJson.tSpin[lines]);
    }
    // and the source file really contains no numeric attack literals of its own
    const src = readFileSync(resolve(ROOT, 'src/versus/garbage.ts'), 'utf8');
    expect(src).not.toMatch(/return [1-6];/);
  });

  it('the weights compiled into the wasm equal shared/botWeights.json (packed in schema order)', () => {
    core.raw.botResetWeights();
    const view = new Float32Array((core as unknown as { weights: Float32Array }).weights.buffer, core.raw.botWeightsPtr(), WEIGHT_CAPACITY);
    expect([...view]).toEqual([...defaultBotWeights()]);
    expect(core.raw.botWeightCount()).toBe(WEIGHT_FEATURES.length);
  });

  it('packWeights pads to the table capacity and refuses invalid maps', () => {
    const packed = packWeights(weightsJson.weights);
    expect(packed).toHaveLength(WEIGHT_CAPACITY);
    expect(packed[WEIGHT_FEATURES.indexOf('holes')]).toBe(Math.fround(weightsJson.weights.holes));
    expect(packed.slice(WEIGHT_FEATURES.length).every((v) => v === 0)).toBe(true);
    expect(() => packWeights({ holes: 1 })).toThrow(/invalid bot weights/);
  });
});
