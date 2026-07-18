/**
 * Post-Processing Shader
 * Lens distortion, shockwave, bloom, chromatic aberration, glitch, scanlines.
 */

import { PostProcessUniformsWGSL } from '../postProcessUniforms.js';

export const PostProcessShaders = () => {
    const vertex = `
        struct VertexOutput {
            @builtin(position) Position : vec4<f32>,
            @location(0) uv : vec2<f32>,
        };

        @vertex
        fn main(@location(0) position : vec3<f32>) -> VertexOutput {
            var output : VertexOutput;
            output.Position = vec4<f32>(position, 1.0);
            output.uv = position.xy * 0.5 + 0.5;
            output.uv.y = 1.0 - output.uv.y; // Flip Y for texture sampling
            return output;
        }
    `;

    const fragment = `
        ${PostProcessUniformsWGSL}
        @binding(0) @group(0) var<uniform> uniforms : PostProcessUniforms;
        @binding(1) @group(0) var mySampler: sampler;
        @binding(2) @group(0) var myTexture: texture_2d<f32>;
        @binding(3) @group(0) var blockTexture: texture_2d<f32>;
        @binding(4) @group(0) var<uniform> shockwaveParamsUniform: vec4<f32>;

        @fragment
        fn main(@location(0) uv : vec2<f32>) -> @location(0) vec4<f32> {
            // Lens Distortion (Barrel)
            let centeredUV = uv - 0.5;
            let distSq = dot(centeredUV, centeredUV);
            let distortStrength = 0.1; // K factor
            let distortedUV = 0.5 + centeredUV * (1.0 + distSq * distortStrength);

            var finalUV = distortedUV;

            // Black Hole Distortion Effect for Tetris/All Clears
            if (uniforms.blackHoleTime > 0.001) {
                let bhCenter = uniforms.blackHoleCenter;
                let bhTime = uniforms.blackHoleTime;
                let bhDiff = finalUV - bhCenter;
                let bhDist = length(bhDiff);

                // Exponential radius shrink as it decays
                let bhRadius = 0.5 * (1.0 - pow(bhTime, 0.5));

                if (bhDist < bhRadius && bhDist > 0.0) {
                    let angle = atan2(bhDiff.y, bhDiff.x);
                    // Faster spin towards the center and over time
                    let spin = bhTime * 10.0 * (1.0 - bhDist / bhRadius);
                    let newAngle = angle + spin;

                    // Suck inwards (gravity)
                    let suck = pow(bhDist / bhRadius, 2.0) * bhRadius;

                    finalUV = bhCenter + vec2<f32>(cos(newAngle), sin(newAngle)) * suck;
                }
            }
            let inBounds = (distortedUV.x >= 0.0 && distortedUV.x <= 1.0 && distortedUV.y >= 0.0 && distortedUV.y <= 1.0);

            // Game over kaleidoscope (must be early, before any textureSample using finalUV)
            if (uniforms.gameOverKaleidoTime > 0.001) {
                let p = finalUV - vec2<f32>(0.5);
                let r = length(p);
                var a = atan2(p.y, p.x);
                let spin = uniforms.gameOverKaleidoTime * 0.7;
                let sa = 1.04719755;
                a = a + spin;
                a = abs( (a / sa) % 2.0 - 1.0 ) * sa;
                let ka = vec2<f32>(cos(a), sin(a)) * r + vec2<f32>(0.5);
                finalUV = ka;
            }

            // Shockwave
            let center = uniforms.shockwaveCenter;
            let time = uniforms.shockwaveTime;
            let glitchStrength = uniforms.useGlitch; // Treated as intensity
            let params = uniforms.shockwaveParams;
            let hardDropBoostFromBuffer = shockwaveParamsUniform.x; // Use binding 4
            let level = uniforms.level;

            // === EXPLICIT SHOCKWAVE EFFECT AS REQUESTED ===
            // Shockwave Logic
            var shockwaveAberration = 0.0;
            var glassOverlay = 0.0;

            // Shockwave distortion effect for hard drops
            if (params.y > 0.0) {
                // Apply stronger / different distortion for hard drop
                shockwaveAberration += params.z * 0.5;
            }
            if (time > 0.0 && time < 1.0) {
                let dist = length(uv - center);
                // NEON BRICKLAYER: Use speed from params.w
                let speed = max(params.w, 0.1);
                let radius = time * speed;
                let width = params.x * 1.5; // JUICE: Wider shockwave
                // NEW: explicitly apply the Neon Bricklayer Hard Drop Boost to shockwave intensity!
                let strength = (params.y * 1.55) * (1.0 + hardDropBoostFromBuffer * 0.6);
                let diff = dist - radius;

                // Pre-calculate direction vector once to eliminate redundant ALU operations
                let dir = normalize(uv - center);

                if (abs(diff) < width) {
                    // Cosine wave for smooth ripple
                    let angle = (diff / width) * 3.14159;
                    let distortion = cos(angle) * strength * (1.0 - time); // Fade out

                    finalUV -= dir * distortion;

                    // Add chromatic aberration at the edge of the shockwave
                    // NEON BRICKLAYER: Increased shockwave intensity + chromatic aberration on hard drops
                    // for maximum "drop impact" feel (per Graphics & Game Feel requirements)
                    shockwaveAberration = params.z * 3.0 * (1.0 - abs(diff)/width) * (1.0 - time);

                    // NEON BRICKLAYER: Add shattered glass overlay near epicenter
                    if (hardDropBoostFromBuffer > 0.0 && time < 0.5) {
                        // UVs mapped to the glass block texture, centered at the shockwave epicenter
                        let glassUV = (uv - center) * 4.0 + vec2<f32>(0.5);
                        let texColor = textureSampleLevel(blockTexture, mySampler, glassUV, 0.0).rgb;

                        if (glassUV.x >= 0.0 && glassUV.x <= 1.0 && glassUV.y >= 0.0 && glassUV.y <= 1.0) {
                            // Extract 'cracks' or bright highlights from the gold glass texture
                            let crackIntensity = max(texColor.r, max(texColor.g, texColor.b));

                            // Blend it smoothly based on distance to the shockwave ring
                            let blend = cos(angle) * strength * (1.0 - time * 2.0) * hardDropBoostFromBuffer * 2.0;
                            glassOverlay = clamp(crackIntensity * blend, 0.0, 1.0);
                        }
                    }
                }

                // Second ring (Echo) - NEON BRICKLAYER
                let echoRadius = radius * 0.8;
                let echoDiff = abs(dist - echoRadius);
                if (echoDiff < width * 0.5) {
                    let angle = (echoDiff / (width * 0.5)) * 3.14159;
                    let distortion = cos(angle) * strength * 0.5 * (1.0 - time);
                    finalUV -= dir * distortion;
                }

                // Third ring (Ripple)
                let echoRadius2 = radius * 0.6;
                let echoDiff2 = abs(dist - echoRadius2);
                if (echoDiff2 < width * 0.5) {
                    let angle = (echoDiff2 / (width * 0.5)) * 3.14159;
                    let distortion = cos(angle) * strength * 0.25 * (1.0 - time);
                    finalUV -= dir * distortion;
                }
            }

            // Global Chromatic Aberration (Glitch + Shockwave + Edge Vignette + Level Stress)
            let centeredFromCenter = uv - vec2<f32>(0.5);
            let distFromCenterSq = dot(centeredFromCenter, centeredFromCenter);
            let distFromCenter = sqrt(distFromCenterSq);
            // Subtle permanent aberration at edges for arcade feel
            // JUICE: Stronger lens distortion at edges for arcade CRT feel
            // ENHANCED: Increased base aberration
            let dist2 = distFromCenterSq;
            let vignetteAberration = dist2 * dist2 * 0.08; // Sharper curve, more intense at far corners

            // Level based aberration: Starts calm, gets glitchy at high levels
            // Level 10+ = max stress
            let levelStress = clamp(level / 12.0, 0.0, 1.0);
            let levelAberration = levelStress * 0.008 * sin(uniforms.time * 2.0); // Breathing aberration

            // NEON BRICKLAYER: Enhanced Glitch Logic
            // Dynamic offset based on intensity, time, and Y position
            let glitchOffset = glitchStrength * 0.05 * sin(finalUV.y * 50.0 + uniforms.time * 20.0);
            // Tear effect: Random horizontal strips
            let tear = step(0.95, fract(finalUV.y * 2.0 + uniforms.time * 10.0)) * glitchStrength * 0.05;
            finalUV.x += tear;

            let baseAberration = vignetteAberration + levelAberration;
            // Add glitch aberration
            let glitchAberration = glitchStrength * 0.08;

            // NEON BRICKLAYER: We separate shockwave aberration so we can heavily distort the RGB split independently from vignette
            let totalAberration = baseAberration + glitchAberration;

            // Chromatic Aberration with Glitch Offset + Heavy Shockwave Split
            // R and B channels get offset by the glitch wave and shockwave in opposite directions
            // JUICE: Vertical aberration added for lens effect (scaled by UV y)
            let horizOffset = totalAberration + glitchOffset + shockwaveAberration;
            let vertAberration = totalAberration * (uv.y - 0.5) * 0.2 + (shockwaveAberration * 0.5);

            // NEON BRICKLAYER: Music/Event driven chromatic aberration
            let chromaticMusicOffset = uniforms.chromaticIntensity * 0.02 * (uv.y - 0.5);
            let chromaticMusicHoriz = uniforms.chromaticIntensity * 0.015;

            // NEW: Hard-drop triggered short-lived chromatic aberration spike (u_aberrationPulse)
            // 300ms exp decay (CPU side), separate per-channel RGB offsets for a sharp "spike" at impact.
            // Positive/negative splits create classic red/cyan fringing that peaks then fades.
            let pulse = uniforms.aberrationPulse;
            let pulseR = pulse * 0.022;
            let pulseG = pulse * 0.004;
            let pulseB = pulse * -0.018;

            let baseSample = textureSample(myTexture, mySampler, finalUV);
            var r = textureSample(myTexture, mySampler, finalUV + vec2<f32>(horizOffset + pulseR + chromaticMusicHoriz, vertAberration + pulseG * 0.6 + chromaticMusicOffset)).r;
            var g = baseSample.g;
            var b = textureSample(myTexture, mySampler, finalUV - vec2<f32>(horizOffset + pulseB + chromaticMusicHoriz, vertAberration + pulseR * 0.4 + chromaticMusicOffset)).b;
            let a = baseSample.a;

            // Bloom-ish boost (optimized 5-tap tent filter)
            var color = vec3<f32>(r, g, b) + vec3<f32>(0.4, 0.8, 1.0) * glassOverlay;

            // OPTIMIZED: 5-tap tent filter (down from 8) with weighted sampling
            // Center + 4 directional samples = better quality, fewer ALU ops
            let spread = 0.012 * (1.0 + levelStress * 0.6);
            var glow = color * 0.25; // Center weight

            // 4 directional samples (cardinal directions for better cache coherence)
            let dX = vec2<f32>(spread, 0.0);
            let dY = vec2<f32>(0.0, spread);
            glow += textureSample(myTexture, mySampler, finalUV + dX).rgb * 0.1875;
            glow += textureSample(myTexture, mySampler, finalUV - dX).rgb * 0.1875;
            glow += textureSample(myTexture, mySampler, finalUV + dY).rgb * 0.1875;
            glow += textureSample(myTexture, mySampler, finalUV - dY).rgb * 0.1875;

            // Tuned bloom that preserves texture detail
            let glowLum = dot(glow, vec3<f32>(0.299, 0.587, 0.114));
            let bloomThreshold = 0.35;   // higher = protects glass texture
            let knee = 0.12;
            let contrib = max(glowLum - bloomThreshold + knee, 0.0);
            let bloomIntensity = smoothstep(0.0, knee * 2.0, contrib) * 3.2;  // lowered from 6.0

            color += glow * bloomIntensity;

            // Darken the center of the black hole
            if (uniforms.blackHoleTime > 0.001) {
                let bhCenter = uniforms.blackHoleCenter;
                let bhTime = uniforms.blackHoleTime;
                let bhDiff = uv - bhCenter;
                let bhDist = length(bhDiff);
                let bhRadius = 0.5 * (1.0 - pow(bhTime, 0.5));
                if (bhDist < bhRadius) {
                    let darkFactor = smoothstep(0.0, bhRadius * 0.5, bhDist);
                    color *= darkFactor;
                    // Event horizon cyan glow
                    let ring = smoothstep(bhRadius * 0.8, bhRadius, bhDist) * (1.0 - smoothstep(bhRadius, bhRadius * 1.2, bhDist));
                    color += vec3<f32>(0.2, 0.8, 1.0) * ring * 2.0 * (1.0 - bhTime);
                }
            }

            // Optional softer secondary boost
            let luminance = dot(color, vec3<f32>(0.299, 0.587, 0.114));
            if (luminance > 0.78) {
                color += color * 0.18;
            }

            // Vignette darken (pulsing with beat)
            let beat = sin(uniforms.time * 8.0) * 0.5 + 0.5;
            let vignetteSize = 1.5 - (beat * 0.05 * levelStress);
            let vignetteInnerRadiusSq = 0.25; // 0.25 = 0.5^2 (inner vignette radius squared)
            let vignetteEpsilon = 0.0001;
            let vignetteOuterSq = max(vignetteSize * vignetteSize, vignetteInnerRadiusSq + vignetteEpsilon);
            let vignette = 1.0 - clamp((distFromCenterSq - vignetteInnerRadiusSq) / (vignetteOuterSq - vignetteInnerRadiusSq), 0.0, 1.0);
            color *= vignette;

            // Danger vignette: screen-edge red that contracts (inner radius shrinks) as board fills (u_dangerLevel)
            // Pulses opacity at 2 Hz (sin(time * 4 * PI)) only when dangerLevel > 0.75
            let danger = uniforms.dangerLevel;
            if (danger > 0.01) {
                let dangerInner = 0.28 - danger * 0.26; // contracts toward 0.02 when full (deeper red encroachment)
                let dangerOuter = 1.35;
                let dangerVig = 1.0 - clamp((distFromCenterSq - dangerInner) / (dangerOuter - dangerInner), 0.0, 1.0);
                let red = vec3<f32>(0.55, 0.04, 0.04); // deep red
                let dangerOpacity = danger * 0.9;
                if (danger > 0.75) {
                    let pulse = 0.5 + 0.5 * sin(uniforms.time * 12.56637); // exactly 2 Hz
                    dangerOpacity *= (0.55 + 0.45 * pulse);
                }
                color = mix(color, red, dangerVig * dangerOpacity);
            }

            // NEON BRICKLAYER: Warp Surge Flash
            let warpSurge = uniforms.warpSurge;
            if (warpSurge > 0.01) {
                let invert = vec3<f32>(1.0) - color;
                color = mix(color, invert, clamp(warpSurge * 0.8, 0.0, 0.8));
            }

            // Level-up color burn flash: additive fullscreen overlay on the final composite quad
            // High opacity start, exact 400ms linear fade, color cycles with new level's theme.backgroundColors[0]
            let levelUpFlash = uniforms.levelUpFlashIntensity;
            if (levelUpFlash > 0.01) {
                let fc = uniforms.levelUpFlashColor;
                color += fc * (levelUpFlash * 1.05);
            }

            // Scanlines
            let baseScanline = sin(finalUV.y * 800.0 + uniforms.time * 10.0) * 0.04;
            // NEON BRICKLAYER: Add intense CRT jitter on hard drop boost
            let crtJitter = sin(finalUV.y * 1200.0 - uniforms.time * 50.0) * 0.15 * uniforms.hardDropBoost;
            color -= vec3<f32>(baseScanline + crtJitter);

            // Fade the kaleido (if active) as the 2s timer expires (hands off to HTML overlay)
            if (uniforms.gameOverKaleidoTime > 0.001) {
                let kaleidoFade = uniforms.gameOverKaleidoTime / 2.0;
                color *= kaleidoFade;
            }

            // NEW NEON BRICKLAYER: Neon Burst Radial Distortion & Glow (Hard Drop Crunch)
            let burst = uniforms.neonBurst;
            if (burst > 0.001) {
                let distCenter = length(uv - vec2<f32>(0.5, 0.5));

                // Rapid radial expansion
                let burstRing = smoothstep(0.1, 0.0, abs(distCenter - (1.0 - burst) * 0.8));

                // Intense Cyan / Magenta overlay
                let burstColor = vec3<f32>(0.2, 0.8, 1.0) * burst + vec3<f32>(1.0, 0.2, 0.8) * (1.0 - burst);

                // Additive boost
                color += burstColor * burstRing * burst * 1.5;

                // Flash the entire screen slightly
                color += burstColor * burst * 0.2;
            }

            // JUICE: Supernova Line Clear Laser
            let laserIntensity = uniforms.lineClearLaserIntensity;
            if (laserIntensity > 0.01) {
                var laserGlow = 0.0;
                for (var i: i32 = 0; i < 4; i++) {
                    let yPos = uniforms.lineClearLaserY[i];
                    if (yPos > 0.01) {
                        let distY = abs(uv.y - yPos);
                        // Sharp falloff for intense laser beam look
                        laserGlow += 1.0 / (distY * 80.0 + 1.0) * (1.0 / (1.0 + distY * 10.0));
                        // Add horizontal tear/glitch near the laser
                        if (distY < 0.02) {
                            color.b += 0.2 * laserIntensity;
                        }
                    }
                }
                // Cyan/white beam color
                let laserColor = vec3<f32>(0.2, 0.8, 1.0) * laserIntensity * 2.5;
                color += laserColor * laserGlow;
            }

            if (!inBounds) {
                return vec4<f32>(0.0, 0.0, 0.0, 0.0);
            }

            // NEON BRICKLAYER: Line Clear Escalation Saturation Boost
            let satBoost = uniforms.saturationBoost;
            if (satBoost > 0.001) {
                let luma = dot(color, vec3<f32>(0.299, 0.587, 0.114));
                color = mix(vec3<f32>(luma), color, 1.0 + satBoost);
            }

            // Canvas uses alphaMode: 'premultiplied' — RGB must be scaled by alpha.
            return vec4<f32>(color * a, a);
        }
    `;

    return { vertex, fragment };
};
