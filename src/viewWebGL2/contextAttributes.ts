/**
 * WebGL2 context attributes, decided in one pure place so `tests/webgl2-context.test.ts`
 * can pin them.
 *
 *  - `antialias: false` — the scene is drawn through an FBO chain (bloom), so MSAA on the
 *    default framebuffer only multisamples the final blit: memory and fill cost for nothing.
 *  - `powerPreference` — the same policy as the WebGPU path (`?gpu=low|high`, then the
 *    persisted `GameSettings.gpuPower`), via `resolvePowerPreference()`. Previously ignored.
 *  - `desynchronized: true` — lower input latency where the platform supports it. It is a
 *    request, not a guarantee: callers read the granted value back with
 *    {@link grantedDesynchronized}.
 *  - `preserveDrawingBuffer: false` — nothing reads the default framebuffer after present,
 *    and preserving it forces a copy per frame.
 *  - `alpha` + `premultipliedAlpha` — the video-portal compositing contract, same as WebGPU.
 */
import { resolveGpuPowerFromSettings, resolvePowerPreference } from '../webgpu/gpuContext.js';

export function webgl2ContextAttributes(
  search?: string,
  storageValue?: string | null,
): WebGLContextAttributes {
  const powerPreference = resolvePowerPreference(
    search,
    storageValue !== undefined ? storageValue : resolveGpuPowerFromSettings(),
  );
  return {
    alpha: true,
    premultipliedAlpha: true,
    antialias: false,
    depth: true,
    stencil: false,
    powerPreference,
    desynchronized: true,
    preserveDrawingBuffer: false,
  };
}

/** Whether the browser actually honoured `desynchronized` (it silently ignores it elsewhere). */
export function grantedDesynchronized(gl: Pick<WebGL2RenderingContext, 'getContextAttributes'>): boolean {
  return gl.getContextAttributes()?.desynchronized === true;
}
