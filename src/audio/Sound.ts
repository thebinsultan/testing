/**
 * All audio is synthesised on the fly with the Web Audio API — there are no
 * sound files to download, which keeps the bundle tiny and everything cozy.
 *
 * The context is created lazily on the first user gesture, as browsers require.
 */
export class Sound {
  enabled = true;

  private ctx?: AudioContext;
  private master?: GainNode;
  private purrGain?: GainNode;
  private purrVoice?: { osc: OscillatorNode; lfo: OscillatorNode; lfoGain: GainNode };
  private ambienceGain?: GainNode;
  private noiseBuffer?: AudioBuffer;
  private purrLevel = 0;

  /** Call from a click/keypress handler. Safe to call repeatedly. */
  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;

    this.ctx = new Ctor();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.enabled ? 0.55 : 0;
    this.master.connect(this.ctx.destination);

    this.noiseBuffer = this.createNoise();
    this.buildPurr();
    this.buildAmbience();
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (this.master && this.ctx) {
      this.master.gain.cancelScheduledValues(this.ctx.currentTime);
      this.master.gain.linearRampToValueAtTime(enabled ? 0.55 : 0, this.ctx.currentTime + 0.25);
    }
    if (enabled) this.unlock();
  }

  /** Feed it the strongest purr currently happening in the room. */
  setPurrLevel(level: number): void {
    this.purrLevel = Math.max(0, Math.min(1, level));
  }

  update(dt: number): void {
    if (!this.ctx || !this.purrGain) return;
    const now = this.ctx.currentTime;
    const target = this.enabled ? this.purrLevel * 0.16 : 0;
    const current = this.purrGain.gain.value;
    const next = current + (target - current) * Math.min(1, dt * 4);
    this.purrGain.gain.setTargetAtTime(next, now, 0.08);

    if (this.ambienceGain) {
      const ambience = this.enabled ? 0.05 : 0;
      this.ambienceGain.gain.setTargetAtTime(ambience, now, 0.6);
    }
  }

  /* ── voices ───────────────────────────────────────────────────────── */

  meow(pitch = 1): void {
    const ctx = this.ctx;
    if (!ctx || !this.master || !this.enabled) return;
    const now = ctx.currentTime;
    const base = 520 * pitch;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.16, now + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.09, now + 0.22);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.48);

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(1400, now);
    filter.frequency.exponentialRampToValueAtTime(900, now + 0.4);
    filter.Q.value = 3;

    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(base * 0.9, now);
    osc.frequency.exponentialRampToValueAtTime(base * 1.35, now + 0.09);
    osc.frequency.exponentialRampToValueAtTime(base * 0.72, now + 0.42);

    // a little vibrato keeps it from sounding like a synth beep
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 17;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = base * 0.035;
    lfo.connect(lfoGain).connect(osc.frequency);

    const second = ctx.createOscillator();
    second.type = 'triangle';
    second.frequency.setValueAtTime(base * 2.02, now);
    second.frequency.exponentialRampToValueAtTime(base * 1.5, now + 0.4);
    const secondGain = ctx.createGain();
    secondGain.gain.value = 0.35;

    osc.connect(filter);
    second.connect(secondGain).connect(filter);
    filter.connect(gain).connect(this.master);

    osc.start(now);
    second.start(now);
    lfo.start(now);
    osc.stop(now + 0.5);
    second.stop(now + 0.5);
    lfo.stop(now + 0.5);
  }

  chirp(): void {
    const ctx = this.ctx;
    if (!ctx || !this.master || !this.enabled) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(1250, now);
    osc.frequency.exponentialRampToValueAtTime(2150, now + 0.09);
    osc.frequency.exponentialRampToValueAtTime(1600, now + 0.16);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(0.1, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.2);

    osc.connect(gain).connect(this.master);
    osc.start(now);
    osc.stop(now + 0.22);
  }

  /** Soft landing / pounce thump. */
  thud(power = 1): void {
    const ctx = this.ctx;
    if (!ctx || !this.master || !this.noiseBuffer || !this.enabled) return;
    const now = ctx.currentTime;

    const source = ctx.createBufferSource();
    source.buffer = this.noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(420 * power, now);
    filter.frequency.exponentialRampToValueAtTime(120, now + 0.22);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(0.12 * power, now + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.26);

    source.connect(filter).connect(gain).connect(this.master);
    source.start(now);
    source.stop(now + 0.3);

    const thump = ctx.createOscillator();
    thump.type = 'sine';
    thump.frequency.setValueAtTime(120, now);
    thump.frequency.exponentialRampToValueAtTime(58, now + 0.18);
    const thumpGain = ctx.createGain();
    thumpGain.gain.setValueAtTime(0.0001, now);
    thumpGain.gain.linearRampToValueAtTime(0.09 * power, now + 0.015);
    thumpGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.2);
    thump.connect(thumpGain).connect(this.master);
    thump.start(now);
    thump.stop(now + 0.24);
  }

  /** Three happy little crunches. */
  nom(): void {
    for (let i = 0; i < 3; i += 1) {
      window.setTimeout(() => this.click(0.09 - i * 0.015), i * 130);
    }
  }

  click(volume = 0.06): void {
    const ctx = this.ctx;
    if (!ctx || !this.master || !this.enabled) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.setValueAtTime(520 + Math.random() * 160, now);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(volume, now + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.07);
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 900;
    osc.connect(filter).connect(gain).connect(this.master);
    osc.start(now);
    osc.stop(now + 0.09);
  }

  /** Bright UI blip when a kitten is adopted. */
  chime(): void {
    const ctx = this.ctx;
    if (!ctx || !this.master || !this.enabled) return;
    const notes = [660, 880, 1174];
    notes.forEach((frequency, index) => {
      const now = ctx.currentTime + index * 0.09;
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = frequency;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.linearRampToValueAtTime(0.09, now + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.5);
      osc.connect(gain).connect(this.master!);
      osc.start(now);
      osc.stop(now + 0.55);
    });
  }

  /* ── continuous layers ────────────────────────────────────────────── */

  private buildPurr(): void {
    const ctx = this.ctx;
    if (!ctx || !this.master) return;

    const gain = ctx.createGain();
    gain.gain.value = 0;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 260;
    filter.Q.value = 2;

    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = 42;

    // The rumble: an LFO chopping the gain at roughly a cat's purr rate.
    const lfo = ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = 24;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.55;
    lfo.connect(lfoGain).connect(gain.gain);
    gain.gain.value = 0.45;

    osc.connect(filter).connect(gain);
    gain.connect(this.master);

    osc.start();
    lfo.start();

    this.purrGain = gain;
    this.purrVoice = { osc, lfo, lfoGain };
  }

  private buildAmbience(): void {
    const ctx = this.ctx;
    if (!ctx || !this.master) return;

    const gain = ctx.createGain();
    gain.gain.value = 0;

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 700;

    const voices: OscillatorNode[] = [];
    for (const [freq, detune] of [
      [110, -4],
      [164.8, 3],
      [220, 6],
    ] as const) {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq;
      osc.detune.value = detune;
      const voiceGain = ctx.createGain();
      voiceGain.gain.value = 0.3;
      osc.connect(voiceGain).connect(filter);
      osc.start();
      voices.push(osc);
    }

    // Very slow breathing filter so the pad never sits still.
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.06;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 260;
    lfo.connect(lfoGain).connect(filter.frequency);
    lfo.start();

    filter.connect(gain).connect(this.master);
    this.ambienceGain = gain;
  }

  private createNoise(): AudioBuffer | undefined {
    const ctx = this.ctx;
    if (!ctx) return undefined;
    const length = Math.floor(ctx.sampleRate * 0.6);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / length);
    }
    return buffer;
  }

  dispose(): void {
    if (this.purrVoice) {
      try {
        this.purrVoice.osc.stop();
        this.purrVoice.lfo.stop();
      } catch {
        /* already stopped */
      }
    }
    void this.ctx?.close();
  }
}
