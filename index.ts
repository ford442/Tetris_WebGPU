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
  </div>

  <div class="main-layout">
      <div class="left-panel">
          <div class="panel-box hold-piece-container">
            <p class="panel-label">HOLD</p>
            <canvas id="hold-piece-canvas" width="120" height="120"></canvas>
          </div>

           <div class="panel-box score-box">
            <p class="panel-label">SCORE</p>
            <p id="score" class="panel-value">0</p>
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
      </div>
  </div>

  <div id="game-over">GAME OVER</div>
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

  const view = new View(
      document.body,
      window.innerWidth,
      window.innerHeight,
      20,
      10,
      nextPieceCtx,
      holdPieceCtx
  );

  const controller = new Controller(game, view, view, soundManager);

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
      controller.pause();
      (document.getElementById('pause-button') as HTMLButtonElement).blur();
  });

  document.getElementById('glitch-button')!.addEventListener('click', (e) => {
      view.toggleGlitch();
      const btn = e.target as HTMLButtonElement;
      btn.textContent = view.useGlitch ? "FX: ON" : "FX: OFF";
      btn.blur();
  });

  const controlButtons = document.querySelector('.control-buttons');
  const switchStyleButton = document.createElement('button');
  switchStyleButton.id = 'switch-style-button';
  switchStyleButton.textContent = 'STYLE';
  controlButtons?.appendChild(switchStyleButton);

  document.getElementById('switch-style-button')!.addEventListener('click', (e) => {
    const newStyle = view.currentBlockStyle === 'tech' ? 'glass' : 'tech';
    view.setBlockStyle(newStyle as 'tech' | 'glass');
    const btn = e.target as HTMLButtonElement;
    btn.blur();
  });

  window.game = game;
  window.view = view;
  window.controller = controller;
  window.soundManager = soundManager;

  // Set default
  document.getElementById('neon-theme')!.click();
})();
