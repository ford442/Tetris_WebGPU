import { describe, it, expect, vi } from 'vitest';
import { runControllerFrame } from '../src/controller/gameLoop.js';
import type { ControllerLoopHost } from '../src/controller/gameLoop.js';
import type Game from '../src/game.js';

// Mock document for DOM dependencies
global.document = {
  getElementById: vi.fn(),
  querySelector: vi.fn(),
  createElement: vi.fn(),
} as any;

describe('runControllerFrame dt clamping', () => {
  it('should clamp dt to 100ms when elapsed time is greater than 100ms', async () => {
    const mockGame = {
      tickMode: vi.fn(),
      updateAsync: vi.fn().mockResolvedValue({ linesCleared: [], locked: false, gameOver: false, tSpin: false }),
      getState: vi.fn().mockReturnValue({}),
      clearEffects: vi.fn(),
      getEffectiveLevel: vi.fn().mockReturnValue(1),
    } as unknown as Game;

    const mockHost: ControllerLoopHost = {
      isPlaying: true,
      isPaused: false,
      gameLoopID: null,
      game: mockGame,
      view: { renderMainScreen: vi.fn(), renderEndScreen: vi.fn() } as any,
      viewWebGPU: { render: vi.fn() } as any,
      soundManager: { playLevelUp: vi.fn(), playScoringAudio: vi.fn() } as any,
      replayRecorder: { advanceClock: vi.fn(), stop: vi.fn(), isRecording: false } as any,
      subliminal: null,
      lastTime: 1000,
      lastLevel: 1,
      playTimeMs: 0,
      gravityTimer: 0,
      hitStopFrames: 0,
      processBufferedAction: vi.fn(),
      handleInput: vi.fn(),
      playScoringAudio: vi.fn(),
      audioPieceType: vi.fn(),
      audioColumn: vi.fn(),
      finishReplayRecording: vi.fn(),
    };

    // Simulate 500ms passing
    await runControllerFrame(mockHost, 1500);

    // playTimeMs should only advance by the clamped dt (100ms)
    expect(mockHost.playTimeMs).toBe(100);

    // AdvanceClock should have been called with clamped dt
    expect(mockHost.replayRecorder.advanceClock).toHaveBeenCalledWith(100);
  });
});
