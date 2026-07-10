const fs = require('fs');

// Add CSS keyframes and animations to css/themes.css
let themesCss = fs.readFileSync('css/themes.css', 'utf8');

const cssToAdd = `
@keyframes neon-pulse-hover {
  0% { box-shadow: 0 0 5px var(--border-color), inset 0 0 2px var(--border-color); }
  50% { box-shadow: 0 0 15px var(--border-color), inset 0 0 8px var(--border-color); }
  100% { box-shadow: 0 0 5px var(--border-color), inset 0 0 2px var(--border-color); }
}

@keyframes swap-whoosh {
  0% { transform: scale(1); filter: brightness(1) saturate(1); }
  50% { transform: scale(1.15); filter: brightness(2) saturate(2); }
  100% { transform: scale(1); filter: brightness(1) saturate(1); }
}

.hold-piece-container, .next-piece-container {
  animation: neon-pulse-hover 4s infinite ease-in-out;
  transition: transform 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275);
}

.hold-piece-container:hover, .next-piece-container:hover {
  transform: scale(1.05);
}

.swap-whoosh-active {
  animation: swap-whoosh 0.25s cubic-bezier(0.175, 0.885, 0.32, 1.275) !important;
}
`;

themesCss += cssToAdd;
fs.writeFileSync('css/themes.css', themesCss);

// Add the swap-whoosh class toggle in src/controller.ts when hold happens
let controllerTs = fs.readFileSync('src/controller.ts', 'utf8');

controllerTs = controllerTs.replace(
  /this\.game\.hold\(\);/g,
  `$&
              const holdEl = document.querySelector('.hold-piece-container');
              if (holdEl) {
                  holdEl.classList.remove('swap-whoosh-active');
                  void (holdEl as HTMLElement).offsetWidth; // trigger reflow
                  holdEl.classList.add('swap-whoosh-active');
              }`
);

fs.writeFileSync('src/controller.ts', controllerTs);
