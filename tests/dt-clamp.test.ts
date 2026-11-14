import { describe, it, expect, vi, beforeAll } from 'vitest';
import { clampDt, runControllerFrame, type ControllerLoopHost } from '../src/controller/gameLoop.js';
import Game from '../src/game.js';

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

  it('clamps huge dt in runControllerFrame', async () => {
    const game = new Game();
    game.tickMode = vi.fn();
    game.updateAsync = vi.fn().mockResolvedValue({ linesCleared: [], locked: false, tSpin: false, gameOver: false });

    let lastDtPassedToGravity = -1;

    const host = {
      isPlaying: true,
      isPaused: false,
      gameLoopID: null,
      game,
      view: { renderMainScreen: vi.fn(), renderEndScreen: vi.fn() } as any,
      viewWebGPU: { render: vi.fn() } as any,
      soundManager: { playLevelUp: vi.fn(), playGameOver: vi.fn() } as any,
      replayRecorder: { advanceClock: vi.fn() } as any,
      subliminal: null,
      lastTime: 1000,
      lastLevel: 1,
      playTimeMs: 0,
      gravityTimer: 0,
      hitStopFrames: 0,
      processBufferedAction: vi.fn(),
      handleInput: (dt: number) => { lastDtPassedToGravity = dt; },
      playScoringAudio: vi.fn(),
      audioPieceType: () => 'T',
      audioColumn: () => 4,
      finishReplayRecording: vi.fn(),
    } as unknown as ControllerLoopHost;

    // Simulate 5 seconds passing (e.g. tab was blurred)
    await runControllerFrame(host, 6000);

    // The host.handleInput (or anything consuming dt inside the loop) should see clamped dt (100ms)
    expect(lastDtPassedToGravity).toBe(100);
    expect(host.playTimeMs).toBe(100);
    expect(host.gravityTimer).toBeLessThanOrEqual(100); // Because stepGravity advances it

    // Also check host.lastTime updated correctly
    expect(host.lastTime).toBe(6000);
  });
});
