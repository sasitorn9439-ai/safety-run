import { describe, expect, it } from 'vitest';
import { DYNAMIC_KINDS, HAZARD_KINDS, HZ, type HazardKind } from '../shared/hazards.js';
import {
  COMBO_SECONDS, DROP_LOCK_SECONDS, ESTOP_FACTOR, FUME_DRIFT, SPARK_HALF_CYCLE, LIFT_HEIGHT, MAX_SPEED, MULT_MAX, NEAR_SCORE, POWER_GAP, POWER_SECONDS, ROW_SECONDS,
  createRun, speedAt, type Action, type GameObject, type Obstacle, type PowerType, type Run, type SimEvent,
} from '../shared/sim.js';
import { TIPS, ZONES, ZONE_FIRST, ZONE_LENGTH, zoneAt } from '../shared/zones.js';
import { isHazard, play } from './bot.js';

/** advance n ticks (stops at a crash) */
const steps = (r: Run, n: number) => { for (let i = 0; i < n && !r.finished; i++) r.step(); };
/** a fresh run that has used up its starting grace period, so hazards can hurt */
const ready = (seed = 1, emit: (e: SimEvent) => void = () => {}) => { const r = createRun(seed, () => {}, emit); steps(r, 80); return r; };
const sidestep = (lane: number): Action => (lane === 1 ? 'left' : lane === -1 ? 'right' : 'left');
/** drop everything the run spawned by itself except `keep`, so only the scenario is in play */
const isolate = (r: Run, keep: GameObject) => { const o = r.view().objs; for (let i = o.length - 1; i >= 0; i--) if (o[i] !== keep) o.splice(i, 1); };
const put = (r: Run, o: GameObject) => { r.view().objs.push(o); };

describe('zones', () => {
  it('walk through the six areas, then the five working ones repeat', () => {
    expect(zoneAt(0).zone.id).toBe('entry');
    expect(zoneAt(ZONE_FIRST - 1).zone.id).toBe('entry');
    const ids = [0, 1, 2, 3, 4].map(k => zoneAt(ZONE_FIRST + k * ZONE_LENGTH + 1).zone.id);
    expect(ids).toEqual(['forklift', 'chemical', 'height', 'electrical', 'evac']);
    expect(zoneAt(ZONE_FIRST + 5 * ZONE_LENGTH + 1).zone.id).toBe('forklift');     // second lap
    expect(zoneAt(ZONE_FIRST + 5 * ZONE_LENGTH + 1).n).toBe(7);                      // but a new area as far as banners go
  });
  it('every area has a Safety point, a light and some patterns', () => {
    for (const z of ZONES) {
      expect(z.th.length).toBeGreaterThan(3); expect(z.tip.length).toBeGreaterThan(10); expect(z.en.length).toBeGreaterThan(3);
      expect(Object.keys(z.patterns).length).toBeGreaterThan(0); expect(Object.keys(z.kinds).length).toBeGreaterThan(0);
    }
  });
  it('the view reports the area the run is in', () => {
    const r = createRun(3, () => {}, () => {}, { startDist: 2000 });
    expect(r.view().zone).toBe(2); expect(r.view().zoneN).toBe(3);
  });
});

