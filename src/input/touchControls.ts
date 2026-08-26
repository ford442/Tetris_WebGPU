/**
 * Mobile Touch Controls
 * Large hit targets, swipe gestures on the playfield, optional haptics.
 */

import { INPUT_CONFIG } from '../config/gameConfig.js';

export type TouchAction = 'left' | 'right' | 'down' | 'rotateCW' | 'rotateCCW' | 'hardDrop' | 'hold' | 'pause';

export interface TouchControlConfig {
  enabled: boolean;
  buttonSize: number;
  buttonOpacity: number;
  position: 'left' | 'right' | 'both';
  enableSwipe: boolean;
  enableHaptics: boolean;
}

export function triggerHaptic(pattern: number | number[] = 12): void {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* Vibration API blocked or unsupported */
  }
}

export class TouchControls {
  private container: HTMLElement | null = null;
  private swipeZone: HTMLElement | null = null;
  private isVisible = false;
  private onAction: (action: TouchAction) => void;
  private onFirstTouch?: () => void;
  private config: TouchControlConfig;
  private repeatTimer: ReturnType<typeof setInterval> | null = null;
  private swipeStart: { x: number; y: number } | null = null;

  constructor(
    onAction: (action: TouchAction) => void,
    config: Partial<TouchControlConfig> = {},
    onFirstTouch?: () => void,
  ) {
    this.onAction = onAction;
    this.onFirstTouch = onFirstTouch;
    this.config = {
      enabled: true,
      buttonSize: 76,
      buttonOpacity: 0.72,
      position: 'both',
      enableSwipe: true,
      enableHaptics: true,
      ...config,
    };

    this.detectTouchDevice();
  }

  private detectTouchDevice(): void {
    const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    const coarse = window.matchMedia('(pointer: coarse)').matches;
    if ((isTouchDevice || coarse) && this.config.enabled) {
      this.show();
    }
  }

  private firstTouchDone = false;

  private handleFirstTouch(): void {
    if (this.firstTouchDone) return;
    this.firstTouchDone = true;
    this.onFirstTouch?.();
  }

  private fire(action: TouchAction, hapticPattern?: number | number[]): void {
    this.handleFirstTouch();
    if (this.config.enableHaptics) {
      triggerHaptic(hapticPattern ?? 12);
    }
    this.onAction(action);
  }

  show(): void {
    if (this.isVisible) return;
    this.createControls();
    if (this.config.enableSwipe) this.createSwipeZone();
    this.isVisible = true;
  }

  hide(): void {
    if (this.container) this.container.style.display = 'none';
    if (this.swipeZone) this.swipeZone.style.display = 'none';
    this.isVisible = false;
  }

  destroy(): void {
    this.stopRepeat();
    this.container?.remove();
    this.swipeZone?.remove();
    this.container = null;
    this.swipeZone = null;
    this.isVisible = false;
  }

  private createSwipeZone(): void {
    if (this.swipeZone) return;
    this.swipeZone = document.createElement('div');
    this.swipeZone.id = 'touch-swipe-zone';
    this.swipeZone.className = 'touch-swipe-zone';
    document.body.appendChild(this.swipeZone);

    const threshold = 36;

    this.swipeZone.addEventListener(
      'touchstart',
      (e) => {
        if (e.touches.length !== 1) return;
        this.handleFirstTouch();
        this.swipeStart = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      },
      { passive: true },
    );

    this.swipeZone.addEventListener(
      'touchend',
      (e) => {
        if (!this.swipeStart || e.changedTouches.length !== 1) return;
        const dx = e.changedTouches[0].clientX - this.swipeStart.x;
        const dy = e.changedTouches[0].clientY - this.swipeStart.y;
        this.swipeStart = null;
        const ax = Math.abs(dx);
        const ay = Math.abs(dy);
        if (Math.max(ax, ay) < threshold) return;

        if (ax > ay) {
          this.fire(dx > 0 ? 'right' : 'left', 8);
        } else if (dy > 0) {
          this.fire('down', 8);
        } else {
          this.fire('hardDrop', [6, 24, 10]);
        }
      },
      { passive: true },
    );

    this.swipeZone.addEventListener('touchcancel', () => {
      this.swipeStart = null;
    });
  }

