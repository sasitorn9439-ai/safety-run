/**
 * The tournament big screen's soundtrack: a small synth sequencer on Web Audio (no audio files, nothing to download).
 *   lobby — 124 BPM A minor, building anticipation while the room waits (also over the 3-2-1)
 *   race  — 152 BPM E minor, four on the floor, rolling bass, driving lead
 *   final — the same song pushed to 168 BPM with a doubled lead and a snare roll every bar for the closing seconds
 *   win   — a short fanfare for the podium, then silence
 * A mode change lands on the next bar line with a crash, so the switch always sounds intentional.
 */
export type MusicMode = 'lobby' | 'race' | 'final' | 'win';

const mtof = (m: number) => 440 * 2 ** ((m - 69) / 12);

interface Chord { root: number; tones: number[] }
interface Song { bpm: number; chords: Chord[] }

const SONGS: Record<MusicMode, Song> = {
  lobby: { bpm: 124, chords: [
    { root: 45, tones: [57, 60, 64] }, // Am
    { root: 41, tones: [53, 57, 60] }, // F
    { root: 48, tones: [55, 60, 64] }, // C
    { root: 43, tones: [55, 59, 62] }, // G
  ] },
  race: { bpm: 152, chords: [
    { root: 40, tones: [55, 59, 64] }, // Em
    { root: 36, tones: [55, 60, 64] }, // C
    { root: 43, tones: [55, 59, 62] }, // G
    { root: 38, tones: [57, 62, 66] }, // D
  ] },
  final: { bpm: 168, chords: [
    { root: 40, tones: [55, 59, 64] },
    { root: 36, tones: [55, 60, 64] },
    { root: 43, tones: [55, 59, 62] },
    { root: 38, tones: [57, 62, 66] },
  ] },
  win: { bpm: 128, chords: [{ root: 48, tones: [60, 64, 67] }] }, // C major
};

const LOOKAHEAD = 0.5, TICK_MS = 60, LEVEL = 0.7;
/** arp order over three chord tones (indexes 0-2, 3-5 are the same notes an octave up) */
const ARP = [0, 1, 2, 4, 2, 1, 0, 2, 3, 5, 4, 2, 1, 2, 4, 5];

export class Music {
  private ac: AudioContext | undefined;
  private master!: GainNode;
  private duck!: GainNode;
  private noise!: AudioBuffer;
  private timer = 0;
  private wantPlaying = false;
  private mode: MusicMode = 'lobby';
  private pending: MusicMode | null = null;
  private step = 0;
  private bar = 0;
  private nextTime = 0;
  private winBars = 0;
  /** true while the browser's autoplay policy is keeping the audio context suspended (shows "click to turn on") */
  blocked = false;
  /** called when `blocked` may have changed */
  onState: () => void = () => {};

  constructor(public muted = false) {}

