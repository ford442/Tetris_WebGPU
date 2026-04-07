/**
 * Mobile Touch Controls
 * Handles touch input for mobile/tablet devices
 */

export type TouchAction = 'left' | 'right' | 'down' | 'rotateCW' | 'rotateCCW' | 'hardDrop' | 'hold' | 'pause';

export interface TouchControlConfig {
  enabled: boolean;
  buttonSize: number;
  buttonOpacity: number;
  position: 'left' | 'right' | 'both';
}

export class TouchControls {
  private container: HTMLElement | null = null;
  private isVisible: boolean = false;
  private onAction: (action: TouchAction) => void;
  private config: TouchControlConfig;

  constructor(onAction: (action: TouchAction) => void, config: Partial<TouchControlConfig> = {}) {
    this.onAction = onAction;
    this.config = {
      enabled: true,
      buttonSize: 60,
      buttonOpacity: 0.6,
      position: 'both',
      ...config
    };

    this.detectTouchDevice();
  }

  private detectTouchDevice(): void {
    const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    if (isTouchDevice && this.config.enabled) {
      this.show();
    }
  }

  show(): void {
    if (this.isVisible) return;
    this.createControls();
    this.isVisible = true;
  }

  hide(): void {
    if (!this.isVisible || !this.container) return;
    this.container.style.display = 'none';
    this.isVisible = false;
  }

