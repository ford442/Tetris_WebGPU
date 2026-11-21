import { describe, it, expect, beforeAll, vi } from 'vitest';
import Game from '../src/game.js';
import { WasmCore } from '../src/wasm/WasmCore.js';
import { getWallKicks, rotatePieceBlocks } from '../src/game/rotation.js';
import { ScoringSystem } from '../src/game/scoring.js';
import { attackRowsFromClear } from '../src/versus/garbage.js';
import type { TSpinResult } from '../src/game/tSpin.js';
import { type BotCore } from '../src/bot/BotCore.js';
import { MOVE, PIECE_TYPES, type SpinClass } from '../src/bot/types.js';
import { createSeededRng, PieceGenerator } from '../src/game/pieces.js';
import { emptyPosition, makeBotCore, makePiece, randomCells, readWasmBytes } from './helpers/bot.js';

global.fetch = vi.fn(async () => {
  const buf = readWasmBytes();
  return {
    ok: true,
    arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
  } as Response;
}) as unknown as typeof fetch;

const SPIN_OF: Record<TSpinResult, SpinClass> = { none: 0, mini: 1, normal: 2 };
const TSPIN_OF = ['none', 'mini', 'normal'] as const;

let core: BotCore;
let game: Game;

function loadBoard(cells: Int8Array): void {
  game.playfield.set(cells);
  game.collisionDetector.updatePlayfield(game.playfield);
  core.setPosition(emptyPosition({ cells }));
}

function setPose(type: string, x: number, y: number, rot: number, spin: SpinClass): void {
  game.activPiece = makePiece(type, x, y, rot);
  game.isTSpin = TSPIN_OF[spin];
}

beforeAll(async () => {
  await WasmCore.init();
  expect(WasmCore.get().isReady).toBe(true);
  game = new Game();
  game.view = null;
  core = await makeBotCore();
});

