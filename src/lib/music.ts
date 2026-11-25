/** A short chiptune loop for the tournament lobby, synthesized like the game's blips: no audio files to load. */

const BPM = 112, EIGHTH = 60 / BPM / 2;
/** 8 bars of eighth notes over C, Am, F, G (twice); a MIDI note, or 0 for a rest */
const MELODY = [
  72, 0, 76, 79, 76, 0, 72, 74, 76, 0, 72, 69, 72, 0, 0, 0, 69, 72, 77, 0, 76, 74, 72, 0, 74, 0, 71, 74, 79, 0, 0, 0,
  79, 0, 76, 79, 84, 0, 79, 76, 81, 0, 79, 76, 72, 0, 76, 0, 77, 76, 74, 72, 69, 0, 72, 74, 71, 0, 74, 0, 72, 0, 0, 0,
];
const ROOTS = [48, 45, 41, 43];
const hz = (m: number) => 440 * 2 ** ((m - 69) / 12);

export class Music {
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private timer = 0;
  private next = 0;
  private step = 0;
  private playing = false;

  /** `ctx` hands back the AudioContext once a tap has unlocked it; until then the music waits */
  constructor(private ctx: () => AudioContext | undefined, public muted = false) {}

  play() {
    if (this.playing) return;
    this.playing = true;
    this.step = 0;
    this.timer = window.setInterval(() => this.tick(), 100);
    this.tick();
  }

  stop() {
    if (!this.playing) return;
    this.playing = false;
    clearInterval(this.timer);
    this.silence();
  }

  setMuted(m: boolean) {
    this.muted = m;
    if (m) this.silence();
    else this.tick();
  }

  /** fade out whatever is already scheduled; the next note starts on a fresh output */
  private silence() {
    const ac = this.ctx(), g = this.master;
    this.master = null;
    if (!ac || !g) return;
    g.gain.setTargetAtTime(0, ac.currentTime, 0.04);
    setTimeout(() => g.disconnect(), 500);
  }

  /** schedules the notes due in the next 0.3 s */
  private tick() {
    const ac = this.ctx();
    if (!this.playing || this.muted || !ac || ac.state !== 'running') return;
    if (!this.master) {
      this.master = ac.createGain();
      this.master.gain.value = 0.6;
      this.master.connect(ac.destination);
    }
    if (this.next < ac.currentTime) this.next = ac.currentTime + 0.05;
    while (this.next < ac.currentTime + 0.3) {
      this.notes(ac, this.master, this.step, this.next);
      this.step = (this.step + 1) % MELODY.length;
      this.next += EIGHTH;
    }
  }

  private notes(ac: AudioContext, out: GainNode, step: number, t: number) {
    const m = MELODY[step], beat = step % 8;
    if (m) this.voice(ac, out, hz(m), t, EIGHTH * 0.9, 'square', 0.03);
    const root = ROOTS[Math.floor(step / 8) % 4];
    if (beat % 2 === 0) this.voice(ac, out, hz(beat % 4 === 0 ? root : root + 12), t, EIGHTH * 1.6, 'triangle', 0.09);
    if (beat % 2 === 1) this.tickHat(ac, out, t);
  }

  private voice(ac: AudioContext, out: GainNode, f: number, t: number, d: number, type: OscillatorType, v: number) {
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = type;
    o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(v, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    o.connect(g).connect(out);
    o.start(t);
    o.stop(t + d + 0.02);
  }

  private tickHat(ac: AudioContext, out: GainNode, t: number) {
    if (!this.noise) {
      this.noise = ac.createBuffer(1, Math.floor(ac.sampleRate * 0.05), ac.sampleRate);
      const data = this.noise.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    }
    const src = ac.createBufferSource(), hp = ac.createBiquadFilter(), g = ac.createGain();
    src.buffer = this.noise;
    hp.type = 'highpass';
    hp.frequency.value = 7000;
    g.gain.setValueAtTime(0.025, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.04);
    src.connect(hp).connect(g).connect(out);
    src.start(t);
    src.stop(t + 0.05);
  }
}
