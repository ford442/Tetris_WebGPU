export const ParticleComputeShader = `
struct Particle {
  pos : vec3<f32>,       // offset 0
  velocity : vec3<f32>,  // offset 16 (align 16)
  color : vec4<f32>,     // offset 32
  scale : f32,           // offset 48
  life : f32,            // offset 52
  maxLife : f32,         // offset 56
  // total size 64 bytes
};

struct Uniforms {
  deltaTime : f32,
  time : f32,
  shockwaveTimer : f32,
  pad1 : f32,
  shockwaveCenter : vec2<f32>,
  pad2 : vec2<f32>,
  shockwaveParams : vec4<f32>, // x:width, y:strength, z:aberration, w:speed
};

@group(0) @binding(0) var<storage, read_write> particles : array<Particle>;
@group(0) @binding(1) var<uniform> uniforms : Uniforms;

// 3D Noise function
fn noise3(p: vec3<f32>) -> vec3<f32> {
    let i = floor(p);
    let f = fract(p);

    // Simple gradient noise or value noise approximation
    // Here we use a simple sine-based perturbation for performance
    return vec3<f32>(
        sin(p.y * 10.0 + p.z * 5.0),
        sin(p.z * 10.0 + p.x * 5.0),
        sin(p.x * 10.0 + p.y * 5.0)
    );
}

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) GlobalInvocationID : vec3<u32>) {
  let index = GlobalInvocationID.x;
  if (index >= arrayLength(&particles)) {
    return;
  }

  var p = particles[index];

  // If particle is dead, skip processing (except maybe initialization if we had an emitter here)
  if (p.life <= 0.0) {
      return;
  }

  let dt = uniforms.deltaTime;
  let t = uniforms.time;

  // --- PHYSICS ---

  // 1. Gravity
  // JUICE: Gravity scales with life to simulate "weight" gaining over time
  // or "buoyancy" at start
  let gravity = vec3<f32>(0.0, -9.81 * 1.5, 0.0); // Stronger gravity
  p.velocity += gravity * dt;

  // 2. Drag (Air Resistance)
  // JUICE: Exponential drag for "poppy" movement
  let drag = exp(-2.0 * dt); // Damping factor
  p.velocity *= drag;

  // 3. Turbulence / Curl Noise
  // Adds swirling motion
  // JUICE: Turbulence frequency and strength
  let noiseScale = 0.5;
  let noiseStrength = 5.0;
  let turbulence = noise3(p.pos * noiseScale + t * 0.5) * noiseStrength;

  // Apply turbulence mostly to lighter particles (end of life)
  let lifeRatio = p.life / p.maxLife;
  p.velocity += turbulence * dt * (1.0 - lifeRatio);

  // 4. Floor Collision (Bounce)
  // Assuming floor is at y = -43.0
  if (p.pos.y < -43.0) {
      p.pos.y = -43.0;
      p.velocity.y *= -0.6; // Bounce with energy loss
      p.velocity.x *= 0.8; // Friction
      p.velocity.z *= 0.8;
  }

  // --- SHOCKWAVE INTERACTION (NEON BRICKLAYER) ---
  // Push particles away from shockwave center
  if (uniforms.shockwaveTimer > 0.0 && uniforms.shockwaveTimer < 1.0) {
       let swTime = uniforms.shockwaveTimer;
       let swParams = uniforms.shockwaveParams; // x:width, y:strength, z:aberration, w:speed

       // Approximate world center of shockwave
       // Screen Width ~ 40.0, Height ~ 50.0, Center(9.0, -20.0)
       let centerUV = uniforms.shockwaveCenter;
       let worldCenter = vec3<f32>(
           (centerUV.x - 0.5) * 40.0 + 9.0,
           (0.5 - centerUV.y) * 50.0 - 20.0,
           0.0
       );

       let distVec = p.pos - worldCenter;
       let dist = length(distVec);

       // Calculate shockwave radius in world units
       // Speed factor ~20.0 to match screen size
       let radius = swTime * max(swParams.w, 0.1) * 60.0;
       let width = swParams.x * 20.0; // Wave width

       let diff = abs(dist - radius);

       if (diff < width) {
           let dir = normalize(distVec);
           // JUICE: Impulse strength
           let strength = swParams.y * 500.0; // High impulse

           // Bell curve falloff for smooth interaction
           let falloff = 1.0 - smoothstep(0.0, width, diff);

           // Apply impulse
           p.velocity += dir * strength * falloff * dt;
       }
  }

  // --- UPDATE STATE ---
  p.pos += p.velocity * dt;
  p.life -= dt;

  // Scale animation
  // Poof out at death, Pop in at birth
  let normLife = p.life / p.maxLife;
  // Sine ease out
  p.scale = sin(normLife * 3.14159 * 0.5);

  // Clamp scale
  if (p.life < 0.0) {
      p.scale = 0.0;
      p.life = -1.0; // Mark as dead
  }

  // Write back
  particles[index] = p;
}
`;