  private ensure(): AudioContext | undefined {
    if (this.ac) return this.ac;
    try {
      const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ac = new Ctor();
      const comp = ac.createDynamicsCompressor();
      comp.threshold.value = -14; comp.ratio.value = 5; comp.attack.value = 0.004; comp.release.value = 0.15;
      this.master = ac.createGain();
      this.master.gain.value = 0;
      this.master.connect(comp).connect(ac.destination);
      // bass, pads and lead sit on this bus, which ducks on every kick: the pump that makes it feel fast
      this.duck = ac.createGain();
      this.duck.connect(this.master);
      const n = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate), d = n.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      this.noise = n;
      ac.onstatechange = () => { this.blocked = this.wantPlaying && !this.muted && ac.state !== 'running'; this.onState(); };
      this.ac = ac;
    } catch { /* audio is optional */ }
    return this.ac;
  }

  /** call on (or right after) a user gesture; safe and cheap to call repeatedly, including from a page-wide pointerdown */
  unlock() {
    if (!this.wantPlaying || this.muted) return;
    const ac = this.ensure();
    if (!ac) return;
    if (ac.state !== 'running') { this.blocked = true; void ac.resume().then(() => { this.blocked = ac.state !== 'running'; this.onState(); }, () => {}); }
    this.start();
  }

  play() { this.wantPlaying = true; this.unlock(); }

  stop() {
    this.wantPlaying = false;
    this.halt();
    this.blocked = false;
  }

  setMuted(m: boolean) {
    this.muted = m;
    if (m) this.halt(); else this.unlock();
  }

  /** the song to move to; it starts on the next bar line (immediately if nothing is playing) */
  setMode(m: MusicMode) {
    this.pending = m === this.mode ? null : m;
  }

  private start() {
    const ac = this.ac;
    if (!ac || this.timer) return;
    const now = ac.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setValueAtTime(this.master.gain.value, now);
    this.master.gain.linearRampToValueAtTime(LEVEL, now + 0.3);
    if (this.pending) { this.mode = this.pending; this.pending = null; }
    this.step = 0; this.bar = 0; this.winBars = 0;
    this.nextTime = now + 0.08;
    this.timer = window.setInterval(() => this.pump(), TICK_MS);
    this.pump();
  }

  private halt() {
    const ac = this.ac;
    if (this.timer) { clearInterval(this.timer); this.timer = 0; }
    if (ac) {
      const now = ac.currentTime;
      this.master.gain.cancelScheduledValues(now);
      this.master.gain.setValueAtTime(this.master.gain.value, now);
      this.master.gain.linearRampToValueAtTime(0, now + 0.25);
    }
  }

  private pump() {
    const ac = this.ac;
    if (!ac) return;
    if (this.nextTime < ac.currentTime - 0.1) this.nextTime = ac.currentTime + 0.05; // the tab stalled: don't rush to catch up
    while (this.nextTime < ac.currentTime + LOOKAHEAD) {
      let crash = false;
      if (this.step === 0 && this.pending) {
        crash = true;
        this.mode = this.pending; this.pending = null;
        this.bar = 0; this.winBars = 0;
      }
      this.schedule(this.nextTime, this.step, crash);
      this.nextTime += 60 / SONGS[this.mode].bpm / 4;
      if (++this.step === 16) { this.step = 0; this.bar++; if (this.mode === 'win') this.winBars++; }
    }
  }

  /* ---------- one 16th-note step of the current song ---------- */

  private schedule(t: number, i: number, crash: boolean) {
    const song = SONGS[this.mode], bpm = song.bpm, sec = 60 / bpm / 4;
    const chord = song.chords[this.bar % song.chords.length]!;
    if (this.mode === 'win') { this.fanfare(t, i, chord); return; }
    const lobby = this.mode === 'lobby', final = this.mode === 'final';
    // lobby plays 8 bars: two of groove, then the full arrangement
    const intro = lobby && this.bar % 8 < 2;
    if (i === 0 && crash) this.hit(t, 3000, 1.4, 0.35);

    // drums
    if (i % 4 === 0) this.kick(t);
    if (!lobby && this.bar % 2 === 1 && i === 15) this.kick(t);
    if (!intro && (i === 4 || i === 12)) this.clap(t, lobby ? 0.28 : 0.4);
    if (i % 4 === 2) this.hat(t, true, lobby ? 0.1 : 0.14);
    else if (!lobby || !intro) this.hat(t, false, i % 2 ? 0.07 : 0.045);
    // fill: a snare roll into the next bar, every fourth bar, and every bar in the final seconds
    if (!lobby && (final || this.bar % 4 === 3) && i >= 12) this.clap(t, 0.16 + (i - 12) * 0.07);
    if (lobby && this.bar % 8 === 7 && i >= 8) this.clap(t, 0.1 + (i - 8) * 0.03);

    // bass: rolling 8ths in the lobby, 16ths in the race
    if (lobby) { if (i % 2 === 0) this.bass(t, chord.root + ((i >> 1) % 3 === 2 ? 12 : 0), sec * 1.7, 0.34); }
    else if (i % 4 !== 0 || i === 0) this.bass(t, chord.root + (i % 8 === 6 || i === 11 ? 12 : 0), sec * 0.9, 0.36);

    // chords: held pad in the lobby, syncopated stabs in the race
    if (lobby && i === 0) this.pad(t, chord.tones, sec * 16);
    if (!lobby && [0, 3, 6, 10].includes(i)) this.stab(t, chord.tones, sec * 1.5);

    // lead: a 16th arpeggio, an octave higher and doubled in the final
    if (!intro) {
      const k = ARP[i]!, n = chord.tones[k % 3]! + (k >= 3 ? 12 : 0) + 12;
      if (lobby) { if (i % 2 === 0 || i % 4 === 3) this.lead(t, n, sec * 1.2, 0.1, 'triangle', 2600); }
      else {
        this.lead(t, n, sec * 1.1, final ? 0.13 : 0.11, 'sawtooth', final ? 4200 : 3200);
        if (final) this.lead(t, n + 12, sec * 0.8, 0.06, 'square', 4800);
      }
    }
    // sparkle on the "and" of every other bar
    if (!lobby && !final && i === 14 && this.bar % 2 === 0) this.lead(t, chord.tones[2]! + 24, sec * 2, 0.07, 'square', 5000);
  }

  private fanfare(t: number, i: number, chord: Chord) {
    if (this.winBars >= 2) return;
    if (this.winBars === 0 && i === 0) { this.kick(t); this.hit(t, 2500, 1.8, 0.4); this.pad(t, chord.tones, 60 / 128 * 8); }
    if (this.winBars === 0) {
      const run: Record<number, number> = { 0: 72, 2: 76, 4: 79, 6: 84, 8: 88 };
      const n = run[i];
      if (n) this.lead(t, n, 0.5, 0.16, 'sawtooth', 5200);
      if (i === 8) this.lead(t, 79, 1.2, 0.1, 'square', 4000);
      if (i === 8 || i === 12) { this.kick(t); this.clap(t, 0.3); }
    }
    if (this.winBars === 1 && i === 0) { this.lead(t, 84, 1.6, 0.14, 'sawtooth', 4800); this.lead(t, 88, 1.6, 0.1, 'square', 4500); this.hit(t, 3500, 1.2, 0.2); }
  }

  /* ---------- voices ---------- */

  private kick(t: number) {
    const ac = this.ac!;
    const o = ac.createOscillator(), g = ac.createGain();
    o.frequency.setValueAtTime(160, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
    g.gain.setValueAtTime(1, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.38);
    o.connect(g).connect(this.master);
    o.start(t); o.stop(t + 0.4);
    const d = this.duck.gain;
    d.cancelScheduledValues(t);
    d.setValueAtTime(0.3, t);
    d.linearRampToValueAtTime(1, t + 0.16);
  }

  private clap(t: number, v: number) {
    const ac = this.ac!;
    const s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
    s.buffer = this.noise;
    f.type = 'bandpass'; f.frequency.value = 1800; f.Q.value = 0.9;
    g.gain.setValueAtTime(v, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
    s.connect(f).connect(g).connect(this.master);
    s.start(t, Math.random()); s.stop(t + 0.18);
  }

  private hat(t: number, open: boolean, v: number) {
    const ac = this.ac!;
    const s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
    s.buffer = this.noise;
    f.type = 'highpass'; f.frequency.value = 7500;
    const len = open ? 0.16 : 0.035;
    g.gain.setValueAtTime(v, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + len);
    s.connect(f).connect(g).connect(this.master);
    s.start(t, Math.random()); s.stop(t + len + 0.02);
  }

  /** a long noise wash: the crash on a mode change */
  private hit(t: number, from: number, len: number, v: number) {
    const ac = this.ac!;
    const s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
    s.buffer = this.noise;
    f.type = 'highpass'; f.frequency.value = from;
    g.gain.setValueAtTime(v, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + len);
    s.connect(f).connect(g).connect(this.master);
    s.start(t, Math.random() * 0.5); s.stop(t + len + 0.02);
  }

  private bass(t: number, midi: number, len: number, v: number) {
    const ac = this.ac!;
    const o = ac.createOscillator(), f = ac.createBiquadFilter(), g = ac.createGain();
    o.type = 'sawtooth'; o.frequency.value = mtof(midi);
    f.type = 'lowpass'; f.Q.value = 4;
    f.frequency.setValueAtTime(1200, t);
    f.frequency.exponentialRampToValueAtTime(220, t + len);
    g.gain.setValueAtTime(v, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + len);
    o.connect(f).connect(g).connect(this.duck);
    o.start(t); o.stop(t + len + 0.02);
  }

  private lead(t: number, midi: number, len: number, v: number, type: OscillatorType, cutoff: number) {
    const ac = this.ac!;
    const f = ac.createBiquadFilter(), g = ac.createGain();
    f.type = 'lowpass'; f.frequency.setValueAtTime(cutoff, t);
    f.frequency.exponentialRampToValueAtTime(cutoff / 4, t + len);
    g.gain.setValueAtTime(v, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + len);
    f.connect(g).connect(this.duck);
    for (const det of [-7, 7]) {
      const o = ac.createOscillator();
      o.type = type; o.frequency.value = mtof(midi); o.detune.value = det;
      o.connect(f); o.start(t); o.stop(t + len + 0.02);
    }
  }

  private stab(t: number, tones: number[], len: number) {
    for (const n of tones) this.lead(t, n + 12, len, 0.07, 'sawtooth', 2400);
  }

  private pad(t: number, tones: number[], len: number) {
    const ac = this.ac!;
    const f = ac.createBiquadFilter(), g = ac.createGain();
    f.type = 'lowpass'; f.frequency.value = 1400;
    g.gain.setValueAtTime(0.001, t);
    g.gain.linearRampToValueAtTime(0.1, t + 0.3);
    g.gain.setValueAtTime(0.1, t + len - 0.25);
    g.gain.linearRampToValueAtTime(0.001, t + len);
    f.connect(g).connect(this.duck);
    for (const n of tones) for (const det of [-9, 9]) {
      const o = ac.createOscillator();
      o.type = 'sawtooth'; o.frequency.value = mtof(n); o.detune.value = det;
      o.connect(f); o.start(t); o.stop(t + len + 0.02);
    }
  }
}
