import Game from "./game.js";
import View from "./viewWebGPU.js";
import SoundManager from "./sound.js";
import { TouchControls, TouchAction, addTouchControlStyles } from "./input/touchControls.js";

const DAS = 120; // Delayed Auto Shift (ms) - Slightly faster for improved responsiveness
const ARR = 10;  // Auto Repeat Rate (ms) - Very fast but controllable, snappier movement
const SOFT_DROP_SPEED = 1; // Sonic Drop: Even faster soft drop for instant tactile feedback

// Logical actions
type Action = 'left' | 'right' | 'down' | 'rotateCW' | 'rotateCCW' | 'hardDrop' | 'hold';

export default class Controller {
  game: Game;
  view: View;
  viewWebGPU: View;
  soundManager: SoundManager;
  isPlaying: boolean;
  isPaused: boolean = false;
  gameLoopID: number | null;
  intervalID: number | null; // For gravity

  // Key state (Physical)
  keys: { [key: string]: boolean } = {};

  // Timers for logical actions
  actionTimers: Record<Action, number> = {
    left: 0,
    right: 0,
    down: 0,
    rotateCW: 0,
    rotateCCW: 0,
    hardDrop: 0,
    hold: 0
  };

  // Track last horizontal direction for SOCD cleaning
  lastDirection: 'left' | 'right' | null = null;

  // Input buffering for game-feel improvements
  bufferedAction: Action | null = null;
  bufferedActionTime: number = 0;
  bufferedMoveAction: Action | null = null;
  bufferedMoveActionTime: number = 0;
  // Split buffer windows for better input precision:
  // Movement is forgiving (120ms) but rotation is tighter (60ms) to prevent double-rotations
  readonly MOVE_BUFFER_WINDOW: number = 120; // ms - Forgiving movement
  readonly ROTATE_BUFFER_WINDOW: number = 60; // ms - Tighter rotation buffer

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
  private touchControls: TouchControls | null = null;

  constructor(game: Game, view: View, viewWebGPU: View, soundManager: SoundManager) {
    this.game = game;
    this.view = view;
    this.viewWebGPU = viewWebGPU;
    this.soundManager = soundManager;
    this.isPlaying = false;
    this.isPaused = false;
    this.gameLoopID = null;
    this.intervalID = null;

    document.addEventListener("keydown", this.handleKeyDown.bind(this));
    document.addEventListener("keyup", this.handleKeyUp.bind(this));

    // Initialize touch controls
    addTouchControlStyles();
    this.touchControls = new TouchControls(this.handleTouchAction.bind(this));

    this.play();
  }

  private handleTouchAction(action: TouchAction): void {
    if (!this.isPlaying || this.isPaused) {
      if (action === 'pause') {
        this.togglePause();
      }
      return;
    }

    switch (action) {
      case 'left':
        this.executeAction('left');
        break;
      case 'right':
        this.executeAction('right');
        break;
      case 'down':
        this.executeAction('down');
        break;
      case 'rotateCW':
        this.executeAction('rotateCW');
        break;
      case 'rotateCCW':
        this.executeAction('rotateCCW');
        break;
      case 'hardDrop':
        this.executeAction('hardDrop');
        break;
      case 'hold':
        this.executeAction('hold');
        break;
      case 'pause':
        this.togglePause();
        break;
    }
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
    this.isPaused = false;

    // Stop gravity timer - now handled in gameLoop
    this.stopTimer();

    this.lastLevel = this.game.level;
    this.lastTime = performance.now();

    // Reset timers to prevent jumps
    this.gravityTimer = 0;
    this.actionTimers.left = 0;
    this.actionTimers.right = 0;
    this.actionTimers.down = 0;

    // Resume music if it was paused
    if (this.soundManager.musicManager.isMusicPaused()) {
      this.soundManager.musicManager.resume();
    } else if (!this.soundManager.musicManager.isMusicPlaying()) {
      // Try to start music if available
      this.soundManager.musicManager.play();
    }

    this.hidePauseMenu();
    this.gameLoop();
  }

  pause(): void {
    if (!this.isPlaying || this.isPaused) return;
    this.isPaused = true;
    this.isPlaying = false;
    
    if (this.gameLoopID) {
        cancelAnimationFrame(this.gameLoopID);
        this.gameLoopID = null;
    }
    
    // Pause music
    this.soundManager.musicManager.pause();
    this.soundManager.playPause();
    
    this.showPauseMenu();
    this.updateView();
  }

