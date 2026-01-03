# Code Structure After Refactoring

## Overview
This document describes the modular structure after breaking up the large `viewWebGPU.ts` and `game.ts` files.

## Directory Structure

```
src/
├── webgpu/              # WebGPU rendering subsystems
│   ├── shaders.ts       # Shader definitions (519 lines)
│   ├── geometry.ts      # 3D geometry generators (87 lines)
│   ├── themes.ts        # Color themes (83 lines)
│   ├── particles.ts     # Particle system (104 lines)
│   └── effects.ts       # Visual effects (166 lines)
├── game/                # Game logic subsystems
│   ├── pieces.ts        # Tetromino pieces (106 lines)
│   ├── rotation.ts      # SRS rotation system (65 lines)
│   ├── collision.ts     # Collision detection (52 lines)
│   └── scoring.ts       # Scoring system (55 lines)
├── viewWebGPU.ts        # Main renderer (1251 lines, down from 2167)
├── game.ts              # Main game logic (437 lines, down from 622)
├── controller.ts        # Input handling
└── sound.ts             # Sound effects
```

## Module Descriptions

### WebGPU Modules

#### `webgpu/shaders.ts`
Exports all WGSL shader code:
- `PostProcessShaders()` - Post-processing effects (chromatic aberration, shockwave)
- `ParticleShaders()` - Particle rendering shaders
- `GridShader()` - Grid overlay shader
- `BackgroundShaders()` - Animated background shader
- `Shaders()` - Main block rendering shader with lighting

#### `webgpu/geometry.ts`
Exports geometry data generators:
- `CubeData()` - Cube mesh (positions, normals, UVs)
- `FullScreenQuadData()` - Full-screen quad for post-processing
- `GridData()` - Grid line positions

#### `webgpu/themes.ts`
Exports theme system:
- `ThemeColors` interface - Theme color definition
- `Themes` interface - Collection of themes
- `themes` - Theme configurations (pastel, neon, future)

#### `webgpu/particles.ts`
Exports particle system:
- `Particle` interface - Single particle definition
- `ParticleSystem` class - Manages particle lifecycle
  - `emitParticles()` - Emit particles with random velocities
  - `emitParticlesRadial()` - Emit particles in specific direction
  - `updateParticles()` - Update all particles (physics, lifetime)
  - `getParticleData()` - Generate GPU buffer data

#### `webgpu/effects.ts`
Exports visual effects system:
- `VisualEffects` class - Manages screen effects and video backgrounds
  - `updateEffects()` - Update effect timers
  - `triggerFlash()` - Flash effect for line clears
  - `triggerShake()` - Screen shake effect
  - `triggerShockwave()` - Shockwave ripple effect
  - `updateVideoForLevel()` - Switch background video
  - `getClearColors()` - Get current screen clear color
  - `getShakeOffset()` - Get camera shake offset

### Game Modules

#### `game/pieces.ts`
Exports piece management:
- `Piece` interface - Tetromino piece definition
- `PieceGenerator` class - Creates and manages pieces
  - `createPieceByType()` - Create specific piece type
  - `createPiece()` - Create next piece from bag
  - `generateBag()` - Shuffle piece bag (7-bag system)
  - `resetPiecePosition()` - Reset piece to spawn position

#### `game/rotation.ts`
Exports SRS rotation system:
- `SRS_KICKS_JLSTZ` - Wall kick data for J, L, S, T, Z pieces
- `SRS_KICKS_I` - Wall kick data for I piece
- `rotatePieceBlocks()` - Rotate piece blocks matrix
- `getWallKicks()` - Get wall kick offsets for rotation

#### `game/collision.ts`
Exports collision detection:
- `CollisionDetector` class - Handles collision checks
  - `hasCollision()` - Check if piece collides
  - `getGhostY()` - Calculate ghost piece Y position
  - `updatePlayfield()` - Update playfield reference

#### `game/scoring.ts`
Exports scoring system:
- `ScoringSystem` class - Manages score and line clearing
  - `clearLines()` - Clear completed lines
  - `updateScore()` - Update score based on lines cleared
  - `level` property - Current level (calculated from lines)
  - `reset()` - Reset score and lines

## Integration

### Main Classes

#### `View` class (viewWebGPU.ts)
Uses subsystems:
- `particleSystem: ParticleSystem` - Particle effects
- `visualEffects: VisualEffects` - Screen effects and video
- Imports `themes` from `webgpu/themes.ts`
- Imports shader functions from `webgpu/shaders.ts`
- Imports geometry functions from `webgpu/geometry.ts`

#### `Game` class (game.ts)
Uses subsystems:
- `pieceGenerator: PieceGenerator` - Piece creation
- `collisionDetector: CollisionDetector` - Collision checks
- `scoringSystem: ScoringSystem` - Score and line management
- Imports rotation functions from `game/rotation.ts`

## Benefits of This Structure

1. **Separation of Concerns**: Each module has a single, clear responsibility
2. **Easier Testing**: Modules can be tested independently
3. **Better Maintainability**: Smaller files are easier to understand
4. **Reusability**: Subsystems can be reused in other contexts
5. **Expandability**: New features can be added without bloating existing files
6. **Type Safety**: Interfaces clearly define contracts between modules

## Future Expansion Possibilities

With this modular structure, it's now easier to:
- Add new visual effects (extend `VisualEffects` class)
- Add new particle effects (extend `ParticleSystem` class)
- Add new piece types (extend `PieceGenerator` class)
- Add new themes (add to `themes` object)
- Add new shaders (add to `webgpu/shaders.ts`)
- Implement different rotation systems (create new rotation module)
- Add different scoring systems (create new scoring module)