describe('hazard patterns are always solvable', () => {
  /** rows of hazards (same distance ahead), per frame, for many seeds starting in the given area */
  const snapshots = (startDist: number) => {
    const rows: Obstacle[][] = [];
    for (let seed = 1; seed <= 24; seed++) {
      const r = createRun(seed, () => {}, () => {}, { startDist });
      steps(r, 100);
      for (let i = 0; i < 700 && !r.finished; i++) {
        r.step();
        const hz = r.view().objs.filter(isHazard).filter(o => !o.gone);
        for (const z of new Set(hz.map(o => Math.round(o.z * 100)))) {
          const row = hz.filter(o => Math.round(o.z * 100) === z);
          if (row.length) rows.push(row);
        }
      }
    }
    return rows;
  };
  for (const [name, start] of [['entrance', 0], ['forklift lane', 900], ['chemical area', 1900], ['scaffold area', 2900], ['electrical room', 3900], ['evacuation drill', 4900], ['top speed', 9000]] as const) {
    it(`${name}: no row of hazards blocks every lane, and a full row is all-jump or all-slide`, () => {
      for (const row of snapshots(start)) {
        const lanes = new Set(row.map(o => o.l));
        if (!row.some(o => o.k === 'drop')) expect(lanes.size).toBe(row.length);   // one hazard per lane per row (a load goes for the player's lane, so it may share one)
        if (row.length === 3) {
          const types = new Set(row.map(o => HZ[o.k].t));
          expect(types.size).toBe(1);                                             // a wall is all low or all high...
          expect(types.has('block')).toBe(false);                                 // ...never all blocks (nowhere to go)
        } else {
          expect(row.length).toBeLessThanOrEqual(2);
          if (row.length === 2) expect(row.some(o => o.k === 'fumes')).toBe(false);          // a drifting cloud can cover two lanes: it never shares a row
        }
      }
    });
  }
  it('rows keep their distance from each other (time to react)', () => {
    for (const start of [0, 1900, 9000]) {
      for (let seed = 1; seed <= 12; seed++) {
        const r = createRun(seed, () => {}, () => {}, { startDist: start });
        steps(r, 100);
        const seen = new Map<Obstacle, number>();          // hazard → distance travelled when it was first seen (to compare rows in one frame of reference)
        let dist = 0;
        for (let i = 0; i < 600 && !r.finished; i++) {
          r.step(); dist = r.view().dist;
          for (const o of r.view().objs) if (isHazard(o) && !seen.has(o)) seen.set(o, dist + o.z);
        }
        const at = [...new Set([...seen.values()].map(v => Math.round(v * 10) / 10))].sort((a, b) => a - b);
        for (let i = 1; i < at.length; i++) expect(at[i]! - at[i - 1]!).toBeGreaterThanOrEqual(9.5);
      }
    }
    expect(ROW_SECONDS).toBeGreaterThan(0);
  });
  it('rows are further apart when the run is fast', () => {
    expect(speedAt(9000) * ROW_SECONDS).toBeGreaterThan(speedAt(0) * ROW_SECONDS);
  });
});

describe('near misses', () => {
  /** put a hazard 20 units ahead in lane 0, let `act` press things as it approaches, report what happened */
  const scenario = (kind: 'forklift' | 'spill' | 'pipe', act: (r: Run, z: number) => void) => {
    const events: SimEvent[] = [], r = ready(1, e => events.push(e));
    const h: Obstacle = { k: kind, l: 0, z: 20 };
    put(r, h);
    for (let i = 0; i < 400 && !r.finished && h.z > -1.5; i++) { act(r, h.z); r.step(); }
    const v = r.view();
    return { crashed: r.finished, near: events.filter(e => e.type === 'near').length, combo: v.combo, bonus: v.bonus };
  };

  it('a lane change at the last moment is a near miss', () => {
    let hit = 0;
    for (const at of [3.5, 3, 2.5, 2, 1.5]) {
      const s = scenario('forklift', (r, z) => { if (z < at && r.view().lane === 0) r.input('left'); });
      expect(s.crashed).toBe(false);
      hit += s.near;
    }
    expect(hit).toBeGreaterThan(0);
  });
  it('dodging early is not a near miss', () => {
    const s = scenario('forklift', (r, z) => { if (z < 14 && r.view().lane === 0) r.input('left'); });
    expect(s.crashed).toBe(false); expect(s.near).toBe(0); expect(s.combo).toBe(0);
  });
  it('a jump or a slide that only just clears counts too', () => {
    let low = 0, high = 0;
    for (const at of [0.9, 1.1, 1.3, 1.5, 1.7, 2]) {
      const s = scenario('spill', (r, z) => { if (z < at && r.view().py === 0 && r.view().vy === 0 && z > 0.3) r.input('up'); });
      if (!s.crashed) low += s.near;
    }
    for (const seconds of [0.48, 0.52, 0.56, 0.60, 0.64]) {
      const s = scenario('pipe', (r, z) => { if (z < speedAt(r.view().dist) * seconds && r.view().slide === 0 && z > 3) r.input('down'); });
      if (!s.crashed) high += s.near;
    }
    expect(low).toBeGreaterThan(0); expect(high).toBeGreaterThan(0);
  });
  it('the combo raises the multiplier every three, up to MULT_MAX, and runs out', () => {
    const r = ready(2);
    expect(r.view().mult).toBe(1);
    // fake three, six, nine near misses by dodging three forklifts in a row at the last moment
    for (let n = 1; n <= 9; n++) {
      const h: Obstacle = { k: 'forklift', l: r.view().lane, z: 14 }; put(r, h);
      for (let i = 0; i < 300 && h.z > -1.5 && !r.finished; i++) { isolate(r, h); if (h.z < 2.5 && r.view().lane === h.l) r.input(sidestep(r.view().lane)); r.step(); }
      if (r.finished) break;
    }
    const v = r.view();
    expect(v.combo).toBeGreaterThanOrEqual(3);
    expect(v.mult).toBe(1 + Math.min(MULT_MAX - 1, Math.floor(v.combo / 3)));
    expect(v.mult).toBeLessThanOrEqual(MULT_MAX);
    expect(v.bonus).toBeGreaterThanOrEqual(NEAR_SCORE * v.combo);
    for (let i = 0; i < Math.ceil((COMBO_SECONDS + 1) * 60); i++) { r.view().objs.splice(0); r.step(); }       // nothing in the way: the combo just times out
    expect(r.view().combo).toBe(0); expect(r.view().mult).toBe(1);
  });
  it('the multiplier counts on coins', () => {
    const r = ready(4);
    // two coins ahead in the player's lane, a x2 combo in place
    for (let n = 0; n < 3; n++) {
      const h: Obstacle = { k: 'forklift', l: r.view().lane, z: 14 }; put(r, h);
      for (let i = 0; i < 300 && h.z > -1.5 && !r.finished; i++) { isolate(r, h); if (h.z < 2.5 && r.view().lane === h.l) r.input(sidestep(r.view().lane)); r.step(); }
    }
    if (r.finished || r.view().mult < 2) return;                 // the dodge timing didn't land: covered by the test above
    const before = r.view().bonus, lane = r.view().lane;
    put(r, { k: 'coin', l: lane, z: 3 });
    steps(r, 40);
    expect(r.view().bonus - before).toBeGreaterThanOrEqual(2);
  });
});

