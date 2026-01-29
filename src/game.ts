import { Piece, PieceGenerator } from './game/pieces.js';
import { rotatePieceBlocks, getWallKicks } from './game/rotation.js';
import { CollisionDetector } from './game/collision.js';
import { ScoringSystem } from './game/scoring.js';
import { WasmCore } from './wasm/WasmCore.js';

export interface GameState {
  score: number;
  level: number;
  lines: number;
  nextPiece: Piece;
  holdPiece: Piece | null;
  activePiece: Piece;
  isGameOver: boolean;
  playfield: number[][]; // View still expects 2D array for now
  lockTimer: number;
  lockDelayTime: number;
  effectEvent: string | null;
  effectCounter: number;
  isTSpin: boolean;
  isMini: boolean;
}

export default class Game {
  gameOver!: boolean;
  playfield!: Int8Array; // Optimized
  readonly playfieldWidth = 10;
  readonly playfieldHeight = 20;

  activPiece!: Piece;
  nextPiece!: Piece;
  holdPieceObj: Piece | null = null;
  canHold: boolean = true;

  // Lock Delay
  lockTimer: number = 0;
  readonly lockDelayTime: number = 500; // ms

  // Extended Placement (Infinity-like behavior)
  lockResets: number = 0;
  readonly maxLockResets: number = 15;

  // Visual Effects
  effectEvent: string | null = null;
  effectCounter: number = 0;
  lastDropPos: { x: number, y: number } | null = null;

  // T-Spin State
  isTSpin: boolean = false;
  isMini: boolean = false;

  // Subsystems
  private pieceGenerator: PieceGenerator;
  private collisionDetector: CollisionDetector;
  private scoringSystem: ScoringSystem;

  constructor() {
    this.pieceGenerator = new PieceGenerator();
    // --- WASM INTEGRATION ---
    try {
        this.playfield = WasmCore.get().playfieldView;
        if (this.playfield.length !== this.playfieldWidth * this.playfieldHeight) {
            console.error("WASM Memory View mismatch");
            this.playfield = new Int8Array(this.playfieldWidth * this.playfieldHeight); // Fallback
        }
    } catch (e) {
        console.warn("WASM not loaded, using fallback memory");
        this.playfield = new Int8Array(this.playfieldWidth * this.playfieldHeight);
    }
    // ------------------------
    this.collisionDetector = new CollisionDetector(this.playfield);
    this.scoringSystem = new ScoringSystem();
    this.reset();
  }

  get score(): number {
    return this.scoringSystem.score;
  }

  get lines(): number {
    return this.scoringSystem.lines;
  }

  get level(): number {
    return this.scoringSystem.level;
  }

  // Helper for TypedArray access
  getCell(x: number, y: number): number {
      if (x < 0 || x >= this.playfieldWidth || y < 0 || y >= this.playfieldHeight) return 1; // Wall is filled
      return this.playfield[y * this.playfieldWidth + x];
  }

  setCell(x: number, y: number, value: number): void {
      if (x < 0 || x >= this.playfieldWidth || y < 0 || y >= this.playfieldHeight) return;
      this.playfield[y * this.playfieldWidth + x] = value;
  }

  // Helper to reset piece position based on its type
  resetPiecePosition(piece: Piece): void {
      this.pieceGenerator.resetPiecePosition(piece);
  }

  createPiece(): Piece {
    return this.pieceGenerator.createPiece();
  }

