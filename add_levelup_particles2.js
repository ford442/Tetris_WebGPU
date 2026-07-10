const fs = require('fs');

let content = fs.readFileSync('src/webgpu/viewGameEvents.ts', 'utf8');

content = content.replace(
  '    // Secondary color burst (offset)',
  `    // Epic radial speed lines for Level Up
    for (let i = 0; i < config.particleCount * 0.5; i++) {
      const isPrimary = Math.random() > 0.5;
      const rgb = isPrimary ? primaryColor : secondaryColor;
      const particleColor = rgb ? [...rgb] : [1.0, 1.0, 1.0, 1.0];

      const angle = Math.random() * Math.PI * 2;
      const speed = 50.0 + Math.random() * 50.0; // Much faster for speed lines
      view.particleSystem.emitParticlesRadial(centerX, centerY, 0.0, angle, speed, particleColor);
    }

    // Secondary color burst (offset)`
);

fs.writeFileSync('src/webgpu/viewGameEvents.ts', content);
