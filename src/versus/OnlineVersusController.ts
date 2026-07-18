/**
 * Online 2P versus — lockstep simulation + WebRTC/relay transport.
 */

import type { IView } from '../view/IView.js';
import type { WebGPUViewHost } from '../view/viewTypes.js';
import type SoundManager from '../sound.js';
import { INPUT_CONFIG } from '../config/gameConfig.js';
import { PLAYER1_KEY_MAP, type PlayerAction } from './inputMaps.js';
import { SPLIT_PARTICLE_CAP } from './splitScreen.js';
import { REPLAY_TICK_MS } from '../replay/format.js';
import { actionNameToMask } from '../replay/actions.js';
import { SignalingClient } from '../net/signalingClient.js';
import { OnlineSession, type SessionCallbacks } from '../net/session.js';
import { CombinedTransport, RelayTransport } from '../net/transport.js';
import { NetMessageType, type NetMessage, type PeerRole, type SessionPhase, type SignalingMessage, type TransportMode } from '../net/types.js';
import { normalizeRoomCode, isValidRoomCode } from '../net/roomCode.js';
import { announce, announceLineClear } from '../a11y/announcer.js';
import { onPauseMenuClose, onPauseMenuOpen } from '../a11y/keyboardNav.js';
import type Game from '../game.js';
import type { VersusTickResult } from './VersusLockstepSim.js';

type Action = PlayerAction;

export interface OnlineVersusUIHooks {
  onRoomCode?(code: string): void;
  onPhaseChange?(phase: SessionPhase): void;
  onTransportMode?(mode: TransportMode): void;
  onCountdown?(framesRemaining: number): void;
  onError?(message: string): void;
  onDesync?(): void;
  onDisconnected?(): void;
}

export default class OnlineVersusController {
  view: IView;
  viewWebGPU: WebGPUViewHost;
  soundManager: SoundManager;
  isPlaying = false;
  isPaused = false;
  gameLoopID: number | null = null;

  readonly session: OnlineSession;
  private signaling: SignalingClient;
  private transport: CombinedTransport | RelayTransport | null = null;
  private remotePeerId = '';
  private role: PeerRole = 'host';
  private isSpectator = false;

  private lastTime = 0;
  private accumMs = 0;
  private keys: Record<string, boolean> = {};
  private actionTimers: Record<Action, number> = {
    left: 0, right: 0, down: 0, rotateCW: 0, rotateCCW: 0, hardDrop: 0, hold: 0,
  };
  private pendingMask = 0;
  private uiHooks: OnlineVersusUIHooks;

  private holdCtx: CanvasRenderingContext2D;
  private nextCtx: CanvasRenderingContext2D;
  private holdCtxP2: CanvasRenderingContext2D;
  private nextCtxP2: CanvasRenderingContext2D;

  private boundKeyDown: (e: KeyboardEvent) => void;
  private boundKeyUp: (e: KeyboardEvent) => void;

  private readonly keyMap = PLAYER1_KEY_MAP;
  private readonly DAS = INPUT_CONFIG.DAS;
  private readonly ARR = INPUT_CONFIG.ARR;

  constructor(
    view: IView,
    soundManager: SoundManager,
    holdP1: CanvasRenderingContext2D,
    nextP1: CanvasRenderingContext2D,
    holdP2: CanvasRenderingContext2D,
    nextP2: CanvasRenderingContext2D,
    uiHooks: OnlineVersusUIHooks = {},
    role: PeerRole = 'host',
    isSpectator = false,
  ) {
    this.view = view;
    this.viewWebGPU = view as WebGPUViewHost;
    this.soundManager = soundManager;
    this.holdCtx = holdP1;
    this.nextCtx = nextP1;
    this.holdCtxP2 = holdP2;
    this.nextCtxP2 = nextP2;
    this.uiHooks = uiHooks;
    this.role = role;
    this.isSpectator = isSpectator;

    const sessionCallbacks: SessionCallbacks = {
      onPhaseChange: (p) => this.uiHooks.onPhaseChange?.(p),
      onRoomCode: (c) => this.uiHooks.onRoomCode?.(c),
      onTransportMode: (m) => this.uiHooks.onTransportMode?.(m),
      onError: (m) => this.uiHooks.onError?.(m),
      onTick: (result) => this.onSimTick(result),
      onRoundEnd: (winner) => this.onRoundEnd(winner),
      onDesync: () => {
        this.uiHooks.onDesync?.();
        this.pause();
      },
      onPeerJoined: (_id, peerRole) => {
        if (this.role === 'host' && peerRole === 'guest' && this.transport instanceof CombinedTransport) {
          void this.transport.startWebRTC();
        }
      },
    };

    this.session = new OnlineSession(role, sessionCallbacks, isSpectator);
    this.signaling = new SignalingClient((msg) => this.handleSignaling(msg));

    this.boundKeyDown = this.handleKeyDown.bind(this);
    this.boundKeyUp = this.handleKeyUp.bind(this);
    document.addEventListener('keydown', this.boundKeyDown);
    document.addEventListener('keyup', this.boundKeyUp);
  }

