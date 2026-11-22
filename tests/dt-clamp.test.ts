import { describe, it, expect, vi, beforeAll } from 'vitest';
import { clampDt, runControllerFrame, type ControllerLoopHost } from '../src/controller/gameLoop.js';
import Game from '../src/game.js';
import { FrameStepper, SIM_TICK_MS } from '../src/replay/frameStepper.js';

describe('dt clamping', () => {
  beforeAll(() => {
    // Mock minimal DOM for hudBridge calls in gameLoop
    global.document = {
      getElementById: vi.fn(() => ({
        textContent: '',
        style: { display: '' }
      })),
      querySelector: vi.fn(() => ({
        textContent: '',
        style: { display: '' }
      }))
    } as any;
  });

  it('clamps dt via helper', () => {
    expect(clampDt(50)).toBe(50);
    expect(clampDt(150)).toBe(100);
    expect(clampDt(5000)).toBe(100);
    expect(clampDt(5000, 200)).toBe(200);
  });

  it('clamps huge dt in runControllerFrame and advances rules in fixed ticks', () => {
    const game = new Game();
    game.view = null;
    const stepper = new FrameStepper(game);

    const dtsSeenByInput: number[] = [];

    const host = {
      isPlaying: true,
      isPaused: false,
      gameLoopID: null,
      game,
      view: { renderMainScreen: vi.fn(), renderEndScreen: vi.fn() } as any,
      viewWebGPU: { render: vi.fn() } as any,
      soundManager: { playLevelUp: vi.fn(), playGameOver: vi.fn(), playLock: vi.fn() } as any,
      stepper,
      subliminal: null,
      lastTime: 1000,
      lastLevel: 1,
      playTimeMs: 0,
      simAccumMs: 0,
      hitStopFrames: 0,
      processBufferedAction: vi.fn(),
      handleInput: (dt: number) => { dtsSeenByInput.push(dt); },
      playScoringAudio: vi.fn(),
      audioPieceType: () => 'T',
      audioColumn: () => 4,
      finishReplayRecording: vi.fn(),
    } as unknown as ControllerLoopHost;

    // Simulate 5 seconds passing (e.g. tab was blurred)
    expect(runControllerFrame(host, 6000)).toBe(true);

    // The frame is clamped to 100 ms, which the rules consume as whole 60 Hz ticks.
    const ticks = Math.floor(100 / SIM_TICK_MS + 1e-9);
    expect(stepper.frame).toBeGreaterThanOrEqual(ticks - 1);
    expect(stepper.frame).toBeLessThanOrEqual(ticks);
    expect(dtsSeenByInput.length).toBe(stepper.frame);
    for (const dt of dtsSeenByInput) expect(dt).toBe(SIM_TICK_MS);
    expect(host.playTimeMs).toBeCloseTo(stepper.frame * SIM_TICK_MS, 6);
    expect(host.simAccumMs).toBeLessThan(SIM_TICK_MS);
    expect(host.simAccumMs).toBeGreaterThanOrEqual(0);

    // Also check host.lastTime updated correctly
    expect(host.lastTime).toBe(6000);
  });
});
