import Game from "./game.js";
import View from "./viewWebGPU.js";
import SoundManager from "./sound.js";

const DAS = 120; // Delayed Auto Shift (ms) - Snappier
const ARR = 8;   // Auto Repeat Rate (ms) - Very fast
const SOFT_DROP_SPEED = 10; // Sonic Drop: Even faster for instant feel

// Logical actions
type Action = 'left' | 'right' | 'down' | 'rotateCW' | 'rotateCCW' | 'hardDrop' | 'hold';

export default class Controller {
  game: Game;
  view: View;
  viewWebGPU: View;
  soundManager: SoundManager;
  isPlaying: boolean;
  gameLoopID: number | null;
  intervalID: number | null; // For gravity

  // Key state (Physical)
  keys: { [key: string]: boolean } = {};

  // Timers for logical actions
  actionTimers: { [key in Action]?: number } = {
    left: 0,
    right: 0,
    down: 0
  };

  // Mapping from physical key codes to logical actions
  keyMap: { [key: string]: Action } = {
    // Standard Arrows
    'ArrowLeft': 'left',
    'ArrowRight': 'right',
    'ArrowDown': 'down',
    'ArrowUp': 'rotateCW',
    'Space': 'hardDrop',
    'KeyC': 'hold',
    'ShiftLeft': 'hold',
    'ShiftRight': 'hold',

    // WASD + KL
    'KeyA': 'left',
    'KeyD': 'right',
    'KeyS': 'down',
    'KeyW': 'down',
    'KeyQ': 'rotateCCW',
    'KeyE': 'rotateCW',
    'KeyK': 'rotateCCW',
    'KeyL': 'rotateCW'
  };

  private lastTime: number = 0;

  constructor(game: Game, view: View, viewWebGPU: View, soundManager: SoundManager) {
    this.game = game;
    this.view = view;
    this.viewWebGPU = viewWebGPU;
    this.soundManager = soundManager;
    this.isPlaying = false;
    this.gameLoopID = null;
    this.intervalID = null;

    document.addEventListener("keydown", this.handleKeyDown.bind(this));
    document.addEventListener("keyup", this.handleKeyUp.bind(this));

    this.play();
  }

  // Called by gravity timer
  update(): void {
    // Deprecated by unified loop, but kept if startTimer still used
    this.game.movePieceDown();
    this.updateView();
  }

  play(): void {
    if (this.isPlaying) return;
    this.isPlaying = true;

    // Stop gravity timer - now handled in gameLoop
    this.stopTimer();

    this.lastTime = performance.now();
    this.gameLoop();
  }

  pause(): void {
    if (!this.isPlaying) return;
    this.isPlaying = false;
    if (this.gameLoopID) {
        cancelAnimationFrame(this.gameLoopID);
        this.gameLoopID = null;
    }
    this.updateView();
    this.view.renderPauseScreen();
  }

  startTimer(): void {
    // Legacy: No longer used with unified loop
  }

  stopTimer(): void {
    if (this.intervalID) {
      clearInterval(this.intervalID);
      this.intervalID = null;
    }
  }

  updateView(): void {
    const state = this.game.getState();

    // Check game over
    if (state.isGameOver) {
      this.view.renderEndScreen(state);
      this.isPlaying = false;
    } else if (!this.isPlaying) {
      this.view.renderPauseScreen();
    } else {
      // Logic handled in gameLoop now
    }
  }

  reset(): void {
    this.game.reset();
    this.play();
  }

  handleKeyDown(event: KeyboardEvent): void {
    if (event.repeat) return;

    const code = event.code;

    // Global keys (Enter)
    if (code === 'Enter' || event.keyCode === 13) {
        if (this.game.gameOver) {
          this.reset();
        } else if (this.isPlaying) {
          this.pause();
        } else {
          this.play();
        }
        return;
    }

    if (!this.isPlaying) return;

    // Map key to action
    const action = this.keyMap[code];
    if (!action) return;

    this.keys[code] = true;

    // Handle initial press actions
    switch (action) {
        case 'left':
            this.game.movePieceLeft();
            this.soundManager.playMove();
            this.actionTimers.left = 0;
            break;
        case 'right':
            this.game.movePieceRight();
            this.soundManager.playMove();
            this.actionTimers.right = 0;
            break;
        case 'down':
            this.game.movePieceDown();
            this.soundManager.playMove();
            this.actionTimers.down = 0;
            break;
        case 'rotateCW':
            {
                const rBefore = this.game.activPiece.rotation;
                this.game.rotatePiece(true);
                if (this.game.activPiece.rotation !== rBefore) {
                     this.viewWebGPU.onRotate();
                }
                this.soundManager.playRotate();
            }
            break;
        case 'rotateCCW':
            {
                const rBefore = this.game.activPiece.rotation;
                this.game.rotatePiece(false);
                if (this.game.activPiece.rotation !== rBefore) {
                     this.viewWebGPU.onRotate();
                }
                this.soundManager.playRotate();
            }
            break;
        case 'hardDrop':
            this.performHardDrop();
            break;
        case 'hold':
            if (this.game.canHold) {
                this.game.hold();
                this.soundManager.playMove();
                this.viewWebGPU.onHold();
            }
            break;
    }
  }

