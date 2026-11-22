/**
 * Keyboard handling split out of controller.ts: what a fresh key press / release does to the
 * game (initial-press actions, input-buffer fallbacks, SOCD direction tracking). Continuous
 * DAS/ARR repeat lives in input/dasArr.ts; Controller owns the DOM listeners and lifecycle.
 *
 * Every game mutation goes through `host.press(action)` (the shared FrameStepper), which also
 * records it — a key event between two rules ticks is the same as a press at the start of the next.
 */

import type Game from '../game.js';
import type { IView } from '../view/IView.js';
import type SoundManager from '../sound.js';
import type { ReplayActionName } from '../replay/actions.js';
import { emitSoftDropBurst } from './softDropFx.js';

/** Logical actions a physical key can map to. */
export type Action = 'left' | 'right' | 'down' | 'rotateCW' | 'rotateCCW' | 'hardDrop' | 'hold';

/** The slice of Controller that keyboard handling reads and writes. */
export interface ControllerInputHost {
  game: Game;
  viewWebGPU: IView;
  soundManager: SoundManager;
  keys: { [key: string]: boolean };
  keyMap: { [key: string]: Action };
  actionTimers: Record<Action, number>;
  lastDirection: 'left' | 'right' | null;
  bufferedAction: Action | null;
  bufferedActionTime: number;
  bufferedMoveAction: 'left' | 'right' | null;
  bufferedMoveActionTime: number;
  /** Apply `action` through the shared FrameStepper (recorded for replay). */
  press(action: ReplayActionName): void;
  playMoveSound(direction: 'left' | 'right' | 'down'): void;
  recordFinesseFault(): void;
  performHardDrop(): void;
  isActionPressed(action: Action): boolean;
}

/** First-press behaviour for `action` (key-repeat events never reach here). */
export function applyKeyDownAction(host: ControllerInputHost, action: Action): void {
    switch (action) {
        case 'left':
            host.lastDirection = 'left';
            {
                const pxBefore = host.game.activPiece.x;
                host.press('left');
                if (host.game.activPiece.x === pxBefore) {
                    host.bufferedMoveAction = 'left';
                    host.bufferedMoveActionTime = performance.now();
                    host.recordFinesseFault();
                } else {
                    host.playMoveSound('left');
                }
            }
            host.actionTimers.left = 0;
            break;
        case 'right':
            host.lastDirection = 'right';
            {
                const pxBefore = host.game.activPiece.x;
                host.press('right');
                if (host.game.activPiece.x === pxBefore) {
                    host.bufferedMoveAction = 'right';
                    host.bufferedMoveActionTime = performance.now();
                    host.recordFinesseFault();
                } else {
                    host.playMoveSound('right');
                }
            }
            host.actionTimers.right = 0;
            break;
        case 'down':
            host.press('down');
            host.playMoveSound('down');
            // Remove heavy movement flash to let continuous soft drop take over
            host.viewWebGPU.visualEffects?.triggerSoftDropPressure?.(0.2);
            emitSoftDropBurst(host.game, host.viewWebGPU);
            host.actionTimers.down = 0;
            break;
        case 'rotateCW':
            {
                const rBefore = host.game.activPiece.rotation;
                host.press('rotateCW');
                if (host.game.activPiece.rotation !== rBefore) {
                     host.game.runStats.recordRotate();
                     host.viewWebGPU.onRotate?.();
                } else {
                     host.bufferedAction = 'rotateCW';
                     host.bufferedActionTime = performance.now();
                     host.recordFinesseFault();
                }
                host.soundManager.playRotate();
            }
            break;
        case 'rotateCCW':
            {
                const rBefore = host.game.activPiece.rotation;
                host.press('rotateCCW');
                if (host.game.activPiece.rotation !== rBefore) {
                     host.viewWebGPU.onRotate?.();
                } else {
                     // Jump buffer: if rotation failed, buffer it
                     host.bufferedAction = 'rotateCCW';
                     host.bufferedActionTime = performance.now();
                }
                host.soundManager.playRotate();
            }
            break;
        case 'hardDrop':
            {
                const yBefore = host.game.activPiece?.y;
                host.performHardDrop();
                if (host.game.activPiece?.y === yBefore && !host.game.getState().isGameOver) {
                    host.bufferedAction = 'hardDrop';
                    host.bufferedActionTime = performance.now();
                }
            }
            break;
        case 'hold':
            if (host.game.canHold) {
                host.press('hold');
              const holdEl = document.querySelector('.hold-piece-container');
              if (holdEl) {
                  holdEl.classList.remove('swap-whoosh-active');
                  void (holdEl as HTMLElement).offsetWidth; // trigger reflow
                  holdEl.classList.add('swap-whoosh-active');
              }
                host.soundManager.playHold();
                host.viewWebGPU.onHold?.();
            } else {
                host.bufferedAction = 'hold';
                host.bufferedActionTime = performance.now();
            }
            break;
    }
}

/** Key released: clear its pressed state and hand the held direction to the opposite key (SOCD). */
export function releaseKey(host: ControllerInputHost, code: string): void {
    if (host.keys[code]) {
        host.keys[code] = false;
        const action = host.keyMap[code];
        if (action === 'left' && host.lastDirection === 'left') {
          if (host.isActionPressed('right')) {
            host.lastDirection = 'right';
          } else {
            host.lastDirection = null;
          }
        } else if (action === 'right' && host.lastDirection === 'right') {
          if (host.isActionPressed('left')) {
            host.lastDirection = 'left';
          } else {
            host.lastDirection = null;
          }
        }
    }
}
