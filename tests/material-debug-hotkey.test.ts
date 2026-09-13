/**
 * Dev material inspector. The cycle order and the uniform write are what make this
 * usable for eyeballing a new block-*.png against the contract, so they are pinned —
 * including the "renderer without the inspector" case, which must be a no-op rather
 * than a crash on the WebGL2 and C++ paths.
 */

import { describe, expect, it } from 'vitest';
import { MaterialDebugView } from '../src/webgpu/blockMaterial.js';
import { createBlockShaders } from '../src/webgpu/shaders/block/blockShader.js';
import {
  installMaterialDebugHotkey,
  materialDebugViewLabel,
  nextMaterialDebugView,
} from '../src/dev/materialDebugHotkey.js';

describe('material debug view cycle', () => {
  it('cycles final -> albedo -> metal -> glass -> roughness -> normals -> final', () => {
    const order = [
      MaterialDebugView.albedo,
      MaterialDebugView.metalMask,
      MaterialDebugView.glassMask,
      MaterialDebugView.roughness,
      MaterialDebugView.normal,
      MaterialDebugView.off,
    ];
    let current = MaterialDebugView.off;
    for (const expected of order) {
      current = nextMaterialDebugView(current);
      expect(current).toBe(expected);
    }
  });

  it('recovers from an out-of-range stored value', () => {
    expect(nextMaterialDebugView(99)).toBe(MaterialDebugView.off);
  });

  it('labels every view in the cycle', () => {
    for (const mode of Object.values(MaterialDebugView)) {
      expect(materialDebugViewLabel(mode)).toMatch(/\w/);
    }
  });

  it('is a no-op on a renderer that does not implement the inspector', () => {
    // WebGL2 / C++ views have no setMaterialDebugView; installing must not throw and
    // must not leave a listener behind.
    const uninstall = installMaterialDebugHotkey({});
    expect(typeof uninstall).toBe('function');
    expect(() => uninstall()).not.toThrow();
  });
});

describe('debug view uniform slot', () => {
  it('is implemented in the production shader, not a separate pipeline', () => {
    // Switching views must not rebuild the pipeline: it is a uniform read inside the
    // real fragment entry point, so what you inspect is what ships.
    const { fragment } = createBlockShaders();
    expect(fragment).toContain('fn debugMaterialView(');
    expect(fragment).toContain('let debugMode = u32(materialParams.mapParams.w + 0.5);');
    for (let mode = 1; mode <= 5; mode++) {
      expect(fragment).toContain(`case ${mode}u:`);
    }
  });

  it('matches the switch arms the shader implements', () => {
    // The WGSL switch and this enum are two halves of one mapping.
    expect(MaterialDebugView).toEqual({
      off: 0,
      albedo: 1,
      metalMask: 2,
      glassMask: 3,
      roughness: 4,
      normal: 5,
    });
  });
});
