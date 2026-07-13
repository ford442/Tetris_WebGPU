import Game from '../game.js';
import type { GameModeId } from '../game/modes/types.js';
import {
  decodeInputStream,
  inputEventsToMap,
  parseReplayFile,
  REPLAY_TICK_MS,
  type ReplayFile,
} from './format.js';
import { GameSimulator } from './simulator.js';

export type PlaybackState = 'idle' | 'playing' | 'paused' | 'ended';

/** Re-simulates a recorded game; scrub by resetting and fast-forwarding. */
export class ReplayPlayback {
  private readonly file: ReplayFile;
  private readonly inputMap: Map<number, number>;
  private sim: GameSimulator;
  private currentFrame = 0;
  private state: PlaybackState = 'idle';
  private rafId: number | null = null;
  private lastTime = 0;
  private accumMs = 0;
  private onFrame?: (frame: number, game: Game) => void;
  private onEnd?: () => void;
  private mediaRecorder: MediaRecorder | null = null;
  private recordedChunks: Blob[] = [];

  constructor(file: ReplayFile) {
    this.file = file;
    this.inputMap = inputEventsToMap(decodeInputStream(file.inputs));
    this.sim = new GameSimulator(file.seed, file.mode);
  }

  get maxFrame(): number {
    return Math.max(this.file.frames, 1);
  }

  get frame(): number {
    return this.currentFrame;
  }

  get playbackState(): PlaybackState {
    return this.state;
  }

  get game(): Game {
    return this.sim.game;
  }

  get replayFile(): ReplayFile {
    return this.file;
  }

  setCallbacks(cb: {
    onFrame?: (frame: number, game: Game) => void;
    onEnd?: () => void;
  }): void {
    this.onFrame = cb.onFrame;
    this.onEnd = cb.onEnd;
  }

  scrubTo(targetFrame: number): void {
    const frame = Math.max(0, Math.min(targetFrame, this.maxFrame));
    this.sim = new GameSimulator(this.file.seed, this.file.mode);
    for (let f = 0; f < frame && !this.sim.game.isRunEnded; f++) {
      this.sim.tick(this.inputMap.get(f) ?? 0);
    }
    this.currentFrame = frame;
    this.onFrame?.(this.currentFrame, this.sim.game);
  }

  play(): void {
    if (this.state === 'playing') return;
    if (this.currentFrame >= this.maxFrame || this.sim.game.isRunEnded) {
      this.scrubTo(0);
    }
    this.state = 'playing';
    this.lastTime = performance.now();
    this.accumMs = 0;
    this.schedule();
  }

  pause(): void {
    this.state = 'paused';
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  stop(): void {
    this.pause();
    this.stopWebmCapture();
    this.state = 'idle';
    this.scrubTo(0);
  }

  stepForward(): void {
    if (this.currentFrame >= this.maxFrame || this.sim.game.isRunEnded) return;
    this.sim.tick(this.inputMap.get(this.currentFrame) ?? 0);
    this.currentFrame++;
    this.onFrame?.(this.currentFrame, this.sim.game);
    if (this.currentFrame >= this.maxFrame || this.sim.game.isRunEnded) {
      this.state = 'ended';
      this.onEnd?.();
    }
  }

  stepBackward(): void {
    this.scrubTo(Math.max(0, this.currentFrame - 1));
  }

  startWebmCapture(canvas: HTMLCanvasElement): void {
    if (typeof MediaRecorder === 'undefined') return;
    const stream = canvas.captureStream(60);
    this.recordedChunks = [];
    this.mediaRecorder = new MediaRecorder(stream, { mimeType: this.pickMimeType() });
    this.mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) this.recordedChunks.push(e.data);
    };
    this.mediaRecorder.start(100);
  }

  stopWebmCapture(): void {
    if (!this.mediaRecorder) return;
    this.mediaRecorder.stop();
    this.mediaRecorder = null;
  }

  async stopWebmCaptureAsync(): Promise<Blob | null> {
    if (!this.mediaRecorder) return null;
    const recorder = this.mediaRecorder;
    this.mediaRecorder = null;
    return new Promise<Blob | null>((resolve) => {
      recorder.onstop = () => {
        const blob = this.recordedChunks.length > 0
          ? new Blob(this.recordedChunks, { type: recorder.mimeType })
          : null;
        this.recordedChunks = [];
        resolve(blob);
      };
      recorder.stop();
    });
  }

  private schedule(): void {
    const tick = (time: number) => {
      if (this.state !== 'playing') return;
      const dt = time - this.lastTime;
      this.lastTime = time;
      this.accumMs += dt;
      while (this.accumMs >= REPLAY_TICK_MS && this.state === 'playing') {
        this.stepForward();
        this.accumMs -= REPLAY_TICK_MS;
        if (this.state === 'ended') return;
      }
      this.rafId = requestAnimationFrame(tick);
    };
    this.rafId = requestAnimationFrame(tick);
  }

  private pickMimeType(): string {
    const candidates = [
      'video/webm;codecs=vp9',
      'video/webm;codecs=vp8',
      'video/webm',
    ];
    for (const type of candidates) {
      if (MediaRecorder.isTypeSupported(type)) return type;
    }
    return 'video/webm';
  }
}

export function downloadReplayFile(file: ReplayFile, filename = 'run.ttr'): void {
  const blob = new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function saveReplayToStorage(file: ReplayFile): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem('tetris_last_replay', JSON.stringify(file));
}

export function loadReplayFromStorage(): ReplayFile | null {
  if (typeof localStorage === 'undefined') return null;
  const raw = localStorage.getItem('tetris_last_replay');
  if (!raw) return null;
  try {
    return parseReplayFile(JSON.parse(raw));
  } catch {
    return null;
  }
}
