/**
 * Game Over Animation System
 * Creates dramatic visual effects for game over screen
 */

import { HighScoreEntry } from '../features/highScore.js';

export interface GameOverStats {
  score: number;
  lines: number;
  level: number;
  highScore: number;
  isNewHighScore: boolean;
}

export function createGameOverOverlay(stats: GameOverStats): HTMLElement {
  // Remove existing overlay if present
  const existing = document.getElementById('game-over-overlay');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = 'game-over-overlay';
  overlay.className = 'game-over-overlay';
  
  const newHighScoreBadge = stats.isNewHighScore 
    ? '<div class="new-high-badge">🏆 NEW HIGH SCORE!</div>' 
    : '';
  
  const highScoreText = stats.isNewHighScore 
    ? `<div class="final-high-score new">${stats.score.toLocaleString()}</div>`
    : `<div class="final-high-score">${stats.score.toLocaleString()}</div>
       <div class="high-score-label">High Score: ${stats.highScore.toLocaleString()}</div>`;

  overlay.innerHTML = `
    <div class="game-over-content">
      <div class="game-over-title">
        <span class="game-over-g">G</span>
        <span class="game-over-a">A</span>
        <span class="game-over-m">M</span>
        <span class="game-over-e">E</span>
        <span class="game-over-space"> </span>
        <span class="game-over-o">O</span>
        <span class="game-over-v">V</span>
        <span class="game-over-e2">E</span>
        <span class="game-over-r">R</span>
      </div>
      ${newHighScoreBadge}
      <div class="final-stats">
        ${highScoreText}
        <div class="stats-row">
          <div class="stat-box">
            <span class="stat-label">LINES</span>
            <span class="stat-value">${stats.lines}</span>
          </div>
          <div class="stat-box">
            <span class="stat-label">LEVEL</span>
            <span class="stat-value">${stats.level}</span>
          </div>
        </div>
      </div>
      <div class="game-over-buttons">
        <button id="game-over-retry" class="game-over-btn retry">TRY AGAIN</button>
        <button id="game-over-menu" class="game-over-btn menu">MENU</button>
      </div>
      <p class="game-over-hint">Press ENTER to restart</p>
    </div>
  `;

  document.body.appendChild(overlay);
  
  // Trigger entrance animations
  requestAnimationFrame(() => {
    overlay.classList.add('active');
  });

  return overlay;
}

