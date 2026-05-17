/**
 * Grid Shader
 * Renders the Tetris playfield grid lines with floor glow, ghost landing zone,
 * and lock-tension warning effects.
 */

export const GridShader = () => {
    const vertex = `
        struct Uniforms {
            viewProjectionMatrix : mat4x4<f32>,
            time : f32, // Offset 64
            ghostX : f32, // Offset 68
            ghostWidth : f32, // Offset 72
            warpSurge : f32, // Offset 76
            lockPercent: f32, // Offset 80
        };
        @binding(0) @group(0) var<uniform> uniforms : Uniforms;

        struct VertexOutput {
            @builtin(position) Position : vec4<f32>,
            @location(0) vPos : vec3<f32>,
        };

        @vertex
        fn main(@location(0) position : vec3<f32>) -> VertexOutput {
            var output : VertexOutput;
            var pos = position;

            // NEON BRICKLAYER: Grid Ripple on Impact (Boosted)
            if (uniforms.warpSurge > 0.01) {
                let wave = sin(pos.x * 0.8 + uniforms.time * 15.0) * uniforms.warpSurge * 3.5;
                pos.y += wave;
            }

            output.Position = uniforms.viewProjectionMatrix * vec4<f32>(pos, 1.0);
            output.vPos = pos;
            return output;
        }
    `;
    const fragment = `
        struct Uniforms {
            viewProjectionMatrix : mat4x4<f32>,
            time : f32,
            ghostX : f32,
            ghostWidth : f32,
            warpSurge : f32,
            lockPercent: f32,
        };
        @binding(0) @group(0) var<uniform> uniforms : Uniforms;

        @fragment
        fn main(@location(0) vPos : vec3<f32>) -> @location(0) vec4<f32> {
            // Pulse the grid lines (ENHANCED)
            // Pulse 1: Base breathing (synced with time)
            let pulse1 = sin(uniforms.time * 2.0) * 0.5 + 0.5;

            // Pulse 2: Energy Flow (moves up the grid)
            let pulse2 = sin(uniforms.time * 10.0 + vPos.y * 0.5) * 0.5 + 0.5;

            // Pulse 3: Vertical beat (Game Speed)
            let pulse3 = sin(uniforms.time * 20.0) * 0.5 + 0.5;

            var alpha = 0.15 + pulse1 * 0.2 + pulse2 * 0.15; // Combined pulse
            var color = vec3<f32>(0.8, 0.9, 1.0); // Slightly blue-ish white

            // Floor Glow (Bottom of the grid)
            // Highlight the landing zone area near y = -43.0
            let floorDist = abs(vPos.y - (-43.0));
            // Glow within 8 units of bottom, stronger at very bottom
            // ENHANCED: Wider and brighter floor glow
            let floorGlow = smoothstep(20.0, 0.0, floorDist);

            if (floorGlow > 0.0) {
                 alpha += floorGlow * 0.8 + pulse3 * 0.3; // Make floor very visible
                 // Cyan/Blue floor that reacts to pulse
                 let floorColor = vec3<f32>(0.0, 1.0, 1.0);
                 // Mix with magenta for style
                 let floorColor2 = vec3<f32>(1.0, 0.0, 1.0);
                 let finalFloor = mix(floorColor, floorColor2, pulse3);

                 color = mix(color, finalFloor, floorGlow * 0.9);
            }

            // Distance Fade (Fog)
            let center = vec2<f32>(10.0, -20.0);
            let diffFromCenter = vPos.xy - center;
            let distFromCenterSq = dot(diffFromCenter, diffFromCenter);
            let fade = 1.0 - smoothstep(225.0, 900.0, distFromCenterSq); // 15^2 to 30^2
            alpha *= fade;

            // NEON BRICKLAYER: Ghost Landing Zone
            // Check if we are within the ghost width range
            let dist = abs(vPos.x - uniforms.ghostX);
            let halfWidth = uniforms.ghostWidth * 0.5;

            // Highlight zone (Floor Only)
            if (dist < halfWidth && vPos.y < -35.0) {
                 // Pulse the landing zone (Speed up with lock tension)
                 let tension = uniforms.lockPercent;
                 let pulseSpeed = 15.0 + tension * 40.0;
                 let zonePulse = sin(uniforms.time * pulseSpeed) * 0.5 + 0.5;

                 alpha += 1.5 + zonePulse * (0.8 + tension * 1.0); // More dynamic pulse
                 // Add a subtle gradient to the zone
                 let zoneGrad = 1.0 - (dist / halfWidth);
                 alpha *= (0.5 + zoneGrad * 0.5);

                 color = vec3<f32>(0.0, 1.0, 1.0); // Cyan glow
            }

            // NEON BRICKLAYER: Lock Tension Grid Warning
            if (uniforms.lockPercent > 0.5) {
                 let tension = (uniforms.lockPercent - 0.5) * 2.0;
                 let warningPulse = sin(uniforms.time * 20.0) * 0.5 + 0.5;
                 // Flash entire floor red/orange
                 if (vPos.y < -35.0) {
                     let red = vec3<f32>(1.0, 0.2, 0.0);
                     color = mix(color, red, tension * warningPulse * 0.7);
                     alpha += tension * warningPulse * 0.5;
                 }
            }

            return vec4<f32>(color, alpha);
        }
    `;
    return { vertex, fragment };
};