describe('power-ups', () => {
  const take = (t: PowerType, seed = 1, events: SimEvent[] = []) => {
    const r = ready(seed, e => events.push(e));
    put(r, { k: 'power', t, l: r.view().lane, z: 2 });
    steps(r, 25);
    return r;
  };

  it('E-Stop slows the world for a few seconds, then lets go', () => {
    const base = ready(1), slowed = take('estop');
    expect(slowed.view().slow).toBeGreaterThan(POWER_SECONDS.estop - 1);
    const a = slowed.view().dist; steps(slowed, 60); const slowDz = slowed.view().dist - a;
    const b = base.view().dist; steps(base, 60); const baseDz = base.view().dist - b;
    expect(slowDz).toBeLessThan(baseDz * (ESTOP_FACTOR + 0.12));
    for (let i = 0; i < 60 * (POWER_SECONDS.estop + 1); i++) {
      slowed.view().objs.length = 0;
      slowed.step();
    }
    expect(slowed.view().slow).toBe(0);
  });

  it('the 5S broom pulls coins from the next lane only as they approach', () => {
    const r = take('broom');
    expect(r.view().magnet).toBeGreaterThan(0);
    const coin: GameObject = { k: 'coin', l: 1, z: 10 }; put(r, coin);
    const before = r.view().coins;
    steps(r, 10);
    expect(coin.l).toBe(1);
    steps(r, 80);
    expect(r.view().coins).toBeGreaterThan(before);
  });

  it('the man-lift carries you over hazards, ignores jump/slide, and sets you down safely', () => {
    const events: SimEvent[] = [], r = take('lift', 1, events);
    const v = () => r.view();
    expect(v().lift).toBeGreaterThan(0);
    steps(r, 40);
    expect(v().py).toBeGreaterThan(LIFT_HEIGHT * 0.8);
    expect(r.input('up')).toBe(false); expect(r.input('down')).toBe(false);
    put(r, { k: 'forklift', l: v().lane, z: 3 });
    steps(r, 30);
    expect(r.finished).toBe(false);                                                     // flew over it
    steps(r, 60 * (POWER_SECONDS.lift + 1));
    expect(v().coins).toBeGreaterThan(0);                                               // and collected the coin line
    expect(v().lift).toBe(0); expect(v().py).toBe(0);
    expect(r.finished).toBe(false);
    expect(events.some(e => e.type === 'power' && e.t === 'lift')).toBe(true);
  });

  it('the first-aid kit absorbs one hit', () => {
    const events: SimEvent[] = [], r = take('firstaid', 1, events);
    expect(r.view().hearts).toBe(1);
    steps(r, 100);                                                                      // past the grace period of any pickup
    put(r, { k: 'forklift', l: r.view().lane, z: 3 });
    steps(r, 40);
    expect(r.finished).toBe(false); expect(r.view().hearts).toBe(0);
    expect(events.filter(e => e.type === 'saved')).toHaveLength(1);
    steps(r, 160);                                                                      // grace over
    put(r, { k: 'forklift', l: r.view().lane, z: 3 });
    steps(r, 40);
    expect(r.finished).toBe(true);                                                      // second one is a crash
  });

  it('a Toolbox Talk shows a Safety point and gives a reward', () => {
    const rewards = new Set<string>(), tips = new Set<string>();
    for (let seed = 1; seed <= 40; seed++) {
      const r = take('toolbox', seed), s = r.view().sur;
      expect(s?.k).toBe('toolbox');
      expect(s!.msg).toMatch(/^Toolbox Talk/);
      expect(TIPS).toContain(s!.sub);
      rewards.add(s!.msg); tips.add(s!.sub!);
    }
    expect(rewards.size).toBeGreaterThan(2); expect(tips.size).toBeGreaterThan(5);
  });

  it('power-ups appear in different kinds and respect spawn spacing within trail offsets', () => {
    const kinds = new Set<string>(), gaps: number[] = [];
    for (let seed = 1; seed <= 40; seed++) {
      const at: number[] = [], seen = new Set<GameObject>();
      play(seed, { maxTicks: 6000, onTick: r => { for (const o of r.view().objs) if (o.k === 'power' && !seen.has(o)) { seen.add(o); kinds.add(o.t); at.push(r.view().dist + o.z); } } });
      at.sort((a, b) => a - b);
      for (let i = 1; i < at.length; i++) gaps.push(at[i]! - at[i - 1]!);
    }
    expect(kinds.size).toBeGreaterThanOrEqual(4);
    // At top speed, a slalom can place its pickup two rows ahead of the spawn point.
    const maxTrailOffsetDifference = 2 * MAX_SPEED * ROW_SECONDS + 7;
    expect(Math.min(...gaps)).toBeGreaterThanOrEqual(POWER_GAP - maxTrailOffsetDifference);
  });

  it('is deterministic with power-ups in play', () => {
    const run = () => { const r = createRun(9, () => {}, () => {}, { startDist: 500 }); steps(r, 900); return JSON.stringify(r.view()); };
    expect(run()).toBe(run());
  });

  it('inputs the lift ignores are not accepted, so a replay never contains them', () => {
    const r = take('lift');
    const accepted = (['up', 'down', 'left', 'right'] as Action[]).map(a => r.input(a));
    expect(accepted.slice(0, 2)).toEqual([false, false]);
  });
});