  get game(): Game {
    return this.session.lockstep.sim.g0;
  }

  async createRoom(): Promise<void> {
    this.role = 'host';
    await this.connectSignaling();
    this.signaling.createRoom();
  }

  async joinRoom(code: string, asSpectator = false): Promise<void> {
    const normalized = normalizeRoomCode(code);
    if (!isValidRoomCode(normalized)) {
      this.uiHooks.onError?.('Invalid room code');
      return;
    }
    this.role = asSpectator ? 'spectator' : 'guest';
    this.isSpectator = asSpectator;
    await this.connectSignaling();
    this.signaling.joinRoom(normalized, asSpectator ? 'spectator' : 'guest');
  }

  private async connectSignaling(): Promise<void> {
    this.isPlaying = true;
    this.enableSplitScreen();
    await this.signaling.connect();
  }

  private handleSignaling(msg: SignalingMessage): void {
    this.session.handleSignaling(msg);

    if (msg.type === 'created') {
      this.remotePeerId = '';
      this.role = 'host';
    }

    if (msg.type === 'joined') {
      this.role = msg.role;
      this.isSpectator = msg.role === 'spectator';
    }

    if (msg.type === 'peer_joined') {
      this.remotePeerId = msg.peerId;
      if (this.isSpectator) {
        this.transport = new RelayTransport(this.signaling, (m) => this.onGameMessage(m));
        this.session.setTransport(this.transport, 'relay');
      } else if (this.role === 'host') {
        this.transport = new CombinedTransport({
          signaling: this.signaling,
          isHost: true,
          remotePeerId: msg.peerId,
          onMessage: (m) => this.onGameMessage(m),
          onModeChange: (mode) => {
            this.session.transportMode = mode;
            this.uiHooks.onTransportMode?.(mode);
            if (mode === 'webrtc' || mode === 'relay') {
              this.session.beginMatch();
              this.startGameLoop();
            }
          },
        });
        this.session.setTransport(this.transport, 'none');
      }
    }

    if (msg.type === 'signal' && this.transport instanceof CombinedTransport) {
      this.transport.handleSignal(msg);
    }

    if (msg.type === 'relay') {
      if (this.transport instanceof CombinedTransport) {
        this.transport.handleRelay(msg);
      } else if (this.transport instanceof RelayTransport) {
        this.transport.handleRelay(msg.payload);
      }
    }

    if (msg.type === 'peer_left') {
      this.uiHooks.onDisconnected?.();
      this.stop();
    }

    if (msg.type === 'joined' && this.role === 'guest' && !this.isSpectator) {
      this.remotePeerId = msg.hostPeerId ?? '';
      this.transport = new CombinedTransport({
        signaling: this.signaling,
        isHost: false,
        remotePeerId: this.remotePeerId,
        onMessage: (m) => this.onGameMessage(m),
        onModeChange: (mode) => {
          this.session.transportMode = mode;
          this.uiHooks.onTransportMode?.(mode);
          if (mode === 'webrtc' || mode === 'relay') this.startGameLoop();
        },
      });
      this.session.setTransport(this.transport, 'none');
      void this.transport.startWebRTC();
    }
  }

