import Game from "./game.js";
import View from "./viewWebGPU.js";
import SoundManager from "./sound.js";

const DAS = 160; // Delayed Auto Shift (ms) - Balanced Fast
const ARR = 15;  // Auto Repeat Rate (ms) - Fast but controllable
const SOFT_DROP_SPEED = 20; // Sonic Drop: Faster soft drop for better responsiveness (50Hz)

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

  // Track last horizontal direction for SOCD cleaning
  lastDirection: 'left' | 'right' | null = null;

  // Mapping from physical key codes to logical actions
  keyMap: { [key: string]: Action } = {
    // Standard Arrows
    'ArrowLeft': 'left',
    'ArrowRight': 'right',
    'ArrowDown': 'down',
    'ArrowUp': 'hardDrop',
    'Space': 'hardDrop',
    'KeyC': 'hold',
    'ShiftLeft': 'hold',
    'ShiftRight': 'hold',
    'KeyX': 'rotateCW',
    'KeyZ': 'rotateCCW',

    // WASD + KL
    'KeyA': 'left',
    'KeyD': 'right',
    'KeyS': 'down',
    'KeyW': 'hardDrop',
    'KeyQ': 'rotateCCW',
    'KeyE': 'rotateCW',
    'KeyK': 'rotateCCW',
    'KeyL': 'rotateCW'
  };

  private lastTime: number = 0;
  private lastLevel: number = 1;

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

    this.lastLevel = this.game.level;
    this.lastTime = performance.now();

    // Reset timers to prevent jumps
    this.gravityTimer = 0;
    this.actionTimers.left = 0;
    this.actionTimers.right = 0;
    this.actionTimers.down = 0;

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
      // This method mainly for manual triggers?
      // Actually gameLoop calls renderMainScreen.
      // But pause/end screen logic is good here.
    }
  }

  reset(): void {
    this.game.reset();

    // Reset timers
    this.gravityTimer = 0;
    this.actionTimers.left = 0;
    this.actionTimers.right = 0;
    this.actionTimers.down = 0;

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
            this.lastDirection = 'left';
            this.game.movePieceLeft();
            this.soundManager.playMove();
            this.actionTimers.left = 0;
            break;
        case 'right':
            this.lastDirection = 'right';
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

  onKeyPress(code: string): void {
      const action = this.keyMap[code];
      if (!action) return;

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
              this.game.hold();
              this.soundManager.playMove();
              break;
      }
  }

  performHardDrop(): void {
      const ghostY = this.game.getGhostY();
      const dropDist = ghostY - this.game.activPiece.y;
      const currentX = this.game.activPiece.x;

      // NEON BRICKLAYER: Get Color Index for visual flair
      // Map piece type to theme color index
      const type = this.game.activPiece.type;
      let colorIdx = 1;
      // Map standard pieces to index 1-7 (I,J,L,O,S,T,Z)
      // This mapping assumes standard order or theme alignment
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

      const dt = time - this.lastTime;
      this.lastTime = time;

      // 1. Handle Input (Movement)
      this.handleInput(dt);

      // 2. Update Game Logic (Gravity, Locking)
      // Gravity handling moved inside Game.update or managed here?
      // Previously handled by interval.
      // Game.update handles lock delay. Does it handle gravity?
      // Game.update checks ground contact.
      // We need to implement gravity here if interval is gone.

      const level = this.game.getState().level;
      // NEON BRICKLAYER: Exponential gravity for better curve (Standard Tetris-ish)
      // Tuned for better playability: 0.85 base makes it slightly faster
      // Clamp to prevent infinite loop at extreme levels
      let speedMs = 1000 * Math.pow(0.85, level - 1);
      // Allow faster than 60Hz (16ms) but clamp to 0.5ms to avoid browser freeze
      if (speedMs < 0.5) speedMs = 0.5;

      // Accumulate gravity time?
      // Simplest: use a gravity timer here.
      // Or pass dt to Game.update and let it handle gravity?
      // Game.update signature: update(dt). It handles lock timer.
      // It does NOT handle gravity (movePieceDown).
      // So we need a gravity accumulator.

      if (!this.gravityTimer) this.gravityTimer = 0;
      this.gravityTimer += dt;

      // Limit catch-up steps to prevent freeze
      let steps = 0;
      const maxSteps = 20; // Grid height is 20, no need to simulate more per frame
      while (this.gravityTimer > speedMs && steps < maxSteps) {
          this.game.movePieceDown();
          this.gravityTimer -= speedMs;
          steps++;
      }

      // If we capped out, reset the timer to avoid backlog accumulation
      if (steps >= maxSteps) {
          this.gravityTimer = 0;
      }

      // Game update (lock delay)
      const result = this.game.update(dt);

      // Check level up
      if (this.game.level > this.lastLevel) {
          this.soundManager.playLevelUp();
          this.lastLevel = this.game.level;
      }

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
          this.isPlaying = false;
          this.view.renderEndScreen(this.game.getState());
          return;
      }

      // 3. Render
      const state = this.game.getState();
      this.view.renderMainScreen(state);
      this.viewWebGPU.state = state;

      // Call View.render directly (Synchronized with Game Loop)
      // Pass dt in seconds
      this.viewWebGPU.render(dt / 1000.0);

      this.gameLoopID = requestAnimationFrame(animate);
    };

    this.gameLoopID = requestAnimationFrame(animate);
  }

  private gravityTimer: number = 0;

  // Helper to check if any key for a logical action is pressed
  isActionPressed(action: Action): boolean {
      for (const key in this.keys) {
          if (this.keys[key] && this.keyMap[key] === action) {
              return true;
          }
      }
      return false;
  }

  handleInput(dt: number): void {
      // SOCD Cleaning: Last Input Priority
      let moveLeft = this.isActionPressed('left');
      let moveRight = this.isActionPressed('right');

      if (moveLeft && moveRight) {
          if (this.lastDirection === 'left') {
              moveRight = false;
          } else {
              moveLeft = false;
          }
      }

      if (moveLeft) {
          this.actionTimers.left! += dt;
          if (this.actionTimers.left! > DAS) {
              while (this.actionTimers.left! > DAS + ARR) {
                  this.game.movePieceLeft();
                  this.soundManager.playMove();
                  // NEON BRICKLAYER: DAS Trail
                  this.viewWebGPU.onMove(this.game.activPiece.x, this.game.activPiece.y);
                  this.actionTimers.left! -= ARR;
              }
          }
      } else if (moveRight) {
          this.actionTimers.right! += dt;
          if (this.actionTimers.right! > DAS) {
              while (this.actionTimers.right! > DAS + ARR) {
                  this.game.movePieceRight();
                  this.soundManager.playMove();
                  // NEON BRICKLAYER: DAS Trail
                  this.viewWebGPU.onMove(this.game.activPiece.x, this.game.activPiece.y);
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
             // Sonic Drop: Allow multiple steps per frame if dt is large
             let steps = Math.floor(this.actionTimers.down! / SOFT_DROP_SPEED);
             this.actionTimers.down! %= SOFT_DROP_SPEED;
             // Cap steps to prevent freeze/tunneling
             if (steps > 20) steps = 20;

             for (let i = 0; i < steps; i++) {
                 this.game.movePieceDown();
                 // NEON BRICKLAYER: Soft Drop Trail
                 this.viewWebGPU.onMove(this.game.activPiece.x, this.game.activPiece.y);

                 // If collision happened (handled in movePieceDown), break?
                 // movePieceDown resets position if collision.
                 // So we continue trying to move down?
                 // Actually movePieceDown prevents moving INTO collision.
                 // So repeating it just hits the same collision.
                 // It's safe but redundant.
                 // Check if we hit ground?
                 // Game.hasCollision() check is internal.
                 // To optimize, we could check if locked?
                 // But movePieceDown doesn't lock.
             }
          }
      } else {
          this.actionTimers.down = 0;
      }
  }
}
