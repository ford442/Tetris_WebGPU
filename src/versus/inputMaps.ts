/** Logical player actions (matches controller Action type). */
export type PlayerAction =
  | 'left'
  | 'right'
  | 'down'
  | 'rotateCW'
  | 'rotateCCW'
  | 'hardDrop'
  | 'hold';

export type KeyCodeMap = Record<string, PlayerAction>;

/** Player 1 — arrow keys + space / C / X-Z. */
export const PLAYER1_KEY_MAP: KeyCodeMap = {
  ArrowLeft: 'left',
  ArrowRight: 'right',
  ArrowDown: 'down',
  ArrowUp: 'hardDrop',
  Space: 'hardDrop',
  KeyC: 'hold',
  ShiftLeft: 'hold',
  ShiftRight: 'hold',
  KeyX: 'rotateCW',
  KeyZ: 'rotateCCW',
};

/** Player 2 — WASD + Q/E/K/L + Tab hold. */
export const PLAYER2_KEY_MAP: KeyCodeMap = {
  KeyA: 'left',
  KeyD: 'right',
  KeyS: 'down',
  KeyW: 'hardDrop',
  KeyQ: 'rotateCCW',
  KeyE: 'rotateCW',
  KeyK: 'rotateCCW',
  KeyL: 'rotateCW',
  Tab: 'hold',
};

export function actionForPlayer(
  playerIndex: 0 | 1,
  keyCode: string,
): PlayerAction | undefined {
  const map = playerIndex === 0 ? PLAYER1_KEY_MAP : PLAYER2_KEY_MAP;
  return map[keyCode];
}
