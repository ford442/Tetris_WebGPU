        fn acesToneMapping(color: vec3f) -> vec3f {
            let a = 2.51; let b = 0.03; let c = 2.43; let d = 0.59; let e = 0.14;
            return clamp((color * (a * color + b)) / (color * (c * color + d) + e), vec3f(0.0), vec3f(1.0));
        }

        @fragment
        fn main(@location(0) vWorldPos : vec4f,
                @location(1) vNormal : vec3f,
                @location(2) vColor : vec4f,
                @location(3) vUV : vec2f) -> @location(0) vec4f {

            let time = fUniforms.time;
            let N = normalize(vNormal);
            let V = normalize(fUniforms.eyePosition.xyz - vWorldPos.xyz);
            let L = normalize(fUniforms.lightPosition.xyz - vWorldPos.xyz);
            let H = normalize(L + V);
            let NdotL = max(dot(N, L), 0.0);
            let NdotV = max(dot(N, V), 0.0);
            let NdotH = max(dot(N, H), 0.0);

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

            // Sample the authored block image from its sharpest mip. The 3D block faces
            // are small enough on screen that implicit LOD selection can soften the gold/glass detail.
            let texColor = textureSampleLevel(blockTexture, blockSampler, texUV, 0.0);

            // Per-pixel warmth masks (used for low-mix / PBR fallback paths).
            let textureMasks = extractMaterialMask(texColor.rgb);
            let textureMetalMask = textureMasks.x;
            let textureGlassMask = textureMasks.y;

            // Outer ring force in UV space (keeps the authored frame structure solid).
            // The bulk of metal/glass separation now comes from baked texColor.a.
            let distX = min(vUV.x, 1.0 - vUV.x);
            let distY = min(vUV.y, 1.0 - vUV.y);
            let distEdge = min(distX, distY);
            let borderThickness = 0.14;
            let geoGlassMask = smoothstep(borderThickness - 0.02, borderThickness, distEdge);
            let geoMetalForce = 1.0 - geoGlassMask;

            let textureMix = fUniforms.textureMix;
            // Border frame always samples block.png gold/crystal detail at full strength
            let isBorderBlock = vWorldPos.x < -0.8 || vWorldPos.x > 21.0
                             || vWorldPos.y > 1.5 || vWorldPos.y < -44.5;
            // Only the extracted authored tile has baked alpha mask semantics.
            // Procedural/heuristic fallback should avoid treating texColor.a as a mask.
            let authoredLoaded = textureMix > 0.8;
            let effectiveTextureMix = max(textureMix, select(0.0, 0.94, isBorderBlock && authoredLoaded));
            let useAuthoredSampling = effectiveTextureMix > 0.8;

            // Baked mask: extractBlockTileFromImage stores a feathered metal mask into texColor.a.
            // - metalSoft: used for shading detail.
            // - metalOpaque: hard-thresholded for opacity to prevent halos / partial metal.
            let metalSoftBaked0 = clamp(texColor.a, 0.0, 1.0);

            // Mask sharpen: max-pool a small neighborhood around texColor.a at mip 0.
            // This prevents fractional boundary pixels from creating halo transparency.
            var metalSoftBaked = metalSoftBaked0;
            if (useAuthoredSampling) {
                let dims = vec2<f32>(textureDimensions(blockTexture, 0));
                let texel = 1.0 / max(dims, vec2<f32>(1.0));
                let r = texel * 1.0;

                let a0 = textureSampleLevel(blockTexture, blockSampler, texUV + vec2<f32>(-r.x, -r.y), 0.0).a;
                let a1 = textureSampleLevel(blockTexture, blockSampler, texUV + vec2<f32>( 0.0, -r.y), 0.0).a;
                let a2 = textureSampleLevel(blockTexture, blockSampler, texUV + vec2<f32>( r.x, -r.y), 0.0).a;
                let a3 = textureSampleLevel(blockTexture, blockSampler, texUV + vec2<f32>(-r.x,  0.0), 0.0).a;
                let a4 = textureSampleLevel(blockTexture, blockSampler, texUV + vec2<f32>( 0.0,  0.0), 0.0).a;
                let a5 = textureSampleLevel(blockTexture, blockSampler, texUV + vec2<f32>( r.x,  0.0), 0.0).a;
                let a6 = textureSampleLevel(blockTexture, blockSampler, texUV + vec2<f32>(-r.x,  r.y), 0.0).a;
                let a7 = textureSampleLevel(blockTexture, blockSampler, texUV + vec2<f32>( 0.0,  r.y), 0.0).a;
                let a8 = textureSampleLevel(blockTexture, blockSampler, texUV + vec2<f32>( r.x,  r.y), 0.0).a;

                metalSoftBaked = max(
                    metalSoftBaked0,
                    max(a0, max(a1, max(a2, max(a3, max(a4, max(a5, max(a6, max(a7, a8))))))))
                );
            }

            let metalOpaqueBaked = smoothstep(0.45, 0.65, metalSoftBaked);

            let metalMaskBakedSoft = max(metalSoftBaked, geoMetalForce);
            let metalMaskBakedOpaque = max(metalOpaqueBaked, geoMetalForce);
            let glassMaskBakedSoft = 1.0 - metalMaskBakedSoft;
            let glassMaskAlpha = 1.0 - metalMaskBakedOpaque;

            // Use baked alpha-derived masks only when the authored extracted tile
            // is active; otherwise fall back to runtime RGB heuristic masks.
            let metalMask = select(textureMetalMask, metalMaskBakedSoft, useAuthoredSampling);
            let metalMaskForAlpha = select(textureMetalMask, metalMaskBakedOpaque, useAuthoredSampling);
            let glassMask = select(textureGlassMask, glassMaskBakedSoft, useAuthoredSampling);

            let luma = dot(texColor.rgb, vec3f(0.299, 0.587, 0.114));
            let crystalBright = smoothstep(0.15, 0.90, luma);
            let crystalHi = max(luma - 0.65, 0.0) * 2.5;
            let metalColor = texColor.rgb * 1.38 + vec3f(0.04, 0.018, 0.0);
            let glassColor = texColor.rgb * (0.70 + crystalBright * 0.30)
                           + vColor.rgb * 0.22 * crystalBright
                           + vec3f(crystalHi * 0.40);
            // Authored block.png blend: glass interior vs metal frame, driven by baked mask.
            // (When not using authored sampling, this value is unused.)
            let authoredBase = mix(glassColor, metalColor, metalMaskBakedSoft);
            let textureBase = composeMaterialBaseColor(texColor.rgb, vColor.rgb, textureMetalMask);

            var baseColor: vec3f;
            if (useAuthoredSampling) {
                baseColor = authoredBase;
            } else {
                baseColor = mix(vColor.rgb, textureBase, clamp(effectiveTextureMix, 0.0, 1.0));
            }

            // === GHOST PIECE - "holographic projection of the real textured block" ===
            // Must early-return before heavy PBR/lighting to keep ghost rendering cheap.
            let isGhost = vColor.w < 0.4;
            if (isGhost) {
                // Reuse the same metal/glass separation as the authored path.
                let ghostMetal = metalMask; // shape/hinge fidelity when baked alpha is active
                let ghostGlass = glassMask;

                // Desaturated + brighter + lower-contrast versions of the same split.
                let lumaMetal = dot(metalColor, vec3f(0.299, 0.587, 0.114));
                var ghostMetalColor = mix(vec3f(lumaMetal), metalColor, 0.35) * 1.35;
                ghostMetalColor = mix(vec3f(dot(ghostMetalColor, vec3f(0.333))), ghostMetalColor, 0.85);

                let lumaGlass = dot(glassColor, vec3f(0.299, 0.587, 0.114));
                var ghostGlassColor = mix(vec3f(lumaGlass), glassColor, 0.25) * 1.18;
                ghostGlassColor = mix(vec3f(dot(ghostGlassColor, vec3f(0.333))), ghostGlassColor, 0.82);

                // Geometry-driven wireframe respects hinges via ghostMetal.
                let scanY = fract(vUV.y * 50.0 - time * 15.0);
                let scan = smoothstep(0.0, 0.1, scanY) * (1.0 - smoothstep(0.9, 1.0, scanY));
                let edgeDist = max(abs(vUV.x - 0.5), abs(vUV.y - 0.5)) * 2.0;
                let wire = smoothstep(0.9, 0.98, edgeDist);
                let innerWire = smoothstep(0.75, 0.85, edgeDist) * 0.4;
                let beam = smoothstep(0.7, 0.0, abs(vUV.x - 0.5)) * 1.2;

                // Breathing + tension-reactive variation.
                let lockPercent = fUniforms.lockPercent;
                let tension = smoothstep(0.25, 1.0, lockPercent);
                let pulseFreq = 12.0 + tension * 35.0;
                let baseAlpha = 0.55 + 0.35 * sin(time * pulseFreq);
                let breath = sin(time * 2.5) * 0.1 + 0.9;

                // Glass interior should be more transparent than the metal frame.
                // Premultiplied-alpha convention: RGB must be multiplied by outAlpha.
                let maskAlphaMul = mix(0.42, 1.0, ghostMetal);
                let outAlpha = clamp(baseAlpha * breath * maskAlphaMul * (0.85 + scan * 0.55), 0.0, 1.0);

                // Extra hologram color overlays.
                let fresnel = 1.0 - NdotV;
                let fresnel3 = fresnel * fresnel * fresnel;

                // Multi-overlay composite (scanlines + glitch + breathing glow).
                // Keep scanlines/breathing/glitch/tension as overlays instead of replacing base texture.
                var ghostFinal = vec3f(0.0);

                // Metal wire + glass see-through body.
                ghostFinal += ghostMetalColor * (wire * 7.0 + innerWire * 4.0) * ghostMetal;
                ghostFinal += ghostGlassColor * (scan * 1.6 + beam * 0.45) * ghostGlass;

                // Shared scanline treatment across the face.
                ghostFinal += ghostMetalColor * scan * 2.2 * ghostMetal;
                ghostFinal += ghostGlassColor * scan * 1.2 * ghostGlass;

                // Cyan rim for holographic projection feel.
                let cyanRim = vec3f(0.4, 0.85, 1.0) * fresnel3 * 4.0;
                ghostFinal += cyanRim * (0.6 + 0.7 * ghostMetal);

                // Holographic scan drift.
                let scanEffect = sin(vUV.y * 70.0 + time * 10.0) * 0.12;
                let horizontalScan = sin(vUV.x * 40.0 - time * 6.0) * 0.08;
                ghostFinal += vec3f(0.2, 0.8, 1.0) * (scanEffect + horizontalScan) * 5.0;

                // Grid + glitch.
                let gridX = step(0.92, fract(vUV.x * 6.0));
                let gridY = step(0.92, fract(vUV.y * 6.0));
                let gridPattern = max(gridX, gridY) * 0.6;
                ghostFinal += vec3f(gridPattern) * mix(ghostGlassColor, ghostMetalColor, ghostMetal) * 0.6;

                let glitchAmp = 0.04 + tension * 0.12;
                let ghostGlitch = sin(vUV.y * 60.0 + time * (25.0 + tension * 40.0)) * glitchAmp;
                if (tension > 0.4 && fract(time * 12.0) > 0.85) {
                    ghostFinal += vec3f(ghostGlitch + 0.15);
                } else {
                    ghostFinal += vec3f(ghostGlitch);
                }

                // Digital sparkle.
                let sparkleNoise = fract(sin(dot(vUV, vec2f(12.9898, 78.233)) + time * 3.0) * 43758.5453);
                if (sparkleNoise > 0.96) {
                    ghostFinal += vec3f(2.0);
                }

                // Tension warning overlay.
                if (tension > 0.6) {
                    let warnOverlay = vec3f(1.0, 0.2, 0.0) * tension * 0.3;
                    ghostFinal += warnOverlay;
                }

                // Premultiply for alpha blend (canvas alphaMode='premultiplied').
                ghostFinal *= outAlpha;
                return vec4f(ghostFinal, outAlpha);
            }

            let materialType = fUniforms.materialType;
            var finalColor: vec3f;
            var finalAlpha = 1.0;

            // Tight specular (shared across paths)
            let nh2 = NdotH * NdotH;
            let nh4 = nh2 * nh2;
            let nh16 = nh4 * nh4 * nh4 * nh4;
            let nh128 = nh16 * nh16 * nh16 * nh16 * nh16 * nh16 * nh16 * nh16;
            let tightSpec = nh128;

            if (useAuthoredSampling) {
                // Authored block.png path: gold frame + stained-glass crystal (reference build)
                let lightFactor = 0.38 + NdotL * 0.62;
                let specularStrength = mix(0.04, 0.18, metalMask);
                finalColor = baseColor * lightFactor + vec3f(tightSpec * specularStrength);

                if (metalMask > 0.2 && fUniforms.metallic > 0.3) {
                    let R = reflect(-V, N);
                    let warmEnv = proceduralEnvReflect(R, time) * vec3f(1.15, 0.92, 0.55);
                    let fresnel = 1.0 - NdotV;
                    let fresnel3 = fresnel * fresnel * fresnel;
                    finalColor += warmEnv * fresnel3 * metalMask * fUniforms.metallic * 0.85;
                    let metalRough = max(fUniforms.roughness, 0.08);
                    let D = distributionGGX(NdotH, metalRough);
                    let G = geometrySmith(NdotV, NdotL, metalRough);
                    let metalSpec = (D * G) / max(4.0 * NdotV * NdotL, 0.001);
                    finalColor += vec3f(metalSpec) * metalMask * 0.35;
                }

                if (glassMask > 0.2) {
                    let iridescence = sin(NdotV * 8.0 - time * 0.5) * 0.5 + 0.5;
                    let rainbow = vec3f(
                        sin(iridescence * 6.28) * 0.5 + 0.5,
                        sin(iridescence * 6.28 + 2.09) * 0.5 + 0.5,
                        sin(iridescence * 6.28 + 4.18) * 0.5 + 0.5
                    );
                    finalColor += rainbow * tightSpec * 0.22 * glassMask;
                    let diffCenter = vUV - vec2f(0.5);
                    let centerGlow = clamp((0.2025 - dot(diffCenter, diffCenter)) / 0.1225, 0.0, 1.0);
                    let breath = sin(time * 1.5) * 0.03 + 0.03;
                    finalColor += vColor.rgb * breath * centerGlow * glassMask * 0.8;
                    let edgeFresnel = 1.0 - NdotV;
                    let edge3 = edgeFresnel * edgeFresnel * edgeFresnel;
                    finalColor += vec3f(0.4, 0.65, 0.95) * edge3 * glassMask * 0.35;
                }

                // Gold frame opaque; glass center opacity from CPU (reserved2.xy = min/max, .z = Fresnel power).
                let edgeFresnel = 1.0 - NdotV;
                let glassMin = fUniforms.reserved2.x;
                let glassMax = fUniforms.reserved2.y;
                let glassPower = max(fUniforms.reserved2.z, 0.001);
                let glassFresnel = pow(edgeFresnel, glassPower);
                let glassOpacity = mix(glassMin, glassMax, glassFresnel);
                finalAlpha = mix(1.0, glassOpacity, glassMaskAlpha);
            } else if (fUniforms.enablePBR < 0.5 || materialType == 0u) {
                // Classic mode
                let lightFactor = 0.4 + NdotL * 0.6;
                finalColor = baseColor * lightFactor;
                finalColor += vec3f(tightSpec * metalMask * 0.5);
            } else {
                // Full PBR
                let metallic = fUniforms.metallic;
                let roughness = fUniforms.roughness;
                let transmission = fUniforms.transmission;

                let F0_dielectric = vec3f(0.04);
                let F0 = mix(F0_dielectric, baseColor, metallic * metalMask);
                let F = fresnelSchlick(NdotV, F0);

                var specular = 0.0;
                if (fUniforms.anisotropic > 0.0 && metalMask > 0.5) {
                    specular = anisotropicSpecular(V, L, N, roughness, fUniforms.anisotropic);
                } else {
                    let D = distributionGGX(NdotH, roughness);
                    let G = geometrySmith(NdotV, NdotL, roughness);
                    specular = (D * G) / max(4.0 * NdotV * NdotL, 0.001);
                }

                let kd = (vec3f(1.0) - F) * (1.0 - metallic * metalMask);
                let diffuse = baseColor * NdotL * kd / 3.14159;

                let R = reflect(-V, N);
                let envColor = proceduralEnvReflect(R, time);
                // Warm environment tint on gold frame — avoids cold blue static on metal
                let warmEnv = envColor * vec3f(1.18, 0.94, 0.52);
                let metalEnv = mix(envColor, warmEnv, metalMask);
                let reflection = metalEnv * F * metallic * metalMask;

                finalColor = diffuse + vec3f(specular) * (0.5 + metallic * metalMask);
                finalColor += reflection;

                // Glass transmission: refraction + edge reflection (not raw texture noise)
                if (transmission > 0.0 && glassMask > 0.1) {
                    let f1 = 1.0 - NdotV;
                    let fresnel = f1 * f1 * f1;
                    let glassOpacity = mix(0.12, 0.92, fresnel);
                    finalAlpha = mix(1.0, glassOpacity, transmission * glassMask);

                    let refractDir = refract(-V, N, 1.0 / max(fUniforms.ior, 1.01));
                    let refractEnv = proceduralEnvReflect(refractDir, time);
                    let glassTint = mix(vec3f(0.92, 0.96, 1.0), vColor.rgb, 0.22);
                    let refractedColor = refractEnv * glassTint;
                    let glassReflect = envColor * fresnel * 0.28 * glassMask;
                    let glassBody = mix(refractedColor, finalColor, 0.38 * glassMask);
                    finalColor = mix(finalColor, glassBody + glassReflect, transmission * glassMask);

                    if (fUniforms.dispersion > 0.0) {
                        let edgeFactor = f1 * f1;
                        finalColor += vec3f(
                            fUniforms.dispersion * edgeFactor * glassMask * 0.06,
                            fUniforms.dispersion * edgeFactor * glassMask * 0.03,
                            -fUniforms.dispersion * edgeFactor * glassMask * 0.04
                        );
                    }
                }

                // Gem subsurface
                if (fUniforms.subsurface > 0.0 && materialType == 5u) {
                    let scatter = subsurfaceScattering(NdotL, fUniforms.subsurface, baseColor);
                    finalColor += scatter * vColor.rgb;
                }

                // Clearcoat
                if (fUniforms.clearcoat > 0.0) {
                    let ccD = distributionGGX(NdotH, 0.03);
                    let ccG = geometrySmith(NdotV, NdotL, 0.03);
                    let ccSpec = (ccD * ccG) / max(4.0 * NdotV * NdotL, 0.001);
                    finalColor += vec3f(ccSpec) * fUniforms.clearcoat;
                }
            }

            // === FRESNEL RIM LIGHTING (Neon Bricklayer task) ===
            // Rim lighting - Fresnel Schlick approximation for brighter edge glow
            let rimPower = 1.0 - NdotV;
            let f2 = rimPower * rimPower; let fresnel = f2 * f2 * rimPower; // approximated pow(rimPower, 5.0)

            // Gold rim color + intensity (boosted during hard drops)
            let rimColor = mix(vColor.rgb, vec3f(1.0, 0.85, 0.4), metalMask * fUniforms.metallic); // Warm gold on metal
            let dynamicRim = 5.0 + (fUniforms.movementFlash * 3.0) + (fUniforms.lineClearFlash * 10.0);
            let rimIntensity = (fresnelParams.intensity * dynamicRim) * (1.0 + fresnelParams.hardDropBoost * 2.0);

            let fresnelRim = rimColor * rimIntensity * fresnel;
            finalColor += fresnelRim; // Additive rim — looks great on gold glass

            // Lock tension effect
            let lockPercent = fUniforms.lockPercent;
            if (lockPercent > 0.25) {
                let tension = smoothstep(0.25, 1.0, lockPercent);
                let pulse = sin(time * (10.0 + tension * 30.0)) * 0.5 + 0.5;
                let warnColor = mix(vec3f(1.0, 0.6, 0.0), vec3f(1.0, 0.1, 0.0), tension);
                finalColor = mix(finalColor, warnColor, tension * pulse * pulse * 0.3);
            }

            // (ghost handled by early-return above)

            // NEW: Apply particle-material interaction
            let particleIntensity = fUniforms.particleIntensity;
            if (particleIntensity > 0.0) {
                var pMatType = materialType;
                // If using authored PBR texture (type 0), infer from masks
                if (pMatType == 0u && fUniforms.enablePBR > 0.5) {
                    if (glassMask > 0.5) {
                        pMatType = 1u; // Glass
                    } else if (metalMask > 0.5) {
                        pMatType = 2u; // Gold
                    }
                }
                if (pMatType > 0u) {
                    finalColor = applyParticleInteraction(pMatType, finalColor, N, L, V, particleIntensity, time);
                }
            }

            // Gentle emissive pulse (main.ts uses 0.25 scale to avoid washout)
            let levelPulseSpeed = 3.0 + fUniforms.level * 0.5;
            let idlePulse = sin(time * levelPulseSpeed) * 0.5 + 0.5;
            let emissivePulse = idlePulse * (0.25 + min(fUniforms.level * 0.03, 0.5)) + fUniforms.movementFlash * 0.4 + fUniforms.lineClearFlash * 0.8;
            finalColor += finalColor * emissivePulse;

            // Lava-specific magma glow: slow pulsing + bubbling variation (cooling magma look)
            if (materialType == 6u) {
                let magmaSlow = sin(time * 1.6) * 0.5 + 0.5;
                let magmaFast = sin(time * 5.3 + vWorldPos.x * 7.0) * 0.35 + 0.65;
                let magmaPulse = magmaSlow * 0.7 + magmaFast * 0.3;
                // Extra intensity on lava (high emissive values from material)
                finalColor += baseColor * magmaPulse * 2.1;
            }

            // Hologram material: animated horizontal scanline overlay for holographic projection
            if (materialType == 7u) {
                let scanDensity = 42.0;
                let scrollSpeed = 0.75; // slow downward scroll
                // Use vUV.y for consistent horizontal lines across the block face
                let scanPos = vUV.y * scanDensity - time * scrollSpeed;
                let scan = fract(scanPos);
                let lineWidth = 0.07;
                // Soft bright horizontal lines (classic holo scan)
                let scanIntensity = smoothstep(0.0, lineWidth, scan) *
                                    smoothstep(lineWidth * 2.2, lineWidth, scan);
                // Flicker frequency increases with level (tied to fUniforms.level)
                let flickerFreq = 5.5 + fUniforms.level * 3.2;
                let flicker = 0.65 + 0.35 * sin(time * flickerFreq + vUV.x * 7.0);
                let holoAlpha = 0.28 * scanIntensity * flicker;
                // Cool holographic cyan tint, additive for projection "glow"
                let holoTint = vec3f(0.55, 0.82, 1.0);
                finalColor += holoTint * holoAlpha * 2.8;
                // Slight desaturation/base reduction for see-through holo effect
                finalColor *= (0.78 + holoAlpha * 0.25);
            }

            // Depth-based soft shadow: each block casts downward onto lower blocks in same column.
            // columnHeights[c] = topmost row (0=top) or 20; vertical dist in rows from vWorldPos (2.2 hardcoded).
            // Additional darkening term, subtle, only for solid placed blocks (ghosts early-return before).
            {
                let colF = floor(vWorldPos.x / 2.2 + 0.0001);
                let col = i32(clamp(colF, 0.0, 9.0));
                let topRow = fUniforms.columnHeights[col];
                let myRow = floor(-vWorldPos.y / 2.2 + 0.0001);
                let vDepth = myRow - topRow;
                if (topRow >= 0.0 && vDepth > 0.5) {
                    let shadow = clamp(vDepth / 9.0, 0.0, 0.28); // soft max ~28% darken deep in stack
                    finalColor *= (1.0 - shadow);
                }
            }

            // Audio-reactive border glow pulsing driven by bands written from viewRenderLoop.
            // bassLevel pulses left/right outer frame, trebleLevel top, midLevel bottom.
            // Detects border via vWorldPos ranges (outside main board rect); boosts emissive.
            {
                var borderBoost = 0.0;
                if (vWorldPos.x < -0.8 || vWorldPos.x > 21.0) {
                    borderBoost = fUniforms.bassLevel * 0.55; // L/R sides
                } else if (vWorldPos.y > 1.5) {
                    borderBoost = fUniforms.trebleLevel * 0.55; // top
                } else if (vWorldPos.y < -44.5) {
                    borderBoost = fUniforms.midLevel * 0.55; // bottom
                }
                finalColor += vec3f(borderBoost);
            }

            finalColor = clamp(finalColor, vec3f(0.0), vec3f(1.0));

            // === GPU CLEAR-DISSOLVE GLOW ===
            // Sample the compute-written per-cell dissolve field (0..1, decays ~300ms).
            // Cell index derived from world position (same /BLOCK_WORLD_SIZE mapping as
            // columnHeights above). Additive post-clamp so the fading glow can bloom.
            {
                let dCol = i32(clamp(floor(vWorldPos.x / 2.2 + 0.0001), 0.0, 9.0));
                let dRow = i32(clamp(floor(-vWorldPos.y / 2.2 + 0.0001), 0.0, 19.0));
                let dissolveVal = dissolveField[dRow * 10 + dCol];
                if (dissolveVal > 0.001) {
                    finalColor += vec3f(0.55, 0.9, 1.0) * dissolveVal * 2.2;
                }
            }

            // Use the hard metal mask for opacity so the frame never becomes semi-transparent.
            let materialAlpha = mix(finalAlpha, 1.0, metalMaskForAlpha);
            let outAlpha = materialAlpha * vColor.w;
            // Premultiply RGB for premultiplied-alpha blending.
            finalColor *= outAlpha;
            return vec4f(finalColor, outAlpha);
        }
