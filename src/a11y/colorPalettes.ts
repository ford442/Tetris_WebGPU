/**
 * Color palettes for piece tinting (indices 1–7 = I,O,T,S,Z,J,L).
 * Designed for distinguishability under deuteranopia / protanopia / high contrast.
 */

export type ColorPaletteId = 'default' | 'deuteranopia' | 'protanopia' | 'highContrast';

export const COLOR_PALETTE_IDS: ColorPaletteId[] = [
  'default',
  'deuteranopia',
  'protanopia',
  'highContrast',
];

export const COLOR_PALETTE_LABELS: Record<ColorPaletteId, string> = {
  default: 'Default (neon glass)',
  deuteranopia: 'Deuteranopia-friendly',
  protanopia: 'Protanopia-friendly',
  highContrast: 'High contrast',
};

/** Piece + garbage cell colors (0–8). */
export type PieceColorMap = Record<number, number[]>;

const GARBAGE = [0.42, 0.44, 0.52] as const;

export const PIECE_PALETTES: Record<ColorPaletteId, PieceColorMap> = {
  default: {
    0: [0.3, 0.3, 0.3],
    1: [0.95, 0.98, 1.0],
    2: [0.92, 0.95, 1.0],
    3: [1.0, 0.96, 0.92],
    4: [1.0, 1.0, 0.95],
    5: [0.92, 1.0, 0.95],
    6: [0.96, 0.92, 1.0],
    7: [1.0, 0.94, 0.96],
    8: [...GARBAGE],
  },
  /** Blue / yellow / purple cues — minimal red–green reliance. */
  deuteranopia: {
    0: [0.25, 0.25, 0.28],
    1: [0.35, 0.78, 1.0],   // I — cyan
    2: [1.0, 0.88, 0.15],   // O — yellow
    3: [0.72, 0.42, 1.0],   // T — purple
    4: [0.15, 0.92, 0.95],  // S — teal
    5: [1.0, 0.52, 0.12],   // Z — orange
    6: [0.22, 0.48, 0.98],  // J — blue
    7: [0.95, 0.72, 0.08],  // L — gold
    8: [...GARBAGE],
  },
  /** Shift warm hues toward orange / amber for protanopia. */
  protanopia: {
    0: [0.25, 0.25, 0.28],
    1: [0.55, 0.85, 1.0],   // I
    2: [1.0, 0.92, 0.25],   // O
    3: [0.85, 0.35, 0.95],  // T — magenta-purple
    4: [0.1, 0.85, 0.88],   // S — cyan
    5: [1.0, 0.45, 0.05],   // Z — deep orange
    6: [0.15, 0.35, 0.92],  // J — blue
    7: [1.0, 0.65, 0.0],    // L — orange
    8: [...GARBAGE],
  },
  /** WCAG-oriented primaries — max hue separation. */
  highContrast: {
    0: [0.15, 0.15, 0.18],
    1: [0.75, 0.95, 1.0],   // I — ice
    2: [1.0, 1.0, 0.0],     // O — yellow
    3: [1.0, 0.0, 0.85],    // T — magenta
    4: [0.0, 1.0, 0.45],    // S — green
    5: [1.0, 0.15, 0.15],   // Z — red
    6: [0.15, 0.35, 1.0],   // J — blue
    7: [1.0, 0.55, 0.0],    // L — orange
    8: [0.55, 0.58, 0.65],
  },
};

export function parseColorPaletteId(raw: string | null | undefined): ColorPaletteId {
  if (raw === 'deuteranopia' || raw === 'protanopia' || raw === 'highContrast') return raw;
  return 'default';
}

/** Pairwise RGB distance — quick distinctness check for tests. */
export function paletteMinPairwiseDistance(palette: PieceColorMap): number {
  const keys = [1, 2, 3, 4, 5, 6, 7];
  let min = Infinity;
  for (let i = 0; i < keys.length; i++) {
    for (let j = i + 1; j < keys.length; j++) {
      const a = palette[keys[i]];
      const b = palette[keys[j]];
      const d = Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
      if (d < min) min = d;
    }
  }
  return min;
}
