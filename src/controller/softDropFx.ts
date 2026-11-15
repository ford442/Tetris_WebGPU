/**
 * Soft-drop particle trails. The particle system is a WebGPU-view extra that the IView
 * contract does not (and should not) expose, so it is reached through a narrow structural
 * type instead of an `any` cast.
 */

import type Game from '../game.js';
import type { IView } from '../view/IView.js';

interface ParticleEmitter {
  emitParticlesRadial(
    x: number,
    y: number,
    z: number,
    angle: number,
    speed: number,
    color: [number, number, number, number],
  ): void;
}

function particleSystemOf(view: IView): ParticleEmitter | null {
  return (view as unknown as { particleSystem?: ParticleEmitter }).particleSystem ?? null;
}

const TRAIL_COLOR: [number, number, number, number] = [0.2, 0.8, 1.0, 0.4]; // subtle cyan

/** Two scattered sparks at the active piece — a fresh soft-drop key press. */
export function emitSoftDropBurst(game: Game, view: IView): void {
  const particles = particleSystemOf(view);
  const piece = game.activPiece;
  if (!particles || !piece) return;
  const worldX = (piece.x + 1.5) * 2.2;
  const worldY = (piece.y + 1.5) * -2.2;
  for (let i = 0; i < 2; i++) {
    const spreadX = (Math.random() - 0.5) * 2.0;
    const spreadY = (Math.random() - 0.5) * 2.0;
    particles.emitParticlesRadial(
      worldX + spreadX, worldY + spreadY, 0.0,
      Math.PI / 2 + (Math.random() - 0.5) * 0.5,
      10.0 + Math.random() * 10.0,
      TRAIL_COLOR,
    );
  }
}

/** One very subtle spark per held-soft-drop step (DAS/ARR repeat). */
export function emitSoftDropTrail(game: Game, view: IView): void {
  const particles = particleSystemOf(view);
  const piece = game.activPiece;
  if (!particles || !piece) return;
  particles.emitParticlesRadial(
    (piece.x + 1.5) * 2.2, (piece.y + 1.5) * -2.2, 0.0,
    Math.PI / 2 + (Math.random() - 0.5) * 0.5,
    5.0 + Math.random() * 10.0,
    TRAIL_COLOR,
  );
}
