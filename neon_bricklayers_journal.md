## NEON BRICKLAYER'S JOURNAL - VISUAL LOG

**Date:** 2026-05-06

**Record what makes the game "pop":**
- "Adding additive blending to the particle shader makes the explosions look like real light." (Verified already active)
- "Screen shake should decay exponentially, not linearly, for a snappier feel." (Verified already active)
- "Juiced up the shockwave on hard drops by multiplying its width and distortion strength by 1.5 in both the enhanced and material-aware post-processing shaders, giving it a much heavier, crunchier impact." (Verified already active)
- "Added a gentle sine wave 'breathing' pulse to the ghost piece's alpha channel. It makes the piece look like glowing neon rather than static hologram wireframe." (Verified already active)
- "Increased the hard drop particle speed multiplier from 1.5x to 2.0x. The particles now explode outward with much more explosive force, adding an incredibly satisfying sense of heavy impact and 'crunch' to fast locks!"
- "Massively boosted the Chromatic Aberration during shockwaves. Pushing the Red and Blue channels apart vertically and horizontally makes Hard Drops feel like they are tearing the screen apart!"
- "Amplified the camera shake scaling and shockwave ripple speed on Hard Drops to make high-distance drops feel earth-shattering."
- "Changed Neon Bloom decay to use true exponential decay (\`Math.exp(-dt * 10.0)\`) instead of algebraic decay. This makes the flashes hit instantly and dissipate smoothly, drastically improving the game feel."
- "Adding Neon Bloom flash on T-Spin locks significantly enhances the rewarding feel of setting them up."
- "Added 'Supernova' Line Clears: triggering a massive Neon Bloom Flash that scales with the number of lines cleared. Tetrises and T-Spins now visually explode like a localized supernova!"
- "Added 'Warp Surge' on big plays: tetrises and T-Spins now significantly distort the hyperspace tunnel background, making the big clears feel even more chaotic and impactful."
- "Enhanced the Subliminal Reinforcement system to use bright white/cyan neon text shadows, added a snappy scale transform on flashes, and integrated a subtle Neon Bloom flash in the WebGPU pipeline during strong cues to increase the visceral impact of positive reinforcement."
- "Verified all requested game feel and visual features are present. The Infinity lock resets, T-Spins, level-reactive backgrounds, and bloom/chromatic aberration on shockwaves have already been flawlessly implemented in the engine."
- "Replaced the subtle white ghost scanlines with intense, cyan/blue colored holographic scan overlays (`vec3<f32>(0.2, 0.8, 1.0) * (scanEffect + horizontalScan) * 5.0`). This significantly enhances the 'neon hologram' vibe of the ghost piece!"
- "Adding additive blending to the particle shader makes the explosions look like real light."
- "Screen shake should decay exponentially, not linearly, for a snappier feel."
- "Added a Shockwave distortion effect on Hard Drops. Modifed viewWebGPU.ts to add a shockwaveParams uniform and updated the fragment shader. Updated game.ts to trigger the effect flag in hardDrop()."
- "Upgraded block shaders to include Fresnel Rim Lighting for a glowing edge effect, and added a dynamic Pulse effect to the blocks to make them feel alive."
- "Implemented Bloom and Chromatic Aberration post-processing passes to emphasize the cyberpunk neon style."
- "Evolved the BackgroundShaders to react to the Game Level: calm blue at Level 1 transitioning to chaotic red at Level 10."
- "Tuned Game Feel: Ensured Infinity lock delay mechanics feel generous but fair by resetting the lock timer up to 15 times on move/rotate. Verified SRS logic for smooth wall kicks and T-Spins."
- "Ensured DAS (Delayed Auto Shift) and ARR (Auto Repeat Rate) are perfectly tuned for sub-50ms input latency."
- "Verified that the maximum particle count is capped to prevent browser lag while maintaining high-impact visual explosions."
- "Modified postProcess.ts and materialAwarePostProcess.ts to incorporate `aberrationPulse` so that hard drops look like they tear the screen apart by pushing Red and Blue color channels away!"

- "Implemented a massive 'Black Hole' gravitational lensing distortion and cyan event horizon glow in the post-processing pipeline, triggered on Tetris clears, causing the entire board to suck inward into a singularity!"
- "Reduced MAX_LOCK_RESETS to 15 for tighter Infinity feel."
- "Enhanced hard-drop shockwave distortion + aberration (WGSL) for juicy impact."
