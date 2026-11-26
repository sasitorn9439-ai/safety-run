/** Motion helpers for the deck: tweens that can be cancelled or skipped, confetti, a few synthesized sounds. No dependencies. */
import { BURGUNDY, BUTTER, PINK } from './art.js';

export const easeOut = (t: number) => 1 - (1 - t) ** 3;
export const easeInOut = (t: number) => t < .5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2;
export const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * A run of animations that can be cut short. `stop()` ends it for good (leaving the slide); `skip()` makes every wait and tween
 * after it finish at once, so a click during the suspense jumps to the end instead of being ignored.
 */
export class Run {
  stopped = false;
  skipped = false;
  /** called once by skip(), for waits that are not a wait()/tween() */
  onSkip: (() => void) | null = null;
  private timers = new Set<() => void>();

  /** resolves after `ms`, or right away when skipped or reduced-motion; never when stopped */
  wait(ms: number): Promise<void> {
    if (this.stopped) return new Promise(() => {});
    if (this.skipped || reduced()) return Promise.resolve();
    return new Promise(res => {
      const done = () => { clearTimeout(id); this.timers.delete(done); res(); };
      const id = setTimeout(done, ms);
      this.timers.add(done);
    });
  }

  /** calls `fn(0…1)` every frame for `ms`; the last call is always `fn(1)` */
  tween(ms: number, fn: (t: number) => void, ease: (t: number) => number = easeOut): Promise<void> {
    if (this.stopped) return new Promise(() => {});
    if (this.skipped || reduced() || ms <= 0) { fn(1); return Promise.resolve(); }
    return new Promise(res => {
      const t0 = performance.now();
      const done = () => { this.timers.delete(done); fn(1); res(); };
      this.timers.add(done);
      const frame = (now: number) => {
        if (this.stopped) return;
        if (!this.timers.has(done)) return;
        const t = Math.min(1, (now - t0) / ms);
        if (t >= 1) { done(); return; }
        fn(ease(t));
        requestAnimationFrame(frame);
      };
      requestAnimationFrame(frame);
    });
  }

  skip() { this.skipped = true; this.onSkip?.(); for (const t of [...this.timers]) t(); }
  stop() { this.stopped = true; this.timers.clear(); }
}

/** shrinks `el`'s font until its text fits `maxW` px (layout px, so the stage's scaling does not matter) */
export function fit(el: HTMLElement, maxW: number, basePx: number) {
  el.style.fontSize = basePx + 'px';
  const w = el.scrollWidth;
  if (w > maxW) el.style.fontSize = Math.floor(basePx * maxW / w) + 'px';
}

/* ---------- confetti: pieces in the three colours only ---------- */
interface Piece { x: number; y: number; vx: number; vy: number; w: number; h: number; r: number; vr: number; c: string; round: boolean; life: number }
const COLORS = [PINK, BUTTER, BURGUNDY, PINK, BUTTER];
let pieces: Piece[] = [], raf = 0;

/** a burst from (x, y) in stage pixels. `bg` keeps burgundy pieces off a burgundy surface: they would not show */
export function burst(x: number, y: number, n = 120, power = 1, onDark = true) {
  if (reduced()) return;
  const cv = document.getElementById('confetti') as HTMLCanvasElement | null;
  if (!cv) return;
  const colors = onDark ? [PINK, BUTTER, PINK, BUTTER] : COLORS;
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, s = (6 + Math.random() * 16) * power;
    pieces.push({
      x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 8 * power, w: 10 + Math.random() * 16, h: 6 + Math.random() * 10,
      r: Math.random() * 6, vr: (Math.random() - .5) * .4, c: colors[i % colors.length]!, round: Math.random() < .3, life: 1,
    });
  }
  if (!raf) raf = requestAnimationFrame(tick);
}

function tick() {
  const cv = document.getElementById('confetti') as HTMLCanvasElement | null;
  const c = cv?.getContext('2d');
  if (!cv || !c) { raf = 0; return; }
  c.clearRect(0, 0, cv.width, cv.height);
  pieces = pieces.filter(p => p.life > 0 && p.y < cv.height + 60);
  for (const p of pieces) {
    p.vy += .55; p.vx *= .985; p.vy *= .99; p.x += p.vx; p.y += p.vy; p.r += p.vr; p.life -= .0035;
    c.save(); c.translate(p.x, p.y); c.rotate(p.r); c.fillStyle = p.c; c.globalAlpha = Math.min(1, p.life * 3);
    if (p.round) { c.beginPath(); c.arc(0, 0, p.w / 2.4, 0, 7); c.fill(); } else c.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
    c.restore();
  }
  raf = pieces.length ? requestAnimationFrame(tick) : 0;
  if (!pieces.length) c.clearRect(0, 0, cv.width, cv.height);
}

export function clearConfetti() { pieces = []; }

/** a full-stage flash in butter, for the moment of the reveal */
export function flash() {
  const el = document.getElementById('flash');
  if (!el || reduced()) return;
  el.classList.remove('on'); void el.offsetWidth; el.classList.add('on');
}

/* ---------- sound: tiny synthesized ticks and a fanfare, M to mute ---------- */
let ac: AudioContext | null = null;
export let muted = false;
export const toggleMute = () => (muted = !muted);

function ctx() {
  if (muted) return null;
  try { ac ??= new AudioContext(); if (ac.state === 'suspended') void ac.resume(); } catch { return null; }
  return ac;
}

function note(freq: number, at: number, dur: number, type: OscillatorType = 'triangle', vol = .12) {
  const a = ctx();
  if (!a) return;
  const o = a.createOscillator(), g = a.createGain(), t = a.currentTime + at;
  o.type = type; o.frequency.value = freq;
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + .01); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
  o.connect(g).connect(a.destination); o.start(t); o.stop(t + dur + .02);
}

/** the reel ticking over: pitch rises a little with each flip */
export const sfxTick = (i: number) => note(520 + i * 18, 0, .07, 'square', .05);
export const sfxCount = (n: number) => note(n === 0 ? 880 : 440, 0, n === 0 ? .5 : .18, 'triangle', .14);
export function sfxReveal(big: boolean) {
  const chord = big ? [523, 659, 784, 1047, 1319] : [523, 659, 784, 1047];
  chord.forEach((f, i) => note(f, i * .07, .9, 'triangle', .11));
  if (big) [1047, 1319, 1568].forEach((f, i) => note(f, .5 + i * .1, 1.1, 'sine', .09));
}
