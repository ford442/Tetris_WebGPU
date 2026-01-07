
export const VideoBackgroundShader = () => {
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
            output.uv.y = 1.0 - output.uv.y; // Correct standard video orientation
            return output;
        }
    `;

    const fragment = `
        struct GameState {
            screen_size: vec2<f32>,
            time: f32,
            dt: f32,

            // Active Piece
            piece_pos: vec2<f32>,

            // NEW: Video Size for Aspect Ratio Correction
            video_size: vec2<f32>,

            piece_color: vec4<f32>,

            // Line Clears (Packed into vec4 for alignment)
            cleared_lines: vec4<f32>,
            line_clear_params: vec4<f32>, // x=count, y=progress, z=padding, w=padding

            // Stats
            stats: vec4<f32>, // x=level, y=score, z=quality(LOD), w=debug_mode

            // Locked Pieces Ring Buffer
            // We use vec4 for alignment: x,y = pos, z = fade_strength, w = padding
            locked_pieces: array<vec4<f32>, 200>,
        };

        @group(0) @binding(0) var<uniform> game: GameState;
        @group(0) @binding(1) var videoSampler: sampler;
        @group(0) @binding(2) var videoTexture: texture_external;

        @fragment
        fn main(@location(0) uv : vec2<f32>) -> @location(0) vec4<f32> {
            var finalUV = uv;
            var finalColor = vec4<f32>(0.0);

            // --- ASPECT RATIO CORRECTION (Cover Mode) ---
            let screenW = game.screen_size.x;
            let screenH = game.screen_size.y;
            let vidW = select(1920.0, game.video_size.x, game.video_size.x > 1.0);
            let vidH = select(1080.0, game.video_size.y, game.video_size.y > 1.0);

            let screenRatio = screenW / max(1.0, screenH);
            let videoRatio = vidW / max(1.0, vidH);

            // Calculate scale to cover the screen
            var scale = vec2<f32>(1.0, 1.0);

            if (screenRatio > videoRatio) {
                // Screen is wider: Fit Width, Crop Height
                scale.y = videoRatio / screenRatio;
            } else {
                // Screen is taller: Fit Height, Crop Width
                scale.x = screenRatio / videoRatio;
            }

            // Center the crop
            let coverUV = (finalUV - 0.5) * scale + 0.5;

            // Calculate screen pos for distance checks (approximate aspect ratio correction)
            let aspect = game.screen_size.x / game.screen_size.y;
            let screenUV = uv * vec2<f32>(aspect, 1.0);

            // --- 1. GHOST PIECE BURN-IN ---
            var totalDistortion = vec2<f32>(0.0);
            let max_pieces = u32(200.0 * game.stats.z);

            for (var i = 0u; i < max_pieces; i++) {
                let data = game.locked_pieces[i];
                if (data.z <= 0.001) { continue; }

                let pieceUV = vec2<f32>(data.x / 10.0, 1.0 - (data.y / 20.0));
                let pieceScreenUV = pieceUV * vec2<f32>(aspect, 1.0);

                let dist = distance(screenUV, pieceScreenUV);
                let radius = 0.15;
                let influence = smoothstep(radius, 0.0, dist) * data.z;

                totalDistortion += (screenUV - pieceScreenUV) * influence * 0.05;
            }

            // Apply distortion to our corrected UVs
            let distortedUV = coverUV + totalDistortion;

            // --- 2. ACTIVE PIECE GRAVITY WELL ---
            let activePos = vec2<f32>(game.piece_pos.x / 10.0, 1.0 - (game.piece_pos.y / 20.0));
            let activeDist = distance(screenUV, activePos * vec2<f32>(aspect, 1.0));
            let activeInfluence = smoothstep(0.3, 0.0, activeDist) * 0.03;
            let pulse = sin(game.time * 5.0) * 0.005;

            let finalSampleUV = distortedUV + (screenUV - (activePos * vec2<f32>(aspect, 1.0))) * (activeInfluence + pulse);

            // SAMPLE VIDEO
            var videoColor = textureSampleBaseClampToEdge(videoTexture, videoSampler, finalSampleUV);

            // --- 3. MULTI-LINE CASCADE ---
            let lineCount = u32(game.line_clear_params.x);
            if (lineCount > 0u) {
                let progress = game.line_clear_params.y;
                var celebration = vec3<f32>(0.0);
                if (lineCount >= 4u) {
                     let flash = sin(game.time * 15.0) * (1.0 - progress);
                     celebration = vec3<f32>(flash * 0.2, flash * 0.1, flash * 0.3);
                }

                for (var i = 0u; i < lineCount; i++) {
                    let lineY_raw = game.cleared_lines[i];
                    let lineUV_Y = 1.0 - (lineY_raw / 20.0);
                    let distToLine = abs(uv.y - lineUV_Y); // Use original UV for line position logic
                    let stagger = f32(i) * 0.15;
                    let wavePos = progress * (1.0 + stagger);
                    let waveDist = abs(distToLine - wavePos * 0.5);
                    let waveIntensity = smoothstep(0.1, 0.0, waveDist) * (1.0 - progress) * 2.0;

                    videoColor.r += waveIntensity * 0.3;
                    videoColor.b -= waveIntensity * 0.3;
                    videoColor = vec4<f32>(videoColor.rgb + celebration, videoColor.a);
                }
            }

            // --- 4. DEBUG VISUALIZATION ---
            if (game.stats.w > 0.5) {
                let distLen = length(totalDistortion) * 20.0;
                videoColor.g += distLen;
                if (activeDist < 0.3) { videoColor.r += 0.1; }
            }

            let levelBoost = 1.0 + game.stats.x * 0.05;
            let gray = dot(videoColor.rgb, vec3<f32>(0.299, 0.587, 0.114));
            videoColor = mix(vec4<f32>(vec3<f32>(gray), 1.0), videoColor, 1.0 + levelBoost * 0.2);

            return videoColor;
        }
    `;
    return { vertex, fragment };
};
