import { ProceduralMusicGenerator } from './effects/musicGenerator.js';

export class MusicManager {
    private ctx: AudioContext;
    private musicGain: GainNode;
    private currentSource: AudioBufferSourceNode | null = null;
    private currentBuffer: AudioBuffer | null = null;
    private isPlaying: boolean = false;
    private isPaused: boolean = false;
    private currentUrl: string | null = null;
    private playbackStartTime: number = 0;
    private pausedAt: number = 0;
    private loop: boolean = true;
    private proceduralGenerator: ProceduralMusicGenerator | null = null;
    private useProcedural: boolean = false;

    constructor(audioContext: AudioContext, masterGain: GainNode) {
        this.ctx = audioContext;
        this.musicGain = this.ctx.createGain();
        this.musicGain.gain.value = 0.3;
        this.musicGain.connect(masterGain);
    }

    setVolume(volume: number): void {
        this.musicGain.gain.value = Math.max(0, Math.min(1, volume));
        if (this.proceduralGenerator) {
            this.proceduralGenerator.setVolume(volume);
        }
    }

    getVolume(): number {
        return this.musicGain.gain.value;
    }

    enableProcedural(): void {
        if (!this.proceduralGenerator) {
            this.proceduralGenerator = new ProceduralMusicGenerator(this.ctx, this.musicGain);
        }
        this.useProcedural = true;
    }

    async load(url: string): Promise<boolean> {
        try {
            const response = await fetch(url);
            if (!response.ok) {
                console.warn(`MusicManager: Failed to load audio from ${url}`);
                return false;
            }
            const arrayBuffer = await response.arrayBuffer();
            this.currentBuffer = await this.ctx.decodeAudioData(arrayBuffer);
            this.currentUrl = url;
            this.useProcedural = false;
            return true;
        } catch (e) {
            console.warn(`MusicManager: Error loading audio from ${url}:`, e);
            return false;
        }
    }

    play(): void {
        if (this.useProcedural && this.proceduralGenerator) {
            this.proceduralGenerator.play();
            this.isPlaying = true;
            return;
        }

        if (!this.currentBuffer) {
            // Fall back to procedural music if no file loaded
            if (!this.proceduralGenerator) {
                this.proceduralGenerator = new ProceduralMusicGenerator(this.ctx, this.musicGain);
            }
            this.useProcedural = true;
            this.proceduralGenerator.play();
            this.isPlaying = true;
            return;
        }

        if (this.isPlaying) {
            this.stop();
        }

        this.currentSource = this.ctx.createBufferSource();
        this.currentSource.buffer = this.currentBuffer;
        this.currentSource.loop = this.loop;
        this.currentSource.connect(this.musicGain);

        const offset = this.isPaused ? this.pausedAt : 0;
        this.currentSource.start(0, offset);
        this.playbackStartTime = this.ctx.currentTime - offset;
        this.isPlaying = true;
        this.isPaused = false;
    }

    pause(): void {
        if (this.useProcedural && this.proceduralGenerator) {
            this.proceduralGenerator.pause();
            this.isPlaying = false;
            this.isPaused = true;
            return;
        }

        if (!this.isPlaying || !this.currentSource) return;
        
        this.pausedAt = this.ctx.currentTime - this.playbackStartTime;
        this.stop();
        this.isPaused = true;
    }

    resume(): void {
        if (this.isPaused) {
            this.play();
        }
    }

    stop(): void {
        if (this.proceduralGenerator) {
            this.proceduralGenerator.stop();
        }

        if (this.currentSource) {
            try {
                this.currentSource.stop();
            } catch (e) {
                // Source might already be stopped
            }
            this.currentSource.disconnect();
            this.currentSource = null;
        }
        this.isPlaying = false;
    }

    setLoop(shouldLoop: boolean): void {
        this.loop = shouldLoop;
        if (this.currentSource) {
            this.currentSource.loop = shouldLoop;
        }
    }

    isMusicPlaying(): boolean {
        if (this.useProcedural && this.proceduralGenerator) {
            return this.proceduralGenerator.isMusicPlaying();
        }
        return this.isPlaying;
    }