  private createControls(): void {
    if (this.container) {
      this.container.style.display = 'flex';
      return;
    }

    this.container = document.createElement('div');
    this.container.id = 'touch-controls';
    this.container.className = 'touch-controls';

    const buttonSize = this.config.buttonSize;
    const opacity = this.config.buttonOpacity;

    const leftPanel = document.createElement('div');
    leftPanel.className = 'touch-panel touch-left';
    leftPanel.innerHTML = `
      <button class="touch-btn touch-hold" data-action="hold" data-haptic="20" style="width:${buttonSize}px;height:${buttonSize}px;opacity:${opacity}">
        <span>HOLD</span>
      </button>
      <div class="touch-dpad">
        <button class="touch-btn touch-rotate-ccw" data-action="rotateCCW" data-repeat="0" style="width:${buttonSize}px;height:${buttonSize}px;opacity:${opacity}">
          <span>↺</span>
        </button>
        <button class="touch-btn touch-left" data-action="left" data-repeat="1" style="width:${buttonSize}px;height:${buttonSize}px;opacity:${opacity}">
          <span>←</span>
        </button>
        <button class="touch-btn touch-down" data-action="down" data-repeat="1" style="width:${buttonSize}px;height:${buttonSize}px;opacity:${opacity}">
          <span>↓</span>
        </button>
      </div>
    `;

    const rightPanel = document.createElement('div');
    rightPanel.className = 'touch-panel touch-right';
    rightPanel.innerHTML = `
      <button class="touch-btn touch-pause" data-action="pause" style="width:${Math.floor(buttonSize * 0.85)}px;height:${Math.floor(buttonSize * 0.85)}px;opacity:${opacity}">
        <span>⏸</span>
      </button>
      <div class="touch-actions">
        <button class="touch-btn touch-rotate-cw" data-action="rotateCW" style="width:${buttonSize}px;height:${buttonSize}px;opacity:${opacity}">
          <span>↻</span>
        </button>
        <button class="touch-btn touch-right" data-action="right" data-repeat="1" style="width:${buttonSize}px;height:${buttonSize}px;opacity:${opacity}">
          <span>→</span>
        </button>
        <button class="touch-btn touch-hard-drop" data-action="hardDrop" data-haptic="30" style="width:${Math.floor(buttonSize * 1.35)}px;height:${buttonSize}px;opacity:${opacity}">
          <span>⤉ DROP</span>
        </button>
      </div>
    `;

    if (this.config.position === 'left' || this.config.position === 'both') {
      this.container.appendChild(leftPanel);
    }
    if (this.config.position === 'right' || this.config.position === 'both') {
      this.container.appendChild(rightPanel);
    }

    document.body.appendChild(this.container);
    this.attachEventListeners();
  }

  private stopRepeat(): void {
    if (this.repeatTimer) {
      clearInterval(this.repeatTimer);
      this.repeatTimer = null;
    }
  }

  private startRepeat(action: TouchAction): void {
    this.stopRepeat();
    this.repeatTimer = setInterval(() => this.fire(action, 4), INPUT_CONFIG.ARR || 16);
  }

  private attachEventListeners(): void {
    if (!this.container) return;

    const buttons = this.container.querySelectorAll('.touch-btn');

    buttons.forEach((btn) => {
      const button = btn as HTMLElement;
      const action = button.dataset.action as TouchAction;
      const haptic = button.dataset.haptic ? Number(button.dataset.haptic) : undefined;
      const repeat = button.dataset.repeat === '1';

      const press = () => {
        this.fire(action, haptic);
        if (repeat && (action === 'left' || action === 'right' || action === 'down')) {
          setTimeout(() => this.startRepeat(action), INPUT_CONFIG.DAS);
        }
      };

      button.addEventListener(
        'touchstart',
        (e) => {
          e.preventDefault();
          e.stopPropagation();
          button.classList.add('active');
          press();
        },
        { passive: false },
      );

      button.addEventListener(
        'touchend',
        (e) => {
          e.preventDefault();
          e.stopPropagation();
          button.classList.remove('active');
          this.stopRepeat();
        },
        { passive: false },
      );

      button.addEventListener(
        'touchcancel',
        () => {
          button.classList.remove('active');
          this.stopRepeat();
        },
        { passive: true },
      );

      button.addEventListener('mousedown', (e) => {
        e.preventDefault();
        button.classList.add('active');
        press();
      });

      button.addEventListener('mouseup', (e) => {
        e.preventDefault();
        button.classList.remove('active');
        this.stopRepeat();
      });

      button.addEventListener('mouseleave', () => {
        button.classList.remove('active');
        this.stopRepeat();
      });
    });
  }

