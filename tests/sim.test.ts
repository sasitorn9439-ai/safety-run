import { describe, expect, it } from 'vitest';
import { createRun, replayScore, speedAt, COIN_SCORE, DYNAMIC_FROM, STEP_EASE, STEP_EVERY, STEP_GAIN, TOP_SPEED, FULL_SPEED_AT, MAX_INPUTS, MAX_SPEED, METRES_PER_POINT, PPE_SCORE, START_SPEED, type Action, type GameObject } from '../shared/sim.js';
import golden from './golden.json';

// golden.json holds bot-played runs recorded against the current sim (tests/make-golden.test.ts): if one of these fails,
// the sim changed, and a run that was open during a deploy would be rejected.
describe('replayScore matches the recorded runs', () => {
  for (const g of golden as unknown as { seed: number; ticks: number; inputs: [number, string | number][]; score: number }[]) {
    it(`seed ${g.seed} → ${g.score}`, () => {
      expect(replayScore(g.seed, g.ticks, g.inputs)).toBe(g.score);
    });
  }
});

describe('replayScore validation', () => {
  const g = (golden as any[])[0];
  it('rejects a wrong tick count', () => {
    expect(replayScore(g.seed, g.ticks + 1, g.inputs)).toBeNull();
    expect(replayScore(g.seed, g.ticks - 1, g.inputs)).toBeNull();
  });
  it('rejects an input that the game would not accept', () => {
    expect(replayScore(g.seed, g.ticks, [[0, 'up'], [0, 'up'], ...g.inputs])).toBeNull();
  });
  it('rejects garbage', () => {
    expect(replayScore(1, 'x', [])).toBeNull();
    expect(replayScore(1, 10, 'nope')).toBeNull();
    expect(replayScore(1, 100, Array.from({ length: MAX_INPUTS + 1 }, (_, i) => [i, 'left']))).toBeNull();
    expect(replayScore(1, 100, [[1]])).toBeNull();
  });
  it('a different seed gives a different run', () => {
    expect(replayScore(g.seed + 1, g.ticks, g.inputs)).not.toBe(g.score);
  });
});

describe('createRun', () => {
  it('is deterministic for a seed', () => {
    const run = (seed: number) => { const r = createRun(seed); for (let i = 0; i < 600; i++) r.step(); return JSON.stringify(r.view().objs); };
    expect(run(5)).toBe(run(5));
    expect(run(5)).not.toBe(run(6));
  });
  it('lane moves are clamped and idle runs end in a crash', () => {
    const r = createRun(3);
    expect(r.input('left' as Action)).toBe(true);
    expect(r.input('left' as Action)).toBe(false);
    while (!r.finished) r.step();
    expect(r.view().hitKind).not.toBeNull();
  });
});

describe('coins and PPE', () => {
  type G = { seed: number; ticks: number; inputs: [number, Action | number][]; score: number };
  const play = (g: G) => {
    const r = createRun(g.seed);
    for (const [at, a] of g.inputs) { while (r.tick < at && !r.finished) r.step(); typeof a === 'number' ? r.answer(a) : r.input(a); }
    while (r.tick < g.ticks && !r.finished) r.step();
    return r;
  };
  /** every object that showed up, per seed (a hazard ends a run early, so one seed isn't enough) */
  const seen = (seed: number, ticks: number) => {
    const runs: GameObject[][] = [];
    for (let s = seed; s < seed + 8; s++) {
      const r = createRun(s), all = new Set<GameObject>();
      for (let i = 0; i < ticks; i++) { r.step(); if (r.finished) break; for (const o of r.view().objs) all.add(o); }
      runs.push([...all]);
    }
    return runs;
  };

  it('coin trails come in the free lane, with PPE as single items among them', () => {
    const runs = seen(11, 3000), objs = runs.flat(), coins = objs.filter(o => o.k === 'coin'), ppe = objs.filter(o => o.k === 'ppe');
    expect(coins.length).toBeGreaterThan(80);
    expect(ppe.length).toBeGreaterThan(5);
    expect(coins.length).toBeGreaterThan(ppe.length * 4);
    // a PPE item never sits right next to another one in the same lane (within one run)
    for (const run of runs) {
      const p = run.filter(o => o.k === 'ppe');
      for (const a of p) for (const b of p) if (a !== b && a.l === b.l) expect(Math.abs(a.z - b.z)).toBeGreaterThan(3);
    }
  });

  it('no pickup sits inside a hazard', () => {
    const r = createRun(21);
    for (let i = 0; i < 3000 && !r.finished; i++) {
      r.step();
      const o = r.view().objs;
      for (const h of o) if (h.k !== 'coin' && h.k !== 'ppe') for (const p of o) if ((p.k === 'coin' || p.k === 'ppe') && p.l === h.l) expect(Math.abs(p.z - h.z)).toBeGreaterThanOrEqual(1.6 - 1e-9);
    }
  });

  it('collected coins count and score COIN_SCORE each; PPE scores PPE_SCORE', () => {
    for (const g of golden as unknown as G[]) {
      const r = play(g), v = r.view();
      expect(v.coins).toBeGreaterThan(0);
      expect(v.bonus).toBeGreaterThanOrEqual(v.coins * COIN_SCORE);
      expect(r.score()).toBe(g.score);
    }
    expect(PPE_SCORE).toBe(10);
  });
});

