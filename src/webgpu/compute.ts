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
    // Optionally reset/hide dead particles to prevent ghosting or re-processing?
    // For now, just setting scale to 0 is enough visual cleanup.
    p.scale = 0.0;
    particles[index] = p; // Write back to ensure it stays hidden
    return;
  }

  let dt = uniforms.deltaTime;

  // Gravity
  p.velocity.y += -9.81 * dt; // Gravity

  // Drag (Air Resistance)
  let drag = 0.98;
  p.velocity *= drag;

  // Turbulence
  // We use simple noise offset by time
  let t = uniforms.time;
  let noiseVal = vec3<f32>(
     noise3(p.position * 0.1 + t) - 0.5,
     noise3(p.position * 0.1 + t + 100.0) - 0.5,
     noise3(p.position * 0.1 + t + 200.0) - 0.5
  );
  p.velocity += noiseVal * 10.0 * dt; // Strength of turbulence

  // Explosive radial force at start of life
  if (p.life > p.maxLife * 0.9) {
      p.velocity *= 1.05; // Accelerate initially
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