  handleKeyUp(event: KeyboardEvent): void {
    const code = event.code;
    if (this.keys[code]) {
        this.keys[code] = false;
    }
  }

  performHardDrop(): void {
      const ghostY = this.game.getGhostY();
      const dropDist = ghostY - this.game.activPiece.y;
      const currentX = this.game.activPiece.x;

      const type = this.game.activPiece.type;
      let colorIdx = 1;
      if (type === 'I') colorIdx = 1;
      else if (type === 'J') colorIdx = 2;
      else if (type === 'L') colorIdx = 3;
      else if (type === 'O') colorIdx = 4;
      else if (type === 'S') colorIdx = 5;
      else if (type === 'T') colorIdx = 6;
      else if (type === 'Z') colorIdx = 7;

      const result = this.game.hardDrop();
      this.soundManager.playHardDrop();

      this.viewWebGPU.onHardDrop(currentX, ghostY, dropDist, colorIdx);

      if (result.linesCleared.length > 0) {
          const scoreEvent = this.game.scoreEvent;
          const combo = scoreEvent ? scoreEvent.combo : 0;
          const b2b = scoreEvent ? scoreEvent.backToBack : false;
          const isAllClear = scoreEvent ? scoreEvent.isAllClear : false;

          this.soundManager.playLineClear(result.linesCleared.length, combo, b2b);
          this.viewWebGPU.onLineClear(result.linesCleared, result.tSpin, combo, b2b, isAllClear);
      } else if (result.locked) {
          this.soundManager.playLock();
          this.viewWebGPU.onLock();
      }
      if (result.gameOver) {
          this.soundManager.playGameOver();
      }
  }

  gameLoop(): void {
    const animate = (time: number) => {
      if (!this.isPlaying) {
          return;
      }

      let dt = time - this.lastTime;
      this.lastTime = time;

      if (dt > 100) dt = 100;

      this.handleInput(dt);

      const level = this.game.getState().level;
      let speedMs = 1000 * Math.pow(0.88, Math.max(0, level - 1));
      speedMs = Math.max(0.5, speedMs);

      if (!this.gravityTimer) this.gravityTimer = 0;
      this.gravityTimer += dt;

      let steps = 0;
      const maxSteps = 25;

      while (this.gravityTimer > speedMs && steps < maxSteps) {
          this.game.movePieceDown();
          this.gravityTimer -= speedMs;
          steps++;
      }

      if (steps >= maxSteps) {
          this.gravityTimer = 0;
      }

      const result = this.game.update(dt);

      if (result.linesCleared.length > 0) {
          const scoreEvent = this.game.scoreEvent;
          const combo = scoreEvent ? scoreEvent.combo : 0;
          const b2b = scoreEvent ? scoreEvent.backToBack : false;
          const isAllClear = scoreEvent ? scoreEvent.isAllClear : false;

          this.soundManager.playLineClear(result.linesCleared.length, combo, b2b);
          this.viewWebGPU.onLineClear(result.linesCleared, result.tSpin, combo, b2b, isAllClear);
      } else if (result.locked) {
          this.soundManager.playLock();
          const lastPos = this.game.lastDropPos;
          if (lastPos) {
              this.viewWebGPU.onLock();
          } else {
              this.viewWebGPU.onLock();
          }
      }
      if (result.gameOver) {
          this.soundManager.playGameOver();
          this.isPlaying = false;
          this.view.renderEndScreen(this.game.getState());
          return;
      }

      const state = this.game.getState();
      this.view.renderMainScreen(state);
      this.viewWebGPU.state = state;

      this.gameLoopID = requestAnimationFrame(animate);
    };

    this.gameLoopID = requestAnimationFrame(animate);
  }

  private gravityTimer: number = 0;

  isActionPressed(action: Action): boolean {
      for (const key in this.keys) {
          if (this.keys[key] && this.keyMap[key] === action) {
              return true;
          }
      }
      return false;
  }

  handleInput(dt: number): void {
      if (this.isActionPressed('left')) {
          this.actionTimers.left! += dt;
          if (this.actionTimers.left! > DAS) {
              while (this.actionTimers.left! > DAS + ARR) {
                  this.game.movePieceLeft();
                  this.soundManager.playMove();
                  this.actionTimers.left! -= ARR;
              }
          }
      } else if (this.isActionPressed('right')) {
          this.actionTimers.right! += dt;
          if (this.actionTimers.right! > DAS) {
              while (this.actionTimers.right! > DAS + ARR) {
                  this.game.movePieceRight();
                  this.soundManager.playMove();
                  this.actionTimers.right! -= ARR;
              }
          }
      }

      if (!this.isActionPressed('left')) {
          this.actionTimers.left = 0;
      }
      if (!this.isActionPressed('right')) {
          this.actionTimers.right = 0;
      }

      if (this.isActionPressed('down')) {
          this.actionTimers.down! += dt;
          if (this.actionTimers.down! > SOFT_DROP_SPEED) {
             let steps = Math.floor(this.actionTimers.down! / SOFT_DROP_SPEED);
             this.actionTimers.down! %= SOFT_DROP_SPEED;
             if (steps > 20) steps = 20;

             for (let i = 0; i < steps; i++) {
                 this.game.movePieceDown();
             }
          }
      } else {
          this.actionTimers.down = 0;
      }
  }
}