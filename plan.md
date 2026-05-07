## Analysis
The user wants to enhance the visual effects and game-feel as "The Neon Bricklayer", focusing on the core philosophy of "JUICE". Specifically, the prompt mentions:
- Visual feedback on actions (move, rotate, land, clear).
- Hard drops feeling heavy (screen shake, particles, shockwave).
- Backgrounds reacting to the game level.

Looking through the code, I can see a lot of "NEON BRICKLAYER" annotations already exist for these specific things:
1. `src/game.ts` has `// NEON BRICKLAYER: Trigger Hard Drop Shockwave (Juice) - Params tuned in View`
2. `src/webgpu/compute.ts` has `// --- SHOCKWAVE INTERACTION (NEON BRICKLAYER) ---`
3. `src/webgpu/shaders/postProcess.ts` has `// NEON BRICKLAYER: Use speed from params.w`
4. `src/webgpu/shaders/background.ts` has `// NEON BRICKLAYER: More dramatic shift from Calm Blue to Chaotic Red/Purple` and `// NEON BRICKLAYER: HYPERSPACE TUNNEL DISTORTION`
5. `src/controller.ts` has `// NEON BRICKLAYER: DAS Trail`

The problem is the user wants me to follow the "NEON BRICKLAYER" process to add a "Shockwave" distortion effect on Hard Drops.
Wait, is the prompt just giving me a persona and I should add a feature or verify something?
The prompt is literally an agent definition, and it says:
"Your goal is to transform a functional block game into a visual spectacle that feels responsive and satisfying to play.
...
### 3. 🔨 IMPLEMENTATION
- **Effect:** 'I am adding a "Shockwave" distortion effect on Hard Drops.'
- **Code:** Modify `viewWebGPU.ts` to add a `shockwaveParams` uniform and update the fragment shader.
- **Logic:** Update `game.ts` to trigger the effect flag in `hardDrop()`."

Wait, this was *already* implemented! Let's look closely at `src/game.ts`:
```typescript
    // Trigger visual effect
    // NEON BRICKLAYER: Trigger Hard Drop Shockwave (Juice) - Params tuned in View
    this.effectEvent = 'hardDrop';
    this.effectCounter++;
```
But `this.effectEvent = 'hardDrop';` doesn't actually trigger anything in `viewGameEvents.ts` anymore! It used to be checked via `if (state.effectEvent === 'hardDrop')`, but now `onHardDrop` is called directly from `controller.ts`!

Ah! Wait, `game.ts`'s `update()` returns a result containing `linesCleared`, `locked`, `gameOver`, `tSpin`. It does NOT return `hardDrop`.
`controller.ts` calls `this.viewWebGPU.onHardDrop(...)`!
Wait, the user wants me to execute the tasks outlined in the prompt or fix an issue?
Wait, if `viewWebGPU.onHardDrop(...)` is already called, and it DOES trigger shockwave:
```typescript
// in src/webgpu/viewGameEvents.ts:
export function triggerImpactEffects(view: any, worldX: number, impactY: number, distance: number): void {
  // ...
  view.visualEffects.triggerShockwave([uvX, uvY], width, strength, aberration, speed);
  // ...
}

export function onHardDrop(...) {
  // ...
  triggerImpactEffects(view, worldX, impactY, distance);
}
```
Wait, the prompt says:
```
## DAILY PROCESS
### 1. 🎨 VISUAL ENHANCEMENT (WebGPU)
Scan `src/viewWebGPU.ts` and `src/shaders/` for opportunities:
- **Shader Polish:** Upgrade `ParticleShaders` or `CubeData` shaders. Add "Fresnel Rim Lighting" or "Pulse" effects to the blocks.
- **Post-Processing:** Implement a "Bloom" or "Chromatic Aberration" pass in the `Frame()` loop.
- **Backgrounds:** Evolve the `BackgroundShaders` to react to the Game Level (e.g., calm blue at Lvl 1, chaotic red at Lvl 10).
```
Is this an instruction for me to *perform* these tasks, or is it just the user *pasting* the agent definition they want me to adopt, and I should enact it?
Wait, the prompt itself is:
"AGENT: THE NEON BRICKLAYER 🧱 (Graphics & Game Feel) ... Your goal is to transform a functional block game into a visual spectacle..."
Since the project already has "NEON BRICKLAYER" comments all over it, maybe I should just look for things that are missing from the list?
1. Fresnel Rim Lighting or Pulse effects?
Let's check `src/webgpu/shaders/main.ts` and `src/webgpu/shaders/pbrBlocks.ts`.