  getState(): GameState {
    // Reconstruct 2D array for View (could optimize view to use flat array later)
    // Exposed activePiece for shader effects
    const playfield2D: number[][] = [];
    for (let y = 0; y < this.playfieldHeight; y++) {
        const row = new Array(this.playfieldWidth);
        for (let x = 0; x < this.playfieldWidth; x++) {
            row[x] = this.getCell(x, y);
        }
        playfield2D.push(row);
    }

    if (!this.gameOver) {
        // 1. Draw Ghost Piece (ONCE)
        const ghostY = this.getGhostY();
        const { x: pieceX, blocks } = this.activPiece;

        // Draw Ghost (negative values)
        for (let y = 0; y < blocks.length; y++) {
            for (let x = 0; x < blocks[y].length; x++) {
                if (blocks[y][x]) {
                    const targetY = ghostY + y;
                    const targetX = pieceX + x;
                    if (targetY >= 0 && targetY < this.playfieldHeight &&
                        targetX >= 0 && targetX < this.playfieldWidth) {
                         if (playfield2D[targetY][targetX] === 0) {
                             playfield2D[targetY][targetX] = -blocks[y][x];
                         }
                    }
                }
            }
        }

        // 2. Draw Active Piece
        const { y: pY, x: pX } = this.activPiece; // Rename to avoid conflict
        for (let y = 0; y < blocks.length; y++) {
            for (let x = 0; x < blocks[y].length; x++) {
                if (blocks[y][x]) {
                     const targetY = pY + y;
                     const targetX = pX + x;
                     if (targetY >= 0 && targetY < this.playfieldHeight &&
                         targetX >= 0 && targetX < this.playfieldWidth) {
                            playfield2D[targetY][targetX] = blocks[y][x];
                     }
                }
            }
        }
    }

    return {
      score: this.score,
      level: this.level,
      lines: this.lines,
      nextPiece: this.nextPiece,
      holdPiece: this.holdPieceObj,
      activePiece: this.activPiece,
      isGameOver: this.gameOver,
      playfield: playfield2D,
      lockTimer: this.lockTimer,
      lockDelayTime: this.lockDelayTime,
      effectEvent: this.effectEvent,
      effectCounter: this.effectCounter,
      lastDropPos: this.lastDropPos,
      isTSpin: this.isTSpin,
      isMini: this.isMini
    }
  }

  getGhostY(): number {
    return this.collisionDetector.getGhostY(this.activPiece);
  }

  hardDrop(): { linesCleared: number[], locked: boolean, gameOver: boolean, tSpin: boolean, mini: boolean } {
    const result: { linesCleared: number[], locked: boolean, gameOver: boolean, tSpin: boolean, mini: boolean } = { linesCleared: [], locked: false, gameOver: false, tSpin: false, mini: false };
    const ghostY = this.getGhostY();
    this.activPiece.y = ghostY;

    // Hard drop maintains T-Spin status from last rotation
    // But moving technically resets it. However, Hard Drop is usually a move.
    // Standard rules: Hard drop does NOT reset T-Spin status if the last action was a rotation.
    // Since Hard Drop is instant locking, we just check `isTSpin` state.
    // However, hard drop changes Y, which is a move.
    // BUT, usually T-Spin is checked at the locking position.
    // If I rotated, then hard dropped, is it a T-Spin? Yes.
    // So I should NOT reset `isTSpin` here.

    // Trigger visual effect
    this.effectEvent = 'hardDrop';
    this.effectCounter++;
    this.lastDropPos = { x: this.activPiece.x, y: this.activPiece.y };

    // Force lock
    this.lockPiece();
    result.locked = true;
    result.tSpin = this.isTSpin;
    result.mini = this.isMini;

    const linesScore = this.clearLine();
    if (linesScore.length > 0) {
        this.scoringSystem.updateScore(linesScore.length, this.isTSpin, this.isMini);
        result.linesCleared = linesScore;
    }
    this.updatePieces();
    if (this.gameOver) result.gameOver = true;

    return result;
  }

  reset(): void {
    this.scoringSystem.reset();
    this.gameOver = false;
    this.playfield.fill(0); // Efficient clear
    this.collisionDetector.updatePlayfield(this.playfield);
    this.holdPieceObj = null;
    this.canHold = true;
    this.lockTimer = 0;
    this.isTSpin = false;
    this.isMini = false;

    this.activPiece = this.createPiece();
    this.nextPiece = this.createPiece();
  }

  // Called every frame
  update(dt: number): { linesCleared: number[], locked: boolean, gameOver: boolean, tSpin: boolean, mini: boolean } {
      const result: { linesCleared: number[], locked: boolean, gameOver: boolean, tSpin: boolean, mini: boolean } = { linesCleared: [], locked: false, gameOver: false, tSpin: false, mini: false };
      if (this.gameOver) return result;

      // Check if piece is on the ground
      this.activPiece.y += 1;
      const onGround = this.hasCollision();
      this.activPiece.y -= 1;

      if (onGround) {
          // dt is in milliseconds (from Controller) or seconds?
          // Controller passes (time - lastTime) which is ms.
          // lockDelayTime is 500ms.
          this.lockTimer += dt;
          if (this.lockTimer > this.lockDelayTime) {
              this.lastDropPos = { x: this.activPiece.x, y: this.activPiece.y };
              this.lockPiece();
              result.locked = true;
              result.tSpin = this.isTSpin;
              result.mini = this.isMini;

              const linesScore = this.clearLine();
              if (linesScore.length > 0) {
                  this.scoringSystem.updateScore(linesScore.length, this.isTSpin, this.isMini);
                  result.linesCleared = linesScore;
              }
              this.updatePieces();
              if (this.gameOver) result.gameOver = true;
          }
      } else {
          this.lockTimer = 0;
      }
      return result;
  }

