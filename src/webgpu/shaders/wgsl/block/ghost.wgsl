// Ghost-piece shading — "holographic projection of the real textured block".
//
// Split out of fragmentMain.wgsl so the mega-function stays readable; the ghost is
// a self-contained early return that never touches PBR, IBL or refraction. Reads
// fUniforms (TS-only file — not shared with the C++ renderer, which has no ghost).

/// Premultiplied ghost color + alpha. Returned straight from the fragment entry.
fn renderGhostBlock(
    vUV: vec2f,
    vColor: vec4f,
    NdotV: f32,
    metalMask: f32,
    glassMask: f32,
    metalColor: vec3f,
    glassColor: vec3f,
    time: f32,
) -> vec4f {
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
