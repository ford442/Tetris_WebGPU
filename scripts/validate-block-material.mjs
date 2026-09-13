#!/usr/bin/env node
/**
 * Build gate for the authored block material.
 *
 * Runs in `prebuild` next to validate-video-assets.mjs, and checks the things that
 * can be checked without a GPU:
 *
 *   1. public/block-material.json validates against shared/blockMaterialSchema.json
 *      (the same schema the runtime loader uses, so a file that loads here loads there).
 *   2. Every map the material references exists in public/ and is a readable PNG of a
 *      sane size.
 *   3. When a mask-bearing map is checked in, its coverage satisfies the contract:
 *      mean metal over the border ring >= contract.borderMetalMin, mean glass over the
 *      centre disc >= contract.centerGlassMin, feather band <= contract.haloMaxFraction.
 *
 * What this script deliberately does NOT do: re-implement the extractor's heuristic
 * mask bake. That path is gated by tests/block-material-contract.test.ts, which runs
 * the real TypeScript bakers over public/block.png. Here we only judge checked-in
 * pixels.
 *
 * Exit code 1 fails the build. `--warn-only` reports without failing, for local use.
 *
 * KTX2 is never required: `maps.albedoKtx2` is validated if present, but a missing
 * compressed variant is not an error — the PNG path stays canonical.
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { MATERIAL_PATH, validateMaterial } from './lib/blockMaterialSchema.mjs';
import { decodePngRgba, readPngHeader } from './lib/png.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC_DIR = join(ROOT, 'public');
const warnOnly = process.argv.includes('--warn-only');

/** Maps whose alpha (or red) channel carries the metal mask. */
const MASK_BEARING = ['metalMask', 'material'];

const problems = [];
const notes = [];

function fail(message) {
  problems.push(message);
}

function resolveMap(path) {
  return join(PUBLIC_DIR, path.replace(/^\.?\//, ''));
}

/** Mean metal over the border ring / mean glass over the centre disc / halo share. */
function measureCoverage(data, width, height, channel) {
  const borderFraction = 0.1;
  const centerRadius = 0.22;
  const offset = channel === 'alpha' ? 3 : 0;

  let borderSum = 0;
  let borderCount = 0;
  let centerSum = 0;
  let centerCount = 0;
  let halo = 0;

  const uDen = Math.max(1, width - 1);
  const vDen = Math.max(1, height - 1);

  for (let y = 0; y < height; y++) {
    const v = y / vDen;
    for (let x = 0; x < width; x++) {
      const u = x / uDen;
      const value = data[(y * width + x) * 4 + offset];
      const metal = value / 255;
      if (value > 0 && value < 255) halo++;

      const distEdge = Math.min(Math.min(u, 1 - u), Math.min(v, 1 - v));
      if (distEdge < borderFraction) {
        borderSum += metal;
        borderCount++;
      }
      if (Math.hypot(u - 0.5, v - 0.5) < centerRadius) {
        centerSum += 1 - metal;
        centerCount++;
      }
    }
  }

  return {
    borderMetalMean: borderCount ? borderSum / borderCount : 0,
    centerGlassMean: centerCount ? centerSum / centerCount : 0,
    haloFraction: halo / (width * height),
  };
}

function checkMapFile(name, path, material) {
  const absolute = resolveMap(path);
  if (!existsSync(absolute)) {
    fail(`maps.${name}: ${path} does not exist in public/`);
    return;
  }
  if (path.endsWith('.ktx2')) {
    notes.push(`maps.${name}: ${path} present (optional compressed variant, not decoded here)`);
    return;
  }
  if (!path.endsWith('.png')) {
    fail(`maps.${name}: ${path} must be a .png (or .ktx2 for the optional compressed variant)`);
    return;
  }

  const buffer = readFileSync(absolute);
  let header;
  try {
    header = readPngHeader(buffer);
  } catch (e) {
    fail(`maps.${name}: ${path} is not a readable PNG (${e.message})`);
    return;
  }
  if (header.width < 64 || header.height < 64) {
    fail(`maps.${name}: ${path} is ${header.width}x${header.height} — too small to carry hinge detail`);
    return;
  }
  if (header.bitDepth !== 8) {
    fail(`maps.${name}: ${path} must be 8 bits per channel (got ${header.bitDepth})`);
    return;
  }
  notes.push(`maps.${name}: ${path} ${header.width}x${header.height} (colour type ${header.colorType})`);

  if (!MASK_BEARING.includes(name)) return;

  let decoded;
  try {
    decoded = decodePngRgba(buffer);
  } catch (e) {
    fail(`maps.${name}: ${path} could not be decoded for coverage analysis (${e.message})`);
    return;
  }

  // A mask PNG exported from the Mask Lab is greyscale-in-RGB; the packed material
  // map carries metallic in alpha. Pick whichever channel actually varies.
  const channel = name === 'material' ? 'alpha' : 'red';
  const coverage = measureCoverage(decoded.data, decoded.width, decoded.height, channel);
  const { borderMetalMin, centerGlassMin, haloMaxFraction } = material.contract;

  if (coverage.borderMetalMean < borderMetalMin) {
    fail(
      `maps.${name}: gold frame too thin — border metal mean ` +
        `${coverage.borderMetalMean.toFixed(3)} < contract.borderMetalMin ${borderMetalMin}`,
    );
  }
  if (coverage.centerGlassMean < centerGlassMin) {
    fail(
      `maps.${name}: crystal well not transmissive — centre glass mean ` +
        `${coverage.centerGlassMean.toFixed(3)} < contract.centerGlassMin ${centerGlassMin}`,
    );
  }
  if (coverage.haloFraction > haloMaxFraction) {
    fail(
      `maps.${name}: mask halo too wide — ${(coverage.haloFraction * 100).toFixed(1)}% of pixels ` +
        `in the feather band > contract.haloMaxFraction ${(haloMaxFraction * 100).toFixed(1)}%`,
    );
  }
  notes.push(
    `maps.${name}: coverage border=${coverage.borderMetalMean.toFixed(3)} ` +
      `centre=${coverage.centerGlassMean.toFixed(3)} halo=${(coverage.haloFraction * 100).toFixed(1)}%`,
  );
}

function main() {
  const rel = relative(ROOT, MATERIAL_PATH);
  if (!existsSync(MATERIAL_PATH)) {
    // Not an error: the renderers fall back to the built-in reference material.
    console.log(`[validate-block-material] ${rel} absent — using the built-in reference material`);
    return;
  }

  let material;
  try {
    material = JSON.parse(readFileSync(MATERIAL_PATH, 'utf8'));
  } catch (e) {
    console.error(`[validate-block-material] ${rel} is not valid JSON: ${e.message}`);
    process.exit(warnOnly ? 0 : 1);
  }

  const { ok, errors } = validateMaterial(material);
  if (!ok) {
    for (const error of errors) fail(error);
  } else {
    for (const [name, path] of Object.entries(material.maps ?? {})) {
      if (typeof path === 'string') checkMapFile(name, path, material);
    }
  }

  for (const note of notes) console.log(`[validate-block-material] ${note}`);

  if (problems.length === 0) {
    console.log(`[validate-block-material] ${rel} OK — "${material.name ?? 'unnamed'}"`);
    return;
  }

  console.error(`[validate-block-material] ${rel} failed the visual contract:`);
  for (const problem of problems) console.error(`  - ${problem}`);
  if (warnOnly) {
    console.error('[validate-block-material] --warn-only: not failing the build');
    return;
  }
  process.exit(1);
}

main();
