/**
 * SubliminalReinforcement
 *
 * Optional experimental positive reinforcement system.
 * Flashes short, positive, gold-glowing words (25-45ms) during gameplay
 * to provide subtle motivational priming for focus and flow.
 *
 * - Designed for negligible performance impact (event-driven, rare DOM writes).
 * - Fully toggleable via pause menu + localStorage.
 * - Extensible for future audio cues (see maybePlayAudioCue stub).
 * - Debug mode (localStorage 'tetris_subliminal_debug' === 'true') makes flashes visible + logs.
 *
 * Categories supported for future filtering / A/B experimentation:
 *   focus | performance | calm | achievement
 *
 * Usage (wired in controller + index.ts):
 *   subliminal.triggerReinforcement('lineClear', 'strong');
 *   subliminal.checkBackgroundReinforcement(playTimeMs);
 *
 * This is an experimental feature. See GitHub issues for UI polish, audio, self-experiment tools, etc.
 */

import { gameLogger, isDebugEnabled } from '../utils/logger.js';

export type SubliminalContext =
  | 'lineClear'
  | 'tspin'
  | 'levelUp'
  | 'highScore'
  | 'background';

export type SubliminalIntensity = 'normal' | 'strong';

export interface SubliminalWord {
  word: string;
  category: 'focus' | 'performance' | 'calm' | 'achievement';
}

export interface SubliminalOptions {
  enabled?: boolean;
  flashDurationMin?: number;
  flashDurationMax?: number;
  minIntervalMs?: number;
}

const STORAGE_KEY = 'tetris_subliminal_enabled';
const DEBUG_STORAGE_KEY = 'tetris_subliminal_debug';

// Curated short positive words/phrases (1-2 words ideal for subliminal priming)
const WORD_BANK: SubliminalWord[] = [
  // Focus
  { word: 'Focused', category: 'focus' },
  { word: 'Flow', category: 'focus' },
  { word: 'Steady', category: 'focus' },
  { word: 'Clarity', category: 'focus' },
  { word: 'Align', category: 'focus' },
  // Performance
  { word: 'Precision', category: 'performance' },
  { word: 'Momentum', category: 'performance' },
  { word: 'Locked In', category: 'performance' },
  { word: 'Surge', category: 'performance' },
  { word: 'Power', category: 'performance' },
  // Calm
  { word: 'Calm', category: 'calm' },
  { word: 'Zen', category: 'calm' },
  { word: 'Breathe', category: 'calm' },
  { word: 'Center', category: 'calm' },
  { word: 'Ease', category: 'calm' },
  // Achievement
  { word: 'Excellent', category: 'achievement' },
  { word: 'Prime', category: 'achievement' },
  { word: 'Zenith', category: 'achievement' },
  { word: 'Mastery', category: 'achievement' },
  { word: 'Record', category: 'achievement' },
];

// Context → preferred categories (bias, not exclusive)
const CONTEXT_BIAS: Record<SubliminalContext, string[]> = {
  lineClear: ['performance', 'focus'],
  tspin: ['achievement', 'performance'],
  levelUp: ['achievement', 'focus'],
  highScore: ['achievement'],
  background: ['calm', 'focus'],
};

export class SubliminalReinforcement {
  private enabled: boolean;
  private overlay: HTMLDivElement | null = null;
  private lastFlashTime = 0;
  private lastBackgroundTime = 0;
  private recentWords: string[] = []; // simple anti-repetition ring buffer
  private readonly maxRecent = 4;

  // Tunable timings (ms)
  private readonly flashDurationMin: number;
  private readonly flashDurationMax: number;
  private readonly minIntervalMs: number;
  private readonly backgroundMin: number = 45_000;
  private readonly backgroundMax: number = 90_000;

  constructor(options: SubliminalOptions = {}) {
    // Default ON for the experimental phase (user can disable immediately via pause menu).
    // Future versions may default to false for stricter transparency.
    const saved = (typeof localStorage !== 'undefined')
      ? localStorage.getItem(STORAGE_KEY)
      : null;

    this.enabled = options.enabled ?? (saved === null ? true : saved !== 'false');

    this.flashDurationMin = options.flashDurationMin ?? 25;
    this.flashDurationMax = options.flashDurationMax ?? 45;
    this.minIntervalMs = options.minIntervalMs ?? 8500;

    // Create (or re-use) the overlay on construction
    this.ensureOverlay();
  }

  // ---------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------

  /** Returns whether the system is currently enabled */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Enable or disable at runtime (called from pause menu toggle).
   * Persists choice to localStorage.
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    try {
      localStorage.setItem(STORAGE_KEY, String(enabled));
    } catch {
      /* ignore storage quota / private mode */
    }

    if (!enabled && this.overlay) {
      this.overlay.style.opacity = '0';
    }

