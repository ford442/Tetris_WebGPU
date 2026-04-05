/**
 * Procedural Background Music Generator
 * Creates synthwave-style background music using Web Audio API
 * No external audio files required
 */

export class ProceduralMusicGenerator {
  private ctx: AudioContext;
  private masterGain: GainNode;
  private isPlaying: boolean = false;
  private loopInterval: number | null = null;
  private nextNoteTime: number = 0;
  private beatIndex: number = 0;
  private readonly tempo: number = 128; // BPM
  private readonly secondsPerBeat: number;
  private musicGain: GainNode;
  private enabled: boolean = true;

  // Synthwave chord progression (Cm - Gm - Eb - Bb)
  private readonly chords: number[][] = [
    [130.81, 155.56, 196.00], // C3, Eb3, G3 (Cm)
    [98.00, 123.47, 146.83],  // G2, Bb2, D3 (Gm)
    [77.78, 97.99, 123.47],   // Eb2, G2, Bb2 (Eb)
    [116.54, 146.83, 174.61], // Bb2, D3, F3 (Bb)
  ];

  // Arpeggio patterns
  private readonly arpPatterns: number[][] = [
    [0, 2, 1, 2, 0, 2, 1, 2], // Standard 8th note pattern
    [0, 1, 2, 1, 0, 2, 1, 0], // Variation
  ];
  private currentArpPattern: number = 0;

  constructor(audioContext: AudioContext, masterGain: GainNode) {
    this.ctx = audioContext;
    this.masterGain = masterGain;
    this.secondsPerBeat = 60.0 / this.tempo;
    
    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = 0.3;
    this.musicGain.connect(masterGain);
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled && this.isPlaying) {
      this.stop();
    } else if (enabled && !this.isPlaying) {
      this.play();
    }
  }

  setVolume(volume: number): void {
    this.musicGain.gain.value = Math.max(0, Math.min(1, volume));
  }

  getVolume(): number {
    return this.musicGain.gain.value;
  }

  play(): void {
    if (this.isPlaying || !this.enabled) return;
    
    this.isPlaying = true;
    this.nextNoteTime = this.ctx.currentTime + 0.1;
    this.beatIndex = 0;
    this.scheduleLoop();
  }

  stop(): void {
    this.isPlaying = false;
    if (this.loopInterval !== null) {
      clearInterval(this.loopInterval);
      this.loopInterval = null;
    }
  }

  pause(): void {
    this.stop();
  }

  resume(): void {
    this.play();
  }

  isMusicPlaying(): boolean {
    return this.isPlaying;
  }

  private scheduleLoop(): void {
    if (!this.isPlaying) return;

    // Schedule notes ahead of time
    const lookahead = 0.1; // seconds
    const scheduleAheadTime = 0.3; // seconds

    this.loopInterval = window.setInterval(() => {
      while (this.nextNoteTime < this.ctx.currentTime + scheduleAheadTime) {
        this.scheduleNote(this.nextNoteTime);
        this.nextNoteTime += this.secondsPerBeat / 2; // 8th notes
      }
    }, lookahead * 1000);
  }

  private scheduleNote(time: number): void {
    const chordIndex = Math.floor(this.beatIndex / 8) % this.chords.length;
    const chord = this.chords[chordIndex];
    const pattern = this.arpPatterns[this.currentArpPattern];
    const noteInPattern = this.beatIndex % 8;
    const freq = chord[pattern[noteInPattern]];

    // Play bass on beats 0 and 4
    if (noteInPattern === 0 || noteInPattern === 4) {
      this.playBass(chord[0], time);
    }

    // Play arpeggio
    this.playArpNote(freq, time);

    // Play chord pad on chord changes
    if (noteInPattern === 0) {
      this.playChordPad(chord, time);
    }

    this.beatIndex++;
  }

  private playBass(freq: number, time: number): void {
    // Deep sawtooth bass
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(freq * 0.5, time); // One octave down

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(400, time);
    filter.frequency.exponentialRampToValueAtTime(200, time + 0.4);

    gain.gain.setValueAtTime(0, time);
    gain.gain.linearRampToValueAtTime(0.25, time + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.1, time + 0.3);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.5);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.musicGain);

    osc.start(time);
    osc.stop(time + 0.5);
  }

  private playArpNote(freq: number, time: number): void {
    // Bright square wave arpeggio
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();

    osc.type = 'square';
    osc.frequency.setValueAtTime(freq * 2, time); // One octave up

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(2000, time);
    filter.Q.value = 2;

    gain.gain.setValueAtTime(0, time);
    gain.gain.linearRampToValueAtTime(0.08, time + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.15);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.musicGain);

    osc.start(time);
    osc.stop(time + 0.15);
  }

  private playChordPad(chord: number[], time: number): void {
    // Rich pad sound
    chord.forEach((freq, i) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const filter = this.ctx.createBiquadFilter();

      osc.type = i === 0 ? 'sawtooth' : 'triangle';
      osc.frequency.setValueAtTime(freq, time);
      
      // Slight detune for richness
      osc.detune.value = (Math.random() - 0.5) * 10;

      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(800, time);
      filter.frequency.linearRampToValueAtTime(400, time + 2);

      gain.gain.setValueAtTime(0, time);
      gain.gain.linearRampToValueAtTime(0.08, time + 0.1);
      gain.gain.exponentialRampToValueAtTime(0.001, time + 2);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.musicGain);

      osc.start(time);
      osc.stop(time + 2);
    });
  }
}

export default ProceduralMusicGenerator;
