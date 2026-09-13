/**
 * Enablement policy for screen-space backdrop refraction on the glass path.
 *
 * The effect costs one extra fullscreen blit per frame plus 1-3 texture samples
 * on glass fragments only, so it rides the same budget signals as IBL: off on
 * low-power adapters and the `low` preset, and dropped by the adaptive
 * controller at the step where it already drops IBL.
 */
export function shouldEnableBackdropRefraction(options: {
  powerPreference?: GPUPowerPreference | string;
  quality?: string;
  adaptiveDisableIbl?: boolean;
}): boolean {
  if (options.powerPreference === 'low-power') return false;
  if (options.quality === 'low') return false;
  if (options.adaptiveDisableIbl) return false;
  return true;
}
