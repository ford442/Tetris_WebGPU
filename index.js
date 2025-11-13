import Game from "./src/game.js";
import View from "./src/viewWebGPU.js";
import Controller from "./src/controller.js";

const root = document.querySelector("#root");

const game = new Game();
const view = new View(root, 480, 520, 20, 10);
const controller = new Controller(game, view, view);

// Initialize the UI with starting values
view.renderStartScreen();
const scoreDisplay = document.querySelector("#score-display");
const linesDisplay = document.querySelector("#lines-display");
const levelDisplay = document.querySelector("#level-display");
const highScoreDisplay = document.querySelector("#high-score-display");

if (scoreDisplay) scoreDisplay.textContent = "0";
if (linesDisplay) linesDisplay.textContent = "0";
if (levelDisplay) levelDisplay.textContent = "0";
if (highScoreDisplay) highScoreDisplay.textContent = view.highScore || "0";

window.game = game;
window.view = view;
window.controller = controller;

console.log("Tetris WebGPU Enhanced Edition loaded successfully!");
console.log(game);
