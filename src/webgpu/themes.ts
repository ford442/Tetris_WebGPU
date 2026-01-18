/**
 * Theme System
 * Contains theme definitions and color management for the game
 */

// Type definitions for themes
export interface ThemeColors {
  [key: number]: number[];
  border: number[];
  levelVideos?: string[];
  backgroundColors: number[][]; // [color1, color2, color3]
}

export interface Themes {
  pastel: ThemeColors;
  neon: ThemeColors;
  future: ThemeColors;
}

// Default level videos used across all themes
const DEFAULT_LEVEL_VIDEOS = [
  './assets/video/bg1.mp4',
  './assets/video/bg2.mp4',
  './assets/video/bg3.mp4',
  './assets/video/bg4.mp4',
  './assets/video/bg5.mp4',
  './assets/video/bg6.mp4',
  './assets/video/bg7.mp4',
  './assets/video/bg8.mp4'
];

export const themes: Themes = {
  pastel: {
    0: [0.3, 0.3, 0.3],
    1: [0.69, 0.92, 0.95], // I
    2: [0.73, 0.87, 0.98], // J
    3: [1.0, 0.8, 0.74],   // L
    4: [1.0, 0.98, 0.77], // O
    5: [0.78, 0.9, 0.79],  // S
    6: [0.88, 0.75, 0.91], // T
    7: [1.0, 0.8, 0.82],   // Z
    border: [0.82, 0.77, 0.91],
    levelVideos: DEFAULT_LEVEL_VIDEOS,
    backgroundColors: [
      [1.0, 0.8, 0.82],   // Pink
      [0.69, 0.92, 0.95], // Mint
      [0.88, 0.75, 0.91]  // Lavender
    ]
  },
  neon: {
    0: [0.1, 0.1, 0.1],
    1: [0.0, 1.0, 1.0], // Cyan for I
    2: [0.0, 0.0, 1.0], // Blue for J
    3: [1.0, 0.5, 0.0], // Orange for L
    4: [1.0, 1.0, 0.0], // Yellow for O
    5: [0.0, 1.0, 0.0], // Green for S
    6: [0.5, 0.0, 1.0], // Purple for T
    7: [1.0, 0.0, 0.0], // Red for Z
    border: [1.0, 1.0, 1.0],
    levelVideos: DEFAULT_LEVEL_VIDEOS,
    backgroundColors: [
      [0.0, 0.9, 1.0], // Neon Cyan
      [0.8, 0.3, 1.0], // Neon Purple
      [0.2, 0.5, 1.0]  // Neon Blue
    ]
  },
  future: {
    0: [0.1, 0.1, 0.1],
    1: [0.0, 0.9, 0.9], // Cyan
    2: [0.0, 0.2, 0.9], // Blue
    3: [0.9, 0.4, 0.0], // Orange
    4: [0.9, 0.9, 0.0], // Yellow
    5: [0.0, 0.9, 0.0], // Green
    6: [0.6, 0.0, 0.9], // Purple
    7: [0.9, 0.0, 0.0], // Red
    border: [0.5, 0.8, 1.0],
    levelVideos: DEFAULT_LEVEL_VIDEOS,
    backgroundColors: [
      [0.0, 0.9, 0.9], // Cyan
      [0.6, 0.0, 0.9], // Purple
      [0.0, 0.2, 0.9]  // Deep Blue
    ]
  }
};
