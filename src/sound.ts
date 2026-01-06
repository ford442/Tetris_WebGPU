export default class SoundManager {
    private ctx: AudioContext;
    private masterGain: GainNode;

    constructor() {
        // @ts-ignore
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        this.ctx = new AudioContext();
        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.value = 0.3; // Global volume
        this.masterGain.connect(this.ctx.destination);
    }

    private playTone(freq: number, type: OscillatorType, duration: number, startTime: number = 0, vol: number = 1.0) {
        if (this.ctx.state === 'suspended') {
            this.ctx.resume();
        }
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = type;
        osc.frequency.setValueAtTime(freq, this.ctx.currentTime + startTime);

        gain.gain.setValueAtTime(vol, this.ctx.currentTime + startTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + startTime + duration);

        osc.connect(gain);
        gain.connect(this.masterGain);

        osc.start(this.ctx.currentTime + startTime);
        osc.stop(this.ctx.currentTime + startTime + duration);
    }

    playMove() {
        this.playTone(300, 'square', 0.05, 0, 0.5);
    }

    playRotate() {
        this.playTone(400, 'triangle', 0.05, 0, 0.5);
    }

    playHardDrop() {
        this.playTone(150, 'sawtooth', 0.2, 0, 0.8);
        this.playTone(100, 'sine', 0.2, 0.05, 0.8);
    }

    playLock() {
        this.playTone(200, 'square', 0.1, 0, 0.6);
    }

    playLineClear(lines: number) {
        // Arpeggio based on lines
        const base = 440;
        const notes = [base, base * 1.25, base * 1.5, base * 2]; // Major chord-ish

        for (let i = 0; i < Math.min(lines, 4); i++) {
            this.playTone(notes[i], 'sine', 0.3, i * 0.05, 0.8);
        }

        if (lines >= 4) {
            // Tetris! Extra flair
             this.playTone(880, 'square', 0.5, 0.2, 0.5);
        }
    }

    playGameOver() {
        this.playTone(300, 'sawtooth', 0.5, 0);
        this.playTone(250, 'sawtooth', 0.5, 0.4);
        this.playTone(200, 'sawtooth', 0.5, 0.8);
        this.playTone(150, 'sawtooth', 1.0, 1.2);
    }
}