  resume(): void {
    if (!this.isPaused) return;
    this.isPaused = false;
    this.isPlaying = true;

    this.lastTime = performance.now();
    
    // Reset timers to prevent jumps
    this.gravityTimer = 0;
    this.actionTimers.left = 0;
    this.actionTimers.right = 0;
    this.actionTimers.down = 0;

    // Resume music
    this.soundManager.musicManager.resume();
    this.soundManager.playResume();

    this.hidePauseMenu();
    this.gameLoop();
  }

  togglePause(): void {
    if (this.game.gameOver) {
      this.reset();
    } else if (this.isPaused) {
      this.resume();
    } else {
      this.pause();
    }
  }

  private showPauseMenu(): void {
    const pauseMenu = document.getElementById('pause-menu');
    if (pauseMenu) {
      // Update pause menu stats
      const state = this.game.getState();
      const pauseScore = document.getElementById('pause-score');
      const pauseLevel = document.getElementById('pause-level');
      const pauseLines = document.getElementById('pause-lines');
      
      if (pauseScore) pauseScore.textContent = state.score.toLocaleString();
      if (pauseLevel) pauseLevel.textContent = state.level.toString();
      if (pauseLines) pauseLines.textContent = state.lines.toString();
      
      pauseMenu.style.display = 'flex';
    }
  }

  private hidePauseMenu(): void {
    const pauseMenu = document.getElementById('pause-menu');
    if (pauseMenu) {
      pauseMenu.style.display = 'none';
    }
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
      this.isPaused = false;
      this.hidePauseMenu();
    } else if (this.isPaused) {
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

    this.isPaused = false;
    this.hidePauseMenu();
    
    // Restart music
    this.soundManager.musicManager.stop();
    this.soundManager.musicManager.play();

    this.play();
  }

