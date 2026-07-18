import type { ReplayActionName } from '../replay/actions.js';

export type BufferAction = 'left' | 'right' | 'down' | 'rotateCW' | 'rotateCCW' | 'hardDrop' | 'hold';

export interface InputBufferState {
  bufferedAction: BufferAction | null;
  bufferedActionTime: number;
  bufferedMoveAction: 'left' | 'right' | null;
  bufferedMoveActionTime: number;
}

export interface InputBufferDeps extends InputBufferState {
  moveBufferWindow: number;
  jumpBufferWindow: number;
  getActivPieceX(): number;
  getActivPieceY(): number | undefined;
  getActivPieceRotation(): number;
  canHold: boolean;
  moveLeft(): void;
  moveRight(): void;
  rotateCW(): boolean;
  rotateCCW(): boolean;
  performHold(): boolean;
  performHardDrop(): void;
  recordReplay(action: ReplayActionName): void;
  playMoveSound(direction: 'left' | 'right'): void;
  playHoldSound(): void;
  onRotate?(): void;
  onHold?(): void;
}

function triggerHoldAnimation(): void {
  const holdEl = document.querySelector('.hold-piece-container');
  if (holdEl) {
    holdEl.classList.remove('swap-whoosh-active');
    void (holdEl as HTMLElement).offsetWidth;
    holdEl.classList.add('swap-whoosh-active');
  }
}

export function processInputBuffer(deps: InputBufferDeps, currentTime: number): void {
  if (deps.bufferedMoveAction) {
    if (currentTime - deps.bufferedMoveActionTime > deps.moveBufferWindow) {
      deps.bufferedMoveAction = null;
    } else {
      let moveSuccess = false;
      const pxBefore = deps.getActivPieceX();
      if (deps.bufferedMoveAction === 'left') {
        deps.moveLeft();
        if (deps.getActivPieceX() !== pxBefore) moveSuccess = true;
      } else if (deps.bufferedMoveAction === 'right') {
        deps.moveRight();
        if (deps.getActivPieceX() !== pxBefore) moveSuccess = true;
      }
      if (moveSuccess) {
        deps.recordReplay(deps.bufferedMoveAction === 'left' ? 'left' : 'right');
        deps.playMoveSound(deps.bufferedMoveAction === 'left' ? 'left' : 'right');
        deps.bufferedMoveAction = null;
      }
    }
  }

  if (!deps.bufferedAction) return;

  const isRotate = deps.bufferedAction === 'rotateCW' || deps.bufferedAction === 'rotateCCW';
  const bufferWindow = (isRotate || deps.bufferedAction === 'hold')
    ? deps.jumpBufferWindow
    : deps.moveBufferWindow;

  if (currentTime - deps.bufferedActionTime > bufferWindow) {
    deps.bufferedAction = null;
    return;
  }

  let success = false;
  if (deps.bufferedAction === 'rotateCW') {
    if (deps.rotateCW()) {
      deps.recordReplay('rotateCW');
      deps.onRotate?.();
      success = true;
    }
  } else if (deps.bufferedAction === 'rotateCCW') {
    if (deps.rotateCCW()) {
      deps.recordReplay('rotateCCW');
      deps.onRotate?.();
      success = true;
    }
  } else if (deps.bufferedAction === 'hold') {
    if (deps.performHold()) {
      deps.recordReplay('hold');
      triggerHoldAnimation();
      deps.playHoldSound();
      deps.onHold?.();
      success = true;
    }
  } else if (deps.bufferedAction === 'hardDrop') {
    const yBefore = deps.getActivPieceY();
    deps.recordReplay('hardDrop');
    deps.performHardDrop();
    if (deps.getActivPieceY() !== yBefore) {
      success = true;
    }
  }

  if (success) {
    deps.bufferedAction = null;
  }
}
