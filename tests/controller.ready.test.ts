import { vi, describe, it, expect } from 'vitest';
import Controller from '../src/controller';
import Game from '../src/game';

// JSDOM shim for the few DOM APIs Controller touches in constructor when running under node
if (typeof document === 'undefined') {
  (global as any).document = {
    addEventListener: () => {},
    removeEventListener: () => {}
  };
}

// Minimal fake View that exposes a `ready` promise and a stubbed API used by Controller
class FakeView {
  ready: Promise<void>;
  constructor(resolveAfterMs = 0) {
    this.ready = new Promise((resolve) => setTimeout(resolve, resolveAfterMs));
  }
  renderPauseScreen() {}
  renderEndScreen() {}
  renderMainScreen() {}
}

class FakeViewWebGPU extends FakeView {
  // methods used by Controller
  onRotate() {}
  onHold() {}
  onHardDrop() {}
  onLineClear() {}
  onLock() {}
  state = {} as any;
}

describe('Controller startup synchronization', () => {
  it('defers starting the game loop until view.ready resolves', async () => {
    const game = new Game();
    const slowView = new FakeViewWebGPU(20);

    // spy on Controller.play to observe when it is invoked
    const playSpy = vi.spyOn(Controller.prototype as any, 'play');

    // construct controller (should NOT call play immediately because view.ready is pending)
    // @ts-ignore - Controller constructor accepts View types
    const controller = new Controller(game, {} as any, slowView as any, {} as any);

    expect(playSpy).not.toHaveBeenCalled();

    // wait for view.ready to resolve
    await slowView.ready;

    // allow any microtasks to run
    await new Promise((r) => setTimeout(r, 0));

    expect(playSpy).toHaveBeenCalled();

    playSpy.mockRestore();
  });
});