    gameLogger.info?.(`SubliminalReinforcement ${enabled ? 'enabled' : 'disabled'}`);
  }

  /**
   * Trigger a subliminal flash for a meaningful positive game moment.
   * Respects cooldown + enabled flag.
   */
  triggerReinforcement(
    context: SubliminalContext,
    intensity: SubliminalIntensity = 'normal'
  ): void {
    if (!this.enabled) return;

    const now = Date.now();
    if (now - this.lastFlashTime < this.minIntervalMs) {
      return; // cooldown
    }

    const word = this.pickWord(context);
    if (!word) return;

    const duration = this.computeFlashDuration(intensity);
    this.flash(word, duration, context, intensity);

    this.lastFlashTime = now;
    this.trackRecent(word);
  }

  /**
   * Called every frame from the controller when actively playing.
   * Fires a very low-intensity background reinforcement on a slow random cadence.
   */
  checkBackgroundReinforcement(elapsedPlayMs: number): void {
    if (!this.enabled) return;
    if (elapsedPlayMs - this.lastBackgroundTime < this.backgroundMin) return;

    // Random window 45-90s
    const window = this.backgroundMax - this.backgroundMin;
    const threshold = this.backgroundMin + Math.random() * window;

    if (elapsedPlayMs - this.lastBackgroundTime >= threshold) {
      this.triggerReinforcement('background', 'normal');
      this.lastBackgroundTime = elapsedPlayMs;
    }
  }

  /** Optional hook for future audio extension (no-op today) */
  maybePlayAudioCue(_word: string, _intensity: SubliminalIntensity): void {
    // FUTURE: integrate with SoundManager for soft Web Audio chimes/tones
    // e.g. soundManager.playSubliminalTone(word.length, intensity);
    // Keep this method so the architecture already supports it.
  }

  /**
   * For development / self-experimentation.
   * When debug flag is set, flashes become visible (800ms) and are logged.
   */
  private isDebugMode(): boolean {
    try {
      return localStorage.getItem(DEBUG_STORAGE_KEY) === 'true';
    } catch {
      return false;
    }
  }

  /** Programmatic debug enabler (console use) */
  enableDebugFlash(): void {
    try {
      localStorage.setItem(DEBUG_STORAGE_KEY, 'true');
    } catch {}
    gameLogger.info?.('Subliminal debug mode enabled (long flashes + logs)');
  }

  disableDebugFlash(): void {
    try {
      localStorage.removeItem(DEBUG_STORAGE_KEY);
    } catch {}
  }

  /** Cleanup (mainly for tests or hot reload scenarios) */
  destroy(): void {
    if (this.overlay && this.overlay.parentNode) {
      this.overlay.parentNode.removeChild(this.overlay);
    }
    this.overlay = null;
  }

  // ---------------------------------------------------------------------
  // Internal Implementation
  // ---------------------------------------------------------------------

  private ensureOverlay(): void {
    if (this.overlay) return;

    // Try to find an existing one (hot reload safety)
    const existing = document.getElementById('subliminal-overlay') as HTMLDivElement | null;
    if (existing) {
      this.overlay = existing;
      return;
    }

    const el = document.createElement('div');
    el.id = 'subliminal-overlay';
    el.setAttribute('aria-hidden', 'true');

    // Positioned elegantly right-of-center, above the playfield, non-obstructive.
    // Gold/glass neon aesthetic to match the rest of the UI.
    el.style.cssText = [
      'position:fixed',
      'left:62%',
      'top:27%',
      'transform:translate(-50%, -50%)',
      'z-index:280',
      'pointer-events:none',
      'font-family:"Play", system-ui, -apple-system, sans-serif',
      'font-size:13px',
      'font-weight:600',
      'letter-spacing:3.2px',
      'text-transform:uppercase',
      'color:#ffdd44',
      'text-shadow:0 0 6px #ffd700, 0 0 14px rgba(255,215,0,0.45)',
      'opacity:0',
      'transition:opacity 18ms linear',
      'white-space:nowrap',
      'user-select:none',
    ].join(';');

    document.body.appendChild(el);
    this.overlay = el;
  }

  private flash(
    word: string,
    durationMs: number,
    context: SubliminalContext,
    intensity: SubliminalIntensity
  ): void {
    if (!this.overlay) this.ensureOverlay();
    if (!this.overlay) return;

    const debug = this.isDebugMode();
    const actualDuration = debug ? Math.max(650, durationMs * 18) : durationMs;

    this.overlay.textContent = word;
    this.overlay.style.opacity = debug ? '0.95' : '0.88';

    // Gentle extra "pop" on strong moments (still extremely brief)
    if (intensity === 'strong' && !debug) {
      this.overlay.style.transform = 'translate(-50%, -50%) scale(1.06)';
    }

    const reset = () => {
      if (this.overlay) {
        this.overlay.style.opacity = '0';
        this.overlay.style.transform = 'translate(-50%, -50%)';
      }
    };

    setTimeout(reset, actualDuration);

    // Optional future audio
    this.maybePlayAudioCue(word, intensity);

    // Development visibility
    if (debug || isDebugEnabled()) {
      gameLogger.info?.(
        `SUBLIMINAL [${context}] ${word} (${actualDuration}ms, ${intensity})`
      );
    }
  }

  private pickWord(context: SubliminalContext): string | null {
    const preferred = CONTEXT_BIAS[context] || [];
    let candidates = WORD_BANK.filter(w => preferred.includes(w.category));

    // Fallback to full bank if bias yields nothing (shouldn't happen)
    if (candidates.length === 0) candidates = WORD_BANK;

    // Remove recently shown words
    candidates = candidates.filter(w => !this.recentWords.includes(w.word));

    if (candidates.length === 0) {
      // All recent — allow any (rare)
      candidates = WORD_BANK;
    }

    const chosen = candidates[Math.floor(Math.random() * candidates.length)];
    return chosen?.word ?? null;
  }

  private computeFlashDuration(intensity: SubliminalIntensity): number {
    const base = this.flashDurationMin +
      Math.random() * (this.flashDurationMax - this.flashDurationMin);

    return Math.floor(intensity === 'strong' ? base * 1.25 : base);
  }

  private trackRecent(word: string): void {
    this.recentWords.push(word);
    if (this.recentWords.length > this.maxRecent) {
      this.recentWords.shift();
    }
  }
}

// Default export for ergonomic imports where desired
export default SubliminalReinforcement;
