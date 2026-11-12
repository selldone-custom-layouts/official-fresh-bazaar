/*
 * Fresh Market 3D — procedural soundscape (no audio files).
 * Fountain water (louder near the pool), a soft crowd murmur, and a santur-like plucked melody in
 * the Persian Shur mode (Karplus–Strong strings through a synthetic hall reverb).
 * Must be started from a user gesture (browser autoplay policy).
 */
export class Ambience {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private water!: GainNode;
  private crowd!: GainNode;
  private music!: GainNode;
  private reverb!: ConvolverNode;
  private timer: any = null;
  private noteTime = 0;
  private phrase: number[] = [];
  private muted = false;
  private degree = 0;

  get started() {
    return !!this.ctx;
  }

  start() {
    if (this.ctx) return;
    const AC = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!AC) return;
    const ctx: AudioContext = new AC();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.0;
    this.master.connect(ctx.destination);
    this.master.gain.linearRampToValueAtTime(this.muted ? 0 : 0.9, ctx.currentTime + 2.5);

    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this.impulse(3.2, 2.4);
    const wet = ctx.createGain();
    wet.gain.value = 0.55;
    this.reverb.connect(wet).connect(this.master);

    // fountain: band-passed noise with a slow shimmer
    this.water = ctx.createGain();
    this.water.gain.value = 0.0;
    const wn = this.noise(4, "white");
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 1400;
    bp.Q.value = 0.6;
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 400;
    wn.connect(bp).connect(hp).connect(this.water).connect(this.master);
    wn.start();

    // crowd murmur: brown noise shaped like distant voices
    this.crowd = ctx.createGain();
    this.crowd.gain.value = 0.05;
    const bn = this.noise(6, "brown");
    const lp = ctx.createBiquadFilter();
    lp.type = "bandpass";
    lp.frequency.value = 420;
    lp.Q.value = 0.9;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.18;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.025;
    lfo.connect(lfoGain).connect(this.crowd.gain);
    lfo.start();
    bn.connect(lp).connect(this.crowd).connect(this.master);
    bn.start();

    // santur
    this.music = ctx.createGain();
    this.music.gain.value = 0.22;
    this.music.connect(this.master);
    this.music.connect(this.reverb);
    this.noteTime = ctx.currentTime + 1.2;
    this.timer = setInterval(() => this.schedule(), 120);
  }

  setMuted(m: boolean) {
    this.muted = m;
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(t);
    this.master.gain.setTargetAtTime(m ? 0 : 0.9, t, 0.25);
  }

  /** distance (m) from the listener to the fountain */
  update(fountainDistance: number) {
    if (!this.ctx) return;
    const near = Math.max(0, 1 - fountainDistance / 9);
    this.water.gain.setTargetAtTime(0.02 + near * near * 0.32, this.ctx.currentTime, 0.3);
  }

  suspend() {
    this.ctx?.suspend();
  }

  resume() {
    this.ctx?.resume();
  }

  dispose() {
    clearInterval(this.timer);
    this.ctx?.close();
    this.ctx = null;
  }

  // ───────────────────────────── music ─────────────────────────────

  /** Shur on D with the koron (≈ quarter-flat) second; cents above the tonic. */
  private static SHUR = [0, 150, 300, 500, 700, 800, 1000, 1200, 1350, 1500, 1700];

  private schedule() {
    const ctx = this.ctx!;
    while (this.noteTime < ctx.currentTime + 0.4) {
      if (!this.phrase.length) this.phrase = this.makePhrase();
      const step = this.phrase.shift()!;
      if (step >= 0) {
        const cents = Ambience.SHUR[step];
        const f = 293.66 * Math.pow(2, cents / 1200);
        this.pluck(f, this.noteTime, 0.55 + Math.random() * 0.25);
        // santur tremolo on long notes
        if (Math.random() < 0.18) for (let k = 1; k < 4; k++) this.pluck(f, this.noteTime + k * 0.07, 0.3);
        if (Math.random() < 0.12) this.pluck(f / 2, this.noteTime, 0.35);
      }
      this.noteTime += step === -2 ? 1.6 : 0.24 + (Math.random() < 0.3 ? 0.24 : 0);
    }
  }

  private makePhrase(): number[] {
    // gentle random walk around the tonic and the shahed (3rd/4th degree), ending on the tonic
    const out: number[] = [];
    const len = 6 + Math.floor(Math.random() * 6);
    for (let i = 0; i < len; i++) {
      const r = Math.random();
      this.degree += r < 0.35 ? -1 : r < 0.7 ? 1 : r < 0.85 ? 2 : -2;
      this.degree = Math.max(0, Math.min(9, this.degree));
      out.push(this.degree);
    }
    out.push(Math.random() < 0.5 ? 3 : 0, -2); // cadence + rest
    if (Math.random() < 0.35) out.push(-2);
    return out;
  }

  /** Karplus–Strong plucked string. */
  private pluck(freq: number, when: number, vel: number) {
    const ctx = this.ctx!;
    const sr = ctx.sampleRate;
    const dur = 2.2;
    const n = Math.floor(sr * dur);
    const buf = ctx.createBuffer(1, n, sr);
    const d = buf.getChannelData(0);
    const period = Math.max(2, Math.round(sr / freq));
    for (let i = 0; i < period; i++) d[i] = (Math.random() * 2 - 1) * vel;
    for (let i = period; i < n; i++) d[i] = 0.4985 * (d[i - period] + d[i - period + 1]);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const hammer = ctx.createBiquadFilter();
    hammer.type = "peaking";
    hammer.frequency.value = freq * 3;
    hammer.gain.value = 5;
    const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    if (pan) pan.pan.value = (Math.random() - 0.5) * 0.6;
    const g = ctx.createGain();
    g.gain.value = 0.9;
    src.connect(hammer);
    (pan ? hammer.connect(pan).connect(g) : hammer.connect(g)).connect(this.music);
    src.start(when);
    src.stop(when + dur);
  }

  private noise(seconds: number, kind: "white" | "brown") {
    const ctx = this.ctx!;
    const n = ctx.sampleRate * seconds;
    const buf = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < n; i++) {
      const w = Math.random() * 2 - 1;
      if (kind === "brown") {
        last = (last + 0.02 * w) / 1.02;
        d[i] = last * 3.5;
      } else d[i] = w * 0.5;
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    return src;
  }

  private impulse(seconds: number, decay: number) {
    const ctx = this.ctx!;
    const n = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, n, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, decay);
    }
    return buf;
  }
}
