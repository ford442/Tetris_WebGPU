import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import type { BotCore } from '../src/bot/BotCore.js';
import { WEIGHT_CAPACITY, WEIGHT_FEATURES } from '../src/bot/botData.js';
import { placementCells } from '../src/bot/hint.js';
import { createSeededRng } from '../src/game/pieces.js';
import type { BotPosition } from '../src/bot/types.js';
import { emptyPosition, makeBotCore, randomCells } from './helpers/bot.js';

/** Build a 200-cell board from picture rows, bottom-aligned ('#' filled, '.' empty). */
function board(rows: string[]): Int8Array {
  const cells = new Int8Array(200);
  rows.forEach((r, i) => {
    const y = 20 - rows.length + i;
    [...r].forEach((ch, x) => {
      if (ch === '#') cells[y * 10 + x] = 1;
    });
  });
  return cells;
}

let core: BotCore;
beforeAll(async () => {
  core = await makeBotCore();
});
afterEach(() => core.resetWeights());

// ------------------------------------------------------------------------------------------------
// Independent reference implementations of every evaluator feature (plain loops, no bit tricks).
// ------------------------------------------------------------------------------------------------
const filled = (c: Int8Array, x: number, y: number): boolean => c[y * 10 + x] !== 0;

function heights(c: Int8Array): number[] {
  return Array.from({ length: 10 }, (_, x) => {
    for (let y = 0; y < 20; y++) if (filled(c, x, y)) return 20 - y;
    return 0;
  });
}

const REFERENCE: Record<string, (c: Int8Array, incoming: number) => number> = {
  heightAgg: (c) => heights(c).reduce((a, b) => a + b, 0),
  maxHeight: (c) => Math.max(...heights(c)),
  holes: (c) => {
    let n = 0;
    for (let x = 0; x < 10; x++) {
      let seen = false;
      for (let y = 0; y < 20; y++) {
        if (filled(c, x, y)) seen = true;
        else if (seen) n++;
      }
    }
    return n;
  },
  holeRows: (c) => {
    let rows = 0;
    for (let y = 0; y < 20; y++) {
      let has = false;
      for (let x = 0; x < 10 && !has; x++) {
        if (!filled(c, x, y)) for (let yy = 0; yy < y; yy++) if (filled(c, x, yy)) has = true;
      }
      if (has) rows++;
    }
    return rows;
  },
  covered: (c) => {
    let n = 0;
    for (let x = 0; x < 10; x++) {
      for (let y = 0; y < 20; y++) {
        if (filled(c, x, y)) continue;
        let above = 0;
        for (let yy = 0; yy < y; yy++) if (filled(c, x, yy)) above++;
        n += above; // cells piled above this hole (0 when it is not a hole)
      }
    }
    return n;
  },
  bumpiness: (c) => {
    const h = heights(c);
    let b = 0;
    for (let x = 0; x < 9; x++) b += Math.abs(h[x]! - h[x + 1]!);
    return b;
  },
  wellSum: (c) => {
    const h = heights(c);
    let s = 0;
    for (let x = 0; x < 10; x++) {
      const d = Math.min(x === 0 ? 20 : h[x - 1]!, x === 9 ? 20 : h[x + 1]!) - h[x]!;
      if (d > 0) s += (d * (d + 1)) / 2;
    }
    return s;
  },
  rowTrans: (c) => {
    let top = 20;
    for (let y = 0; y < 20 && top === 20; y++) for (let x = 0; x < 10; x++) if (filled(c, x, y)) top = y;
    let n = 0;
    for (let y = top; y < 20; y++) {
      let prev = true; // left wall
      for (let x = 0; x < 10; x++) {
        const cur = filled(c, x, y);
        if (cur !== prev) n++;
        prev = cur;
      }
      if (!prev) n++; // right wall
    }
    return n;
  },
  colTrans: (c) => {
    let n = 0;
    for (let x = 0; x < 10; x++) {
      let prev = false; // open air above the board
      for (let y = 0; y < 20; y++) {
        const cur = filled(c, x, y);
        if (cur !== prev) n++;
        prev = cur;
      }
      if (!prev) n++; // the floor counts as filled
    }
    return n;
  },
  tSlot: (c) => {
    let n = 0;
    for (let y = 0; y < 18; y++) {
      for (let x = 0; x < 8; x++) {
        const shoulders = filled(c, x, y + 2) && filled(c, x + 2, y + 2) && !filled(c, x + 1, y + 2);
        const open = !filled(c, x, y + 1) && !filled(c, x + 1, y + 1) && !filled(c, x + 2, y + 1);
        const overhang = filled(c, x, y) !== filled(c, x + 2, y);
        const support = y + 3 >= 20 || filled(c, x + 1, y + 3);
        if (shoulders && open && overhang && support) n++;
      }
    }
    return Math.min(n, 2);
  },
  tetrisReady: (c) => {
    let right = 0;
    let left = 0;
    for (let y = 0; y < 20; y++) {
      const row = Array.from({ length: 10 }, (_, x) => filled(c, x, y));
      if (row.slice(0, 9).every(Boolean) && !row[9]) right++;
      else if (row.slice(1).every(Boolean) && !row[0]) left++;
    }
    return Math.min(4, Math.max(left, right));
  },
  danger: (c, incoming) => Math.max(0, Math.max(...heights(c)) + incoming - 14),
};