  private onGameMessage(msg: NetMessage): void {
    if (msg.type === NetMessageType.Rematch) {
      this.session.handleRematch(msg);
      return;
    }
    if (msg.type === NetMessageType.Disconnect) {
      this.uiHooks.onDisconnected?.();
      this.stop();
      return;
    }
    this.session.receiveGameMessage(msg);
    if (msg.type === NetMessageType.MatchStart && !this.gameLoopID) {
      this.startGameLoop();
    }
  }

  play(): void {
    void this.soundManager.unlockAudio();
    this.isPaused = false;
    this.lastTime = performance.now();
    this.soundManager.musicManager.play();
    this.hidePauseMenu();
    this.updateModeHud();
  }

  pause(): void {
    if (!this.isPlaying || this.isPaused) return;
    this.isPaused = true;
    if (this.gameLoopID) cancelAnimationFrame(this.gameLoopID);
    this.gameLoopID = null;
    this.soundManager.musicManager.pause();
    this.showPauseMenu();
  }

  resume(): void {
    if (!this.isPaused) return;
    void this.soundManager.unlockAudio();
    this.isPaused = false;
    this.lastTime = performance.now();
    this.soundManager.musicManager.resume();
    this.hidePauseMenu();
    this.startGameLoop();
  }

  togglePause(): void {
    if (this.isPaused) this.resume();
    else if (this.isPlaying) this.pause();
  }

  reset(): void {
    this.session.requestRematch();
  }

  requestRematch(): void {
    this.session.requestRematch();
  }

  stop(): void {
    this.isPlaying = false;
    this.isPaused = false;
    if (this.gameLoopID) cancelAnimationFrame(this.gameLoopID);
    this.gameLoopID = null;
    this.transport?.close();
    this.disableSplitScreen();
  }

  updateHighScoreDisplay(): void {
    const wins = this.session.lockstep.getWins();
    const label = document.getElementById('high-score-label');
    const value = document.getElementById('high-score');
    if (label) label.textContent = 'WINS (P1–P2)';
    if (value) value.textContent = `${wins[0]} – ${wins[1]}`;
  }

  updateModeHud(): void {
    const modeLabel = document.getElementById('mode-label');
    const primaryLabel = document.getElementById('mode-hud-primary-label');
    const primaryValue = document.getElementById('mode-hud-primary-value');
    const secondaryLabel = document.getElementById('mode-hud-secondary-label');
    const secondaryValue = document.getElementById('mode-hud-secondary-value');
    const levelBox = document.getElementById('level-panel-box');

    const roleLabel = this.isSpectator ? 'Spectating' : this.role === 'host' ? 'You: P1' : 'You: P2';
    if (modeLabel) modeLabel.textContent = 'Online 2P';
    if (primaryLabel) primaryLabel.textContent = 'ROLE';
    if (primaryValue) primaryValue.textContent = roleLabel;
    if (secondaryLabel && secondaryValue) {
      secondaryLabel.style.display = '';
      secondaryValue.style.display = '';
      secondaryLabel.textContent = 'ROOM';
      secondaryValue.textContent = this.session.roomCode || '—';
    }
    if (levelBox) levelBox.style.display = 'none';
    this.updateHighScoreDisplay();
  }

  private startGameLoop(): void {
    if (this.gameLoopID) return;
    this.lastTime = performance.now();
    const animate = (time: number) => {
      if (!this.isPlaying || this.isPaused) return;
      this.runFrame(time);
      this.gameLoopID = requestAnimationFrame(animate);
    };
    this.gameLoopID = requestAnimationFrame(animate);
  }

  private runFrame(time: number): void {
    const dt = time - this.lastTime;
    this.lastTime = time;
    this.accumMs += dt;

    while (this.accumMs >= REPLAY_TICK_MS) {
      this.accumMs -= REPLAY_TICK_MS;
      this.processDas(REPLAY_TICK_MS);

      if (this.session.phase === 'countdown') {
        this.uiHooks.onCountdown?.(this.session.lockstep.countdownFramesRemaining);
      }

      if (!this.isSpectator && this.session.phase === 'playing') {
        const mask = this.pendingMask;
        this.pendingMask = 0;
        this.session.lockstep.submitLocalInput(this.session.lockstep.outboundInputFrame, mask);
      }

      this.session.tick();
    }

    this.render(dt);
  }

