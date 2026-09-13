        // Block fragment entry point.
        //
        // This file is deliberately thin: it samples, classifies metal vs glass, and
        // dispatches to one of the split shading modules. Anything that decides how a
        // material *looks* belongs in:
        //
        //   authoredGlass.wgsl     gold grading, crystal albedo, glass opacity  (shared with C++)
        //   authoredMaterial.wgsl  normal/roughness decode, TBN, gold tint      (shared with C++)
        //   authoredPath.wgsl      authored composition (IBL + backdrop refraction)
        //   fallbackPath.wgsl      classic + generic PBR materials
        //   ghost.wgsl             ghost-piece hologram
        //   blockFx.wgsl           rim, lock tension, pulses, shadow, dissolve
        //
        // Keeping the entry point small is what makes the visual contract testable:
        // tests target the split modules and the CPU bakers, not a 500-line function.

        fn acesToneMapping(color: vec3f) -> vec3f {
            let a = 2.51; let b = 0.03; let c = 2.43; let d = 0.59; let e = 0.14;
            return clamp((color * (a * color + b)) / (color * (c * color + d) + e), vec3f(0.0), vec3f(1.0));
        }

        /// Dev visualisation of one material channel (MaterialDebugView in blockMaterial.ts).
        fn debugMaterialView(
            mode: u32,
            texRgb: vec3f,
            metalMask: f32,
            roughness: f32,
            shadingNormal: vec3f,
        ) -> vec4f {
            switch (mode) {
                case 1u: { return vec4f(texRgb, 1.0); }
                case 2u: { return vec4f(vec3f(metalMask), 1.0); }
                case 3u: { return vec4f(vec3f(1.0 - metalMask), 1.0); }
                case 4u: { return vec4f(vec3f(roughness), 1.0); }
                case 5u: { return vec4f(shadingNormal * 0.5 + vec3f(0.5), 1.0); }
                default: { return vec4f(texRgb, 1.0); }
            }
        }

        @fragment
        fn main(@location(0) vWorldPos : vec4f,
                @location(1) vNormal : vec3f,
                @location(2) vColor : vec4f,
                @location(3) vUV : vec2f,
                @location(4) vClipPos : vec4f) -> @location(0) vec4f {

            let time = fUniforms.time;
            let faceN = normalize(vNormal);
            let V = normalize(fUniforms.eyePosition.xyz - vWorldPos.xyz);
            let L = normalize(fUniforms.lightPosition.xyz - vWorldPos.xyz);

            // Apply configurable texture sampling
            var texUV = transformUVForSampling(vUV);

            // Glitch effect
            if (fUniforms.useGlitch > 0.0) {
                let glitchOffset = fUniforms.useGlitch * 0.03 * sin(texUV.y * 40.0 + time * 15.0);
                texUV.x += glitchOffset;
            }

            // Subtle magnetic UV wobble on placed blocks within ~2 rows of active piece.
            // "Lean toward" the falling piece via small signed UV offset proportional to horiz world distance.
            // Stash + strength computed in viewPlayfield.ts each frame; zeroed on lock (no activePiece).
            if (fUniforms.magnetStrength > 0.01) {
                let dx = vWorldPos.x - fUniforms.magnetWorldX;
                let dy = abs(vWorldPos.y - fUniforms.magnetWorldY);
                let rowDist = dy * 0.45; // approx world-units-per-row (BLOCK_WORLD_SIZE ~2.2)
                if (rowDist < 2.3) {
                    let proximity = 1.0 - (rowDist / 2.3);
                    let lean = dx * 0.009 * proximity * fUniforms.magnetStrength; // subtle, signed for lean direction
                    texUV.x += lean;
                    texUV.y += lean * 0.12 * proximity; // tiny vertical for volume/3D feel
                }
            }

            // Dual sample of the same RGBA tile:
            //   RGB  — linear anisotropic (optional albedo LOD bias)
            //   A    — nearest mip 0 (baked metal mask; no linear-filter halo)
            let texColorRgb = textureSampleBias(blockTexture, blockSamplerColor, texUV, 0.0);
            let texMaskA = textureSampleLevel(blockTextureMask, blockSamplerMask, texUV, 0.0).a;
            let texColor = vec4f(texColorRgb.rgb, texMaskA);

            // Authored packed material map: normal.xy / roughness / metallic.
            // Always bound — a 1×1 flat texel stands in until the bake lands, and
            // materialParams.mapParams.y says which of the two we got.
            let materialPacked = textureSample(blockMaterialMap, blockSamplerColor, texUV);
            let materialSample = decodeAuthoredMaterial(materialPacked);
            let mapEnabled = materialParams.mapParams.y;

            let textureMix = fUniforms.textureMix;
            // Border frame always samples block.png gold/crystal detail at full strength
            let isBorderBlock = vWorldPos.x < -0.8 || vWorldPos.x > 21.0
                             || vWorldPos.y > 1.5 || vWorldPos.y < -44.5;
            // Only the extracted authored tile has baked alpha mask semantics.
            // Procedural/heuristic fallback should avoid treating texColor.a as a mask.
            let authoredLoaded = textureMix > 0.8;
            let effectiveTextureMix = max(textureMix, select(0.0, 0.94, isBorderBlock && authoredLoaded));
            let useAuthoredSampling = effectiveTextureMix > 0.8;

            // Authored path: metalMask is baked alpha (extractor dilate + nearest sample).
            // Geometric hinge force is an extractor option (maskOuterForce), not a shader UV square.
            // Fallback path: runtime RGB heuristic when the authored tile is missing.
            var metalMask: f32;
            var glassMask: f32;
            var textureMetalMask: f32 = 0.5;
            if (useAuthoredSampling) {
                metalMask = clamp(texColor.a, 0.0, 1.0);
                glassMask = 1.0 - metalMask;
            } else {
                let textureMasks = extractMaterialMask(texColor.rgb);
                textureMetalMask = textureMasks.x;
                metalMask = textureMasks.x;
                glassMask = textureMasks.y;
            }
            let metalOpaque = step(0.5, metalMask);
            let glassMaskAlpha = 1.0 - metalOpaque;

            // Tangent-space normal mapping. Strength is authored (block-material.json)
            // and kept low so hinges read as jewelry, not as noise, at playfield size.
            let N = applyAuthoredNormal(
                faceN, vWorldPos.xyz, vUV,
                materialSample.normalXY,
                materialParams.mapParams.x * mapEnabled,
            );

            let H = normalize(L + V);
            let NdotL = max(dot(N, L), 0.0);
            let NdotV = max(dot(N, V), 0.0);
            let NdotH = max(dot(N, H), 0.0);

            // High-frequency albedo energy: the shader-side stand-in for the Sobel
            // detail field the CPU baker uses (blockMaterialMaps.ts).
            let mip3 = textureSampleLevel(blockTexture, blockSamplerColor, texUV, 3.0).rgb;
            let detail = clamp(length(texColor.rgb - mip3) * 2.0, 0.0, 1.0);
            let pixelRough = authoredRoughness(
                materialSample.roughness,
                mapEnabled,
                metalMask,
                detail,
                materialParams.goldShade.z,
                materialParams.goldShade.w,
                materialParams.mapParams.z,
            );

            // Gold grading is authored: tint/mix/shade come from block-material.json,
            // so a content pack can reskin the frame without touching WGSL.
            let metalColor = gradeGoldMetalAlbedoTinted(
                texColor.rgb,
                materialParams.goldTint.rgb,
                materialParams.goldTint.w,
                materialParams.goldShade.x,
                materialParams.goldShade.y,
            );
            let glassColor = authoredGlassAlbedo(texColor.rgb, vColor.rgb);
            // Authored block.png blend: glass interior vs metal frame, driven by baked mask.
            let authoredBase = authoredBaseColor(texColor.rgb, vColor.rgb, metalColor, metalMask);
            let textureBase = composeMaterialBaseColor(texColor.rgb, vColor.rgb, textureMetalMask);

            var baseColor: vec3f;
            if (useAuthoredSampling) {
                baseColor = authoredBase;
            } else {
                baseColor = mix(vColor.rgb, textureBase, clamp(effectiveTextureMix, 0.0, 1.0));
            }

            // Dev material inspector (hotkey-driven uniform, no pipeline rebuild).
            let debugMode = u32(materialParams.mapParams.w + 0.5);
            if (debugMode > 0u) {
                return debugMaterialView(debugMode, texColor.rgb, metalMask, pixelRough, N);
            }

            // Ghost piece: a holographic projection of the real textured block.
            // Early-returns before heavy PBR/lighting to keep ghost rendering cheap.
            if (vColor.w < 0.4) {
                return renderGhostBlock(
                    vUV, vColor, NdotV, metalMask, glassMask, metalColor, glassColor, time,
                );
            }

            let materialType = fUniforms.materialType;

            // Tight specular (shared across paths)
            let nh2 = NdotH * NdotH;
            let nh4 = nh2 * nh2;
            let nh16 = nh4 * nh4 * nh4 * nh4;
            let nh128 = nh16 * nh16 * nh16 * nh16 * nh16 * nh16 * nh16 * nh16;
            let tightSpec = nh128;

            var finalColor: vec3f;
            var finalAlpha = 1.0;

            if (useAuthoredSampling) {
                let shaded = shadeAuthoredBlock(
                    baseColor, metalColor, metalMask, glassMask, glassMaskAlpha, pixelRough,
                    N, V, L, NdotL, NdotV, NdotH, tightSpec,
                    vWorldPos, vUV, vClipPos, vColor, time,
                );
                finalColor = shaded.color;
                finalAlpha = shaded.alpha;
            } else {
                let shaded = shadeFallbackBlock(
                    baseColor, metalMask, glassMask,
                    N, V, L, NdotL, NdotV, NdotH, tightSpec,
                    vWorldPos, vUV, vClipPos, vColor, materialType, time,
                );
                finalColor = shaded.color;
                finalAlpha = shaded.alpha;
            }

            finalColor = applyBlockFx(
                finalColor, baseColor, vWorldPos, vUV, vColor,
                N, L, V, NdotV, metalMask, glassMask, materialType, time,
            );

            // Gold hinges stay alpha 1.0 (no video bleed). Use the hard threshold, not soft mask.
            let materialAlpha = mix(finalAlpha, 1.0, metalOpaque);
            let outAlpha = materialAlpha * vColor.w;
            // Premultiply RGB for premultiplied-alpha blending.
            finalColor *= outAlpha;
            return vec4f(finalColor, outAlpha);
        }
