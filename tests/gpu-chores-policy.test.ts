import { describe, expect, it } from 'vitest';
import {
  CHORE_BACKEND_ORDER,
  isGpuComputeKilled,
  resolveChorePolicy,
} from '../src/webgpu/gpuChores/policy.js';

describe('gpu chore kill switch', () => {
  it('trips on a bare ?no_gpu_compute', () => {
    expect(isGpuComputeKilled('?no_gpu_compute', null)).toBe(true);
    expect(isGpuComputeKilled('?no_gpu_compute=1', null)).toBe(true);
    expect(isGpuComputeKilled('?no_gpu_compute=true', null)).toBe(true);
  });

  it('stays off without the flag', () => {
    expect(isGpuComputeKilled('', null)).toBe(false);
    expect(isGpuComputeKilled('?renderer=webgpu', null)).toBe(false);
  });

  it('honors the persisted key and lets the query override it', () => {
    expect(isGpuComputeKilled('', 'true')).toBe(true);
    expect(isGpuComputeKilled('?no_gpu_compute=0', 'true')).toBe(false);
  });

  it('survives a malformed query string', () => {
    expect(isGpuComputeKilled('%%%', null)).toBe(false);
  });
});

describe('resolveChorePolicy', () => {
  it('falls back WebGPU -> CPU with no WebGL2 rung', () => {
    expect(CHORE_BACKEND_ORDER).toEqual(['webgpu', 'cpu']);
  });

  it('runs on WebGPU for the TS and cpp renderers alike', () => {
    for (const rendererName of ['webgpu', 'webgpu-cpp']) {
      const policy = resolveChorePolicy({ search: '', rendererName, hasDevice: true });
      expect(policy).toEqual({ backend: 'webgpu', reason: 'ok' });
    }
  });

  it('drops to the CPU rung when the kill switch is set', () => {
    const policy = resolveChorePolicy({ search: '?no_gpu_compute', rendererName: 'webgpu', hasDevice: true });
    expect(policy).toEqual({ backend: 'cpu', reason: 'kill-switch' });
  });

  it('drops to the CPU rung with no device to adopt', () => {
    const policy = resolveChorePolicy({ search: '', rendererName: 'webgpu', hasDevice: false });
    expect(policy.backend).toBe('cpu');
    expect(policy.reason).toBe('no-device');
  });

  it('drops to the CPU rung on the WebGL2 renderer', () => {
    const policy = resolveChorePolicy({ search: '', rendererName: 'webgl2', hasDevice: true });
    expect(policy).toEqual({ backend: 'cpu', reason: 'renderer:webgl2' });
  });

  it('keeps the extra passes off the budget on low quality / low power', () => {
    expect(resolveChorePolicy({ search: '', hasDevice: true, quality: 'low' }).backend).toBe('cpu');
    expect(
      resolveChorePolicy({ search: '', hasDevice: true, powerPreference: 'low-power' }).backend,
    ).toBe('cpu');
  });
});
