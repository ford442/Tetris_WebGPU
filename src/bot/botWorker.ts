/// Module Worker entry: `new Worker(new URL('./botWorker.ts', import.meta.url), { type: 'module' })`.
/// All logic lives in workerHandler.ts so it can be tested without a Worker.

import { createBotWorkerHandler } from './workerHandler.js';
import type { BotWorkerRequest, BotWorkerResponse } from './protocol.js';

interface WorkerScope {
  postMessage(message: BotWorkerResponse): void;
  onmessage: ((event: MessageEvent<BotWorkerRequest>) => void) | null;
}

const scope = self as unknown as WorkerScope;
const handle = createBotWorkerHandler((msg) => scope.postMessage(msg));
scope.onmessage = (event) => {
  void handle(event.data);
};
