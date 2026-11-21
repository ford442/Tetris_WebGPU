import { describe, it, expect, beforeAll } from 'vitest';
import { statSync } from 'node:fs';
import type { BotCore } from '../src/bot/BotCore.js';
import { BOT_DIFFICULTIES } from '../src/bot/difficulty.js';
import { emptyPosition, makeBotCore, randomCells, WASM_PATH } from './helpers/bot.js';

/** Mid-game positions with a real 5-piece preview — the same kind of decision the game asks for. */
function positions(n: number) {
  return Array.from({ length: n }, (_, i) =>
    emptyPosition({ cells: randomCells(i + 1, 6 + (i % 7), 0.55), active: 'JLSTZIO'[i % 7]!, next: ['I', 'O', 'T', 'S', 'Z'], hold: i % 3 === 0 ? 'L' : null }),
  );
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)]!;
}

let core: BotCore;
beforeAll(async () => {
  core = await makeBotCore();
  for (const p of positions(40)) core.search(p, { depth: 3, beam: 8 }); // JIT warm-up
});

describe('decision budget', () => {
  it('median decision at depth 2 is under 2 ms (the issue budget; typical machine ~0.45 ms)', () => {
    const times = positions(300).map((p) => {
      const t0 = performance.now();
      core.search(p, { depth: 2, beam: 6 });
      return performance.now() - t0;
    });
    expect(median(times)).toBeLessThan(2);
  });

  it('a 10-node slice (what the single-thread fallback does per idle callback) stays well under a frame', () => {
    const worst = positions(60).reduce((max, p) => {
      core.setPosition(p);
      core.searchBegin({ depth: 6, beam: 16 });
      let slowest = 0;
      for (let i = 0; i < 20; i++) {
        const t0 = performance.now();
        const done = core.searchStep(10);
        slowest = Math.max(slowest, performance.now() - t0);
        if (done) break;
      }
      return Math.max(max, slowest);
    }, 0);
    expect(worst).toBeLessThan(8); // a 60 Hz frame is 16.7 ms; observed ~0.5 ms
  });

  it('every shipped difficulty finishes a decision inside its node budget, in Worker-sized time', () => {
    for (const d of Object.values(BOT_DIFFICULTIES)) {
      const times = positions(40).map((p) => {
        core.setPosition(p);
        core.searchBegin({ depth: d.depth, beam: d.beam });
        const t0 = performance.now();
        core.searchStep(d.nodeBudget);
        core.searchFinish();
        return performance.now() - t0;
      });
      expect(median(times), `${d.id}`).toBeLessThan(25);
    }
  });
});

describe('wasm size', () => {
  it('release.wasm stays small: 1.4 KiB of collision code + the bot < 32 KiB (delta documented in docs/BOT.md)', () => {
    const bytes = statSync(WASM_PATH).size;
    expect(bytes).toBeGreaterThan(1453); // the bot is in there
    expect(bytes).toBeLessThan(32 * 1024);
  });
});