  handleKeyDown(event: KeyboardEvent): void {
    if (event.repeat) return;

    const code = event.code;

    // Global keys (Enter, Escape for pause)
    if (code === 'Enter' || code === 'Escape' || event.keyCode === 13 || event.keyCode === 27) {
        this.togglePause();
        return;
    }

    if (!this.isPlaying || this.isPaused) return;

    // Map key to action
    const action = this.keyMap[code];
    if (!action) return;

    this.keys[code] = true;

    // Handle initial press actions
    switch (action) {
        case 'left':
            this.lastDirection = 'left';
            {
                const pxBefore = this.game.activPiece.x;
                this.game.movePieceLeft();
                if (this.game.activPiece.x === pxBefore) {
                    this.bufferedMoveAction = 'left';
                    this.bufferedMoveActionTime = performance.now();
                } else {
                    this.soundManager.playMove();
                }
            }
            this.actionTimers.left = 0;
            break;
        case 'right':
            this.lastDirection = 'right';
            {
                const pxBefore = this.game.activPiece.x;
                this.game.movePieceRight();
                if (this.game.activPiece.x === pxBefore) {
                    this.bufferedMoveAction = 'right';
                    this.bufferedMoveActionTime = performance.now();
                } else {
                    this.soundManager.playMove();
                }
            }
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
                } else {
                     // Jump buffer: if rotation failed, buffer it
                     this.bufferedAction = 'rotateCW';
                     this.bufferedActionTime = performance.now();
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
                } else {
                     // Jump buffer: if rotation failed, buffer it
                     this.bufferedAction = 'rotateCCW';
                     this.bufferedActionTime = performance.now();
                }
                this.soundManager.playRotate();
            }
            break;
        case 'hardDrop':
            {
                const yBefore = this.game.activPiece?.y;
                this.performHardDrop();
                if (this.game.activPiece?.y === yBefore && !this.game.getState().isGameOver) {
                    this.bufferedAction = 'hardDrop';
                    this.bufferedActionTime = performance.now();
                }
            }
            break;
        case 'hold':
            if (this.game.canHold) {
                this.game.hold();
                this.soundManager.playMove();
                this.viewWebGPU.onHold();
            } else {
                this.bufferedAction = 'hold';
                this.bufferedActionTime = performance.now();
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
              {
                  const yBefore = this.game.activPiece?.y;
                  this.performHardDrop();
                  if (this.game.activPiece?.y !== yBefore) {
                      // Successfully dropped
                  }
              }
              break;
          case 'hold':
              if (this.game.canHold) {
                  this.game.hold();
                  this.soundManager.playMove();
              } else {
                  this.bufferedAction = 'hold';
                  this.bufferedActionTime = performance.now();
              }
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
          this.viewWebGPU.onLock(result.tSpin);
      }
      if (result.gameOver) {
          this.soundManager.playGameOver();
          // Save high score on game over
          this.game.saveHighScore();
          this.updateHighScoreDisplay();
      }
  }

  updateHighScoreDisplay(): void {
    const highScoreElement = document.getElementById('high-score');
    if (highScoreElement) {
      const highestScore = this.game.getHighScoreManager().getHighestScore();
      if (highestScore) {
        highScoreElement.textContent = highestScore.score.toLocaleString();
      }
    }
  }

  gameLoop(): void {
    const animate = (time: number) => {
      if (!this.isPlaying || this.isPaused) {
          return;
      }

      const dt = time - this.lastTime;
      this.lastTime = time;

      // 0. Process Buffered Actions
      this.processBufferedAction(time);

      // 1. Handle Input (Movement)
      this.handleInput(dt);

      // 2. Update Game Logic (Gravity, Locking)
      const level = this.game.getState().level;
      // NEON BRICKLAYER: Exponential gravity for better curve (Standard Tetris-ish)
      // Tuned for better playability: 0.85 base makes it slightly faster
      // Clamp to prevent infinite loop at extreme levels
      let speedMs = 1000 * Math.pow(0.85, level - 1);
      // Allow faster than 60Hz (16ms) but clamp to 0.5ms to avoid browser freeze
      if (speedMs < 0.5) speedMs = 0.5;

      // Accumulate gravity time
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
          
          // Update combo display
          this.updateComboDisplay(combo);
      } else if (result.locked) {
          this.soundManager.playLock();
          this.viewWebGPU.onLock(result.tSpin);
          // Reset combo display when piece locks without clearing
          if (this.game.scoringSystem.combo < 0) {
            this.updateComboDisplay(0);
          }
      }
      if (result.gameOver) {
          this.soundManager.playGameOver();
          this.isPlaying = false;
          this.view.renderEndScreen(this.game.getState());
          // Save high score on game over
          this.game.saveHighScore();
          this.updateHighScoreDisplay();
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

  updateComboDisplay(combo: number): void {
    const comboDisplay = document.getElementById('combo-display');
    if (comboDisplay) {
      if (combo > 1) {
        const oldCombo = parseInt(comboDisplay.dataset.combo || '0');
        comboDisplay.textContent = `COMBO x${combo}`;
        comboDisplay.dataset.combo = combo.toString();
        comboDisplay.classList.add('active');
        
        // Remove old combo level classes
        comboDisplay.className = comboDisplay.className.replace(/combo-\d+/g, '');
        
        // Add appropriate combo level class
        if (combo >= 20) {
          comboDisplay.classList.add('combo-20');
        } else if (combo >= 15) {
          comboDisplay.classList.add('combo-15');
        } else if (combo >= 10) {
          comboDisplay.classList.add('combo-10');
        } else if (combo >= 9) {
          comboDisplay.classList.add('combo-9');
        } else if (combo >= 8) {
          comboDisplay.classList.add('combo-8');
        } else if (combo >= 7) {
          comboDisplay.classList.add('combo-7');
        } else if (combo >= 6) {
          comboDisplay.classList.add('combo-6');
        } else if (combo >= 5) {
          comboDisplay.classList.add('combo-5');
        } else if (combo >= 4) {
          comboDisplay.classList.add('combo-4');
        } else if (combo >= 3) {
          comboDisplay.classList.add('combo-3');
        } else {
          comboDisplay.classList.add('combo-2');
        }
        
        // Trigger pulse animation
        comboDisplay.classList.remove('combo-pulse');
        void comboDisplay.offsetWidth; // Trigger reflow
        comboDisplay.classList.add('combo-pulse');
        
        // Show milestone celebration for 5, 10, 15, 20, etc.
        if (combo > oldCombo && combo % 5 === 0) {
          this.showComboMilestone(combo);
        }
      } else {
        comboDisplay.classList.remove('active');
        comboDisplay.classList.remove('combo-pulse');
        comboDisplay.className = comboDisplay.className.replace(/combo-\d+/g, '');
        comboDisplay.dataset.combo = '0';
      }
    }
  }

  showComboMilestone(combo: number): void {
    // Check if milestone element exists, create if not
    let milestoneEl = document.getElementById('combo-milestone');
    if (!milestoneEl) {
      milestoneEl = document.createElement('div');
      milestoneEl.id = 'combo-milestone';
      milestoneEl.className = 'combo-milestone';
      document.body.appendChild(milestoneEl);
    }
    
    milestoneEl.textContent = `${combo}x COMBO!`;
    milestoneEl.classList.remove('show');
    void milestoneEl.offsetWidth; // Trigger reflow
    milestoneEl.classList.add('show');
    
    // Also show as floating text
    this.view.showFloatingText(`${combo}x COMBO!`, 'INCREDIBLE!');
  }

  private processBufferedAction(currentTime: number): void {
      if (this.bufferedMoveAction) {
          if (currentTime - this.bufferedMoveActionTime > this.MOVE_BUFFER_WINDOW) {
              this.bufferedMoveAction = null;
          } else {
              let moveSuccess = false;
              if (this.bufferedMoveAction === 'left') {
                  const pxBefore = this.game.activPiece.x;
                  this.game.movePieceLeft();
                  if (this.game.activPiece.x !== pxBefore) moveSuccess = true;
              } else if (this.bufferedMoveAction === 'right') {
                  const pxBefore = this.game.activPiece.x;
                  this.game.movePieceRight();
                  if (this.game.activPiece.x !== pxBefore) moveSuccess = true;
              }
              if (moveSuccess) {
                  this.soundManager.playMove();
                  this.bufferedMoveAction = null;
              }
          }
      }

      if (!this.bufferedAction) return;

      // Determine correct buffer window for the buffered action
      const isRotate = this.bufferedAction === 'rotateCW' || this.bufferedAction === 'rotateCCW';
      const bufferWindow = isRotate ? this.ROTATE_BUFFER_WINDOW : this.MOVE_BUFFER_WINDOW;

      // Clear buffer if it's too old
      if (currentTime - this.bufferedActionTime > bufferWindow) {
          this.bufferedAction = null;
          return;
      }

      // Try to execute buffered action
      let success = false;
      if (this.bufferedAction === 'rotateCW') {
          const rBefore = this.game.activPiece.rotation;
          this.game.rotatePiece(true);
          if (this.game.activPiece.rotation !== rBefore) {
              this.viewWebGPU.onRotate();
              success = true;
          }
      } else if (this.bufferedAction === 'rotateCCW') {
          const rBefore = this.game.activPiece.rotation;
          this.game.rotatePiece(false);
          if (this.game.activPiece.rotation !== rBefore) {
              this.viewWebGPU.onRotate();
              success = true;
          }
      } else if (this.bufferedAction === 'hold') {
          if (this.game.canHold) {
              this.game.hold();
              this.soundManager.playMove();
              this.viewWebGPU.onHold();
              success = true;
          }
      } else if (this.bufferedAction === 'hardDrop') {
          const yBefore = this.game.activPiece?.y;
          this.performHardDrop();
          if (this.game.activPiece?.y !== yBefore) {
              success = true;
          }
      }

      if (success) {
          this.bufferedAction = null;
      }
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
          this.actionTimers.left += dt;
          if (this.actionTimers.left > DAS) {
              while (this.actionTimers.left > DAS + ARR) {
                  this.game.movePieceLeft();
                  this.soundManager.playMove();
                  // NEON BRICKLAYER: DAS Trail
                  this.viewWebGPU.onMove(this.game.activPiece.x, this.game.activPiece.y);
                  this.actionTimers.left -= ARR;
              }
          }
      } else if (moveRight) {
          this.actionTimers.right += dt;
          if (this.actionTimers.right > DAS) {
              while (this.actionTimers.right > DAS + ARR) {
                  this.game.movePieceRight();
                  this.soundManager.playMove();
                  // NEON BRICKLAYER: DAS Trail
                  this.viewWebGPU.onMove(this.game.activPiece.x, this.game.activPiece.y);
                  this.actionTimers.right -= ARR;
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
          this.actionTimers.down += dt;
          if (this.actionTimers.down > SOFT_DROP_SPEED) {
             // Sonic Drop: Allow multiple steps per frame if dt is large
             let steps = (this.actionTimers.down / SOFT_DROP_SPEED) | 0;
             this.actionTimers.down %= SOFT_DROP_SPEED;
             // Cap steps to prevent freeze/tunneling
             // Rather than calling the expensive `getGhostY` every frame just to cap steps,
             // cap it to the maximum playfield height (20) plus hidden rows (2), relying on the break below.
             if (steps > 22) steps = 22;

             // Only move down if it's not going to lock immediately
             // Give a small rotation buffer by not soft dropping into a lock if dt is huge
             for (let i = 0; i < steps; i++) {
                 const prevY = this.game.activPiece.y;
                 this.game.movePieceDown();
                 // NEON BRICKLAYER: Soft Drop Trail
                 this.viewWebGPU.onMove(this.game.activPiece.x, this.game.activPiece.y);

                 if (prevY === this.game.activPiece.y) {
                     // Hit the ground, stop processing extra down steps this frame to allow rotation buffer
                     break;
                 }
             }
          }
      } else {
          this.actionTimers.down = 0;
      }
  }
}
