/**
 * Procedural SFX — spatial pan, per-piece lock timbres, combo risers.
 */

import type { AudioBus } from './audioBus.js';
import type { MusicEngine } from './musicEngine.js';
import type { LineClearPayload, LockPayload, MoveDirection, MovePayload } from './types.js';

const LOCK_TIMBRE: Record<string, number> = {
  I: 196,
  J: 165,
  L: 175,
  O: 220,
  S: 185,
  T: 207,
  Z: 174,
  '1': 196,
  '2': 165,
  '3': 175,
  '4': 220,
  '5': 185,
  '6': 207,
  '7': 174,
};

type ToneOptions = {
  attack?: number;
  decay?: number;
  sustain?: number;
  release?: number;
  detune?: number;
  pan?: number;
};

type NoiseOptions = {
  filterType?: BiquadFilterType;
  frequency?: number;
  Q?: number;
  noiseType?: 'white' | 'pink';
  attack?: number;
  release?: number;
  pan?: number;
};

export class SfxEngine {
  private noiseBuffer: AudioBuffer | null = null;
  private pinkNoiseBuffer: AudioBuffer | null = null;
  private enabled = true;

  constructor(
    private readonly bus: AudioBus,
    private readonly music: MusicEngine | null = null,
  ) {
    this.initNoiseBuffers();
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  private initNoiseBuffers(): void {
    const { ctx } = this.bus;
    const bufferSize = ctx.sampleRate * 2.0;
    this.noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = this.noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    this.pinkNoiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const pinkData = this.pinkNoiseBuffer.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + white * 0.0555179;
      b1 = 0.99332 * b1 + white * 0.0750759;
      b2 = 0.96900 * b2 + white * 0.1538520;
      b3 = 0.86650 * b3 + white * 0.3104856;
      b4 = 0.55000 * b4 + white * 0.5329522;
      b5 = -0.7616 * b5 - white * 0.0168980;
      pinkData[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
      b6 = white * 0.115926;
    }
  }

  private connectSfx(gain: GainNode, pan = 0): void {
    const panner = this.bus.createSfxPanner(pan);
    if (panner) {
      gain.connect(panner);
    } else {
      gain.connect(this.bus.sfxGain);
    }
  }

  private playTone(
    freq: number,
    type: OscillatorType,
    duration: number,
    startTime = 0,
    vol = 1.0,
    options: ToneOptions = {},
  ): void {
    if (!this.enabled) return;
    this.bus.ensureRunning();

    const {
      attack = 0.005,
      decay = 0.1,
      sustain = 0.7,
      release = 0.1,
      detune = 0,
      pan = 0,
    } = options;

    const { ctx } = this.bus;
    const t = ctx.currentTime + startTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (detune) osc.detune.value = detune;

    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(vol, t + attack);
    gain.gain.linearRampToValueAtTime(vol * sustain, t + attack + decay);
    gain.gain.setValueAtTime(vol * sustain, t + duration - release);
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration);

    osc.connect(gain);
    this.connectSfx(gain, pan);
    osc.start(t);
    osc.stop(t + duration);
  }

  private playNoise(duration: number, startTime = 0, vol = 1.0, options: NoiseOptions = {}): void {
    if (!this.enabled) return;
    this.bus.ensureRunning();

    const {
      filterType = 'lowpass',
      frequency = 800,
      Q = 1,
      noiseType = 'white',
      attack = 0.001,
      release = 0.05,
      pan = 0,
    } = options;

    const buffer = noiseType === 'pink' ? this.pinkNoiseBuffer : this.noiseBuffer;
    if (!buffer) return;

    const { ctx } = this.bus;
    const t = ctx.currentTime + startTime;
    const source = ctx.createBufferSource();
    source.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.value = frequency;
    filter.Q.value = Q;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(vol, t + attack);
    gain.gain.setValueAtTime(vol, t + duration - release);
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration);

