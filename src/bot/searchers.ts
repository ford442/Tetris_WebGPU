/**
 * Where a bot decision is computed. All three implementations answer the same question — "best
 * placements for this position" — through the same non-blocking request/poll interface, so the pilot
 * neither knows nor cares which one it got:
 *
 *   SyncSearcher     immediate, on the caller's stack. Headless tests, self-play, deterministic runs.
 *   SlicedSearcher   single-thread fallback: the resumable wasm search advanced in small slices from idle
 *                    callbacks, so a deep search never makes the render loop miss a frame.
 *   WorkerSearcher   a module Worker with its own wasm instance (the normal path in a browser).
 *
 * createBotSearcher() picks the Worker and quietly falls back to slicing if the Worker cannot start.
 */

import { BotCore } from './BotCore.js';
import { defaultBotWasmUrl, fetchBotWasm } from './loadWasm.js';
import type { BotWorkerRequest, BotWorkerResponse } from './protocol.js';
import type { BotPosition, SearchOptions, SearchResult } from './types.js';

export interface BotSearcher {
  /** Start a search. Replaces any search still in flight. */
  request(position: BotPosition, options: SearchOptions, nodeBudget: number): void;
  /** The finished result, once, or null while still thinking. */
  poll(): SearchResult | null;
  /** Drop the in-flight search (its result is discarded). */
  cancel(): void;
  dispose(): void;
}

/** Position with its own copy of the board, safe to keep while the live game mutates. */
export function snapshotPosition(position: BotPosition): BotPosition {
  return { ...position, cells: position.cells.slice(0, 200), next: position.next.slice() };
}

export class SyncSearcher implements BotSearcher {
  private result: SearchResult | null = null;

  constructor(private readonly core: BotCore) {}

  request(position: BotPosition, options: SearchOptions, nodeBudget: number): void {
    this.core.setPosition(position);
    this.core.searchBegin(options);
    this.core.searchStep(nodeBudget);
    this.result = this.core.searchFinish();
  }

  poll(): SearchResult | null {
    const r = this.result;
    this.result = null;
    return r;
  }

  cancel(): void {
    this.result = null;
  }

  dispose(): void {
    this.result = null;
  }
}

/** Runs `cb` when the browser is idle (or soon, where there is no idle callback). */
export type IdleScheduler = (cb: () => void) => void;

export function defaultIdleScheduler(): IdleScheduler {
  const g = globalThis as { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number };
  if (typeof g.requestIdleCallback === 'function') {
    return (cb) => g.requestIdleCallback!(cb, { timeout: 50 });
  }
  return (cb) => {
    setTimeout(cb, 0);
  };
}

export class SlicedSearcher implements BotSearcher {
  private result: SearchResult | null = null;
  private generation = 0;
  private budgetLeft = 0;

  /**
   * @param sliceNodes move-generator runs per idle callback (~1 ms of wasm at 10 runs)
   */
  constructor(
    private readonly core: BotCore,
    private readonly schedule: IdleScheduler = defaultIdleScheduler(),
    private readonly sliceNodes = 10,
  ) {}

  request(position: BotPosition, options: SearchOptions, nodeBudget: number): void {
    const gen = ++this.generation;
    this.result = null;
    this.budgetLeft = nodeBudget;
    this.core.setPosition(position);
    this.core.searchBegin(options);
    this.schedule(() => this.slice(gen));
  }

  private slice(gen: number): void {
    if (gen !== this.generation) return;
    const take = Math.min(this.sliceNodes, this.budgetLeft);
    const done = take <= 0 || this.core.searchStep(take);
    this.budgetLeft -= take;
    if (done || this.budgetLeft <= 0) {
      this.result = this.core.searchFinish();
      return;
    }
    this.schedule(() => this.slice(gen));
  }

  poll(): SearchResult | null {
    const r = this.result;
    this.result = null;
    return r;
  }

  cancel(): void {
    this.generation++;
    this.result = null;
  }

  dispose(): void {
    this.cancel();
  }
}

/** Minimal Worker surface so tests can substitute a fake. */
export interface WorkerLike {
  postMessage(message: BotWorkerRequest): void;
  terminate(): void;
  onmessage: ((event: { data: BotWorkerResponse }) => void) | null;
  onerror: ((event: unknown) => void) | null;
}

export class WorkerSearcher implements BotSearcher {
  private result: SearchResult | null = null;
  private nextId = 1;
  private currentId = 0;
  private ready = false;
  private pending: { id: number; position: BotPosition; options: SearchOptions; nodeBudget: number } | null = null;
  private failed: string | null = null;

