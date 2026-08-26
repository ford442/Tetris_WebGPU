struct PostProcessUniforms {
    time: f32,
    intensity: f32,
    aberration: f32,
    pad1: f32,
};

@group(0) @binding(0) var<uniform> uniforms: PostProcessUniforms;
@group(0) @binding(1) var screenSampler: sampler;
@group(0) @binding(2) var screenTexture: texture_2d<f32>;

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) uv: vec2<f32>,
};

@vertex
fn vs_main(@builtin(vertex_index) vertexIndex: u32) -> VertexOutput {
    var out: VertexOutput;
    // Generate a fullscreen triangle
    let uv = vec2<f32>(f32((vertexIndex << 1u) & 2u), f32(vertexIndex & 2u));
    out.position = vec4<f32>(uv * vec2<f32>(2.0, -2.0) + vec2<f32>(-1.0, 1.0), 0.0, 1.0);
    out.uv = uv;
    return out;
}

@fragment
fn fs_main(@location(0) uv: vec2<f32>) -> @location(0) vec4<f32> {
    // Lens Distortion (Barrel)
    let centeredUV = uv - 0.5;
    let distSq = dot(centeredUV, centeredUV);
    let distortStrength = 0.1 * uniforms.intensity;
    let distortedUV = 0.5 + centeredUV * (1.0 + distSq * distortStrength);

    var finalUV = distortedUV;

    // Bounds check to avoid texture wrap artifacts
    if (finalUV.x < 0.0 || finalUV.x > 1.0 || finalUV.y < 0.0 || finalUV.y > 1.0) {
        return vec4<f32>(0.0, 0.0, 0.0, 0.0);
    }

    // Edge Vignette & Chromatic Aberration base
    let distFromCenterSq = dot(finalUV - 0.5, finalUV - 0.5);
    let dist2 = distFromCenterSq;
    let vignetteAberration = dist2 * dist2 * 0.08;

    let totalAberration = vignetteAberration + uniforms.aberration;

    // Split RGB
    let horizOffset = totalAberration;
    let r_uv = finalUV + vec2<f32>(horizOffset, 0.0);
    let b_uv = finalUV - vec2<f32>(horizOffset, 0.0);

    let colorR = textureSample(screenTexture, screenSampler, r_uv).r;
    let colorG = textureSample(screenTexture, screenSampler, finalUV).g;
    let colorB = textureSample(screenTexture, screenSampler, b_uv).b;
    let a = textureSample(screenTexture, screenSampler, finalUV).a;

    var rgb = vec3<f32>(colorR, colorG, colorB);

    // Scanlines
    let scanline = sin(finalUV.y * 800.0) * 0.04 * uniforms.intensity;
    rgb -= vec3<f32>(scanline);

    return vec4<f32>(rgb, a);
}