describe('bot ↔ game parity: geometry and rules tables', () => {
  it('piece shapes equal the game matrices rotated clockwise 0..3 times', () => {
    const ptr = core.raw.botShapesPtr();
    const mem = new Int8Array((core as unknown as { dv: DataView }).dv.buffer);
    const gen = new PieceGenerator();
    PIECE_TYPES.split('').forEach((type, t) => {
      let blocks = gen.createPieceByType(type).blocks;
      for (let rot = 0; rot < 4; rot++) {
        const expected: string[] = [];
        blocks.forEach((row, cy) => row.forEach((v, cx) => v && expected.push(`${cx},${cy}`)));
        const got: string[] = [];
        for (let i = 0; i < 4; i++) {
          const p = ptr + (t * 4 + rot) * 8 + i * 2;
          got.push(`${mem[p]},${mem[p + 1]}`);
        }
        expect(got.sort(), `${type} rot ${rot}`).toEqual(expected.sort());
        blocks = rotatePieceBlocks(blocks, true).map((r) => r.slice());
      }
    });
  });

  it('SRS kick offsets equal src/game/rotation.ts for every piece class, transition and kick', () => {
    for (const type of ['I', 'T']) {
      const t = PIECE_TYPES.indexOf(type);
      for (const [from, to] of [[0, 1], [1, 0], [1, 2], [2, 1], [2, 3], [3, 2], [3, 0], [0, 3]] as const) {
        const kicks = getWallKicks(type, from, to);
        expect(kicks).toHaveLength(5);
        kicks.forEach(([dx, dy], k) => {
          expect(core.raw.botKick(t, from, to, k, 0), `${type} ${from}->${to} k${k} dx`).toBe(dx);
          expect(core.raw.botKick(t, from, to, k, 1), `${type} ${from}->${to} k${k} dy`).toBe(dy);
        });
      }
    }
  });

  it('collision test matches the shared-memory collision kernel on random boards and poses', () => {
    const rng = createSeededRng(77);
    let compared = 0;
    for (let b = 0; b < 12; b++) {
      loadBoard(randomCells(100 + b, 4 + b));
      for (let i = 0; i < 300; i++) {
        const type = PIECE_TYPES[(rng() * 7) | 0]!;
        const rot = (rng() * 4) | 0;
        const x = ((rng() * 16) | 0) - 4;
        const y = ((rng() * 26) | 0) - 5;
        game.activPiece = makePiece(type, x, y, rot);
        const expected = game.hasCollision();
        expect(core.raw.botCollides(PIECE_TYPES.indexOf(type), rot, x, y) === 1, `${type} r${rot} @${x},${y}`).toBe(expected);
        compared++;
      }
    }
    expect(compared).toBe(3600);
  });

  it('rotation (incl. the kick-index quirk) and T-spin class match Game.rotatePiece', () => {
    const rng = createSeededRng(4242);
    let rotated = 0;
    let kicked = 0;
    const spins = [0, 0, 0];
    for (let b = 0; b < 80; b++) {
      loadBoard(randomCells(500 + b, 5 + (b % 12), 0.6 + (b % 4) * 0.08));
      for (let i = 0; i < 120; i++) {
        const type = rng() < 0.5 ? 'T' : PIECE_TYPES[(rng() * 7) | 0]!; // T-heavy: spin classes need it
        if (type === 'O') continue;
        const t = PIECE_TYPES.indexOf(type);
        const rot = (rng() * 4) | 0;
        const x = ((rng() * 12) | 0) - 2;
        const y = ((rng() * 22) | 0) - 2;
        const cw = rng() < 0.5;
        setPose(type, x, y, rot, 0);
        if (game.hasCollision()) continue;

        const before = { x: game.activPiece.x, y: game.activPiece.y, rot: game.activPiece.rotation };
        game.rotatePiece(cw);
        const after = { x: game.activPiece.x, y: game.activPiece.y, rot: game.activPiece.rotation };
        const moved = after.x !== before.x || after.y !== before.y || after.rot !== before.rot;

        const r = core.raw.botRotate(t, rot, cw ? 1 : 0, x, y);
        expect(r !== -2, `${type} r${rot}${cw ? 'cw' : 'ccw'} @${x},${y} success`).toBe(moved);
        if (!moved) continue;
        rotated++;
        if (r >= 0) kicked++;
        expect({ x: core.raw.botRotX(), y: core.raw.botRotY() }).toEqual({ x: after.x, y: after.y });
        const bot = type === 'T' ? core.raw.botTSpinClass(after.x, after.y, after.rot, r === 4 ? 1 : 0) : 0;
        expect(bot, `${type} spin class`).toBe(SPIN_OF[game.isTSpin]);
        spins[bot]!++;
      }
    }
    // Random poses almost never have 3 filled corners, so also BUILD spin situations: fill 3-4 corners of
    // the T's final 3x3 box (random subset => both mini and full), sprinkle extra blocks to force kicks.
    for (let trial = 0; trial < 900; trial++) {
      const finalRot = (rng() * 4) | 0;
      const x = (rng() * 8) | 0;
      const y = 1 + ((rng() * 16) | 0);
      const cw = rng() < 0.5;
      const startRot = cw ? (finalRot + 3) & 3 : (finalRot + 1) & 3;
      const cells = new Int8Array(200);
      const corners = [[x, y], [x + 2, y], [x, y + 2], [x + 2, y + 2]] as const;
      const drop = rng() < 0.5 ? -1 : (rng() * 4) | 0;
      corners.forEach(([cx, cy], i) => {
        if (i !== drop && cx < 10 && cy < 20) cells[cy * 10 + cx] = 1;
      });
      for (let k = 0; k < 6; k++) cells[(((rng() * 20) | 0) * 10) + ((rng() * 10) | 0)] = 1;
      const target = makePiece('T', x, y, finalRot);
      target.blocks.forEach((row, cy) => row.forEach((v, cx) => v && (cells[(y + cy) * 10 + x + cx] = 0)));
      loadBoard(cells);
      setPose('T', x, y, startRot, 0);
      if (game.hasCollision()) continue;
      const before = { x, y, rot: startRot };
      game.rotatePiece(cw);
      const moved = game.activPiece.x !== before.x || game.activPiece.y !== before.y || game.activPiece.rotation !== before.rot;
      const t = PIECE_TYPES.indexOf('T');
      const r = core.raw.botRotate(t, startRot, cw ? 1 : 0, x, y);
      expect(r !== -2).toBe(moved);
      if (!moved) continue;
      rotated++;
      if (r >= 0) kicked++;
      expect({ x: core.raw.botRotX(), y: core.raw.botRotY() }).toEqual({ x: game.activPiece.x, y: game.activPiece.y });
      const bot = core.raw.botTSpinClass(game.activPiece.x, game.activPiece.y, game.activPiece.rotation, r === 4 ? 1 : 0);
      expect(bot, 'constructed spin class').toBe(SPIN_OF[game.isTSpin]);
      spins[bot]!++;
    }
    // the sweep must actually exercise kicks and all three spin classes, or it proves nothing
    expect(rotated).toBeGreaterThan(1200);
    expect(kicked).toBeGreaterThan(100);
    expect(spins.every((n) => n > 5), `spin class counts ${spins}`).toBe(true);
  });
});

