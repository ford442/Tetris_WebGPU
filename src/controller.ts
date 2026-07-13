import Game from "./game.js";
import type { IView } from "./view/IView.js";
import SoundManager from "./sound.js";
import { TouchControls, TouchAction, addTouchControlStyles } from "./input/touchControls.js";
import { SubliminalReinforcement } from "./effects/subliminalReinforcement.js";
import { INPUT_CONFIG } from "./config/gameConfig.js";
import { ReplayRecorder, generateReplaySeed } from "./replay/recorder.js";
import type { ReplayActionName } from "./replay/actions.js";
import type { ReplayFile } from "./replay/format.js";
import { announce, announceGameOver, announceLevelUp, announceLineClear } from "./a11y/announcer.js";
import { onPauseMenuClose, onPauseMenuOpen } from "./a11y/keyboardNav.js";

const DAS = INPUT_CONFIG.DAS; // Delayed Auto Shift (ms) - Faster for improved responsiveness and top-level play
const ARR = INPUT_CONFIG.ARR;  // Auto Repeat Rate (ms) - Instant piece movement when holding left or right
const SOFT_DROP_SPEED = INPUT_CONFIG.SOFT_DROP_SPEED; // Sonic Drop: Even faster soft drop for instant tactile feedback

// Logical actions
type Action = 'left' | 'right' | 'down' | 'rotateCW' | 'rotateCCW' | 'hardDrop' | 'hold';

export default class Controller {
  game: Game;
  view: IView;
  viewWebGPU: IView;
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

  // Experimental: Positive Reinforcement Subliminal System (wired from index.ts)
  subliminal: SubliminalReinforcement | null = null;
  private playTimeMs: number = 0;

  // Input buffering for game-feel improvements
  bufferedAction: Action | null = null;
  bufferedActionTime: number = 0;
  bufferedMoveAction: Action | null = null;
  bufferedMoveActionTime: number = 0;
  // Split buffer windows for better input precision:
  // Movement is tighter (80ms) and rotation is very tight (60ms) to prevent double-rotations and ensure maximum snappiness
  readonly MOVE_BUFFER_WINDOW: number = INPUT_CONFIG.MOVE_BUFFER_WINDOW; // ms - Tighter, snappier movement
  readonly JUMP_BUFFER_WINDOW: number = INPUT_CONFIG.ROTATE_BUFFER_WINDOW; // ms - Strict buffer for jump-like actions to prevent double-rotation

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

  /** Replay capture for the current run. */
  readonly replayRecorder = new ReplayRecorder();
  lastReplayFile: ReplayFile | null = null;
  onReplayFinished: ((file: ReplayFile) => void) | null = null;

  constructor(game: Game, view: IView, viewWebGPU: IView, soundManager: SoundManager) {
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
    new TouchControls(
      this.handleTouchAction.bind(this),
      {},
      () => {
        void this.soundManager.unlockAudio();
      },
    );

    this.play();
  }

  private audioColumn(): number {
    return this.game.activPiece?.x ?? 4;
  }

  private audioPieceType(): string {
    return this.game.activPiece?.type ?? 'T';
  }

  private playMoveSound(direction: 'left' | 'right' | 'down'): void {
    this.game.runStats.recordMove();
    this.soundManager.playMove(direction, this.audioColumn());
  }

  private recordFinesseFault(): void {
    this.game.runStats.recordFinesseFault();
  }

