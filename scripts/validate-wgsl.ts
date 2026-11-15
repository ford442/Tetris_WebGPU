/**
 * Compile every WGSL module the game ships (TS template strings, .wgsl block stages and the
 * C++ renderer's generated shader header) with Tint, via Dawn's Node bindings on a software
 * Vulkan driver. Prints `file:line` for every error and exits non-zero on any.
 *
 *   npm run wgsl:validate            # skips (exit 0, loudly) when no adapter exists
 *   TETRIS_REQUIRE_GPU=1 npm run wgsl:validate   # missing adapter = failure (CI)
 *
 * Run through vite-node so the `?raw` .wgsl imports resolve exactly as they do in the app.
 */

import { acquireDawn, gpuRequired, skipMessage } from '../tests/helpers/dawn.js';
import { buildShaderCatalog } from '../tests/helpers/shaderCatalog.js';
import { classify } from '../tests/helpers/wgslBaseline.js';
import { formatDiagnostic, validateEntry } from '../tests/helpers/wgslValidate.js';

async function main(): Promise<number> {
  const catalog = buildShaderCatalog();
  const dawn = await acquireDawn();
  if (!dawn.ok) {
    if (gpuRequired()) {
      console.error(`[wgsl:validate] no adapter and TETRIS_REQUIRE_GPU=1: ${dawn.reason}`);
      return 1;
    }
    console.warn(skipMessage('wgsl:validate', dawn.reason));
    return 0;
  }

  console.log(`[wgsl:validate] ${catalog.length} modules on ${dawn.gpu.description}`);
  let failing = 0;
  let known = 0;
  let warnings = 0;
  for (const entry of catalog) {
    const diagnostics = await validateEntry(dawn.gpu.device, entry);
    const c = classify(entry.id, diagnostics);
    failing += c.unexpected.length + c.stale.length;
    known += c.known.length;
    warnings += diagnostics.filter((d) => d.severity === 'warning').length;
    const status = c.unexpected.length || c.stale.length ? 'FAIL' : c.known.length ? 'KNOWN' : ' ok ';
    console.log(`${status.padEnd(5)} ${entry.id}`);
    for (const d of c.unexpected) console.log(`  ${formatDiagnostic(d)}`);
    for (const d of c.known) console.log(`  (baseline) ${formatDiagnostic(d)}`);
    for (const k of c.stale) console.log(`  stale baseline: ${k.id} "${k.message}" no longer occurs; delete it from tests/helpers/wgslBaseline.ts`);
    for (const d of diagnostics.filter((x) => x.severity === 'warning')) console.log(`  ${formatDiagnostic(d)}`);
  }
  dawn.gpu.device.destroy();
  console.log(`[wgsl:validate] ${catalog.length} checked, ${failing} failing, ${known} known (baseline), ${warnings} warning(s)`);
  return failing ? 1 : 0;
}

main().then(
  // Dawn's worker threads can keep the loop alive or abort during teardown; exit explicitly.
  (code) => process.exit(code),
  (err) => {
    console.error(err);
    process.exit(1);
  },
);
