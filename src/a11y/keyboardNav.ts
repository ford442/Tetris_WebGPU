/**
 * Keyboard navigation for pause menu and header controls.
 */

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function focusablesWithin(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (el) => el.offsetParent !== null || root.contains(el),
  );
}

let pauseTrapActive = false;
let lastFocusBeforePause: HTMLElement | null = null;

export function initKeyboardNavigation(): void {
  const pauseMenu = document.getElementById('pause-menu');
  if (!pauseMenu) return;

  pauseMenu.addEventListener('keydown', (e) => {
    if (!pauseTrapActive || e.key !== 'Tab') return;
    const items = focusablesWithin(pauseMenu);
    if (items.length === 0) return;

    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement as HTMLElement;

    if (e.shiftKey) {
      if (active === first || !pauseMenu.contains(active)) {
        e.preventDefault();
        last.focus();
      }
    } else if (active === last) {
      e.preventDefault();
      first.focus();
    }
  });

  document.addEventListener('keydown', (e) => {
    const menuOpen = pauseMenu.style.display !== 'none' && pauseMenu.style.display !== '';
    if (!menuOpen) return;

    if (e.key === 'r' || e.key === 'R') {
      document.getElementById('restart-button')?.click();
      e.preventDefault();
    } else if (e.key === 's' || e.key === 'S') {
      document.getElementById('resume-button')?.click();
      e.preventDefault();
    }
  });
}

export function onPauseMenuOpen(): void {
  const pauseMenu = document.getElementById('pause-menu');
  if (!pauseMenu) return;
  pauseTrapActive = true;
  lastFocusBeforePause = document.activeElement as HTMLElement;
  const items = focusablesWithin(pauseMenu);
  const primary = document.getElementById('resume-button') as HTMLElement | null;
  (primary ?? items[0])?.focus();
}

export function onPauseMenuClose(): void {
  pauseTrapActive = false;
  if (lastFocusBeforePause?.focus) {
    lastFocusBeforePause.focus();
  } else {
    document.getElementById('start-button')?.focus();
  }
  lastFocusBeforePause = null;
}

/** Make header / panel controls reachable (they use pointer-events toggles). */
export function enhanceControlAccessibility(): void {
  const controls: Array<{ id: string; label: string }> = [
    { id: 'start-button', label: 'Start game' },
    { id: 'pause-button', label: 'Pause game' },
    { id: 'replay-open-btn', label: 'Open replay' },
    { id: 'glitch-button', label: 'Toggle glitch effects' },
    { id: 'bloom-button', label: 'Toggle bloom' },
    { id: 'wire-button', label: 'Toggle wireframe' },
    { id: 'video-toggle', label: 'Toggle background video' },
    { id: 'music-toggle', label: 'Toggle music' },
    { id: 'game-mode-select', label: 'Game mode' },
    { id: 'fullscreen-button', label: 'Toggle fullscreen' },
  ];

  for (const { id, label } of controls) {
    const el = document.getElementById(id);
    if (!el) continue;
    if (!el.getAttribute('aria-label')) el.setAttribute('aria-label', label);
  }

  const scoreEl = document.getElementById('score');
  if (scoreEl) scoreEl.setAttribute('aria-live', 'off');
}
