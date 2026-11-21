/** `?mode=versus-cpu[&cpu=easy|normal|hard|expert]` — pure so it is testable without a window. */

import { parseBotDifficulty, type BotDifficultyId } from './difficulty.js';

export interface CpuVersusUrl {
  difficulty: BotDifficultyId;
}

export function parseCpuVersusUrl(search: string): CpuVersusUrl | null {
  const params = new URLSearchParams(search);
  if (params.get('mode') !== 'versus-cpu') return null;
  return { difficulty: parseBotDifficulty(params.get('cpu')).id };
}
