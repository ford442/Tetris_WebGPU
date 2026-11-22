/**
 * One match is one sequence of 60 Hz frames, whichever driver runs it (#561 sim-clock work).
 *
 * The live rAF loop (runControllerFrame, fed uneven frame deltas and hit-stop), the replay
 * simulator, a recorded .ttr played back through ReplayPlayback.scrubTo, and the online lockstep
 * sim all step `Game` through the shared FrameStepper — so the same seed + masks give the same
 * playfield bytes, score and hash at the same frame.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import Game from '../src/game.js';
import { runControllerFrame, type ControllerLoopHost } from '../src/controller/gameLoop.js';
import { REPLAY_ACTION } from '../src/replay/actions.js';
import { hashGameState, hashPlayfield } from '../src/replay/boardHash.js';
import { createReplayFile, decodeInputStream, type ReplayInputEvent } from '../src/replay/format.js';
import { FrameStepper, SIM_TICK_MS } from '../src/replay/frameStepper.js';
import { ReplayPlayback } from '../src/replay/playback.js';
import { ReplayRecorder } from '../src/replay/recorder.js';
import { GameSimulator, runReplayFile, simulateFrames } from '../src/replay/simulator.js';
import { VersusLockstepSim } from '../src/versus/VersusLockstepSim.js';
import { WasmCore } from '../src/wasm/WasmCore.js';
import { BOT_DIFFICULTIES } from '../src/bot/difficulty.js';
import { runSelfPlay } from '../src/bot/selfPlay.js';
import { makeBotCore, readWasmBytes } from './helpers/bot.js';

const SEED = 0x5eed1234;
const FRAMES = 2400;

/** A scripted press: `via: 'event'` lands between rAFs (keydown), `'tick'` in the input phase. */
interface ScriptedPress {
  frame: number;
  mask: number;
  via: 'event' | 'tick';
}

/**
 * The bot's own (closed-loop) self-play mask log, played open-loop here so the match clears lines,
 * plus order-sensitive same-frame extras: a rotation pair, a left/right pair and a 3x soft drop.
 * Each press is routed as a between-frames keydown or an input-phase press, alternating.
 */
function buildScript(botInputs: { frame: number; mask: number }[], frames: number): ScriptedPress[] {
  const out: ScriptedPress[] = [];
  const used = new Set(botInputs.map((e) => e.frame));
  let n = 0;
  const via = (): 'event' | 'tick' => (n++ % 3 === 0 ? 'tick' : 'event');
  for (const e of botInputs) if (e.frame < frames) out.push({ frame: e.frame, mask: e.mask, via: via() });
  for (let f = 97; f < frames; f += 211) {
    if (used.has(f)) continue;
    const kind = (f / 211) | 0;
    if (kind % 3 === 0) {
      out.push({ frame: f, mask: REPLAY_ACTION.ROTATE_CCW, via: 'event' }, { frame: f, mask: REPLAY_ACTION.ROTATE_CW, via: 'tick' });
    } else if (kind % 3 === 1) {
      out.push({ frame: f, mask: REPLAY_ACTION.RIGHT, via: 'event' }, { frame: f, mask: REPLAY_ACTION.LEFT, via: 'tick' });
    } else {
      for (let k = 0; k < 3; k++) out.push({ frame: f, mask: REPLAY_ACTION.DOWN, via: 'tick' });
    }
  }
  return out.sort((a, b) => a.frame - b.frame);
}

/** Uneven presentation deltas: 60 Hz, a 32 ms stutter, 144 Hz-ish 8 ms frames, a 33 ms hitch. */
const FRAME_DELTAS = [16.7, 16.6, 32, 8, 8, 7, 16.7, 33, 16.6, 8.3, 4, 16.7];

function stubDocument(): void {
  vi.stubGlobal('document', { getElementById: () => null, querySelector: () => null });
}

