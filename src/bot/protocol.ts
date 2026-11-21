/** Messages between the main thread and the bot Worker. Plain structured-cloneable data only. */

import type { BotPosition, SearchOptions, SearchResult } from './types.js';

export type BotWorkerRequest =
  | { type: 'init'; wasmUrl: string }
  | { type: 'search'; id: number; position: BotPosition; options: SearchOptions; nodeBudget: number }
  | { type: 'cancel'; id: number };

export type BotWorkerResponse =
  | { type: 'ready' }
  | { type: 'result'; id: number; result: SearchResult }
  | { type: 'error'; id?: number; message: string };
