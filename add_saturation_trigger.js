const fs = require('fs');
let content = fs.readFileSync('src/webgpu/viewGameEvents.ts', 'utf8');

content = content.replace(
  '  view.visualEffects.triggerNeonBloomFlash(2.5 + combo * 0.3);',
  '  view.visualEffects.triggerNeonBloomFlash(2.5 + combo * 0.3);\n  view.visualEffects.triggerSaturationBoost(1.5 + combo * 0.5);'
);

content = content.replace(
  '  view.visualEffects.triggerWarpSurge(4.0 + combo * 1.0);',
  '  view.visualEffects.triggerWarpSurge(4.0 + combo * 1.0);\n  view.visualEffects.triggerSaturationBoost(0.8 + combo * 0.2);'
);

content = content.replace(
  '  // JUICE: Supernova Line Clear Laser',
  '  if (lines.length >= 4 || tSpin) {\n    view.visualEffects.triggerSaturationBoost(1.5);\n    view.visualEffects.triggerHardDropAberrationPulse(1.5);\n  }\n\n  // JUICE: Supernova Line Clear Laser'
);

fs.writeFileSync('src/webgpu/viewGameEvents.ts', content);
