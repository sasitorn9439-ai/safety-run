import type { Beep } from '../../shared/sim.js';

/** Tiny synth for the game's blips. The AudioContext can only start after a user gesture, hence unlock(). */
export class Sfx {
  private ac: AudioContext | undefined;
  /** the context once unlock() has made one, for anything else that plays sound (the lobby music) */
  get ctx() { return this.ac; }

  unlock() {
    try {
      const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ac ||= new Ctor();
      void this.ac.resume();
    } catch { /* audio is optional */ }
  }

  beep: Beep = (f, d = 0.08, type = 'square', v = 0.05) => {
    const ac = this.ac;
    if (!ac) return;
    try {
      const o = ac.createOscillator(), g = ac.createGain();
      o.type = type;
      o.frequency.value = f;
      g.gain.setValueAtTime(v, ac.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + d);
      o.connect(g).connect(ac.destination);
      o.start();
      o.stop(ac.currentTime + d);
    } catch { /* ignore */ }
  };
}
