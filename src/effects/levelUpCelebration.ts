/**
 * Level Up Celebration System
 * Creates dramatic visual effects when player levels up
 */

export interface LevelUpConfig {
  level: number;
  primaryColor: string;
  secondaryColor: string;
  particleCount: number;
  shockwaveIntensity: number;
}

// Level-based color themes
const levelThemes: Record<number, { primary: string; secondary: string }> = {
  1: { primary: '#00ffff', secondary: '#0088ff' }, // Cyan/Blue
  2: { primary: '#00ff88', secondary: '#00ffff' }, // Green/Cyan
  3: { primary: '#88ff00', secondary: '#00ff88' }, // Lime/Green
  4: { primary: '#ffff00', secondary: '#88ff00' }, // Yellow/Lime
  5: { primary: '#ff8800', secondary: '#ffff00' }, // Orange/Yellow
  6: { primary: '#ff0000', secondary: '#ff8800' }, // Red/Orange
  7: { primary: '#ff0088', secondary: '#ff0000' }, // Magenta/Red
  8: { primary: '#8800ff', secondary: '#ff0088' }, // Purple/Magenta
  9: { primary: '#ffffff', secondary: '#8800ff' }, // White/Purple
};

export function getLevelTheme(level: number): { primary: string; secondary: string } {
  // Cycle through themes for levels beyond 9
  const themeLevel = ((level - 1) % 9) + 1;
  return levelThemes[themeLevel] || levelThemes[1];
}

export function getLevelConfig(level: number): LevelUpConfig {
  const theme = getLevelTheme(level);
  
  return {
    level,
    primaryColor: theme.primary,
    secondaryColor: theme.secondary,
    particleCount: 150 + (level * 25), // More particles at higher levels
    shockwaveIntensity: Math.min(0.5 + (level * 0.05), 1.0)
  };
}

export function createLevelUpOverlay(level: number): HTMLElement {
  const overlay = document.createElement('div');
  overlay.className = 'level-up-overlay';
  overlay.id = 'level-up-overlay';
  
  const theme = getLevelTheme(level);
  
  overlay.innerHTML = `
    <div class="level-up-content">
      <div class="level-up-text">LEVEL UP!</div>
      <div class="level-number" style="color: ${theme.primary}; text-shadow: 0 0 30px ${theme.primary}, 0 0 60px ${theme.secondary};">${level}</div>
      <div class="level-up-subtext">SPEED INCREASED</div>
    </div>
  `;
  
  // Add animation styles
  overlay.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    display: flex;
    justify-content: center;
    align-items: center;
    background: rgba(0, 0, 0, 0.4);
    backdrop-filter: blur(3px);
    z-index: 150;
    pointer-events: none;
    opacity: 0;
    animation: levelUpFadeIn 0.3s ease-out forwards;
  `;
  
  const content = overlay.querySelector('.level-up-content') as HTMLElement;
  if (content) {
    content.style.cssText = `
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 10px;
      transform: scale(0.5);
      animation: levelUpScale 0.5s ease-out 0.1s forwards;
    `;
  }
  
  const text = overlay.querySelector('.level-up-text') as HTMLElement;
  if (text) {
    text.style.cssText = `
      font-size: 2rem;
      font-weight: bold;
      color: ${theme.primary};
      letter-spacing: 8px;
      text-shadow: 0 0 20px ${theme.primary};
      opacity: 0;
      animation: levelUpTextIn 0.4s ease-out 0.2s forwards;
    `;
  }
  
  const number = overlay.querySelector('.level-number') as HTMLElement;
  if (number) {
    number.style.cssText = `
      font-size: 8rem;
      font-weight: bold;
      line-height: 1;
      opacity: 0;
      transform: scale(0);
      animation: levelUpNumberIn 0.5s ease-out 0.3s forwards;
    `;
  }
  
  const subtext = overlay.querySelector('.level-up-subtext') as HTMLElement;
  if (subtext) {
    subtext.style.cssText = `
      font-size: 1rem;
      color: #888;
      letter-spacing: 4px;
      opacity: 0;
      animation: levelUpTextIn 0.4s ease-out 0.5s forwards;
    `;
  }
  
  document.body.appendChild(overlay);
  
  // Remove after animation
  setTimeout(() => {
    overlay.style.animation = 'levelUpFadeOut 0.5s ease-in forwards';
    setTimeout(() => overlay.remove(), 500);
  }, 2500);
  
  return overlay;
}

export function addLevelUpStyles(): void {
  if (document.getElementById('level-up-styles')) return;
  
  const styles = document.createElement('style');
  styles.id = 'level-up-styles';
  styles.textContent = `
    @keyframes levelUpFadeIn {
      from { opacity: 0; }
      to { opacity: 1; }
    }
    
    @keyframes levelUpFadeOut {
      from { opacity: 1; }
      to { opacity: 0; }
    }
    
    @keyframes levelUpScale {
      from { transform: scale(0.5); }
      to { transform: scale(1); }
    }
    
    @keyframes levelUpTextIn {
      from { 
        opacity: 0;
        transform: translateY(-20px);
      }
      to { 
        opacity: 1;
        transform: translateY(0);
      }
    }
    
    @keyframes levelUpNumberIn {
      0% { 
        opacity: 0;
        transform: scale(0) rotate(-10deg);
      }
      50% {
        transform: scale(1.2) rotate(5deg);
      }
      100% { 
        opacity: 1;
        transform: scale(1) rotate(0deg);
      }
    }
  `;
  
  document.head.appendChild(styles);
}

export const levelUpCelebration = {
  getLevelTheme,
  getLevelConfig,
  createLevelUpOverlay,
  addLevelUpStyles
};

export default levelUpCelebration;
