import type { GameState } from '../game/gameState.js';
import type { GameModeId } from '../game/modes/types.js';
import type Game from '../game.js';
import type { IView } from '../view/IView.js';
import { onPauseMenuClose, onPauseMenuOpen } from '../a11y/keyboardNav.js';

export function updateHighScoreDisplay(game: Game): void {
  const highScoreElement = document.getElementById('high-score');
  const highScoreLabel = document.getElementById('high-score-label');
  const state = game.getState();
  if (highScoreLabel) {
    highScoreLabel.textContent = state.modeHighScoreLabel;
  }
  if (highScoreElement) {
    highScoreElement.textContent = game.getModeLeaderboardDisplay();
  }
}

const MODE_RULES_HINT: Record<GameModeId | 'online-versus', string> = {
  marathon: 'Clear lines and survive as long as you can. Top-out ends the run.',
  sprint: 'Clear 40 lines as fast as possible. Top-out ends the run.',
  ultra: 'Score as many points as you can in 2 minutes.',
  cheese: 'Clear all cheese blocks to win. Top-out ends the run. Default 7 garbage rows (?cheeseRows=5–10).',
  zen: 'No game over — top rows clear if spawn is blocked. Fixed slow speed, infinite hold. Lines and time only.',
  versus: 'Local split-screen 2P with garbage attacks. See controls below.',
  'online-versus': 'Online 2P via ephemeral room code. Arrow keys — host is P1, guest is P2.',
};

export function updateModeRulesHint(modeId: GameModeId | 'online-versus'): void {
  const el = document.getElementById('mode-rules-hint');
  if (el) {
    el.textContent = MODE_RULES_HINT[modeId] ?? MODE_RULES_HINT.marathon;
  }
}

export function updateModeHud(state: GameState): void {
  const modeLabel = document.getElementById('mode-label');
  const primaryLabel = document.getElementById('mode-hud-primary-label');
  const primaryValue = document.getElementById('mode-hud-primary-value');
  const secondaryLabel = document.getElementById('mode-hud-secondary-label');
  const secondaryValue = document.getElementById('mode-hud-secondary-value');
  const levelBox = document.getElementById('level-panel-box');
  const scoreBox = document.querySelector('.score-box') as HTMLElement | null;
  const highScoreBox = document.querySelector('.high-score-box') as HTMLElement | null;

  if (modeLabel) modeLabel.textContent = state.modeLabel;
  if (primaryLabel) primaryLabel.textContent = state.modePrimaryLabel;
  if (primaryValue) primaryValue.textContent = state.modePrimaryValue;

  if (secondaryLabel && secondaryValue) {
    const show = state.modeShowSecondary;
    secondaryLabel.style.display = show ? '' : 'none';
    secondaryValue.style.display = show ? '' : 'none';
    if (show) {
      secondaryLabel.textContent = state.modeSecondaryLabel;
      secondaryValue.textContent = state.modeSecondaryValue;
    }
  }

  if (levelBox) {
    levelBox.style.display = state.modeShowLevel ? '' : 'none';
  }

  if (scoreBox) {
    scoreBox.style.display = state.modeShowScore ? '' : 'none';
  }

  if (highScoreBox) {
    highScoreBox.style.display = state.modeShowHighScore ? '' : 'none';
  }

  updateModeRulesHint(state.modeId);
}

export function updateComboDisplay(combo: number, view: IView): void {
  const comboDisplay = document.getElementById('combo-display');
  if (!comboDisplay) return;

  if (combo > 1) {
    const oldCombo = parseInt(comboDisplay.dataset.combo || '0');
    comboDisplay.textContent = `COMBO x${combo}`;
    comboDisplay.dataset.combo = combo.toString();
    comboDisplay.classList.add('active');

    comboDisplay.className = comboDisplay.className.replace(/combo-\d+/g, '');

    if (combo >= 20) {
      comboDisplay.classList.add('combo-20');
    } else if (combo >= 15) {
      comboDisplay.classList.add('combo-15');
    } else if (combo >= 10) {
      comboDisplay.classList.add('combo-10');
    } else if (combo >= 9) {
      comboDisplay.classList.add('combo-9');
    } else if (combo >= 8) {
      comboDisplay.classList.add('combo-8');
    } else if (combo >= 7) {
      comboDisplay.classList.add('combo-7');
    } else if (combo >= 6) {
      comboDisplay.classList.add('combo-6');
    } else if (combo >= 5) {
      comboDisplay.classList.add('combo-5');
    } else if (combo >= 4) {
      comboDisplay.classList.add('combo-4');
    } else if (combo >= 3) {
      comboDisplay.classList.add('combo-3');
    } else {
      comboDisplay.classList.add('combo-2');
    }

    comboDisplay.classList.remove('combo-pulse');
    void comboDisplay.offsetWidth;
    comboDisplay.classList.add('combo-pulse');

    if (combo > oldCombo && combo % 5 === 0) {
      showComboMilestone(combo, view);
    }
  } else {
    comboDisplay.classList.remove('active');
    comboDisplay.classList.remove('combo-pulse');
    comboDisplay.className = comboDisplay.className.replace(/combo-\d+/g, '');
    comboDisplay.dataset.combo = '0';
  }
}

export function showComboMilestone(combo: number, view: IView): void {
  let milestoneEl = document.getElementById('combo-milestone');
  if (!milestoneEl) {
    milestoneEl = document.createElement('div');
    milestoneEl.id = 'combo-milestone';
    milestoneEl.className = 'combo-milestone';
    document.body.appendChild(milestoneEl);
  }

  milestoneEl.textContent = `${combo}x COMBO!`;
  milestoneEl.classList.remove('show');
  void milestoneEl.offsetWidth;
  milestoneEl.classList.add('show');

  view.showFloatingText(`${combo}x COMBO!`, 'INCREDIBLE!');
}

export function showPauseMenu(state: GameState): void {
  const pauseMenu = document.getElementById('pause-menu');
  if (pauseMenu) {
    const pauseScore = document.getElementById('pause-score');
    const pauseLevel = document.getElementById('pause-level');
    const pauseLines = document.getElementById('pause-lines');

    if (pauseScore) pauseScore.textContent = state.score.toLocaleString();
    if (pauseLevel) pauseLevel.textContent = state.level.toString();
    if (pauseLines) pauseLines.textContent = state.lines.toString();

    pauseMenu.style.display = 'flex';
  }
  onPauseMenuOpen();
}

export function hidePauseMenu(): void {
  const pauseMenu = document.getElementById('pause-menu');
  if (pauseMenu) {
    pauseMenu.style.display = 'none';
  }
  onPauseMenuClose();
}
