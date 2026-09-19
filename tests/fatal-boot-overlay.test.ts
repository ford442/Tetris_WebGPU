import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  showFatalWebgpuOverlay,
  removeFatalWebgpuOverlay,
  FATAL_WEBGPU_OVERLAY_ID,
} from '../src/webgpu/fatalBootOverlay.js';
import type { WebgpuProbeResult } from '../src/webgpu/bootProbe.js';

interface FakeElement {
  id: string;
  textContent: string;
  children: FakeElement[];
  style: { cssText: string };
  attributes: Record<string, string>;
  setAttribute(name: string, value: string): void;
  append(...nodes: FakeElement[]): void;
  appendChild(node: FakeElement): FakeElement;
  remove(): void;
}

function createFakeDocument() {
  const registry = new Map<string, FakeElement>();

  function makeElement(): FakeElement {
    const el: FakeElement = {
      id: '',
      textContent: '',
      children: [],
      style: { cssText: '' },
      attributes: {},
      setAttribute(name, value) {
        el.attributes[name] = value;
      },
      append(...nodes) {
        el.children.push(...nodes);
      },
      appendChild(node) {
        el.children.push(node);
        return node;
      },
      remove() {
        registry.delete(el.id);
      },
    };
    return el;
  }

  return {
    createElement: () => {
      const el = makeElement();
      // Registered lazily once an id is assigned (mirrors DOM id lookups).
      const originalSetter = Object.getOwnPropertyDescriptor(el, 'id');
      void originalSetter;
      Object.defineProperty(el, 'id', {
        get() {
          return (el as unknown as { _id: string })._id ?? '';
        },
        set(value: string) {
          (el as unknown as { _id: string })._id = value;
          registry.set(value, el);
        },
      });
      return el;
    },
    getElementById: (id: string) => registry.get(id) ?? null,
    body: makeElement(),
  };
}

describe('showFatalWebgpuOverlay / removeFatalWebgpuOverlay', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('appends a blocking overlay describing the probe and can be removed', () => {
    const fakeDocument = createFakeDocument();
    vi.stubGlobal('document', fakeDocument);
    const container = fakeDocument.createElement();

    const probe: WebgpuProbeResult = {
      ok: false,
      browser: 'chrome',
      reason: 'no-adapter (Chrome: check chrome://flags/#enable-unsafe-webgpu and GPU drivers)',
      adapter: null,
      renderer: 'ts',
    };

    showFatalWebgpuOverlay(container as unknown as HTMLElement, probe);

    const overlay = fakeDocument.getElementById(FATAL_WEBGPU_OVERLAY_ID);
    expect(overlay).toBeTruthy();
    expect(container.children).toContain(overlay);

    const text = JSON.stringify(overlay?.children.map((c) => c.textContent));
    expect(text).toContain('chrome');
    expect(text).toContain('no-adapter');

    removeFatalWebgpuOverlay();
    expect(fakeDocument.getElementById(FATAL_WEBGPU_OVERLAY_ID)).toBeNull();
  });

  it('is a no-op when document is unavailable', () => {
    vi.stubGlobal('document', undefined);
    expect(() =>
      showFatalWebgpuOverlay(undefined, { ok: false, browser: 'other', reason: null, adapter: null, renderer: 'cpp' }),
    ).not.toThrow();
    expect(() => removeFatalWebgpuOverlay()).not.toThrow();
  });
});
