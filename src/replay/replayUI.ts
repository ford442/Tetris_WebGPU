import type { IView } from '../view/IView.js';
import {
  fromShareCode,
  toShareCode,
  type ReplayFile,
} from './format.js';
import {
  ReplayPlayback,
  downloadReplayFile,
  loadReplayFromStorage,
  saveReplayToStorage,
} from './playback.js';

export interface ReplayUIHost {
  viewWebGPU: IView;
  getCanvas(): HTMLCanvasElement | null;
}

/** Minimal replay scrubber overlay. */
export class ReplayUI {
  private host: ReplayUIHost;
  private panel: HTMLElement;
  private slider: HTMLInputElement;
  private frameLabel: HTMLElement;
  private shareInput: HTMLInputElement;
  private playback: ReplayPlayback | null = null;
  private lastFile: ReplayFile | null = null;

  constructor(host: ReplayUIHost) {
    this.host = host;
    this.panel = document.createElement('div');
    this.panel.id = 'replay-panel';
    this.panel.className = 'replay-panel';
    this.panel.innerHTML = `
      <p class="panel-label">REPLAY</p>
      <div class="replay-controls">
        <button type="button" id="replay-play-btn">Play</button>
        <button type="button" id="replay-pause-btn">Pause</button>
        <button type="button" id="replay-step-back-btn">◀</button>
        <button type="button" id="replay-step-fwd-btn">▶</button>
        <button type="button" id="replay-stop-btn">Stop</button>
      </div>
      <input type="range" id="replay-scrub" min="0" max="1" value="0" aria-label="Replay scrub" />
      <p id="replay-frame-label" class="replay-frame-label">frame 0 / 0</p>
      <div class="replay-io">
        <button type="button" id="replay-download-btn">Download .ttr</button>
        <button type="button" id="replay-webm-btn">Export WebM</button>
      </div>
      <input type="text" id="replay-share-code" placeholder="Share code" aria-label="Replay share code" />
      <button type="button" id="replay-load-share-btn">Load share code</button>
    `;
    document.body.appendChild(this.panel);
    this.panel.style.display = 'none';

    this.slider = this.panel.querySelector('#replay-scrub') as HTMLInputElement;
    this.frameLabel = this.panel.querySelector('#replay-frame-label') as HTMLElement;
    this.shareInput = this.panel.querySelector('#replay-share-code') as HTMLInputElement;

    this.panel.querySelector('#replay-play-btn')?.addEventListener('click', () => this.playback?.play());
    this.panel.querySelector('#replay-pause-btn')?.addEventListener('click', () => this.playback?.pause());
    this.panel.querySelector('#replay-step-back-btn')?.addEventListener('click', () => this.playback?.stepBackward());
    this.panel.querySelector('#replay-step-fwd-btn')?.addEventListener('click', () => this.playback?.stepForward());
    this.panel.querySelector('#replay-stop-btn')?.addEventListener('click', () => this.stop());
    this.panel.querySelector('#replay-download-btn')?.addEventListener('click', () => {
      if (this.lastFile) downloadReplayFile(this.lastFile);
    });
    this.panel.querySelector('#replay-webm-btn')?.addEventListener('click', () => void this.exportWebm());
    this.panel.querySelector('#replay-load-share-btn')?.addEventListener('click', () => this.loadShareCode());

    this.slider.addEventListener('input', () => {
      const frame = Number(this.slider.value);
      this.playback?.scrubTo(frame);
      this.renderReplayFrame(frame);
    });
  }

  load(file: ReplayFile): void {
    this.lastFile = file;
    saveReplayToStorage(file);
    this.shareInput.value = toShareCode(file);
    this.playback = new ReplayPlayback(file);
    this.playback.setCallbacks({
      onFrame: (frame) => this.renderReplayFrame(frame),
      onEnd: () => this.updateFrameLabel(this.playback?.frame ?? 0),
    });
    this.slider.max = String(this.playback.maxFrame);
    this.slider.value = '0';
    this.playback.scrubTo(0);
    this.panel.style.display = 'flex';
    this.updateFrameLabel(0);
  }

  loadFromStorage(): boolean {
    const file = loadReplayFromStorage();
    if (!file) return false;
    this.load(file);
    return true;
  }

  hide(): void {
    this.panel.style.display = 'none';
  }

  stop(): void {
    this.playback?.stop();
    this.hide();
  }

  private renderReplayFrame(frame: number): void {
    if (!this.playback) return;
    const state = this.playback.game.getState();
    this.host.viewWebGPU.state = state;
    this.host.viewWebGPU.render(1 / 60);
    this.slider.value = String(frame);
    this.updateFrameLabel(frame);
  }

  private loadShareCode(): void {
    const code = this.shareInput.value.trim();
    if (!code) return;
    try {
      this.load(fromShareCode(code));
    } catch (err) {
      console.warn('[Replay] invalid share code', err);
    }
  }

  private updateFrameLabel(frame: number): void {
    const max = this.playback?.maxFrame ?? 0;
    const seed = this.lastFile?.seed ?? 0;
    this.frameLabel.textContent = `frame ${frame} / ${max} · seed ${seed}`;
  }

  private async exportWebm(): Promise<void> {
    const canvas = this.host.getCanvas();
    if (!canvas || !this.playback) return;
    this.playback.pause();
    this.playback.scrubTo(0);
    this.renderReplayFrame(0);
    this.playback.startWebmCapture(canvas);
    await new Promise<void>((resolve) => {
      this.playback!.setCallbacks({
        onFrame: (frame) => this.renderReplayFrame(frame),
        onEnd: () => resolve(),
      });
      this.playback!.play();
    });
    const blob = await this.playback.stopWebmCaptureAsync();
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'tetris-replay.webm';
    a.click();
    URL.revokeObjectURL(url);
  }
}

export function initReplayUI(host: ReplayUIHost): ReplayUI {
  return new ReplayUI(host);
}
