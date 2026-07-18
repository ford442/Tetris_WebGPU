import { INPUT_CONFIG } from '../config/gameConfig.js';

const DAS = INPUT_CONFIG.DAS;
const ARR = INPUT_CONFIG.ARR;
const SOFT_DROP_SPEED = INPUT_CONFIG.SOFT_DROP_SPEED;

export type DasAction = 'left' | 'right' | 'down';

export interface DasArrDeps {
  keys: Record<string, boolean>;
  keyMap: Record<string, DasAction | string>;
  actionTimers: Record<DasAction, number>;
  lastDirection: 'left' | 'right' | null;
  moveLeft(): void;
  moveRight(): void;
  moveDown(): boolean;
  onDasMove?(x: number, y: number): void;
  recordDownReplay?(): void;
}

export function isActionPressed(
  action: string,
  keys: Record<string, boolean>,
  keyMap: Record<string, string>,
): boolean {
  for (const key in keys) {
    if (keys[key] && keyMap[key] === action) {
      return true;
    }
  }
  return false;
}

export function processDasArrInput(deps: DasArrDeps, dt: number): void {
  let moveLeft = isActionPressed('left', deps.keys, deps.keyMap);
  let moveRight = isActionPressed('right', deps.keys, deps.keyMap);

  if (moveLeft && moveRight) {
    if (deps.lastDirection === 'left') {
      moveRight = false;
    } else {
      moveLeft = false;
    }
  }

  if (moveLeft) {
    deps.actionTimers.left += dt;
    if (deps.actionTimers.left > DAS) {
      if (ARR === 0) {
        deps.moveLeft();
        deps.actionTimers.left = DAS;
      } else {
        while (deps.actionTimers.left > DAS + ARR) {
          deps.moveLeft();
          deps.actionTimers.left -= ARR;
        }
      }
    }
  } else if (moveRight) {
    deps.actionTimers.right += dt;
    if (deps.actionTimers.right > DAS) {
      if (ARR === 0) {
        deps.moveRight();
        deps.actionTimers.right = DAS;
      } else {
        while (deps.actionTimers.right > DAS + ARR) {
          deps.moveRight();
          deps.actionTimers.right -= ARR;
        }
      }
    }
  }

  if (!isActionPressed('left', deps.keys, deps.keyMap)) {
    deps.actionTimers.left = 0;
  }
  if (!isActionPressed('right', deps.keys, deps.keyMap)) {
    deps.actionTimers.right = 0;
  }

  if (isActionPressed('down', deps.keys, deps.keyMap)) {
    deps.actionTimers.down += dt;
    if (deps.actionTimers.down > SOFT_DROP_SPEED) {
      let steps = (deps.actionTimers.down / SOFT_DROP_SPEED) | 0;
      deps.actionTimers.down %= SOFT_DROP_SPEED;
      if (steps > 22) steps = 22;

      for (let i = 0; i < steps; i++) {
        const moved = deps.moveDown();
        if (moved) {
          deps.recordDownReplay?.();
        }
        if (!moved) {
          break;
        }
      }
    }
  } else {
    deps.actionTimers.down = 0;
  }
}
