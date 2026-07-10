const fs = require('fs');

let content = fs.readFileSync('src/webgpu/viewGameEvents.ts', 'utf8');

content = content.replace(
  'levelUpCelebration.triggerLevelUpWebGPUFlash(view.visualEffects, view.currentTheme?.backgroundColors);',
  `levelUpCelebration.triggerLevelUpWebGPUFlash(view.visualEffects, view.currentTheme?.backgroundColors);
    view.visualEffects.triggerWarpSurge(5.0); // Epic background distortion
    view.visualEffects.triggerAberration(2.0); // Epic chromatic aberration
    view.visualEffects.triggerShake(5.0, 1.0); // Big screen shake`
);

fs.writeFileSync('src/webgpu/viewGameEvents.ts', content);
