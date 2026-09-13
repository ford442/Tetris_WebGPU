/**
 * Cross-renderer parity for the authored material.
 *
 * TS WebGPU and the C++ renderer *share* the WGSL modules, so they cannot drift.
 * WebGL2 cannot include WGSL, so its GLSL is a hand port — and a hand port is exactly
 * where "polish only exists on TS" creeps in. These tests pin the ported function
 * bodies and constants against the WGSL source, and pin both against the CPU bakers.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { createBlockShaders } from '../src/webgpu/shaders/block/blockShader.js';
import { createBlockShaderSources } from '../src/viewWebGL2/blockShadersGLSL.js';
import { DEFAULT_AUTHORED_BLOCK_MATERIAL } from '../src/webgpu/blockMaterial.js';
import { bakeRoughnessValue } from '../src/webgpu/blockMaterialMaps.js';

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

const SHARED_MATERIAL = 'src/webgpu/shaders/wgsl/block/authoredMaterial.wgsl';

describe('shared authored-material WGSL module', () => {
  const wgsl = read(SHARED_MATERIAL);

  it('stays binding-free so both renderers can compose it verbatim', () => {
    expect(wgsl).not.toMatch(/@binding\s*\(/);
    expect(wgsl).not.toMatch(/textureSample/);
  });

  it('documents the packed channel layout it decodes', () => {
    expect(wgsl).toContain('R = tangent normal.x');
    expect(wgsl).toContain('B = roughness');
    expect(wgsl).toContain('A = metallic');
  });

  it('is composed into the TS block fragment shader', () => {
    const { fragment } = createBlockShaders();
    expect(fragment).toContain('fn decodeAuthoredMaterial(');
    expect(fragment).toContain('fn blockTangentBasis(');
    expect(fragment).toContain('fn applyAuthoredNormal(');
  });

  it('reconstructs normal.z rather than storing it', () => {
    expect(wgsl).toContain('sqrt(max(1.0 - dot(nxy, nxy), 1.0e-4))');
  });

  it('guards degenerate UVs so a face cannot render as NaN', () => {
    expect(wgsl).toContain('if (maxLen < 1.0e-12)');
  });
});

describe('WebGL2 GLSL port matches the shared WGSL', () => {
  const wgsl = read(SHARED_MATERIAL);
  const { fragment: glsl } = createBlockShaderSources();

  it('ports every shared material function', () => {
    for (const fn of [
      'gradeGoldMetalAlbedoTinted',
      'blockTangentBasis',
      'applyAuthoredNormal',
      'authoredRoughnessFallback',
      'authoredRoughness',
    ]) {
      expect(wgsl, `${fn} missing from WGSL`).toContain(`fn ${fn}(`);
      expect(glsl, `${fn} missing from GLSL`).toContain(`${fn}(`);
    }
  });

  it('uses the same TBN construction (dFdx/dFdy, Mikkelsen)', () => {
    for (const line of [
      'dp2perp * duv1.x + dp1perp * duv2.x',
      'dp2perp * duv1.y + dp1perp * duv2.y',
    ]) {
      expect(wgsl).toContain(line);
      expect(glsl).toContain(line);
    }
    expect(glsl).toContain('dFdx(worldPos)');
    expect(glsl).toContain('inversesqrt(maxLen)');
  });

  it('uses the same roughness clamps as WGSL and the CPU baker', () => {
    expect(wgsl).toContain('clamp(glassRough, 0.02, 0.08)');
    expect(glsl).toContain('clamp(glassRough, 0.02, 0.08)');
    expect(wgsl).toContain('clamp(metalRough * (1.0 - detailScale * detail), 0.04, 1.0)');
    expect(glsl).toContain('clamp(metalRough * (1.0 - detailScale * detail), 0.04, 1.0)');

    // And the CPU bake agrees with the shader fallback for the shipped material.
    const m = DEFAULT_AUTHORED_BLOCK_MATERIAL;
    expect(bakeRoughnessValue(0, 0, m)).toBeCloseTo(Math.min(0.08, Math.max(0.02, m.roughness.glass)), 6);
    expect(bakeRoughnessValue(1, 0.5, m)).toBeCloseTo(
      Math.max(0.04, m.roughness.metal * (1 - m.roughness.detail * 0.5)),
      6,
    );
  });

  it('reads the gold tint from the contract in all three renderers', () => {
    const { fragment: wgslFragment } = createBlockShaders();
    expect(wgslFragment).toContain('materialParams.goldTint.rgb');
    expect(glsl).toContain('u_goldTint.rgb');
    expect(read('cpp/src/shaders/block/authoredBlock.wgsl')).toContain('u.goldTint.rgb');
  });

  it('samples the packed map in all three renderers', () => {
    const { fragment: wgslFragment } = createBlockShaders();
    expect(wgslFragment).toContain('textureSample(blockMaterialMap');
    expect(glsl).toContain('texture(u_blockMaterialMap, texUV)');
    expect(read('cpp/src/shaders/block/authoredBlock.wgsl')).toContain('textureSample(blockMaterialMap');
  });
});

describe('block fragment shader split', () => {
  it('keeps every WGSL block module well under the 1000-line limit', () => {
    const dir = 'src/webgpu/shaders/wgsl/block';
    for (const file of [
      'fragmentMain.wgsl',
      'authoredPath.wgsl',
      'fallbackPath.wgsl',
      'ghost.wgsl',
      'blockFx.wgsl',
      'authoredMaterial.wgsl',
      'authoredGlass.wgsl',
    ]) {
      const lines = read(`${dir}/${file}`).split('\n').length;
      expect(lines, `${file} is ${lines} lines`).toBeLessThan(1000);
    }
  });

  it('leaves the entry point as a dispatcher, not a mega-function', () => {
    const main = read('src/webgpu/shaders/wgsl/block/fragmentMain.wgsl');
    const entry = main.slice(main.indexOf('@fragment'));
    // The entry point samples and dispatches; shading lives in the split modules.
    expect(entry.split('\n').length).toBeLessThan(200);
    for (const call of [
      'renderGhostBlock(',
      'shadeAuthoredBlock(',
      'shadeFallbackBlock(',
      'applyBlockFx(',
    ]) {
      expect(entry).toContain(call);
    }
  });

  it('each split module owns its stage and does not duplicate another', () => {
    const dir = 'src/webgpu/shaders/wgsl/block';
    expect(read(`${dir}/ghost.wgsl`)).toContain('fn renderGhostBlock(');
    expect(read(`${dir}/authoredPath.wgsl`)).toContain('fn shadeAuthoredBlock(');
    expect(read(`${dir}/fallbackPath.wgsl`)).toContain('fn shadeFallbackBlock(');
    expect(read(`${dir}/blockFx.wgsl`)).toContain('fn applyBlockFx(');
    // Refraction belongs to the authored path only.
    expect(read(`${dir}/ghost.wgsl`)).not.toContain('refractBackdrop(');
    expect(read(`${dir}/blockFx.wgsl`)).not.toContain('refractBackdrop(');
  });
});
