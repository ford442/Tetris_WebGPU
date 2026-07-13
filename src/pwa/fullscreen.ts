/**
 * Optional Fullscreen API toggle for mobile / kiosk play.
 */

export function initFullscreenButton(buttonId = 'fullscreen-button'): void {
  const btn = document.getElementById(buttonId) as HTMLButtonElement | null;
  if (!btn) return;

  const doc = document.documentElement as HTMLElement & {
    webkitRequestFullscreen?: () => Promise<void>;
  };

  const canFullscreen =
    typeof doc.requestFullscreen === 'function' ||
    typeof doc.webkitRequestFullscreen === 'function';

  if (!canFullscreen) {
    btn.style.display = 'none';
    return;
  }

  const syncLabel = () => {
    btn.textContent = document.fullscreenElement ? 'EXIT FULL' : 'FULLSCREEN';
  };

  btn.addEventListener('click', async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else if (doc.requestFullscreen) {
        await doc.requestFullscreen();
      } else if (doc.webkitRequestFullscreen) {
        await doc.webkitRequestFullscreen();
      }
    } catch (e) {
      console.warn('[fullscreen]', e);
    }
    syncLabel();
  });

  document.addEventListener('fullscreenchange', syncLabel);
  syncLabel();
}
