export function showFloatingText(view: any, text: string, subText: string = ""): void {
  const container = document.getElementById('ui-container');
  if (!container) return;

  const el = document.createElement('div');
  el.className = 'floating-text';
  el.style.left = '50%';
  el.style.top = '40%';

  let html = `<span class="main-text">${text}</span>`;
  if (subText) {
    html += `<br><span class="sub-text">${subText}</span>`;
  }
  el.innerHTML = html;

  if (text.includes("TETRIS")) el.classList.add("tetris");
  if (text.includes("T-SPIN")) el.classList.add("tspin");
  if (text.includes("COMBO")) el.classList.add("combo");

  container.appendChild(el);

  setTimeout(() => {
    el.remove();
  }, 2000);
}

export function onLineClear(view: any, lines: number[], tSpin: boolean = false, combo: number = 0, backToBack: boolean = false, isAllClear: boolean = false): void {
  // Enhanced flash based on number of lines
  const flashIntensity = Math.min(0.5 + lines.length * 0.25, 1.5);
  view.visualEffects.triggerFlash(flashIntensity);
  
  // Warp surge based on line count
  view.visualEffects.warpSurge = 1.0 + lines.length * 0.3 + (combo * 0.2);
  
  // Screen shake with more intensity for bigger clears
  const shakeBase = tSpin ? 1.0 : (0.3 + lines.length * 0.2);
  const shakeBonus = Math.min(combo * 0.15, 1.5);
  view.visualEffects.triggerShake(shakeBase + shakeBonus, tSpin ? 0.7 : 0.6);
  
  // Chromatic aberration for big clears
  if (lines.length >= 4 || tSpin || combo >= 3) {
    view.visualEffects.triggerAberration(0.3 + lines.length * 0.1);
  }

  lines.forEach((y: number) => {
    const worldY = y * -2.2;

    for (let i = 0; i < 5; i++) {
      const lx = Math.random() * 10.0 * 2.2;
      const angle = Math.random() * Math.PI * 2;
      view.particleSystem.emitParticlesRadial(lx, worldY, 0.0, angle, 30.0, [1.0, 1.0, 1.0, 1.0]);
    }

    for (let i = 0; i < 40; i++) {
      const angle = (i / 40.0) * Math.PI * 2.0;
      const speed = 20.0;
      view.particleSystem.emitParticlesRadial(11.0, worldY, 0.0, angle, speed, [1.0, 1.0, 1.0, 0.8]);
    }

    for (let c = 0; c < 10; c++) {
      const worldX = c * 2.2;

      let color = [0.0, 1.0, 1.0, 1.0];
      let count = 20 + (combo * 5);

      if (tSpin) {
        color = [1.0, 0.0, 1.0, 1.0];
        count = 150 + (combo * 25);
      } else if (lines.length === 4) {
        color = [0.0, 1.0, 1.0, 1.0];
        if (backToBack) {
          color = [1.0, 0.8, 0.0, 1.0];
        }
        count = 500 + (combo * 20);
      } else {
        const themeColor = view.currentTheme[Math.floor(Math.random() * 7) + 1] || [0.0, 1.0, 1.0];
        color = [...themeColor, 1.0];

        if (combo > 1) {
          color = [1.0, 0.5 * (1.0 / combo), 0.0, 1.0];
        }
      }

      if (backToBack) {
        count = Math.floor(count * 2.5);
      }

      view.particleSystem.emitParticles(worldX, worldY, 0.0, count, color);

      if (combo > 2 && c === 5) {
        for (let i = 0; i < 20 + combo * 5; i++) {
          const angle = Math.random() * Math.PI * 2;
          const speed = 15.0 + combo * 2.0;
          view.particleSystem.emitParticlesRadial(worldX, worldY, 0.0, angle, speed, [1.0, 0.2, 0.0, 1.0]);
        }
      }

      if (tSpin && c === 5) {
        for (let i = 0; i < 40; i++) {
          const angle = (i / 40) * Math.PI * 2;
          const speed = 25.0;
          view.particleSystem.emitParticlesRadial(worldX, worldY, 0.0, angle, speed, [1.0, 0.0, 1.0, 1.0]);
        }
        view.visualEffects.triggerShockwave([0.5, 0.5], 0.3, 0.15, 0.1, 3.0);
        view.visualEffects.triggerGlitch(0.5);
      }

      if (lines.length === 4 && c === 5) {
        view.visualEffects.triggerShockwave([0.5, 0.5], 0.4, 0.2, 0.1, 3.0);
      }
    }
  });

  if (isAllClear) {
    view.visualEffects.triggerShockwave([0.5, 0.5], 0.5, 0.3, 0.2, 4.0);
    view.visualEffects.triggerShake(1.5, 0.8);

    const centerX = 5.0 * 2.2;
    const centerY = 10.0 * -2.2;

    for (let i = 1; i <= 7; i++) {
      let color = view.currentTheme[i];
      if (!color) color = [1.0, 1.0, 1.0];
      const particleColor = [...color, 1.0];

      for (let p = 0; p < 50; p++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 10.0 + Math.random() * 25.0;
        view.particleSystem.emitParticlesRadial(centerX, centerY, 0.0, angle, speed, particleColor);
      }
    }
  }
}

