/**
 * CPU difficulty ladder. Everything that makes a level feel "human" is data here: how deep it thinks,
 * how long it takes to react, how fast it presses keys, how often it fumbles an input or picks the
 * runner-up move. The evaluator weights are shared by all levels — strength comes from search depth and
 * from NOT making deliberate errors, never from a different evaluation of the same board.
 */

export type BotDifficultyId = 'easy' | 'normal' | 'hard' | 'expert';

export interface BotDifficulty {
  id: BotDifficultyId;
  label: string;
  /** Plies to plan (1 = greedy). */
  depth: number;
  /** Beam width. */
  beam: number;
  /** Move-generator run budget for one decision (the "node" budget; one run ≈ 50–150 µs of wasm). */
  nodeBudget: number;
  /** 60 Hz ticks of "looking at the new piece" before the bot starts to think. */
  reactionTicks: number;
  /** Ticks between two key presses while moving a piece. */
  interKeyTicks: number;
  /** Probability that any single input is replaced by a wrong one (the closed-loop pilot then corrects it). */
  finesseErrorRate: number;
  /** Probability of playing the runner-up placement instead of the best one. */
  mistakeRate: number;
  /** Hard cap on pieces per second (minimum gap between hard drops). */
  maxPps: number;
}

export const BOT_DIFFICULTIES: Readonly<Record<BotDifficultyId, BotDifficulty>> = {
  easy: {
    id: 'easy', label: 'Easy', depth: 1, beam: 1, nodeBudget: 16,
    reactionTicks: 30, interKeyTicks: 9, finesseErrorRate: 0.1, mistakeRate: 0.25, maxPps: 0.8,
  },
  normal: {
    id: 'normal', label: 'Normal', depth: 2, beam: 6, nodeBudget: 64,
    reactionTicks: 18, interKeyTicks: 5, finesseErrorRate: 0.04, mistakeRate: 0.1, maxPps: 1.5,
  },
  hard: {
    id: 'hard', label: 'Hard', depth: 4, beam: 12, nodeBudget: 192,
    reactionTicks: 10, interKeyTicks: 3, finesseErrorRate: 0.015, mistakeRate: 0.03, maxPps: 2.5,
  },
  expert: {
    id: 'expert', label: 'Expert', depth: 6, beam: 16, nodeBudget: 480,
    reactionTicks: 4, interKeyTicks: 2, finesseErrorRate: 0, mistakeRate: 0, maxPps: 4,
  },
};

export function parseBotDifficulty(value: string | null | undefined): BotDifficulty {
  const key = (value ?? '').toLowerCase();
  return (BOT_DIFFICULTIES as Record<string, BotDifficulty>)[key] ?? BOT_DIFFICULTIES.normal;
}
