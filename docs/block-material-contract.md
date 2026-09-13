# Block material contract

The go.1ink.us look — gold jewelry frame, crystal well, video readable through the
glass — used to live as constants spread across three renderers. This document
describes the contract that replaced them, and what you have to do to ship a new
brick.

## The pipeline

```
block.png (or .ktx2)
  └─ extract tile  (blockTextureExtract.ts / blockTileCpu.ts)
       ├─ albedo (RGB)
       ├─ metal mask (A)                      baked by blockMaskBake.ts
       └─ packed material map                 baked by blockMaterialMaps.ts
            R = normal.x, G = normal.y, B = roughness, A = metallic
            ↓
     block fragment shader  (TS WebGPU = C++ = WebGL2)
       shared WGSL: authoredMaterial.wgsl, authoredGlass.wgsl
            + IBL + screen-space video refraction
            ↓
     HDR bloom → ACES → SDR canvas
```

## Where each thing lives

| Concern | File | Shared with |
|---|---|---|
| Authored values (glass curve, gold grade, roughness band, normal strength) | `public/block-material.json` | TS, WebGL2 (fetched), C++ (generated into a header) |
| Schema for those values | `shared/blockMaterialSchema.json` | runtime validator + build gate |
| Types, validation, uniform packing | `src/webgpu/blockMaterial.ts` | — |
| Map bakers + contract metrics (pure) | `src/webgpu/blockMaterialMaps.ts` | tests, Mask Lab, all renderers |
| Mask bake (pure) | `src/webgpu/blockMaskBake.ts` | browser extractor + CPU tests |
| Normal mapping / TBN / roughness / gold grade (WGSL) | `src/webgpu/shaders/wgsl/block/authoredMaterial.wgsl` | TS + C++ verbatim, WebGL2 by hand port |
| Glass albedo / opacity curve / direct lighting (WGSL) | `src/webgpu/shaders/wgsl/block/authoredGlass.wgsl` | TS + C++ verbatim |
| Build gate | `scripts/validate-block-material.mjs` (in `prebuild`) | — |
| CPU contract gate | `tests/block-material-contract.test.ts` | — |

## Adding a new brick

1. Open `?masklab` (the Mask Lab), load the tile, tune the mask and glass sliders.
2. **Export material pack**. You get `*_albedo.png`, `*_metalMask.png`,
   `*_material.png` (the packed map the renderers bind), `*_packedMR.png` and
   `*_normal.png` for inspection, plus a `block-material.json`.
3. Drop the PNGs in `public/` and point `block-material.json` at them.
4. `npm run material:validate` then `npm test`.

No shader edit is required, and that is the acceptance criterion: if a new tile needs
WGSL changes, the contract is missing a field — add it to the schema and to
`AuthoredBlockMaterial`, not to the shader.

## What the contract asserts

`contract` in `block-material.json` sets the thresholds:

- `borderMetalMin` — mean metal mask over the outer ring. A thin frame means the gold
  jewelry read is gone.
- `centerGlassMin` — mean glass mask over the centre disc. A low value means the
  crystal well filled in and the video is no longer readable through the block.
- `haloMaxFraction` — share of pixels in the soft feather band. A wide halo shows up as
  a fringe where gold meets glass.

Plus two invariants that are not tunable: the crystal must be smoother than the frame
(transmission needs a near-polished interior), and roughness/metal channels must stay
in the band the shader expects.

These are measured in two places:

- **`npm test`** runs the real extractor and bakers over `public/block.png` and checks
  the metrics. This is the gate that catches a regression in the *heuristic* mask bake.
- **`npm run build`** runs `scripts/validate-block-material.mjs`, which validates the
  JSON and measures any checked-in mask PNG.

Headless WebGPU is not dependable enough to make a screenshot diff the only gate, so
the contract is asserted on the shader's *inputs* instead. A reference screenshot
comparison is still useful as a human check: `scripts/capture-screenshot.mjs` with
Chrome's `--enable-unsafe-webgpu`, against a canned replay seed.

## Inspecting a brick by eye

`Shift+M` cycles albedo → metal mask → glass mask → roughness → normals → final. It
writes one uniform, so it inspects the production shading path with no pipeline rebuild
and no reload — the board keeps playing underneath.

(`?debug` still swaps the whole fragment shader at startup for the older mask
visualisations; the hotkey is the one to reach for when judging a new tile.)

## Variants

`src/webgpu/materialModifiers.ts` holds deltas on the authored material — obsidian,
ice, neon steel, lava, hologram. A modifier scales roughness, re-tints the frame,
softens the normals; it never replaces the maps, and its output is re-validated against
the same schema. That is where a content pack's bricks belong.

## KTX2

`maps.albedoKtx2` is optional. It is used only when the adapter exposes
`texture-compression-bc` and the container is a plain BC payload (no Basis
supercompression — there is no transcoder here on purpose). Anything else falls back to
the PNG, which stays canonical. `src/webgpu/ktx2.ts` reads the container directly;
there is no image-library dependency, and `npm test` never requires KTX2 tooling.