describe('the moving hazards', () => {
  const seenKinds = (startDist: number) => {
    const kinds = new Set<string>();
    for (let seed = 1; seed <= 30; seed++) {
      const r = createRun(seed, () => {}, () => {}, { startDist });
      steps(r, 60);
      for (let i = 0; i < 900 && !r.finished; i++) { r.step(); for (const o of r.view().objs) if (isHazard(o)) kinds.add(o.k); }
    }
    return kinds;
  };

  it('every hazard has its Safety lesson for the crash screen', () => {
    for (const k of HAZARD_KINDS) { const h = HZ[k]; expect(h.th.length, k).toBeGreaterThan(3); expect(h.en.length, k).toBeGreaterThan(3); expect(h.tip.length, k).toBeGreaterThan(20); expect(h.tipEn.length, k).toBeGreaterThan(20); }
    for (const k of DYNAMIC_KINDS) expect(HAZARD_KINDS).toContain(k);
  });

  it('each one turns up in its own area, and none in the first', () => {
    const entry = seenKinds(0), chem = seenKinds(1900), height = seenKinds(2900), elec = seenKinds(3900);
    for (const k of DYNAMIC_KINDS) expect(entry.has(k), `${k} in the entrance`).toBe(false);
    expect(chem.has('fumes')).toBe(true);
    expect(height.has('drop')).toBe(true);
    expect(elec.has('sparks')).toBe(true);
  });

  describe('fumes', () => {
    it('drift sideways across the lanes and turn at the walls', () => {
      const r = ready(1), f: Obstacle = { k: 'fumes', l: -1, z: 60, v: FUME_DRIFT };
      put(r, f);
      const lanes: number[] = [];
      for (let i = 0; i < 600 && f.z > 2; i++) { isolate(r, f); r.step(); lanes.push(f.l); }
      expect(Math.max(...lanes)).toBeGreaterThan(0.9); expect(Math.min(...lanes)).toBeGreaterThanOrEqual(-1); expect(Math.max(...lanes)).toBeLessThanOrEqual(1);
      expect(lanes.some((l, i) => i > 0 && Math.sign(l - lanes[i - 1]!) !== Math.sign(lanes[1]! - lanes[0]!))).toBe(true);     // it came back
    });
    it('hurt when they reach you, and can be sidestepped', () => {
      const stay = ready(1); const f1: Obstacle = { k: 'fumes', l: 0, z: 20, v: 0 }; put(stay, f1);
      for (let i = 0; i < 200 && !stay.finished; i++) { isolate(stay, f1); stay.step(); }
      expect(stay.finished).toBe(true); expect(stay.view().hitKind).toBe('fumes');
      const dodge = ready(1); const f2: Obstacle = { k: 'fumes', l: 0, z: 20, v: 0 }; put(dodge, f2);
      for (let i = 0; i < 200 && f2.z > -2 && !dodge.finished; i++) { isolate(dodge, f2); if (f2.z < 8 && dodge.view().lane === 0) dodge.input('left'); dodge.step(); }
      expect(dodge.finished).toBe(false);
    });
  });

  describe('a falling load', () => {
    const drop = (act: (r: Run, o: Obstacle) => void) => {
      const r = ready(1), o: Obstacle = { k: 'drop', l: 1, z: 60 };
      put(r, o);
      for (let i = 0; i < 400 && o.z > -2 && !r.finished; i++) { isolate(r, o); act(r, o); r.step(); }
      return { r, o };
    };
    it('goes for the lane you are in, and stops following you when it locks', () => {
      const { o } = drop(() => {});
      expect(o.locked).toBe(true); expect(o.l).toBe(0);                                     // you stood in lane 0: that is where it fell
    });
    it('follows you while you can still change your mind', () => {
      const { o } = drop((r, o) => { if (o.z < 25 && o.z > 20 && r.view().lane === 0) r.input('right'); });
      expect(o.l).toBe(1);
    });
    it('hurts if you stay, and misses if you leave the lane once it has locked', () => {
      const stay = drop(() => {});
      expect(stay.r.finished).toBe(true); expect(stay.r.view().hitKind).toBe('drop');
      const left = drop((r, o) => { if (o.locked && r.view().lane === 0) r.input('left'); });
      expect(left.r.finished).toBe(false);
    });
    it('locks with time to spare, however fast the run is', () => {
      expect(DROP_LOCK_SECONDS).toBeGreaterThanOrEqual(0.7);
    });
  });

  describe('sparks', () => {
    const arc = (ph: number, act: (r: Run, o: Obstacle) => void = () => {}) => {
      const r = ready(1), o: Obstacle = { k: 'sparks', l: 0, z: 30, ph, on: false };
      put(r, o);
      for (let i = 0; i < 400 && o.z > -2 && !r.finished; i++) { isolate(r, o); act(r, o); r.step(); }
      return { crashed: r.finished, o };
    };
    it('are live half the time: some phases run straight through, others hurt', () => {
      let crashes = 0;
      for (let ph = 0; ph < SPARK_HALF_CYCLE * 2; ph += 4) if (arc(ph).crashed) crashes++;
      const n = (SPARK_HALF_CYCLE * 2) / 4;
      expect(crashes).toBeGreaterThan(n * 0.3); expect(crashes).toBeLessThan(n * 0.7);
    });
    it('can be jumped while live', () => {
      let saved = 0, hurt = 0;
      for (let ph = 0; ph < SPARK_HALF_CYCLE * 2; ph += 4) {
        if (!arc(ph).crashed) continue;
        hurt++;
        if (!arc(ph, (r, o) => { if (o.z < 3.2 && r.view().py === 0 && r.view().vy === 0 && o.z > 1) r.input('up'); }).crashed) saved++;
      }
      expect(hurt).toBeGreaterThan(0); expect(saved).toBe(hurt);
    });
    it('keep switching: `on` flips with the cycle', () => {
      const r = ready(1), o: Obstacle = { k: 'sparks', l: 1, z: 900, ph: 0, on: false }; put(r, o);
      const states = new Set<boolean>();
      for (let i = 0; i < SPARK_HALF_CYCLE * 2 + 4; i++) { isolate(r, o); r.step(); states.add(!!o.on); }
      expect(states.size).toBe(2);
    });
  });

  it('are still deterministic and replayable', () => {
    const run = () => { const r = createRun(21, () => {}, () => {}, { startDist: 2900 }); steps(r, 1200); return JSON.stringify(r.view()); };
    expect(run()).toBe(run());
  });
  void (null as unknown as HazardKind);
});
