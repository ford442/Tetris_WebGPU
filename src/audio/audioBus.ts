/**
 * Master Web Audio routing: SFX bus, music bus, limiter, gesture gate.
 */

import { VOLUME_CONFIG } from '../config/audioConfig.js';
import type { MoveDirection } from './types.js';
import { columnToPan as panFromColumn, movePan as panForMove } from './spatial.js';

export class AudioBus {
  readonly ctx: AudioContext;
  readonly masterGain: GainNode;
  readonly sfxGain: GainNode;
  readonly musicGain: GainNode;

  private readonly limiter: DynamicsCompressorNode;
  private unlocked = false;
  onUnlocked?: () => void;

  constructor() {
    const AudioCtx = (window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext)!;
    this.ctx = new AudioCtx();

    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = VOLUME_CONFIG.MASTER;

    this.limiter = this.ctx.createDynamicsCompressor();
    this.limiter.threshold.value = -2;
    this.limiter.knee.value = 0;
    this.limiter.ratio.value = 20;
    this.limiter.attack.value = 0.003;
    this.limiter.release.value = 0.12;

    this.sfxGain = this.ctx.createGain();
    this.sfxGain.gain.value = VOLUME_CONFIG.SFX;
    this.sfxGain.connect(this.masterGain);

    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = VOLUME_CONFIG.MUSIC;
    this.musicGain.connect(this.masterGain);

    this.masterGain.connect(this.limiter);
    this.limiter.connect(this.ctx.destination);
  }

  get isUnlocked(): boolean {
    return this.unlocked;
  }

  /** Call from a user gesture (START, resume, volume slider). */
  async unlock(): Promise<void> {
    if (this.unlocked) {
      if (this.ctx.state === 'suspended') {
        await this.ctx.resume();
      }
      return;
    }
    this.unlocked = true;
    if (this.ctx.state === 'suspended') {
      await this.ctx.resume();
    }
    this.onUnlocked?.();
  }

  /** No-op until unlock() — preserves autoplay policy. */
  ensureRunning(): void {
    if (!this.unlocked) return;
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
  }

  /** Map playfield column (0–9) to stereo pan −1…1. */
  columnToPan(column: number, cols?: number): number {
    return panFromColumn(column, cols);
  }

  movePan(direction: MoveDirection, column?: number): number {
    return panForMove(direction, column);
  }

  setMasterVolume(volume: number): void {
    this.masterGain.gain.value = Math.max(0, Math.min(1, volume));
  }

  setSfxVolume(volume: number): void {
    this.sfxGain.gain.value = Math.max(0, Math.min(1, volume));
  }

  setMusicVolume(volume: number): void {
    this.musicGain.gain.value = Math.max(0, Math.min(1, volume));
  }

  setMuted(muted: boolean): void {
    const v = muted ? 0 : VOLUME_CONFIG.MASTER;
    this.masterGain.gain.setTargetAtTime(v, this.ctx.currentTime, 0.02);
  }

  connectToSfx(node: AudioNode): void {
    node.connect(this.sfxGain);
  }

  connectToMusic(node: AudioNode): void {
    node.connect(this.musicGain);
  }

  createSfxPanner(pan: number): StereoPannerNode | null {
    if (typeof this.ctx.createStereoPanner !== 'function') return null;
    const p = this.ctx.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, pan));
    p.connect(this.sfxGain);
    return p;
  }
}