describe('bot ↔ game parity: scoring and attack', () => {
  it('scorePoints equals ScoringSystem.updateScore over lines × spin × combo × b2b × all-clear', () => {
    let checked = 0;
    for (let lines = 1; lines <= 4; lines++) {
      for (let spin = 0; spin < 3; spin++) {
        for (let comboBefore = -1; comboBefore <= 6; comboBefore++) {
          for (const b2b of [false, true]) {
            for (const allClear of [false, true]) {
              const sys = new ScoringSystem();
              sys.reset();
              sys.combo = comboBefore;
              sys.backToBack = b2b;
              // keep it at level 1 regardless of lines
              sys.setFixedLevel(1);
              const ev = sys.updateScore(lines, TSPIN_OF[spin]!, allClear);
              expect(core.raw.botScorePoints(lines, spin, comboBefore, b2b ? 1 : 0, allClear ? 1 : 0), `L${lines} s${spin} c${comboBefore} b${b2b} a${allClear}`).toBe(ev!.points);
              checked++;
            }
          }
        }
      }
    }
    expect(checked).toBe(4 * 3 * 8 * 2 * 2);
  });

  it('attackRows equals attackRowsFromClear and the original if-chain', () => {
    const original = (lines: number, tSpin: TSpinResult): number => {
      if (lines <= 0) return 0;
      if (tSpin === 'mini') {
        if (lines === 1) return 0;
        if (lines === 2) return 1;
      }
      if (tSpin === 'normal') {
        if (lines === 1) return 2;
        if (lines === 2) return 4;
        if (lines >= 3) return 6;
      }
      if (lines === 1) return 0;
      if (lines === 2) return 1;
      if (lines === 3) return 2;
      return 4;
    };
    for (let lines = 0; lines <= 4; lines++) {
      for (let spin = 0; spin < 3; spin++) {
        const ts = TSPIN_OF[spin]!;
        expect(attackRowsFromClear(lines, ts), `shared table ${lines}/${ts}`).toBe(original(lines, ts));
        expect(core.raw.botAttackRows(lines, spin), `wasm ${lines}/${ts}`).toBe(original(lines, ts));
      }
    }
  });
});

/**
 * Boards that really contain T-spin placements. Random boards almost never do, so scan seeds with the
 * generator for ones that have a mini and a full spin (selection only — equality is then checked against
 * the real Game, which does not use the bot at all).
 */
function findSpinBoards(): { cells: Int8Array; classes: Set<number> }[] {
  const boards: { cells: Int8Array; classes: Set<number> }[] = [];
  const wanted = new Set<number>();
  for (let seed = 1; seed < 6000 && boards.length < 8; seed++) {
    const cells = randomCells(seed, 3 + (seed % 7), 0.78 + (seed % 3) * 0.05);
    core.setPosition(emptyPosition({ cells }));
    const classes = new Set(core.generate('T').filter((p) => p.spin > 0).map((p) => p.spin as number));
    if (classes.size === 0) continue;
    const fresh = [...classes].some((c) => !wanted.has(c));
    if (fresh || boards.length < 4) {
      boards.push({ cells, classes });
      classes.forEach((c) => wanted.add(c));
    }
  }
  return boards;
}

