/**
 * Background music: optional streamed stems (intro / build / peak) + procedural fallback.
 */

import { ProceduralMusicGenerator } from '../effects/musicGenerator.js';
import { MUSIC_CONFIG, MUSIC_STEMS, type MusicStemId } from '../config/audioConfig.js';
import { audioLogger } from '../utils/logger.js';
import type { AudioBus } from './audioBus.js';

export function stemForLevel(level: number): MusicStemId {
  if (level >= 10) return 'peak';
  if (level >= 5) return 'build';
  return 'intro';
}

export class MusicEngine {
  private readonly ctx: AudioContext;
  private readonly busMusicGain: GainNode;
  private readonly outputGain: GainNode;
  private currentSource: AudioBufferSourceNode | null = null;
  private currentBuffer: AudioBuffer | null = null;
  private currentUrl: string | null = null;
  private currentStem: MusicStemId | null = null;
  private isPlaying = false;
  private isPaused = false;
  private playbackStartTime = 0;
  private pausedAt = 0;
  private loop = MUSIC_CONFIG.LOOP;
  private proceduralGenerator: ProceduralMusicGenerator | null = null;
  private useProcedural = false;
  private userVolume = 0.3;
  private intensity = 0.35;
  private stemBuffers = new Map<MusicStemId, AudioBuffer>();

  constructor(private readonly bus: AudioBus) {
    this.ctx = bus.ctx;
    this.busMusicGain = bus.musicGain;
    this.outputGain = this.ctx.createGain();
    this.outputGain.gain.value = this.userVolume;
    this.outputGain.connect(this.busMusicGain);
  }

  setVolume(volume: number): void {
    this.userVolume = Math.max(0, Math.min(1, volume));
    this.applyOutputGain();
    this.proceduralGenerator?.setVolume(this.userVolume);
  }

  getVolume(): number {
    return this.userVolume;
  }

  /** Combined gameplay drive 0–1 from level + combo. */
  setGameplayIntensity(level: number, combo: number): void {
    const levelPart = Math.min(Math.max(level, 0) / 15, 1) * 0.55;
    const comboPart = Math.min(Math.max(combo, 0) / 10, 1) * 0.45;
    this.setIntensity(levelPart + comboPart);
  }

  setIntensity(value: number): void {
    this.intensity = Math.max(0, Math.min(1, value));
    this.applyOutputGain();
    if (this.proceduralGenerator) {
      this.proceduralGenerator.setIntensity(this.intensity);
    }
  }

  private applyOutputGain(): void {
    const t = this.ctx.currentTime;
    const target = this.userVolume * (0.55 + this.intensity * 0.45);
    this.outputGain.gain.setTargetAtTime(target, t, 0.08);
  }

  /** Brief duck for combo risers / big SFX. */
  duck(amount: number, holdSeconds: number): void {
    const t = this.ctx.currentTime;
    const g = this.outputGain.gain;
    const base = this.userVolume * (0.55 + this.intensity * 0.45);
    g.cancelScheduledValues(t);
    g.setValueAtTime(g.value, t);
    g.linearRampToValueAtTime(base * (1 - Math.min(0.85, amount)), t + 0.04);
    g.linearRampToValueAtTime(base, t + holdSeconds);
  }

  enableProcedural(): void {
    if (!this.proceduralGenerator) {
      this.proceduralGenerator = new ProceduralMusicGenerator(this.ctx, this.outputGain);
    }
    this.useProcedural = true;
  }

  async load(url: string): Promise<boolean> {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        audioLogger.warn(`Failed to load audio from ${url}`);
        return false;
      }
      const arrayBuffer = await response.arrayBuffer();
      this.currentBuffer = await this.ctx.decodeAudioData(arrayBuffer);
      this.currentUrl = url;
      this.useProcedural = false;
      return true;
    } catch (e) {
      audioLogger.warn(`Error loading audio from ${url}:`, e);
      return false;
    }
  }

  async ensureStemForLevel(level: number): Promise<void> {
    const stem = stemForLevel(level);
    if (this.currentStem === stem && (this.currentBuffer || this.useProcedural)) return;

    if (!this.stemBuffers.has(stem)) {
      const url = MUSIC_STEMS[stem];
      try {
        const res = await fetch(url);
        if (res.ok) {
          const buf = await this.ctx.decodeAudioData(await res.arrayBuffer());
          this.stemBuffers.set(stem, buf);
        }
      } catch {
        /* procedural fallback */
      }
    }

    const buf = this.stemBuffers.get(stem);
    if (buf) {
      const wasPlaying = this.isPlaying;
      this.stop();
      this.currentBuffer = buf;
      this.currentUrl = MUSIC_STEMS[stem];
      this.currentStem = stem;
      this.useProcedural = false;
      if (wasPlaying) this.play();
    } else if (!this.proceduralGenerator) {
      this.proceduralGenerator = new ProceduralMusicGenerator(this.ctx, this.outputGain);
      this.useProcedural = true;
      this.currentStem = stem;
    }
  }

  play(): void {
    this.bus.ensureRunning();
    if (this.useProcedural && this.proceduralGenerator) {
      this.proceduralGenerator.play();
      this.isPlaying = true;
      return;
    }

    if (!this.currentBuffer) {
      if (!this.proceduralGenerator) {
        this.proceduralGenerator = new ProceduralMusicGenerator(this.ctx, this.outputGain);
      }
      this.useProcedural = true;
      this.proceduralGenerator.play();
      this.isPlaying = true;
      return;
    }

    if (this.isPlaying) this.stop();

    this.currentSource = this.ctx.createBufferSource();
    this.currentSource.buffer = this.currentBuffer;
    this.currentSource.loop = this.loop;
    this.currentSource.connect(this.outputGain);

    const offset = this.isPaused ? this.pausedAt : 0;
    this.currentSource.start(0, offset);
    this.playbackStartTime = this.ctx.currentTime - offset;
    this.isPlaying = true;
    this.isPaused = false;
  }

  pause(): void {
    if (this.useProcedural && this.proceduralGenerator) {
      this.proceduralGenerator.pause();
      this.isPlaying = false;
      this.isPaused = true;
      return;
    }
    if (!this.isPlaying || !this.currentSource) return;
    this.pausedAt = this.ctx.currentTime - this.playbackStartTime;
    this.stop();
    this.isPaused = true;
  }

  resume(): void {
    if (this.isPaused) this.play();
  }

  stop(): void {
    this.proceduralGenerator?.stop();
    if (this.currentSource) {
      try {
        this.currentSource.stop();
      } catch {
        /* already stopped */
      }
      this.currentSource.disconnect();
      this.currentSource = null;
    }
    this.isPlaying = false;
  }

  setLoop(shouldLoop: boolean): void {
    this.loop = shouldLoop;
    if (this.currentSource) this.currentSource.loop = shouldLoop;
  }

  isMusicPlaying(): boolean {
    if (this.useProcedural && this.proceduralGenerator) {
      return this.proceduralGenerator.isMusicPlaying();
    }
    return this.isPlaying;
  }

  isMusicPaused(): boolean {
    return this.isPaused;
  }
}

/** @deprecated alias — use MusicEngine */
export { MusicEngine as MusicManager };