/** Run the scripted match through the real live frame loop. */
function runLive(script: ScriptedPress[], frames: number) {
  const game = new Game();
  game.view = null;
  game.reset({ seed: SEED });
  const stepper = new FrameStepper(game);
  const recorder = new ReplayRecorder();
  recorder.start(SEED, game.modeId);
  stepper.sink = recorder;

  const byFrame = new Map<number, ScriptedPress[]>();
  for (const p of script) {
    const list = byFrame.get(p.frame) ?? [];
    list.push(p);
    byFrame.set(p.frame, list);
  }
  /** Press the not-yet-applied scripted entries for the frame about to advance. */
  let appliedFrame = -1;
  let appliedCount = 0;
  const applied: { frame: number; mask: number }[] = [];
  const pressScripted = (via: 'event' | 'tick') => {
    const f = stepper.frame;
    if (f !== appliedFrame) {
      appliedFrame = f;
      appliedCount = 0;
    }
    const list = byFrame.get(f);
    if (!list) return;
    // Presses keep script order; an 'event' entry may not jump ahead of an unapplied 'tick' one.
    while (appliedCount < list.length && (via === 'tick' || list[appliedCount]!.via === 'event')) {
      const p = list[appliedCount++]!;
      stepper.press(p.mask);
      applied.push({ frame: f, mask: p.mask });
    }
  };

  let hitStops = 0;
  const host = {
    isPlaying: true,
    isPaused: false,
    gameLoopID: null,
    game,
    view: { renderMainScreen: vi.fn(), renderEndScreen: vi.fn() },
    viewWebGPU: { render: vi.fn(), onLineClear: vi.fn(), onLock: vi.fn() },
    soundManager: { playLevelUp: vi.fn(), playGameOver: vi.fn() },
    stepper,
    subliminal: null,
    lastTime: 0,
    lastLevel: game.level,
    playTimeMs: 0,
    simAccumMs: 0,
    hitStopFrames: 0,
    processBufferedAction: vi.fn(),
    handleInput: () => pressScripted('tick'),
    playScoringAudio: vi.fn(),
    audioPieceType: () => game.activPiece?.type ?? 'T',
    audioColumn: () => game.activPiece?.x ?? 4,
    finishReplayRecording: vi.fn(),
  } as unknown as ControllerLoopHost;

  let time = 0;
  let i = 0;
  while (stepper.frame < frames && host.isPlaying) {
    pressScripted('event'); // keydown between two rAFs
    // Presentation hit-stop (normally set by a lock) freezes the rules clock for a few rAFs.
    if (i % 97 === 50) host.hitStopFrames = 2;
    if (host.hitStopFrames > 0) hitStops++;
    time += FRAME_DELTAS[i++ % FRAME_DELTAS.length]!;
    if (!runControllerFrame(host, time)) break;
  }
  return { game, stepper, file: recorder.stop(), applied, hitStops, rafFrames: i };
}

function inputsByFrame(applied: { frame: number; mask: number }[]): Map<number, number[]> {
  const m = new Map<number, number[]>();
  for (const a of applied) {
    const list = m.get(a.frame) ?? [];
    list.push(a.mask);
    m.set(a.frame, list);
  }
  return m;
}

global.fetch = vi.fn(async () => {
  const buf = readWasmBytes();
  return { ok: true, arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) } as Response;
}) as unknown as typeof fetch;

