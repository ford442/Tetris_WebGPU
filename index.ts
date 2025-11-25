import Game from "./src/game.js";
import View from "./src/viewWebGPU.js";
import Controller from "./src/controller.js";

declare global {
  interface Window {
    game: Game;
    view: View;
    controller: Controller;
  }
}

const uiContainer = document.getElementById('ui-container')!;

// Create UI
uiContainer.innerHTML = `
  <h1>TETRIS</h1>
  <div class="theme-buttons">
    <button id="pastel-theme">Pastel</button>
    <button id="neon-theme">Neon</button>
  </div>
  <div class="info-line">
    <p>SCORE</p>
    <p id="score">0</p>
  </div>
  <div class="info-line">
    <p>LINES</p>
    <p id="lines">0</p>
  </div>
  <div class="info-line">
    <p>LEVEL</p>
    <p id="level">0</p>
  </div>
  <div id="next-piece-container">
    <p>NEXT</p>
    <canvas id="next-piece-canvas" width="80" height="80"></canvas>
  </div>
  <div class="control-buttons">
    <button id="start-button">START</button>
    <button id="pause-button">PAUSE</button>
  </div>
  <div id="game-over">GAME OVER</div>
  <div id="info1"></div>
  <div id="info2"></div>
`;

const game = new Game();
const view = new View(document.body, window.innerWidth, window.innerHeight, 20, 10, (document.getElementById('next-piece-canvas') as HTMLCanvasElement).getContext('2d')!);
const controller = new Controller(game, view, view);

document.getElementById('pastel-theme')!.addEventListener('click', () => {
  document.body.className = 'pastel-theme';
  view.setTheme('pastel');
});

document.getElementById('neon-theme')!.addEventListener('click', () => {
  document.body.className = 'neon-theme';
  view.setTheme('neon');
});

document.getElementById('start-button')!.addEventListener('click', () => {
    controller.play();
});

document.getElementById('pause-button')!.addEventListener('click', () => {
    controller.pause();
});

window.game = game;
window.view = view;
window.controller = controller;

// Set default theme
document.getElementById('pastel-theme')!.click();
