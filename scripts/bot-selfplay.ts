/**
 * CPU opponent self-play report — the tuning loop for shared/botWeights.json.
 *
 *   npm run bot:selfplay                                    # all difficulties, 8 seeds x 150 pieces
 *   npm run bot:selfplay -- --difficulty expert --seeds 20 --pieces 300
 *   npm run bot:selfplay -- --weights /path/to/candidate.json   # try a weight set without editing shared/
 *
 * Reads public/release.wasm (run `npm run asbuild:release` first if you changed assembly/). Prints, per
 * difficulty, mean score / lines / topouts and the mean thinking time per piece.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { BotCore } from '../src/bot/BotCore.js';
import { packWeights } from '../src/bot/botData.js';
import { BOT_DIFFICULTIES, type BotDifficultyId } from '../src/bot/difficulty.js';
import { runSelfPlay } from '../src/bot/selfPlay.js';
import { WasmCore } from '../src/wasm/WasmCore.js';

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1]! : fallback;
}

const wasm = readFileSync(resolve(import.meta.dirname, '../public/release.wasm'));
globalThis.fetch = (async () => ({
  ok: true,
  arrayBuffer: async () => wasm.buffer.slice(wasm.byteOffset, wasm.byteOffset + wasm.byteLength),
})) as unknown as typeof fetch;
await WasmCore.init();

const search = await BotCore.create(wasm);
const planner = await BotCore.create(wasm);
const weightsPath = arg('weights', '');
if (weightsPath) {
  const json = JSON.parse(readFileSync(weightsPath, 'utf8')) as { weights?: Record<string, number> };
  const packed = packWeights(json.weights ?? (json as Record<string, number>));
  search.setWeights(packed);
  planner.setWeights(packed);
  console.log(`weights: ${weightsPath}`);
}

const seeds = Number(arg('seeds', '8'));
const pieces = Number(arg('pieces', '150'));
const only = arg('difficulty', '') as BotDifficultyId | '';
const ids = (only ? [only] : (Object.keys(BOT_DIFFICULTIES) as BotDifficultyId[]));

console.log(`${seeds} seeds x ${pieces} pieces\n`);
console.log('difficulty   mean score   mean lines   topouts   ms/piece');
for (const id of ids) {
  let score = 0;
  let lines = 0;
  let topouts = 0;
  const t0 = performance.now();
  for (let seed = 1; seed <= seeds; seed++) {
    const r = await runSelfPlay({ seed, maxPieces: pieces, difficulty: BOT_DIFFICULTIES[id], search, planner });
    score += r.score;
    lines += r.lines;
    if (r.toppedOut) topouts++;
  }
  const ms = (performance.now() - t0) / (seeds * pieces);
  console.log(`${id.padEnd(12)} ${String(Math.round(score / seeds)).padStart(10)} ${(lines / seeds).toFixed(1).padStart(12)} ${String(topouts).padStart(9)} ${ms.toFixed(2).padStart(10)}`);
}
