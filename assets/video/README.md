# Video Background Assets

Place video files `bg1.mp4` through `bg7.mp4` in this directory to use them as background videos for different game levels.

## Level-Based Video Mapping

The videos will automatically change as the player progresses through levels:
- `bg1.mp4` - Level 0
- `bg2.mp4` - Level 1
- `bg3.mp4` - Level 2
- `bg4.mp4` - Level 3
- `bg5.mp4` - Level 4
- `bg6.mp4` - Level 5
- `bg7.mp4` - Level 6
- `bg8.mp4` - Level 7+

If a player reaches level 8 or higher, the game will continue to use `bg8.mp4`.

## Display Behavior

The video will automatically be sized and positioned to fit within the Tetris game board area (the inner playfield), maintaining aspect ratio with `object-fit: contain`. The video will not cover the entire screen - it stays within the game borders.

## Supported formats
- MP4 (`.mp4`)
- WebM (`.webm`)
- Ogg (`.ogg`)

## Fallback Behavior
If a video file fails to load or is not found, the game will automatically fall back to the procedural shader-based background for that level.

## Note
All videos loop continuously and play muted. The level calculation is: `level = Math.floor(lines * 0.1)`, so every 10 lines cleared advances one level.
