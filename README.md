# Tetris_WebGPU

live demo : https://konstantin84ukr.github.io/Tetris_WebGPU/


Test on Google Chrome Canary  v96.0.4648.2
chrome://flags/  
Unsafe WebGPU  = Enabled

## Experimental Features

**Positive Reinforcement Subliminal System** (visual cues)

An optional, research-oriented feature that flashes short positive words (e.g. "Flow", "Precision", "Momentum", "Zenith") for 25–45 ms during meaningful gameplay moments (line clears, T-spins, level-ups, new high scores) plus gentle background reinforcement every ~45–90 seconds of active play.

- Toggle: Pause menu → "EXPERIMENTAL" section → "Positive Reinforcement"
- Default: Enabled (clearly labeled experimental; disable instantly)
- Styling: Gold glowing text matching the project's neon/glass aesthetic
- Performance: Negligible (event-driven, long cooldown)
- Future: Audio chimes, customization, self-experiment A/B logging (see GitHub issues)

This is **entirely optional** and designed for transparency. It has zero effect on scoring or core mechanics.

See the pause menu during play to enable/disable.