export function addGameOverStyles(): void {
  if (document.getElementById('game-over-styles')) return;

  const styles = document.createElement('style');
  styles.id = 'game-over-styles';
  styles.textContent = `
    .game-over-overlay {
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: linear-gradient(180deg, 
        rgba(0, 0, 0, 0.9) 0%, 
        rgba(50, 0, 0, 0.85) 50%,
        rgba(0, 0, 0, 0.95) 100%
      );
      backdrop-filter: blur(8px);
      display: flex;
      justify-content: center;
      align-items: center;
      z-index: 300;
      opacity: 0;
      transition: opacity 0.5s ease-out;
      pointer-events: auto;
    }
    
    .game-over-overlay.active {
      opacity: 1;
    }
    
    .game-over-content {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 20px;
      transform: scale(0.8);
      opacity: 0;
      animation: gameOverContentIn 0.6s ease-out 0.2s forwards;
    }
    
    @keyframes gameOverContentIn {
      to {
        transform: scale(1);
        opacity: 1;
      }
    }
    
    .game-over-title {
      font-size: 4rem;
      font-weight: bold;
      letter-spacing: 8px;
      display: flex;
      gap: 4px;
    }
    
    .game-over-title span {
      display: inline-block;
      color: #ff3333;
      text-shadow: 0 0 20px #ff0000, 0 0 40px rgba(255, 0, 0, 0.5);
      opacity: 0;
      transform: translateY(-50px);
      animation: gameOverLetterDrop 0.4s ease-out forwards;
    }
    
    .game-over-title .game-over-g { animation-delay: 0.1s; }
    .game-over-title .game-over-a { animation-delay: 0.15s; }
    .game-over-title .game-over-m { animation-delay: 0.2s; }
    .game-over-title .game-over-e { animation-delay: 0.25s; }
    .game-over-title .game-over-space { animation-delay: 0.3s; width: 20px; }
    .game-over-title .game-over-o { animation-delay: 0.35s; }
    .game-over-title .game-over-v { animation-delay: 0.4s; }
    .game-over-title .game-over-e2 { animation-delay: 0.45s; }
    .game-over-title .game-over-r { animation-delay: 0.5s; }
    
    @keyframes gameOverLetterDrop {
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }
    
    .new-high-badge {
      background: linear-gradient(90deg, #ffd700, #ffaa00, #ffd700);
      background-size: 200% 100%;
      animation: goldShimmer 2s linear infinite;
      color: #000;
      padding: 10px 30px;
      border-radius: 25px;
      font-size: 1.2rem;
      font-weight: bold;
      letter-spacing: 3px;
      box-shadow: 0 0 30px rgba(255, 215, 0, 0.5);
      transform: scale(0);
      animation: badgePop 0.5s ease-out 0.6s forwards;
    }
    
    @keyframes goldShimmer {
      0%, 100% { background-position: 0% 50%; }
      50% { background-position: 100% 50%; }
    }
    
    @keyframes badgePop {
      0% { transform: scale(0); }
      50% { transform: scale(1.1); }
      100% { transform: scale(1); }
    }
    
    .final-stats {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 15px;
      padding: 25px 40px;
      background: rgba(0, 0, 0, 0.6);
      border-radius: 15px;
      border: 2px solid rgba(255, 51, 51, 0.3);
      opacity: 0;
      animation: fadeInUp 0.5s ease-out 0.7s forwards;
    }
    
    .final-high-score {
      font-size: 3.5rem;
      font-weight: bold;
      color: #fff;
      text-shadow: 0 0 20px rgba(255, 255, 255, 0.5);
    }
    
    .final-high-score.new {
      color: #ffd700;
      text-shadow: 0 0 20px #ffd700, 0 0 40px rgba(255, 215, 0, 0.5);
      animation: scorePulse 1.5s ease-in-out infinite;
    }
    
    @keyframes scorePulse {
      0%, 100% { transform: scale(1); }
      50% { transform: scale(1.05); }
    }
    
    .high-score-label {
      font-size: 1rem;
      color: #888;
    }
    
    .stats-row {
      display: flex;
      gap: 40px;
    }
    
    .stat-box {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 5px;
    }
    
    .stat-label {
      font-size: 0.85rem;
      color: #666;
      letter-spacing: 2px;
    }
    
    .stat-value {
      font-size: 1.5rem;
      font-weight: bold;
      color: #ff6666;
    }
    
    .game-over-buttons {
      display: flex;
      gap: 15px;
      opacity: 0;
      animation: fadeInUp 0.5s ease-out 0.9s forwards;
    }
    
    .game-over-btn {
      padding: 15px 35px;
      font-size: 1.1rem;
      font-family: inherit;
      font-weight: bold;
      letter-spacing: 2px;
      border-radius: 8px;
      cursor: pointer;
      transition: all 0.2s;
      border: 2px solid;
    }
    
    .game-over-btn.retry {
      background: rgba(255, 51, 51, 0.2);
      border-color: #ff3333;
      color: #ff3333;
    }
    
    .game-over-btn.retry:hover {
      background: rgba(255, 51, 51, 0.4);
      transform: scale(1.05);
      box-shadow: 0 0 20px rgba(255, 51, 51, 0.4);
    }
    
    .game-over-btn.menu {
      background: rgba(100, 100, 100, 0.2);
      border-color: #888;
      color: #888;
    }
    
    .game-over-btn.menu:hover {
      background: rgba(100, 100, 100, 0.4);
      transform: scale(1.05);
    }
    
    .game-over-hint {
      font-size: 0.9rem;
      color: #555;
      font-style: italic;
      opacity: 0;
      animation: fadeInUp 0.5s ease-out 1.1s forwards;
    }
    
    @keyframes fadeInUp {
      from {
        opacity: 0;
        transform: translateY(20px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }
  `;

  document.head.appendChild(styles);
}

export function triggerGameOverEffects(view: any): void {
  // Maximum intensity effects
  view.visualEffects.triggerGlitch(1.5);
  view.visualEffects.triggerAberration(1.2);
  view.visualEffects.triggerFlash(1.0);
  view.visualEffects.triggerShake(3.0, 1.0);
  view.visualEffects.warpSurge = 10.0;
  
  // Multiple shockwaves
  setTimeout(() => {
    view.visualEffects.triggerShockwave([0.5, 0.5], 0.5, 0.4, 0.25, 4.0);
  }, 200);
  
  setTimeout(() => {
    view.visualEffects.triggerShockwave([0.5, 0.5], 0.3, 0.2, 0.15, 3.0);
  }, 600);
  
  // Particles
  const centerX = 5.0 * 2.2;
  const centerY = 10.0 * -2.2;
  
  // Red burst
  for (let i = 0; i < 200; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 30.0 + Math.random() * 40.0;
    view.particleSystem.emitParticlesRadial(centerX, centerY, 0.0, angle, speed, [1.0, 0.1, 0.1, 1.0]);
  }
  
  // Dark burst
  setTimeout(() => {
    for (let i = 0; i < 150; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 20.0 + Math.random() * 30.0;
      view.particleSystem.emitParticlesRadial(centerX, centerY, 0.0, angle, speed, [0.2, 0.0, 0.0, 1.0]);
    }
  }, 300);
}

export const gameOverAnimation = {
  createGameOverOverlay,
  addGameOverStyles,
  triggerGameOverEffects
};

export default gameOverAnimation;
