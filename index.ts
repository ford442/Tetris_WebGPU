import Game from "./src/game.js";
import View from "./src/viewWebGPU.js";
import Controller from "./src/controller.js";
import SoundManager from "./src/sound.js";
import { WasmCore } from './src/wasm/WasmCore.js';

declare global {
  interface Window {
    game: Game;
    view: View;
    controller: Controller;
    soundManager: SoundManager;
  }
}

const uiContainer = document.getElementById('ui-container')!;

// Create UI
uiContainer.innerHTML = `
  <div class="header">
      <h1>TETRIS</h1>
      <div id="combo-display" class="combo-display">COMBO x0</div>
  </div>

  <div class="main-layout">
      <div class="left-panel">
          <div class="panel-box hold-piece-container">
            <p class="panel-label">HOLD</p>
            <canvas id="hold-piece-canvas" width="80" height="80"></canvas>
          </div>

           <div class="panel-box score-box">
            <p class="panel-label">SCORE</p>
            <p id="score" class="panel-value">0</p>
          </div>
          <div class="panel-box high-score-box">
            <p class="panel-label">HIGH SCORE</p>
            <p id="high-score" class="panel-value">-</p>
          </div>
           <div class="panel-box">
            <p class="panel-label">LINES</p>
            <p id="lines" class="panel-value">0</p>
          </div>
           <div class="panel-box">
            <p class="panel-label">LEVEL</p>
            <p id="level" class="panel-value">0</p>
          </div>
      </div>

      <div class="right-panel">
          <div class="panel-box next-piece-container">
            <p class="panel-label">NEXT</p>
            <canvas id="next-piece-canvas" width="120" height="120"></canvas>
          </div>

           <div class="theme-buttons panel-box">
            <p class="panel-label">THEME</p>
            <button id="pastel-theme">Pastel</button>
            <button id="neon-theme">Neon</button>
            <button id="futuristic-theme">Future</button>
          </div>

          <div class="control-buttons panel-box">
            <button id="start-button">START</button>
            <button id="pause-button">PAUSE</button>
            <button id="glitch-button">FX: OFF</button>
          </div>
          
          <div class="panel-box music-controls">
            <p class="panel-label">MUSIC</p>
            <div class="volume-slider">
              <span>Vol:</span>
              <input type="range" id="music-volume" min="0" max="100" value="50">
            </div>
            <button id="music-toggle">PLAY MUSIC</button>
          </div>
      </div>
  </div>

  <div id="game-over">GAME OVER</div>
  
  <!-- Pause Menu Overlay -->
  <div id="pause-menu" class="pause-menu" style="display: none;">
    <div class="pause-menu-content">
      <h2>PAUSED</h2>
      <button id="resume-button" class="pause-btn">RESUME</button>
      <button id="restart-button" class="pause-btn">RESTART</button>
      <div class="pause-volume-controls">
        <div class="volume-row">
          <label>Music:</label>
          <input type="range" id="pause-music-volume" min="0" max="100" value="50">
        </div>
        <div class="volume-row">
          <label>SFX:</label>
          <input type="range" id="pause-sfx-volume" min="0" max="100" value="35">
        </div>
      </div>
      <p class="pause-hint">Press Enter or Escape to resume</p>
    </div>
  </div>
  
  <div id="info1"></div>
  <div id="info2"></div>
`;

// Styles are in css/style.css, we should probably update them too.

