/** Which mascot frame to show for the current game state. Pure and driven by a per-set config (frame counts + tagged ranges), so any set can be plugged in. */
import { SLIDE_SECONDS } from '../../shared/sim.js';
import { clamp, type Fx, type Interp } from './fx.js';
import type { Frame } from './types.js';

export type PixelAnim = 'idle' | 'run' | 'jump' | 'slide';
export interface PixelPick { anim: PixelAnim; frame: number }
/** inclusive frame range */
export type Range = readonly [first: number, last: number];

export interface FrameConfig {
  idle: number; idleMs: number;
  run: number;
  /** metres of running per full run loop (two steps) */ metresPerLoop: number;
  jump: { takeoff: Range; rise: Range; apex: Range; fall: Range; land: Range };
  slide: { drop: Range; hold: Range; recover: Range };
}

/** t in [0, 1] → a frame inside the range */
const within = (r: Range, t: number) => r[0] + Math.min(r[1] - r[0], Math.floor(clamp(t, 0, .9999) * (r[1] - r[0] + 1)));

export function pixelFrame(f: Frame, I: Interp, fx: Fx, now: number, cfg: FrameConfig): PixelPick {
  // slide: drop, then hold (it slows down, dust fades), then recover
  if (I.slide > 0) {
    const p = clamp(1 - I.slide / SLIDE_SECONDS, 0, 1), s = cfg.slide;
    if (p < .22) return { anim: 'slide', frame: within(s.drop, p / .22) };
    if (p < .72) return { anim: 'slide', frame: within(s.hold, (p - .22) / .5) };
    return { anim: 'slide', frame: within(s.recover, (p - .72) / .28) };
  }
  // in the air: takeoff/rise while going up, apex near the top, fall while coming down
  const vy = f.s.vy, j = cfg.jump;
  if (I.py > .02 || vy > 0) {
    if (vy > 6.5) return { anim: 'jump', frame: within(j.takeoff, I.py / .5) };
    if (vy > 2) return { anim: 'jump', frame: within(j.rise, (6.5 - vy) / 4.5) };
    if (vy > -3) return { anim: 'jump', frame: within(j.apex, (2 - vy) / 5) };
    return { anim: 'jump', frame: within(j.fall, 1 - I.py / 1.7) };
  }
  // just landed: the landing frames play over fx.landT's 0.16 s
  if (fx.landT > .02) return { anim: 'jump', frame: within(j.land, 1 - fx.landT) };
  // standing still (menu): breathe
  if (f.still || (!f.playing && I.dist === 0)) return { anim: 'idle', frame: Math.floor(now / cfg.idleMs) % cfg.idle };
  return { anim: 'run', frame: Math.floor(I.dist / cfg.metresPerLoop * cfg.run) % cfg.run };
}

/** Snap a CSS coordinate to the device pixel grid so the sprite doesn't shimmer as it moves. */
export const snap = (v: number, dpr: number) => Math.round(v * dpr) / dpr;