export function onLock(view: any, isTSpin: boolean = false): void {
  view.visualEffects.triggerLock(0.3);
  view.visualEffects.triggerShake(isTSpin ? 0.5 : 0.2, 0.15);
  view.visualEffects.triggerShockwave([0.5, 0.5], isTSpin ? 0.35 : 0.2, isTSpin ? 0.15 : 0.1, 0.05, 2.5);
  
  if (isTSpin && view.state?.activePiece) {
    // Extra T-Spin lock effects
    const { x, y } = view.state.activePiece;
    const worldX = (x + 1) * 2.2;
    const worldY = (y + 1) * -2.2;
    
    // Purple burst at lock point
    for (let i = 0; i < 30; i++) {
      const angle = (i / 30) * Math.PI * 2;
      view.particleSystem.emitParticlesRadial(worldX, worldY, 0.0, angle, 20.0, [1.0, 0.0, 1.0, 1.0]);
    }
    
    // Flash effect
    view.visualEffects.triggerFlash(0.4);
    view.visualEffects.triggerAberration(0.3);
  }
}

export function onHold(view: any): void {
  view.visualEffects.triggerFlash(0.3);

  const centerX = 4.5 * 2.2;
  const centerY = -10.0 * 2.2;
  const color = [0.8, 0.0, 1.0, 1.0];

  for (let i = 0; i < 20; i++) {
    const angle = (i / 20) * Math.PI * 2;
    const speed = 15.0 + Math.random() * 10.0;
    view.particleSystem.emitParticlesRadial(centerX, centerY, 0.0, angle, speed, color);
  }

  view.particleSystem.emitParticles(centerX, centerY, 0.0, 10, [1.0, 1.0, 1.0, 1.0]);
}

export function onRotate(view: any): void {
  view.visualEffects.triggerRotate(0.2);

  if (view.state && view.state.activePiece) {
    const { x, y } = view.state.activePiece;
    const worldX = (x + 1.5) * 2.2;
    const worldY = (y + 1.5) * -2.2;
    for (let i = 0; i < 12; i++) {
      const angle = Math.random() * Math.PI * 2;
      view.particleSystem.emitParticlesRadial(worldX, worldY, 0.0, angle, 15.0, [0.8, 1.0, 1.0, 0.8]);
    }
  }
}

export function triggerImpactEffects(view: any, worldX: number, impactY: number, distance: number): void {
  const camY = -20.0;
  const camZ = 75.0;
  const fov = (35 * Math.PI) / 180;
  const visibleHeight = 2.0 * Math.tan(fov / 2.0) * camZ;
  const visibleWidth = visibleHeight * (view.canvasWebGPU.width / view.canvasWebGPU.height);

  const uvX = 0.5 + (worldX - 10.0) / visibleWidth;
  const uvY = 0.5 - (impactY - camY) / visibleHeight;

  const strength = 0.8 + Math.min(distance * 0.08, 0.7);
  const width = 0.4 + Math.min(distance * 0.04, 0.5);
  const aberration = 0.2 + Math.min(distance * 0.03, 0.5);
  const speed = 3.0 + Math.min(distance * 0.2, 2.0);

  view.visualEffects.triggerShockwave([uvX, uvY], width, strength, aberration, speed);
  view.visualEffects.warpSurge = 0.5 + Math.min(distance * 0.1, 1.0);
  view.visualEffects.triggerShake(6.0 + distance * 0.4, 0.4);
}

