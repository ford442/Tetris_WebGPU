export default class SoundManager {
    private ctx: AudioContext;
    private masterGain: GainNode;
    private noiseBuffer: AudioBuffer | null = null;

    constructor() {
        // @ts-ignore
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        this.ctx = new AudioContext();
        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.value = 0.3; // Global volume
        this.masterGain.connect(this.ctx.destination);

        this.initNoiseBuffer();
    }

    private initNoiseBuffer() {
        if (!this.ctx) return;
        const bufferSize = this.ctx.sampleRate * 2.0; // 2 seconds
        this.noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = this.noiseBuffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = Math.random() * 2 - 1;
        }
    }

    private playTone(freq: number, type: OscillatorType, duration: number, startTime: number = 0, vol: number = 1.0) {
        if (this.ctx.state === 'suspended') {
            this.ctx.resume();
        }
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = type;
        osc.frequency.setValueAtTime(freq, this.ctx.currentTime + startTime);

        gain.gain.setValueAtTime(0, this.ctx.currentTime + startTime);
        gain.gain.linearRampToValueAtTime(vol, this.ctx.currentTime + startTime + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + startTime + duration);

        osc.connect(gain);
        gain.connect(this.masterGain);

        osc.start(this.ctx.currentTime + startTime);
        osc.stop(this.ctx.currentTime + startTime + duration);
    }

    private playNoise(duration: number, startTime: number = 0, vol: number = 1.0) {
        if (this.ctx.state === 'suspended') {
            this.ctx.resume();
        }
        if (!this.noiseBuffer) {
            this.initNoiseBuffer();
            if (!this.noiseBuffer) return;
        }

        const source = this.ctx.createBufferSource();
        source.buffer = this.noiseBuffer;
        const gain = this.ctx.createGain();

        // Bandpass filter for "thud" vs "hiss"
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 800;

        source.connect(filter);
        filter.connect(gain);
        gain.connect(this.masterGain);

        gain.gain.setValueAtTime(vol, this.ctx.currentTime + startTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + startTime + duration);

        source.start(this.ctx.currentTime + startTime);
        source.stop(this.ctx.currentTime + startTime + duration);
    }

    playMove() {
        // Crisp high blip
        this.playTone(600, 'sine', 0.05, 0, 0.2);
        this.playTone(1200, 'triangle', 0.02, 0, 0.1);
    }

    playRotate() {
        // "Swish" / "Warp" sound
        this.playTone(400, 'sine', 0.1, 0, 0.3);

        if (this.ctx.state !== 'suspended') {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.frequency.setValueAtTime(200, this.ctx.currentTime);
            osc.frequency.linearRampToValueAtTime(600, this.ctx.currentTime + 0.1);

            gain.gain.setValueAtTime(0.2, this.ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.1);

            osc.connect(gain);
            gain.connect(this.masterGain);
            osc.start();
            osc.stop(this.ctx.currentTime + 0.1);
        }
    }

    playHardDrop() {
        // Impact thud + electric zap
        if (this.ctx.state === 'suspended') this.ctx.resume();

        // 1. Low frequency kick (Thud)
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.frequency.setValueAtTime(150, this.ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(30, this.ctx.currentTime + 0.15);

        gain.gain.setValueAtTime(0.8, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.15);

        osc.connect(gain);
        gain.connect(this.masterGain);
        osc.start();
        osc.stop(this.ctx.currentTime + 0.15);

        // 2. High Frequency Zap (Laser drop)
        const oscZap = this.ctx.createOscillator();
        const gainZap = this.ctx.createGain();
        oscZap.type = 'sawtooth';
        oscZap.frequency.setValueAtTime(800, this.ctx.currentTime);
        oscZap.frequency.exponentialRampToValueAtTime(100, this.ctx.currentTime + 0.1);

        gainZap.gain.setValueAtTime(0.3, this.ctx.currentTime);
        gainZap.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.1);

        oscZap.connect(gainZap);
        gainZap.connect(this.masterGain);
        oscZap.start();
        oscZap.stop(this.ctx.currentTime + 0.1);

        // 3. Noise Burst (Impact)
        this.playNoise(0.1, 0, 0.5);
    }

    playLock() {
        this.playTone(440, 'square', 0.1, 0, 0.2);
        this.playTone(880, 'sine', 0.05, 0.02, 0.1);
    }

    playLineClear(lines: number, combo: number = 0, backToBack: boolean = false) {
        // Pitch shift based on combo
        const pitchMod = Math.pow(1.059, Math.min(combo, 12));
        const base = 523.25 * pitchMod; // C5

        // Cyberpunk Chord: Minor 9th or Major 7th? Let's go Major 7th for triumph.
        const chord = [base, base * 1.2599, base * 1.4983, base * 1.8877];

        const vol = 0.3;

        // Staggered arpeggio with richer waveforms
        for (let i = 0; i < Math.min(lines, 4); i++) {
             // Use Square/Sawtooth for retro feel
             this.playTone(chord[i], 'square', 0.3, i * 0.05, vol);
             this.playTone(chord[i] * 2, 'sawtooth', 0.3, i * 0.05 + 0.02, vol * 0.4);
        }

        if (lines >= 4) {
            // TETRIS! - Full Chord Blast + long sweep
            // Play full chord simultaneously
            chord.forEach((freq, i) => {
                this.playTone(freq * 2, 'square', 0.6, 0.0, 0.2);
            });

            // Uplifting sweep
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.frequency.setValueAtTime(400, this.ctx.currentTime);
            osc.frequency.linearRampToValueAtTime(1200, this.ctx.currentTime + 0.5);
            gain.gain.setValueAtTime(0.2, this.ctx.currentTime);
            gain.gain.linearRampToValueAtTime(0, this.ctx.currentTime + 0.5);

            osc.connect(gain);
            gain.connect(this.masterGain);
            osc.start();
            osc.stop(this.ctx.currentTime + 0.5);

            // Cymbal-ish noise
            this.playNoise(0.8, 0, 0.3);
        }

        if (backToBack) {
            // Back-to-Back: High pitch echo
            this.playTone(1760 * pitchMod, 'sawtooth', 0.3, 0.1, 0.3);
            this.playTone(1760 * 1.5 * pitchMod, 'sawtooth', 0.3, 0.2, 0.2);
        }
    }

    playGameOver() {
        const now = this.ctx.currentTime;
        // Sad descent
        [300, 250, 200, 150, 100].forEach((freq, i) => {
            this.playTone(freq, 'sawtooth', 0.4, i * 0.15, 0.5);
        });

        // Low drone
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.frequency.value = 50;
        osc.type = 'sawtooth';
        gain.gain.setValueAtTime(0.5, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 2.0);

        osc.connect(gain);
        gain.connect(this.masterGain);
        osc.start(now);
        osc.stop(now + 2.0);
    }

    playLevelUp() {
        const notes = [523.25, 659.25, 783.99, 1046.50]; // C4, E4, G4, C5
        notes.forEach((freq, i) => {
            this.playTone(freq, 'triangle', 0.1, i * 0.08, 0.4);
            this.playTone(freq * 2, 'sine', 0.1, i * 0.08, 0.2); // Octave
        });

        // Final chime
        this.playTone(1046.50 * 1.5, 'sine', 0.4, 0.4, 0.3); // G5 at 0.4s
    }
}