describe('speed curve', () => {
  it('starts calm, only ever speeds up, and tops out at MAX_SPEED', () => {
    expect(speedAt(0)).toBe(START_SPEED);
    expect(START_SPEED).toBe(14);
    let prev = 0;
    for (let d = 0; d <= FULL_SPEED_AT * 1.5; d += 25) { const v = speedAt(d); expect(v).toBeGreaterThanOrEqual(prev); expect(v).toBeLessThanOrEqual(MAX_SPEED); prev = v; }
    expect(speedAt(FULL_SPEED_AT)).toBe(MAX_SPEED);
    expect(speedAt(FULL_SPEED_AT * 3)).toBe(MAX_SPEED);
  });
  it('gains 1 m/s every 55 metres until it reaches the cap', () => {
    expect(speedAt(55)).toBe(15);
    expect(speedAt(550)).toBe(24);
    expect(FULL_SPEED_AT).toBe(1100);
  });
  it('holds MAX_SPEED until DYNAMIC_FROM, then steps up STEP_GAIN every STEP_EVERY metres to TOP_SPEED', () => {
    for (let d = FULL_SPEED_AT; d < DYNAMIC_FROM; d += 500) expect(speedAt(d)).toBe(MAX_SPEED);
    expect(speedAt(DYNAMIC_FROM)).toBe(MAX_SPEED);
    expect(speedAt(DYNAMIC_FROM + STEP_EASE)).toBe(MAX_SPEED + STEP_GAIN);                    // 150 km: 36 m/s
    expect(speedAt(DYNAMIC_FROM + STEP_EVERY - 1)).toBe(MAX_SPEED + STEP_GAIN);
    expect(speedAt(DYNAMIC_FROM + STEP_EVERY + STEP_EASE)).toBe(MAX_SPEED + 2 * STEP_GAIN);   // 170 km: 38 m/s
    expect(speedAt(DYNAMIC_FROM + 4 * STEP_EVERY + STEP_EASE)).toBe(TOP_SPEED);               // 230 km: 44 m/s
    expect(speedAt(DYNAMIC_FROM + 50 * STEP_EVERY)).toBe(TOP_SPEED);
    let prev = MAX_SPEED;
    for (let d = DYNAMIC_FROM; d < DYNAMIC_FROM + 10 * STEP_EVERY; d += 5) {
      const v = speedAt(d);
      expect(v).toBeGreaterThanOrEqual(prev);                      // only ever speeds up
      expect(v - prev).toBeLessThan(0.2);                          // eased in: no jumps between neighbouring metres
      prev = v;
    }
    expect(TOP_SPEED / 60).toBeLessThan(1.4);                      // never skips over the 1.4 m touch window in one step
  });
  it('the sim follows it', () => {
    const r = createRun(5); let last = r.view().dist;
    for (let i = 0; i < 60; i++) { r.step(); if (r.finished) break; }
    expect(r.view().dist - last).toBeCloseTo(START_SPEED, 0);     // one second at the start covers about START_SPEED metres
  });
});

describe('score calibration', () => {
  it('score = distance / METRES_PER_POINT + pickups', () => {
    const r = createRun(3);
    for (let i = 0; i < 400 && !r.finished; i++) r.step();
    const v = r.view();
    expect(r.score()).toBe(Math.floor(v.dist / METRES_PER_POINT) + v.bonus);
  });
  it('earns 19 840 distance points after 10 minutes of uninterrupted running', () => {
    let dist = 0;
    for (let tick = 0; tick < 10 * 60 * 60; tick++) dist += speedAt(dist) / 60;
    expect(Math.floor(dist / METRES_PER_POINT)).toBe(19840);
  });
});