  private processDas(dt: number): void {
    if (this.isSpectator) return;
    for (const [code, action] of Object.entries(this.keyMap)) {
      if (!this.keys[code]) continue;
      if (action !== 'left' && action !== 'right' && action !== 'down') continue;
      this.actionTimers[action] += dt;
      const threshold = this.actionTimers[action] === dt ? this.DAS : this.ARR;
      if (this.actionTimers[action] >= threshold) {
        this.pendingMask |= actionNameToMask(action);
        this.actionTimers[action] -= this.ARR;
      }
    }
  }

  private handleKeyDown(event: KeyboardEvent): void {
    if (event.repeat) return;
    const code = event.code;
    if (code === 'Escape' || code === 'Enter') {
      this.togglePause();
      return;
    }
    if (!this.isPlaying || this.isPaused || this.isSpectator) return;
    if (this.session.phase !== 'playing' && this.session.phase !== 'countdown') return;

    const action = this.keyMap[code];
    if (!action) return;

    this.keys[code] = true;
    this.pendingMask |= actionNameToMask(action);
    if (['left', 'right', 'down'].includes(action)) {
      this.actionTimers[action] = 0;
    }
    event.preventDefault();
  }

  private handleKeyUp(event: KeyboardEvent): void {
    if (this.keys[event.code]) this.keys[event.code] = false;
  }

  private onSimTick(result: VersusTickResult): void {
    if (result.linesCleared0 > 0) {
      this.soundManager.playLineClear(result.linesCleared0, 0, false, 4);
      announceLineClear(result.linesCleared0, this.session.lockstep.sim.g0.score, 0, false, 'Player 1');
      this.viewWebGPU.onLineClear?.([0], false, 0, false, false);
    }
    if (result.linesCleared1 > 0) {
      this.soundManager.playLineClear(result.linesCleared1, 0, false, 4);
      announceLineClear(result.linesCleared1, this.session.lockstep.sim.g1.score, 0, false, 'Player 2');
    }
  }

  private onRoundEnd(winner: 0 | 1): void {
    this.updateHighScoreDisplay();
    this.soundManager.playGameOver();
    const g = winner === 0 ? this.session.lockstep.sim.g0 : this.session.lockstep.sim.g1;
    announce(`Player ${winner + 1} wins. Score ${g.score.toLocaleString()}.`);
    if (!this.isSpectator) {
      this.view.renderEndScreen(g.getState());
    }
  }

  private render(dt: number): void {
    const sim = this.session.lockstep.sim;
    const s0 = sim.g0.getState();
    const s1 = sim.g1.getState();
    this.updateVersusHud(s0, s1);
    this.viewWebGPU.state = s0;
    this.viewWebGPU.splitScreen.stateB = s1;
    this.view.renderMainScreen(s0);
    this.view.renderPiece(this.nextCtx, s0.nextPiece);
    this.view.renderPiece(this.holdCtx, s0.holdPiece);
    this.view.renderPiece(this.nextCtxP2, s1.nextPiece);
    this.view.renderPiece(this.holdCtxP2, s1.holdPiece);
    this.viewWebGPU.render(dt / 1000);
  }

  private updateVersusHud(
    s0: ReturnType<Game['getState']>,
    s1: ReturnType<Game['getState']>,
  ): void {
    const score = document.getElementById('score');
    const lines = document.getElementById('lines');
    const scoreP2 = document.getElementById('score-p2');
    const linesP2 = document.getElementById('lines-p2');
    if (score) score.textContent = s0.score.toLocaleString();
    if (lines) lines.textContent = String(s0.lines);
    if (scoreP2) scoreP2.textContent = s1.score.toLocaleString();
    if (linesP2) linesP2.textContent = String(s1.lines);
  }

  private enableSplitScreen(): void {
    const wgpu = this.viewWebGPU;
    wgpu.splitScreen.active = true;
    if (wgpu.particleSystem) {
      wgpu.particleSystem.maxParticles = SPLIT_PARTICLE_CAP;
    }
    document.body.classList.add('versus-layout');
    document.querySelectorAll('.p2-panel').forEach((el) => {
      (el as HTMLElement).style.display = '';
    });
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
}