  movePieceLeft(): void {
    this.activPiece.x -= 1;
    if (this.hasCollision()) {
      this.activPiece.x += 1;
    } else {
        this.isTSpin = false; // Reset T-Spin on move
        this.isMini = false;
        this.handleMoveReset();
    }
  }

  movePieceRight(): void {
    this.activPiece.x += 1;
    if (this.hasCollision()) {
      this.activPiece.x -= 1;
    } else {
        this.isTSpin = false; // Reset T-Spin on move
        this.isMini = false;
        this.handleMoveReset();
    }
  }

  movePieceDown(): void {
    this.activPiece.y += 1;
    if (this.hasCollision()) {
      this.activPiece.y -= 1;
    } else {
        this.isTSpin = false; // Reset T-Spin on move
        this.isMini = false;
        this.lockTimer = 0;
    }
  }

  dropPiece(): void {
      // Soft drop instant? Or hard drop?
      // Assuming this is used for some legacy drop logic, but hardDrop is separate.
      // Let's keep it but use hardDrop logic if intent is instant.
      // But usually 'dropPiece' means 'Soft Drop all the way'?
    while (true) {
      this.activPiece.y += 1;
      if (this.hasCollision()) {
        this.activPiece.y -= 1;
        break;
      }
    }
    // Soft drop resets T-Spin
    this.isTSpin = false;
    this.isMini = false;

    this.lockPiece();
    const linesScore = this.clearLine();
    if (linesScore.length > 0) {
      this.scoringSystem.updateScore(linesScore.length, false, false);
    }
    this.updatePieces();
  }

  checkTSpin(piece: Piece, kickIndex: number): void {
      if (piece.type !== 'T') {
          this.isTSpin = false;
          this.isMini = false;
          return;
      }

      // 3-corner rule
      // Check the 4 corners of the bounding box (0,0), (2,0), (0,2), (2,2)
      // Relative to piece.x, piece.y
      const corners = [
          {x: 0, y: 0}, {x: 2, y: 0},
          {x: 0, y: 2}, {x: 2, y: 2}
      ];

      let occupied = 0;
      // Front corners depend on rotation? No, just check all 4 corners.
      // If >= 3 corners are occupied (wall or block), it's a T-Spin.

      for (const c of corners) {
          const wx = piece.x + c.x;
          const wy = piece.y + c.y;
          if (this.getCell(wx, wy) !== 0) {
              occupied++;
          }
      }

      if (occupied >= 3) {
          this.isTSpin = true;
          // Mini detection is complex (SRS specific), but simplified:
          // If the 5th kick (index 4) was used, it's a T-Spin Triple (not Mini).
          // If T-Spin and lines cleared... wait, we don't know lines cleared yet.
          // Usually T-Spin Mini is if front corners are not both occupied (or something like that).
          // Simplified: Wall kick usage.
          // For now, let's treat all as full T-Spin unless simplified Mini rule applies.
          this.isMini = false; // Implement proper Mini logic if needed, but standard T-Spin is good for now.
      } else {
          this.isTSpin = false;
          this.isMini = false;
      }
  }

  rotatePiece(rightRurn: boolean = true): void {
    const blocks = this.activPiece.blocks;
    const type = this.activPiece.type;
    const currentRotation = this.activPiece.rotation;
    let nextRotation = rightRurn ? (currentRotation + 1) % 4 : (currentRotation + 3) % 4;

    if (type === 'O') return;

    // Use temp piece for testing rotation to avoid mutation
    const tempPiece = { ...this.activPiece }; // shallow clone
    tempPiece.blocks = rotatePieceBlocks(blocks, rightRurn);
    tempPiece.rotation = nextRotation;

    if (!this.hasCollisionPiece(tempPiece)) {
      this.activPiece.blocks = tempPiece.blocks;
      this.activPiece.rotation = tempPiece.rotation;
      this.handleMoveReset();
      // Basic rotation (kick index -1 or 0 depending on impl, let's say 0)
      this.checkTSpin(this.activPiece, 0);
      return;
    }

    // Wall Kicks
    const kicks = getWallKicks(type, currentRotation, nextRotation);
    if (!kicks || kicks.length === 0) return;

    for (let i = 0; i < kicks.length; i++) {
        const [ox, oy] = kicks[i];
        tempPiece.x = this.activPiece.x + ox;
        tempPiece.y = this.activPiece.y + oy;

        if (!this.hasCollisionPiece(tempPiece)) {
            // Apply successful kick
            this.activPiece.x = tempPiece.x;
            this.activPiece.y = tempPiece.y;
            this.activPiece.blocks = tempPiece.blocks;
            this.activPiece.rotation = tempPiece.rotation;
            this.handleMoveReset();
            this.checkTSpin(this.activPiece, i);
            return;
        }
    }
  }

