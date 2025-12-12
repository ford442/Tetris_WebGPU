interface Piece {
  blocks: number[][];
  x: number;
  y: number;
}

interface GameState {
  score: number;
  level: number;
  lines: number;
  nextPiece: Piece;
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

  constructor() {
    this.reset();
  }

  get level(): number {
    return Math.floor(this.lines * 0.1);
    //return 9;
  }

  createPiece(): Piece {
    const index = Math.floor(Math.random() * 7);
    const type = 'IJLOSTZ'[index];
    const piece: Piece = { blocks: [], x: 0, y: 0 };
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
          [2, 2, 2],
          [0, 0, 2],
          [0, 0, 0]
        ];
        break;
      case 'L':
        piece.blocks = [
          [3, 0, 0],
          [3, 0, 0],
          [3, 3, 0]
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
          [6, 6, 6],
          [0, 6, 0],
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
        throw new Error('Что то пошло не так!');
    }

    piece.x = 4;
    piece.y = -2;

    return piece;
  }

  getState(): GameState {
    const playfield = [
      [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    ];

    for (let y = 0; y < this.playfield.length; y++) {
      const lines = this.playfield[y];

      for (let x = 0; x < lines.length; x++) {
        const element = lines[x];
        // Заполняю данными состояния поля
        playfield[y][x] = element;

        // Заполняю данными "Текушей" фигуры
        const { y: pieceY, x: pieceX, blocks } = this.activPiece;

        for (let activPiece_y = 0; activPiece_y < blocks.length; activPiece_y++) {
          for (let activPiece_x = 0; activPiece_x < blocks[activPiece_y].length; activPiece_x++) {

            if ((blocks[activPiece_y][activPiece_x]) && (pieceY + activPiece_y) >= 0) {

              playfield[pieceY + activPiece_y][pieceX + activPiece_x] = blocks[activPiece_y][activPiece_x];
            }
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
    this.playfield = [
      [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    ];

    this.activPiece = this.createPiece();
    this.nextPiece = this.createPiece();
  }

  movePieceLeft(): void {
    this.activPiece.x -= 1;
    if (this.hasCollision()) {
      this.activPiece.x += 1;
    }
  }

  movePieceRight(): void {
    this.activPiece.x += 1;
    if (this.hasCollision()) {
      this.activPiece.x -= 1;
    }
  }

  movePieceDown(): void {
    this.activPiece.y += 1;
    if (this.hasCollision()) {
      this.activPiece.y -= 1;
      this.lockPiece();
      const linesScore = this.clearLine();
      if (linesScore) {
        this.updateScore(linesScore);
      }
      this.updatePieces();
    }
  }

  rotatePiece(rightRurn: boolean = true): void {
    const blocks = this.activPiece.blocks;
    const length = blocks.length;

    const temp: number[][] = [];

    // console.log(blocks);

    for (let i = 0; i < length; i++) {
      temp[i] = new Array(length).fill(0);
    }

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
    this.activPiece.blocks = temp;
    if (this.hasCollision()) {
      this.activPiece.blocks = blocks;
    } else {
      //  this.activPiece.blocks = temp;
    }

    // console.log(this.activPiece.blocks);
  }

  hasCollision(): boolean {
    const playfield = this.playfield;
    const { y: pieceY, x: pieceX, blocks } = this.activPiece;

    for (let y = 0; y < blocks.length; y++) {
      for (let x = 0; x < blocks[y].length; x++) {
        if (
          blocks[y][x] !== 0 && ((pieceY + y) >= 0) &&
          ((playfield[pieceY + y] === undefined || playfield[pieceY + y][pieceX + x] === undefined) ||
            (playfield[pieceY + y][pieceX + x] >= 1))
        ) {
          return true;
        }
      }
    }

    return false;
  }

  lockPiece(): void {
    const { y: pieceY, x: pieceX, blocks } = this.activPiece;

    for (let y = 0; y < blocks.length; y++) {
      for (let x = 0; x < blocks[y].length; x++) {
        if (pieceY < 0) {
          this.gameower = true;
        } else if (blocks[y][x]) {
          this.playfield[pieceY + y][pieceX + x] = blocks[y][x];
        }
      }
    }
  }

  updatePieces(): void {
    this.activPiece = this.nextPiece;
    this.nextPiece = this.createPiece();
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
        console.log(lines);
      }
    }

    for (let index = 0; index < lines.length; index++) {
      const element = lines[index];
      this.playfield.splice(element, 1);
      const arr = new Array(10);
      arr.fill(0);
      this.playfield.unshift(arr);
      this.lines += 1;
      //this.updateScore(lines.length);
    }
    //this.updateScore(lines.length);

    return lines.length;
  }

  updateScore(lines: number): void {
    this.score += lines * lines * 10;
    console.log('score = ' + this.score);
  }
}