export function onHardDrop(view: any, x: number, y: number, distance: number, colorIdx: number = 0): void {
  const worldX = x * 2.2;
  const startRow = y - distance;

  const themeColors = view.currentTheme[colorIdx] || [0.4, 0.8, 1.0];
  const trailColor = [...themeColors, 0.8];

  for (let i = 0; i < distance * 2; i++) {
    const r = startRow + i * 0.5;
    const worldY = r * -2.2;
    view.particleSystem.emitParticles(worldX, worldY, 0.0, 12, trailColor);
  }

  const impactY = y * -2.2;
  const burstColor = [...themeColors, 1.0];
  view.visualEffects.triggerFlash(0.1);
  for (let i = 0; i < 150; i++) {
    const angle = (i / 150) * Math.PI * 2;
    const speed = 20.0 + Math.random() * 10.0;
    view.particleSystem.emitParticlesRadial(worldX, impactY, 0.0, angle, speed, burstColor);
  }

  for (let i = 0; i < 20; i++) {
    const speedL = 8.0 + Math.random() * 12.0;
    const angleL = Math.PI - Math.random() * 0.5;
    view.particleSystem.emitParticlesRadial(worldX, impactY, 0.0, angleL, speedL, burstColor);

    const speedR = 8.0 + Math.random() * 12.0;
    const angleR = Math.random() * 0.5;
    view.particleSystem.emitParticlesRadial(worldX, impactY, 0.0, angleR, speedR, burstColor);
  }

  for (let i = 0; i < 60; i++) {
    const angle = (i / 60.0) * Math.PI * 2.0;
    const speed = 45.0;
    view.particleSystem.emitParticlesRadial(worldX, impactY, 0.0, angle, speed, burstColor);
  }

  for (let i = 0; i < 20; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 30.0 + Math.random() * 30.0;
    view.particleSystem.emitParticlesRadial(worldX, impactY, 0.0, angle, speed, [1.0, 1.0, 0.8, 1.0]);
  }

  for (let i = 0; i < 40; i++) {
    const angle = (i / 40) * Math.PI * 2 + (Math.PI / 40);
    const speed = 30.0;
    view.particleSystem.emitParticlesRadial(worldX, impactY, 0.0, angle, speed, burstColor);
  }

  for (let i = 0; i < 20; i++) {
    const dir = i % 2 === 0 ? 1 : -1;
    const speed = 20.0 + Math.random() * 20.0;
    const angle = (dir > 0 ? 0 : Math.PI) + (Math.random() - 0.5) * 0.2;
    view.particleSystem.emitParticlesRadial(worldX, impactY, 0.0, angle, speed, burstColor);
  }

  triggerImpactEffects(view, worldX, impactY, distance);
}

import { levelUpCelebration } from '../effects/levelUpCelebration.js';

