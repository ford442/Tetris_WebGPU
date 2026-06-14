/**
 * Theme — image-sampled blocks from block.png only.
 * Piece colors are light tints for stained-glass; gold frame comes from the texture.
 */

export interface ThemeColors {
  [key: number]: number[];
  border: number[];
  levelVideos?: string[];
  backgroundColors: number[][];
  materialTheme: 'imageSampled';
}

export interface Themes {
  imageSampled: ThemeColors;
}

const availableVideos = [
  './assets/video/bg1.mp4',
  './assets/video/bg2.mp4',
  './assets/video/bg3.mp4',
  './assets/video/bg4.mp4',
  './assets/video/bg5.mp4',
  './assets/video/bg6.mp4',
  './assets/video/bg7.mp4',
  './assets/video/bg8.mp4',
  './assets/video/bg9.mp4',
  './assets/video/bg10.mp4',
  './assets/video/bg11.mp4',
  './assets/video/bg12.mp4',
  './assets/video/bg13.mp4',
  './assets/video/bg14.mp4',
  './assets/video/bg15.mp4',
];

export const ThemeVideos = {
  Default: availableVideos,
};

/** Sole visual theme — block.png gold frame + stained-glass crystal. */
export const themes: Themes = {
  imageSampled: {
    0: [0.3, 0.3, 0.3],
    1: [0.95, 0.98, 1.0],
    2: [0.92, 0.95, 1.0],
    3: [1.0, 0.96, 0.92],
    4: [1.0, 1.0, 0.95],
    5: [0.92, 1.0, 0.95],
    6: [0.96, 0.92, 1.0],
    7: [1.0, 0.94, 0.96],
    border: [0.75, 0.68, 0.45],
    levelVideos: ThemeVideos.Default,
    backgroundColors: [
      [0.1, 0.1, 0.12],
      [0.14, 0.13, 0.16],
      [0.08, 0.08, 0.1],
    ],
    materialTheme: 'imageSampled',
  },
};

export const DEFAULT_THEME_NAME: keyof Themes = 'imageSampled';
