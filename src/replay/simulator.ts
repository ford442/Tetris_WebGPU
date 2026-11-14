import Game from '../game.js';
import type { GameModeId } from '../game/modes/types.js';
import { applyActionMask, REPLAY_ACTION } from './actions.js';
import {
  decodeInputStream,
  inputEventsToMap,
  REPLAY_TICK_MS,
  type ReplayFile,
  type ReplayInputEvent,
} from './format.js';
import { hashGameState } from './boardHash.js';

/**
 * Fixed-step (60 Hz) game simulator for deterministic replay verification.
 * Uses sync CPU update() — no GPU line-clear path.
 */
export class GameSimulator {
  readonly game: Game;
  frame = 0;
  private gravityTimer = 0;

  constructor(seed: number, modeId: GameModeId = 'marathon') {
    this.game = new Game();
    this.game.view = null;
    if (this.game.modeId !== modeId) {
      this.game.setMode(modeId);
    }
    this.game.reset({ seed });
  }

  reset(seed: number, modeId: GameModeId = 'marathon'): void {
    if (this.game.modeId !== modeId) {
      this.game.setMode(modeId);
    }
    this.game.reset({ seed });
    this.frame = 0;
    this.gravityTimer = 0;
  }

  tick(actionMask = 0): void {
    if (this.game.isRunEnded) return;

    // Capture state for onHardDrop before applying the action
    const g = this.game;
    const isHardDrop = (actionMask & REPLAY_ACTION.HARD_DROP) !== 0;
    const wasActive = !!g.activPiece;
    let currentX = 4;
    let ghostY = 0;
    let dropDist = 0;
    let colorIdx = 1;

    if (isHardDrop && wasActive) {
      currentX = g.activPiece.x;
      ghostY = g.getGhostY();
      dropDist = ghostY - g.activPiece.y;
      const type = g.activPiece.type;
      if (type === 'I') colorIdx = 1;
      else if (type === 'J') colorIdx = 2;
      else if (type === 'L') colorIdx = 3;
      else if (type === 'O') colorIdx = 4;
      else if (type === 'S') colorIdx = 5;
      else if (type === 'T') colorIdx = 6;
      else if (type === 'Z') colorIdx = 7;
    }

    applyActionMask(this.game, actionMask);

    if (isHardDrop && wasActive && g.view && g.view.onHardDrop) {
      const finalGhostY = g.lastDropPos?.y
        ?? g.gameStateCache.lastDropPos?.y
        ?? ghostY;
      const snap = g.getHardDropSnapshot?.();
      g.view.onHardDrop(currentX, finalGhostY, dropDist, colorIdx, snap?.blocks);
    }

    this.applyGravity();
    this.game.update(REPLAY_TICK_MS);
    this.game.tickMode(REPLAY_TICK_MS);
    this.frame++;
  }

  private applyGravity(): void {
    const level = this.game.getEffectiveLevel();
    let speedMs = 1000 * Math.pow(0.85, level - 1);
    if (speedMs < 0.5) speedMs = 0.5;

    this.gravityTimer += REPLAY_TICK_MS;
    let steps = 0;
    while (this.gravityTimer > speedMs && steps < 20 && !this.game.isRunEnded) {
      this.game.movePieceDown();
      this.gravityTimer -= speedMs;
      steps++;
    }
    if (steps >= 20) this.gravityTimer = 0;
  }

  boardHash(): number {
    return hashGameState(this.game.playfield, this.game.score, this.game.lines);
  }
}

export function runSimulation(
  seed: number,
  events: ReplayInputEvent[],
  maxFrames?: number,
  modeId: GameModeId = 'marathon',
): GameSimulator {
  const sim = new GameSimulator(seed, modeId);
  const inputs = inputEventsToMap(events);
  const limit = maxFrames ?? (events.length > 0
    ? Math.max(...events.map((e) => e.frame)) + 1
    : 0);

  for (let f = 0; f < limit && !sim.game.isRunEnded; f++) {
    sim.tick(inputs.get(f) ?? 0);
  }
  return sim;
}

export function runReplayFile(file: ReplayFile): GameSimulator {
  const events = decodeInputStream(file.inputs);
  return runSimulation(file.seed, events, file.frames || undefined, file.mode);
}
