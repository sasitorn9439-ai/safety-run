import { describe, expect, it } from 'vitest';
import { createRun, replayScore, speedAt, COIN_SCORE, DYNAMIC_FROM, STEP_EASE, STEP_EVERY, STEP_GAIN, TOP_SPEED, FULL_SPEED_AT, MAX_INPUTS, MAX_SPEED, METRES_PER_POINT, PPE_SCORE, START_SPEED, BONUS_GAP, BONUS_INV_SECONDS, BONUS_SECONDS, BONUS_SPRINT_SECONDS, REVIVE_INV_SECONDS, RULES, SPRINT_FACTOR, rulesOf, STEP, type Action, type GameObject, type Run } from '../shared/sim.js';
import { think } from './bot.js';
import golden from './golden.json';
import goldenV1 from './golden-v1.json';

// golden.json holds bot-played runs recorded against the current sim (tests/make-golden.test.ts): if one of these fails,
// the sim changed, and a run that was open during a deploy would be rejected.
describe('replayScore matches the recorded runs', () => {
  for (const g of golden as unknown as { seed: number; ticks: number; inputs: [number, string | number][]; score: number }[]) {
    it(`seed ${g.seed} → ${g.score}`, () => {
      expect(replayScore(g.seed, g.ticks, g.inputs)).toBe(g.score);
    });
  }
});

// golden-v1.json: runs recorded under rules 1, before the bonus question gave invincibility. A run from a client still on that
// build is replayed by those rules, so these must keep their scores for as long as rules 1 is accepted.
describe('replayScore under rules 1 matches the runs recorded then', () => {
  for (const g of goldenV1 as unknown as { seed: number; ticks: number; inputs: [number, string | number][]; score: number }[]) {
    it(`seed ${g.seed} → ${g.score}`, () => {
      expect(replayScore(g.seed, g.ticks, g.inputs, 1)).toBe(g.score);
    });
  }
  it('and the rules do make a difference to them', () => {
    expect((goldenV1 as any[]).some(g => replayScore(g.seed, g.ticks, g.inputs, RULES) !== g.score)).toBe(true);
  });
});

describe('rulesOf', () => {
  it('reads a missing version as 1 (a build before versioning), takes 1 or 2, and refuses anything else', () => {
    expect(rulesOf(undefined)).toBe(1);
    expect(rulesOf(null)).toBe(1);
    expect(rulesOf(1)).toBe(1);
    expect(rulesOf(2)).toBe(2);
    for (const v of [0, 3, '2', 1.5, {}]) expect(rulesOf(v)).toBeNull();
  });
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

  it('splits the bonus by where it came from, and the parts add up to it', () => {
    for (const g of golden as unknown as G[]) {
      const v = play(g).view(), e = v.earned;
      expect(e.coin + e.ppe + e.near + e.extra).toBe(v.bonus);
      expect(e.coin).toBeGreaterThanOrEqual(v.coins * COIN_SCORE);      // the combo only ever multiplies up
      expect(e.near).toBeGreaterThan(0);                                 // the bot dodges late often enough
    }
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

describe('invincibility after a question', () => {
  /** a run stopped on a bonus question: the bot plays from just before the first bonus check until one comes up */
  function atBonus() {
    for (let seed = 1; seed < 200; seed++) {
      const run = createRun(seed, () => {}, () => {}, { startDist: BONUS_GAP - 100 });
      while (!run.finished && run.tick < 60 * 60) {
        if (run.view().pendingBonus) return run;
        think(run); run.step();
      }
    }
    throw new Error('no bonus question came up');
  }
  const at = (run: Run) => ({ dist: run.view().dist, inv: run.view().inv });

  it('a wrong answer leaves BONUS_INV_SECONDS of invincibility and no sprint', () => {
    const run = atBonus(), q = run.view().pendingBonus!;
    expect(run.answer((q.correct + 1) % q.options.length)).toBe(true);
    expect(run.view().inv).toBe(BONUS_INV_SECONDS);
    const a = at(run); run.step();
    expect(run.view().dist - a.dist).toBeCloseTo(speedAt(a.dist) * STEP, 5);
  });
  it('running out of time counts the same as a wrong answer', () => {
    const run = atBonus();
    for (let i = 0; i < BONUS_SECONDS * 60 + 1 && run.view().pendingBonus; i++) run.step();
    expect(run.view().pendingBonus).toBeNull();
    expect(run.view().inv).toBeGreaterThan(BONUS_INV_SECONDS - 0.1);
  });
  it('a right answer sprints for BONUS_SPRINT_SECONDS, invincible for those and BONUS_INV_SECONDS more', () => {
    const run = atBonus();
    expect(run.answer(run.view().pendingBonus!.correct)).toBe(true);
    expect(run.view().inv).toBe(BONUS_SPRINT_SECONDS + BONUS_INV_SECONDS);
    let a = at(run); run.step();
    expect(run.view().dist - a.dist).toBeCloseTo(speedAt(a.dist) * STEP * SPRINT_FACTOR, 5);
    for (let i = 0; i < BONUS_SPRINT_SECONDS * 60; i++) run.step();
    a = at(run); run.step();
    expect(run.view().dist - a.dist).toBeCloseTo(speedAt(a.dist) * STEP, 5);
  });
  it('rules 1: no invincibility or sprint after a bonus question, 2 s after a revive', () => {
    for (const seed of [1, 2, 3]) {
      const run = createRun(seed, () => {}, () => {}, { rules: 1 });
      while (!run.finished) run.step();
      expect(run.answer(run.correct)).toBe(true);
      expect(run.view().inv).toBe(2);
    }
    let run: Run | null = null;
    for (let seed = 1; seed < 200 && !run; seed++) {
      const r = createRun(seed, () => {}, () => {}, { startDist: BONUS_GAP - 100, rules: 1 });
      while (!r.finished && r.tick < 60 * 60 && !r.view().pendingBonus) { think(r); r.step(); }
      if (r.view().pendingBonus) run = r;
    }
    const inv0 = run!.view().inv;
    expect(run!.answer(run!.view().pendingBonus!.correct)).toBe(true);
    expect(run!.view().inv).toBe(inv0);
    const a = at(run!); run!.step();
    expect(run!.view().dist - a.dist).toBeCloseTo(speedAt(a.dist) * STEP, 5);
  });
  it('the second-chance question brings you back with REVIVE_INV_SECONDS of invincibility', () => {
    const run = createRun(42, () => {}, () => {});
    while (!run.finished) run.step();
    expect(run.answer(run.correct)).toBe(true);
    expect(run.view().inv).toBe(REVIVE_INV_SECONDS);
  });
});
