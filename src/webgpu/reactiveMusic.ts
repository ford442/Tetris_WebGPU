/**
 * Reactive Procedural Music System
 * Hybrid: MP3/FLAC base + procedural synth layer that reacts to gameplay
 */

export interface MusicLayer {
  oscillators: OscillatorNode[];
  gainNodes: GainNode[];
  filter: BiquadFilterNode;
  baseGain: number;
}

export class ReactiveMusicSystem {
  private ctx: AudioContext;
  private masterGain: GainNode;
  private isPlaying: boolean = false;
  
  // Base music (MP3/FLAC)
  private baseMusicSource: AudioBufferSourceNode | null = null;
  private baseMusicBuffer: AudioBuffer | null = null;
  private baseMusicGain: GainNode;
  
  // Procedural reactive layer
  private reactiveLayer: MusicLayer;
  private reactiveGain: GainNode;
  
  // Effect chain
  private compressor: DynamicsCompressorNode;
  private reverb: ConvolverNode | null = null;
  
  // State for reactivity
  private intensity: number = 0.5; // 0.0 - 1.0
  private targetIntensity: number = 0.5;
  private comboLevel: number = 0;
  private isTension: boolean = false;
  private currentScale: number[] = [];
  
  // Musical scales
  private scales: Record<string, number[]> = {
    minor: [0, 3, 5, 7, 10, 12, 15, 17], // Minor pentatonic extension
    major: [0, 4, 5, 7, 9, 12, 16, 17],  // Major scale
    phrygian: [0, 1, 4, 5, 7, 8, 10, 12], // Dark, tense
    lydian: [0, 2, 4, 6, 7, 9, 11, 12],   // Dreamy, floating
    chromatic: [0, 1, 2, 3, 4, 5, 6, 7],  // All notes
  };
  
  private rootNote: number = 130.81; // C3

  constructor(audioContext: AudioContext, masterGain: GainNode) {
    this.ctx = audioContext;
    this.masterGain = masterGain;
    
    // Setup compressor for punchy sound
    this.compressor = this.ctx.createDynamicsCompressor();
    this.compressor.threshold.value = -24;
    this.compressor.knee.value = 30;
    this.compressor.ratio.value = 12;
    this.compressor.attack.value = 0.003;
    this.compressor.release.value = 0.25;
    this.compressor.connect(this.masterGain);
    
    // Base music gain
    this.baseMusicGain = this.ctx.createGain();
    this.baseMusicGain.gain.value = 0.6;
    this.baseMusicGain.connect(this.compressor);
    
    // Reactive layer
    this.reactiveGain = this.ctx.createGain();
    this.reactiveGain.gain.value = 0.3;
    this.reactiveGain.connect(this.compressor);
    
    // Initialize reactive layer
    this.reactiveLayer = this.createReactiveLayer();
    
    // Start with minor scale
    this.currentScale = this.scales.minor;
    
    // Start animation loop
    this.animate();
  }

  private createReactiveLayer(): MusicLayer {
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 800;
    filter.Q.value = 1;
    filter.connect(this.reactiveGain);
    
    // Create multiple oscillators for rich sound
    const oscillators: OscillatorNode[] = [];
    const gainNodes: GainNode[] = [];
    
    // Bass oscillator
    const bassOsc = this.ctx.createOscillator();
    bassOsc.type = 'sawtooth';
    bassOsc.frequency.value = this.rootNote / 2;
    const bassGain = this.ctx.createGain();
    bassGain.gain.value = 0;
    bassOsc.connect(bassGain);
    bassGain.connect(filter);
    oscillators.push(bassOsc);
    gainNodes.push(bassGain);
    bassOsc.start();
    
    // Lead oscillator 1
    const lead1 = this.ctx.createOscillator();
    lead1.type = 'square';
    lead1.frequency.value = this.rootNote;
    const lead1Gain = this.ctx.createGain();
    lead1Gain.gain.value = 0;
    lead1.connect(lead1Gain);
    lead1Gain.connect(filter);
    oscillators.push(lead1);
    gainNodes.push(lead1Gain);
    lead1.start();
    
    // Lead oscillator 2 (detuned)
    const lead2 = this.ctx.createOscillator();
    lead2.type = 'sawtooth';
    lead2.frequency.value = this.rootNote;
    lead2.detune.value = 7; // Slight detune for width
    const lead2Gain = this.ctx.createGain();
    lead2Gain.gain.value = 0;
    lead2.connect(lead2Gain);
    lead2Gain.connect(filter);
    oscillators.push(lead2);
    gainNodes.push(lead2Gain);
    lead2.start();
    
    // High shimmer
    const shimmer = this.ctx.createOscillator();
    shimmer.type = 'sine';
    shimmer.frequency.value = this.rootNote * 4;
    const shimmerGain = this.ctx.createGain();
    shimmerGain.gain.value = 0;
    shimmer.connect(shimmerGain);
    shimmerGain.connect(filter);
    oscillators.push(shimmer);
    gainNodes.push(shimmerGain);
    shimmer.start();
    
    return { oscillators, gainNodes, filter, baseGain: 0.3 };
  }

