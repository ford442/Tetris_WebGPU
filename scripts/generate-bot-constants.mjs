#!/usr/bin/env node
/**
 * Regenerates assembly/bot/generated.ts (attack table, default weights, weight indices) from the
 * shared JSON, after validating it against shared/botDataSchema.json.
 *
 *   node scripts/generate-bot-constants.mjs            # rewrite
 *   node scripts/generate-bot-constants.mjs --check    # exit 1 when the committed file is stale
 *
 * Runs as part of asbuild:* so the wasm can never ship constants that differ from the JSON.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';

import { GENERATED_PATH, loadBotData, renderGenerated, validateBotData } from './lib/botData.mjs';

const check = process.argv.includes('--check');
const data = loadBotData();
const errors = validateBotData(data);
if (errors.length > 0) {
  console.error('[bot:generate] invalid bot data:\n  ' + errors.join('\n  '));
  process.exit(1);
}

const next = renderGenerated(data);
const current = existsSync(GENERATED_PATH) ? readFileSync(GENERATED_PATH, 'utf8') : null;

if (check) {
  if (current !== next) {
    console.error('[bot:generate] assembly/bot/generated.ts is stale. Run `npm run bot:generate` and commit it.');
    process.exit(1);
  }
  console.log('[bot:generate] assembly/bot/generated.ts is up to date.');
} else if (current !== next) {
  writeFileSync(GENERATED_PATH, next);
  console.log('[bot:generate] wrote assembly/bot/generated.ts');
} else {
  console.log('[bot:generate] assembly/bot/generated.ts already up to date.');
}