(async () => {
  try {
    await WasmCore.init();
  } catch (e) {
    console.warn("WASM failed to initialize in index.ts (continuing with JS fallback):", e);
  }

  const game = new Game();
  const soundManager = new SoundManager();
  const nextPieceCtx = (document.getElementById('next-piece-canvas') as HTMLCanvasElement).getContext('2d')!;
  const holdPieceCtx = (document.getElementById('hold-piece-canvas') as HTMLCanvasElement).getContext('2d')!;

  const view = await View.create(
      document.body,
      window.innerWidth,
      window.innerHeight,
      20,
      10,
      nextPieceCtx,
      holdPieceCtx
  );

  // NEW: Wire view reference for reactive systems
  game.view = view;

  // NEW: Enable premium visuals preset
  view.setPremiumVisualsPreset({
    renderScale: 1.0,        // Start at native resolution
    enhancedPostProcess: true,
    reactiveVideo: true,
    reactiveMusic: false     // Enable when ready to test audio
  });

  // NEW: Initialize reactive music when sound manager is ready
  soundManager.onReady = () => {
    if (soundManager.audioContext && soundManager.masterGain) {
      view.initReactiveMusic(soundManager.audioContext, soundManager.masterGain);
      view.useReactiveMusic = true;
    }
  };

  const controller = new Controller(game, view, view, soundManager);

  // Initialize high score display
  const highestScore = game.getHighScoreManager().getHighestScore();
  const highScoreElement = document.getElementById('high-score');
  if (highScoreElement && highestScore) {
    highScoreElement.textContent = highestScore.score.toLocaleString();
  }

  document.getElementById('pastel-theme')!.addEventListener('click', () => {
    document.body.className = 'pastel-theme';
    view.setTheme('pastel');
  });

  document.getElementById('neon-theme')!.addEventListener('click', () => {
    document.body.className = 'neon-theme';
    view.setTheme('neon');
  });

  document.getElementById('futuristic-theme')!.addEventListener('click', () => {
    document.body.className = 'futuristic-theme';
    view.setTheme('future'); // Assuming we add 'future' to View
  });

  document.getElementById('start-button')!.addEventListener('click', () => {
      controller.play();
      (document.getElementById('start-button') as HTMLButtonElement).blur();
  });

  document.getElementById('pause-button')!.addEventListener('click', () => {
      controller.togglePause();
      (document.getElementById('pause-button') as HTMLButtonElement).blur();
  });

  document.getElementById('glitch-button')!.addEventListener('click', (e) => {
      view.toggleGlitch();
      const btn = e.target as HTMLButtonElement;
      btn.textContent = view.useGlitch ? "FX: ON" : "FX: OFF";
      btn.blur();
  });

  // Music volume control
  const musicVolumeSlider = document.getElementById('music-volume') as HTMLInputElement;
  const pauseMusicVolumeSlider = document.getElementById('pause-music-volume') as HTMLInputElement;
  
  musicVolumeSlider?.addEventListener('input', (e) => {
    const volume = parseInt((e.target as HTMLInputElement).value) / 100;
    soundManager.musicManager.setVolume(volume);
    if (pauseMusicVolumeSlider) {
      pauseMusicVolumeSlider.value = (volume * 100).toString();
    }
  });

  pauseMusicVolumeSlider?.addEventListener('input', (e) => {
    const volume = parseInt((e.target as HTMLInputElement).value) / 100;
    soundManager.musicManager.setVolume(volume);
    if (musicVolumeSlider) {
      musicVolumeSlider.value = (volume * 100).toString();
    }
  });

  // Music toggle
  const musicToggleBtn = document.getElementById('music-toggle');
  musicToggleBtn?.addEventListener('click', () => {
    if (soundManager.musicManager.isMusicPlaying()) {
      soundManager.musicManager.pause();
      musicToggleBtn.textContent = 'PLAY MUSIC';
    } else {
      soundManager.musicManager.play();
      musicToggleBtn.textContent = 'PAUSE MUSIC';
    }
  });

  // SFX volume control (master gain)
  const pauseSfxVolumeSlider = document.getElementById('pause-sfx-volume') as HTMLInputElement;
  pauseSfxVolumeSlider?.addEventListener('input', (e) => {
    // Note: This would need additional implementation in SoundManager to separate SFX from music
    // For now, this is a placeholder for the UI
  });

  // Pause menu buttons
  document.getElementById('resume-button')?.addEventListener('click', () => {
    controller.resume();
  });

  document.getElementById('restart-button')?.addEventListener('click', () => {
    controller.reset();
  });

  window.game = game;
  window.view = view;
  window.controller = controller;
  window.soundManager = soundManager;

  // Set default
  document.getElementById('neon-theme')!.click();
})();
