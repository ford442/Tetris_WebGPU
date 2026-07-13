/**
 * Offline indicator — marathon + procedural backgrounds work without network.
 */

export function initOfflineBanner(): void {
  const banner = document.createElement('div');
  banner.id = 'offline-banner';
  banner.className = 'offline-banner';
  banner.hidden = true;
  banner.textContent = 'Offline — marathon mode with procedural backgrounds';
  document.body.appendChild(banner);

  const sync = () => {
    banner.hidden = navigator.onLine;
    document.documentElement.classList.toggle('is-offline', !navigator.onLine);
  };

  window.addEventListener('online', sync);
  window.addEventListener('offline', sync);
  sync();
}
