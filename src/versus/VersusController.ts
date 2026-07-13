/**
 * Local split-screen 2P — dual Game instances, garbage attacks, shared WebGPU view.
 */

import Game from './game.js';
import type { IView } from './view/IView.js';
import type { WebGPUViewHost } from './view/viewTypes.js';
import SoundManager from './sound.js';
import { INPUT_CONFIG } from './config/gameConfig.js';
import { PLAYER1_KEY_MAP, PLAYER2_KEY_MAP, type PlayerAction } from './versus/inputMaps.js';
import { attackRowsFromClear } from './versus/garbage.js';
import { SPLIT_PARTICLE_CAP } from './versus/splitScreen.js';
import { generateReplaySeed } from './replay/recorder.js';
import {
  announce,
  announceLineClear,
} from './a11y/announcer.js';
import { onPauseMenuClose, onPauseMenuOpen } from './a11y/keyboardNav.js';

type Action = PlayerAction;

interface PlayerSlot {
  game: Game;
  keyMap: Record<string, Action>;
  keys: Record<string, boolean>;
  actionTimers: Record<Action, number>;
  lastDirection: 'left' | 'right' | null;
  gravityTimer: number;
  lastLevel: number;
  holdCtx: CanvasRenderingContext2D;
  nextCtx: CanvasRenderingContext2D;
}

const DAS = INPUT_CONFIG.DAS;
const ARR = INPUT_CONFIG.ARR;

function emptyTimers(): Record<Action, number> {
  return { left: 0, right: 0, down: 0, rotateCW: 0, rotateCCW: 0, hardDrop: 0, hold: 0 };
}

export default class VersusController {
  readonly players: [PlayerSlot, PlayerSlot];
  view: IView;
  viewWebGPU: WebGPUViewHost;
  soundManager: SoundManager;
  isPlaying = false;
  isPaused = false;
  gameLoopID: number | null = null;
  wins: [number, number] = [0, 0];

  private lastTime = 0;
  private boundKeyDown: (e: KeyboardEvent) => void;
  private boundKeyUp: (e: KeyboardEvent) => void;

  constructor(
    view: IView,
    soundManager: SoundManager,
    holdP1: CanvasRenderingContext2D,
    nextP1: CanvasRenderingContext2D,
    holdP2: CanvasRenderingContext2D,
    nextP2: CanvasRenderingContext2D,
  ) {
    this.view = view;
    this.viewWebGPU = view as WebGPUViewHost;
    this.soundManager = soundManager;

    const g0 = new Game();
    const g1 = new Game({ dedicatedPlayfield: true });
    g0.setMode('versus');
    g1.setMode('versus');
    g0.view = view;
    g1.view = view;

    this.players = [
      {
        game: g0,
        keyMap: PLAYER1_KEY_MAP,
        keys: {},
        actionTimers: emptyTimers(),
        lastDirection: null,
        gravityTimer: 0,
        lastLevel: 1,
        holdCtx: holdP1,
        nextCtx: nextP1,
      },
      {
        game: g1,
        keyMap: PLAYER2_KEY_MAP,
        keys: {},
        actionTimers: emptyTimers(),
        lastDirection: null,
        gravityTimer: 0,
        lastLevel: 1,
        holdCtx: holdP2,
        nextCtx: nextP2,
      },
    ];

    this.boundKeyDown = this.handleKeyDown.bind(this);
    this.boundKeyUp = this.handleKeyUp.bind(this);
    document.addEventListener('keydown', this.boundKeyDown);
    document.addEventListener('keyup', this.boundKeyUp);
  }

  get game(): Game {
    return this.players[0].game;
  }

  play(): void {
    if (this.isPlaying && !this.isPaused) return;
    void this.soundManager.unlockAudio();
    this.enableSplitScreen();
    this.isPlaying = true;
    this.isPaused = false;
    this.lastTime = performance.now();

    if (!this.players[0].game.activPiece || this.players[0].game.isRunEnded) {
      this.resetGames();
    }

    this.soundManager.musicManager.play();
    this.hidePauseMenu();
    this.updateModeHud();
    this.gameLoop();
  }