  private playScoringAudio(
    result: { linesCleared: number[]; locked: boolean; tSpin: boolean },
    pieceType: string,
    pieceCol: number,
  ): void {
    if (result.linesCleared.length > 0) {
      const scoreEvent = this.game.scoreEvent;
      const combo = scoreEvent?.combo ?? 0;
      const b2b = scoreEvent?.backToBack ?? false;
      this.soundManager.playLineClear(result.linesCleared.length, combo, b2b, pieceCol);
      if (result.tSpin) this.soundManager.playTSpin();
      this.soundManager.musicManager.setGameplayIntensity(this.game.level, combo);
      return;
    }
    if (result.locked) {
      this.soundManager.playLock(pieceType, pieceCol);
      if (result.tSpin) this.soundManager.playTSpin();
    }
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
    void this.soundManager.unlockAudio();
    this.isPlaying = true;
    this.isPaused = false;

    if (!this.replayRecorder.isRecording) {
      this.beginReplaySession();
    }

    // Stop gravity timer - now handled in gameLoop
    this.stopTimer();
    this.playTimeMs = 0;

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
    this.updateModeHud();
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
    void this.soundManager.unlockAudio();
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
    if (this.game.isRunEnded) {
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
    onPauseMenuOpen();
  }

  private hidePauseMenu(): void {
    const pauseMenu = document.getElementById('pause-menu');
    if (pauseMenu) {
      pauseMenu.style.display = 'none';
    }
    onPauseMenuClose();
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

    // Check run end (top-out defeat or mode victory)
    if (state.isGameOver || state.isVictory) {
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
    this.beginReplaySession();

    // Reset timers
    this.gravityTimer = 0;
    this.actionTimers.left = 0;
    this.actionTimers.right = 0;
    this.actionTimers.down = 0;
    this.playTimeMs = 0;

    this.isPaused = false;
    this.hidePauseMenu();
    
    // Restart music
    this.soundManager.musicManager.stop();
    this.soundManager.musicManager.play();

    this.play();
  }

  private beginReplaySession(): void {
    const seed = generateReplaySeed();
    this.game.reset({ seed });
    this.replayRecorder.start(seed, this.game.modeId);
    this.lastReplayFile = null;
  }

  private recordReplay(action: ReplayActionName): void {
    this.replayRecorder.recordAction(action);
  }

  /** Touch controls entry point (also used for replay hooks). */
  executeAction(action: Action): void {
    if (!this.isPlaying || this.isPaused) return;
    switch (action) {
      case 'left':
        this.game.movePieceLeft();
        this.recordReplay('left');
        this.playMoveSound('left');
        this.actionTimers.left = 0;
        break;
      case 'right':
        this.game.movePieceRight();
        this.recordReplay('right');
        this.playMoveSound('right');
        this.actionTimers.right = 0;
        break;
      case 'down':
        this.game.movePieceDown();
        this.recordReplay('down');
        this.playMoveSound('down');
        this.actionTimers.down = 0;
        break;
      case 'rotateCW':
        this.game.rotatePiece(true);
        this.recordReplay('rotateCW');
        this.soundManager.playRotate();
        this.viewWebGPU.onRotate();
        break;
      case 'rotateCCW':
        this.game.rotatePiece(false);
        this.recordReplay('rotateCCW');
        this.soundManager.playRotate();
        this.viewWebGPU.onRotate();
        break;
      case 'hardDrop':
        this.recordReplay('hardDrop');
        void this.performHardDropAsync();
        break;
      case 'hold':
        if (this.game.canHold) {
          this.game.hold();
          this.recordReplay('hold');
          this.soundManager.playHold();
          this.viewWebGPU.onHold();
        }
        break;
    }
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

    // Dev/QA: extreme camera for edge-case transparency verification.
    // Toggle with 'M'. Persists via localStorage and is polled in viewRenderLoop.
    if (code === 'KeyM') {
      if (typeof localStorage !== 'undefined') {
        const cur = localStorage.getItem('tetris_debug_extreme_camera') === '1';
        localStorage.setItem('tetris_debug_extreme_camera', cur ? '0' : '1');
      }
      return;
    }

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
                    this.recordFinesseFault();
                } else {
                    this.recordReplay('left');
                    this.playMoveSound('left');
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
                    this.recordFinesseFault();
                } else {
                    this.recordReplay('right');
                    this.playMoveSound('right');
                }
            }
            this.actionTimers.right = 0;
            break;
        case 'down':
            this.game.movePieceDown();
            this.recordReplay('down');
            this.playMoveSound('down');
            this.viewWebGPU.visualEffects?.triggerGhostTrail?.(0.1);
            this.viewWebGPU.visualEffects?.triggerMovementFlash?.(0.15);
            if (this.game.activPiece && (this.viewWebGPU as any).particleSystem) {
                const worldX = (this.game.activPiece.x + 1.5) * 2.2;
                const worldY = (this.game.activPiece.y + 1.5) * -2.2;
                for(let i = 0; i < 3; i++) {
                    const spreadX = (Math.random() - 0.5) * 4.0;
                    const spreadY = (Math.random() - 0.5) * 4.0;
                    (this.viewWebGPU as any).particleSystem.emitParticlesRadial(
                        worldX + spreadX, worldY + spreadY, 0.0,
                        Math.PI / 2 + (Math.random() - 0.5) * 0.5,
                        10.0 + Math.random() * 15.0,
                        [0.2, 0.8, 1.0, 0.6] // Cyan trail
                    );
                }
            }
            this.actionTimers.down = 0;
            break;
        case 'rotateCW':
            {
                const rBefore = this.game.activPiece.rotation;
                this.game.rotatePiece(true);
                if (this.game.activPiece.rotation !== rBefore) {
                     this.recordReplay('rotateCW');
                     this.game.runStats.recordRotate();
                     this.viewWebGPU.onRotate();
                } else {
                     this.bufferedAction = 'rotateCW';
                     this.bufferedActionTime = performance.now();
                     this.recordFinesseFault();
                }
                this.soundManager.playRotate();
            }
            break;
        case 'rotateCCW':
            {
                const rBefore = this.game.activPiece.rotation;
                this.game.rotatePiece(false);
                if (this.game.activPiece.rotation !== rBefore) {
                     this.recordReplay('rotateCCW');
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
                this.recordReplay('hardDrop');
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
                this.recordReplay('hold');
              const holdEl = document.querySelector('.hold-piece-container');
              if (holdEl) {
                  holdEl.classList.remove('swap-whoosh-active');
                  void (holdEl as HTMLElement).offsetWidth; // trigger reflow
                  holdEl.classList.add('swap-whoosh-active');
              }
                this.soundManager.playHold();
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
        const action = this.keyMap[code];
        if (action === 'left' && this.lastDirection === 'left') {
          if (this.isActionPressed('right')) {
            this.lastDirection = 'right';
          } else {
            this.lastDirection = null;
          }
        } else if (action === 'right' && this.lastDirection === 'right') {
          if (this.isActionPressed('left')) {
            this.lastDirection = 'left';
          } else {
            this.lastDirection = null;
          }
        }
    }
  }

  onKeyPress(code: string): void {
      const action = this.keyMap[code];
      if (!action) return;

      switch (action) {
          case 'left':
              this.game.movePieceLeft();
              this.recordReplay('left');
              this.playMoveSound('left');
              this.actionTimers.left = 0;
              break;
          case 'right':
              this.game.movePieceRight();
              this.recordReplay('right');
              this.playMoveSound('right');
              this.actionTimers.right = 0;
              break;
          case 'down':
              this.game.movePieceDown();
              this.recordReplay('down');
              this.playMoveSound('down');
              this.viewWebGPU.visualEffects?.triggerGhostTrail?.(0.1);
              this.viewWebGPU.visualEffects?.triggerMovementFlash?.(0.15);
            if (this.game.activPiece && (this.viewWebGPU as any).particleSystem) {
                const worldX = (this.game.activPiece.x + 1.5) * 2.2;
                const worldY = (this.game.activPiece.y + 1.5) * -2.2;
                for(let i = 0; i < 3; i++) {
                    const spreadX = (Math.random() - 0.5) * 4.0;
                    const spreadY = (Math.random() - 0.5) * 4.0;
                    (this.viewWebGPU as any).particleSystem.emitParticlesRadial(
                        worldX + spreadX, worldY + spreadY, 0.0,
                        Math.PI / 2 + (Math.random() - 0.5) * 0.5,
                        10.0 + Math.random() * 15.0,
                        [0.2, 0.8, 1.0, 0.6] // Cyan trail
                    );
                }
            }
              this.actionTimers.down = 0;
              break;
          case 'rotateCW':
              {
                const rBefore = this.game.activPiece.rotation;
                this.game.rotatePiece(true);
                if (this.game.activPiece.rotation !== rBefore) {
                     this.recordReplay('rotateCW');
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
                     this.recordReplay('rotateCCW');
                     this.viewWebGPU.onRotate();
                }
                this.soundManager.playRotate();
              }
              break;
          case 'hardDrop':
              {
                  const yBefore = this.game.activPiece?.y;
                  this.recordReplay('hardDrop');
                  this.performHardDrop();
                  if (this.game.activPiece?.y !== yBefore) {
                      // Successfully dropped
                  }
              }
              break;
          case 'hold':
              if (this.game.canHold) {
                  this.game.hold();
                  this.recordReplay('hold');
              const holdEl = document.querySelector('.hold-piece-container');
              if (holdEl) {
                  holdEl.classList.remove('swap-whoosh-active');
                  void (holdEl as HTMLElement).offsetWidth; // trigger reflow
                  holdEl.classList.add('swap-whoosh-active');
              }
                  this.soundManager.playHold();
              } else {
                  this.bufferedAction = 'hold';
                  this.bufferedActionTime = performance.now();
              }
              break;
      }
  }

  performHardDrop(): void {
      void this.performHardDropAsync();
  }

  async performHardDropAsync(): Promise<void> {
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

      const pieceType = this.audioPieceType();
      const pieceCol = this.audioColumn();

      const result = await this.game.hardDropAsync();
      this.soundManager.playHardDrop();

      this.viewWebGPU.onHardDrop(currentX, ghostY, dropDist, colorIdx);

      if (result.linesCleared.length > 0) {
          const scoreEvent = this.game.scoreEvent;
          const combo = scoreEvent ? scoreEvent.combo : 0;
          const b2b = scoreEvent ? scoreEvent.backToBack : false;
          const isAllClear = scoreEvent ? scoreEvent.isAllClear : false;

          this.playScoringAudio(result, pieceType, pieceCol);
          this.viewWebGPU.onLineClear(result.linesCleared, result.tSpin, combo, b2b, isAllClear);
          announceLineClear(result.linesCleared.length, this.game.score, combo, result.tSpin);
      } else if (result.locked) {
          this.playScoringAudio(result, pieceType, pieceCol);
          this.viewWebGPU.onLock(result.tSpin);
      }
      if (result.gameOver || this.game.victory) {
          this.soundManager.playGameOver();
          // Save leaderboard on run end
          const isNewHigh = this.game.saveModeLeaderboard();
          this.updateHighScoreDisplay();
          if (isNewHigh && this.subliminal) {
            this.subliminal.triggerReinforcement('highScore', 'strong');
          }
      }
  }

  updateHighScoreDisplay(): void {
    const highScoreElement = document.getElementById('high-score');
    const highScoreLabel = document.getElementById('high-score-label');
    const state = this.game.getState();
    if (highScoreLabel) {
      highScoreLabel.textContent = state.modeHighScoreLabel;
    }
    if (highScoreElement) {
      highScoreElement.textContent = this.game.getModeLeaderboardDisplay();
    }
  }

  updateModeHud(state = this.game.getState()): void {
    const modeLabel = document.getElementById('mode-label');
    const primaryLabel = document.getElementById('mode-hud-primary-label');
    const primaryValue = document.getElementById('mode-hud-primary-value');
    const secondaryLabel = document.getElementById('mode-hud-secondary-label');
    const secondaryValue = document.getElementById('mode-hud-secondary-value');
    const levelBox = document.getElementById('level-panel-box');

    if (modeLabel) modeLabel.textContent = state.modeLabel;
    if (primaryLabel) primaryLabel.textContent = state.modePrimaryLabel;
    if (primaryValue) primaryValue.textContent = state.modePrimaryValue;

    if (secondaryLabel && secondaryValue) {
      const show = state.modeShowSecondary;
      secondaryLabel.style.display = show ? '' : 'none';
      secondaryValue.style.display = show ? '' : 'none';
      if (show) {
        secondaryLabel.textContent = state.modeSecondaryLabel;
        secondaryValue.textContent = state.modeSecondaryValue;
      }
    }

    if (levelBox) {
      levelBox.style.display = state.modeShowLevel ? '' : 'none';
    }
  }

  gameLoop(): void {
    const animate = (time: number) => {
      if (!this.isPlaying || this.isPaused) {
          return;
      }

      void this.runGameFrame(time).then((shouldContinue) => {
        if (shouldContinue) {
          this.gameLoopID = requestAnimationFrame(animate);
        }
      });
    };

    this.gameLoopID = requestAnimationFrame(animate);
  }

  private async runGameFrame(time: number): Promise<boolean> {
      if (!this.isPlaying || this.isPaused) {
          return false;
      }

      const dt = time - this.lastTime;
      this.lastTime = time;
      this.replayRecorder.advanceClock(dt);

      // Experimental subliminal: accumulate active play time (paused games don't count)
      if (this.isPlaying && !this.isPaused) {
        this.playTimeMs += dt;
        this.subliminal?.checkBackgroundReinforcement(this.playTimeMs);
        this.game.tickMode(dt);
      }

      // 0. Process Buffered Actions
      this.processBufferedAction(time);

      // 1. Handle Input (Movement)
      this.handleInput(dt);

      // 2. Update Game Logic (Gravity, Locking)
      const level = this.game.getEffectiveLevel();
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

      // Game update (lock delay) — GPU line detection when pipeline is ready
      const lockPieceType = this.audioPieceType();
      const lockPieceCol = this.audioColumn();
      const result = await this.game.updateAsync(dt);

      // Check level up
      if (this.game.level > this.lastLevel) {
          this.soundManager.playLevelUp(this.game.level);
          announceLevelUp(this.game.level);
          this.lastLevel = this.game.level;
          // Experimental subliminal reinforcement (strong on level up)
          this.subliminal?.triggerReinforcement('levelUp', 'strong');
      }

      const pieceType = lockPieceType;
      const pieceCol = lockPieceCol;

      if (result.linesCleared.length > 0) {
          const scoreEvent = this.game.scoreEvent;
          const combo = scoreEvent ? scoreEvent.combo : 0;
          const b2b = scoreEvent ? scoreEvent.backToBack : false;
          const isAllClear = scoreEvent ? scoreEvent.isAllClear : false;

          this.playScoringAudio(result, pieceType, pieceCol);
          this.viewWebGPU.onLineClear(result.linesCleared, result.tSpin, combo, b2b, isAllClear);
          announceLineClear(result.linesCleared.length, this.game.score, combo, result.tSpin);
          
          // Update combo display
          this.updateComboDisplay(combo);

          // Experimental: subliminal positive reinforcement on clears
          if (this.subliminal) {
            const intensity = (combo >= 4 || result.tSpin) ? 'strong' : 'normal';
            this.subliminal.triggerReinforcement('lineClear', intensity);
          }
      } else if (result.locked) {
          this.playScoringAudio(result, pieceType, pieceCol);
          this.viewWebGPU.onLock(result.tSpin);
          // Reset combo display when piece locks without clearing
          if (this.game.scoringSystem.combo < 0) {
            this.updateComboDisplay(0);
          }
          // T-Spin lock is a strong positive moment
          if (result.tSpin && this.subliminal) {
            this.subliminal.triggerReinforcement('tspin', 'strong');
          }
      }
      if (result.gameOver || this.game.victory) {
          this.finishReplayRecording();
          this.soundManager.playGameOver();
          this.isPlaying = false;
          const endState = this.game.getState();
          announceGameOver(endState.score, endState.isVictory);
          this.view.renderEndScreen(endState);
          const isNewHigh = this.game.saveModeLeaderboard();
          this.updateHighScoreDisplay();
          if (isNewHigh && this.subliminal) {
            this.subliminal.triggerReinforcement('highScore', 'strong');
          }
          return false;
      }

      // 3. Render
      const state = this.game.getState();
      this.updateModeHud(state);
      this.view.renderMainScreen(state);
      this.viewWebGPU.state = state;

      // Call View.render directly (Synchronized with Game Loop)
      // Pass dt in seconds
      this.viewWebGPU.render(dt / 1000.0);

      return true;
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
                  this.recordReplay(this.bufferedMoveAction === 'left' ? 'left' : 'right');
                  this.playMoveSound(this.bufferedMoveAction === 'left' ? 'left' : 'right');
                  this.bufferedMoveAction = null;
              }
          }
      }

      if (!this.bufferedAction) return;

      // Determine correct buffer window for the buffered action
      const isRotate = this.bufferedAction === 'rotateCW' || this.bufferedAction === 'rotateCCW';
      const bufferWindow = (isRotate || this.bufferedAction === 'hold') ? this.JUMP_BUFFER_WINDOW : this.MOVE_BUFFER_WINDOW;

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
              this.recordReplay('rotateCW');
              this.viewWebGPU.onRotate();
              success = true;
          }
      } else if (this.bufferedAction === 'rotateCCW') {
          const rBefore = this.game.activPiece.rotation;
          this.game.rotatePiece(false);
          if (this.game.activPiece.rotation !== rBefore) {
              this.recordReplay('rotateCCW');
              this.viewWebGPU.onRotate();
              success = true;
          }
      } else if (this.bufferedAction === 'hold') {
          if (this.game.canHold) {
              this.game.hold();
              this.recordReplay('hold');
              const holdEl = document.querySelector('.hold-piece-container');
              if (holdEl) {
                  holdEl.classList.remove('swap-whoosh-active');
                  void (holdEl as HTMLElement).offsetWidth; // trigger reflow
                  holdEl.classList.add('swap-whoosh-active');
              }
              this.soundManager.playHold();
              this.viewWebGPU.onHold();
              success = true;
          }
      } else if (this.bufferedAction === 'hardDrop') {
          const yBefore = this.game.activPiece?.y;
          this.recordReplay('hardDrop');
          this.performHardDrop();
          if (this.game.activPiece?.y !== yBefore) {
              success = true;
          }
      }

      if (success) {
          this.bufferedAction = null;
      }
  }

  private finishReplayRecording(): void {
    if (!this.replayRecorder.isRecording) return;
    this.lastReplayFile = this.replayRecorder.stop();
    this.onReplayFinished?.(this.lastReplayFile);
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
              if (ARR === 0) {
                  this.game.movePieceLeft();
                  this.recordReplay('left');
                  this.playMoveSound('left');
                  // NEON BRICKLAYER: DAS Trail
                  this.viewWebGPU.onMove(this.game.activPiece.x, this.game.activPiece.y);
                  this.actionTimers.left = DAS;
              } else {
                  while (this.actionTimers.left > DAS + ARR) {
                      this.game.movePieceLeft();
                      this.recordReplay('left');
                      this.playMoveSound('left');
                      // NEON BRICKLAYER: DAS Trail
                      this.viewWebGPU.onMove(this.game.activPiece.x, this.game.activPiece.y);
                      this.actionTimers.left -= ARR;
                  }
              }
          }
      } else if (moveRight) {
          this.actionTimers.right += dt;
          if (this.actionTimers.right > DAS) {
              if (ARR === 0) {
                  this.game.movePieceRight();
                  this.recordReplay('right');
                  this.playMoveSound('right');
                  // NEON BRICKLAYER: DAS Trail
                  this.viewWebGPU.onMove(this.game.activPiece.x, this.game.activPiece.y);
                  this.actionTimers.right = DAS;
              } else {
                  while (this.actionTimers.right > DAS + ARR) {
                      this.game.movePieceRight();
                      this.recordReplay('right');
                      this.playMoveSound('right');
                      // NEON BRICKLAYER: DAS Trail
                      this.viewWebGPU.onMove(this.game.activPiece.x, this.game.activPiece.y);
                      this.actionTimers.right -= ARR;
                  }
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
                 if (prevY !== this.game.activPiece.y) {
                   this.recordReplay('down');
                 }
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
