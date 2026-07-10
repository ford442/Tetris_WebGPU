const fs = require('fs');
let content = fs.readFileSync('src/webgpu/effects.ts', 'utf8');

content = content.replace(
  '    neonBloomBaseIntensity: number = 1.0;',
  '    neonBloomBaseIntensity: number = 1.0;\n\n    // Line Clear Escalation state\n    saturationBoost: number = 0;'
);

content = content.replace(
  '        // Glitch decay',
  '        // Saturation Boost decay\n        this.saturationBoost *= Math.exp(-dt * 2.0);\n        if (this.saturationBoost < 0.01) this.saturationBoost = 0;\n\n        // Glitch decay'
);

content = content.replace(
  '    triggerNeonBloomFlash(strength: number = 1.0): void {',
  '    triggerSaturationBoost(strength: number = 1.0): void {\n        this.saturationBoost += strength;\n        this.saturationBoost = Math.min(this.saturationBoost, 3.0);\n    }\n\n    triggerNeonBloomFlash(strength: number = 1.0): void {'
);

fs.writeFileSync('src/webgpu/effects.ts', content);