    isMusicPaused(): boolean {
        return this.isPaused;
    }
}

export default class SoundManager {
    private ctx: AudioContext;
    private masterGain: GainNode;
    private noiseBuffer: AudioBuffer | null = null;
    private pinkNoiseBuffer: AudioBuffer | null = null;
    private enabled: boolean = true;
    musicManager: MusicManager;

    constructor() {
        // @ts-ignore
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        this.ctx = new AudioContext();
        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.value = 0.35;
        this.masterGain.connect(this.ctx.destination);

        this.initNoiseBuffers();
        
        // Initialize MusicManager
        this.musicManager = new MusicManager(this.ctx, this.masterGain);
        
        // Try to load placeholder music (will gracefully fail if not available)
        this.loadPlaceholderMusic();
    }

    private async loadPlaceholderMusic(): Promise<void> {
        // Placeholder: Try to load from common locations, but don't worry if it fails
        const placeholderUrls = [
            './assets/music/background.mp3',
            './assets/music/theme.ogg',
            './assets/audio/bgm.mp3'
        ];
        
        for (const url of placeholderUrls) {
            const success = await this.musicManager.load(url);
            if (success) {
                console.log(`MusicManager: Loaded background music from ${url}`);
                break;
            }
        }
    }

    private initNoiseBuffers() {
        if (!this.ctx) return;
        
        // White noise for impacts
        const bufferSize = this.ctx.sampleRate * 2.0;
        this.noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = this.noiseBuffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = Math.random() * 2 - 1;
        }

        // Pink noise for softer textures (1/f noise approximation)
        this.pinkNoiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
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

    setEnabled(enabled: boolean) {
        this.enabled = enabled;
    }

    private ensureContext() {
        if (this.ctx.state === 'suspended') {
            this.ctx.resume();
        }
    }

    // Enhanced tone with ADSR envelope and optional detune for richness
    private playTone(
        freq: number, 
        type: OscillatorType, 
        duration: number, 
        startTime: number = 0, 
        vol: number = 1.0,
        options: {
            attack?: number;
            decay?: number;
            sustain?: number;
            release?: number;
            detune?: number;
            pan?: number;
        } = {}
    ) {
        if (!this.enabled) return;
        this.ensureContext();

        const {
            attack = 0.005,
            decay = 0.1,
            sustain = 0.7,
            release = 0.1,
            detune = 0,
            pan = 0
        } = options;

        const t = this.ctx.currentTime + startTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        const panner = this.ctx.createStereoPanner?.() || this.masterGain;

        osc.type = type;
        osc.frequency.setValueAtTime(freq, t);
        if (detune) osc.detune.value = detune;

        // ADSR envelope
        gain.gain.setValueAtTime(0, t);
        gain.gain.linearRampToValueAtTime(vol, t + attack);
        gain.gain.linearRampToValueAtTime(vol * sustain, t + attack + decay);
        gain.gain.setValueAtTime(vol * sustain, t + duration - release);
        gain.gain.exponentialRampToValueAtTime(0.001, t + duration);

        osc.connect(gain);
        
        if (this.ctx.createStereoPanner) {
            (panner as StereoPannerNode).pan.value = pan;
            gain.connect(panner as StereoPannerNode);
            (panner as StereoPannerNode).connect(this.masterGain);
        } else {
            gain.connect(this.masterGain);
        }

        osc.start(t);
        osc.stop(t + duration);
    }

    // Play a chord with multiple oscillators
    private playChord(
        freqs: number[], 
        type: OscillatorType, 
        duration: number, 
        startTime: number = 0, 
        vol: number = 1.0,
        options: { stagger?: number; detuneSpread?: number } = {}
    ) {
        const { stagger = 0, detuneSpread = 5 } = options;
        freqs.forEach((freq, i) => {
            const detune = (i - freqs.length / 2) * detuneSpread;
            this.playTone(freq, type, duration, startTime + i * stagger, vol, { detune });
        });
    }