  setOpacity(opacity: number): void {
    this.config.buttonOpacity = opacity;
    if (!this.container) return;
    this.container.querySelectorAll('.touch-btn').forEach((btn) => {
      (btn as HTMLElement).style.opacity = opacity.toString();
    });
  }
}

export function addTouchControlStyles(): void {
  if (document.getElementById('touch-control-styles')) return;

  const styles = document.createElement('style');
  styles.id = 'touch-control-styles';
  styles.textContent = `
    .touch-swipe-zone {
      position: fixed;
      top: env(safe-area-inset-top, 0);
      left: 22%;
      right: 22%;
      bottom: calc(140px + env(safe-area-inset-bottom, 0));
      z-index: 90;
      touch-action: none;
      pointer-events: auto;
    }

    .touch-controls {
      position: fixed;
      bottom: env(safe-area-inset-bottom, 0);
      left: env(safe-area-inset-left, 0);
      right: env(safe-area-inset-right, 0);
      width: auto;
      height: auto;
      pointer-events: none;
      z-index: 120;
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      padding: 12px 10px calc(12px + env(safe-area-inset-bottom, 0));
      box-sizing: border-box;
      gap: 8px;
    }

    .touch-panel {
      display: flex;
      flex-direction: column;
      gap: 10px;
      pointer-events: auto;
    }

    .touch-left { align-items: flex-start; }
    .touch-right { align-items: flex-end; }

    .touch-dpad,
    .touch-actions {
      display: grid;
      grid-template-columns: repeat(2, auto);
      grid-template-rows: repeat(2, auto);
      gap: 10px;
    }

    .touch-dpad .touch-rotate-ccw { grid-column: 2; grid-row: 1; }
    .touch-dpad .touch-left { grid-column: 1; grid-row: 2; }
    .touch-dpad .touch-down { grid-column: 2; grid-row: 2; }

    .touch-actions .touch-rotate-cw { grid-column: 1; grid-row: 1; }
    .touch-actions .touch-right { grid-column: 2; grid-row: 1; }
    .touch-actions .touch-hard-drop { grid-column: 1 / 3; grid-row: 2; }

    .touch-btn {
      min-width: 48px;
      min-height: 48px;
      background: rgba(0, 0, 0, 0.62);
      border: 2px solid rgba(140, 200, 255, 0.45);
      border-radius: 16px;
      color: white;
      font-family: inherit;
      font-weight: bold;
      font-size: 1.35rem;
      cursor: pointer;
      pointer-events: auto;
      touch-action: manipulation;
      user-select: none;
      -webkit-user-select: none;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: transform 0.08s, background 0.08s;
      backdrop-filter: blur(6px);
      box-shadow: 0 4px 14px rgba(0, 0, 0, 0.35);
    }

    .touch-btn span { pointer-events: none; }

    .touch-btn:active,
    .touch-btn.active {
      background: rgba(140, 200, 255, 0.28);
      border-color: rgba(200, 240, 255, 0.9);
      transform: scale(0.94);
    }

    .touch-hold { font-size: 0.72rem !important; letter-spacing: 0.05em; }

    .touch-hard-drop {
      background: rgba(180, 40, 60, 0.45) !important;
      border-color: rgba(255, 120, 140, 0.7) !important;
      font-size: 0.95rem !important;
    }

    .touch-pause {
      align-self: flex-end;
      margin-bottom: 6px;
      font-size: 1.1rem !important;
    }

    @media (hover: hover) and (pointer: fine) and (min-width: 900px) {
      .touch-controls,
      .touch-swipe-zone {
        display: none !important;
      }
    }

    @media (orientation: landscape) and (max-height: 520px) {
      .touch-swipe-zone {
        bottom: calc(100px + env(safe-area-inset-bottom, 0));
        left: 28%;
        right: 28%;
      }
      .touch-btn { transform: scale(0.92); }
    }
  `;

  document.head.appendChild(styles);
}

export default TouchControls;
