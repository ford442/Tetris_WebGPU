import Game from "./game.js";
import View from "./viewWebGPU.js";
import SoundManager from "./sound.js";

const DAS = 160; // Delayed Auto Shift (ms)
const ARR = 30;  // Auto Repeat Rate (ms)

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
    'KeyW': 'hardDrop',
    'KeyK': 'rotateCCW',
    'KeyL': 'rotateCW'
  };

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
    this.game.movePieceDown();
    this.updateView();
  }

  play(): void {
    if (this.isPlaying) return;
    this.isPlaying = true;
    this.startTimer();
    this.updateView();
    this.gameLoop();
  }

  pause(): void {
    if (!this.isPlaying) return;
    this.isPlaying = false;
    this.stopTimer();
    this.updateView();
    this.view.renderPauseScreen();
  }

  startTimer(): void {
    this.stopTimer();
    const speed = 1000 - this.game.getState().level * 100;
    const intervalTime = speed > 50 ? speed : 50; // Cap max speed

    this.intervalID = setInterval(
      () => {
        this.update();
      },
      intervalTime
    ) as any;
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
    if (state.isGameOwer) {
      this.view.renderEndScreen(state);
      this.isPlaying = false;
      this.stopTimer();
    } else if (!this.isPlaying) {
      this.view.renderPauseScreen();
    } else {
      this.view.renderMainScreen(state);
      this.viewWebGPU.state = state;
    }
  }

  reset(): void {
    this.game.reset();
    this.play();
  }

  handleKeyDown(event: KeyboardEvent): void {
    if (event.repeat) return; // Ignore auto-repeat, we handle it manually for movement

    const code = event.code;

    // Global keys (Enter)
    if (code === 'Enter' || event.keyCode === 13) {
        if (this.game.gameower) {
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
            this.updateView();
            break;
        case 'right':
            this.game.movePieceRight();
            this.soundManager.playMove();
            this.actionTimers.right = 0;
            this.updateView();
            break;
        case 'down':
            this.game.movePieceDown();
            this.soundManager.playMove();
            this.actionTimers.down = 0;
            this.updateView();
            break;
        case 'rotateCW':
            this.game.rotatePiece(true);
            this.soundManager.playRotate();
            this.updateView();
            break;
        case 'rotateCCW':
            this.game.rotatePiece(false);
            this.soundManager.playRotate();
            this.updateView();
            break;
        case 'hardDrop':
            this.performHardDrop();
            break;
        case 'hold':
            this.game.hold();
            this.soundManager.playMove();
            this.updateView();
            break;
    }
  }

  handleKeyUp(event: KeyboardEvent): void {
    const code = event.code;
    if (this.keys[code]) {
        this.keys[code] = false;
    }
  }

  // Legacy support for virtual key presses (if any)
  onKeyPress(code: string): void {
      // Map virtual codes to physical ones if needed, or just map to actions
      // Assuming 'code' matches keyMap keys like 'ArrowLeft'
      // Or if it passes 'Left' etc, we might need mapping.
      // The original code used 'ArrowLeft' etc.

      const action = this.keyMap[code];
      if (!action) return;

      // Simulate logic similar to handleKeyDown but without event object
      switch (action) {
          case 'left':
              this.game.movePieceLeft();
              this.soundManager.playMove();
              this.actionTimers.left = 0;
              this.updateView();
              break;
          case 'right':
              this.game.movePieceRight();
              this.soundManager.playMove();
              this.actionTimers.right = 0;
              this.updateView();
              break;
          case 'down':
              this.game.movePieceDown();
              this.soundManager.playMove();
              this.actionTimers.down = 0;
              this.updateView();
              break;
          case 'rotateCW':
              this.game.rotatePiece(true);
              this.soundManager.playRotate();
              this.updateView();
              break;
          case 'rotateCCW':
              this.game.rotatePiece(false);
              this.soundManager.playRotate();
              this.updateView();
              break;
          case 'hardDrop':
              this.performHardDrop();
              break;
          case 'hold':
              this.game.hold();
              this.soundManager.playMove();
              this.updateView();
              break;
      }
  }

  performHardDrop(): void {
      const ghostY = this.game.getGhostY();
      const dropDist = ghostY - this.game.activPiece.y;
      const currentX = this.game.activPiece.x;

      const result = this.game.hardDrop();
      this.soundManager.playHardDrop();

      this.viewWebGPU.onHardDrop(currentX, ghostY, dropDist);

      if (result.linesCleared.length > 0) {
          this.soundManager.playLineClear(result.linesCleared.length);
          this.viewWebGPU.onLineClear(result.linesCleared);
      } else if (result.locked) {
          this.soundManager.playLock();
          this.viewWebGPU.onLock();
      }
      if (result.gameOver) {
          this.soundManager.playGameOver();
      }
      this.updateView();
  }

  gameLoop(): void {
    let lastTime = performance.now();

    const animate = (time: number) => {
      if (!this.isPlaying) {
          return;
      }

      const dt = time - lastTime;
      lastTime = time;

      this.handleInput(dt);
      const result = this.game.update(dt);
      if (result.linesCleared.length > 0) {
          this.soundManager.playLineClear(result.linesCleared.length);
          this.viewWebGPU.onLineClear(result.linesCleared);
      } else if (result.locked) {
          this.soundManager.playLock();
          this.viewWebGPU.onLock();
      }
      if (result.gameOver) {
          this.soundManager.playGameOver();
      }

      requestAnimationFrame(animate);
    };

    requestAnimationFrame(animate);
  }

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
      // Horizontal Movement
      // Prioritize Left if pressed, else Right.
      // If both pressed, original code prioritized Left (by `if` order).
      if (this.isActionPressed('left')) {
          this.actionTimers.left! += dt;
          if (this.actionTimers.left! > DAS) {
              while (this.actionTimers.left! > DAS + ARR) {
                  this.game.movePieceLeft();
                  this.actionTimers.left! -= ARR;
                  this.updateView();
              }
          }
      } else if (this.isActionPressed('right')) { // Changed to else if to match SOCD behavior
          this.actionTimers.right! += dt;
          if (this.actionTimers.right! > DAS) {
              while (this.actionTimers.right! > DAS + ARR) {
                  this.game.movePieceRight();
                  this.actionTimers.right! -= ARR;
                  this.updateView();
              }
          }
      } else {
          // Reset both if neither pressed?
          // Actually, if I release Left, 'left' becomes false, so I should reset timer.
          // But here if I'm holding Right, 'left' is false, so I enter 'else if'.
          // Wait, if I hold Left, I enter first block. Right timer is NOT reset?
          // If I then release Left and hold Right, Right timer starts from where it left off?
          // The original code:
          // if (keys.ArrowLeft) { ... } else if (keys.ArrowRight) { ... }
          // It did NOT reset timers in the else block.
          // However, handleKeyUp resets timers to 0.
          // So I don't need to reset timers here manually if handleKeyUp does it.
          // Let's check handleKeyUp.
      }

      // Additional safety: if key is not pressed, timer should be 0?
      // handleKeyUp sets it to 0. But we have multiple keys for one action.
      // If I release 'ArrowLeft' but hold 'KeyA', action is still true. Timer continues.
      // If I release BOTH, action is false.
      // Where do I reset the logical timer?
      // In handleKeyUp, I only reset if the specific key map matches?
      // In my new handleKeyUp:
      // if (this.keys[code]) { this.keys[code] = false; }
      // I removed the timer reset logic from handleKeyUp!
      // This is a BUG in my previous draft.

      // Fix: Reset logical timer if the action becomes inactive.
      if (!this.isActionPressed('left')) {
          this.actionTimers.left = 0;
      }
      if (!this.isActionPressed('right')) {
          this.actionTimers.right = 0;
      }

      // Soft Drop
      if (this.isActionPressed('down')) {
          this.actionTimers.down! += dt;
          if (this.actionTimers.down! > ARR) {
             this.game.movePieceDown();
             this.actionTimers.down = 0;
             this.updateView();
          }
      } else {
          this.actionTimers.down = 0;
      }
  }
}
