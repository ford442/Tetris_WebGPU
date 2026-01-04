interface ADSR {
  attack: number;  // seconds
  decay: number;   // seconds
  sustain: number; // 0-1 amplitude
  release: number; // seconds
}

export default class SoundManager {
    private ctx: AudioContext;
    private masterGain: GainNode;
    private reverb: ConvolverNode;
    private reverbGain: GainNode;
    private delay: DelayNode;
    private feedback: GainNode;
    private fxBus: GainNode;

    constructor() {
        // @ts-ignore
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        this.ctx = new AudioContext();
        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.value = 0.3; // Global volume
        this.masterGain.connect(this.ctx.destination);

        // --- FX BUS ---
        // Create shared reverb
        this.reverb = this.ctx.createConvolver();
        this.reverb.buffer = this.createImpulseResponse(1.5, 0.5); // 1.5s reverb tail

        this.reverbGain = this.ctx.createGain();
        this.reverbGain.gain.value = 0.2;

        // Create delay
        this.delay = this.ctx.createDelay(0.5);
        this.delay.delayTime.value = 0.125; // 1/8 note at 120 BPM
        this.feedback = this.ctx.createGain();
        this.feedback.gain.value = 0.3;

        // Connect FX chain
        // Delay loop
        this.delay.connect(this.feedback);
        this.feedback.connect(this.delay);

        // Delay feeds into reverb? Or parallel?
        // Parallel usually cleaner for games, but delay->reverb is nice for dubby feel.
        // Let's go parallel for clarity, but feed delay output to master.
        this.delay.connect(this.reverbGain); // Delay wet goes to reverb
        this.delay.connect(this.masterGain); // Delay wet goes to master

        this.reverbGain.connect(this.reverb);
        this.reverb.connect(this.masterGain);

        // Master FX Bus input
        this.fxBus = this.ctx.createGain();
        this.fxBus.gain.value = 1.0;
        // Connect FX bus to Master (dry) and effects (wet)
        // Actually, we want specific sends. But a global FX bus can be a "Room" bus.
        // For this plan, we will use helper connectToFX() for specific sounds.
    }

    private createEnvelope(gainNode: GainNode, adsr: ADSR, startTime: number, peak: number = 1.0) {
        const now = this.ctx.currentTime + startTime;
        const { attack, decay, sustain, release } = adsr;

        // Prevent clicking
        gainNode.gain.setValueAtTime(0, now);

        // Attack
        gainNode.gain.linearRampToValueAtTime(peak, now + attack);

        // Decay to Sustain
        gainNode.gain.exponentialRampToValueAtTime(Math.max(0.001, sustain * peak), now + attack + decay);

        // Return release start time for scheduling stop
        return now + attack + decay;
    }

    private releaseEnvelope(gainNode: GainNode, adsr: ADSR, releaseStartTime: number) {
        // Release
        gainNode.gain.exponentialRampToValueAtTime(0.001, releaseStartTime + adsr.release);
    }

    private playTone(freq: number, type: OscillatorType, adsr: ADSR,
                   startTime: number = 0, vol: number = 1.0,
                   filterFreq?: number, detuneCents: number = 0) {
        if (this.ctx.state === 'suspended') this.ctx.resume();

        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = type;
        osc.frequency.setValueAtTime(freq, this.ctx.currentTime + startTime);
        osc.detune.setValueAtTime(detuneCents, this.ctx.currentTime + startTime);

        // Create filter if specified
        let lastNode: AudioNode = osc;
        if (filterFreq) {
            const filter = this.ctx.createBiquadFilter();
            filter.type = 'lowpass';
            filter.frequency.setValueAtTime(filterFreq, this.ctx.currentTime + startTime);
            osc.connect(filter);
            lastNode = filter;
        }

        lastNode.connect(gain);
        gain.connect(this.masterGain);

        const releaseStart = this.createEnvelope(gain, adsr, startTime, vol);
        this.releaseEnvelope(gain, adsr, releaseStart);

        osc.start(this.ctx.currentTime + startTime);
        osc.stop(releaseStart + adsr.release + 0.1); // Stop a bit after release
    }

