import type Game from "./game.js";
import type { IView } from "./view/IView.js";
import type SoundManager from "./sound.js";
import { TouchControls, type TouchAction, addTouchControlStyles } from "./input/touchControls.js";
import { processDasArrInput, isActionPressed as checkActionPressed } from "./input/dasArr.js";
import { processInputBuffer } from "./input/inputBuffer.js";
import {
  hidePauseMenu as hidePauseMenuDom,
  showPauseMenu as showPauseMenuDom,
  updateComboDisplay as updateComboDisplayDom,
  updateHighScoreDisplay as updateHighScoreDisplayDom,
  updateModeHud as updateModeHudDom,
  showComboMilestone as showComboMilestoneDom,
} from "./controller/hudBridge.js";
import { startGameLoop, stopGameLoop } from "./controller/gameLoop.js";
import { type SubliminalReinforcement } from "./effects/subliminalReinforcement.js";
import { INPUT_CONFIG } from "./config/gameConfig.js";
import { ReplayRecorder, generateReplaySeed } from "./replay/recorder.js";
import type { ReplayActionName } from "./replay/actions.js";
import type { ReplayFile } from "./replay/format.js";
import { announceLineClear } from "./a11y/announcer.js";

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

  // Input buffering for game-feel improvements
  bufferedAction: Action | null = null;
  bufferedActionTime: number = 0;
  bufferedMoveAction: 'left' | 'right' | null = null;
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

  lastTime: number = 0;
  lastLevel: number = 1;
  playTimeMs: number = 0;
  gravityTimer: number = 0;

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

  audioColumn(): number {
    return this.game.activPiece?.x ?? 4;
  }

  audioPieceType(): string {
    return this.game.activPiece?.type ?? 'T';
  }

  private playMoveSound(direction: 'left' | 'right' | 'down'): void {
    this.game.runStats.recordMove();
    this.soundManager.playMove(direction, this.audioColumn());
  }

  private recordFinesseFault(): void {
    this.game.runStats.recordFinesseFault();
  }

  playScoringAudio(
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

    stopGameLoop(this);

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
    showPauseMenuDom(this.game.getState());
  }

  private hidePauseMenu(): void {
    hidePauseMenuDom();
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
        this.viewWebGPU.onRotate?.();
        break;
      case 'rotateCCW':
        this.game.rotatePiece(false);
        this.recordReplay('rotateCCW');
        this.soundManager.playRotate();
        this.viewWebGPU.onRotate?.();
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
          this.viewWebGPU.onHold?.();
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
                     this.viewWebGPU.onRotate?.();
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
                     this.viewWebGPU.onRotate?.();
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
                this.viewWebGPU.onHold?.();
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
                     this.viewWebGPU.onRotate?.();
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
                     this.viewWebGPU.onRotate?.();
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

      this.viewWebGPU.onHardDrop?.(currentX, ghostY, dropDist, colorIdx);

      if (result.linesCleared.length > 0) {
          const scoreEvent = this.game.scoreEvent;
          const combo = scoreEvent ? scoreEvent.combo : 0;
          const b2b = scoreEvent ? scoreEvent.backToBack : false;
          const isAllClear = scoreEvent ? scoreEvent.isAllClear : false;

          this.playScoringAudio(result, pieceType, pieceCol);
          this.viewWebGPU.onLineClear?.(result.linesCleared, result.tSpin, combo, b2b, isAllClear);
          announceLineClear(result.linesCleared.length, this.game.score, combo, result.tSpin);
      } else if (result.locked) {
          this.playScoringAudio(result, pieceType, pieceCol);
          this.viewWebGPU.onLock?.(result.tSpin);
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
    updateHighScoreDisplayDom(this.game);
  }

  updateModeHud(state = this.game.getState()): void {
    updateModeHudDom(state);
  }

  gameLoop(): void {
    startGameLoop(this);
  }

  updateComboDisplay(combo: number): void {
    updateComboDisplayDom(combo, this.view);
  }

  showComboMilestone(combo: number): void {
    showComboMilestoneDom(combo, this.view);
  }

  processBufferedAction(currentTime: number): void {
    processInputBuffer({
      bufferedAction: this.bufferedAction,
      bufferedActionTime: this.bufferedActionTime,
      bufferedMoveAction: this.bufferedMoveAction,
      bufferedMoveActionTime: this.bufferedMoveActionTime,
      moveBufferWindow: this.MOVE_BUFFER_WINDOW,
      jumpBufferWindow: this.JUMP_BUFFER_WINDOW,
      getActivPieceX: () => this.game.activPiece.x,
      getActivPieceY: () => this.game.activPiece?.y,
      getActivPieceRotation: () => this.game.activPiece.rotation,
      canHold: this.game.canHold,
      moveLeft: () => { this.game.movePieceLeft(); },
      moveRight: () => { this.game.movePieceRight(); },
      rotateCW: () => {
        const rBefore = this.game.activPiece.rotation;
        this.game.rotatePiece(true);
        return this.game.activPiece.rotation !== rBefore;
      },
      rotateCCW: () => {
        const rBefore = this.game.activPiece.rotation;
        this.game.rotatePiece(false);
        return this.game.activPiece.rotation !== rBefore;
      },
      performHold: () => {
        if (!this.game.canHold) return false;
        this.game.hold();
        return true;
      },
      performHardDrop: () => { this.performHardDrop(); },
      recordReplay: (action) => this.recordReplay(action),
      playMoveSound: (direction) => this.playMoveSound(direction),
      playHoldSound: () => this.soundManager.playHold(),
      onRotate: () => { this.viewWebGPU.onRotate?.(); },
      onHold: () => { this.viewWebGPU.onHold?.(); },
    }, currentTime);
  }

  finishReplayRecording(): void {
    if (!this.replayRecorder.isRecording) return;
    this.lastReplayFile = this.replayRecorder.stop();
    this.onReplayFinished?.(this.lastReplayFile);
  }

  isActionPressed(action: Action): boolean {
    return checkActionPressed(action, this.keys, this.keyMap);
  }

  handleInput(dt: number): void {
    processDasArrInput({
      keys: this.keys,
      keyMap: this.keyMap,
      actionTimers: this.actionTimers,
      lastDirection: this.lastDirection,
      moveLeft: () => {
        this.game.movePieceLeft();
        this.recordReplay('left');
        this.playMoveSound('left');
        this.viewWebGPU.onMove?.(this.game.activPiece.x, this.game.activPiece.y);
      },
      moveRight: () => {
        this.game.movePieceRight();
        this.recordReplay('right');
        this.playMoveSound('right');
        this.viewWebGPU.onMove?.(this.game.activPiece.x, this.game.activPiece.y);
      },
      moveDown: () => {
        const prevY = this.game.activPiece.y;
        this.game.movePieceDown();
        this.viewWebGPU.onMove?.(this.game.activPiece.x, this.game.activPiece.y);
        return prevY !== this.game.activPiece.y;
      },
      recordDownReplay: () => { this.recordReplay('down'); },
    }, dt);
  }
}