  pause(): void {
    if (!this.isPlaying || this.isPaused) return;
    this.isPaused = true;
    this.isPlaying = false;
    if (this.gameLoopID) cancelAnimationFrame(this.gameLoopID);
    this.gameLoopID = null;
    this.soundManager.musicManager.pause();
    this.showPauseMenu();
  }

  resume(): void {
    if (!this.isPaused) return;
    void this.soundManager.unlockAudio();
    this.isPaused = false;
    this.isPlaying = true;
    this.lastTime = performance.now();
    this.soundManager.musicManager.resume();
    this.hidePauseMenu();
    this.gameLoop();
  }

  togglePause(): void {
    if (this.isPaused) this.resume();
    else if (this.isPlaying) this.pause();
    else this.play();
  }

  reset(): void {
    this.resetGames();
    this.isPaused = false;
    this.play();
  }

  updateHighScoreDisplay(): void {
    const label = document.getElementById('high-score-label');
    const value = document.getElementById('high-score');
    if (label) label.textContent = 'WINS (P1–P2)';
    if (value) value.textContent = `${this.wins[0]} – ${this.wins[1]}`;
  }

  updateModeHud(): void {
    const modeLabel = document.getElementById('mode-label');
    const primaryLabel = document.getElementById('mode-hud-primary-label');
    const primaryValue = document.getElementById('mode-hud-primary-value');
    const secondaryLabel = document.getElementById('mode-hud-secondary-label');
    const secondaryValue = document.getElementById('mode-hud-secondary-value');
    const levelBox = document.getElementById('level-panel-box');

    if (modeLabel) modeLabel.textContent = 'Local 2P';
    if (primaryLabel) primaryLabel.textContent = 'P1';
    if (primaryValue) primaryValue.textContent = 'Arrows';
    if (secondaryLabel && secondaryValue) {
      secondaryLabel.style.display = '';
      secondaryValue.style.display = '';
      secondaryLabel.textContent = 'P2';
      secondaryValue.textContent = 'WASD';
    }
    if (levelBox) levelBox.style.display = 'none';
    this.updateHighScoreDisplay();
  }

  private resetGames(): void {
    const seed = generateReplaySeed();
    for (const p of this.players) {
      p.game.reset({ seed: seed + (p === this.players[1] ? 1 : 0) });
      p.gravityTimer = 0;
      p.lastLevel = p.game.level;
      Object.assign(p.actionTimers, emptyTimers());
    }
  }

  private enableSplitScreen(): void {
    const wgpu = this.viewWebGPU;
    wgpu.splitScreen.active = true;
    if (wgpu.particleSystem) {
      wgpu.particleSystem.maxParticles = SPLIT_PARTICLE_CAP;
    }
    document.body.classList.add('versus-layout');
    const p2Panels = document.querySelectorAll('.p2-panel');
    p2Panels.forEach((el) => ((el as HTMLElement).style.display = ''));
  }

  private disableSplitScreen(): void {
    this.viewWebGPU.splitScreen.active = false;
    this.viewWebGPU.splitScreen.stateB = null;
    document.body.classList.remove('versus-layout');
    document.querySelectorAll('.p2-panel').forEach((el) => {
      (el as HTMLElement).style.display = 'none';
    });
  }

  private showPauseMenu(): void {
    const menu = document.getElementById('pause-menu');
    if (menu) menu.style.display = 'flex';
    onPauseMenuOpen();
  }

  private hidePauseMenu(): void {
    const menu = document.getElementById('pause-menu');
    if (menu) menu.style.display = 'none';
    onPauseMenuClose();
  }

