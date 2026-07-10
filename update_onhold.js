const fs = require('fs');

let content = fs.readFileSync('src/webgpu/viewGameEvents.ts', 'utf8');

content = content.replace(
  'export function onHold(view: any): void {',
  `export function onHold(view: any): void {
  // Emits a particle burst at the top left to represent the hold piece swapping
  if (view.particleSystem) {
      view.particleSystem.emitParticlesRadial(-5.0, 20.0, 0.0, Math.PI / 4, 25.0, [1.0, 0.8, 0.2, 1.0]);
  }`
);

fs.writeFileSync('src/webgpu/viewGameEvents.ts', content);
