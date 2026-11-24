import { describe, expect, it } from 'vitest';
import { Ghosts } from '../src/tournament/ghosts.js';
import type { BoardRow } from '../src/tournament/net.js';

/** a runner at 0.2 m per tick, reported by the host `lag` ticks late */
const row = (tick: number, lane = 0, jumps = 0, slides = 0): BoardRow => [1, 0, tick, tick * .2, lane, jumps, slides];

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
    g.see([[1, 0, 60, 14, 0, 0, 0]], 100);              // the runner turned out 2 m further on, so faster: 8 m in 30 ticks
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

  it('plays a new jump and a new slide in full, but not the ones from before it was first seen', () => {
    const g = new Ghosts();
    g.see([row(0, 0, 3, 2)], 0);
    expect(g.place(0, 10, .1)[0]).toMatchObject({ py: 0, slide: 0 });
    g.see([row(30, 0, 4, 2)], 30);
    const up = g.place(0, 40, .3)[0]!;
    expect(up.py).toBeGreaterThan(1);
    expect(g.place(0, 80, .6)[0]!.py).toBe(0);                    // landed after the 0.77 s arc
    g.see([row(60, 0, 4, 3)], 90);
    expect(g.place(0, 95, .1)[0]!.slide).toBeCloseTo(.6, 5);
  });
});
