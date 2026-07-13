import { marathonMode } from './marathonMode.js';
import { sprintMode } from './sprintMode.js';
import { ultraMode } from './ultraMode.js';
import { versusMode } from './versusMode.js';
import type { GameMode, GameModeId } from './types.js';

const MODES: Record<GameModeId, GameMode | undefined> = {
  marathon: marathonMode,
  sprint: sprintMode,
  ultra: ultraMode,
  versus: versusMode,
  cheese: undefined,
  zen: undefined,
};

export const SHIPPED_MODE_IDS: GameModeId[] = ['marathon', 'sprint', 'ultra', 'versus'];

export function createGameMode(id: GameModeId): GameMode {
  const mode = MODES[id];
  if (!mode) {
    return marathonMode;
  }
  return mode;
}

export function parseGameModeId(raw: string | null | undefined): GameModeId {
  if (raw === 'sprint' || raw === 'ultra' || raw === 'marathon' || raw === 'versus') return raw;
  return 'marathon';
}

export function listShippedModes(): GameMode[] {
  return SHIPPED_MODE_IDS.map((id) => createGameMode(id));
}
