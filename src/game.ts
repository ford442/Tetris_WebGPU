export interface Piece {
  blocks: number[][];
  x: number;
  y: number;
  rotation: number; // 0: Spawn, 1: Right, 2: 180, 3: Left
  type: string;
}

export interface GameState {
  score: number;
  level: number;
  lines: number;
  nextPiece: Piece;
  holdPiece: Piece | null;
  isGameOwer: boolean;
  playfield: number[][];
}

export default class Game {
  score!: number;
  lines!: number;
  gameower!: boolean;
  playfield!: number[][];
  activPiece!: Piece;
  nextPiece!: Piece;
  holdPieceObj: Piece | null = null;
  canHold: boolean = true;
  bag: string[] = [];

  // Lock Delay
  lockTimer: number = 0;
  readonly lockDelayTime: number = 500; // ms

  // @ts-ignore
  private static readonly SRS_KICKS_JLSTZ = {
    '0-1': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
    '1-0': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
    '1-2': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
    '2-1': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
    '2-3': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
    '3-2': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
    '3-0': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
    '0-3': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]]
  };

  // @ts-ignore
  private static readonly SRS_KICKS_I = {
    '0-1': [[0, 0], [-2, 0], [1, 0], [-2, 1], [1, -2]],
    '1-0': [[0, 0], [2, 0], [-1, 0], [2, -1], [-1, 2]],
    '1-2': [[0, 0], [-1, 0], [2, 0], [-1, -2], [2, 1]],
    '2-1': [[0, 0], [1, 0], [-2, 0], [1, 2], [-2, -1]],
    '2-3': [[0, 0], [2, 0], [-1, 0], [2, -1], [-1, 2]],
    '3-2': [[0, 0], [-2, 0], [1, 0], [-2, 1], [1, -2]],
    '3-0': [[0, 0], [1, 0], [-2, 0], [1, 2], [-2, -1]],
    '0-3': [[0, 0], [-1, 0], [2, 0], [-1, -2], [2, 1]]
  };

  constructor() {
    this.reset();
  }

  get level(): number {
    return Math.floor(this.lines * 0.1);
  }

  // Helper to reset piece position based on its type
  resetPiecePosition(piece: Piece): void {
      piece.x = Math.floor((10 - piece.blocks[0].length) / 2);
      piece.y = -2;
      piece.rotation = 0;

      // We might need to reset blocks rotation too if we modified them in place?
      // Yes, rotatePiece modifies .blocks.
      // So we should re-create blocks or reset them.
      // Easiest is to re-create the piece structure based on type.
      const freshPiece = this.createPieceByType(piece.type);
      piece.blocks = freshPiece.blocks;
  }

  createPieceByType(type: string): Piece {
    const piece: Piece = { blocks: [], x: 0, y: 0, rotation: 0, type };
    switch (type) {
      case 'I':
        piece.blocks = [
          [0, 0, 0, 0],
          [1, 1, 1, 1],
          [0, 0, 0, 0],
          [0, 0, 0, 0]
        ];
        break;
      case 'J':
        piece.blocks = [
          [2, 0, 0],
          [2, 2, 2],
          [0, 0, 0]
        ];
        break;
      case 'L':
        piece.blocks = [
          [0, 0, 3],
          [3, 3, 3],
          [0, 0, 0]
        ];
        break;
      case 'O':
        piece.blocks = [
          [0, 0, 0, 0],
          [0, 4, 4, 0],
          [0, 4, 4, 0],
          [0, 0, 0, 0]
        ];
        break;
      case 'S':
        piece.blocks = [
          [0, 5, 5],
          [5, 5, 0],
          [0, 0, 0]
        ];
        break;
      case 'T':
        piece.blocks = [
          [0, 6, 0],
          [6, 6, 6],
          [0, 0, 0]
        ];
        break;
      case 'Z':
        piece.blocks = [
          [7, 7, 0],
          [0, 7, 7],
          [0, 0, 0]
        ];
        break;
      default:
        throw new Error('Something went wrong!');
    }
    piece.x = Math.floor((10 - piece.blocks[0].length) / 2);
    piece.y = -2;
    return piece;
  }

  createPiece(): Piece {
    if (this.bag.length === 0) {
      this.generateBag();
    }
    const type = this.bag.shift()!;
    return this.createPieceByType(type);
  }

  generateBag(): void {
    const pieces = ['I', 'J', 'L', 'O', 'S', 'T', 'Z'];
    // Shuffle
    for (let i = pieces.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pieces[i], pieces[j]] = [pieces[j], pieces[i]];
    }
    this.bag.push(...pieces);
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
    if (!this.gameower) {
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
      isGameOwer: this.gameower,
      playfield
    }
  }

  getGhostY(): number {
    const originalY = this.activPiece.y;
    while (!this.hasCollision()) {
      this.activPiece.y++;
    }
    const ghostY = this.activPiece.y - 1;
    this.activPiece.y = originalY;
    return ghostY;
  }

  hardDrop(): void {
    const ghostY = this.getGhostY();
    this.activPiece.y = ghostY;
    // Force a collision check which should lead to locking
    this.activPiece.y += 1; // Move into collision
    if (this.hasCollision()) {
        this.activPiece.y -= 1; // Back to ghost position
        this.lockPiece();
        const linesScore = this.clearLine();
        if (linesScore) {
            this.updateScore(linesScore);
        }
        this.updatePieces();
    }
  }

  reset(): void {
    this.score = 0;
    this.lines = 0;
    this.gameower = false;
    this.playfield = Array.from({ length: 20 }, () => Array(10).fill(0));
    this.holdPieceObj = null;
    this.canHold = true;
    this.lockTimer = 0;

    this.activPiece = this.createPiece();
    this.nextPiece = this.createPiece();
  }

  // Called every frame
  update(dt: number): void {
      if (this.gameower) return;

      // Check if piece is on the ground
      this.activPiece.y += 1;
      const onGround = this.hasCollision();
      this.activPiece.y -= 1;

      if (onGround) {
          this.lockTimer += dt;
          if (this.lockTimer > this.lockDelayTime) {
              this.lockPiece();
              const linesScore = this.clearLine();
              if (linesScore) {
                  this.updateScore(linesScore);
              }
              this.updatePieces();
          }
      } else {
          this.lockTimer = 0;
      }
  }

  movePieceLeft(): void {
    this.activPiece.x -= 1;
    if (this.hasCollision()) {
      this.activPiece.x += 1;
    } else {
        // Successful move
        this.resetLockTimerIfGrounded();
    }
  }

  movePieceRight(): void {
    this.activPiece.x += 1;
    if (this.hasCollision()) {
      this.activPiece.x -= 1;
    } else {
        // Successful move
        this.resetLockTimerIfGrounded();
    }
  }

  movePieceDown(): void {
    this.activPiece.y += 1;
    if (this.hasCollision()) {
      this.activPiece.y -= 1;
      // Do not lock here! lockTimer in update() handles it.
      // But we can manually start the lock timer here if we want instant feedback?
      // No, let the natural flow handle it.
    } else {
        // We moved down successfully
        // We are inherently not on ground (or we just landed).
        // If we just landed, next update() will start counting.
        this.lockTimer = 0;
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
    if (linesScore) {
      this.updateScore(linesScore);
    }
    this.updatePieces();
  }

  rotatePiece(rightRurn: boolean = true): void {
    const blocks = this.activPiece.blocks;
    const length = blocks.length;
    // const type = this.activPiece.type; // Unused
    const currentRotation = this.activPiece.rotation;
    let nextRotation = rightRurn ? (currentRotation + 1) % 4 : (currentRotation + 3) % 4;

    const temp: number[][] = [];

    for (let i = 0; i < length; i++) {
      temp[i] = new Array(length).fill(0);
    }

    // Perform basic rotation
    if (rightRurn) {
      for (let y = 0; y < length; y++) {
        for (let x = 0; x < length; x++) {
          temp[x][y] = blocks[length - 1 - y][x];
        }
      }
    } else {
      for (let y = 0; y < length; y++) {
        for (let x = 0; x < length; x++) {
          temp[x][y] = blocks[y][length - 1 - x];
        }
      }
    }

    // Store original state
    const originalBlocks = this.activPiece.blocks;
    const originalX = this.activPiece.x;
    const originalY = this.activPiece.y;
    const originalRotation = this.activPiece.rotation;

    // Apply new blocks
    this.activPiece.blocks = temp;
    this.activPiece.rotation = nextRotation; // Update rotation locally

    if (this.hasCollision()) {
        // Wall Kicks
        const kicks = [
            [1, 0], [-1, 0],  // Shift right/left
            [0, -1],          // Shift up (floor kick)
            [1, -1], [-1, -1], // Diagonal up
            [2, 0], [-2, 0]   // Shift 2 (for I piece)
        ];

        let kicked = false;

        for (const [ox, oy] of kicks) {
            this.activPiece.x = originalX + ox;
            this.activPiece.y = originalY + oy;
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
             this.resetLockTimerIfGrounded();
        }
    } else {
       // Successful rotation (no kick needed)
       this.resetLockTimerIfGrounded();
    }
  }

  resetLockTimerIfGrounded(): void {
      // Check if we are now on the ground
      this.activPiece.y += 1;
      const onGround = this.hasCollision();
      this.activPiece.y -= 1;

      if (onGround) {
          this.lockTimer = 0;
      }
  }

  hasCollision(): boolean {
    return this.hasCollisionPiece(this.activPiece);
  }

  hasCollisionPiece(piece: Piece): boolean {
    const { x: pieceX, y: pieceY, blocks } = piece;
    for (let y = 0; y < blocks.length; y++) {
      for (let x = 0; x < blocks[y].length; x++) {
        if (blocks[y][x]) {
          const targetX = pieceX + x;
          const targetY = pieceY + y;

          // Check bounds
          // Left/Right
          if (targetX < 0 || targetX >= this.playfield[0].length) {
            return true;
          }
          // Bottom
          if (targetY >= this.playfield.length) {
            return true;
          }

          // Overlap with existing blocks
          if (targetY >= 0 && this.playfield[targetY][targetX]) {
            return true;
          }
        }
      }
    }
    return false;
  }

  lockPiece(): void {
    const { y: pieceY, x: pieceX, blocks } = this.activPiece;

    for (let y = 0; y < blocks.length; y++) {
      for (let x = 0; x < blocks[y].length; x++) {
        if (blocks[y][x]) {
            // Check if game over (piece locked above the board)
            if (pieceY + y < 0) {
                this.gameower = true;
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

    // Check for immediate game over upon spawn
    if (this.hasCollision()) {
        this.gameower = true;
    }
  }

  clearLine(): number {
    let lines: number[] = [];
    let playfield = this.playfield;

    for (let y = playfield.length - 1; y >= 0; y--) {
      const line = playfield[y];

      let linesFull = true;

      for (let x = 0; x < line.length; x++) {
        const block = line[x];

        if (block == 0) {
          linesFull = false;
        }
      }
      if (linesFull) {
        lines.unshift(y);
      }
    }

    for (let index = 0; index < lines.length; index++) {
      const element = lines[index];
      this.playfield.splice(element, 1);
      const arr = new Array(10);
      arr.fill(0);
      this.playfield.unshift(arr);
      this.lines += 1;
    }

    return lines.length;
  }

  updateScore(lines: number): void {
    this.score += lines * lines * 10;
    console.log('score = ' + this.score);
  }
}