  // Load base music (MP3/FLAC)
  async loadBaseMusic(url: string): Promise<boolean> {
    try {
      const response = await fetch(url);
      if (!response.ok) return false;
      
      const arrayBuffer = await response.arrayBuffer();
      this.baseMusicBuffer = await this.ctx.decodeAudioData(arrayBuffer);
      return true;
    } catch (e) {
      console.warn('[Music] Failed to load base music:', e);
      return false;
    }
  }

  // Play the music system
  play(): void {
    if (this.isPlaying) return;
    this.isPlaying = true;
    
    // Start base music if available
    if (this.baseMusicBuffer) {
      this.baseMusicSource = this.ctx.createBufferSource();
      this.baseMusicSource.buffer = this.baseMusicBuffer;
      this.baseMusicSource.loop = true;
      this.baseMusicSource.connect(this.baseMusicGain);
      this.baseMusicSource.start();
    }
    
    // Fade in reactive layer
    this.fadeGain(this.reactiveGain.gain, 0.3, 1);
  }

  stop(): void {
    this.isPlaying = false;
    
    if (this.baseMusicSource) {
      try { this.baseMusicSource.stop(); } catch {}
      this.baseMusicSource.disconnect();
      this.baseMusicSource = null;
    }
    
    // Fade out reactive layer
    this.fadeGain(this.reactiveGain.gain, 0, 0.5);
  }

  pause(): void {
    this.ctx.suspend();
  }

  resume(): void {
    this.ctx.resume();
  }

  // GAMEPLAY REACTIVITY

  onLineClear(lines: number, combo: number, isTetris: boolean): void {
    // Increase intensity
    this.targetIntensity = Math.min(1.0, 0.3 + (lines * 0.15) + (combo * 0.05));
    this.comboLevel = combo;
    
    // Musical response
    const arpeggioNotes = this.getArpeggioNotes(lines);
    this.triggerArpeggio(arpeggioNotes, isTetris);
    
    // Filter sweep up
    this.sweepFilter(2000 + (lines * 500), 0.1);
  }

  onTSpin(): void {
    // Tension moment
    this.isTension = true;
    this.targetIntensity = 0.9;
    this.switchScale('phrygian');
    
    // Pitch dive
    this.pitchDive();
    
    setTimeout(() => {
      this.isTension = false;
      this.switchScale('minor');
    }, 1000);
  }

  onLevelUp(level: number): void {
    // Key change
    this.rootNote = 130.81 * Math.pow(1.059463, (level % 12));
    this.updateOscillatorFrequencies();
    
    // Intensity boost
    this.targetIntensity = 1.0;
    this.sweepFilter(3000, 2.0);
    
    // Play level up arpeggio
    const levelUpNotes = [0, 4, 7, 12, 16, 19, 24];
    this.triggerArpeggio(levelUpNotes, true);
  }

  onLock(): void {
    // Subtle bass hit
    this.triggerBassHit();
  }

  onGameOver(): void {
    this.targetIntensity = 0.1;
    this.switchScale('phrygian');
    this.sweepFilter(200, 3.0);
  }

  // Musical utilities

  private getArpeggioNotes(lineCount: number): number[] {
    const baseArpeggios: Record<number, number[]> = {
      1: [0, 4, 7],      // Major triad
      2: [0, 3, 7, 10],  // Minor 7th
      3: [0, 4, 7, 11],  // Major 7th
      4: [0, 4, 7, 12, 16], // Tetris chord
    };
    return baseArpeggios[lineCount] || baseArpeggios[1];
  }

  private triggerArpeggio(intervals: number[], isEpic: boolean): void {
    const now = this.ctx.currentTime;
    const speed = isEpic ? 0.04 : 0.08;
    
    intervals.forEach((interval, i) => {
      const freq = this.rootNote * Math.pow(1.059463, interval);
      const time = now + i * speed;
      
      // Lead
      this.reactiveLayer.oscillators[1].frequency.setValueAtTime(freq, time);
      this.reactiveLayer.oscillators[2].frequency.setValueAtTime(freq, time);
      
      // Envelope
      const gain = isEpic ? 0.4 : 0.2;
      this.reactiveLayer.gainNodes[1].gain.setValueAtTime(0, time);
      this.reactiveLayer.gainNodes[1].gain.linearRampToValueAtTime(gain, time + 0.02);
      this.reactiveLayer.gainNodes[1].gain.exponentialRampToValueAtTime(0.001, time + 0.15);
      
      this.reactiveLayer.gainNodes[2].gain.setValueAtTime(0, time);
      this.reactiveLayer.gainNodes[2].gain.linearRampToValueAtTime(gain * 0.7, time + 0.02);
      this.reactiveLayer.gainNodes[2].gain.exponentialRampToValueAtTime(0.001, time + 0.15);
    });
  }

