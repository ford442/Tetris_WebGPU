import Game from "./src/game.js";
import { createView, getRendererPreference } from "./src/view/createView.js";
import Controller from "./src/controller.js";
import SoundManager from "./src/sound.js";
import { SubliminalReinforcement } from './src/effects/subliminalReinforcement.js';
import { initSettingsUI } from './src/settings/settingsUI.js';
import { inferQualityFromToggles, saveGameSettings } from './src/config/gameSettings.js';
import { WasmCore } from './src/wasm/WasmCore.js';
import { maybeInitTextureMaskLab } from './src/dev/textureMaskLab.js';
import { setBlockTextureConfig } from "./src/webgpu/blockTexture.js";
import { parseGameModeId } from './src/game/modes/createGameMode.js';
import type { GameModeId } from './src/game/modes/types.js';

declare global {
  interface Window {
    game: Game;
    view: View;
    controller: Controller;
    soundManager: SoundManager;
    subliminalReinforcement?: SubliminalReinforcement;
  }
}

const uiContainer = document.getElementById('ui-container')!;

// Create UI
uiContainer.innerHTML = `
  <div class="header">
      <h1>TETRIS</h1>
      <div id="combo-display" class="combo-display">COMBO x0</div>
      <div id="tspin-indicator" class="tspin-indicator">⚡ T-SPIN READY ⚡</div>
  </div>

  <div class="main-layout">
      <div class="left-panel">
          <div class="panel-box hold-piece-container">
            <p class="panel-label">HOLD</p>
            <canvas id="hold-piece-canvas" width="80" height="80"></canvas>
          </div>

          <div class="panel-box mode-select-box">
            <p class="panel-label">MODE</p>
            <select id="game-mode-select" class="mode-select" aria-label="Game mode">
              <option value="marathon">Marathon</option>
              <option value="sprint">Sprint 40L</option>
              <option value="ultra">Ultra 2:00</option>
            </select>
            <p id="mode-label" class="mode-current-label">Marathon</p>
          </div>
          <div class="panel-box mode-hud-box" id="mode-hud-box">
            <p class="panel-label" id="mode-hud-primary-label">GOAL</p>
            <p id="mode-hud-primary-value" class="panel-value">Survive</p>
            <p class="panel-label mode-hud-secondary" id="mode-hud-secondary-label">TIME</p>
            <p id="mode-hud-secondary-value" class="panel-value mode-hud-secondary">0:00</p>
          </div>

           <div class="panel-box score-box">
            <p class="panel-label">SCORE</p>
            <p id="score" class="panel-value">0</p>
          </div>
          <div class="panel-box high-score-box">
            <p class="panel-label" id="high-score-label">HIGH SCORE</p>
            <p id="high-score" class="panel-value">-</p>
          </div>
           <div class="panel-box">
            <p class="panel-label">LINES</p>
            <p id="lines" class="panel-value">0</p>
          </div>
           <div class="panel-box" id="level-panel-box">
            <p class="panel-label">LEVEL</p>
            <p id="level" class="panel-value">0</p>
          </div>
      </div>

      <div class="right-panel">
          <div class="panel-box next-piece-container">
            <p class="panel-label">NEXT</p>
            <canvas id="next-piece-canvas" width="120" height="120"></canvas>
          </div>

          <div class="control-buttons panel-box">
            <button id="start-button">START</button>
            <button id="pause-button">PAUSE</button>
            <button id="glitch-button">FX: OFF</button>
            <button id="bloom-button">BLOOM: ON</button>
            <button id="wire-button">WIRE: OFF</button>
            <button id="video-toggle" class="toggle-btn">VIDEO: ON</button>
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

  <!-- Pause Menu Overlay -->
  <div id="pause-menu" class="pause-menu" style="display: none;">
    <div class="pause-menu-content">
      <h2 class="pause-title">PAUSED</h2>
      
      <!-- Current Stats -->
      <div class="pause-stats">
        <div class="pause-stat">
          <span class="pause-stat-label">SCORE</span>
          <span id="pause-score" class="pause-stat-value">0</span>
        </div>
        <div class="pause-stat">
          <span class="pause-stat-label">LEVEL</span>
          <span id="pause-level" class="pause-stat-value">1</span>
        </div>
        <div class="pause-stat">
          <span class="pause-stat-label">LINES</span>
          <span id="pause-lines" class="pause-stat-value">0</span>
        </div>
      </div>
      
      <div class="pause-buttons">
        <button id="resume-button" class="pause-btn pause-btn-primary">RESUME</button>
        <button id="restart-button" class="pause-btn">RESTART</button>
      </div>
      
      <div class="pause-volume-section">
        <h3>AUDIO</h3>
        <div class="pause-volume-controls">
          <div class="volume-row">
            <label>🎵 Music:</label>
            <input type="range" id="pause-music-volume" min="0" max="100" value="30">
          </div>
          <div class="volume-row">
            <label>🔊 SFX:</label>
            <input type="range" id="pause-sfx-volume" min="0" max="100" value="35">
          </div>
        </div>
      </div>
      
      <!-- Experimental Section: Positive Reinforcement Subliminal System -->
      <div class="pause-experimental-section">
        <h3>EXPERIMENTAL</h3>
        <div class="experimental-toggle">
          <label>
            <input type="checkbox" id="subliminal-toggle" checked>
            <span>Positive Reinforcement <small>(subliminal 25-45ms cues)</small></span>
          </label>
          <div class="experimental-hint">Gentle visual priming for focus &amp; motivation. Toggle anytime.</div>
        </div>
      </div>

      <!-- Graphics Settings -->
      <div class="pause-settings-section">
        <h3>SETTINGS</h3>

        <div class="settings-group">
          <span class="settings-label">Quality</span>
          <div class="settings-quality-row" role="radiogroup" aria-label="Graphics quality">
            <label class="settings-pill"><input type="radio" name="settings-quality" value="low"> Low</label>
            <label class="settings-pill"><input type="radio" name="settings-quality" value="medium"> Med</label>
            <label class="settings-pill"><input type="radio" name="settings-quality" value="high"> High</label>
            <label class="settings-pill"><input type="radio" name="settings-quality" value="ultra"> Ultra</label>
          </div>
          <div id="settings-quality-custom-hint" class="settings-hint" style="display: none;">Custom mix — adjust toggles below.</div>
        </div>

        <div class="settings-toggles">
          <label class="settings-toggle"><input type="checkbox" id="settings-bloom" checked> Bloom</label>
          <label class="settings-toggle"><input type="checkbox" id="settings-shockwave" checked> Shockwave</label>
          <label class="settings-toggle"><input type="checkbox" id="settings-particles" checked> Particles</label>
          <label class="settings-toggle"><input type="checkbox" id="settings-reactive-video" checked> Reactive video</label>
          <label class="settings-toggle"><input type="checkbox" id="settings-glitch"> Glitch FX</label>
          <label class="settings-toggle"><input type="checkbox" id="settings-film-grain" checked> Film grain</label>
        </div>

        <div class="settings-group settings-gpu-row">
          <label class="settings-label" for="settings-gpu-power">GPU power</label>
          <select id="settings-gpu-power" class="settings-select">
            <option value="auto">Auto</option>
            <option value="high-performance">High performance</option>
            <option value="low-power">Low power</option>
          </select>
        </div>

        <div class="settings-group settings-renderer-row">
          <span class="settings-label">Renderer</span>
          <p id="settings-renderer-display" class="settings-renderer-text">—</p>
          <p class="settings-hint">Switch via <code>?renderer=webgpu</code>, <code>webgl2</code>, or <code>webgpu-cpp</code> — or set <code>localStorage.tetris_renderer</code>. Reload required.</p>
        </div>
      </div>
      
      <!-- Controls Reference -->
      <div class="pause-controls">
        <h3>CONTROLS</h3>
        <div class="controls-grid">
          <div class="control-item"><span class="key">←→</span> Move</div>
          <div class="control-item"><span class="key">↑</span> Rotate</div>
          <div class="control-item"><span class="key">↓</span> Soft Drop</div>
          <div class="control-item"><span class="key">SPACE</span> Hard Drop</div>
          <div class="control-item"><span class="key">C</span> Hold Piece</div>
          <div class="control-item"><span class="key">ESC</span> Pause</div>
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
  // Dev-only CPU tool for iterating on authored block texture masking.
  // localhost-only + `localStorage.tetris_texture_mask_lab='1'` (or `?masklab=1`).
  try {
    await maybeInitTextureMaskLab(uiContainer);
  } catch (e) {
    console.warn('Texture Mask Lab init failed:', e);
  }

  try {
    await WasmCore.init();
  } catch (e) {
    console.warn("WASM failed to initialize in index.ts (continuing with JS fallback):", e);
  }

  // Must run before createView → preRender → loadBlockTexture (mask bake + shader defines).
  setBlockTextureConfig({ url: 'block.png', metalThresholdLow: 0.75, metalThresholdHigh: 1.15 });

  const game = new Game();
  const soundManager = new SoundManager();
  const nextPieceCtx = (document.getElementById('next-piece-canvas') as HTMLCanvasElement).getContext('2d')!;
  const holdPieceCtx = (document.getElementById('hold-piece-canvas') as HTMLCanvasElement).getContext('2d')!;

  const view = await createView(
      document.body,
      window.innerWidth,
      window.innerHeight,
      20,
      10,
      nextPieceCtx,
      holdPieceCtx
  );

  console.info(`Tetris renderer: ${view.rendererName} (preference: ${getRendererPreference()})`);

  // Connect game to view for reactive events
  game.view = view;

  const settingsUI = initSettingsUI(view);

  // Initialize reactive music when sound manager is ready
  soundManager.onReady = () => {
    if (soundManager.audioContext && soundManager.masterGain) {
      view.initReactiveMusic?.(soundManager.audioContext, soundManager.masterGain);
      view.useReactiveMusic = true;
    }
  };
  // ===================================================================
  // Experimental: Positive Reinforcement Subliminal System
  // Loaded from localStorage (default true for the experimental phase).
  // The pause menu toggle (injected above) syncs this live.
  // ===================================================================
  const subliminalEnabled = localStorage.getItem('tetris_subliminal_enabled') !== 'false';
  const subliminal = new SubliminalReinforcement({
    enabled: subliminalEnabled,
    onStrongCue: () => {
      view.triggerNeonBloomFlashEffects?.(0.42);
      view.triggerBackgroundResonance?.(0.85, 280);
    }
  });
  window.subliminalReinforcement = subliminal;

  const controller = new Controller(game, view, view, soundManager);

  // Shared by viewGameEvents (e.g. game-over retry) across all renderer backends.
  (view as { game?: typeof game; controller?: typeof controller }).game = game;
  (view as { game?: typeof game; controller?: typeof controller }).controller = controller;

  // Wire the subliminal system into the controller for event-driven triggers
  // (line clears, T-spins, level ups, new high scores, background cadence).
  (controller as any).subliminal = subliminal;

  // Initialize high score display for current mode
  const savedMode = parseGameModeId(localStorage.getItem('tetris_game_mode'));
  const modeSelect = document.getElementById('game-mode-select') as HTMLSelectElement;
  if (modeSelect) {
    modeSelect.value = savedMode;
    modeSelect.addEventListener('change', () => {
      if (controller.isPlaying) return;
      game.setMode(modeSelect.value as GameModeId);
      controller.updateHighScoreDisplay();
      controller.updateModeHud();
    });
  }
  controller.updateHighScoreDisplay();
  controller.updateModeHud();

  document.getElementById('start-button')!.addEventListener('click', () => {
      if (!controller.isPlaying) {
        game.setMode((modeSelect?.value || savedMode) as GameModeId);
        controller.updateHighScoreDisplay();
        controller.updateModeHud();
      }
      controller.play();
      (document.getElementById('start-button') as HTMLButtonElement).blur();
  });

  document.getElementById('pause-button')!.addEventListener('click', () => {
      controller.togglePause();
      settingsUI.syncControls();
      (document.getElementById('pause-button') as HTMLButtonElement).blur();
  });

  document.getElementById('glitch-button')!.addEventListener('click', (e) => {
      view.toggleGlitch?.();
      const btn = e.target as HTMLButtonElement;
      btn.textContent = view.useGlitch ? "FX: ON" : "FX: OFF";
      btn.blur();
  });

  document.getElementById('bloom-button')!.addEventListener('click', (e) => {
      view.toggleBloom?.();
      const btn = e.target as HTMLButtonElement;
      btn.textContent = view.bloomEnabled ? "BLOOM: ON" : "BLOOM: OFF";
      btn.blur();
  });

  document.getElementById('wire-button')!.addEventListener('click', (e) => {
      view.useWireframe = !view.useWireframe;
      const btn = e.target as HTMLButtonElement;
      btn.textContent = view.useWireframe ? "WIRE: ON" : "WIRE: OFF";
      // Notify materials system (the wireframe option lives in viewMaterials)
      if (typeof view.setWireframe === 'function') {
        view.setWireframe(view.useWireframe);
      }
      btn.blur();
  });

  const videoToggle = document.getElementById('video-toggle') as HTMLButtonElement;
  const settingsReactiveVideo = document.getElementById('settings-reactive-video') as HTMLInputElement | null;

  function updateVideoToggle(useVideo: boolean) {
    videoToggle.textContent = useVideo ? 'VIDEO: ON' : 'VIDEO: OFF';
    if (settingsReactiveVideo) settingsReactiveVideo.checked = useVideo;
  }

  updateVideoToggle(settingsUI.settings.reactiveVideo);

  videoToggle.addEventListener('click', () => {
    const next = !settingsUI.settings.reactiveVideo;
    settingsUI.settings.reactiveVideo = next;
    settingsUI.settings.quality = inferQualityFromToggles(settingsUI.settings);
    saveGameSettings(settingsUI.settings);
    view.applyGameSettings?.(settingsUI.settings);
    updateVideoToggle(next);
    videoToggle.blur();
  });

  // -------------------------------------------------------------------
  // Experimental Subliminal Toggle (pause menu)
  // -------------------------------------------------------------------
  const subliminalToggle = document.getElementById('subliminal-toggle') as HTMLInputElement | null;

  function syncSubliminalToggle() {
    if (subliminalToggle) {
      subliminalToggle.checked = subliminal.isEnabled();
    }
  }

  if (subliminalToggle) {
    // Initial sync (in case localStorage had explicit false)
    subliminalToggle.checked = subliminal.isEnabled();

    subliminalToggle.addEventListener('change', () => {
      subliminal.setEnabled(subliminalToggle.checked);
      // Persist is handled inside setEnabled
    });
  }

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

  // SFX volume control
  const pauseSfxVolumeSlider = document.getElementById('pause-sfx-volume') as HTMLInputElement;
  pauseSfxVolumeSlider?.addEventListener('input', (e) => {
    const volume = parseInt((e.target as HTMLInputElement).value) / 100;
    soundManager.setSfxVolume(volume);
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

  // Image-sampled blocks from block.png — clear any legacy theme/mode localStorage
  localStorage.removeItem('tetris_theme_class');
  localStorage.setItem('tetris_theme_class', 'image-sampled-theme');
  localStorage.setItem('tetris_theme_name', 'imageSampled');
  document.body.className = 'image-sampled-theme';
  view.setTheme('imageSampled');
  view.setMaterialTheme?.('imageSampled', 1);
})();
