import type { SessionPhase, TransportMode } from '../net/types.js';

export interface OnlineVersusUIController {
  createRoom(): Promise<void>;
  joinRoom(code: string, asSpectator?: boolean): Promise<void>;
  requestRematch(): void;
  stop(): void;
}

export interface OnlineVersusUIOptions {
  getController: () => OnlineVersusUIController | null;
  onStartLocal?: () => void;
}

let overlayEl: HTMLElement | null = null;
let statusBadge: HTMLElement | null = null;
let countdownEl: HTMLElement | null = null;

function ensureOverlay(): HTMLElement {
  if (overlayEl) return overlayEl;
  overlayEl = document.createElement('div');
  overlayEl.id = 'online-versus-overlay';
  overlayEl.className = 'online-versus-overlay';
  overlayEl.innerHTML = `
    <div class="online-versus-panel">
      <h2>Online 2P</h2>
      <p class="online-versus-sub">Ephemeral room — no account needed</p>
      <div class="online-versus-actions">
        <button type="button" id="online-create-btn" class="online-btn">Create Room</button>
        <div class="online-join-row">
          <input id="online-room-input" type="text" maxlength="8" placeholder="Room code" aria-label="Room code" />
          <button type="button" id="online-join-btn" class="online-btn">Join</button>
        </div>
        <button type="button" id="online-spectate-btn" class="online-btn secondary">Spectate</button>
      </div>
      <div id="online-room-display" class="online-room-display" hidden>
        <p>Room code</p>
        <p id="online-room-code" class="online-room-code"></p>
        <button type="button" id="online-copy-link-btn" class="online-btn secondary">Copy link</button>
        <p id="online-waiting-msg" class="online-waiting">Waiting for opponent…</p>
      </div>
      <div id="online-error" class="online-error" hidden></div>
      <button type="button" id="online-rematch-btn" class="online-btn" hidden>Rematch</button>
      <button type="button" id="online-close-btn" class="online-btn secondary">Close</button>
    </div>
  `;
  document.body.appendChild(overlayEl);

  statusBadge = document.createElement('div');
  statusBadge.id = 'online-status-badge';
  statusBadge.className = 'online-status-badge';
  statusBadge.hidden = true;
  document.body.appendChild(statusBadge);

  countdownEl = document.createElement('div');
  countdownEl.id = 'online-countdown';
  countdownEl.className = 'online-countdown';
  countdownEl.hidden = true;
  document.body.appendChild(countdownEl);

  return overlayEl;
}

export function initOnlineVersusUI(options: OnlineVersusUIOptions): {
  show(): void;
  hide(): void;
  setRoomCode(code: string): void;
  setPhase(phase: SessionPhase): void;
  setTransportMode(mode: TransportMode): void;
  setCountdown(frames: number): void;
  setError(message: string): void;
  clearError(): void;
} {
  const overlay = ensureOverlay();
  const roomDisplay = overlay.querySelector('#online-room-display') as HTMLElement;
  const roomCodeEl = overlay.querySelector('#online-room-code') as HTMLElement;
  const errorEl = overlay.querySelector('#online-error') as HTMLElement;
  const waitingMsg = overlay.querySelector('#online-waiting-msg') as HTMLElement;
  const input = overlay.querySelector('#online-room-input') as HTMLInputElement;

  overlay.querySelector('#online-create-btn')?.addEventListener('click', () => {
    void options.getController()?.createRoom();
    roomDisplay.hidden = false;
    waitingMsg.hidden = false;
  });

  overlay.querySelector('#online-join-btn')?.addEventListener('click', () => {
    const code = input.value.trim();
    if (!code) return;
    void options.getController()?.joinRoom(code, false);
    hide();
  });

  overlay.querySelector('#online-spectate-btn')?.addEventListener('click', () => {
    const code = input.value.trim();
    if (!code) return;
    void options.getController()?.joinRoom(code, true);
    hide();
  });

  overlay.querySelector('#online-copy-link-btn')?.addEventListener('click', () => {
    const code = roomCodeEl.textContent ?? '';
    const url = new URL(window.location.href);
    url.searchParams.set('mode', 'online-versus');
    url.searchParams.set('room', code);
    void navigator.clipboard.writeText(url.toString());
  });

  overlay.querySelector('#online-close-btn')?.addEventListener('click', () => {
    options.getController()?.stop();
    hide();
  });

  const rematchBtn = overlay.querySelector('#online-rematch-btn') as HTMLButtonElement;
  rematchBtn?.addEventListener('click', () => {
    options.getController()?.requestRematch();
    rematchBtn.hidden = true;
  });

  function show(): void {
    overlay.classList.add('visible');
    clearError();
  }

  function hide(): void {
    overlay.classList.remove('visible');
  }

  function setRoomCode(code: string): void {
    roomCodeEl.textContent = code;
    roomDisplay.hidden = false;
    input.value = code;
  }

  function setPhase(phase: SessionPhase): void {
    if (!statusBadge) return;
    statusBadge.hidden = false;
    const labels: Record<SessionPhase, string> = {
      idle: 'Idle',
      connecting: 'Connecting…',
      waiting: 'Waiting',
      countdown: 'Starting…',
      playing: 'Playing',
      ended: 'Round over',
      desynced: 'Desync',
      disconnected: 'Disconnected',
    };
    statusBadge.textContent = labels[phase] ?? phase;
    statusBadge.dataset.phase = phase;

    if (phase === 'waiting') waitingMsg.hidden = false;
    else waitingMsg.hidden = true;

    if (rematchBtn) rematchBtn.hidden = phase !== 'ended';
  }

  function setTransportMode(mode: TransportMode): void {
    if (!statusBadge || mode === 'none') return;
    statusBadge.dataset.transport = mode;
    const base = statusBadge.textContent ?? '';
    if (mode === 'webrtc') statusBadge.textContent = `${base} · P2P`;
    if (mode === 'relay') statusBadge.textContent = `${base} · Relay`;
  }

  function setCountdown(frames: number): void {
    if (!countdownEl) return;
    const seconds = Math.ceil(frames / 60);
    if (seconds <= 0 || frames > 180) {
      countdownEl.hidden = true;
      return;
    }
    countdownEl.hidden = false;
    countdownEl.textContent = seconds <= 3 ? (seconds === 0 ? 'GO!' : String(seconds)) : '';
    if (seconds === 0) {
      setTimeout(() => { if (countdownEl) countdownEl.hidden = true; }, 500);
    }
  }

  function setError(message: string): void {
    errorEl.textContent = message;
    errorEl.hidden = false;
  }

  function clearError(): void {
    errorEl.hidden = true;
    errorEl.textContent = '';
  }

  return { show, hide, setRoomCode, setPhase, setTransportMode, setCountdown, setError, clearError };
}

/** Parse URL params for auto-join / spectate. */
export function parseOnlineVersusUrl(): { room: string; spectate: boolean } | null {
  const params = new URLSearchParams(window.location.search);
  const mode = params.get('mode');
  if (mode !== 'online-versus') return null;
  const spectate = params.has('spectate');
  const room = params.get('room') ?? params.get('spectate') ?? '';
  if (!room) return { room: '', spectate };
  return { room: room.toUpperCase(), spectate };
}