export function renderMainScreen(view: any, state: any): void {
  view.state = state;

  // Handle T-Spin Ready indicator
  const tSpinIndicator = document.getElementById('tspin-indicator');
  if (tSpinIndicator) {
    if (state.isTSpinReady && !state.isGameOver) {
      tSpinIndicator.classList.add('active');
      // Trigger particles occasionally while T-Spin is ready
      if (Math.random() < 0.1 && state.activePiece) {
        const { x, y } = state.activePiece;
        const worldX = (x + 1) * 2.2;
        const worldY = (y + 1) * -2.2;
        view.particleSystem.emitParticlesRadial(worldX, worldY, 0.0, Math.random() * Math.PI * 2, 10.0, [1.0, 0.0, 1.0, 0.8]);
      }
    } else {
      tSpinIndicator.classList.remove('active');
    }
  }

  if (state.level !== view.visualEffects.currentLevel) {
    const oldLevel = view.visualEffects.currentLevel;
    view.visualEffects.currentLevel = state.level;
    
    // Get level config for enhanced effects
    const config = levelUpCelebration.getLevelConfig(state.level);
    
    // Trigger enhanced level up effects
    view.visualEffects.triggerLevelUp(state.level);
    view.visualEffects.updateVideoForLevel(view.visualEffects.currentLevel, view.currentTheme.levelVideos);
    
    // Show floating text with level color
    showFloatingText(view, `LEVEL ${state.level}!`, "WARP SPEED");
    
    // Create big level up overlay for significant levels (every 5 levels or first level up)
    if (state.level === 1 || state.level % 5 === 0 || state.level > oldLevel + 1) {
      levelUpCelebration.addLevelUpStyles();
      levelUpCelebration.createLevelUpOverlay(state.level);
    }

    // Enhanced particle burst with level colors
    const centerX = 5.0 * 2.2;
    const centerY = 10.0 * -2.2;
    
    // Parse colors for particle system
    const hexToRgb = (hex: string) => {
      const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
      return result ? [
        parseInt(result[1], 16) / 255,
        parseInt(result[2], 16) / 255,
        parseInt(result[3], 16) / 255,
        1.0
      ] : [1.0, 1.0, 1.0, 1.0];
    };
    
    const primaryColor = hexToRgb(config.primaryColor);
    const secondaryColor = hexToRgb(config.secondaryColor);
    
    // Primary color burst
    for (let i = 0; i < config.particleCount; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 25.0 + Math.random() * 40.0;
      view.particleSystem.emitParticlesRadial(centerX, centerY, 0.0, angle, speed, primaryColor);
    }
    
    // Secondary color burst (offset)
    for (let i = 0; i < config.particleCount / 2; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 15.0 + Math.random() * 30.0;
      view.particleSystem.emitParticlesRadial(centerX, centerY, 0.0, angle, speed, secondaryColor);
    }
    
    // Ring explosions
    for (let ring = 0; ring < 3; ring++) {
      setTimeout(() => {
        for (let i = 0; i < 40; i++) {
          const angle = (i / 40) * Math.PI * 2;
          const speed = 30.0 + ring * 15.0;
          view.particleSystem.emitParticlesRadial(centerX, centerY, 0.0, angle, speed, ring % 2 === 0 ? primaryColor : secondaryColor);
        }
      }, ring * 100);
    }
  }

  if (state.scoreEvent) {
    if (state.effectCounter !== view.lastEffectCounter && state.scoreEvent.text) {
      showFloatingText(view, state.scoreEvent.text, state.scoreEvent.points > 0 ? `+${state.scoreEvent.points}` : "");

      if (state.scoreEvent.backToBack) {
        view.visualEffects.triggerGlitch(0.3);
      }

      view.lastEffectCounter = state.effectCounter;
    }

    if (view.lastScore !== state.score && state.scoreEvent.text) {
      showFloatingText(view, state.scoreEvent.text, state.scoreEvent.points > 0 ? `+${state.scoreEvent.points}` : "");
      view.lastScore = state.score;
    }
  }

  view.renderPlayfild_WebGPU(state);
  view.renderPiece(view.nextPieceContext, state.nextPiece, 30);
  view.renderPiece(view.holdPieceContext, state.holdPiece, 20);

  const scoreEl = document.getElementById('score');
  if (scoreEl) scoreEl.textContent = state.score;

  const linesEl = document.getElementById('lines');
  if (linesEl) linesEl.textContent = state.lines;

  const levelEl = document.getElementById('level');
  if (levelEl) levelEl.textContent = state.level;
}

import { gameOverAnimation } from '../effects/gameOverAnimation.js';

export function renderEndScreen(view: any, state: any): void {
  // Add styles first
  gameOverAnimation.addGameOverStyles();
  
  // Trigger dramatic visual effects
  gameOverAnimation.triggerGameOverEffects(view);
  
  // Get high score info
  const highScoreManager = view.game?.getHighScoreManager?.();
  const highScore = highScoreManager?.getHighestScore?.();
  const isNewHighScore = highScoreManager && state.score > 0 && state.score >= (highScore?.score || 0);
  
  // Create enhanced overlay
  setTimeout(() => {
    const overlay = gameOverAnimation.createGameOverOverlay({
      score: state.score,
      lines: state.lines,
      level: state.level,
      highScore: highScore?.score || 0,
      isNewHighScore
    });
    
    // Wire up buttons
    const retryBtn = document.getElementById('game-over-retry');
    const menuBtn = document.getElementById('game-over-menu');
    
    if (retryBtn) {
      retryBtn.addEventListener('click', () => {
        overlay.remove();
        view.controller?.reset?.();
      });
    }
    
    if (menuBtn) {
      menuBtn.addEventListener('click', () => {
        overlay.remove();
        // Could navigate to menu here
        location.reload();
      });
    }
  }, 800); // Delay to let effects play
}

export function renderPauseScreen(view: any): void {
  // Pause screen is handled by DOM overlay
  // Visual effects could be added here (e.g., dim the board)
}

export function onMove(view: any, x: number, y: number): void {
  const worldX = (x + 1.5) * 2.2;
  const worldY = (y + 1.5) * -2.2;
  // JUICE: Denser, brighter trail for better feedback
  view.particleSystem.emitParticles(worldX, worldY, 0.0, 10, [0.6, 1.0, 1.0, 1.0]);
}
