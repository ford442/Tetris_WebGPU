// Per-block post effects shared by every shading path: Fresnel rim, lock-tension
// warning, particle interaction, emissive pulse, lava/hologram material overlays,
// stack shadow, audio-reactive border glow and the GPU clear-dissolve glow.
//
// Split out of fragmentMain.wgsl. HDR energy is preserved on purpose — ACES
// tonemapping runs later, in the bloom composite.

fn applyBlockFx(
    colorIn: vec3f,
    baseColor: vec3f,
    vWorldPos: vec4f,
    vUV: vec2f,
    vColor: vec4f,
    N: vec3f,
    L: vec3f,
    V: vec3f,
    NdotV: f32,
    metalMask: f32,
    glassMask: f32,
    materialType: u32,
    time: f32,
) -> vec3f {
    var finalColor = colorIn;

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
            // JUICE: Speed up and slightly intensify the pulse during high combos!
            let levelPulseSpeed = 3.0 + fUniforms.level * 0.5 + fUniforms.comboEnergy * 4.0;
            let idlePulse = sin(time * levelPulseSpeed) * 0.5 + 0.5;
            let emissivePulse = idlePulse * (0.25 + min(fUniforms.level * 0.03, 0.5) + fUniforms.comboEnergy * 0.15) + fUniforms.movementFlash * 0.4 + fUniforms.lineClearFlash * 0.8;
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

            // Keep HDR energy for bloom; ACES tonemap runs in the bloom composite.

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

    return finalColor;
}
