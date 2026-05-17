/**
 * Theme System
 * Contains theme definitions and color management for the game
 * Now with Material-aware rendering support
 */

import { MaterialThemes } from './materials.js';

// Type definitions for themes
export interface ThemeColors {
  [key: number]: number[];
  border: number[];
  levelVideos?: string[];
  backgroundColors: number[][]; // [color1, color2, color3]
  materialTheme?: string; // NEW: Material preset name
}

export interface Themes {
  pastel: ThemeColors;
  neon: ThemeColors;
  future: ThemeColors;
  gold: ThemeColors;    // NEW
  glass: ThemeColors;   // NEW
  premium: ThemeColors; // NEW
  cyber: ThemeColors;   // NEW
  chrome: ThemeColors;  // NEW
  imageSampled: ThemeColors; // NEW: Direct block.png sampling
}

// Theme-specific video playlists - full bg1–bg15 sequence
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
  Space: availableVideos,
  Underwater: availableVideos,
  Cyberpunk: availableVideos,
  Ethereal: availableVideos,
  Default: availableVideos
};

// Backward compatibility
const DEFAULT_LEVEL_VIDEOS = ThemeVideos.Default;

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
    levelVideos: ThemeVideos.Ethereal,
    backgroundColors: [
      [1.0, 0.8, 0.82],   // Pink
      [0.69, 0.92, 0.95], // Mint
      [0.88, 0.75, 0.91]  // Lavender
    ],
    materialTheme: 'classic'
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
    levelVideos: ThemeVideos.Cyberpunk,
    backgroundColors: [
      [0.0, 0.9, 1.0], // Neon Cyan
      [0.8, 0.3, 1.0], // Neon Purple
      [0.2, 0.5, 1.0]  // Neon Blue
    ],
    materialTheme: 'classic'
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
    levelVideos: ThemeVideos.Space,
    backgroundColors: [
      [0.0, 0.9, 0.9], // Cyan
      [0.6, 0.0, 0.9], // Purple
      [0.0, 0.2, 0.9]  // Deep Blue
    ],
    materialTheme: 'chrome'
  },
  // NEW: Gold theme - all pieces rendered as gold
  gold: {
    0: [0.3, 0.3, 0.3],
    1: [1.0, 0.84, 0.0],
    2: [1.0, 0.8, 0.1],
    3: [0.98, 0.78, 0.05],
    4: [1.0, 0.85, 0.15],
    5: [0.95, 0.75, 0.0],
    6: [1.0, 0.82, 0.12],
    7: [0.97, 0.79, 0.08],
    border: [0.83, 0.69, 0.22],
    levelVideos: ThemeVideos.Space,
    backgroundColors: [
      [0.4, 0.3, 0.1],
      [0.6, 0.45, 0.15],
      [0.3, 0.2, 0.05]
    ],
    materialTheme: 'gold'
  },
  // NEW: Glass theme - refractive transparent blocks
  glass: {
    0: [0.2, 0.2, 0.2],
    1: [0.7, 0.9, 1.0],
    2: [0.6, 0.7, 1.0],
    3: [1.0, 0.8, 0.7],
    4: [1.0, 0.95, 0.8],
    5: [0.7, 1.0, 0.8],
    6: [0.9, 0.7, 1.0],
    7: [1.0, 0.7, 0.75],
    border: [0.9, 0.95, 1.0],
    levelVideos: ThemeVideos.Underwater,
    backgroundColors: [
      [0.1, 0.15, 0.25],
      [0.15, 0.2, 0.35],
      [0.08, 0.12, 0.2]
    ],
    materialTheme: 'glass'
  },
  // NEW: Premium theme - mixed gems and metals
  premium: {
    0: [0.2, 0.2, 0.2],
    1: [0.9, 0.1, 0.15],  // I - Ruby
    2: [0.1, 0.3, 0.9],   // J - Sapphire
    3: [1.0, 0.78, 0.28], // L - Gold
    4: [0.95, 0.95, 0.95],// O - Chrome
    5: [0.1, 0.9, 0.3],   // S - Emerald
    6: [0.95, 0.98, 1.0], // T - Glass
    7: [0.9, 0.1, 0.15],  // Z - Ruby
    border: [0.8, 0.7, 0.5],
    levelVideos: ThemeVideos.Space,
    backgroundColors: [
      [0.2, 0.1, 0.15],
      [0.15, 0.1, 0.2],
      [0.1, 0.15, 0.2]
    ],
    materialTheme: 'premium'
  },
  // NEW: Cyber theme - neon emissive edges
  cyber: {
    0: [0.05, 0.05, 0.05],
    1: [0.0, 1.0, 0.8],   // I - Cyan neon
    2: [0.8, 0.0, 1.0],   // J - Purple neon
    3: [1.0, 0.5, 0.0],   // L - Orange neon
    4: [1.0, 1.0, 0.0],   // O - Yellow neon
    5: [0.0, 1.0, 0.0],   // S - Green neon
    6: [1.0, 0.0, 0.5],   // T - Pink neon
    7: [1.0, 0.0, 0.0],   // Z - Red neon
    border: [0.0, 0.8, 1.0],
    levelVideos: ThemeVideos.Cyberpunk,
    backgroundColors: [
      [0.0, 0.1, 0.15],
      [0.05, 0.0, 0.1],
      [0.02, 0.08, 0.12]
    ],
    materialTheme: 'cyber'
  },
  // NEW: Chrome theme - mirror-like reflections
  chrome: {
    0: [0.3, 0.3, 0.3],
    1: [0.95, 0.95, 0.95],
    2: [0.9, 0.9, 0.9],
    3: [0.92, 0.92, 0.92],
    4: [0.88, 0.88, 0.88],
    5: [0.94, 0.94, 0.94],
    6: [0.91, 0.91, 0.91],
    7: [0.93, 0.93, 0.93],
    border: [0.7, 0.7, 0.7],
    levelVideos: ThemeVideos.Space,
    backgroundColors: [
      [0.15, 0.15, 0.2],
      [0.2, 0.2, 0.25],
      [0.1, 0.1, 0.15]
    ],
    materialTheme: 'chrome'
  },
  // NEW: Image Sampled - uses block.png texture directly
  imageSampled: {
    0: [0.3, 0.3, 0.3],
    1: [1.0, 1.0, 1.0],
    2: [1.0, 1.0, 1.0],
    3: [1.0, 1.0, 1.0],
    4: [1.0, 1.0, 1.0],
    5: [1.0, 1.0, 1.0],
    6: [1.0, 1.0, 1.0],
    7: [1.0, 1.0, 1.0],
    border: [0.7, 0.7, 0.7],
    levelVideos: ThemeVideos.Space,
    backgroundColors: [
      [0.1, 0.1, 0.1],
      [0.15, 0.15, 0.15],
      [0.08, 0.08, 0.08]
    ],
    materialTheme: 'imageSampled'
  },
};
