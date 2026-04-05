import { Piece, PieceGenerator } from './game/pieces.js';
import { rotatePieceBlocks, getWallKicks } from './game/rotation.js';
import { CollisionDetector } from './game/collision.js';
import { ScoringSystem, ScoreEvent, HighScoreManager } from './game/scoring.js';
import { clearFullLines, isPlayfieldEmpty } from './game/lineUtils.js';
import { buildPlayfieldProjection } from './game/stateProjection.js';
import { WasmCore } from './wasm/WasmCore.js';
import type View from './viewWebGPU.js';

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
  isTSpinReady: boolean;
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
  // NEON BRICKLAYER: Verified Infinity Mechanics (15 resets)
  readonly maxLockResets: number = 25;

  // Visual Effects
  effectEvent: string | null = null;
  effectCounter: number = 0;
  lastDropPos: { x: number, y: number } | null = null;
  lastDropDistance: number = 0;
  scoreEvent: ScoreEvent | null = null;

  // T-Spin Tracking
  isTSpin: boolean = false;

  // Subsystems
  private pieceGenerator: PieceGenerator;
  private collisionDetector: CollisionDetector;
  scoringSystem: ScoringSystem;
  private projectedPlayfield: number[][] = [];

  // Bound methods to prevent per-frame garbage collection
  private boundGetCell: (x: number, y: number) => number;

  // Pre-allocated array for WASM collision checks to avoid GC
  private collisionCoordsCache: {x: number, y: number}[] = [
      {x: 0, y: 0}, {x: 0, y: 0}, {x: 0, y: 0}, {x: 0, y: 0}
  ];

  // Pre-allocated result object for update loop to avoid GC
  private _updateResult: { linesCleared: number[], locked: boolean, gameOver: boolean, tSpin: boolean } = {
      linesCleared: [], locked: false, gameOver: false, tSpin: false
  };

  // Pre-allocated temporary piece for rotation checks to avoid GC
  private _tempPiece: Piece = { blocks: [], x: 0, y: 0, rotation: 0, type: '' };
  private _tempBlocks: number[][] = [];

  // Pre-allocated corners for T-Spin checks to avoid GC
  private _tSpinCorners: { x: number, y: number }[] = [
      { x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }
  ];

  private _linesClearedCache: number[] = [];

  private _hardDropResult: { linesCleared: number[], locked: boolean, gameOver: boolean, tSpin: boolean } = {
      linesCleared: [], locked: false, gameOver: false, tSpin: false
  };

  private _gameStateCache: GameState = {
    score: 0,
    level: 1,
    lines: 0,
    nextPiece: { blocks: [], x: 0, y: 0, rotation: 0, type: '' },
    holdPiece: null,
    activePiece: { blocks: [], x: 0, y: 0, rotation: 0, type: '' },
    isGameOver: false,
    playfield: [],
    lockTimer: 0,
    lockDelayTime: 0,
    effectEvent: null,
    effectCounter: 0,
    lastDropPos: null,
    lastDropDistance: 0,
    scoreEvent: null,
    isTSpinReady: false
  };

  // NEW: View reference for reactive system hooks
  view: View | null = null;

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
    this.boundGetCell = this.getCell.bind(this);
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

  get combo(): number {
    return Math.max(0, this.scoringSystem.combo);
  }

  // Helper for TypedArray access
  getCell(x: number, y: number): number {
      if (x < 0 || x >= this.playfieldWidth || y < 0 || y >= this.playfieldHeight) return 0;
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

  getHighScoreManager(): HighScoreManager {
    return this.scoringSystem.getHighScoreManager();
  }

  saveHighScore(): boolean {
    return this.scoringSystem.saveHighScore();
  }

  // Set view reference for reactive events
  // ==================== REACTIVE EVENT HOOKS ====================
  private triggerLineClearReactive(linesCleared: number, combo: number, isTSpin: boolean, isAllClear: boolean): void {
    this.view?.onLineClearReactive?.(linesCleared, combo, isTSpin, isAllClear);
  }

  private triggerLevelUpReactive(newLevel: number): void {
    this.view?.onLevelUpReactive?.(newLevel);
  }

  private triggerTSpinReactive(type: 'normal' | 'mini'): void {
    this.view?.onTSpinReactive?.(type);
  }

  getState(): GameState {
    const playfield2D = buildPlayfieldProjection({
      playfieldWidth: this.playfieldWidth,
      playfieldHeight: this.playfieldHeight,
      getCell: this.boundGetCell,
      isGameOver: this.gameOver,
      activePiece: this.activPiece,
      ghostY: this.gameOver ? this.activPiece.y : this.getGhostY(),
      targetArray: this.projectedPlayfield
    });

    this._gameStateCache.score = this.score;
    this._gameStateCache.level = this.level;
    this._gameStateCache.lines = this.lines;
    this._gameStateCache.nextPiece = this.nextPiece;
    this._gameStateCache.holdPiece = this.holdPieceObj;
    this._gameStateCache.activePiece = this.activPiece;
    this._gameStateCache.isGameOver = this.gameOver;
    this._gameStateCache.playfield = playfield2D;
    this._gameStateCache.lockTimer = this.lockTimer;
    this._gameStateCache.lockDelayTime = this.lockDelayTime;
    this._gameStateCache.effectEvent = this.effectEvent;
    this._gameStateCache.effectCounter = this.effectCounter;
    this._gameStateCache.lastDropPos = this.lastDropPos;
    this._gameStateCache.lastDropDistance = this.lastDropDistance;
    this._gameStateCache.scoreEvent = this.scoreEvent;
    this._gameStateCache.isTSpinReady = this.isTSpin && this.activPiece?.type === 'T';

    return this._gameStateCache;
  }

  getGhostY(): number {
    return this.collisionDetector.getGhostY(this.activPiece);
  }

  hardDrop(): { linesCleared: number[], locked: boolean, gameOver: boolean, tSpin: boolean } {
    this._hardDropResult.linesCleared.length = 0;
    this._hardDropResult.locked = false;
    this._hardDropResult.gameOver = false;
    this._hardDropResult.tSpin = false;

    // Check if hard drop moves the piece
    const ghostY = this.getGhostY();
    if (this.activPiece.y !== ghostY) {
        // Movement invalidates T-Spin
        this.isTSpin = false;
    }

    const distance = ghostY - this.activPiece.y;
    this.activPiece.y = ghostY;

    // Trigger visual effect
    // NEON BRICKLAYER: Trigger Hard Drop Shockwave (Juice) - Params tuned in View
    this.effectEvent = 'hardDrop';
    this.effectCounter++;

    // Reuse existing object if possible to prevent GC
    if (!this.lastDropPos) {
        this.lastDropPos = { x: this.activPiece.x, y: this.activPiece.y };
    } else {
        this.lastDropPos.x = this.activPiece.x;
        this.lastDropPos.y = this.activPiece.y;
    }
    this.lastDropDistance = distance;

    // Force lock
    this.lockPiece();
    this._hardDropResult.locked = true;

    // Capture T-Spin state before updatePieces resets everything
    const wasTSpin = this.isTSpin;

    const linesScore = this.clearLine();
    if (linesScore.length > 0) {
        const isAllClear = this.isPlayfieldEmpty();
        this.scoreEvent = this.scoringSystem.updateScore(linesScore.length, wasTSpin, isAllClear);
        this._hardDropResult.linesCleared.length = 0;
        for (let i = 0; i < linesScore.length; i++) {
            this._hardDropResult.linesCleared.push(linesScore[i]);
        }
        this._hardDropResult.tSpin = wasTSpin;
        // Trigger reactive event for line clear
        this.triggerLineClearReactive(linesScore.length, this.combo, wasTSpin, isAllClear);
        if (wasTSpin) this.triggerTSpinReactive('normal');
        if (isAllClear) this.view?.onPerfectClearReactive?.();
    } else {
        this.scoringSystem.resetCombo(); // Reset combo if no lines cleared
        this.scoreEvent = null;
    }

    this.updatePieces();
    if (this.gameOver) this._hardDropResult.gameOver = true;

    return this._hardDropResult;
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

    this.activPiece = this.createPiece();
    this.nextPiece = this.createPiece();
  }

  // Called every frame
  update(dt: number): { linesCleared: number[], locked: boolean, gameOver: boolean, tSpin: boolean } {
      this._updateResult.linesCleared.length = 0;
      this._updateResult.locked = false;
      this._updateResult.gameOver = false;
      this._updateResult.tSpin = false;

      if (this.gameOver) return this._updateResult;

      // Check if piece is on the ground
      this.activPiece.y += 1;
      const onGround = this.hasCollision();
      this.activPiece.y -= 1;

      if (onGround) {
          // dt is in milliseconds
          this.lockTimer += dt;
          if (this.lockTimer > this.lockDelayTime) {
              this.effectCounter++; // Increment visual counter for locking (gravity)
              this.lockPiece();
              this._updateResult.locked = true;

              const wasTSpin = this.isTSpin;

              const linesScore = this.clearLine();
              if (linesScore.length > 0) {
                  const isAllClear = this.isPlayfieldEmpty();
                  const previousLevel = this.level;
                  this.scoreEvent = this.scoringSystem.updateScore(linesScore.length, wasTSpin, isAllClear);
                  this._updateResult.linesCleared.length = 0;
                  for (let i = 0; i < linesScore.length; i++) {
                      this._updateResult.linesCleared.push(linesScore[i]);
                  }
                  this._updateResult.tSpin = wasTSpin;
                  // Trigger reactive event for line clear
                  this.triggerLineClearReactive(linesScore.length, this.combo, wasTSpin, isAllClear);
                  if (wasTSpin) this.view?.onTSpinReactive?.();
                  // Check for level up and trigger reactive event
                  if (this.level > previousLevel) {
                      this.triggerLevelUpReactive(this.level);
                  }
              } else {
                  this.scoringSystem.resetCombo();
                  this.scoreEvent = null;
              }

              this.updatePieces();
              if (this.gameOver) this._updateResult.gameOver = true;
          }
      } else {
          this.lockTimer = 0;
      }
      return this._updateResult;
  }

  movePieceLeft(): void {
    this.activPiece.x -= 1;
    if (this.hasCollision()) {
      this.activPiece.x += 1;
    } else {
        this.isTSpin = false; // Reset T-Spin on move
        this.handleMoveReset();
    }
  }

  movePieceRight(): void {
    this.activPiece.x += 1;
    if (this.hasCollision()) {
      this.activPiece.x -= 1;
    } else {
        this.isTSpin = false; // Reset T-Spin on move
        this.handleMoveReset();
    }
  }

  movePieceDown(): void {
    this.activPiece.y += 1;
    if (this.hasCollision()) {
      this.activPiece.y -= 1;
    } else {
        this.isTSpin = false; // Reset T-Spin on move
        this.lockTimer = 0;
    }
  }

  dropPiece(): void {
    const ghostY = this.getGhostY();
    const moved = this.activPiece.y !== ghostY;
    this.activPiece.y = ghostY;
    if (moved) this.isTSpin = false;

    this.lockPiece();
    const linesScore = this.clearLine();
    if (linesScore.length > 0) {
      // Correctly pass tSpin status captured before lock
      const isAllClear = this.isPlayfieldEmpty();
      this.scoreEvent = this.scoringSystem.updateScore(linesScore.length, this.isTSpin, isAllClear);
    } else {
      this.scoringSystem.resetCombo();
      this.scoreEvent = null;
    }
    this.updatePieces();
  }

  private isPlayfieldEmpty(): boolean {
      return isPlayfieldEmpty(this.playfield);
  }

  checkTSpin(): void {
      if (this.activPiece.type !== 'T') {
          this.isTSpin = false;
          return;
      }

      // Check 4 corners of the 3x3 box
      // Relative to piece X,Y: (0,0), (2,0), (0,2), (2,2)
      // Standard T-piece spawns/rotates within a 3x3 grid.
      // 3 of 4 corners must be occupied (block or wall/floor).

      const px = this.activPiece.x;
      const py = this.activPiece.y;

      // Use pre-allocated array to avoid GC
      this._tSpinCorners[0].x = px;     this._tSpinCorners[0].y = py;
      this._tSpinCorners[1].x = px + 2; this._tSpinCorners[1].y = py;
      this._tSpinCorners[2].x = px;     this._tSpinCorners[2].y = py + 2;
      this._tSpinCorners[3].x = px + 2; this._tSpinCorners[3].y = py + 2;

      let occupied = 0;
      for (let i = 0; i < 4; i++) {
          const c = this._tSpinCorners[i];
          // Check if out of bounds or occupied
          if (c.x < 0 || c.x >= this.playfieldWidth || c.y >= this.playfieldHeight) {
              occupied++;
          } else if (c.y >= 0) { // If valid Y inside grid
              if (this.getCell(c.x, c.y) !== 0) {
                  occupied++;
              }
          }
          // Note: Standard SRS T-Spin rules usually don't count the space *above* the board as occupied wall,
          // but we treat x < 0 and x >= width as walls.
      }

      this.isTSpin = (occupied >= 3);
  }

  rotatePiece(rightRurn: boolean = true): void {
    const blocks = this.activPiece.blocks;
    const type = this.activPiece.type;
    const currentRotation = this.activPiece.rotation;
    let nextRotation = rightRurn ? (currentRotation + 1) % 4 : (currentRotation + 3) % 4;

    if (type === 'O') return;

    // Use temp piece for testing rotation to avoid mutation
    // Replace Object.assign with explicit assignments to avoid GC overhead
    this._tempPiece.x = this.activPiece.x;
    this._tempPiece.y = this.activPiece.y;
    this._tempPiece.type = this.activPiece.type;
    // getBounds isn't strictly needed for the temp piece if hasCollisionPiece uses fallback
    // or WASM uses exact blocks array. We copy the exact blocks anyway.
    this._tempPiece.blocks = rotatePieceBlocks(blocks, rightRurn, this._tempBlocks);
    this._tempPiece.rotation = nextRotation;

    if (!this.hasCollisionPiece(this._tempPiece)) {
      // Create a copy of the blocks array for the active piece, because _tempBlocks will be overwritten in the next rotation
      this.activPiece.blocks = this._tempPiece.blocks.map(row => [...row]);
      this.activPiece.rotation = this._tempPiece.rotation;
      this.handleMoveReset();
      this.checkTSpin(); // Check T-Spin after rotation
      // Trigger T-Spin reactive if detected
      if (this.isTSpin && this.activPiece.type === 'T') {
        this.triggerTSpinReactive('normal');
      }
      return;
    }

    // Wall Kicks
    const kicks = getWallKicks(type, currentRotation, nextRotation);
    if (!kicks || kicks.length === 0) return;

    for (const [ox, oy] of kicks) {
        this._tempPiece.x = this.activPiece.x + ox;
        this._tempPiece.y = this.activPiece.y + oy;

        if (!this.hasCollisionPiece(this._tempPiece)) {
            // Apply successful kick
            this.activPiece.x = this._tempPiece.x;
            this.activPiece.y = this._tempPiece.y;
            // Create a copy of the blocks array for the active piece, because _tempBlocks will be overwritten in the next rotation
            this.activPiece.blocks = this._tempPiece.blocks.map(row => [...row]);
            this.activPiece.rotation = this._tempPiece.rotation;
            this.handleMoveReset();
            this.checkTSpin(); // Check T-Spin after kick
            // Trigger T-Spin reactive if detected
            if (this.isTSpin && this.activPiece.type === 'T') {
              this.triggerTSpinReactive('normal');
            }
            return;
        }
    }
  }

  handleMoveReset(): void {
      this.activPiece.y += 1;
      const onGround = this.hasCollision();
      this.activPiece.y -= 1;

      // Coyote time: if we move off the ground, lock timer pauses/resets
      // If we move on the ground, lock timer resets (extended placement)
      if (onGround) {
          if (this.lockResets < this.maxLockResets) {
              this.lockTimer = 0;
              this.lockResets++;
          }
      } else {
          // Moved off the edge, reset lock timer entirely (coyote time)
          this.lockTimer = 0;
          this.lockResets = 0; // Treat the piece as entirely fresh
      }
  }

  hasCollision(): boolean {
    return this.collisionDetector.hasCollision(this.activPiece);
  }

  hasCollisionPiece(piece: Piece): boolean {
    // --- WASM ACCELERATION ---
    let count = 0;
    
    const blocks = piece.blocks;
    for (let r = 0; r < blocks.length; r++) {
        for (let c = 0; c < blocks[r].length; c++) {
            if (blocks[r][c] !== 0) {
                if (count < 4) {
                    this.collisionCoordsCache[count].x = c;
                    this.collisionCoordsCache[count].y = r;
                }
                count++;
            }
        }
    }
    
    // Only use WASM for standard tetrominoes (4 blocks)
    if (count === 4) {
        try {
            return WasmCore.get().checkCollision(this.collisionCoordsCache, piece.x, piece.y);
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

    if (this.hasCollision()) {
        this.gameOver = true;
        // NEW: Trigger reactive game over
        if (this.view) {
            this.view.onGameOverReactive();
        }
    }
  }

  clearLine(): number[] {
    const linesCleared = clearFullLines(
      this.playfield,
      this.playfieldWidth,
      this.playfieldHeight,
      this.boundGetCell,
      this._linesClearedCache
    );
    if (linesCleared.length > 0) {
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
  }
}
