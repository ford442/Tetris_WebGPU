import type { GameState } from '../game/gameState.js';
import type { ViewEventHost } from '../view/viewTypes.js';
import { renderNextQueue } from './viewMaterials.js';
import { formatShareScoreString } from '../game/runStats.js';

export function showFloatingText(_view: ViewEventHost, text: string, subText: string = ""): void {
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

  if (subText === "OVERDRIVE") {
      el.classList.add("combo");

      const match = text.match(/COMBO x(\d+)/);
      let comboCount = match && match[1] ? parseInt(match[1]) : 5;

      if (comboCount >= 2) {
          const scale = 1 + Math.min(comboCount * 0.15, 2.0);
          el.style.transform = `translate(-50%, -50%) scale(${scale})`;
          el.style.color = comboCount >= 5 ? '#ff00ff' : '#00ffff';
          el.style.textShadow = `0 0 10px #fff, 0 0 20px ${el.style.color}, 0 0 30px ${el.style.color}`;
          el.style.transition = 'transform 0.1s ease-out, top 1.8s ease-in, opacity 1.8s ease-in';

          // Force reflow
          void el.offsetWidth;

          setTimeout(() => {
              el.style.top = '10%'; // Rise up faster
              el.style.opacity = '0';
          }, 50);
      }
  } else if (text.includes("COMBO")) {
      el.classList.add("combo");
  }

  container.appendChild(el);

  setTimeout(() => {
    el.remove();
  }, 2000);
}

export function triggerComboOverdrive(view: ViewEventHost, combo: number): void {
  view.visualEffects.triggerNeonBloomFlash(2.5 + combo * 0.3);
  view.visualEffects.triggerSaturationBoost(1.5 + combo * 0.5);
  view.visualEffects.triggerSaturationBoost(1.5 + combo * 0.5);
  view.visualEffects.triggerBlackHole([0.5, 0.5]); // short duration pull
}

export function triggerEnergyWave(view: ViewEventHost, combo: number): void {
  view.visualEffects.triggerWarpSurge(4.0 + combo * 1.0);
  view.visualEffects.triggerSaturationBoost(0.8 + combo * 0.2);
  view.visualEffects.triggerSaturationBoost(0.8 + combo * 0.2);
  view.visualEffects.triggerAberration(1.5 + combo * 0.3);
  view.visualEffects.triggerHardDropAberrationPulse(1.5);
}

export function showFloatingComboText(view: ViewEventHost, combo: number): void {
  // Use existing floating text system but force higher intensity styling via JS injected classes/styles
  // The system relies on view.showFloatingText which passes to showFloatingText
  view.showFloatingText(`COMBO x${combo}`, "OVERDRIVE");
}