describe('one sim clock for live, replay and lockstep', () => {
  let script: ScriptedPress[] = [];
  beforeAll(async () => {
    stubDocument();
    await WasmCore.init();
    const bot = await runSelfPlay({
      seed: SEED,
      maxPieces: 60,
      difficulty: BOT_DIFFICULTIES.normal,
      search: await makeBotCore(),
      planner: await makeBotCore(),
    });
    expect(bot.lines).toBeGreaterThan(4);
    script = buildScript(bot.inputs, FRAMES);
  }, 60_000);

  it('live rAF loop with uneven deltas == GameSimulator on the same masks', () => {
    const live = runLive(script, FRAMES);
    expect(live.rafFrames).not.toBe(live.stepper.frame); // the deltas really were uneven
    expect(live.hitStops).toBeGreaterThan(0); // and hit-stop froze the rules clock

    const sim = simulateFrames(new GameSimulator(SEED), inputsByFrame(live.applied), live.stepper.frame);

    expect(sim.frame).toBe(live.stepper.frame);
    expect(Array.from(sim.game.playfield)).toEqual(Array.from(live.game.playfield));
    expect(sim.game.score).toBe(live.game.score);
    expect(sim.game.lines).toBe(live.game.lines);
    expect(sim.game.activPiece.x).toBe(live.game.activPiece.x);
    expect(sim.game.activPiece.y).toBe(live.game.activPiece.y);
    expect(live.game.lines).toBeGreaterThan(0); // the script exercised line clears
    expect(live.game.score).toBeGreaterThan(0);
  });

  it('the recorded .ttr played back from frame 0 matches the live hash at the final frame', () => {
    const live = runLive(script, FRAMES);
    const liveHash = hashGameState(live.game.playfield, live.game.score, live.game.lines);

    // Several ordered masks in one frame survive the [u16 delta][u8 mask] stream (delta-0 entries).
    const events = decodeInputStream(live.file.inputs);
    const sameFrame = events.some((e, i) => i > 0 && e.frame === events[i - 1]!.frame);
    expect(sameFrame).toBe(true);

    expect(runReplayFile(live.file).boardHash()).toBe(liveHash);

    const playback = new ReplayPlayback(live.file);
    playback.scrubTo(live.file.frames);
    expect(hashGameState(playback.game.playfield, playback.game.score, playback.game.lines)).toBe(liveHash);

    // Scrubbing back and forth is reset + tick N, so an earlier frame is reproducible too.
    playback.scrubTo(1200);
    const at1200 = hashPlayfield(playback.game.playfield);
    playback.scrubTo(live.file.frames);
    playback.scrubTo(1200);
    expect(hashPlayfield(playback.game.playfield)).toBe(at1200);
  });

  it('VersusLockstepSim board 0 == GameSimulator on the same masks, every frame', () => {
    const masksFor = new Map<number, number>();
    // Lockstep exchanges one mask per frame, so OR the frame's presses.
    for (const p of script) masksFor.set(p.frame, (masksFor.get(p.frame) ?? 0) | p.mask);

    // Run the two sims one after the other: both boards 0 share one WASM collision buffer.
    const lockstep = new VersusLockstepSim(SEED);
    const events: ReplayInputEvent[] = [];
    const lockstepHashes: number[] = [];
    for (let f = 0; f < FRAMES; f++) {
      const mask = masksFor.get(f) ?? 0;
      if (mask !== 0) events.push({ frame: f, mask });
      lockstepHashes.push(lockstep.tick(mask, 0).hash0); // board 1 idles: never sends garbage
      if (lockstep.g0.isRunEnded) break;
    }
    const final = { hash0: lockstep.bothHashes().hash0, score: lockstep.g0.score, lines: lockstep.g0.lines };
    expect(final.lines).toBeGreaterThan(0);

    const solo = new GameSimulator(SEED, 'versus');
    for (let f = 0; f < lockstepHashes.length; f++) {
      solo.tick(masksFor.get(f) ?? 0);
      expect(hashPlayfield(solo.game.playfield), `frame ${f}`).toBe(lockstepHashes[f]);
    }
    expect(solo.game.score).toBe(final.score);

    // A desync report is reproducible offline: the board's mask log through ReplayPlayback.
    const file = createReplayFile({ seed: SEED, mode: 'versus', tickMs: SIM_TICK_MS, frames: lockstep.frame }, events);
    const playback = new ReplayPlayback(file);
    playback.scrubTo(file.frames);
    expect(hashPlayfield(playback.game.playfield)).toBe(final.hash0);
  });

  it('a hard drop finishes inside its tick (no microtask), so a clear is seen the same frame', () => {
    const sim = new GameSimulator(SEED);
    const before = sim.game.activPiece;
    const filledBefore = sim.game.playfield.filter((c) => c !== 0).length;
    sim.tick(REPLAY_ACTION.HARD_DROP);
    // Locked, and the next piece spawned synchronously at the top.
    expect(sim.game.playfield.filter((c) => c !== 0).length).toBe(filledBefore + 4);
    expect(sim.game.activPiece).not.toBe(before);
    expect(sim.game.activPiece.y).toBeLessThanOrEqual(1);
  });

  it('pausing does not change the match: the gravity clock lives in the stepper, not the controller', () => {
    const src = readFileSync(join(import.meta.dirname, '..', 'src', 'controller.ts'), 'utf8');
    expect(src).not.toMatch(/gravityTimer/);
  });

  it('only one gravity integrator remains in src/', () => {
    const hits: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) walk(p);
        else if (p.endsWith('.ts') && /Math\.pow\(0\.85,/.test(readFileSync(p, 'utf8'))) hits.push(p);
      }
    };
    walk(join(import.meta.dirname, '..', 'src'));
    expect(hits.map((p) => p.slice(p.indexOf('src')))).toEqual([join('src', 'replay', 'frameStepper.ts')]);
  });
});
