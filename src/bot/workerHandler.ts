/**
 * The Worker's brain, with no `self` in sight so Node tests can drive it directly: feed it requests,
 * collect responses through `post`. src/bot/botWorker.ts is the 6-line shell that wires it to `self`.
 */

import { BotCore } from './BotCore.js';
import { fetchBotWasm } from './loadWasm.js';
import type { BotWorkerRequest, BotWorkerResponse } from './protocol.js';

export interface WorkerHandlerDeps {
  /** Test seam: supply compiled bytes instead of fetching `wasmUrl`. */
  loadWasm?: (url: string) => Promise<BufferSource>;
}

export function createBotWorkerHandler(
  post: (msg: BotWorkerResponse) => void,
  deps: WorkerHandlerDeps = {},
): (req: BotWorkerRequest) => Promise<void> {
  let core: BotCore | null = null;
  const cancelled = new Set<number>();
  const load = deps.loadWasm ?? fetchBotWasm;

  return async (req) => {
    try {
      if (req.type === 'init') {
        core = await BotCore.create(await load(req.wasmUrl));
        post({ type: 'ready' });
      } else if (req.type === 'cancel') {
        cancelled.add(req.id);
      } else if (req.type === 'search') {
        if (!core) throw new Error('bot worker received a search before init');
        cancelled.delete(req.id);
        // The search runs to its node budget in one go: a Worker may block, the render loop never does.
        core.setPosition(req.position);
        core.searchBegin(req.options);
        core.searchStep(req.nodeBudget);
        const result = core.searchFinish();
        if (!cancelled.delete(req.id)) post({ type: 'result', id: req.id, result });
      }
    } catch (error) {
      post({ type: 'error', id: req.type === 'search' ? req.id : undefined, message: error instanceof Error ? error.message : String(error) });
    }
  };
}