  destroy(): void {
    if (this.container) {
      this.container.remove();
      this.container = null;
    }
    this.isVisible = false;
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
      <button class="touch-btn touch-hold" data-action="hold" style="width:${buttonSize}px;height:${buttonSize}px;opacity:${opacity}">
        <span>HOLD</span>
      </button>
      <div class="touch-dpad">
        <button class="touch-btn touch-rotate-ccw" data-action="rotateCCW" style="width:${buttonSize}px;height:${buttonSize}px;opacity:${opacity}">
          <span>↺</span>
        </button>
        <button class="touch-btn touch-left" data-action="left" style="width:${buttonSize}px;height:${buttonSize}px;opacity:${opacity}">
          <span>←</span>
        </button>
        <button class="touch-btn touch-down" data-action="down" style="width:${buttonSize}px;height:${buttonSize}px;opacity:${opacity}">
          <span>↓</span>
        </button>
      </div>
    `;

    const rightPanel = document.createElement('div');
    rightPanel.className = 'touch-panel touch-right';
    rightPanel.innerHTML = `
      <button class="touch-btn touch-pause" data-action="pause" style="width:${buttonSize * 0.8}px;height:${buttonSize * 0.8}px;opacity:${opacity}">
        <span>⏸</span>
      </button>
      <div class="touch-actions">
        <button class="touch-btn touch-rotate-cw" data-action="rotateCW" style="width:${buttonSize}px;height:${buttonSize}px;opacity:${opacity}">
          <span>↻</span>
        </button>
        <button class="touch-btn touch-right" data-action="right" style="width:${buttonSize}px;height:${buttonSize}px;opacity:${opacity}">
          <span>→</span>
        </button>
        <button class="touch-btn touch-hard-drop" data-action="hardDrop" style="width:${buttonSize * 1.2}px;height:${buttonSize}px;opacity:${opacity}">
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

  private attachEventListeners(): void {
    if (!this.container) return;

    const buttons = this.container.querySelectorAll('.touch-btn');
    
    buttons.forEach((btn) => {
      const button = btn as HTMLElement;
      const action = button.dataset.action as TouchAction;

      button.addEventListener('touchstart', (e) => {
        e.preventDefault();
        e.stopPropagation();
        button.classList.add('active');
        this.onAction(action);
      }, { passive: false });

      button.addEventListener('touchend', (e) => {
        e.preventDefault();
        e.stopPropagation();
        button.classList.remove('active');
      }, { passive: false });

      button.addEventListener('touchcancel', (e) => {
        e.preventDefault();
        button.classList.remove('active');
      }, { passive: false });

      button.addEventListener('mousedown', (e) => {
        e.preventDefault();
        button.classList.add('active');
        this.onAction(action);
      });

      button.addEventListener('mouseup', (e) => {
        e.preventDefault();
        button.classList.remove('active');
      });

      button.addEventListener('mouseleave', () => {
        button.classList.remove('active');
      });
    });

    this.container.addEventListener('touchmove', (e) => {
      e.preventDefault();
    }, { passive: false });
  }

  setOpacity(opacity: number): void {
    this.config.buttonOpacity = opacity;
    if (!this.container) return;
    
    const buttons = this.container.querySelectorAll('.touch-btn');
    buttons.forEach((btn) => {
      (btn as HTMLElement).style.opacity = opacity.toString();
    });
  }
}

export function addTouchControlStyles(): void {
  if (document.getElementById('touch-control-styles')) return;

  const styles = document.createElement('style');
  styles.id = 'touch-control-styles';
  styles.textContent = `
    .touch-controls {
      position: fixed;
      bottom: 0;
      left: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
      z-index: 100;
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      padding: 20px;
      box-sizing: border-box;
    }

    .touch-panel {
      display: flex;
      flex-direction: column;
      gap: 10px;
      pointer-events: auto;
    }

    .touch-left {
      align-items: flex-start;
    }

    .touch-right {
      align-items: flex-end;
    }

    .touch-dpad {
      display: grid;
      grid-template-columns: repeat(2, auto);
      grid-template-rows: repeat(2, auto);
      gap: 8px;
    }

    .touch-dpad .touch-rotate-ccw {
      grid-column: 2;
      grid-row: 1;
    }

    .touch-dpad .touch-left {
      grid-column: 1;
      grid-row: 2;
    }

    .touch-dpad .touch-down {
      grid-column: 2;
      grid-row: 2;
    }

    .touch-actions {
      display: grid;
      grid-template-columns: repeat(2, auto);
      grid-template-rows: repeat(2, auto);
      gap: 8px;
    }

    .touch-actions .touch-rotate-cw {
      grid-column: 1;
      grid-row: 1;
    }

    .touch-actions .touch-right {
      grid-column: 2;
      grid-row: 2;
    }

    .touch-actions .touch-hard-drop {
      grid-column: 1 / 3;
      grid-row: 2;
    }

    .touch-btn {
      background: rgba(0, 0, 0, 0.6);
      border: 2px solid rgba(255, 255, 255, 0.4);
      border-radius: 12px;
      color: white;
      font-family: inherit;
      font-weight: bold;
      font-size: 1.2rem;
      cursor: pointer;
      pointer-events: auto;
      touch-action: manipulation;
      user-select: none;
      -webkit-user-select: none;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.1s;
      backdrop-filter: blur(4px);
    }

    .touch-btn span {
      pointer-events: none;
    }

    .touch-btn:active,
    .touch-btn.active {
      background: rgba(255, 255, 255, 0.3);
      border-color: rgba(255, 255, 255, 0.8);
      transform: scale(0.95);
    }

    .touch-hold {
      font-size: 0.7rem !important;
    }

    .touch-hard-drop {
      background: rgba(255, 50, 50, 0.4) !important;
      border-color: rgba(255, 100, 100, 0.6) !important;
    }

    .touch-hard-drop:active,
    .touch-hard-drop.active {
      background: rgba(255, 100, 100, 0.6) !important;
    }

    .touch-pause {
      align-self: flex-end;
      margin-bottom: 10px;
      font-size: 1rem !important;
    }

    @media (hover: hover) and (pointer: fine) {
      .touch-controls {
        display: none !important;
      }
    }

    @media (max-width: 600px) {
      .touch-btn {
        transform: scale(0.9);
      }
    }

    @media (max-width: 400px) {
      .touch-btn {
        transform: scale(0.8);
      }
    }
  `;

  document.head.appendChild(styles);
}

export default TouchControls;
