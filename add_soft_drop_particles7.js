const fs = require('fs');

let content = fs.readFileSync('src/controller.ts', 'utf8');

content = content.split('this.viewWebGPU.visualEffects?.triggerMovementFlash?.(0.15);').join(
  `this.viewWebGPU.visualEffects?.triggerMovementFlash?.(0.15);
            if (this.game.activPiece && (this.viewWebGPU as any).particleSystem) {
                const worldX = (this.game.activPiece.x + 1.5) * 2.2;
                const worldY = (this.game.activPiece.y + 1.5) * -2.2;
                for(let i = 0; i < 3; i++) {
                    const spreadX = (Math.random() - 0.5) * 4.0;
                    const spreadY = (Math.random() - 0.5) * 4.0;
                    (this.viewWebGPU as any).particleSystem.emitParticlesRadial(
                        worldX + spreadX, worldY + spreadY, 0.0,
                        Math.PI / 2 + (Math.random() - 0.5) * 0.5,
                        10.0 + Math.random() * 15.0,
                        [0.2, 0.8, 1.0, 0.6] // Cyan trail
                    );
                }
            }`
);

fs.writeFileSync('src/controller.ts', content);
