import { GRAVITY, JUMP_VY, SLIDE_SECONDS, STEP, speedAt } from '../../shared/sim.js';
import type { Ghost } from '../render/types.js';
import type { BoardRow, Slot } from './net.js';

/** stop extrapolating this long after the last report, so a runner whose phone dropped stands still instead of running on */
const MAX_AHEAD_TICKS = 90;

interface Track {
  tick: number; dist: number; perTick: number; lane: number; px: number; off: number;
  jumps: number; slides: number;
  /** seconds into the jump being played (-1: on the floor), seconds left on the slide being played */
  jumpT: number; slideLeft: number;
}

/**
 * The other runners on a phone. The big screen passes on where each one was at some race tick (a few hundred ms old by the
 * time it arrives); this carries each one forward at the speed it was last seen running to the phone's own tick, and
 * eases away the jump each new report would cause. A new jump or slide in a report is played in full from when it arrives.
 */
export class Ghosts {
  private tracks = new Map<Slot, Track>();

  /** `at`: the phone's own race tick when the report arrived */
  see(rows: readonly BoardRow[], at: number) {
    for (const [slot, , tick, dist, lane, jumps, slides] of rows) {
      const t = this.tracks.get(slot);
      if (!t) {
        this.tracks.set(slot, { tick, dist, perTick: speedAt(dist) * STEP, lane, px: lane, off: 0, jumps, slides, jumpT: -1, slideLeft: 0 });
        continue;
      }
      if (tick <= t.tick) continue;
      const shown = this.ahead(t, at);
      t.perTick = (dist - t.dist) / (tick - t.tick);
      t.tick = tick; t.dist = dist; t.lane = lane; t.off = 0;
      t.off = shown - this.ahead(t, at);
      if (jumps > t.jumps) { t.jumpT = 0; t.slideLeft = 0; }
      if (slides > t.slides) { t.slideLeft = SLIDE_SECONDS; t.jumpT = -1; }
      t.jumps = jumps; t.slides = slides;
    }
  }

  /** where everyone but `me` is at race tick `at`; `dt` = seconds since the last call */
  place(me: Slot, at: number, dt: number): (Ghost & { slot: Slot })[] {
    const ease = (rate: number) => 1 - Math.exp(-dt * rate);
    const out: (Ghost & { slot: Slot })[] = [];
    for (const [slot, t] of this.tracks) {
      if (slot === me) continue;
      t.off -= t.off * ease(3);
      t.px += (t.lane - t.px) * ease(12);
      t.slideLeft = Math.max(0, t.slideLeft - dt);
      let py = 0, vy = 0;
      if (t.jumpT >= 0) {
        t.jumpT += dt;
        py = JUMP_VY * t.jumpT - GRAVITY / 2 * t.jumpT ** 2;
        vy = JUMP_VY - GRAVITY * t.jumpT;
        if (py <= 0) { py = 0; vy = 0; t.jumpT = -1; }
      }
      out.push({ slot, dist: this.ahead(t, at), px: t.px, py, vy, slide: t.slideLeft });
    }
    return out;
  }

  private ahead(t: Track, at: number) { return t.dist + t.perTick * Math.min(MAX_AHEAD_TICKS, Math.max(0, at - t.tick)) + t.off; }
}