    // Enhanced noise with filter options
    private playNoise(
        duration: number, 
        startTime: number = 0, 
        vol: number = 1.0,
        options: {
            filterType?: BiquadFilterType;
            frequency?: number;
            Q?: number;
            noiseType?: 'white' | 'pink';
            attack?: number;
            release?: number;
            pan?: number;
        } = {}
    ) {
        if (!this.enabled) return;
        this.ensureContext();

        const {
            filterType = 'lowpass',
            frequency = 800,
            Q = 1,
            noiseType = 'white',
            attack = 0.001,
            release = 0.05,
            pan = 0
        } = options;

        const buffer = noiseType === 'pink' ? this.pinkNoiseBuffer : this.noiseBuffer;
        if (!buffer) return;

        const t = this.ctx.currentTime + startTime;
        const source = this.ctx.createBufferSource();
        source.buffer = buffer;

        const filter = this.ctx.createBiquadFilter();
        filter.type = filterType;
        filter.frequency.value = frequency;
        filter.Q.value = Q;

        const gain = this.ctx.createGain();
        const panner = this.ctx.createStereoPanner?.();

        // Envelope
        gain.gain.setValueAtTime(0, t);
        gain.gain.linearRampToValueAtTime(vol, t + attack);
        gain.gain.setValueAtTime(vol, t + duration - release);
        gain.gain.exponentialRampToValueAtTime(0.001, t + duration);

        source.connect(filter);
        filter.connect(gain);

        if (panner) {
            panner.pan.value = pan;
            gain.connect(panner);
            panner.connect(this.masterGain);
        } else {
            gain.connect(this.masterGain);
        }

        source.start(t);
        source.stop(t + duration);
    }

