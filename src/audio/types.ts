/** Game audio events routed through SoundManager. */
export type AudioEvent =
  | 'move'
  | 'rotate'
  | 'softDrop'
  | 'hardDrop'
  | 'lock'
  | 'hold'
  | 'lineClear'
  | 'tSpin'
  | 'levelUp'
  | 'gameOver'
  | 'pause'
  | 'resume'
  | 'menuNavigate'
  | 'menuSelect';

export type MoveDirection = 'left' | 'right' | 'down';

export interface MovePayload {
  direction?: MoveDirection;
  column?: number;
}

export interface LockPayload {
  pieceType?: string | number;
  column?: number;
}

export interface LineClearPayload {
  lines: number;
  combo: number;
  backToBack: boolean;
  column?: number;
}

export interface LevelUpPayload {
  level: number;
}

export type AudioEventPayload = {
  move: MovePayload;
  rotate: Record<string, never>;
  softDrop: Record<string, never>;
  hardDrop: Record<string, never>;
  lock: LockPayload;
  hold: Record<string, never>;
  lineClear: LineClearPayload;
  tSpin: Record<string, never>;
  levelUp: LevelUpPayload;
  gameOver: Record<string, never>;
  pause: Record<string, never>;
  resume: Record<string, never>;
  menuNavigate: Record<string, never>;
  menuSelect: Record<string, never>;
};

export type AudioEventListener<E extends AudioEvent = AudioEvent> = (
  payload: AudioEventPayload[E],
) => void;