  private handleKeyDown(event: KeyboardEvent): void {
    if (event.repeat) return;
    const code = event.code;
    if (code === 'Escape' || code === 'Enter') {
      this.togglePause();
      return;
    }
    if (!this.isPlaying || this.isPaused) return;

    for (let i = 0; i < 2; i++) {
      const slot = this.players[i];
      const action = slot.keyMap[code];
      if (!action || slot.game.isRunEnded) continue;
      slot.keys[code] = true;
      this.executeAction(i as 0 | 1, action);
      if (['left', 'right', 'down'].includes(action)) {
        slot.actionTimers[action] = 0;
      }
      event.preventDefault();
      return;
    }
  }

  private handleKeyUp(event: KeyboardEvent): void {
    const code = event.code;
    for (const slot of this.players) {
      if (slot.keys[code]) slot.keys[code] = false;
    }
  }

  private executeAction(player: 0 | 1, action: Action): void {
    const slot = this.players[player];
    const g = slot.game;
    if (g.isRunEnded) return;

    switch (action) {
      case 'left':
        g.movePieceLeft();
        this.soundManager.playMove('left', g.activPiece?.x ?? 4);
        break;
      case 'right':
        g.movePieceRight();
        this.soundManager.playMove('right', g.activPiece?.x ?? 4);
        break;
      case 'down':
        g.movePieceDown();
        this.soundManager.playMove('down', g.activPiece?.x ?? 4);
        break;
      case 'rotateCW':
        g.rotatePiece(true);
        this.soundManager.playRotate();
        break;
      case 'rotateCCW':
        g.rotatePiece(false);
        this.soundManager.playRotate();
        break;
      case 'hardDrop':
        void this.hardDrop(player);
        break;
      case 'hold':
        if (g.canHold) {
          g.hold();
          this.soundManager.playHold();
        }
        break;
    }
  }

  private async hardDrop(player: 0 | 1): Promise<void> {
    const slot = this.players[player];
    const g = slot.game;
    const result = await g.hardDropAsync();
    this.soundManager.playHardDrop();
    if (result.linesCleared.length > 0) {
      const combo = g.scoreEvent?.combo ?? 0;
      this.soundManager.playLineClear(result.linesCleared.length, combo, false, g.activPiece?.x ?? 4);
      announceLineClear(
        result.linesCleared.length,
        g.score,
        combo,
        result.tSpin,
        player === 0 ? 'Player 1' : 'Player 2',
      );
      this.sendAttack(player, result.linesCleared.length);
    } else if (result.locked) {
      this.soundManager.playLock(g.activPiece?.type ?? 'T', g.activPiece?.x ?? 4);
    }
    if (result.gameOver) this.onPlayerDefeated(player);
  }

  private sendAttack(from: 0 | 1, linesCleared: number): void {
    const rows = attackRowsFromClear(linesCleared);
    if (rows > 0) {
      this.players[1 - from].game.queueGarbage(rows);
    }
  }

  private onPlayerDefeated(loser: 0 | 1): void {
    const winner = (1 - loser) as 0 | 1;
    this.wins[winner]++;
    this.updateHighScoreDisplay();
    this.soundManager.playGameOver();
    const winnerState = this.players[winner].game.getState();
    announce(`Player ${winner + 1} wins. Score ${winnerState.score.toLocaleString()}.`);
    this.isPlaying = false;
    if (this.gameLoopID) cancelAnimationFrame(this.gameLoopID);
    this.gameLoopID = null;
    const state = this.players[winner].game.getState();
    this.view.renderEndScreen(state);
    this.disableSplitScreen();
  }

  private handleInput(slot: PlayerSlot, dt: number): void {
    if (slot.game.isRunEnded) return;
    for (const [code, action] of Object.entries(slot.keyMap)) {
      if (!slot.keys[code]) continue;
      if (action !== 'left' && action !== 'right' && action !== 'down') continue;
      slot.actionTimers[action] += dt;
      const threshold = slot.actionTimers[action] === dt ? DAS : ARR;
      if (slot.actionTimers[action] >= threshold) {
        if (action === 'left') slot.game.movePieceLeft();
        else if (action === 'right') slot.game.movePieceRight();
        else slot.game.movePieceDown();
        slot.actionTimers[action] -= ARR;
      }
    }
  }