    // Create a satisfying "thud" with multiple components
    private playThud(intensity: number = 1.0, startTime: number = 0) {
        if (!this.enabled) return;
        const t = this.ctx.currentTime + startTime;
        
        // Low frequency punch
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.frequency.setValueAtTime(80 * intensity, t);
        osc.frequency.exponentialRampToValueAtTime(30, t + 0.12);
        gain.gain.setValueAtTime(0.6 * intensity, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
        osc.connect(gain);
        gain.connect(this.masterGain);
        osc.start(t);
        osc.stop(t + 0.15);

        // Mid body
        const osc2 = this.ctx.createOscillator();
        const gain2 = this.ctx.createGain();
        osc2.type = 'triangle';
        osc2.frequency.setValueAtTime(120 * intensity, t);
        osc2.frequency.exponentialRampToValueAtTime(60, t + 0.08);
        gain2.gain.setValueAtTime(0.3 * intensity, t);
        gain2.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
        osc2.connect(gain2);
        gain2.connect(this.masterGain);
        osc2.start(t);
        osc2.stop(t + 0.1);

        // Noise texture
        this.playNoise(0.08, startTime, 0.4 * intensity, {
            filterType: 'lowpass',
            frequency: 400,
            attack: 0.001,
            release: 0.03
        });
    }

    // Mechanical switch click sound
    private playClick(freq: number = 2000, vol: number = 0.3) {
        if (!this.enabled) return;
        const t = this.ctx.currentTime;
        
        // Sharp attack
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'square';
        osc.frequency.setValueAtTime(freq, t);
        osc.frequency.exponentialRampToValueAtTime(freq * 0.5, t + 0.015);
        gain.gain.setValueAtTime(vol, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.02);
        osc.connect(gain);
        gain.connect(this.masterGain);
        osc.start(t);
        osc.stop(t + 0.02);

        // Tiny noise burst for texture
        this.playNoise(0.01, 0, vol * 0.5, {
            filterType: 'highpass',
            frequency: 3000,
            attack: 0.0001,
            release: 0.005
        });
    }

    // ==================== GAME SOUNDS ====================

    playMove() {
        // Mechanical switch feel - subtle but tactile
        this.playClick(1800, 0.15);
        
        // Subtle pitch blip for feedback
        this.playTone(800, 'sine', 0.03, 0, 0.1, {
            attack: 0.001,
            decay: 0.01,
            sustain: 0.3,
            release: 0.02
        });
    }

    playRotate() {
        if (!this.enabled) return;
        const t = this.ctx.currentTime;
        
        // Satisfying mechanical engagement
        this.playClick(1200, 0.2);
        
        // Swish with character - rising then falling
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        const filter = this.ctx.createBiquadFilter();
        
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
        gain.connect(this.masterGain);
        osc.start(t);
        osc.stop(t + 0.12);

        // Subtle harmonic
        this.playTone(600, 'triangle', 0.08, 0.02, 0.08, {
            attack: 0.01,
            release: 0.04
        });
    }

    playSoftDrop() {
        // Gentle whoosh - piece sliding down
        this.playNoise(0.06, 0, 0.15, {
            filterType: 'bandpass',
            frequency: 600,
            Q: 3,
            noiseType: 'pink',
            attack: 0.01,
            release: 0.03
        });

        // Subtle pitch descent
        this.playTone(400, 'sine', 0.05, 0, 0.1, {
            attack: 0.005,
            release: 0.03
        });
    }

    playHardDrop() {
        if (!this.enabled) return;
        const t = this.ctx.currentTime;
        
        // Air rush during descent
        this.playNoise(0.08, 0, 0.25, {
            filterType: 'lowpass',
            frequency: 2000,
            noiseType: 'pink',
            attack: 0.005,
            release: 0.02
        });

        // Whoosh sweep
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(600, t);
        osc.frequency.exponentialRampToValueAtTime(100, t + 0.08);
        gain.gain.setValueAtTime(0.15, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
        osc.connect(gain);
        gain.connect(this.masterGain);
        osc.start(t);
        osc.stop(t + 0.08);

        // Impact (slightly delayed)
        setTimeout(() => this.playThud(1.2, 0), 50);

        // High frequency crack
        this.playTone(3000, 'square', 0.03, 0.08, 0.15, {
            attack: 0.001,
            release: 0.02
        });
    }

    playLock() {
        if (!this.enabled) return;
        const t = this.ctx.currentTime;
        
        // Satisfying mechanical clunk
        this.playThud(0.8, 0);
        
        // Resonant body
        this.playTone(220, 'square', 0.08, 0, 0.2, {
            attack: 0.001,
            decay: 0.03,
            sustain: 0.4,
            release: 0.04
        });
        
        // Higher harmonic for "settled" feel
        this.playTone(440, 'sine', 0.06, 0.01, 0.12, {
            attack: 0.002,
            release: 0.03
        });

        // Tiny mechanical click
        this.playClick(2500, 0.1);
    }

    playHold() {
        // Quick mechanical snap for hold piece
        this.playClick(1500, 0.25);
        
        // Satisfying "clack"
        this.playTone(330, 'triangle', 0.05, 0, 0.2, {
            attack: 0.001,
            release: 0.02
        });
        this.playTone(660, 'sine', 0.04, 0.01, 0.1, {
            attack: 0.002,
            release: 0.02
        });
    }

    playLineClear(lines: number, combo: number = 0, backToBack: boolean = false) {
        if (!this.enabled) return;
        
        // Pitch progression based on combo (semitone steps)
        const pitchMod = Math.pow(1.059463, Math.min(combo, 16));
        const baseFreq = 440 * pitchMod; // A4 base
        
        // Different chords for different line counts
        const chords: Record<number, number[]> = {
            1: [baseFreq, baseFreq * 1.25], // Major 3rd - simple
            2: [baseFreq, baseFreq * 1.25, baseFreq * 1.5], // Major triad
            3: [baseFreq, baseFreq * 1.2, baseFreq * 1.5, baseFreq * 1.8], // Rich major
            4: [baseFreq * 0.5, baseFreq, baseFreq * 1.25, baseFreq * 1.5, baseFreq * 2] // Full Tetris chord
        };

        const chord = chords[Math.min(lines, 4)] || chords[1];
        const isTetris = lines >= 4;

        if (isTetris) {
            this.playTetrisClear(chord, combo, backToBack);
        } else {
            this.playNormalClear(lines, chord, combo, backToBack);
        }
    }

    private playNormalClear(lines: number, chord: number[], combo: number, backToBack: boolean) {
        const t = this.ctx.currentTime;
        const vol = Math.min(0.25 + combo * 0.02, 0.4);
        
        // Arpeggio that gets faster with more lines
        const stagger = Math.max(0.04 - lines * 0.01, 0.015);
        
        chord.forEach((freq, i) => {
            // Main voice
            this.playTone(freq, 'square', 0.25, i * stagger, vol, {
                attack: 0.005,
                decay: 0.08,
                sustain: 0.5,
                release: 0.08
            });
            
            // Octave layer for richness
            this.playTone(freq * 2, 'sawtooth', 0.2, i * stagger + 0.01, vol * 0.3, {
                attack: 0.01,
                release: 0.06
            });
        });

        // Shimmer noise
        this.playNoise(0.15, 0, vol * 0.5, {
            filterType: 'bandpass',
            frequency: 2000 + combo * 100,
            Q: 4,
            noiseType: 'pink',
            attack: 0.01,
            release: 0.08
        });

        if (backToBack) {
            // Echo effect for back-to-back
            setTimeout(() => {
                this.playTone(chord[0] * 2, 'sawtooth', 0.2, 0, vol * 0.4, {
                    attack: 0.01,
                    release: 0.1
                });
            }, 150);
        }
    }

    private playTetrisClear(chord: number[], combo: number, backToBack: boolean) {
        if (!this.enabled) return;
        const t = this.ctx.currentTime;
        const vol = Math.min(0.3 + combo * 0.02, 0.5);

        // Epic fanfare - full chord blast
        chord.forEach((freq, i) => {
            // Layered voices for massive sound
            this.playTone(freq, 'square', 0.8, 0, vol * 0.6, {
                attack: 0.01,
                decay: 0.2,
                sustain: 0.6,
                release: 0.2,
                detune: (Math.random() - 0.5) * 10
            });
            
            this.playTone(freq * 2, 'sawtooth', 0.7, 0.02, vol * 0.4, {
                attack: 0.02,
                release: 0.15
            });
            
            // Sub octave for weight
            this.playTone(freq * 0.5, 'triangle', 0.9, 0, vol * 0.5, {
                attack: 0.02,
                release: 0.25
            });
        });

        // Uplifting sweep
        const sweep = this.ctx.createOscillator();
        const sweepGain = this.ctx.createGain();
        sweep.type = 'sine';
        sweep.frequency.setValueAtTime(400, t);
        sweep.frequency.linearRampToValueAtTime(1500, t + 0.6);
        sweepGain.gain.setValueAtTime(0.2, t);
        sweepGain.gain.linearRampToValueAtTime(0, t + 0.6);
        sweep.connect(sweepGain);
        sweepGain.connect(this.masterGain);
        sweep.start(t);
        sweep.stop(t + 0.6);

        // Cymbal crash
        this.playNoise(0.8, 0, 0.4, {
            filterType: 'highpass',
            frequency: 3000,
            noiseType: 'white',
            attack: 0.005,
            release: 0.3
        });

        // Secondary crash (decayed)
        this.playNoise(0.5, 0.1, 0.25, {
            filterType: 'bandpass',
            frequency: 5000,
            Q: 2,
            noiseType: 'white',
            attack: 0.01,
            release: 0.2
        });

        if (backToBack) {
            // Triumphant echo for back-to-back Tetris
            setTimeout(() => {
                this.playTone(880 * Math.pow(1.059, Math.min(combo, 16)), 'square', 0.4, 0, 0.3, {
                    attack: 0.01,
                    release: 0.15
                });
                this.playTone(1100 * Math.pow(1.059, Math.min(combo, 16)), 'sawtooth', 0.35, 0.05, 0.2, {
                    attack: 0.01,
                    release: 0.1
                });
            }, 200);
        }
    }

    playTSpin() {
        if (!this.enabled) return;
        const t = this.ctx.currentTime;
        
        // Distinctive T-Spin sound - mechanical and rewarding
        this.playClick(2000, 0.3);
        
        // Special chord
        const freqs = [523.25, 659.25, 783.99]; // C major
        freqs.forEach((freq, i) => {
            this.playTone(freq, 'square', 0.15, i * 0.02, 0.25, {
                attack: 0.005,
                release: 0.08
            });
        });

        // Sparkle noise
        this.playNoise(0.12, 0, 0.3, {
            filterType: 'bandpass',
            frequency: 4000,
            Q: 5,
            noiseType: 'white',
            attack: 0.005,
            release: 0.08
        });
    }

    playGameOver() {
        if (!this.enabled) return;
        const t = this.ctx.currentTime;
        
        // Sad descending arpeggio with longer sustain
        const notes = [330, 294, 262, 220, 196, 165]; // E-D-C-A-G-E
        notes.forEach((freq, i) => {
            this.playTone(freq, 'sawtooth', 0.5, i * 0.12, 0.4, {
                attack: 0.02,
                decay: 0.15,
                sustain: 0.5,
                release: 0.2
            });
            
            // Subtle harmony
            if (i < notes.length - 1) {
                this.playTone(freq * 0.5, 'triangle', 0.4, i * 0.12, 0.25, {
                    attack: 0.03,
                    release: 0.15
                });
            }
        });

        // Deep drone that fades
        const drone = this.ctx.createOscillator();
        const droneGain = this.ctx.createGain();
        drone.type = 'sawtooth';
        drone.frequency.setValueAtTime(55, t);
        drone.frequency.linearRampToValueAtTime(40, t + 2.5);
        droneGain.gain.setValueAtTime(0.4, t);
        droneGain.gain.exponentialRampToValueAtTime(0.001, t + 2.5);
        
        // Lowpass filter that closes
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(800, t);
        filter.frequency.linearRampToValueAtTime(100, t + 2.5);
        
        drone.connect(filter);
        filter.connect(droneGain);
        droneGain.connect(this.masterGain);
        drone.start(t);
        drone.stop(t + 2.5);

        // Final thud
        setTimeout(() => this.playThud(0.6, 0), 600);
    }

    playLevelUp() {
        if (!this.enabled) return;
        const t = this.ctx.currentTime;
        
        // Triumphant ascending scale with shimmer
        const notes = [523.25, 659.25, 783.99, 1046.50, 1318.51]; // C-E-G-C-E
        
        notes.forEach((freq, i) => {
            const time = i * 0.06;
            
            // Main voice
            this.playTone(freq, 'triangle', 0.15, time, 0.4, {
                attack: 0.005,
                decay: 0.05,
                sustain: 0.6,
                release: 0.08
            });
            
            // Octave sparkle
            this.playTone(freq * 2, 'sine', 0.12, time + 0.01, 0.2, {
                attack: 0.01,
                release: 0.06
            });
        });

        // Final triumphant chord
        const finalChord = [1046.50, 1318.51, 1567.98, 2093.00]; // C-E-G-C
        finalChord.forEach((freq, i) => {
            this.playTone(freq, 'square', 0.5, 0.35 + i * 0.01, 0.3, {
                attack: 0.01,
                decay: 0.1,
                sustain: 0.5,
                release: 0.2,
                detune: (i - 2) * 3
            });
        });

        // Shimmer effect
        this.playNoise(0.3, 0.35, 0.35, {
            filterType: 'bandpass',
            frequency: 3000,
            Q: 3,
            noiseType: 'pink',
            attack: 0.02,
            release: 0.2
        });

        // Bell-like chime
        this.playTone(3135.96, 'sine', 0.6, 0.4, 0.25, { // High G
            attack: 0.005,
            decay: 0.1,
            sustain: 0.4,
            release: 0.3
        });
    }

    playPause() {
        // Mechanical click for pause
        this.playClick(1600, 0.2);
        this.playTone(440, 'sine', 0.08, 0, 0.15, {
            attack: 0.005,
            release: 0.04
        });
    }

    playResume() {
        // Brighter click for resume
        this.playClick(2000, 0.25);
        this.playTone(554, 'sine', 0.08, 0, 0.18, {
            attack: 0.005,
            release: 0.04
        });
    }

    playMenuNavigate() {
        // Subtle UI tick
        this.playTone(1200, 'sine', 0.02, 0, 0.08, {
            attack: 0.001,
            release: 0.015
        });
    }

    playMenuSelect() {
        // Satisfying confirmation
        this.playClick(1500, 0.2);
        this.playTone(880, 'triangle', 0.05, 0, 0.15, {
            attack: 0.002,
            release: 0.03
        });
    }
}
