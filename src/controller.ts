import Game from "./game.js";
import View from "./viewWebGPU.js";
import SoundManager from "./sound.js";

const DAS = 160; // Delayed Auto Shift (ms)
const ARR = 30;  // Auto Repeat Rate (ms)

export default class Controller {
  game: Game;
  view: View;
  viewWebGPU: View;
  soundManager: SoundManager;
  isPlaying: boolean;
  gameLoopID: number | null;
  intervalID: number | null; // For gravity

  // Input state
  keys: { [key: string]: boolean } = {
    ArrowLeft: false,
    ArrowRight: false,
    ArrowDown: false,
    ArrowUp: false,
    Space: false,
    Enter: false,
    KeyC: false,
    ShiftLeft: false,
    ShiftRight: false
  };

  keyTimers: { [key: string]: number } = {
    ArrowLeft: 0,
    ArrowRight: 0,
    ArrowDown: 0
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
      // Sync WebGPU state immediately on logic update
      this.viewWebGPU.state = state;
    }
  }

  reset(): void {
    this.game.reset();
    this.play();
  }

  handleKeyDown(event: KeyboardEvent): void {
    // Map older keyCodes if necessary, or just use code
    let code = event.code;

    switch (event.keyCode) {
      case 13: // ENTER
        if (this.game.gameower) {
          this.reset();
        } else if (this.isPlaying) {
          this.pause();
        } else {
          this.play();
        }

        break;
      case 37:
        this.game.movePieceLeft();
        this.soundManager.playMove();
        this.updateView();
        break;
      case 38:
        this.game.rotatePiece();
        this.soundManager.playRotate();
        this.updateView();
        break;
      case 39:
        this.game.movePieceRight();
        this.soundManager.playMove();
        this.updateView();
        break;
      case 40:
        this.game.movePieceDown();
        this.soundManager.playMove();
        this.updateView();
        break;
      case 32: // SPACE
        const result = this.game.hardDrop();
        this.soundManager.playHardDrop();
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
        break;
    }
  }

  handleKeyUp(event: KeyboardEvent): void {
      let code = event.code;
      // Fallback
      if (!code) {
        if (event.keyCode === 37) code = 'ArrowLeft';
        if (event.keyCode === 38) code = 'ArrowUp';
        if (event.keyCode === 39) code = 'ArrowRight';
        if (event.keyCode === 40) code = 'ArrowDown';
        if (event.keyCode === 32) code = 'Space';
        if (event.keyCode === 13) code = 'Enter';
    }

      if (this.keys.hasOwnProperty(code)) {
          this.keys[code] = false;
          // Reset timer on release
          if (this.keyTimers.hasOwnProperty(code)) {
              this.keyTimers[code] = 0;
          }
      }
  }

  onKeyPress(code: string): void {
      switch (code) {
          case 'ArrowLeft':
              this.game.movePieceLeft();
              this.soundManager.playMove();
              this.keyTimers.ArrowLeft = 0;
              this.updateView();
              break;
          case 'ArrowRight':
              this.game.movePieceRight();
              this.soundManager.playMove();
              this.keyTimers.ArrowRight = 0;
              this.updateView();
              break;
          case 'ArrowUp':
              this.game.rotatePiece();
              this.soundManager.playRotate();
              this.updateView();
              break;
          case 'ArrowDown':
              this.game.movePieceDown();
              this.soundManager.playMove();
              this.keyTimers.ArrowDown = 0;
              this.updateView();
              break;
          case 'Space':
              const resultHD = this.game.hardDrop();
              this.soundManager.playHardDrop();
              if (resultHD.linesCleared.length > 0) {
                  this.soundManager.playLineClear(resultHD.linesCleared.length);
                  this.viewWebGPU.onLineClear(resultHD.linesCleared);
              } else if (resultHD.locked) {
                  this.soundManager.playLock();
                  this.viewWebGPU.onLock();
              }
              if (resultHD.gameOver) {
                  this.soundManager.playGameOver();
              }
              this.updateView();
              break;
          case 'KeyC':
          case 'ShiftLeft':
          case 'ShiftRight':
              this.game.hold();
              this.soundManager.playMove();
              this.updateView();
              break;
      }
  }

  gameLoop(): void {
    let lastTime = performance.now();

    const animate = (time: number) => {
      if (!this.isPlaying) {
          // If paused/gameover, we can stop the loop or just return and not request next frame.
          // Better to stop and restart in play().
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

      // WebGPU update can happen here too if it needs continuous animation (like background)
      // The viewWebGPU.Frame() method handles its own loop, but we need to push state to it.
      // Actually viewWebGPU.Frame calls requestAnimationFrame itself recursively.
      // But we update `viewWebGPU.state` in `updateView()`.

      requestAnimationFrame(animate);
    };

    requestAnimationFrame(animate);
  }

  handleInput(dt: number): void {
      // Horizontal Movement
      if (this.keys.ArrowLeft) {
          this.keyTimers.ArrowLeft += dt;
          if (this.keyTimers.ArrowLeft > DAS) {
              while (this.keyTimers.ArrowLeft > DAS + ARR) {
                  this.game.movePieceLeft();
                  this.keyTimers.ArrowLeft -= ARR;
                  this.updateView();
              }
          }
      } else if (this.keys.ArrowRight) {
          this.keyTimers.ArrowRight += dt;
          if (this.keyTimers.ArrowRight > DAS) {
              while (this.keyTimers.ArrowRight > DAS + ARR) {
                  this.game.movePieceRight();
                  this.keyTimers.ArrowRight -= ARR;
                  this.updateView();
              }
          }
      }

      // Soft Drop
      if (this.keys.ArrowDown) {
          this.keyTimers.ArrowDown += dt;
          // Soft drop usually has a much shorter DAS/ARR or none at all (instant repeat)
          // Let's use a shorter interval for soft drop, e.g. ARR / 2 or just ARR
          if (this.keyTimers.ArrowDown > ARR) { // No DAS for soft drop usually, just speed
             this.game.movePieceDown();
             this.keyTimers.ArrowDown = 0;
             this.updateView();
          }
      }
  }
}