  private gameLoop(): void {
    const animate = (time: number) => {
      if (!this.isPlaying || this.isPaused) return;
      void this.runFrame(time).then((cont) => {
        if (cont) this.gameLoopID = requestAnimationFrame(animate);
      });
    };
    this.gameLoopID = requestAnimationFrame(animate);
  }

  private async runFrame(time: number): Promise<boolean> {
    if (!this.isPlaying || this.isPaused) return false;
    const dt = time - this.lastTime;
    this.lastTime = time;

    let anyAlive = false;
    for (let i = 0; i < 2; i++) {
      const slot = this.players[i];
      if (slot.game.isRunEnded) continue;
      anyAlive = true;
      slot.game.tickMode(dt);
      this.handleInput(slot, dt);

      const level = slot.game.getEffectiveLevel();
      if (level > slot.lastLevel) {
        this.soundManager.playLevelUp(level);
        const who = i === 0 ? 'Player 1' : 'Player 2';
        announce(`${who}. Level ${level}.`);
        slot.lastLevel = level;
      }

      let speedMs = 1000 * Math.pow(0.85, level - 1);
      if (speedMs < 0.5) speedMs = 0.5;
      slot.gravityTimer += dt;
      let steps = 0;
      while (slot.gravityTimer > speedMs && steps < 10) {
        slot.game.movePieceDown();
        slot.gravityTimer -= speedMs;
        steps++;
      }

      const result = await slot.game.updateAsync(dt);
      if (result.linesCleared.length > 0) {
        const combo = slot.game.scoreEvent?.combo ?? 0;
        this.soundManager.playLineClear(result.linesCleared.length, combo, false, 4);
        announceLineClear(
          result.linesCleared.length,
          slot.game.score,
          combo,
          result.tSpin,
          i === 0 ? 'Player 1' : 'Player 2',
        );
        this.sendAttack(i as 0 | 1, result.linesCleared.length);
        this.viewWebGPU.onLineClear?.(
          result.linesCleared,
          result.tSpin,
          combo,
          false,
          false,
        );
      } else if (result.locked) {
        this.soundManager.playLock(slot.game.activPiece?.type ?? 'T', 4);
      }
      if (result.gameOver || slot.game.isRunEnded) {
        this.onPlayerDefeated(i as 0 | 1);
        return false;
      }
    }

    if (!anyAlive) return false;

    const s0 = this.players[0].game.getState();
    const s1 = this.players[1].game.getState();
    this.updateVersusHud(s0, s1);
    this.viewWebGPU.state = s0;
    this.viewWebGPU.splitScreen.stateB = s1;
    this.view.renderMainScreen(s0);
    this.renderSidePanels(s0, s1);
    this.viewWebGPU.render(dt / 1000);
    return true;
  }

  private updateVersusHud(s0: ReturnType<Game['getState']>, s1: ReturnType<Game['getState']>): void {
    const score = document.getElementById('score');
    const lines = document.getElementById('lines');
    const scoreP2 = document.getElementById('score-p2');
    const linesP2 = document.getElementById('lines-p2');
    if (score) score.textContent = s0.score.toLocaleString();
    if (lines) lines.textContent = String(s0.lines);
    if (scoreP2) scoreP2.textContent = s1.score.toLocaleString();
    if (linesP2) linesP2.textContent = String(s1.lines);
  }

  private renderSidePanels(
    s0: ReturnType<Game['getState']>,
    s1: ReturnType<Game['getState']>,
  ): void {
    this.view.renderPiece(this.players[0].nextCtx, s0.nextPiece);
    this.view.renderPiece(this.players[0].holdCtx, s0.holdPiece);
    this.view.renderPiece(this.players[1].nextCtx, s1.nextPiece);
    this.view.renderPiece(this.players[1].holdCtx, s1.holdPiece);
  }
}