export function onLineClear(view: ViewEventHost, lines: number[], tSpin: boolean = false, combo: number = 0, backToBack: boolean = false, isAllClear: boolean = false): void {

  const base = 0.45;
  const lineBonus = Math.min(lines.length * 0.12, 0.35);
  const specialBonus = (tSpin || backToBack) ? 0.15 : 0;
  const comboBonus = Math.min(combo * 0.03, 0.12);

  const strength = Math.min(base + lineBonus + specialBonus + comboBonus, 0.95);
  view.visualEffects.triggerLineClearFlash(strength);

  // New Combo Celebration System
  if (combo >= 2) {
    showFloatingComboText(view, combo);
  }

  if (combo >= 3) {
    view.visualEffects.triggerShockwave([0.5, 0.5], 0.4 + combo * 0.05, 0.3 + combo * 0.1, 0.2 + combo * 0.05, 4.0 + combo * 0.5);
    view.visualEffects.triggerShake(0.8 + 0.4 * combo, 0.6);
  }

  if (combo >= 4) {
    triggerEnergyWave(view, combo);
  }

  if (combo >= 5 || isAllClear) {
    triggerComboOverdrive(view, combo);
  }


  const camY = -20.0;
  const camZ = 75.0;
  const fov = (35 * Math.PI) / 180;
  const visibleHeight = 2.0 * Math.tan(fov / 2.0) * camZ;

  const midY = lines[Math.floor(lines.length / 2)] * -2.2;
  const uvY = 0.5 - (midY - camY) / visibleHeight;

  // BALANCED FLASH INTENSITY - Prevents blinding while maintaining satisfying feedback
  //
  // DESIGN RATIONALE:
  // - Previous max of 1.5 was too bright when combined with bloom post-processing
  // - New max of 0.85 provides ~43% reduction in peak intensity
  // - Scaling: 0.15 per line gives meaningful differentiation between 1-4 line clears
  // - 4-line Tetris still feels special at 0.85 vs 1-line at 0.4 (2.1x multiplier)
  //
  // INTENSITY BREAKDOWN:
  // - 1 line:  0.25 + 0.15 = 0.40  (subtle but noticeable)
  // - 2 lines: 0.25 + 0.30 = 0.55  (clearly stronger)
  // - 3 lines: 0.25 + 0.45 = 0.70  (very satisfying)
  // - 4 lines: 0.25 + 0.60 = 0.85  (Tetris! - capped, impressive but not blinding)
  const flashIntensity = Math.min(0.25 + lines.length * 0.15, 0.85);
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

  // JUICE: Supernova Line Clears
  // Variable neonBloomIntensity spike based on event importance.
  let bloomIntensity = 0.7;
  if (lines.length >= 4 || tSpin || combo >= 5) {
    bloomIntensity = 2.0;
    // Trigger Black Hole on Tetris or huge clears
    if (lines.length >= 4) {
      // Epicenter is the middle of the cleared lines
      const midY = lines[Math.floor(lines.length / 2)] * -2.2;
      const uvY = (Math.abs(midY) + 2.2) / 44.0;
      view.visualEffects.triggerBlackHole([0.5, uvY]);
    }
  } else if (lines.length === 2 || lines.length === 3) {
    bloomIntensity = 1.3;
  }
  view.visualEffects.triggerNeonBloomFlash(bloomIntensity);
  view.visualEffects.triggerParticleHit(1.0 + lines.length * 0.5);

  if (lines.length >= 4 || tSpin) {
    view.visualEffects.triggerSaturationBoost(1.5);
    view.visualEffects.triggerHardDropAberrationPulse(1.5);
  }

  if (lines.length >= 4 || tSpin) {
    view.visualEffects.triggerSaturationBoost(1.5);
    view.visualEffects.triggerHardDropAberrationPulse(1.5);
  }

  // JUICE: Supernova Line Clear Laser
  // Trigger a localized horizontal laser/plasma beam exactly on the cleared rows
  view.visualEffects.triggerLineClearLaser(lines, 1.0 + lines.length * 0.5);

  // JUICE: Warp Surge on Big Plays
  // If it's a Tetris or T-Spin, heavily distort the background hyperspace tunnel.
  if (lines.length >= 4 || tSpin) {
    view.visualEffects.triggerWarpSurge(2.0 + lines.length * 0.5);
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
        const camY = -20.0;
        const camZ = 75.0;
        const fov = (35 * Math.PI) / 180;
        const visibleHeight = 2.0 * Math.tan(fov / 2.0) * camZ;
        const uvY = 0.5 - (worldY - camY) / visibleHeight;
        view.visualEffects.triggerShockwave([0.5, uvY], 0.3, 0.15, 0.1, 3.0);
        view.visualEffects.triggerGlitch(0.5);
      }

      if (lines.length === 4 && c === 5) {
        const camY = -20.0;
        const camZ = 75.0;
        const fov = (35 * Math.PI) / 180;
        const visibleHeight = 2.0 * Math.tan(fov / 2.0) * camZ;
        const uvY = 0.5 - (worldY - camY) / visibleHeight;
        view.visualEffects.triggerShockwave([0.5, uvY], 0.4, 0.2, 0.1, 3.0);
      }
    }
  });

  // =====================================================================
  // SHARP SHARD BURST (directional elongated spinning shards from cleared rows)
  // Uses extended ParticleSystem + LineClearAnimator (with color snapshot support).
  // Shards burst outward (horizontal +/-X from board center per column), carry
  // authentic block colors when available, high speed -> shader stretch = thin shards,
  // 0.6s life, visual spin from dynamics + existing sparkle. Wired in onLineClear.
  // =====================================================================
  {
    const snapshot: number[][] | null = view.state?.playfield ? [] : null;
    if (snapshot && view.state?.playfield) {
      const playfield = view.state.playfield;
      for (const y of lines) {
        if (y >= 0 && y < playfield.length) {
          snapshot.push([...playfield[y]]);
        } else {
          snapshot.push(new Array(10).fill(0));
        }
      }
    }

    // Exercise the extended triggerLineClear API (now accepts rowColorSnapshots)
    lineClearAnimator.triggerLineClear(lines, undefined, snapshot || undefined);

    // Emit the colored directional shards (the core new effect)
    if (view.particleSystem && typeof view.particleSystem.emitLineClearShards === 'function') {
      const getWorldY = (r: number) => r * -2.2;
      view.particleSystem.emitLineClearShards(lines, snapshot, view.currentTheme, getWorldY);
    }
  }

  if (isAllClear) {
    // Average Y of all cleared lines
    const avgWorldY = (lines.reduce((sum, y) => sum + y, 0) / lines.length) * -2.2;
    const camY = -20.0;
    const camZ = 75.0;
    const fov = (35 * Math.PI) / 180;
    const visibleHeight = 2.0 * Math.tan(fov / 2.0) * camZ;
    const uvY = 0.5 - (avgWorldY - camY) / visibleHeight;
    view.visualEffects.triggerShockwave([0.5, uvY], 0.5, 0.3, 0.2, 4.0);
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

export function onLock(view: ViewEventHost, isTSpin: boolean = false): void {
  view.visualEffects.triggerLock(0.3);
  view.visualEffects.triggerShake(isTSpin ? 0.5 : 0.2, 0.15);
  // JUICE: Chromatic Aberration on regular locks to make every placement tactile
  view.visualEffects.triggerAberration(isTSpin ? 1.0 : 0.5);

  if (view.state?.activePiece) {
    const { x, y } = view.state.activePiece;
    const worldX = (x + 1.5) * 2.2;
    const worldY = (y + 1.5) * -2.2;

    // NEW: emit radial ripple on grid from the just-locked piece position (last-locked block area)
    view.visualEffects.triggerGridRipple(worldX, worldY);

    const camY = -20.0;
    const camZ = 75.0;
    const fov = (35 * Math.PI) / 180;
    const visibleHeight = 2.0 * Math.tan(fov / 2.0) * camZ;
    const visibleWidth = visibleHeight * (view.canvasWebGPU.width / view.canvasWebGPU.height);

    const uvX = 0.5 + (worldX - 10.0) / visibleWidth;
    const uvY = 0.5 - (worldY - camY) / visibleHeight;

    view.visualEffects.triggerShockwave([uvX, uvY], isTSpin ? 0.35 : 0.2, isTSpin ? 0.15 : 0.1, 0.05, 2.5);
  } else {
    view.visualEffects.triggerShockwave([0.5, 0.5], isTSpin ? 0.35 : 0.2, isTSpin ? 0.15 : 0.1, 0.05, 2.5);
  }
  
  if (isTSpin && view.state?.activePiece) {
    // Extra T-Spin lock effects
    view.visualEffects.triggerNeonBloomFlash(2.0); // JUICE: Boom!
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
    view.visualEffects.triggerNeonBloomFlash(2.0); // JUICE: Explode with neon bloom on T-Spin lock
  }
}

export function onHold(view: ViewEventHost): void {
  // Emits a particle burst at the top left to represent the hold piece swapping
  if (view.particleSystem) {
      view.particleSystem.emitParticlesRadial(-5.0, 20.0, 0.0, Math.PI / 4, 25.0, [1.0, 0.8, 0.2, 1.0]);
  }
  view.visualEffects.triggerFlash(0.3);
  // Add a subtle warp/aberration glitch to simulate "teleportation"
  view.visualEffects.triggerAberration(0.3);
  view.visualEffects.triggerGlitch(0.2);

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

export function onRotate(view: ViewEventHost): void {
  view.visualEffects.triggerRotate(0.2);
  view.visualEffects.triggerAberration(0.3); // Add tactile visual bump
  view.visualEffects.triggerMovementFlash(0.15);

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

export function triggerImpactEffects(view: ViewEventHost, worldX: number, impactY: number, distance: number): void {
  const camY = -20.0;
  const camZ = 75.0;
  const fov = (35 * Math.PI) / 180;
  const visibleHeight = 2.0 * Math.tan(fov / 2.0) * camZ;
  const visibleWidth = visibleHeight * (view.canvasWebGPU.width / view.canvasWebGPU.height);

  const uvX = 0.5 + (worldX - 10.0) / visibleWidth;
  const uvY = 0.5 - (impactY - camY) / visibleHeight;

  // JUICE: Doubled shockwave strength and width, massively amplified aberration and speed for heavier impacts
  const strength = (5.0 + Math.min(distance * 0.3, 1.5)) * 2.5;
  const width = (2.5 + Math.min(distance * 0.2, 0.8)) * 2.5;
  const aberration = (1.0 + Math.min(distance * 0.1, 1.0)) * 3.0; // NEON BRICKLAYER: Hyper aberration
  const speed = (7.0 + Math.min(distance * 0.4, 4.0)) * 1.5;      // NEON BRICKLAYER: Faster ripple expansion

  view.visualEffects.triggerShockwave([uvX, uvY], width, strength, aberration, speed);
  view.visualEffects.warpSurge = 1.0 + Math.min(distance * 0.3, 2.0);
  // NEON BRICKLAYER: Slightly heavier camera shake
  view.visualEffects.triggerShake((8.0 + distance * 0.5) * 1.5, 0.5);
}

import { loadGameSettings } from '../config/gameSettings.js';

export function onHardDrop(view: ViewEventHost, x: number, y: number, distance: number, colorIdx: number = 0): void {
  const worldX = x * 2.2;
  const startRow = y - distance;

  if (loadGameSettings().ghostDropTrail && view.visualEffects && distance > 0) {
    const snap = view.game?.getHardDropSnapshot?.();
    if (snap) {
      view.visualEffects.triggerHardDropTrail(
        startRow,
        y,
        snap.x,
        snap.blocks,
        colorIdx,
        0.35 + Math.min(distance * 0.02, 0.25),
      );
    }
  }

  const themeColors = view.currentTheme[colorIdx] || [0.4, 0.8, 1.0];
  const trailColor = [...themeColors, 0.8];

  // JUICE: Increased particle count and trail density
  for (let i = 0; i < distance * 6; i++) {
    const r = startRow + i * 0.33;
    const worldY = r * -2.2;
    view.particleSystem.emitParticles(worldX, worldY, 0.0, 36, trailColor);
  }

  const impactY = y * -2.2;
  const burstColor = [...themeColors, 1.0];
  view.visualEffects.triggerFlash(0.1);
  view.visualEffects.triggerAberration(1.5); // JUICE: Heavy chromatic aberration on hard drop
  view.visualEffects.triggerHardDropAberrationPulse(1.2); // NEW: 300ms exp decay spike -> u_aberrationPulse uniform (separate RGB offsets in enhancedPostProcess)
  view.visualEffects.triggerNeonBloomFlash(3.0); // JUICE: Explode with neon bloom on hard drop
  view.visualEffects.triggerParticleHit(2.0);
  if (view.neonBurstUniform) view.neonBurstUniform[0] = 1.0;

  // JUICE: Multiplied particle speeds and counts by 3.0x for heavier impact
  for (let i = 0; i < 450; i++) {
    const angle = (i / 450) * Math.PI * 2;
    const speed = (20.0 + Math.random() * 10.0) * 3.0;
    view.particleSystem.emitParticlesRadial(worldX, impactY, 0.0, angle, speed, burstColor);
  }

  for (let i = 0; i < 30; i++) {
    const speedL = (8.0 + Math.random() * 12.0) * 3.0;
    const angleL = Math.PI - Math.random() * 0.5;
    view.particleSystem.emitParticlesRadial(worldX, impactY, 0.0, angleL, speedL, burstColor);

    const speedR = (8.0 + Math.random() * 12.0) * 3.0;
    const angleR = Math.random() * 0.5;
    view.particleSystem.emitParticlesRadial(worldX, impactY, 0.0, angleR, speedR, burstColor);
  }

  for (let i = 0; i < 90; i++) {
    const angle = (i / 90.0) * Math.PI * 2.0;
    const speed = 45.0 * 3.0;
    view.particleSystem.emitParticlesRadial(worldX, impactY, 0.0, angle, speed, burstColor);
  }

  for (let i = 0; i < 30; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = (30.0 + Math.random() * 30.0) * 3.0;
    view.particleSystem.emitParticlesRadial(worldX, impactY, 0.0, angle, speed, [1.0, 1.0, 0.8, 1.0]);
  }

  for (let i = 0; i < 60; i++) {
    const angle = (i / 60) * Math.PI * 2 + (Math.PI / 60);
    const speed = 30.0 * 2.0;
    view.particleSystem.emitParticlesRadial(worldX, impactY, 0.0, angle, speed, burstColor);
  }

  for (let i = 0; i < 30; i++) {
    const dir = i % 2 === 0 ? 1 : -1;
    const speed = (20.0 + Math.random() * 20.0) * 2.0;
    const angle = (dir > 0 ? 0 : Math.PI) + (Math.random() - 0.5) * 0.2;
    view.particleSystem.emitParticlesRadial(worldX, impactY, 0.0, angle, speed, burstColor);
  }

  triggerImpactEffects(view, worldX, impactY, distance);
}

import { levelUpCelebration } from '../effects/levelUpCelebration.js';

export function renderMainScreen(view: ViewEventHost, state: GameState): void {
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
    if (view.useReactiveVideo && view.reactiveVideoBackground) {
      view.reactiveVideoBackground.updateForLevel(state.level);
    }

    // WebGPU-side fullscreen additive color-burn flash (400ms, theme backgroundColors[0])
    levelUpCelebration.triggerLevelUpWebGPUFlash(view.visualEffects, view.currentTheme?.backgroundColors);
    view.visualEffects.triggerWarpSurge(5.0); // Epic background distortion
    view.visualEffects.triggerAberration(2.0); // Epic chromatic aberration
    view.visualEffects.triggerShake(5.0, 1.0); // Big screen shake
    
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
    
    // Epic radial speed lines for Level Up
    for (let i = 0; i < config.particleCount * 0.5; i++) {
      const isPrimary = Math.random() > 0.5;
      const rgb = isPrimary ? primaryColor : secondaryColor;
      const particleColor = rgb ? [...rgb] : [1.0, 1.0, 1.0, 1.0];

      const angle = Math.random() * Math.PI * 2;
      const speed = 50.0 + Math.random() * 50.0; // Much faster for speed lines
      view.particleSystem.emitParticlesRadial(centerX, centerY, 0.0, angle, speed, particleColor);
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
    if (state.effectCounter !== view.lastEffectCounter && state.scoreEvent?.text) {
      showFloatingText(view, state.scoreEvent.text, state.scoreEvent.points > 0 ? `+${state.scoreEvent.points}` : "");

      if (state.scoreEvent.backToBack) {
        view.visualEffects.triggerGlitch(0.3);
      }

      view.lastEffectCounter = state.effectCounter;
    }

    if (view.lastScore !== state.score && state.scoreEvent?.text) {
      showFloatingText(view, state.scoreEvent.text, state.scoreEvent.points > 0 ? `+${state.scoreEvent.points}` : "");
      view.lastScore = state.score;
    }
  }

  view.renderPlayfield_WebGPU(state);
  const queue = state.nextQueue?.length ? state.nextQueue : [state.nextPiece];
  if (queue.length > 1) {
    renderNextQueue(view.nextPieceContext, queue, view.currentTheme, queue.length <= 3 ? 20 : 16);
  } else {
    view.renderPiece(view.nextPieceContext, state.nextPiece, 22);
  }
  view.renderPiece(view.holdPieceContext, state.holdPiece, 20);

  const scoreEl = document.getElementById('score');
  if (scoreEl) scoreEl.textContent = String(state.score);

  const linesEl = document.getElementById('lines');
  if (linesEl) linesEl.textContent = String(state.lines);

  const levelEl = document.getElementById('level');
  if (levelEl) levelEl.textContent = String(state.level);
}

import { gameOverAnimation } from '../effects/gameOverAnimation.js';
import { lineClearAnimator } from '../effects/lineClearAnimation.js';

export function renderEndScreen(view: ViewEventHost, state: GameState): void {
  gameOverAnimation.addGameOverStyles();
  gameOverAnimation.triggerGameOverEffects(view);

  const mode = view.game?.getMode?.();
  const modeBoard = mode && view.game?.getModeLeaderboardDisplay
    ? view.game.getModeLeaderboardDisplay()
    : null;
  const legacyHigh = view.game?.getHighScoreManager?.()?.getHighestScore?.();
  const metric = mode?.getLeaderboardMetric() ?? 'score';
  const bestNumeric = mode
    ? parseLeaderboardDisplay(modeBoard, metric)
    : (legacyHigh?.score || 0);

  const runValue = metric === 'time' ? state.elapsedMs : state.score;
  const isNewHighScore = metric === 'time'
    ? Boolean(runValue > 0 && (bestNumeric === 0 || runValue <= bestNumeric))
    : Boolean(runValue > 0 && (bestNumeric === 0 || runValue >= bestNumeric));

  setTimeout(() => {
    const overlay = gameOverAnimation.createGameOverOverlay({
      score: state.score,
      lines: state.lines,
      level: state.level,
      highScore: bestNumeric,
      isNewHighScore,
      isVictory: state.isVictory,
      modeLabel: state.modeLabel,
      modeHighScoreLabel: state.modeHighScoreLabel,
      elapsedMs: state.elapsedMs,
      metric,
      runStats: state.runStats,
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
        location.reload();
      });
    }

    const shareBtn = document.getElementById('game-over-share');
    if (shareBtn) {
      shareBtn.addEventListener('click', async () => {
        const text = formatShareScoreString({
          modeLabel: state.modeLabel,
          score: state.score,
          lines: state.lines,
          level: state.level,
          stats: state.runStats,
          isVictory: state.isVictory,
        });
        try {
          await navigator.clipboard.writeText(text);
          shareBtn.textContent = 'COPIED!';
          setTimeout(() => { shareBtn.textContent = 'SHARE SCORE'; }, 2000);
        } catch {
          window.prompt('Copy score:', text);
        }
      });
    }
  }, 800); // Delay to let effects play
}

function parseLeaderboardDisplay(display: string | null, metric: 'score' | 'time'): number {
  if (!display || display === '—') return 0;
  if (metric === 'time') {
    const parts = display.split(':');
    if (parts.length !== 2) return 0;
    const min = parseInt(parts[0], 10) || 0;
    const secParts = parts[1].split('.');
    const sec = parseInt(secParts[0], 10) || 0;
    const cs = parseInt(secParts[1] || '0', 10) || 0;
    return ((min * 60) + sec) * 1000 + cs * 10;
  }
  const parsed = parseInt(display.replace(/,/g, ''), 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function renderPauseScreen(_view: ViewEventHost): void {
  // Pause screen is handled by DOM overlay
  // Visual effects could be added here (e.g., dim the board)
}

export function onMove(view: ViewEventHost, x: number, y: number): void {
  view.visualEffects.triggerMovementFlash(0.2);
  const worldX = (x + 1.5) * 2.2;
  const worldY = (y + 1.5) * -2.2;
  // JUICE: Denser, brighter trail for better feedback
  view.particleSystem.emitParticles(worldX, worldY, 0.0, 10, [0.6, 1.0, 1.0, 1.0]);
}
// Add empty export to avoid import errors
