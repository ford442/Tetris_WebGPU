import { Piece, PieceGenerator } from './game/pieces.js';
import { rotatePieceBlocks, getWallKicks } from './game/rotation.js';
import { CollisionDetector } from './game/collision.js';
import { ScoringSystem, ScoreEvent } from './game/scoring.js';
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
  lastDropPos: { x: number, y: number } | null;
  lastDropDistance: number;
  scoreEvent: ScoreEvent | null;
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
  readonly lockDelayTime: number = 500; // ms (Standard: 500)

  // Extended Placement (Infinity-like behavior)
  lockResets: number = 0;
  readonly maxLockResets: number = 15;

  // Visual Effects
  effectEvent: string | null = null;
  effectCounter: number = 0;
  lastDropPos: { x: number, y: number } | null = null;
  lastDropDistance: number = 0;
  scoreEvent: ScoreEvent | null = null;

  // T-Spin State
  isTSpin: boolean = false;
  isMini: boolean = false;

  // Subsystems
  private pieceGenerator: PieceGenerator;
  private collisionDetector: CollisionDetector;
  private scoringSystem: ScoringSystem;

  constructor() {
    this.pieceGenerator = new PieceGenerator();
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

  getCell(x: number, y: number): number {
      if (x < 0 || x >= this.playfieldWidth || y < 0 || y >= this.playfieldHeight) return 1;
      return this.playfield[y * this.playfieldWidth + x];
  }

  setCell(x: number, y: number, value: number): void {
      if (x < 0 || x >= this.playfieldWidth || y < 0 || y >= this.playfieldHeight) return;
      this.playfield[y * this.playfieldWidth + x] = value;
  }

  resetPiecePosition(piece: Piece): void {
      this.pieceGenerator.resetPiecePosition(piece);
  }

  createPiece(): Piece {
    return this.pieceGenerator.createPiece();
  }

  getState(): GameState {
    const playfield2D: number[][] = [];
    for (let y = 0; y < this.playfieldHeight; y++) {
        const row = new Array(this.playfieldWidth);
        for (let x = 0; x < this.playfieldWidth; x++) {
            row[x] = this.getCell(x, y);
        }
        playfield2D.push(row);
    }

    if (!this.gameOver) {
        const ghostY = this.getGhostY();
        const { x: pieceX, blocks } = this.activPiece;

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

        const { y: pY, x: pX } = this.activPiece;
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
      lastDropDistance: this.lastDropDistance,
      scoreEvent: this.scoreEvent,
      isTSpin: this.isTSpin,
      isMini: this.isMini
    }
  }

  getGhostY(): number {
    return this.collisionDetector.getGhostY(this.activPiece);
  }

  isPlayfieldEmpty(): boolean {
    for (let i = 0; i < this.playfield.length; i++) {
        if (this.playfield[i] !== 0) return false;
    }
    return true;
  }

  hardDrop(): { linesCleared: number[], locked: boolean, gameOver: boolean, tSpin: boolean, mini: boolean, isAllClear: boolean } {
    const result: { linesCleared: number[], locked: boolean, gameOver: boolean, tSpin: boolean, mini: boolean, isAllClear: boolean } = { linesCleared: [], locked: false, gameOver: false, tSpin: false, mini: false, isAllClear: false };
    const ghostY = this.getGhostY();
    if (this.activPiece.y !== ghostY) {
        this.isTSpin = false;
    }

    const distance = ghostY - this.activPiece.y;
    this.activPiece.y = ghostY;

    this.effectEvent = 'hardDrop';
    this.effectCounter++;
    this.lastDropPos = { x: this.activPiece.x, y: this.activPiece.y };
    this.lastDropDistance = distance;

    this.lockPiece();
    result.locked = true;
    result.tSpin = this.isTSpin;
    result.mini = this.isMini;

    const wasTSpin = this.isTSpin;
    const linesScore = this.clearLine();
    if (linesScore.length > 0) {
        if (this.isPlayfieldEmpty()) result.isAllClear = true;
        this.scoreEvent = this.scoringSystem.updateScore(linesScore.length, wasTSpin, result.isAllClear);
        result.linesCleared = linesScore;
        result.tSpin = wasTSpin;
    } else {
        this.scoringSystem.resetCombo();
        this.scoreEvent = null;
    }

    this.updatePieces();
    if (this.gameOver) result.gameOver = true;

    return result;
  }

  reset(): void {
    this.scoringSystem.reset();
    this.gameOver = false;
    this.playfield.fill(0);
    this.collisionDetector.updatePlayfield(this.playfield);
    this.holdPieceObj = null;
    this.canHold = true;
    this.lockTimer = 0;
    this.isTSpin = false;
    this.isMini = false;

    this.activPiece = this.createPiece();
    this.nextPiece = this.createPiece();
  }

  update(dt: number): { linesCleared: number[], locked: boolean, gameOver: boolean, tSpin: boolean, mini: boolean, isAllClear: boolean } {
      const result: { linesCleared: number[], locked: boolean, gameOver: boolean, tSpin: boolean, mini: boolean, isAllClear: boolean } = { linesCleared: [], locked: false, gameOver: false, tSpin: false, mini: false, isAllClear: false };
      if (this.gameOver) return result;

      this.activPiece.y += 1;
      const onGround = this.hasCollision();
      this.activPiece.y -= 1;

      if (onGround) {
          this.lockTimer += dt;
          if (this.lockTimer > this.lockDelayTime) {
              this.lastDropPos = { x: this.activPiece.x, y: this.activPiece.y };
              this.lockPiece();
              result.locked = true;
              result.tSpin = this.isTSpin;
              result.mini = this.isMini;

              const wasTSpin = this.isTSpin;
              const linesScore = this.clearLine();
              if (linesScore.length > 0) {
                  if (this.isPlayfieldEmpty()) result.isAllClear = true;
                  this.scoreEvent = this.scoringSystem.updateScore(linesScore.length, wasTSpin, result.isAllClear);
                  result.linesCleared = linesScore;
                  result.tSpin = wasTSpin;
              } else {
                  this.scoringSystem.resetCombo();
                  this.scoreEvent = null;
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
        this.isTSpin = false;
        this.isMini = false;
        this.handleMoveReset();
    }
  }

  movePieceRight(): void {
    this.activPiece.x += 1;
    if (this.hasCollision()) {
      this.activPiece.x -= 1;
    } else {
        this.isTSpin = false;
        this.isMini = false;
        this.handleMoveReset();
    }
  }

  movePieceDown(): void {
    this.activPiece.y += 1;
    if (this.hasCollision()) {
      this.activPiece.y -= 1;
    } else {
        this.isTSpin = false;
        this.isMini = false;
        this.lockTimer = 0;
    }
  }

  dropPiece(): void {
    let moved = false;
    while (true) {
      this.activPiece.y += 1;
      if (this.hasCollision()) {
        this.activPiece.y -= 1;
        break;
      }
      moved = true;
    }
    this.isTSpin = false;
    this.isMini = false;

    this.lockPiece();
    const linesScore = this.clearLine();
    if (linesScore.length > 0) {
      this.scoreEvent = this.scoringSystem.updateScore(linesScore.length, false, false);
    } else {
      this.scoringSystem.resetCombo();
      this.scoreEvent = null;
    }
    this.updatePieces();
  }

  checkTSpin(piece: Piece, kickIndex: number): void {
      if (piece.type !== 'T') {
          this.isTSpin = false;
          this.isMini = false;
          return;
      }

      const corners = [
          {x: 0, y: 0}, {x: 2, y: 0},
          {x: 0, y: 2}, {x: 2, y: 2}
      ];

      let occupied = 0;
      for (const c of corners) {
          const wx = piece.x + c.x;
          const wy = piece.y + c.y;
          if (this.getCell(wx, wy) !== 0) {
              occupied++;
          }
      }

      if (occupied >= 3) {
          this.isTSpin = true;
          this.isMini = false;
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

    const tempPiece = { ...this.activPiece };
    tempPiece.blocks = rotatePieceBlocks(blocks, rightRurn);
    tempPiece.rotation = nextRotation;

    if (!this.hasCollisionPiece(tempPiece)) {
      this.activPiece.blocks = tempPiece.blocks;
      this.activPiece.rotation = tempPiece.rotation;
      this.handleMoveReset();
      this.checkTSpin(this.activPiece, 0);
      return;
    }

    const kicks = getWallKicks(type, currentRotation, nextRotation);
    if (!kicks || kicks.length === 0) return;

    for (let i = 0; i < kicks.length; i++) {
        const [ox, oy] = kicks[i];
        tempPiece.x = this.activPiece.x + ox;
        tempPiece.y = this.activPiece.y + oy;

        if (!this.hasCollisionPiece(tempPiece)) {
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
    
    if (count === 4) {
        try {
            return WasmCore.get().checkCollision(coords, piece.x, piece.y);
        } catch (e) {
            return this.collisionDetector.hasCollision(piece);
        }
    }
    
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
    const linesCleared: number[] = [];
    const width = this.playfieldWidth;
    const height = this.playfieldHeight;

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
        const newPlayfield = new Int8Array(width * height);
        let targetY = height - 1;

        for (let y = height - 1; y >= 0; y--) {
            if (!linesCleared.includes(y)) {
                for(let k=0; k<width; k++) {
                    newPlayfield[targetY * width + k] = this.playfield[y * width + k];
                }
                targetY--;
            }
        }
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
      this.resetPiecePosition(this.holdPieceObj);
      this.canHold = false;
      this.lockTimer = 0;
      this.lockResets = 0;
      this.isTSpin = false;
      this.isMini = false;
  }
}