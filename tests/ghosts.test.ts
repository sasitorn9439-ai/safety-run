import { describe, expect, it } from 'vitest';
import { Ghosts } from '../src/tournament/ghosts.js';
import type { BoardRow } from '../src/tournament/net.js';

/** a runner at 0.2 m per tick, reported by the host `lag` ticks late */
const row = (tick: number, lane = 0): BoardRow => [1, 0, tick, tick * .2, lane];

describe('ghosts', () => {
  it('places another runner where they are now, not where the late report saw them', () => {
    const g = new Ghosts();
    g.see([row(0)], 60);
    g.see([row(30)], 90);
    const [ghost] = g.place(0, 120, 5);
    expect(ghost!.dist).toBeCloseTo(120 * .2, 1);
  });

  it('does not jump when a new report lands', () => {
    const g = new Ghosts();
    g.see([row(0)], 60); g.see([row(30)], 90);
    const before = g.place(0, 100, 0)[0]!.dist;
    g.see([[1, 0, 60, 14, 0]], 100);              // the runner turned out 2 m further on, so faster: 8 m in 30 ticks
    expect(g.place(0, 100, 0)[0]!.dist).toBeCloseTo(before, 5);
    expect(g.place(0, 100, 5)[0]!.dist).toBeCloseTo(14 + 40 * 8 / 30, 1);
  });

  it('stands still once the reports stop', () => {
    const g = new Ghosts();
    g.see([row(0)], 0); g.see([row(30)], 30);
    g.place(0, 1000, 10);
    expect(g.place(0, 1000, 0)[0]!.dist).toBe(g.place(0, 5000, 0)[0]!.dist);
  });

  it('never shows me as my own ghost, and eases into a new lane', () => {
    const g = new Ghosts();
    g.see([row(0, 0)], 0); g.see([row(30, 1)], 30);
    expect(g.place(1, 30, 1)).toEqual([]);
    const px = g.place(0, 30, .05)[0]!.px;
    expect(px).toBeGreaterThan(0); expect(px).toBeLessThan(1);
  });
});
