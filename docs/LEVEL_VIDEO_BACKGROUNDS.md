# Level-Based Video Background Implementation

## Overview
This implementation adds support for displaying different background videos for each game level in the Tetris WebGPU game. Videos are automatically sized and positioned within the game board area and switch seamlessly as the player progresses through levels.

## Key Changes

### 1. Theme Configuration (`src/viewWebGPU.ts`)
- **Changed**: `backgroundVideo` (single string) → `levelVideos` (array of 8 strings)
- **Purpose**: Support multiple videos mapped to different levels
- **Implementation**: Each theme (pastel, neon, future) now has a `levelVideos` array containing paths to bg1.mp4 through bg8.mp4

### 2. Level Tracking
- **Added**: `currentLevel` property to View class
- **Purpose**: Track the current game level to detect changes
- **Initial Value**: 0 (starts at level 0)

### 3. Video Update Logic (`updateVideoForLevel()` method)
- **Purpose**: Handle video switching when level changes
- **Features**:
  - Caps level to available videos (uses last video for levels 6+)
  - Only updates video source if it's different (prevents unnecessary reloads)
  - Handles missing videos gracefully (falls back to shader background)
  - Manages video playback state and error handling

### 4. Level Change Detection (`renderMainScreen()`)
- **Added**: Level change detection at the start of `renderMainScreen()`
- **Logic**: 
  ```typescript
  if (state.level !== this.currentLevel) {
    this.currentLevel = state.level;
    this.updateVideoForLevel(this.currentLevel);
  }
  ```
- **Purpose**: Automatically switch videos when the player advances to a new level

### 5. Theme Initialization (`setTheme()`)
- **Changed**: Now initializes with level 0 video instead of single background video
- **Logic**: Calls `updateVideoForLevel(0)` when theme is changed
- **Purpose**: Ensure video starts correctly when user switches themes

## Video Mapping

| Level | Video File | Lines Cleared |
|-------|-----------|---------------|
| 0     | bg1.mp4   | 0-9           |
| 1     | bg2.mp4   | 10-19         |
| 2     | bg3.mp4   | 20-29         |
| 3     | bg4.mp4   | 30-39         |
| 4     | bg5.mp4   | 40-49         |
| 5     | bg6.mp4   | 50-59         |
| 6     | bg7.mp4   | 60-69         |
| 7+    | bg8.mp4   | 70+           |

Note: Level is calculated as `Math.floor(lines * 0.1)` in `src/game.ts`

## Video Positioning and Sizing
- Videos are positioned using CSS to fit within the game board's inner area
- Properties set in `updateVideoPosition()`:
  - `position: absolute`
  - `left`, `top`: Position relative to playfield inner area
  - `width`, `height`: Match playfield inner dimensions
  - `object-fit: contain`: Maintain aspect ratio
  - `z-index: -1`: Behind the WebGPU canvas

## Fallback Behavior
1. If a video fails to load → falls back to shader-based background
2. If no videos are configured for a theme → uses shader background
3. If level exceeds available videos → uses the last video (bg8.mp4)

## Testing
To test the implementation:
1. Place video files (bg1.mp4 - bg8.mp4) in `assets/video/` directory
2. Start the game with `npm run dev`
3. Play until you clear 10 lines (advances to level 1)
4. Video should automatically switch to bg2.mp4
5. Continue to test additional level transitions

Use the provided `create-placeholder-videos.sh` script to generate simple colored placeholder videos for testing.

## Browser Compatibility
- Requires WebGPU support (Chrome/Edge 113+, Safari Technology Preview)
- HTML5 video support (all modern browsers)
- Recommended video formats: MP4 (H.264), WebM (VP9)

## Performance Considerations
- Video switching is optimized to only update when level changes
- Videos loop continuously (no reload on loop)
- Videos are muted to avoid audio overlap
- Only one video plays at a time per theme
