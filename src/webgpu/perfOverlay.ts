/**
 * Debug performance overlay — `?perf=1` or settings `showPerfOverlay`.
 * Displays GPU pass timings, frame EMA, particle stats, and adapter info.
 */

import type { PassTimerSnapshot } from './gpuPassTimers.js';
import type { ParticleMetricsSnapshot } from './particles/metrics.js';

export interface PerfOverlayAdapterInfo {
  vendor?: string;
  architecture?: string;
  device?: string;
  description?: string;
}

export interface PerfOverlayData {
  frameEmaMs: number;
  budgetMs: number;
  adaptiveStep: number;
  adaptiveLocked: boolean;
  passTimers: PassTimerSnapshot;
  particles: ParticleMetricsSnapshot | null;
  particleCap: number;
  aliveParticles: number;
  adapter: PerfOverlayAdapterInfo | null;
  renderScale: number;
  splitScreen: boolean;
}

export function isPerfOverlayEnabled(search?: string): boolean {
  if (typeof window === 'undefined') return false;
  const params = new URLSearchParams(search ?? window.location.search);
  return params.get('perf') === '1';
}

export class PerfOverlay {
  private readonly root: HTMLDivElement;
  private readonly lines: HTMLPreElement;
  private visible = false;
  private lastText = '';

  constructor(parent: HTMLElement) {
    this.root = document.createElement('div');
    this.root.id = 'tetris-perf-overlay';
    this.root.style.cssText = [
      'position:fixed',
      'top:8px',
      'right:8px',
      'z-index:9999',
      'pointer-events:none',
      'font:11px/1.35 ui-monospace,monospace',
      'color:#b8f0c8',
      'background:rgba(0,12,8,0.82)',
      'border:1px solid rgba(80,200,140,0.35)',
      'border-radius:6px',
      'padding:8px 10px',
      'max-width:min(360px,92vw)',
      'white-space:pre',
      'display:none',
      'text-shadow:0 0 6px rgba(0,255,120,0.25)',
    ].join(';');

    this.lines = document.createElement('pre');
    this.lines.style.margin = '0';
    this.root.appendChild(this.lines);
    parent.appendChild(this.root);
  }

  setVisible(show: boolean): void {
    this.visible = show;
    this.root.style.display = show ? 'block' : 'none';
  }

  isVisible(): boolean {
    return this.visible;
  }

  update(data: PerfOverlayData): void {
    if (!this.visible) return;

    const pt = data.passTimers;
    const regions = pt.regions;
    const p = data.particles;

    const lines: string[] = [
      `frame EMA ${data.frameEmaMs.toFixed(2)} ms  (budget ${data.budgetMs.toFixed(1)} ms)`,
      `adaptive step ${data.adaptiveStep}${data.adaptiveLocked ? ' [locked]' : ''}  scale ${data.renderScale.toFixed(2)}x`,
    ];

    if (data.splitScreen) {
      lines.push(`versus split — particle cap min(adaptive, SPLIT_PARTICLE_CAP)`);
    }

    lines.push(`particles alive~${data.aliveParticles} cap ${data.particleCap} pending ${p?.pendingEmits ?? 0}`);

    if (pt.enabled) {
      lines.push(
        `GPU passes (ms):`,
        `  main     ${regions.mainBlocks.toFixed(2)}`,
        `  particle ${regions.particleCompute.toFixed(2)} + draw ${regions.particleDraw.toFixed(2)}`,
        `  dissolve ${regions.dissolveCompute.toFixed(2)}`,
        `  post     ${regions.postProcess.toFixed(2)}`,
        `  bloom    ${regions.bloom.toFixed(2)}`,
        `  total    ${pt.frameMs.toFixed(2)}`,
      );
    } else {
      lines.push('GPU timestamps: unavailable');
    }

    if (p) {
      lines.push(`CPU particle dispatch ${p.lastDispatchMs.toFixed(2)} ms  drops ${p.droppedEmits}`);
    }

    if (data.adapter) {
      const a = data.adapter;
      lines.push(
        `GPU: ${a.description ?? 'unknown'}`,
        `  ${a.vendor ?? '?'} / ${a.architecture ?? '?'} / ${a.device ?? '?'}`,
      );
    }

    const text = lines.join('\n');
    if (text !== this.lastText) {
      this.lastText = text;
      this.lines.textContent = text;
    }
  }

  destroy(): void {
    this.root.remove();
  }
}