/** Evaluate with exactly one feature weighted 1 and every other weight 0 => the raw feature value. */
function isolated(feature: string, cells: Int8Array, incoming = 0): number {
  const w = new Float32Array(WEIGHT_CAPACITY);
  w[WEIGHT_FEATURES.indexOf(feature)] = 1;
  core.setWeights(w);
  core.setPosition(emptyPosition({ cells, incoming }));
  return core.evaluate();
}

function evalOf(cells: Int8Array, incoming = 0): number {
  core.setPosition(emptyPosition({ cells, incoming }));
  return core.evaluate();
}

describe('evaluator features equal an independent reference', () => {
  it('covers every board feature in the schema (add a feature => add its reference here)', () => {
    const boardFeatures = WEIGHT_FEATURES.filter((f) => !['line1', 'line2', 'line3', 'line4', 'attack', 'spinMini', 'spinNormal', 'combo', 'b2b', 'allClear', 'score', 'b2bKeep', 'comboKeep'].includes(f));
    expect(Object.keys(REFERENCE).sort()).toEqual([...boardFeatures].sort());
  });

  it.each(Object.keys(REFERENCE))('%s matches on 150 random boards (and hand-built edge cases)', (feature) => {
    const rng = createSeededRng(feature.length * 977);
    const boards: Int8Array[] = [new Int8Array(200)];
    for (let i = 0; i < 150; i++) boards.push(randomCells(i + 1000, 1 + ((rng() * 19) | 0), 0.25 + rng() * 0.6));
    boards.push(board(['#########.', '#########.', '#########.', '#########.'])); // tetris well
    boards.push(board(['.#########', '.#########', '.#########'])); // left well
    boards.push(board(['#.........', '..........', '#.#.......', '###.......'])); // textbook TSD slot
    boards.push(board(Array.from({ length: 20 }, () => '#.#.#.#.#.'))); // full-height comb
    for (const [i, cells] of boards.entries()) {
      for (const incoming of [0, 5]) {
        expect(isolated(feature, cells, incoming), `${feature} board #${i} incoming ${incoming}`).toBe(REFERENCE[feature]!(cells, incoming));
      }
    }
  });
});

describe('evaluator with the shipped weights prefers the better board', () => {
  it('a hole is worse than the same cells without one', () => {
    expect(evalOf(board(['#.........', '##........']))).toBeGreaterThan(evalOf(board(['##........', '#.........'])));
  });

  it('every extra hole costs more', () => {
    expect(evalOf(board(['###.......', '#.#.......']))).toBeGreaterThan(evalOf(board(['####......', '#..#......'])));
  });

  it('smooth beats jagged at equal height and cell count', () => {
    expect(evalOf(board(['#####.....', '#####.....']))).toBeGreaterThan(evalOf(board(['#.#.#.#.#.', '#.#.#.#.#.'])));
  });

  it('lower beats taller for the same number of cells', () => {
    expect(evalOf(board(['########..']))).toBeGreaterThan(evalOf(board(['#.......', '#.......', '#.......', '#.......', '#.......', '#.......', '#.......', '#.......'].map((r) => r.padEnd(10, '.')))));
  });

  it('an edge tetris well beats a middle well of the same depth', () => {
    expect(evalOf(board(Array.from({ length: 4 }, () => '#########.')))).toBeGreaterThan(evalOf(board(Array.from({ length: 4 }, () => '####.#####'))));
  });

  it('incoming garbage makes a tall stack look worse, and does nothing to a short one', () => {
    const tall = board(Array.from({ length: 13 }, () => '#########.'));
    expect(evalOf(tall, 6)).toBeLessThan(evalOf(tall, 0));
    const short = board(['#########.']);
    expect(evalOf(short, 6)).toBe(evalOf(short, 0));
  });
});

