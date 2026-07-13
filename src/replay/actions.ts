/** Logical replay actions — one bit per action in the input stream. */
export const REPLAY_ACTION = {
  LEFT: 1 << 0,
  RIGHT: 1 << 1,
  DOWN: 1 << 2,
  ROTATE_CW: 1 << 3,
  ROTATE_CCW: 1 << 4,
  HARD_DROP: 1 << 5,
  HOLD: 1 << 6,
} as const;

export type ReplayActionName =
  | 'left'
  | 'right'
  | 'down'
  | 'rotateCW'
  | 'rotateCCW'
  | 'hardDrop'
  | 'hold';

const NAME_TO_MASK: Record<ReplayActionName, number> = {
  left: REPLAY_ACTION.LEFT,
  right: REPLAY_ACTION.RIGHT,
  down: REPLAY_ACTION.DOWN,
  rotateCW: REPLAY_ACTION.ROTATE_CW,
  rotateCCW: REPLAY_ACTION.ROTATE_CCW,
  hardDrop: REPLAY_ACTION.HARD_DROP,
  hold: REPLAY_ACTION.HOLD,
};

export function actionNameToMask(name: ReplayActionName): number {
  return NAME_TO_MASK[name];
}

export function applyActionMask(game: {
  movePieceLeft(): void;
  movePieceRight(): void;
  movePieceDown(): void;
  rotatePiece(right: boolean): void;
  hardDrop(): { locked: boolean };
  hold(): void;
  canHold: boolean;
}, mask: number): void {
  if (mask & REPLAY_ACTION.LEFT) game.movePieceLeft();
  if (mask & REPLAY_ACTION.RIGHT) game.movePieceRight();
  if (mask & REPLAY_ACTION.DOWN) game.movePieceDown();
  if (mask & REPLAY_ACTION.ROTATE_CW) game.rotatePiece(true);
  if (mask & REPLAY_ACTION.ROTATE_CCW) game.rotatePiece(false);
  if (mask & REPLAY_ACTION.HARD_DROP) game.hardDrop();
  if ((mask & REPLAY_ACTION.HOLD) && game.canHold) game.hold();
}