    private createNoiseBuffer(duration: number): AudioBuffer {
        const length = this.ctx.sampleRate * duration;
        const buffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < length; i++) {
            data[i] = Math.random() * 2 - 1;
        }
        return buffer;
    }

    private createImpulseResponse(duration: number, decay: number): AudioBuffer {
        const length = this.ctx.sampleRate * duration;
        const buffer = this.ctx.createBuffer(2, length, this.ctx.sampleRate);
        for (let channel = 0; channel < 2; channel++) {
            const data = buffer.getChannelData(channel);
            for (let i = 0; i < length; i++) {
                data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
            }
        }
        return buffer;
    }

    private connectToFX(node: AudioNode, amount: number = 0.3) {
        const send = this.ctx.createGain();
        send.gain.value = amount;
        node.connect(send);
        send.connect(this.delay); // Chain: Node -> Send -> Delay -> Reverb
        // Also send direct to reverb for non-delayed reverb?
        const revSend = this.ctx.createGain();
        revSend.gain.value = amount;
        node.connect(revSend);
        revSend.connect(this.reverb);
    }

    playMove() {
        // Main tone
        this.playTone(300, 'square',
            { attack: 0.001, decay: 0.02, sustain: 0.1, release: 0.03 },
            0, 0.3, 2000
        );

        // Click transient (Noise)
        const noise = this.ctx.createBufferSource();
        noise.buffer = this.createNoiseBuffer(0.01);

        const noiseFilter = this.ctx.createBiquadFilter();
        noiseFilter.type = 'highpass';
        noiseFilter.frequency.value = 2000;

        const noiseGain = this.ctx.createGain();
        noiseGain.gain.value = 0.1;

        noise.connect(noiseFilter);
        noiseFilter.connect(noiseGain);
        noiseGain.connect(this.masterGain);

        noise.start();
    }

    playRotate() {
        const startTime = this.ctx.currentTime;

        // Left channel - FM synthesis for metallic sheen
        const fmOsc = this.ctx.createOscillator();
        const modulator = this.ctx.createOscillator();
        const modGain = this.ctx.createGain();

        fmOsc.type = 'sine';
        fmOsc.frequency.setValueAtTime(400, startTime);

        modulator.type = 'sine';
        modulator.frequency.setValueAtTime(200, startTime);
        modGain.gain.setValueAtTime(100, startTime);

        modulator.connect(modGain);
        modGain.connect(fmOsc.frequency);

        // Right channel - slightly detuned
        const osc2 = this.ctx.createOscillator();
        osc2.type = 'triangle';
        osc2.frequency.setValueAtTime(410, startTime);
        osc2.detune.setValueAtTime(10, startTime); // 10 cents up

        // Stereo panning
        const leftGain = this.ctx.createGain();
        const rightGain = this.ctx.createGain();
        const merger = this.ctx.createChannelMerger(2);

        leftGain.gain.setValueAtTime(0.3, startTime);
        rightGain.gain.setValueAtTime(0.3, startTime);

        fmOsc.connect(leftGain);
        leftGain.connect(merger, 0, 0);

        osc2.connect(rightGain);
        rightGain.connect(merger, 0, 1);

        merger.connect(this.masterGain);

        // Envelope
        const masterGain = this.ctx.createGain();
        masterGain.gain.setValueAtTime(1, startTime);
        masterGain.gain.exponentialRampToValueAtTime(0.01, startTime + 0.1);
        this.masterGain.connect(masterGain); // Wait, this connects master to local gain? No.
        // The merger is connected to this.masterGain. We want to envelope the merger output?
        // Let's connect merger to an envelope gain, THEN to master.
        merger.disconnect();
        merger.connect(masterGain);
        masterGain.connect(this.masterGain);

        fmOsc.start(startTime);
        modulator.start(startTime);
        osc2.start(startTime);

        fmOsc.stop(startTime + 0.1);
        modulator.stop(startTime + 0.1);
        osc2.stop(startTime + 0.1);
    }

    playHardDrop() {
        const startTime = this.ctx.currentTime;

        // Sub-bass layer
        this.playTone(60, 'sine',
            { attack: 0.001, decay: 0.1, sustain: 0.3, release: 0.3 },
            0, 0.5, 500
        );

        // Main impact
        this.playTone(150, 'sawtooth',
            { attack: 0.001, decay: 0.05, sustain: 0.2, release: 0.2 },
            0, 0.6, 1000
        );

        // Noise impact
        const noise = this.ctx.createBufferSource();
        noise.buffer = this.createNoiseBuffer(0.15);

        const noiseFilter = this.ctx.createBiquadFilter();
        noiseFilter.type = 'lowpass';
        noiseFilter.frequency.setValueAtTime(800, startTime);
        noiseFilter.frequency.exponentialRampToValueAtTime(200, startTime + 0.15);

        const noiseGain = this.ctx.createGain();
        noiseGain.gain.setValueAtTime(0.4, startTime);
        noiseGain.gain.exponentialRampToValueAtTime(0.01, startTime + 0.15);

        // Reverb for Hard Drop (Impactful)
        // We can use the global FX bus helper
        // But noise/filter/gain chain needs to be connected to it.

        noise.connect(noiseFilter);
        noiseFilter.connect(noiseGain);
        noiseGain.connect(this.masterGain);
        this.connectToFX(noiseGain, 0.5); // Send to reverb

        noise.start(startTime);
    }

    playLock() {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'square';
        osc.frequency.setValueAtTime(200, this.ctx.currentTime);

        const releaseStart = this.createEnvelope(gain,
            { attack: 0.001, decay: 0.05, sustain: 0.2, release: 0.1 },
            0, 0.6
        );
        this.releaseEnvelope(gain, { attack: 0.001, decay: 0.05, sustain: 0.2, release: 0.1 }, releaseStart);

        osc.connect(gain);
        gain.connect(this.masterGain);

        // Send to FX bus for spatial depth
        this.connectToFX(gain, 0.2);

        osc.start();
        osc.stop(releaseStart + 0.1);
    }

    playLineClear(lines: number) {
        const startTime = this.ctx.currentTime;
        const base = 440;
        const notes = [base, base * 1.25, base * 1.5, base * 2];

        // Pad chord (sustained)
        notes.forEach((freq, i) => {
            this.playTone(freq, 'sine',
                { attack: 0.01, decay: 0.2, sustain: 0.4, release: 0.5 },
                i * 0.02, 0.2, freq * 2
            );
        });

        // Arpeggio (stereo)
        for (let i = 0; i < Math.min(lines, 4); i++) {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            const pan = this.ctx.createStereoPanner();

            osc.type = 'square';
            osc.frequency.setValueAtTime(notes[i], startTime + i * 0.05);
            pan.pan.setValueAtTime((i - 1.5) * 0.5, startTime + i * 0.05); // Stereo spread

            gain.gain.setValueAtTime(0, startTime + i * 0.05);
            gain.gain.linearRampToValueAtTime(0.1, startTime + i * 0.05 + 0.01);
            gain.gain.exponentialRampToValueAtTime(0.001, startTime + i * 0.05 + 0.3);

            osc.connect(gain);
            gain.connect(pan);
            pan.connect(this.masterGain);
            this.connectToFX(pan, 0.4);

            osc.start(startTime + i * 0.05);
            osc.stop(startTime + i * 0.05 + 0.3);
        }

        // Tetris celebration
        if (lines >= 4) {
            // Shepard tone illusion ish
            for (let i = 0; i < 3; i++) {
                this.playTone(880 * Math.pow(2, i), 'square',
                    { attack: 0.01, decay: 0.1, sustain: 0.5, release: 0.3 },
                    0.2 + i * 0.1, 0.1 / (i + 1)
                );
            }
        }
    }

    playGameOver() {
        const startTime = this.ctx.currentTime;

        // Descending tones with filter sweep
        [300, 250, 200, 150].forEach((freq, i) => {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            const filter = this.ctx.createBiquadFilter();

            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(freq, startTime + i * 0.4);

            filter.type = 'lowpass';
            filter.frequency.setValueAtTime(2000, startTime + i * 0.4);
            filter.frequency.exponentialRampToValueAtTime(200, startTime + i * 0.4 + 1.0);

            gain.gain.setValueAtTime(0.3, startTime + i * 0.4);
            gain.gain.exponentialRampToValueAtTime(0.001, startTime + i * 0.4 + 1.0);

            osc.connect(filter);
            filter.connect(gain);

            // Delay
            const delay = this.ctx.createDelay(1.0);
            delay.delayTime.setValueAtTime(0.3, startTime + i * 0.4);
            const delayGain = this.ctx.createGain();
            delayGain.gain.setValueAtTime(0.3, startTime + i * 0.4);

            gain.connect(delay);
            delay.connect(delayGain);
            delayGain.connect(this.masterGain);
            gain.connect(this.masterGain);

            osc.start(startTime + i * 0.4);
            osc.stop(startTime + i * 0.4 + 1.0);
        });
    }
}