  handleMoveReset(): void {
      this.activPiece.y += 1;
      const onGround = this.hasCollision();
      this.activPiece.y -= 1;

      if (onGround) {
          if (this.lockResets < this.maxLockResets) {
              this.lockTimer = 0;
              this.lockResets++;
          }
      }
  }

  hasCollision(): boolean {
    return this.collisionDetector.hasCollision(this.activPiece);
  }

  hasCollisionPiece(piece: Piece): boolean {
    // --- WASM ACCELERATION ---
    const coords: {x: number, y: number}[] = [];
    let count = 0;
    
    const blocks = piece.blocks;
    for (let r = 0; r < blocks.length; r++) {
        for (let c = 0; c < blocks[r].length; c++) {
            if (blocks[r][c] !== 0) {
                coords.push({x: c, y: r});
                count++;
            }
        }
    }
    
    // Only use WASM for standard tetrominoes (4 blocks)
    if (count === 4) {
        try {
            return WasmCore.get().checkCollision(coords, piece.x, piece.y);
        } catch (e) {
            // WASM not available or failed, fallback to JS
            return this.collisionDetector.hasCollision(piece);
        }
    }
    
    // Fallback for non-standard pieces
    return this.collisionDetector.hasCollision(piece);
  }

  lockPiece(): void {
    const { y: pieceY, x: pieceX, blocks } = this.activPiece;

    for (let y = 0; y < blocks.length; y++) {
      for (let x = 0; x < blocks[y].length; x++) {
        if (blocks[y][x]) {
            if (pieceY + y < 0) {
                this.gameOver = true;
                return;
            }
            this.setCell(pieceX + x, pieceY + y, blocks[y][x]);
        }
      }
    }
  }

  updatePieces(): void {
    this.activPiece = this.nextPiece;
    this.nextPiece = this.createPiece();
    this.canHold = true;
    this.lockTimer = 0;
    this.lockResets = 0;
    this.isTSpin = false;
    this.isMini = false;

    if (this.hasCollision()) {
        this.gameOver = true;
    }
  }

  clearLine(): number[] {
    // Optimized line clearing for flat array
    const linesCleared: number[] = [];
    const width = this.playfieldWidth;
    const height = this.playfieldHeight;

    // Check lines from top to bottom
    for (let y = 0; y < height; y++) {
        let full = true;
        for (let x = 0; x < width; x++) {
            if (this.getCell(x, y) === 0) {
                full = false;
                break;
            }
        }
        if (full) {
            linesCleared.push(y);
        }
    }

    if (linesCleared.length > 0) {
        // Remove lines
        // We can do this in place or by shifting
        // Easier to reconstruct: Iterate from bottom up, copying rows that aren't cleared
        const newPlayfield = new Int8Array(width * height);
        let targetY = height - 1;

        for (let y = height - 1; y >= 0; y--) {
            if (!linesCleared.includes(y)) {
                // Copy row y to targetY
                const start = y * width;
                const end = start + width;
                // TypedArray.set or just loop
                for(let k=0; k<width; k++) {
                    newPlayfield[targetY * width + k] = this.playfield[start + k];
                }
                targetY--;
            }
        }
        // Fill remaining top rows with 0 (already 0 by default)
        // Write back to shared memory view to preserve WASM linkage
        this.playfield.set(newPlayfield);
        this.collisionDetector.updatePlayfield(this.playfield);
    }

    return linesCleared;
  }

  hold(): void {
      if (!this.canHold) return;

      if (!this.holdPieceObj) {
          this.holdPieceObj = this.activPiece;
          this.activPiece = this.nextPiece;
          this.nextPiece = this.createPiece();
      } else {
          const temp = this.activPiece;
          this.activPiece = this.holdPieceObj;
          this.holdPieceObj = temp;
      }

      this.resetPiecePosition(this.activPiece);
      this.resetPiecePosition(this.holdPieceObj); // Fixed: Reset held piece too
      this.canHold = false;
      this.lockTimer = 0;
      this.lockResets = 0;
      this.isTSpin = false;
      this.isMini = false;
  }
}
