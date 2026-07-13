/**
 * Register production service worker (versioned precache from post-build script).
 */

import { renderLogger } from '../utils/logger.js';

export function registerServiceWorker(): void {
  if (!import.meta.env.PROD) return;
  if (!('serviceWorker' in navigator)) return;

  const base = import.meta.env.BASE_URL || '/';
  const swUrl = `${base}sw.js`;

  window.addEventListener('load', () => {
    void navigator.serviceWorker
      .register(swUrl, { scope: base })
      .then((reg) => {
        renderLogger.info(`[PWA] service worker registered (scope ${base})`);

        reg.addEventListener('updatefound', () => {
          const worker = reg.installing;
          if (!worker) return;
          worker.addEventListener('statechange', () => {
            if (worker.state === 'installed' && navigator.serviceWorker.controller) {
              showUpdateToast();
            }
          });
        });
      })
      .catch((err) => {
        console.warn('[PWA] service worker registration failed:', err);
      });
  });
}

function showUpdateToast(): void {
  if (document.getElementById('pwa-update-toast')) return;
  const el = document.createElement('div');
  el.id = 'pwa-update-toast';
  el.className = 'pwa-update-toast';
  el.innerHTML = `
    <span>New version available</span>
    <button type="button" id="pwa-reload-btn">Reload</button>
  `;
  document.body.appendChild(el);
  document.getElementById('pwa-reload-btn')?.addEventListener('click', () => {
    location.reload();
  });
}

/** Mark standalone / installed display modes for CSS hooks. */
export function detectDisplayMode(): void {
  const standalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  if (standalone) {
    document.documentElement.classList.add('pwa-standalone');
  }
}
