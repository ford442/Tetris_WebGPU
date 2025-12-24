
import Game from './src/game';

try {
    const game = new Game();
    console.log("Game initialized.");

    // This should trigger hasCollision -> hasCollisionPiece
    console.log("Checking collision...");
    const collision = game.hasCollision();
    console.log(`Collision check result: ${collision}`);

} catch (error) {
    console.error("Caught expected error:");
    console.error(error);
}