    source.connect(filter);
    filter.connect(gain);
    this.connectSfx(gain, pan);
    source.start(t);
    source.stop(t + duration);
  }

  private playClick(freq = 2000, vol = 0.3, pan = 0): void {
    if (!this.enabled) return;
    const { ctx } = this.bus;
    const t = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(freq, t);
    osc.frequency.exponentialRampToValueAtTime(freq * 0.5, t + 0.015);
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.02);
    osc.connect(gain);
    this.connectSfx(gain, pan);
    osc.start(t);
    osc.stop(t + 0.02);

    this.playNoise(0.01, 0, vol * 0.5, {
      filterType: 'highpass',
      frequency: 3000,
      attack: 0.0001,
      release: 0.005,
      pan,
    });
  }

  private playThud(intensity = 1.0, startTime = 0, pan = 0): void {
    if (!this.enabled) return;
    const { ctx } = this.bus;
    const t = ctx.currentTime + startTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.setValueAtTime(80 * intensity, t);
    osc.frequency.exponentialRampToValueAtTime(30, t + 0.12);
    gain.gain.setValueAtTime(0.6 * intensity, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
    osc.connect(gain);
    this.connectSfx(gain, pan);
    osc.start(t);
    osc.stop(t + 0.15);

    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'triangle';
    osc2.frequency.setValueAtTime(120 * intensity, t);
    osc2.frequency.exponentialRampToValueAtTime(60, t + 0.08);
    gain2.gain.setValueAtTime(0.3 * intensity, t);
    gain2.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
    osc2.connect(gain2);
    this.connectSfx(gain2, pan);
    osc2.start(t);
    osc2.stop(t + 0.1);

    this.playNoise(0.08, startTime, 0.4 * intensity, {
      filterType: 'lowpass',
      frequency: 400,
      attack: 0.001,
      release: 0.03,
      pan,
    });
  }

  private playComboRiser(combo: number, pan = 0): void {
    if (!this.enabled || combo < 2) return;
    const { ctx } = this.bus;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    const start = 220 * Math.pow(1.059463, Math.min(combo, 12));
    osc.frequency.setValueAtTime(start, t);
    osc.frequency.exponentialRampToValueAtTime(start * 2.2, t + 0.35);
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.12 + combo * 0.015, t + 0.04);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
    osc.connect(gain);
    this.connectSfx(gain, pan);
    osc.start(t);
    osc.stop(t + 0.42);
    this.music?.duck(0.25 + Math.min(combo, 8) * 0.04, 0.35 + combo * 0.03);
  }

  playMove(payload: MovePayload = {}): void {
    const pan = payload.direction
      ? this.bus.movePan(payload.direction, payload.column)
      : (payload.column !== undefined ? this.bus.columnToPan(payload.column) * 0.5 : 0);
    this.playClick(1800, 0.15, pan);
    this.playTone(800, 'sine', 0.03, 0, 0.1, {
      attack: 0.001,
      decay: 0.01,
      sustain: 0.3,
      release: 0.02,
      pan,
    });
  }

  playRotate(): void {
    if (!this.enabled) return;
    this.bus.ensureRunning();
    const { ctx } = this.bus;
    const t = ctx.currentTime;

    this.playClick(1200, 0.2, 0);

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(300, t);
    osc.frequency.linearRampToValueAtTime(500, t + 0.04);
    osc.frequency.exponentialRampToValueAtTime(200, t + 0.12);
    filter.type = 'bandpass';
    filter.frequency.value = 800;
    filter.Q.value = 2;
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.25, t + 0.04);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
    osc.connect(filter);
    filter.connect(gain);
    this.connectSfx(gain, 0);
    osc.start(t);
    osc.stop(t + 0.12);

    this.playTone(600, 'triangle', 0.08, 0.02, 0.08, {
      attack: 0.01,
      release: 0.04,
    });
  }

  playSoftDrop(): void {
    this.playNoise(0.06, 0, 0.15, {
      filterType: 'bandpass',
      frequency: 600,
      Q: 3,
      noiseType: 'pink',
      attack: 0.01,
      release: 0.03,
    });
    this.playTone(400, 'sine', 0.05, 0, 0.1, {
      attack: 0.005,
      release: 0.03,
    });
  }

  playHardDrop(): void {
    if (!this.enabled) return;
    const { ctx } = this.bus;
    const t = ctx.currentTime;

    this.playNoise(0.08, 0, 0.25, {
      filterType: 'lowpass',
      frequency: 2000,
      noiseType: 'pink',
      attack: 0.005,
      release: 0.02,
    });

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(600, t);
    osc.frequency.exponentialRampToValueAtTime(100, t + 0.08);
    gain.gain.setValueAtTime(0.15, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
    osc.connect(gain);
    this.connectSfx(gain, 0);
    osc.start(t);
    osc.stop(t + 0.08);

    setTimeout(() => this.playThud(1.2, 0, 0), 50);
    this.playTone(3000, 'square', 0.03, 0.08, 0.15, {
      attack: 0.001,
      release: 0.02,
    });
  }

  playLock(payload: LockPayload = {}): void {
    if (!this.enabled) return;
    const key = String(payload.pieceType ?? 'T');
    const base = LOCK_TIMBRE[key] ?? LOCK_TIMBRE.T;
    const pan = payload.column !== undefined ? this.bus.columnToPan(payload.column) * 0.65 : 0;

    this.playThud(0.8, 0, pan);
    this.playTone(base, 'square', 0.08, 0, 0.2, {
      attack: 0.001,
      decay: 0.03,
      sustain: 0.4,
      release: 0.04,
      pan,
    });
    this.playTone(base * 2, 'sine', 0.06, 0.01, 0.12, {
      attack: 0.002,
      release: 0.03,
      pan,
    });
    this.playClick(2500, 0.1, pan);
  }

  playHold(): void {
    this.playClick(1500, 0.25, 0);
    this.playTone(330, 'triangle', 0.05, 0, 0.2, {
      attack: 0.001,
      release: 0.02,
    });
    this.playTone(660, 'sine', 0.04, 0.01, 0.1, {
      attack: 0.002,
      release: 0.02,
    });
  }

  playLineClear(payload: LineClearPayload): void {
    if (!this.enabled) return;
    const { lines, combo, backToBack } = payload;
    const pan = payload.column !== undefined ? this.bus.columnToPan(payload.column) * 0.7 : 0;

    if (combo > 1) this.playComboRiser(combo, pan);

    const pitchMod = Math.pow(1.059463, Math.min(combo, 16));
    const baseFreq = 440 * pitchMod;
    const chords: Record<number, number[]> = {
      1: [baseFreq, baseFreq * 1.25],
      2: [baseFreq, baseFreq * 1.25, baseFreq * 1.5],
      3: [baseFreq, baseFreq * 1.2, baseFreq * 1.5, baseFreq * 1.8],
      4: [baseFreq * 0.5, baseFreq, baseFreq * 1.25, baseFreq * 1.5, baseFreq * 2],
    };
    const chord = chords[Math.min(lines, 4)] || chords[1];

    if (lines >= 4) {
      this.playTetrisClear(chord, combo, backToBack, pan);
    } else {
      this.playNormalClear(lines, chord, combo, backToBack, pan);
    }
  }

  private playNormalClear(
    lines: number,
    chord: number[],
    combo: number,
    backToBack: boolean,
    pan: number,
  ): void {
    const vol = Math.min(0.25 + combo * 0.02, 0.4);
    const stagger = Math.max(0.04 - lines * 0.01, 0.015);

    chord.forEach((freq, i) => {
      this.playTone(freq, 'square', 0.25, i * stagger, vol, {
        attack: 0.005,
        decay: 0.08,
        sustain: 0.5,
        release: 0.08,
        pan,
      });
      this.playTone(freq * 2, 'sawtooth', 0.2, i * stagger + 0.01, vol * 0.3, {
        attack: 0.01,
        release: 0.06,
        pan,
      });
    });

    this.playNoise(0.15, 0, vol * 0.5, {
      filterType: 'bandpass',
      frequency: 2000 + combo * 100,
      Q: 4,
      noiseType: 'pink',
      attack: 0.01,
      release: 0.08,
      pan,
    });

    if (backToBack) {
      setTimeout(() => {
        this.playTone(chord[0] * 2, 'sawtooth', 0.2, 0, vol * 0.4, {
          attack: 0.01,
          release: 0.1,
          pan,
        });
      }, 150);
    }
  }

  private playTetrisClear(
    chord: number[],
    combo: number,
    backToBack: boolean,
    pan: number,
  ): void {
    if (!this.enabled) return;
    const { ctx } = this.bus;
    const t = ctx.currentTime;
    const vol = Math.min(0.3 + combo * 0.02, 0.5);

    chord.forEach((freq) => {
      this.playTone(freq, 'square', 0.8, 0, vol * 0.6, {
        attack: 0.01,
        decay: 0.2,
        sustain: 0.6,
        release: 0.2,
        detune: (Math.random() - 0.5) * 10,
        pan,
      });
      this.playTone(freq * 2, 'sawtooth', 0.7, 0.02, vol * 0.4, {
        attack: 0.02,
        release: 0.15,
        pan,
      });
      this.playTone(freq * 0.5, 'triangle', 0.9, 0, vol * 0.5, {
        attack: 0.02,
        release: 0.25,
        pan,
      });
    });

    const sweep = ctx.createOscillator();
    const sweepGain = ctx.createGain();
    sweep.type = 'sine';
    sweep.frequency.setValueAtTime(400, t);
    sweep.frequency.linearRampToValueAtTime(1500, t + 0.6);
    sweepGain.gain.setValueAtTime(0.2, t);
    sweepGain.gain.linearRampToValueAtTime(0, t + 0.6);
    sweep.connect(sweepGain);
    this.connectSfx(sweepGain, pan);
    sweep.start(t);
    sweep.stop(t + 0.6);

    this.playNoise(0.8, 0, 0.4, {
      filterType: 'highpass',
      frequency: 3000,
      noiseType: 'white',
      attack: 0.005,
      release: 0.3,
      pan,
    });
    this.playNoise(0.5, 0.1, 0.25, {
      filterType: 'bandpass',
      frequency: 5000,
      Q: 2,
      noiseType: 'white',
      attack: 0.01,
      release: 0.2,
      pan,
    });

    this.music?.duck(0.45, 0.55);

    if (backToBack) {
      setTimeout(() => {
        const mod = Math.pow(1.059, Math.min(combo, 16));
        this.playTone(880 * mod, 'square', 0.4, 0, 0.3, { attack: 0.01, release: 0.15, pan });
        this.playTone(1100 * mod, 'sawtooth', 0.35, 0.05, 0.2, { attack: 0.01, release: 0.1, pan });
      }, 200);
    }
  }

  playTSpin(): void {
    if (!this.enabled) return;
    this.playClick(2000, 0.35, 0);
    const freqs = [523.25, 659.25, 783.99, 1046.5];
    freqs.forEach((freq, i) => {
      this.playTone(freq, 'square', 0.18, i * 0.025, 0.28, {
        attack: 0.005,
        release: 0.1,
      });
    });
    this.playNoise(0.14, 0, 0.35, {
      filterType: 'bandpass',
      frequency: 4500,
      Q: 5,
      noiseType: 'white',
      attack: 0.005,
      release: 0.1,
    });
    this.music?.duck(0.3, 0.4);
  }

  playGameOver(): void {
    if (!this.enabled) return;
    const { ctx } = this.bus;
    const t = ctx.currentTime;
    const notes = [330, 294, 262, 220, 196, 165];
    notes.forEach((freq, i) => {
      this.playTone(freq, 'sawtooth', 0.5, i * 0.12, 0.4, {
        attack: 0.02,
        decay: 0.15,
        sustain: 0.5,
        release: 0.2,
      });
      if (i < notes.length - 1) {
        this.playTone(freq * 0.5, 'triangle', 0.4, i * 0.12, 0.25, {
          attack: 0.03,
          release: 0.15,
        });
      }
    });

    const drone = ctx.createOscillator();
    const droneGain = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    drone.type = 'sawtooth';
    drone.frequency.setValueAtTime(55, t);
    drone.frequency.linearRampToValueAtTime(40, t + 2.5);
    droneGain.gain.setValueAtTime(0.4, t);
    droneGain.gain.exponentialRampToValueAtTime(0.001, t + 2.5);
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(800, t);
    filter.frequency.linearRampToValueAtTime(100, t + 2.5);
    drone.connect(filter);
    filter.connect(droneGain);
    this.connectSfx(droneGain, 0);
    drone.start(t);
    drone.stop(t + 2.5);

    setTimeout(() => this.playThud(0.6, 0, 0), 600);
  }

  playLevelUp(): void {
    if (!this.enabled) return;
    const notes = [523.25, 659.25, 783.99, 1046.50, 1318.51];
    notes.forEach((freq, i) => {
      const time = i * 0.06;
      this.playTone(freq, 'triangle', 0.15, time, 0.4, {
        attack: 0.005,
        decay: 0.05,
        sustain: 0.6,
        release: 0.08,
      });
      this.playTone(freq * 2, 'sine', 0.12, time + 0.01, 0.2, {
        attack: 0.01,
        release: 0.06,
      });
    });

    const finalChord = [1046.50, 1318.51, 1567.98, 2093.00];
    finalChord.forEach((freq, i) => {
      this.playTone(freq, 'square', 0.5, 0.35 + i * 0.01, 0.3, {
        attack: 0.01,
        decay: 0.1,
        sustain: 0.5,
        release: 0.2,
        detune: (i - 2) * 3,
      });
    });

    this.playNoise(0.3, 0.35, 0.35, {
      filterType: 'bandpass',
      frequency: 3000,
      Q: 3,
      noiseType: 'pink',
      attack: 0.02,
      release: 0.2,
    });
    this.playTone(3135.96, 'sine', 0.6, 0.4, 0.25, {
      attack: 0.005,
      decay: 0.1,
      sustain: 0.4,
      release: 0.3,
    });
  }

  playPause(): void {
    this.playClick(1600, 0.2, 0);
    this.playTone(440, 'sine', 0.08, 0, 0.15, {
      attack: 0.005,
      release: 0.04,
    });
  }

  playResume(): void {
    this.playClick(2000, 0.25, 0);
    this.playTone(554, 'sine', 0.08, 0, 0.18, {
      attack: 0.005,
      release: 0.04,
    });
  }

  playMenuNavigate(): void {
    this.playTone(1200, 'sine', 0.02, 0, 0.08, {
      attack: 0.001,
      release: 0.015,
    });
  }

  playMenuSelect(): void {
    this.playClick(1500, 0.2, 0);
    this.playTone(880, 'triangle', 0.05, 0, 0.15, {
      attack: 0.002,
      release: 0.03,
    });
  }
}
