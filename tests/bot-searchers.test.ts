import { describe, it, expect, beforeAll, vi } from 'vitest';
import type { BotCore } from '../src/bot/BotCore.js';
import type { BotWorkerRequest, BotWorkerResponse } from '../src/bot/protocol.js';
import { AutoSearcher, SlicedSearcher, SyncSearcher, WorkerSearcher, type WorkerLike } from '../src/bot/searchers.js';
import { createBotWorkerHandler } from '../src/bot/workerHandler.js';
import { emptyPosition, makeBotCore, randomCells, readWasmBytes } from './helpers/bot.js';

const POS = emptyPosition({ cells: randomCells(5, 8), active: 'T', next: ['I', 'O', 'S', 'Z', 'L'] });
const OPTS = { depth: 3, beam: 6 };
const BIG = 100_000;

let core: BotCore;
beforeAll(async () => {
  core = await makeBotCore();
});

/** In-process stand-in for a Worker: runs the REAL handler, delivering messages asynchronously like a thread would. */
class FakeWorker implements WorkerLike {
  onmessage: ((e: { data: BotWorkerResponse }) => void) | null = null;
  onerror: ((e: unknown) => void) | null = null;
  terminated = false;
  received: BotWorkerRequest[] = [];
  private readonly handle: (req: BotWorkerRequest) => Promise<void>;
  constructor(loadWasm: (url: string) => Promise<BufferSource> = async () => readWasmBytes()) {
    this.handle = createBotWorkerHandler((msg) => queueMicrotask(() => this.onmessage?.({ data: msg })), { loadWasm });
  }
  postMessage(msg: BotWorkerRequest): void {
    this.received.push(msg);
    setTimeout(() => void this.handle(structuredClone(msg)), 0);
  }
  terminate(): void {
    this.terminated = true;
  }
}

const settle = (ms = 25): Promise<void> => new Promise((r) => setTimeout(r, ms));

describe('SyncSearcher', () => {
  it('answers immediately, once', () => {
    const s = new SyncSearcher(core);
    expect(s.poll()).toBeNull();
    s.request(POS, OPTS, BIG);
    const r = s.poll();
    expect(r).toEqual(core.search(POS, OPTS));
    expect(s.poll()).toBeNull();
  });
});

describe('SlicedSearcher (single-thread fallback)', () => {
  it('spreads one search over many idle callbacks and arrives at the same answer as a full run', async () => {
    const cb: (() => void)[] = [];
    const s = new SlicedSearcher(await makeBotCore(), (f) => cb.push(f), 4);
    s.request(POS, { depth: 4, beam: 8 }, BIG);
    let slices = 0;
    while (s.poll() === null && cb.length > 0) {
      cb.shift()!();
      slices++;
      expect(slices).toBeLessThan(200);
      const r = s.poll();
      if (r) {
        expect(r).toEqual(core.search(POS, { depth: 4, beam: 8 }));
        expect(slices).toBeGreaterThan(3); // it really was sliced
        return;
      }
    }
    throw new Error('never finished');
  });

  it('each slice stays within its node slice (no frame hitch): <= slice + 2 generator runs', async () => {
    const searchCore = await makeBotCore();
    const cb: (() => void)[] = [];
    const s = new SlicedSearcher(searchCore, (f) => cb.push(f), 10);
    s.request(POS, { depth: 6, beam: 16 }, BIG);
    let last = searchCore.raw.botBfsRuns();
    let guard = 0;
    while (cb.length > 0 && guard++ < 500) {
      cb.shift()!();
      const now = searchCore.raw.botBfsRuns();
      expect(now - last).toBeLessThanOrEqual(12);
      last = now;
    }
    expect(s.poll()).not.toBeNull();
  });

  it('stops at its node budget and still answers; cancel() and a newer request discard the old one', async () => {
    const searchCore = await makeBotCore();
    const cb: (() => void)[] = [];
    const s = new SlicedSearcher(searchCore, (f) => cb.push(f), 5);
    s.request(POS, { depth: 7, beam: 32 }, 12);
    while (cb.length > 0) cb.shift()!();
    const budgeted = s.poll()!;
    expect(budgeted.nodes).toBeLessThanOrEqual(12 + 2);
    expect(budgeted.moves.length).toBeGreaterThan(0);

    s.request(POS, OPTS, BIG);
    s.cancel();
    while (cb.length > 0) cb.shift()!();
    expect(s.poll()).toBeNull();

    s.request(POS, { depth: 1, beam: 1 }, BIG); // superseded...
    s.request(POS, OPTS, BIG);
    while (cb.length > 0) cb.shift()!();
    expect(s.poll()).toEqual(core.search(POS, OPTS));
  });
});