  private triggerBassHit(): void {
    const now = this.ctx.currentTime;
    const freq = this.rootNote / 2;
    
    this.reactiveLayer.oscillators[0].frequency.setValueAtTime(freq, now);
    this.reactiveLayer.gainNodes[0].gain.setValueAtTime(0, now);
    this.reactiveLayer.gainNodes[0].gain.linearRampToValueAtTime(0.5, now + 0.01);
    this.reactiveLayer.gainNodes[0].gain.exponentialRampToValueAtTime(0.001, now + 0.2);
  }

  private pitchDive(): void {
    const now = this.ctx.currentTime;
    this.reactiveLayer.oscillators[1].frequency.setValueAtTime(this.rootNote * 2, now);
    this.reactiveLayer.oscillators[1].frequency.exponentialRampToValueAtTime(this.rootNote * 0.5, now + 0.5);
  }

  private sweepFilter(targetFreq: number, duration: number): void {
    const now = this.ctx.currentTime;
    this.reactiveLayer.filter.frequency.cancelScheduledValues(now);
    this.reactiveLayer.filter.frequency.setValueAtTime(this.reactiveLayer.filter.frequency.value, now);
    this.reactiveLayer.filter.frequency.linearRampToValueAtTime(targetFreq, now + duration);
  }

  private switchScale(scaleName: string): void {
    this.currentScale = this.scales[scaleName] || this.scales.minor;
  }

  private updateOscillatorFrequencies(): void {
    const now = this.ctx.currentTime;
    this.reactiveLayer.oscillators[0].frequency.setValueAtTime(this.rootNote / 2, now);
    this.reactiveLayer.oscillators[1].frequency.setValueAtTime(this.rootNote, now);
    this.reactiveLayer.oscillators[2].frequency.setValueAtTime(this.rootNote, now);
    this.reactiveLayer.oscillators[3].frequency.setValueAtTime(this.rootNote * 4, now);
  }

  private fadeGain(gainNode: AudioParam, target: number, duration: number): void {
    const now = this.ctx.currentTime;
    gainNode.cancelScheduledValues(now);
    gainNode.setValueAtTime(gainNode.value, now);
    gainNode.linearRampToValueAtTime(target, now + duration);
  }

  // Main animation loop for smooth parameter updates
  private animate(): void {
    if (!this.isPlaying) {
      requestAnimationFrame(() => this.animate());
      return;
    }

    // Smooth intensity transition
    const diff = this.targetIntensity - this.intensity;
    this.intensity += diff * 0.05;

    // Base music ducking (sidechain effect)
    if (this.baseMusicGain) {
      const duckAmount = this.intensity > 0.7 ? 0.4 : 0.6;
      this.baseMusicGain.gain.setTargetAtTime(duckAmount, this.ctx.currentTime, 0.1);
    }

    // Filter follows intensity
    const filterFreq = 400 + (this.intensity * 2000);
    this.reactiveLayer.filter.frequency.setTargetAtTime(filterFreq, this.ctx.currentTime, 0.1);

    // Shimmer volume follows intensity
    const shimmerVol = this.intensity * 0.15;
    this.reactiveLayer.gainNodes[3].gain.setTargetAtTime(shimmerVol, this.ctx.currentTime, 0.1);

    // Decay intensity
    this.targetIntensity = Math.max(0.3, this.targetIntensity * 0.995);

    requestAnimationFrame(() => this.animate());
  }

  // Volume controls
  setMasterVolume(volume: number): void {
    this.masterGain.gain.setTargetAtTime(volume, this.ctx.currentTime, 0.1);
  }

  setBaseMusicVolume(volume: number): void {
    this.baseMusicGain.gain.setTargetAtTime(volume, this.ctx.currentTime, 0.1);
  }

  setReactiveVolume(volume: number): void {
    this.reactiveLayer.baseGain = volume;
  }

  // Get current state for UI
  getState() {
    return {
      isPlaying: this.isPlaying,
      intensity: this.intensity,
      comboLevel: this.comboLevel,
      currentScale: Object.keys(this.scales).find(k => this.scales[k] === this.currentScale),
      hasBaseMusic: !!this.baseMusicBuffer,
    };
  }
}

export default ReactiveMusicSystem;
