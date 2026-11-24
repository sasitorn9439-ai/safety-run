import { STEP, speedAt } from '../../shared/sim.js';
import type { Ghost } from '../render/types.js';
import type { BoardRow, Slot } from './net.js';

/** stop extrapolating this long after the last report, so a runner whose phone dropped stands still instead of running on */
const MAX_AHEAD_TICKS = 90;

interface Track { tick: number; dist: number; perTick: number; lane: number; px: number; off: number }

/**
 * The other runners on a phone. The big screen reports where each one was at some race tick (about a second old by the
 * time it arrives); this carries each one forward at the speed it was last seen running to the phone's own tick, and
 * eases away the jump each new report would cause.
 */
export class Ghosts {
  private tracks = new Map<Slot, Track>();

  /** `at`: the phone's own race tick when the report arrived */
  see(rows: readonly BoardRow[], at: number) {
    for (const [slot, , tick, dist, lane] of rows) {
      const t = this.tracks.get(slot);
      if (!t) { this.tracks.set(slot, { tick, dist, perTick: speedAt(dist) * STEP, lane, px: lane, off: 0 }); continue; }
      if (tick <= t.tick) continue;
      const shown = this.ahead(t, at);
      t.perTick = (dist - t.dist) / (tick - t.tick);
      t.tick = tick; t.dist = dist; t.lane = lane; t.off = 0;
      t.off = shown - this.ahead(t, at);
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
      out.push({ slot, dist: this.ahead(t, at), px: t.px });
    }
    return out;
  }

  private ahead(t: Track, at: number) { return t.dist + t.perTick * Math.min(MAX_AHEAD_TICKS, Math.max(0, at - t.tick)) + t.off; }
}
