import { describe, expect, it, vi } from 'vitest';
import { PostProcessor } from '../src/webgpu/renderers/postProcessor.js';

function stubPostProcessView(options: { chores?: unknown; bloom?: boolean } = {}) {
  const bloomInputView = { label: 'bloom-input-view' };
  const passEncoder = {
    setPipeline: vi.fn(),
    setBindGroup: vi.fn(),
    setVertexBuffer: vi.fn(),
    draw: vi.fn(),
    end: vi.fn(),
  };
  const encoder = { beginRenderPass: vi.fn(() => passEncoder) };
  const bloomRender = vi.fn();
  const view = {
    useMultiPassBloom: options.bloom ?? true,
    bloomEnabled: options.bloom ?? true,
    _bloomInputTexture: {
      width: 1280,
      height: 720,
      createView: vi.fn(() => bloomInputView),
    },
    _ppPassDescriptor: { colorAttachments: [{ view: undefined }] },
    postProcessPipeline: {},
    postProcessBindGroup: {},
    backgroundVertexBuffer: {},
    ctxWebGPU: { getCurrentTexture: () => ({ createView: () => ({ label: 'screen' }) }) },
    bloomSystem: { render: bloomRender },
    canvasWebGPU: { width: 1280, height: 720 },
    recreateRenderTargets: vi.fn(),
    gpuChores: options.chores,
  };
  return { view, encoder, bloomInputView, bloomRender };
}

describe('post-process pass feeds the luma chore', () => {
  it('scans the composited frame before bloom consumes it', () => {
    const encodeLumaScan = vi.fn();
    const { view, encoder, bloomInputView, bloomRender } = stubPostProcessView({
      chores: { encodeLumaScan },
    });

    new PostProcessor(view as never).render(encoder as never);

    expect(encodeLumaScan).toHaveBeenCalledTimes(1);
    const [passedEncoder, passedView, width, height] = encodeLumaScan.mock.calls[0];
    // Same encoder the renderer is already building — no second submit.
    expect(passedEncoder).toBe(encoder);
    // Same texture the bloom threshold pass reads, at its real size.
    expect(passedView).toBe(bloomInputView);
    expect([width, height]).toEqual([1280, 720]);
    expect(encodeLumaScan.mock.invocationCallOrder[0])
      .toBeLessThan(bloomRender.mock.invocationCallOrder[0]);
  });

  it('renders normally when no chore runner is attached', () => {
    const { view, encoder, bloomRender } = stubPostProcessView();
    expect(() => new PostProcessor(view as never).render(encoder as never)).not.toThrow();
    expect(bloomRender).toHaveBeenCalledTimes(1);
  });

  it('does not scan when multi-pass bloom is off', () => {
    const encodeLumaScan = vi.fn();
    const { view, encoder } = stubPostProcessView({ chores: { encodeLumaScan }, bloom: false });
    new PostProcessor(view as never).render(encoder as never);
    expect(encodeLumaScan).not.toHaveBeenCalled();
  });
});
