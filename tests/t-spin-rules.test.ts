import { describe, it, expect, vi, beforeAll } from 'vitest';
import Game from '../src/game.js';
import { evaluateTSpin, type TSpinCorner } from '../src/game/tSpin.js';
import { ScoringSystem } from '../src/game/scoring.js';
import { attackRowsFromClear } from '../src/versus/garbage.js';
import { WasmCore } from '../src/wasm/WasmCore.js';
import type { Piece } from '../src/game/pieces.js';
import fs from 'fs';
import path from 'path';

describe('T-Spin Rules', () => {

  beforeAll(async () => {
    // Mock minimal DOM for tests
    global.document = {
      getElementById: vi.fn(() => ({
        textContent: '',
        style: { display: '' }
      })),
      querySelector: vi.fn(() => ({
        textContent: '',
        style: { display: '' }
      }))
    } as any;

    if (!WasmCore.get().isReady) {
      const wasmPath = path.resolve(__dirname, '../build/release.wasm');
      if (fs.existsSync(wasmPath)) {
        const wasmBuffer = fs.readFileSync(wasmPath);
        global.fetch = vi.fn().mockResolvedValue({
          ok: true,
          arrayBuffer: async () => wasmBuffer,
          headers: { get: () => 'application/wasm' }
        });
        try {
          await WasmCore.get().init();
        } catch (_e) {
          // Ignore
        }
      }
    }
  });

  describe('3-corner rule & orientations', () => {
    const corners: TSpinCorner[] = [{x:0, y:0}, {x:0, y:0}, {x:0, y:0}, {x:0, y:0}];
    const getCellEmpty = () => 0;

    it('returns none if non-T piece', () => {
      const piece = { type: 'I', rotation: 0, x: 5, y: 5, blocks: [] } as any;
      expect(evaluateTSpin(piece, getCellEmpty, 10, 20, corners)).toBe('none');
    });

    it('returns none if < 3 corners occupied', () => {
      const piece = { type: 'T', rotation: 0, x: 5, y: 5, blocks: [] } as any;
      const getCell = (x: number, y: number) => {
        // Only 2 corners occupied
        if (x === 5 && y === 5) return 1; // Top-left
        if (x === 7 && y === 5) return 1; // Top-right
        return 0;
      };
      expect(evaluateTSpin(piece, getCell, 10, 20, corners)).toBe('none');
    });

    it('returns normal if both front corners occupied (up)', () => {
      const piece = { type: 'T', rotation: 0, x: 5, y: 5, blocks: [] } as any; // front = top left/right
      const getCell = (x: number, y: number) => {
        if (x === 5 && y === 5) return 1; // Top-left (front)
        if (x === 7 && y === 5) return 1; // Top-right (front)
        if (x === 5 && y === 7) return 1; // Bottom-left (back)
        return 0;
      };
      expect(evaluateTSpin(piece, getCell, 10, 20, corners)).toBe('normal');
    });

    it('returns normal if both front corners occupied (right)', () => {
      const piece = { type: 'T', rotation: 1, x: 5, y: 5, blocks: [] } as any; // front = top right/bottom right
      const getCell = (x: number, y: number) => {
        if (x === 7 && y === 5) return 1; // Top-right (front)
        if (x === 7 && y === 7) return 1; // Bottom-right (front)
        if (x === 5 && y === 5) return 1; // Top-left (back)
        return 0;
      };
      expect(evaluateTSpin(piece, getCell, 10, 20, corners)).toBe('normal');
    });

    it('returns mini if one front + both back occupied (up)', () => {
      const piece = { type: 'T', rotation: 0, x: 5, y: 5, blocks: [] } as any;
      const getCell = (x: number, y: number) => {
        if (x === 5 && y === 5) return 1; // Top-left (front)
        if (x === 5 && y === 7) return 1; // Bottom-left (back)
        if (x === 7 && y === 7) return 1; // Bottom-right (back)
        return 0;
      };
      expect(evaluateTSpin(piece, getCell, 10, 20, corners)).toBe('mini');
    });

    it('returns mini if one front + both back occupied (right)', () => {
      const piece = { type: 'T', rotation: 1, x: 5, y: 5, blocks: [] } as any;
      const getCell = (x: number, y: number) => {
        if (x === 7 && y === 5) return 1; // Top-right (front)
        if (x === 5 && y === 5) return 1; // Top-left (back)
        if (x === 5 && y === 7) return 1; // Bottom-left (back)
        return 0;
      };
      expect(evaluateTSpin(piece, getCell, 10, 20, corners)).toBe('mini');
    });

    it('promotes mini to normal if kickIndex is 4', () => {
      const piece = { type: 'T', rotation: 0, x: 5, y: 5, blocks: [] } as any;
      const getCell = (x: number, y: number) => {
        if (x === 5 && y === 5) return 1; // Top-left (front)
        if (x === 5 && y === 7) return 1; // Bottom-left (back)
        if (x === 7 && y === 7) return 1; // Bottom-right (back)
        return 0;
      };
      // Normally mini, but kickIndex 4 promotes it
      expect(evaluateTSpin(piece, getCell, 10, 20, corners, 4)).toBe('normal');
      expect(evaluateTSpin(piece, getCell, 10, 20, corners, 3)).toBe('mini');
    });

    it('counts walls and floor as occupied', () => {
      // Left wall (x=-1) and bottom floor (y=19)
      const piece = { type: 'T', rotation: 3, x: -1, y: 18, blocks: [] } as any; // front = left
      // Corners:
      // (px, py) = (-1, 18) -> left wall
      // (px+2, py) = (1, 18)
      // (px, py+2) = (-1, 20) -> left wall + floor
      // (px+2, py+2) = (1, 20) -> floor
      expect(evaluateTSpin(piece, getCellEmpty, 10, 20, corners)).toBe('normal');
    });
  });

  describe('Move/Drop Resetting', () => {
    it('keeps spin on rotation into slot, resets on move/drop', async () => {
      const game = new Game();
      // Assume T piece spawns
      game.activPiece = game.createPiece();
      game.activPiece.type = 'T';
      game.activPiece.rotation = 0;
      game.activPiece.x = 4;
      game.activPiece.y = 10;

      // Force T-spin detection by mocking checkTSpin
      game.isTSpin = 'normal';

      // Move left
      game.movePieceLeft();
      expect(game.isTSpin).toBe('none');

      game.isTSpin = 'mini';
      game.movePieceRight();
      expect(game.isTSpin).toBe('none');

      game.isTSpin = 'normal';
      game.movePieceDown();
      expect(game.isTSpin).toBe('none');

      game.isTSpin = 'normal';
      // Mock ghost distance > 0
      game.getGhostY = vi.fn().mockReturnValue(12);

      // We need to bypass the scoring since it triggers async calls and full line clears that might fail with dummy pieces
      game.clearLine = vi.fn().mockReturnValue([]);

      game.dropPiece();
      expect(game.isTSpin).toBe('none');
    });

    it('keeps spin if move is blocked', () => {
      const game = new Game();
      game.activPiece = game.createPiece();
      game.activPiece.type = 'T';
      game.isTSpin = 'normal';

      // Mock hasCollision to return true
      game.hasCollision = vi.fn().mockReturnValue(true);

      // Blocked moves shouldn't reset
      game.movePieceLeft();
      expect(game.isTSpin).toBe('normal');

      game.movePieceRight();
      expect(game.isTSpin).toBe('normal');

      game.movePieceDown();
      expect(game.isTSpin).toBe('normal');
    });
  });

  describe('Scoring & B2B', () => {
    let system: ScoringSystem;
    beforeAll(() => {
      system = new ScoringSystem();
    });

    it('scores mini correctly', () => {
      system.reset();
      system.setFixedLevel(1);

      // Mini 0 lines
      system.updateScore(0, 'mini');
      expect(system.score).toBe(0); // wait, zero lines doesn't add score or it does?
      // "Zero-line spins keep the B2B flag and get no bonus" -> correct, updateScore returns early for 0 lines.

      // Mini 1
      system.updateScore(1, 'mini');
      expect(system.score).toBe(200 * 1);

      // Mini 2
      system.reset();
      system.updateScore(2, 'mini');
      expect(system.score).toBe(400 * 1);
    });

    it('scores normal correctly', () => {
      system.reset();
      system.setFixedLevel(2);

      system.updateScore(1, 'normal');
      expect(system.score).toBe(800 * 2);

      system.reset();
      system.setFixedLevel(2);
      system.updateScore(2, 'normal');
      expect(system.score).toBe(1200 * 2);

      system.reset();
      system.setFixedLevel(2);
      system.updateScore(3, 'normal');
      expect(system.score).toBe(1600 * 2);
    });

    it('handles B2B correctly', () => {
      system.reset();
      system.setFixedLevel(1);

      // TSD starts B2B
      system.updateScore(2, 'normal');
      expect(system.backToBack).toBe(true);
      expect(system.score).toBe(1200);

      // Mini single continues B2B
      system.updateScore(1, 'mini');
      expect(system.backToBack).toBe(true);
      // Base is 200, b2b is *1.5 = 300. Plus combo multiplier 1.3 = 390. Total 1590
      expect(system.score).toBe(1200 + Math.floor(200 * 1.5 * 1.3));

      // Zero-line spin keeps B2B
      const preScore = system.score;
      system.updateScore(0, 'normal');
      expect(system.backToBack).toBe(true);
      expect(system.score).toBe(preScore);

      // Single breaks B2B
      system.updateScore(1, 'none');
      expect(system.backToBack).toBe(false);
    });
  });

  describe('Versus Garbage', () => {
    it('sends correct garbage amounts', () => {
      expect(attackRowsFromClear(1, 'none')).toBe(0);
      expect(attackRowsFromClear(2, 'none')).toBe(1);
      expect(attackRowsFromClear(3, 'none')).toBe(2);
      expect(attackRowsFromClear(4, 'none')).toBe(4);

      expect(attackRowsFromClear(1, 'mini')).toBe(0); // Mini single 0
      expect(attackRowsFromClear(2, 'mini')).toBe(1); // Mini double 1

      expect(attackRowsFromClear(1, 'normal')).toBe(2); // TSS 2
      expect(attackRowsFromClear(2, 'normal')).toBe(4); // TSD 4
      expect(attackRowsFromClear(3, 'normal')).toBe(6); // TST 6
    });
  });

describe('T-Spin orientation edge cases', () => {
  it('should detect a normal T-Spin with 3 corners occupied and 2 front corners', () => {
    const piece: Piece = { type: 'T', x: 0, y: 0, rotation: 0, blocks: [], color: 0 };
    // Assuming corners 0 and 1 are front for rotation 0
    const corners = [{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 0, y: 2 }, { x: 2, y: 2 }];
    const getCell = (x: number, y: number) => {
      if (x === 0 && y === 0) return 1; // front
      if (x === 2 && y === 0) return 1; // front
      if (x === 0 && y === 2) return 1; // back
      return 0;
    };
    expect(evaluateTSpin(piece, getCell, 10, 20, corners, 0)).toBe('normal');
  });

  });

  it('should detect a mini T-Spin with 3 corners occupied and 1 front corner', () => {
    const piece: Piece = { type: 'T', x: 0, y: 0, rotation: 0, blocks: [], color: 0 };
    const corners = [{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 0, y: 2 }, { x: 2, y: 2 }];
    const getCell = (x: number, y: number) => {
      if (x === 0 && y === 0) return 1; // front
      if (x === 0 && y === 2) return 1; // back
      if (x === 2 && y === 2) return 1; // back
      return 0;
    };
    expect(evaluateTSpin(piece, getCell, 10, 20, corners, 0)).toBe('mini');
  });

  it('should promote to normal T-Spin if kick index is 4 (Kick 5)', () => {
    const piece: Piece = { type: 'T', x: 0, y: 0, rotation: 0, blocks: [], color: 0 };
    const corners = [{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 0, y: 2 }, { x: 2, y: 2 }];
    const getCell = (x: number, y: number) => {
      if (x === 0 && y === 0) return 1; // front
      if (x === 0 && y === 2) return 1; // back
      if (x === 2 && y === 2) return 1; // back
      return 0;
    };
    expect(evaluateTSpin(piece, getCell, 10, 20, corners, 4)).toBe('normal');
  });

  it('should return none if less than 3 corners occupied', () => {
    const piece: Piece = { type: 'T', x: 0, y: 0, rotation: 0, blocks: [], color: 0 };
    const corners = [{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 0, y: 2 }, { x: 2, y: 2 }];
    const getCell = (x: number, y: number) => {
      if (x === 0 && y === 0) return 1;
      if (x === 2 && y === 0) return 1;
      return 0;
    };
    expect(evaluateTSpin(piece, getCell, 10, 20, corners, 0)).toBe('none');
  });

  it('should treat walls and floor as occupied corners', () => {
    const piece: Piece = { type: 'T', x: -1, y: 19, rotation: 0, blocks: [], color: 0 };
    // x = -1 is out of bounds (left wall), y = 19 is near floor, y = 21 is below floor
    const corners = [{ x: -1, y: 19 }, { x: 1, y: 19 }, { x: -1, y: 21 }, { x: 1, y: 21 }];
    const getCell = (_x: number, _y: number) => {
      // Empty playfield
      return 0;
    };
    // Corners 0 (-1, 19) is out of bounds -> occupied
    // Corners 2 (-1, 21) is out of bounds -> occupied
    // Corners 3 (1, 21) is out of bounds -> occupied
    // 3 corners occupied out of bounds = T-Spin
    // Because corners 0 is front and 2, 3 are back, only 1 front corner is occupied.
    // Result should be mini.
    expect(evaluateTSpin(piece, getCell, 10, 20, corners, 0)).toBe('mini');
  });

  it('should map front corners correctly across all 4 orientations', () => {
    const getCell = (_x: number, _y: number) => {
      // Assume all corners occupied for this test, we are just testing if it correctly identifies them as normal
      // meaning front corners > 2 must be true if all are occupied.
      return 1;
    };
    const corners = [{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 0, y: 2 }, { x: 2, y: 2 }];

    // R0
    expect(evaluateTSpin({ type: 'T', x: 0, y: 0, rotation: 0, blocks: [], color: 0 }, getCell, 10, 20, corners, 0)).toBe('normal');
    // R1
    expect(evaluateTSpin({ type: 'T', x: 0, y: 0, rotation: 1, blocks: [], color: 0 }, getCell, 10, 20, corners, 0)).toBe('normal');
    // R2
    expect(evaluateTSpin({ type: 'T', x: 0, y: 0, rotation: 2, blocks: [], color: 0 }, getCell, 10, 20, corners, 0)).toBe('normal');
    // R3
    expect(evaluateTSpin({ type: 'T', x: 0, y: 0, rotation: 3, blocks: [], color: 0 }, getCell, 10, 20, corners, 0)).toBe('normal');
  });

});