describe('bot ↔ game parity: the move generator against the real engine', () => {
  /** Independent reference: breadth-first search that drives the REAL Game with the same five inputs. */
  function referencePlacements(type: string): Map<string, SpinClass> {
    const seen = new Set<string>();
    const locks = new Map<string, SpinClass>();
    const queue: [number, number, number, SpinClass][] = [[3, -2, 0, 0]];
    seen.add('3,-2,0,0');
    const ops: [string, () => void][] = [
      ['L', () => game.movePieceLeft()],
      ['R', () => game.movePieceRight()],
      ['D', () => game.movePieceDown()],
      ['CW', () => game.rotatePiece(true)],
      ['CCW', () => game.rotatePiece(false)],
    ];
    for (let head = 0; head < queue.length; head++) {
      const [x, y, rot, spin] = queue[head]!;
      for (const [name, op] of ops) {
        if (name.startsWith('C') && type === 'O') continue;
        setPose(type, x, y, rot, spin);
        const px = game.activPiece.x, py = game.activPiece.y, pr = game.activPiece.rotation;
        op();
        const nx = game.activPiece.x, ny = game.activPiece.y, nr = game.activPiece.rotation;
        if (nx === px && ny === py && nr === pr) continue;
        const nspin = SPIN_OF[game.isTSpin];
        const key = `${nx},${ny},${nr},${nspin}`;
        if (seen.has(key)) continue;
        seen.add(key);
        queue.push([nx, ny, nr, nspin]);
      }
      // resting? (can't move down) and fully on board -> lock candidate
      setPose(type, x, y, rot, spin);
      const before = game.activPiece.y;
      game.movePieceDown();
      if (game.activPiece.y === before) {
        const cells: number[] = [];
        const blocks = game.activPiece.blocks;
        blocks.forEach((row, cy) => row.forEach((v, cx) => v && cells.push((y + cy) * 10 + x + cx)));
        if (cells.every((c) => c >= 0)) {
          const key = cells.sort((a, b) => a - b).join(',');
          locks.set(key, Math.max(locks.get(key) ?? 0, spin) as SpinClass);
        }
      }
    }
    return locks;
  }

  function botPlacements(type: string): Map<string, SpinClass> {
    const out = new Map<string, SpinClass>();
    for (const p of core.generate(type)) {
      const blocks = makePiece(type, 0, 0, p.rot).blocks;
      const cells: number[] = [];
      blocks.forEach((row, cy) => row.forEach((v, cx) => v && cells.push((p.y + cy) * 10 + p.x + cx)));
      out.set(cells.sort((a, b) => a - b).join(','), p.spin);
    }
    return out;
  }

  it('finds exactly the placements (cells + best spin class) a brute-force game-driven search finds', () => {
    const configs: [number, number][] = [[1, 0], [2, 6], [3, 9], [4, 11], [5, 14], [6, 7], [7, 12], [8, 5]];
    let tSpinsSeen = 0;
    for (const [seed, rows] of configs) {
      loadBoard(rows === 0 ? new Int8Array(200) : randomCells(seed * 31, rows, 0.62));
      for (const type of PIECE_TYPES) {
        const expected = referencePlacements(type);
        const actual = botPlacements(type);
        expect([...actual].sort(), `seed ${seed} rows ${rows} piece ${type}`).toEqual([...expected].sort());
        if (type === 'T') for (const s of actual.values()) if (s > 0) tSpinsSeen++;
      }
    }
    expect(tSpinsSeen).toBeGreaterThanOrEqual(0);
  });

  it('agrees with the engine on boards that contain real mini and full T-spin placements', () => {
    const boards = findSpinBoards();
    const seenClasses = new Set<number>();
    for (const { cells, classes } of boards) {
      loadBoard(cells);
      for (const type of ['T', 'S', 'Z', 'L', 'J', 'I']) {
        expect([...botPlacements(type)].sort(), `piece ${type}`).toEqual([...referencePlacements(type)].sort());
      }
      classes.forEach((c) => seenClasses.add(c));
    }
    expect(boards.length).toBeGreaterThanOrEqual(4);
    expect(seenClasses.has(1) && seenClasses.has(2), `spin classes covered: ${[...seenClasses]}`).toBe(true);
  });

  it('every planned input path, replayed on the real Game, lands exactly on its placement (and keeps the spin)', () => {
    let replayed = 0;
    let spinPaths = 0;
    const fixtures = [...findSpinBoards().map((b) => b.cells), ...[[11, 8], [12, 11], [13, 14], [14, 9]].map(([seed, rows]) => randomCells(seed! * 17, rows!, 0.6))];
    for (const cells of fixtures) {
      loadBoard(cells);
      for (const type of PIECE_TYPES) {
        for (const p of core.generate(type)) {
          const len = core.plan(type, { x: 3, y: -2, rot: 0, spin: 0 }, p);
          expect(len, `${type} path`).toBeGreaterThanOrEqual(0);
          setPose(type, 3, -2, 0, 0);
          for (let i = 0; i < len; i++) {
            const m = core.path[i]!;
            if (m === MOVE.LEFT) game.movePieceLeft();
            else if (m === MOVE.RIGHT) game.movePieceRight();
            else if (m === MOVE.DOWN) game.movePieceDown();
            else if (m === MOVE.CW) game.rotatePiece(true);
            else game.rotatePiece(false);
          }
          expect({ x: game.activPiece.x, rot: game.activPiece.rotation }, `${type} ${JSON.stringify(p)}`).toEqual({ x: p.x, rot: p.rot });
          // The path excludes the final hard drop: drop the piece (as hardDrop() does) and it must land on the
          // placement. A spin placement allows NO drop after the rotation (it would clear the spin).
          const spinNow = SPIN_OF[game.isTSpin];
          const y0 = game.activPiece.y;
          expect(game.getGhostY(), `${type} ${JSON.stringify(p)} lands`).toBe(p.y);
          if (p.spin > 0) {
            expect(y0).toBe(p.y);
            expect(spinNow).toBe(p.spin);
            spinPaths++;
          }
          replayed++;
        }
      }
    }
    expect(replayed).toBeGreaterThan(400);
    expect(spinPaths).toBeGreaterThan(0);
  });
});
