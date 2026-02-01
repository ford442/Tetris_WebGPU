export const ParticleComputeShader = `
struct Particle {
  position: vec3<f32>,
  velocity: vec3<f32>,
  color: vec4<f32>,
  scale: f32,
  life: f32,
  maxLife: f32,
  pad1: f32,
};

struct Uniforms {
  deltaTime: f32,
  time: f32,
  shockwaveTimer: f32,
  pad1: f32,
  shockwaveCenter: vec2<f32>,
  pad2: vec2<f32>,
  shockwaveParams: vec4<f32>, // width, strength, aberration, speed
};

@group(0) @binding(0) var<storage, read_write> particles: array<Particle>;
@group(0) @binding(1) var<uniform> uniforms: Uniforms;

// Simple 3D noise (Pseudo-random based on position)
fn noise3(p: vec3<f32>) -> f32 {
    return fract(sin(dot(p, vec3<f32>(12.9898, 78.233, 45.164))) * 43758.5453);
}

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
  let index = id.x;
  if (index >= arrayLength(&particles)) {
    return;
  }

  var p = particles[index];

  if (p.life <= 0.0) {
    p.scale = 0.0;
    particles[index] = p;
    return;
  }

  let dt = uniforms.deltaTime;

  // Gravity
  p.velocity.y += -9.81 * dt;

  // Drag (Air Resistance)
  let drag = 0.98;
  p.velocity *= drag;

  // Turbulence
  let t = uniforms.time;
  let noiseVal = vec3<f32>(
     noise3(p.position * 0.1 + t) - 0.5,
     noise3(p.position * 0.1 + t + 100.0) - 0.5,
     noise3(p.position * 0.1 + t + 200.0) - 0.5
  );
  p.velocity += noiseVal * 10.0 * dt;

  // --- SHOCKWAVE INTERACTION ---
  if (uniforms.shockwaveTimer > 0.0 && uniforms.shockwaveTimer < 1.0) {
      // Map UV Center to World Space (Approximate)
      // Screen Width in World units at Z=0 is approx 40.0
      // Screen Height is approx 50.0
      // Center is (9.0, -20.0)
      let centerUV = uniforms.shockwaveCenter;
      let worldCenter = vec3<f32>(
          (centerUV.x - 0.5) * 40.0 + 9.0,
          (0.5 - centerUV.y) * 50.0 - 20.0,
          0.0
      );

      let dist = distance(p.position.xy, worldCenter.xy);

      // Radius expands over time
      // speed is usually ~2.0
      let radius = uniforms.shockwaveTimer * uniforms.shockwaveParams.w * 25.0;
      let width = uniforms.shockwaveParams.x * 20.0; // typically 0.15 * 20 = 3.0

      let diff = abs(dist - radius);

      if (diff < width) {
          // Push away from center
          let dir = normalize(p.position - worldCenter);
          // Strength fades over time
          let strength = uniforms.shockwaveParams.y * 300.0; // typically 0.08 * 300 = 24.0
          let impulse = dir * strength * dt * (1.0 - uniforms.shockwaveTimer);

          p.velocity += impulse;
      }
  }

  // Explosive radial force at start of life
  if (p.life > p.maxLife * 0.9) {
      p.velocity *= 1.05;
  }

  // Update Position
  p.position += p.velocity * dt;

  // Update Life
  p.life -= dt;

  // Update Scale (shrink over time)
  p.scale = (p.life / p.maxLife) * 0.5;
  if (p.scale < 0.0) { p.scale = 0.0; }

  particles[index] = p;
}
`;
