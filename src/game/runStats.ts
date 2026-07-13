/**
 * Per-run gameplay statistics for the post-game summary screen.
 */

export interface RunStatsSnapshot {
  piecesPlaced: number;
  moves: number;
  rotations: number;
  hardDrops: number;
  finesseFaults: number;
  peakCombo: number;
  peakB2BChain: number;
  elapsedMs: number;
  pps: number;
  apm: number;
}

export class RunStats {
  piecesPlaced = 0;
  moves = 0;
  rotations = 0;
  hardDrops = 0;
  finesseFaults = 0;
  peakCombo = 0;
  peakB2BChain = 0;
  private b2bChain = 0;
  private elapsedMs = 0;

  reset(): void {
    this.piecesPlaced = 0;
    this.moves = 0;
    this.rotations = 0;
    this.hardDrops = 0;
    this.finesseFaults = 0;
    this.peakCombo = 0;
    this.peakB2BChain = 0;
    this.b2bChain = 0;
    this.elapsedMs = 0;
  }

  tick(dtMs: number): void {
    if (dtMs > 0) this.elapsedMs += dtMs;
  }

  recordMove(): void {
    this.moves++;
  }

  recordRotate(): void {
    this.rotations++;
  }

  recordHardDrop(): void {
    this.hardDrops++;
  }

  /** Inputs that did not change board state (failed move/rotate). */
  recordFinesseFault(): void {
    this.finesseFaults++;
  }

  onPieceLocked(): void {
    this.piecesPlaced++;
  }

  onLineClear(combo: number, backToBack: boolean): void {
    if (combo > this.peakCombo) this.peakCombo = combo;
    if (backToBack) {
      this.b2bChain++;
      if (this.b2bChain > this.peakB2BChain) this.peakB2BChain = this.b2bChain;
    } else {
      this.b2bChain = 0;
    }
  }

  snapshot(elapsedOverrideMs?: number): RunStatsSnapshot {
    const elapsedMs = elapsedOverrideMs ?? this.elapsedMs;
    const minutes = Math.max(elapsedMs / 60000, 1 / 60000);
    const pps = this.piecesPlaced / (elapsedMs / 1000);
    const apm = (this.moves + this.rotations + this.hardDrops) / minutes;
    return {
      piecesPlaced: this.piecesPlaced,
      moves: this.moves,
      rotations: this.rotations,
      hardDrops: this.hardDrops,
      finesseFaults: this.finesseFaults,
      peakCombo: this.peakCombo,
      peakB2BChain: this.peakB2BChain,
      elapsedMs,
      pps: Number.isFinite(pps) ? pps : 0,
      apm: Number.isFinite(apm) ? apm : 0,
    };
  }
}

export function formatShareScoreString(options: {
  modeLabel: string;
  score: number;
  lines: number;
  level: number;
  stats: RunStatsSnapshot;
  isVictory?: boolean;
}): string {
  const { modeLabel, score, lines, level, stats, isVictory } = options;
  const tag = isVictory ? 'CLEAR' : 'RUN';
  return [
    `Tetris WebGPU ${tag}`,
    modeLabel,
    `Score ${score.toLocaleString()}`,
    `L${level}`,
    `${lines} lines`,
    `${stats.pps.toFixed(2)} PPS`,
    `${Math.round(stats.apm)} APM`,
    stats.peakCombo > 1 ? `Combo x${stats.peakCombo}` : null,
    stats.peakB2BChain > 1 ? `B2B x${stats.peakB2BChain}` : null,
  ].filter(Boolean).join(' | ');
}
