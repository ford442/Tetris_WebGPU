import Game from './src/game.js';

try {
    const game = new Game();
    console.log("Game initialized.");

    // Simulate hard drop to trigger effectEvent='hardDrop'
    game.hardDrop();

} catch (error) {
    console.error("Caught expected error:");
    console.error(error);
}
