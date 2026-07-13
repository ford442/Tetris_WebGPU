/**
 * Game audio facade — event bus + SFX / music engines.
 * No audio until unlockAudio() (user gesture).
 */

import { AudioBus } from './audio/audioBus.js';
import { MusicEngine, MusicManager } from './audio/musicEngine.js';
import { SfxEngine } from './audio/sfxEngine.js';
import type {
  AudioEvent,
  AudioEventListener,
  AudioEventPayload,
  LineClearPayload,
  LockPayload,
  MoveDirection,
  MovePayload,
} from './audio/types.js';
import { VOLUME_CONFIG } from './config/audioConfig.js';

export { MusicManager, MusicEngine };

export default class SoundManager {
  private readonly bus: AudioBus;
  private readonly sfx: SfxEngine;
  readonly musicManager: MusicEngine;
  private enabled = true;
  private muted = false;
  private externalListeners = new Map<AudioEvent, Set<AudioEventListener>>();

  /** Fired once after the first user gesture unlocks the AudioContext. */
  onReady?: () => void;

  constructor() {
    this.bus = new AudioBus();
    this.musicManager = new MusicEngine(this.bus);
    this.sfx = new SfxEngine(this.bus, this.musicManager);
    this.bus.onUnlocked = () => this.onReady?.();
  }

  get audioContext(): AudioContext {
    return this.bus.ctx;
  }

  get masterGain(): GainNode {
    return this.bus.masterGain;
  }

  get isUnlocked(): boolean {
    return this.bus.isUnlocked;
  }

  /** Call from START / resume / first interaction — required for autoplay policy. */
  async unlockAudio(): Promise<void> {
    await this.bus.unlock();
  }

  on<E extends AudioEvent>(event: E, listener: AudioEventListener<E>): () => void {
    if (!this.externalListeners.has(event)) {
      this.externalListeners.set(event, new Set());
    }
    const set = this.externalListeners.get(event)!;
    set.add(listener as AudioEventListener);
    return () => set.delete(listener as AudioEventListener);
  }

  emit<E extends AudioEvent>(event: E, payload: AudioEventPayload[E]): void {
    if (!this.enabled) return;
    if (!this.muted) {
      this.bus.ensureRunning();
      this.dispatchBuiltIn(event, payload);
    }
    const subs = this.externalListeners.get(event);
    if (subs) {
      for (const fn of subs) {
        fn(payload);
      }
    }
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    this.sfx.setEnabled(enabled);
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    this.bus.setMuted(muted);
  }

  setSfxVolume(volume: number): void {
    this.bus.setSfxVolume(volume);
  }

  getSfxVolume(): number {
    return this.bus.sfxGain.gain.value;
  }

  applyAudioSettings(options: {
    mute?: boolean;
    sfxVolume?: number;
    musicVolume?: number;
  }): void {
    if (options.mute !== undefined) this.setMuted(options.mute);
    if (options.sfxVolume !== undefined) this.setSfxVolume(options.sfxVolume);
    if (options.musicVolume !== undefined) this.musicManager.setVolume(options.musicVolume);
  }

  playMove(direction?: MoveDirection, column?: number): void {
    this.emit('move', { direction, column });
  }

  playRotate(): void {
    this.emit('rotate', {});
  }

  playSoftDrop(): void {
    this.emit('softDrop', {});
  }

  playHardDrop(): void {
    this.emit('hardDrop', {});
  }

  playLock(pieceType?: string | number, column?: number): void {
    this.emit('lock', { pieceType, column });
  }

  playHold(): void {
    this.emit('hold', {});
  }

  playLineClear(lines: number, combo = 0, backToBack = false, column?: number): void {
    this.emit('lineClear', { lines, combo, backToBack, column });
  }

  playTSpin(): void {
    this.emit('tSpin', {});
  }

  playGameOver(): void {
    this.emit('gameOver', {});
  }

  playLevelUp(level?: number): void {
    this.emit('levelUp', { level: level ?? 0 });
  }

  playPause(): void {
    this.emit('pause', {});
  }

  playResume(): void {
    this.emit('resume', {});
  }

  playMenuNavigate(): void {
    this.emit('menuNavigate', {});
  }

  playMenuSelect(): void {
    this.emit('menuSelect', {});
  }

  private dispatchBuiltIn<E extends AudioEvent>(event: E, payload: AudioEventPayload[E]): void {
    switch (event) {
      case 'move':
        this.sfx.playMove(payload as MovePayload);
        break;
      case 'rotate':
        this.sfx.playRotate();
        break;
      case 'softDrop':
        this.sfx.playSoftDrop();
        break;
      case 'hardDrop':
        this.sfx.playHardDrop();
        break;
      case 'lock':
        this.sfx.playLock(payload as LockPayload);
        break;
      case 'hold':
        this.sfx.playHold();
        break;
      case 'lineClear':
        this.sfx.playLineClear(payload as LineClearPayload);
        break;
      case 'tSpin':
        this.sfx.playTSpin();
        break;
      case 'levelUp': {
        const p = payload as AudioEventPayload['levelUp'];
        this.sfx.playLevelUp();
        void this.musicManager.ensureStemForLevel(p.level);
        this.musicManager.setGameplayIntensity(p.level, 0);
        break;
      }
      case 'gameOver':
        this.sfx.playGameOver();
        break;
      case 'pause':
        this.sfx.playPause();
        break;
      case 'resume':
        this.sfx.playResume();
        break;
      case 'menuNavigate':
        this.sfx.playMenuNavigate();
        break;
      case 'menuSelect':
        this.sfx.playMenuSelect();
        break;
      default:
        break;
    }
  }
}

export const DEFAULT_AUDIO_VOLUMES = {
  music: VOLUME_CONFIG.MUSIC,
  sfx: VOLUME_CONFIG.SFX,
} as const;