describe('Worker protocol (real handler behind a fake Worker)', () => {
  it('init handshake, then a search returns exactly what a direct search returns', async () => {
    const w = new FakeWorker();
    const s = new WorkerSearcher(w, 'x://release.wasm');
    s.request(POS, OPTS, BIG); // sent before the worker is ready: must be queued, not lost
    expect(w.received.map((m) => m.type)).toEqual(['init']);
    await settle();
    expect(w.received.map((m) => m.type)).toEqual(['init', 'search']);
    expect(s.poll()).toEqual(core.search(POS, OPTS));
    expect(s.poll()).toBeNull();
  });

  it('ignores the answer to a superseded request and to a cancelled one', async () => {
    const w = new FakeWorker();
    const s = new WorkerSearcher(w, 'x');
    await settle();
    s.request(POS, { depth: 1, beam: 1 }, BIG);
    s.request(POS, OPTS, BIG);
    await settle(60);
    expect(s.poll()).toEqual(core.search(POS, OPTS));
    s.request(POS, OPTS, BIG);
    s.cancel();
    await settle(60);
    expect(s.poll()).toBeNull();
  });

  it('copies the position, so mutating the live board after request() cannot change the search', async () => {
    const w = new FakeWorker();
    const s = new WorkerSearcher(w, 'x');
    await settle();
    const live = { ...POS, cells: POS.cells.slice() };
    s.request(live, OPTS, BIG);
    live.cells.fill(1);
    await settle(60);
    expect(s.poll()).toEqual(core.search(POS, OPTS));
  });

  it('the handler reports a clear error for a search before init, and for a wasm that will not load', async () => {
    const out: BotWorkerResponse[] = [];
    const handle = createBotWorkerHandler((m) => out.push(m), { loadWasm: async () => Promise.reject(new Error('HTTP 404')) });
    await handle({ type: 'search', id: 7, position: POS, options: OPTS, nodeBudget: 5 });
    await handle({ type: 'init', wasmUrl: 'x' });
    expect(out).toEqual([
      { type: 'error', id: 7, message: 'bot worker received a search before init' },
      { type: 'error', id: undefined, message: 'HTTP 404' },
    ]);
  });

  it('a failing worker raises onFailure exactly once', async () => {
    const w = new FakeWorker(async () => Promise.reject(new Error('boom')));
    const onFailure = vi.fn();
    const s = new WorkerSearcher(w, 'x', onFailure);
    await settle();
    expect(onFailure).toHaveBeenCalledTimes(1);
    expect(onFailure).toHaveBeenCalledWith('boom');
    expect(s.failure).toBe('boom');
  });
});

describe('AutoSearcher', () => {
  it('uses the worker when it works', async () => {
    const auto = new AutoSearcher((onFailure) => new WorkerSearcher(new FakeWorker(), 'x', onFailure), () => {
      throw new Error('fallback must not be built');
    });
    auto.request(POS, OPTS, BIG);
    await settle(60);
    expect(auto.backend).toBe('worker');
    expect(auto.poll()).toEqual(core.search(POS, OPTS));
  });

  it('falls back to the sliced searcher when the worker dies, and re-issues the request in flight', async () => {
    const cb: (() => void)[] = [];
    const fallback = new SlicedSearcher(await makeBotCore(), (f) => cb.push(f), 50);
    const auto = new AutoSearcher((onFailure) => new WorkerSearcher(new FakeWorker(async () => Promise.reject(new Error('csp blocked'))), 'x', onFailure), () => fallback);
    auto.request(POS, OPTS, BIG);
    await settle(60);
    expect(auto.backend).toBe('sliced');
    while (cb.length > 0) cb.shift()!();
    expect(auto.poll()).toEqual(core.search(POS, OPTS));
  });
});