  constructor(
    private readonly worker: WorkerLike,
    wasmUrl: string,
    private readonly onFailure: (message: string) => void = () => undefined,
  ) {
    worker.onmessage = (event) => this.onMessage(event.data);
    worker.onerror = (event) => this.fail((event as { message?: string } | null)?.message ?? 'bot worker crashed');
    worker.postMessage({ type: 'init', wasmUrl });
  }

  /** Non-null once the worker has died; the owner should switch to another searcher. */
  get failure(): string | null {
    return this.failed;
  }

  private onMessage(msg: BotWorkerResponse): void {
    if (msg.type === 'ready') {
      this.ready = true;
      if (this.pending) {
        const p = this.pending;
        this.pending = null;
        this.worker.postMessage({ type: 'search', id: p.id, position: p.position, options: p.options, nodeBudget: p.nodeBudget });
      }
    } else if (msg.type === 'result') {
      if (msg.id === this.currentId) this.result = msg.result;
    } else if (msg.type === 'error') {
      this.fail(msg.message);
    }
  }

  private fail(message: string): void {
    if (this.failed) return;
    this.failed = message;
    this.onFailure(message);
  }

  request(position: BotPosition, options: SearchOptions, nodeBudget: number): void {
    const id = this.nextId++;
    this.currentId = id;
    this.result = null;
    const snapshot = snapshotPosition(position);
    if (!this.ready) {
      this.pending = { id, position: snapshot, options, nodeBudget };
      return;
    }
    this.worker.postMessage({ type: 'search', id, position: snapshot, options, nodeBudget });
  }

  poll(): SearchResult | null {
    const r = this.result;
    this.result = null;
    return r;
  }

  cancel(): void {
    this.currentId = 0;
    this.pending = null;
    this.result = null;
  }

  dispose(): void {
    this.cancel();
    this.worker.terminate();
  }
}

/**
 * Worker when the platform has one, sliced main-thread search otherwise — and when the Worker fails at
 * runtime (blocked by CSP, wasm fetch 404, …) the request in flight is re-issued on the fallback.
 */
export class AutoSearcher implements BotSearcher {
  private active: BotSearcher;
  private fallback: SlicedSearcher | null = null;
  private last: { position: BotPosition; options: SearchOptions; nodeBudget: number } | null = null;
  private readonly makeFallback: () => SlicedSearcher;
  /** Which backend is serving decisions (for the HUD/diagnostics). */
  backend: 'worker' | 'sliced' = 'worker';

  constructor(worker: WorkerSearcherFactory, makeFallback: () => SlicedSearcher) {
    this.makeFallback = makeFallback;
    this.active = worker((message) => this.switchToFallback(message));
  }

  private switchToFallback(_reason: string): void {
    if (this.fallback) return;
    this.active.dispose();
    this.fallback = this.makeFallback();
    this.active = this.fallback;
    this.backend = 'sliced';
    if (this.last) this.active.request(this.last.position, this.last.options, this.last.nodeBudget);
  }

  request(position: BotPosition, options: SearchOptions, nodeBudget: number): void {
    this.last = { position: snapshotPosition(position), options, nodeBudget };
    this.active.request(position, options, nodeBudget);
  }

  poll(): SearchResult | null {
    const r = this.active.poll();
    if (r) this.last = null;
    return r;
  }

  cancel(): void {
    this.last = null;
    this.active.cancel();
  }

  dispose(): void {
    this.active.dispose();
  }
}

export type WorkerSearcherFactory = (onFailure: (message: string) => void) => BotSearcher;

/** Compiled bot wasm plus the two pieces a CPU player needs: a searcher and a (private) planner core. */
export interface BotRuntime {
  searcher: BotSearcher;
  planner: BotCore;
  backend(): 'worker' | 'sliced' | 'sync';
}

/**
 * Build the production runtime: Worker search when the platform has one, sliced main-thread search
 * otherwise (and if the Worker dies at runtime). The planner is always a main-thread core: it answers
 * one tiny shortest-path query per 60 Hz tick, far cheaper than a message round trip.
 */
export async function createBotRuntime(): Promise<BotRuntime> {
  const wasmUrl = defaultBotWasmUrl();
  const module = await WebAssembly.compile(await fetchBotWasm(wasmUrl));
  const planner = await BotCore.create(module);
  // Instantiated eagerly (instantiate is async) so the fallback can be swapped in synchronously.
  const fallback = new SlicedSearcher(await BotCore.create(module));
  if (typeof Worker === 'undefined') {
    return { searcher: fallback, planner, backend: () => 'sliced' };
  }
  const auto = new AutoSearcher(
    (onFailure) => {
      const worker = new Worker(new URL('./botWorker.ts', import.meta.url), { type: 'module' });
      return new WorkerSearcher(worker as unknown as WorkerLike, wasmUrl, onFailure);
    },
    () => fallback,
  );
  return { searcher: auto, planner, backend: () => auto.backend };
}