describe('search decisions', () => {
  it('makes a 4-line clear when an I piece can finish a tetris well', () => {
    const cells = board(['#########.', '#########.', '#########.', '#########.']);
    const result = core.search(emptyPosition({ cells, active: 'I', next: ['O', 'T'], hold: null }), { depth: 2, beam: 6 });
    expect(result.moves[0]).toMatchObject({ type: 'I', rot: 1, lines: 4 });
    expect(placementCells(result.moves[0]!).filter((_, i) => i % 2 === 0).every((x) => x === 9)).toBe(true);
  });

  it('plays an O flat on an empty floor instead of leaving a gap', () => {
    const result = core.search(emptyPosition({ active: 'O', next: ['O', 'O'], canHold: false }), { depth: 2, beam: 4 });
    const cells = placementCells(result.moves[0]!);
    expect(new Set(cells.filter((_, i) => i % 2 === 1))).toEqual(new Set([18, 19]));
  });

  it('takes a T-spin double when the slot is open and a T is in hand', () => {
    // overhang at (0,16), empty notch column 1, shoulders at (0,18)/(2,18), supported at (1,19)
    const cells = board(['#.........', '...#######', '#.########', '###.######']);
    core.setPosition(emptyPosition({ cells, active: 'T' }));
    const generated = core.generate('T');
    expect(generated.some((p) => p.spin === 2), 'fixture must contain a full T-spin placement').toBe(true);
    const best = core.search(emptyPosition({ cells, active: 'T', next: ['I', 'O'], canHold: false }), { depth: 1, beam: 4 }).moves[0]!;
    expect(best).toMatchObject({ type: 'T', spin: 2, lines: 2 });
  });

  it('uses hold when swapping in the held piece is clearly better', () => {
    const cells = board(['#########.', '#########.', '#########.', '#########.']);
    const result = core.search(emptyPosition({ cells, active: 'Z', hold: 'I', next: ['O', 'O'], canHold: true }), { depth: 2, beam: 8 });
    expect(result.moves[0]).toMatchObject({ hold: true, type: 'I', lines: 4 });
  });

  it('cannot use hold when the game forbids it', () => {
    const cells = board(['#########.', '#########.', '#########.', '#########.']);
    const result = core.search(emptyPosition({ cells, active: 'Z', hold: 'I', next: ['O', 'O'], canHold: false }), { depth: 2, beam: 8 });
    expect(result.moves.every((m) => !m.hold)).toBe(true);
  });

  it('is deterministic: the same position gives bit-identical results, on any instance', async () => {
    const other = await makeBotCore();
    for (let seed = 1; seed <= 15; seed++) {
      const pos: BotPosition = emptyPosition({ cells: randomCells(seed, 5 + (seed % 9)), active: 'JLSTZIO'[seed % 7]!, next: ['I', 'T', 'S', 'Z', 'O'], hold: seed % 3 === 0 ? 'L' : null, combo: (seed % 4) - 1, b2b: seed % 2 === 0 });
      const a = core.search(pos, { depth: 4, beam: 12 });
      expect(core.search(pos, { depth: 4, beam: 12 })).toEqual(a);
      expect(other.search(pos, { depth: 4, beam: 12 })).toEqual(a);
    }
  });

  it('a search sliced into tiny steps gives the same answer as one run (resumable)', () => {
    for (let seed = 1; seed <= 12; seed++) {
      const pos = emptyPosition({ cells: randomCells(seed * 7, 6 + (seed % 6)), active: 'JLSTZIO'[seed % 7]!, next: ['L', 'T', 'S', 'Z', 'I'] });
      const whole = core.search(pos, { depth: 3, beam: 8 });
      core.setPosition(pos);
      core.searchBegin({ depth: 3, beam: 8 });
      let steps = 0;
      while (!core.searchStep(1)) steps++;
      expect(steps).toBeGreaterThan(3);
      expect(core.searchFinish()).toEqual(whole);
    }
  });

  it('honours the node budget (an expansion is at most 2 generator runs) and still answers', () => {
    const pos = emptyPosition({ cells: randomCells(3, 8), next: ['I', 'T', 'S', 'Z', 'O'] });
    for (const budget of [1, 2, 5, 10, 40]) {
      core.setPosition(pos);
      core.searchBegin({ depth: 6, beam: 16 });
      core.searchStep(budget);
      const r = core.searchFinish();
      expect(r.nodes).toBeLessThanOrEqual(budget + 2);
      expect(r.moves.length).toBeGreaterThan(0); // anytime: even one expansion yields a legal move
      expect(r.moves[0]!.value).toBeGreaterThan(-1e29);
    }
  });

  it('deeper search reaches deeper and ranks distinct placements', () => {
    const pos = emptyPosition({ cells: randomCells(9, 7), next: ['I', 'T', 'S', 'Z', 'O'] });
    const shallow = core.search(pos, { depth: 1, beam: 6 });
    const deep = core.search(pos, { depth: 5, beam: 6 });
    expect(shallow.depthReached).toBe(1);
    expect(deep.depthReached).toBeGreaterThan(shallow.depthReached);
    const keys = deep.moves.map((m) => `${m.type}${m.x},${m.y},${m.rot},${m.hold}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('maximum depth and beam on a messy board stays inside the memory page', () => {
    expect(core.memoryEnd).toBeLessThanOrEqual(65536);
    const pos = emptyPosition({ cells: randomCells(21, 12, 0.7) });
    for (let i = 0; i < 100; i++) {
      core.search({ ...pos, active: 'JLSTZIO'[i % 7]!, next: ['I', 'T', 'S', 'Z', 'O', 'L', 'J'] }, { depth: 7, beam: 32 });
    }
  });
});
