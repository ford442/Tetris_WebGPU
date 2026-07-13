/**
 * Theme — image-sampled blocks from block.png.
 * Piece tints come from color palettes (default / colorblind / high-contrast).
 */

import { allLevelVideoPaths } from '../config/videoConfig.js';
import {
  type ColorPaletteId,
  PIECE_PALETTES,
  parseColorPaletteId,
} from '../a11y/colorPalettes.js';

export type { ColorPaletteId };

export interface ThemeColors {
  [key: number]: number[];
  border: number[];
  levelVideos?: string[];
  backgroundColors: number[][];
  materialTheme: 'imageSampled';
  paletteId?: ColorPaletteId;
}

export interface Themes {
  imageSampled: ThemeColors;
}

const availableVideos = allLevelVideoPaths();

export const ThemeVideos = {
  Default: availableVideos,
};

const BASE_THEME = {
  border: [0.75, 0.68, 0.45] as number[],
  levelVideos: ThemeVideos.Default,
  backgroundColors: [
    [0.1, 0.1, 0.12],
    [0.14, 0.13, 0.16],
    [0.08, 0.08, 0.1],
  ],
  materialTheme: 'imageSampled' as const,
};

/** Build theme colors for a palette id. */
export function buildThemeColors(paletteId: ColorPaletteId = 'default'): ThemeColors {
  const piece = PIECE_PALETTES[paletteId];
  return {
    ...piece,
    ...BASE_THEME,
    paletteId,
  };
}

/** @deprecated use buildThemeColors — kept for imports */
export const themes: Themes = {
  imageSampled: buildThemeColors('default'),
};

export const DEFAULT_THEME_NAME: keyof Themes = 'imageSampled';

export function applyPaletteToTheme(
  theme: ThemeColors,
  paletteId: ColorPaletteId,
): ThemeColors {
  const piece = PIECE_PALETTES[paletteId];
  return {
    ...theme,
    ...piece,
    paletteId,
    border: theme.border,
    levelVideos: theme.levelVideos,
    backgroundColors: theme.backgroundColors,
    materialTheme: theme.materialTheme,
  };
}

export { parseColorPaletteId };
