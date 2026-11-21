/**
 * Decision-latency benchmark. Tracked, not gated (the gate is tests/bot-performance.test.ts):
 *
 *   npm run bot:bench
 *
 * Reports ops/s and mean/p99 per decision for each depth/beam the difficulty ladder uses.
 */

import { bench, describe } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { BotCore } from '../src/bot/BotCore.js';
import { emptyPosition, randomCells } from './helpers/bot.js';

const core = await BotCore.create(readFileSync(resolve(__dirname, '../public/release.wasm')));
const positions = Array.from({ length: 64 }, (_, i) =>
  emptyPosition({ cells: randomCells(i + 1, 6 + (i % 7), 0.55), active: 'JLSTZIO'[i % 7]!, next: ['I', 'O', 'T', 'S', 'Z'], hold: i % 3 === 0 ? 'L' : null }),
);
let i = 0;
const next = () => positions[i++ % positions.length]!;

describe('one bot decision', () => {
  bench('greedy      depth 1 beam 1  (Easy)', () => void core.search(next(), { depth: 1, beam: 1 }));
  bench('depth 2 beam 6                (Normal)', () => void core.search(next(), { depth: 2, beam: 6 }));
  bench('depth 4 beam 12               (Hard)', () => void core.search(next(), { depth: 4, beam: 12 }));
  bench('depth 6 beam 16               (Expert)', () => void core.search(next(), { depth: 6, beam: 16 }));
});
