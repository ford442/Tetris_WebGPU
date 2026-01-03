import { Piece, PieceGenerator } from './game/pieces.js';
import { rotatePieceBlocks, getWallKicks } from './game/rotation.js';
import { CollisionDetector } from './game/collision.js';
import { ScoringSystem } from './game/scoring.js';

export interface GameState {
  score: number;
  level: number;
  lines: number;
  nextPiece: Piece;
  holdPiece: Piece | null;
  isGameOver: boolean;
  playfield: number[][];
}

export default class Game {
  gameOver!: boolean;
  playfield!: number[][];
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

  // Subsystems
  private pieceGenerator: PieceGenerator;
  private collisionDetector: CollisionDetector;
  private scoringSystem: ScoringSystem;

  constructor() {
    this.pieceGenerator = new PieceGenerator();
    this.playfield = Array.from({ length: 20 }, () => Array(10).fill(0));
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

  // Helper to reset piece position based on its type
  resetPiecePosition(piece: Piece): void {
      this.pieceGenerator.resetPiecePosition(piece);
  }

  createPiece(): Piece {
    return this.pieceGenerator.createPiece();
  }

  getState(): GameState {
    const playfield: number[][] = [];

    // 1. Copy locked blocks
    for (let y = 0; y < this.playfield.length; y++) {
      playfield[y] = [];
      for (let x = 0; x < this.playfield[y].length; x++) {
        playfield[y][x] = this.playfield[y][x];
      }
    }

    // 2. Calculate and Draw Ghost Piece
    // Clone active piece position
    let ghostY = this.activPiece.y;
    const ghostX = this.activPiece.x;
    const blocks = this.activPiece.blocks;

    // Move ghost down until collision
    // Temporarily move active piece to check collision
    const originalY = this.activPiece.y;

    while(true) {
        this.activPiece.y++;
        if (this.hasCollision()) {
            this.activPiece.y--;
            ghostY = this.activPiece.y;
            break;
        }
    }
    this.activPiece.y = originalY; // Restore

    // Draw Ghost (negative values)
    for (let y = 0; y < blocks.length; y++) {
        for (let x = 0; x < blocks[y].length; x++) {
            if (blocks[y][x]) {
                const targetY = ghostY + y;
                const targetX = ghostX + x;
                // Only draw if within bounds and cell is empty (don't overwrite locked blocks,
                // though ghost shouldn't overlap locked blocks by definition of collision)
                if (targetY >= 0 && targetY < playfield.length &&
                    targetX >= 0 && targetX < playfield[0].length) {
                        // Use negative value for ghost
                        // If there is already a block there, we might overlap?
                        // Ghost is only valid where there is no block.
                        if (playfield[targetY][targetX] === 0) {
                             playfield[targetY][targetX] = -blocks[y][x];
                        }
                }
            }
        }
    }

    // 3. Draw Active Piece
    const { y: pieceY, x: pieceX } = this.activPiece;
    for (let y = 0; y < blocks.length; y++) {
        for (let x = 0; x < blocks[y].length; x++) {
            if (blocks[y][x]) {
                 const targetY = pieceY + y;
                 const targetX = pieceX + x;
                 if (targetY >= 0 && targetY < playfield.length &&
                     targetX >= 0 && targetX < playfield[0].length) {
                        playfield[targetY][targetX] = blocks[y][x];
                 }
            }
        }
    }

    // Calculate Ghost Piece
    if (!this.gameOver) {
      const ghostY = this.getGhostY();
      const { x: pieceX, blocks } = this.activPiece;

      for (let y = 0; y < blocks.length; y++) {
        for (let x = 0; x < blocks[y].length; x++) {
          if (blocks[y][x] && (ghostY + y) >= 0) {
            // Only draw ghost if the cell is empty (0)
            // Note: collision logic ensures ghost doesn't overlap locked blocks,
            // but we check just in case to avoid overwriting locked blocks in the view
            if (playfield[ghostY + y][pieceX + x] === 0) {
              playfield[ghostY + y][pieceX + x] = -blocks[y][x]; // Negative value for ghost
            }
          }
        }
      }
    }

    // this.playfield = playfield;
    return {
      score: this.score,
      level: this.level,
      lines: this.lines,
      nextPiece: this.nextPiece,
      holdPiece: this.holdPieceObj,
      isGameOver: this.gameOver,
      playfield
    }
  }

  getGhostY(): number {
    return this.collisionDetector.getGhostY(this.activPiece);
  }

  hardDrop(): { linesCleared: number[], locked: boolean, gameOver: boolean } {
    const result: { linesCleared: number[], locked: boolean, gameOver: boolean } = { linesCleared: [], locked: false, gameOver: false };
    const ghostY = this.getGhostY();
    this.activPiece.y = ghostY;
    // Force a collision check which should lead to locking
    this.activPiece.y += 1; // Move into collision
    if (this.hasCollision()) {
        this.activPiece.y -= 1; // Back to ghost position
        this.lockPiece();
        result.locked = true;
        const linesScore = this.clearLine();
        if (linesScore.length > 0) {
            this.scoringSystem.updateScore(linesScore.length);
            result.linesCleared = linesScore;
        }
        this.updatePieces();
        if (this.gameOver) result.gameOver = true;
    }
    return result;
  }

  reset(): void {
    this.scoringSystem.reset();
    this.gameOver = false;
    this.playfield = Array.from({ length: 20 }, () => Array(10).fill(0));
    this.collisionDetector.updatePlayfield(this.playfield);
    this.holdPieceObj = null;
    this.canHold = true;
    this.lockTimer = 0;

    this.activPiece = this.createPiece();
    this.nextPiece = this.createPiece();
  }

  // Called every frame
  update(dt: number): { linesCleared: number[], locked: boolean, gameOver: boolean } {
      const result: { linesCleared: number[], locked: boolean, gameOver: boolean } = { linesCleared: [], locked: false, gameOver: false };
      if (this.gameOver) return result;

      // Check if piece is on the ground
      this.activPiece.y += 1;
      const onGround = this.hasCollision();
      this.activPiece.y -= 1;

      if (onGround) {
          this.lockTimer += dt;
          if (this.lockTimer > this.lockDelayTime) {
              this.lockPiece();
              result.locked = true;
              const linesScore = this.clearLine();
              if (linesScore.length > 0) {
                  this.scoringSystem.updateScore(linesScore.length);
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
        // Successful move
        this.handleMoveReset();
    }
  }

  movePieceRight(): void {
    this.activPiece.x += 1;
    if (this.hasCollision()) {
      this.activPiece.x -= 1;
    } else {
        // Successful move
        this.handleMoveReset();
    }
  }

  movePieceDown(): void {
    this.activPiece.y += 1;
    if (this.hasCollision()) {
      this.activPiece.y -= 1;
    } else {
        // We moved down successfully
        // Moving down always resets the lock timer in standard Tetris,
        // effectively giving you infinite time if you keep falling slowly?
        // Actually, step reset is usually separate from move reset.
        // But for simplicity, we treat it as a valid move that resets if grounded.
        this.lockTimer = 0;
        // Note: Moving down usually doesn't consume the "15 move limit" in some guidelines,
        // but here we will just let it reset timer without consuming reset counter to be generous?
        // Or consume it? Let's NOT consume reset counter for gravity/soft drop.
    }
  }

  dropPiece(): void {
    while (true) {
      this.activPiece.y += 1;
      if (this.hasCollision()) {
        this.activPiece.y -= 1;
        break;
      }
    }
    this.lockPiece();
    const linesScore = this.clearLine();
    if (linesScore.length > 0) {
      this.updateScore(linesScore.length);
    }
    this.updatePieces();
  }

  rotatePiece(rightRurn: boolean = true): void {
    const blocks = this.activPiece.blocks;
    const length = blocks.length;
    const type = this.activPiece.type;
    const currentRotation = this.activPiece.rotation;
    // Calculate next rotation index (0-3)
    let nextRotation = rightRurn ? (currentRotation + 1) % 4 : (currentRotation + 3) % 4;

    // O piece does not rotate
    if (type === 'O') return;

    // Perform basic rotation
    const temp = rotatePieceBlocks(blocks, rightRurn);

    // Store original state
    const originalBlocks = this.activPiece.blocks;
    const originalX = this.activPiece.x;
    const originalY = this.activPiece.y;
    const originalRotation = this.activPiece.rotation;

    // Apply new blocks tentatively
    this.activPiece.blocks = temp;
    this.activPiece.rotation = nextRotation;

    if (!this.hasCollision()) {
        // No collision, rotation successful immediately
      this.handleMoveReset();
      return;
    }

    // Collision detected, try Wall Kicks (SRS)
    const kicks = getWallKicks(type, currentRotation, nextRotation);

    if (!kicks || kicks.length === 0) {
        // Should not happen if tables are complete
        this.activPiece.blocks = originalBlocks;
        this.activPiece.rotation = originalRotation;
        return;
    }

    let kicked = false;

    // Iterate through kicks (test 1 is 0,0 which we already failed, but the array includes it usually?)
    // The arrays in SRS_KICKS_... include [0,0] as the first element.
    // Since we already checked [0,0] (implicit basic rotation), we could skip it,
    // but checking it again is harmless and keeps logic simple.

    for (const [ox, oy] of kicks) {
        this.activPiece.x = originalX + ox;
        this.activPiece.y = originalY + oy; // Remember Y is down-positive, but our table is already adapted?
        // Wait, earlier I confirmed the table in src/game.ts matches Wiki but with Y inverted?
        // Let's re-verify.
        // Wiki 0->R (0->1) for J: (0,0), (-1,0), (-1,+1), (0,-2), (-1,-2)
        // Code: [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]]
        // Wiki +y is Up. Code +y is Down.
        // So Wiki +1 (Up) -> Code -1 (Up).
        // Wiki -2 (Down) -> Code +2 (Down).
        // Matches! So we just add them.

        if (!this.hasCollision()) {
            kicked = true;
            break;
        }
    }

    if (!kicked) {
        // Revert everything
        this.activPiece.x = originalX;
        this.activPiece.y = originalY;
        this.activPiece.blocks = originalBlocks;
        this.activPiece.rotation = originalRotation;
    } else {
        // Successful kick
        this.handleMoveReset();
    }
  }

  handleMoveReset(): void {
      // Check if we are now on the ground
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
    return this.collisionDetector.hasCollision(piece);
  }

  lockPiece(): void {
    const { y: pieceY, x: pieceX, blocks } = this.activPiece;

    for (let y = 0; y < blocks.length; y++) {
      for (let x = 0; x < blocks[y].length; x++) {
        if (blocks[y][x]) {
            // Check if game over (piece locked above the board)
            if (pieceY + y < 0) {
                this.gameOver = true;
                return;
            }

            if ((pieceY + y) < this.playfield.length) {
                this.playfield[pieceY + y][pieceX + x] = blocks[y][x];
            }
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

    // Check for immediate game over upon spawn
    if (this.hasCollision()) {
        this.gameOver = true;
    }
  }

  clearLine(): number[] {
    return this.scoringSystem.clearLines(this.playfield);
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
      this.canHold = false;
      this.lockTimer = 0;
  }
}
