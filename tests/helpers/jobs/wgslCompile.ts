/** Layer 1 pass: compile every catalog module with Tint (inside Dawn) and return its diagnostics. */

import { buildShaderCatalog } from '../shaderCatalog.js';
import { validateEntry, type Diagnostic } from '../wgslValidate.js';

export async function run(device: GPUDevice): Promise<Map<string, Diagnostic[]>> {
  const results = new Map<string, Diagnostic[]>();
  for (const entry of buildShaderCatalog()) results.set(entry.id, await validateEntry(device, entry));
  return results;
}
