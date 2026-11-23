import { describe, expect, it } from 'vitest';
import { STEPS, Tutorial } from '../src/game/tutorial.js';
import type { SimEvent } from '../shared/sim.js';
import { PPE } from '../shared/hazards.js';
import { Fx, interp } from '../src/render/fx.js';
import { pixelFrame } from '../src/render/pixel-frames.js';
import type { Frame } from '../src/render/types.js';
import { loadMascot } from '../src/render/pixel-mascot.js';
import type { Action } from '../shared/sim.js';

const DT = 1 / 60;
const make = (emit: (e: SimEvent) => void = () => {}) => new Tutorial(() => {}, emit);
const MOVES = STEPS.filter(s => s.kind === 'move') as (typeof STEPS[number] & { g: Action })[];
/** do every move step correctly */
function doMoves(t: Tutorial) {
  for (const m of MOVES) { untilFrozen(t); t.input(m.g); for (let i = 0; i < 400 && t.step === MOVES.indexOf(m); i++) t.update(DT); }
}
/** advance until the practice hazard is waiting for the player */
function untilFrozen(t: Tutorial) { for (let i = 0; i < 2000 && !t.frozen; i++) t.update(DT); expect(t.frozen).toBe(true); }

describe('tutorial: the world waits for the player', () => {
  it('floor, hazard and everything else stand still while it waits', () => {
    const t = make(); untilFrozen(t);
    const dist = t.dist, z = t.objs[0]!.z;
    for (let i = 0; i < 300; i++) t.update(DT);
    expect(t.dist).toBe(dist);
    expect(t.objs[0]!.z).toBe(z);
  });

  it('moves again once the right move is made', () => {
    const t = make(); untilFrozen(t);
    t.input(MOVES[0]!.g);
    const dist = t.dist;
    for (let i = 0; i < 30; i++) t.update(DT);
    expect(t.dist).toBeGreaterThan(dist);
  });

  it('the floor still scrolls while the hazard is approaching', () => {
    const t = make(), d = t.dist;
    for (let i = 0; i < 30; i++) t.update(DT);
    expect(t.dist).toBeGreaterThan(d);
  });

  it('the mascot shows the idle pose while it waits, not a frozen stride', async () => {
    const { cfg } = await loadMascot('flat');
    const t = make(); untilFrozen(t);
    const f: Frame = { s: t, prev: { dist: t.dist, px: t.px, py: t.py, slide: t.slide }, alpha: 1, playing: true, flash: 0, still: t.frozen };
    expect(pixelFrame(f, interp(f), new Fx(), 0, cfg).anim).toBe('idle');
  });
});

describe('tutorial: only the suggested move is accepted', () => {
  const others = (g: Action) => (['left', 'right', 'up', 'down'] as Action[]).filter(a => a !== g);

  it('ignores every other move at every step', () => {
    const t = make();
    for (let step = 0; step < MOVES.length; step++) {
      untilFrozen(t);
      const before = { lane: t.lane, py: t.py, vy: t.vy, slide: t.slide, px: t.px };
      for (const a of others(MOVES[step]!.g)) t.input(a);
      expect({ lane: t.lane, py: t.py, vy: t.vy, slide: t.slide, px: t.px }).toEqual(before);
      expect(t.frozen).toBe(true);                       // still waiting
      t.input(MOVES[step]!.g);
      t.update(DT);
      expect(t.frozen).toBe(false);                      // the right move releases it
      for (let i = 0; i < 400 && t.step === step; i++) t.update(DT);
      expect(t.step).toBe(step + 1);
    }
    expect(t.current.kind).toBe('ppe');                  // the moves are done: now the PPE lesson
  });

  it('accepts nothing between steps or after the hazard was handled', () => {
    const t = make(); untilFrozen(t);
    t.input('left');
    expect(t.lane).toBe(-1);
    t.input('right'); t.input('up'); t.input('down');
    expect(t.lane).toBe(-1); expect(t.vy).toBe(0); expect(t.slide).toBe(0);
  });
});

describe('tutorial: PPE set, shield, then the real run', () => {
  const run = (t: Tutorial, until: () => boolean, max = 3000) => { for (let i = 0; i < max && !until(); i++) t.update(DT); expect(until()).toBe(true); };

  it('after the moves comes a line of coins with all five PPE items, one at a time', () => {
    const t = make(); doMoves(t);
    t.update(DT);
    expect(t.current.kind).toBe('ppe');
    const ppe = t.objs.filter(o => o.k === 'ppe');
    expect(ppe.map(o => (o as { p: string }).p).sort()).toEqual([...PPE].sort());          // each kind exactly once
    expect(t.objs.filter(o => o.k === 'coin').length).toBeGreaterThanOrEqual(5);
    expect(new Set(t.objs.map(o => o.l))).toEqual(new Set([t.lane]));                       // all in the player's lane
    for (const a of ['left', 'right', 'up', 'down'] as Action[]) t.input(a);                // nothing to do but run through
    expect(t.lane).toBe(0); expect(t.py).toBe(0);
  });

  it('collecting all five grants the shield; the forklift then spends it and the real run starts', () => {
    const events: SimEvent[] = [], t = make(e => events.push(e));
    doMoves(t);
    expect(t.shield).toBe(0);
    run(t, () => t.current.kind === 'shield');
    expect(t.got.size).toBe(5);
    expect(t.shield).toBeGreaterThan(0);
    expect(t.coins).toBeGreaterThanOrEqual(5);
    expect(events.filter(e => e.type === 'pickup')).toHaveLength(5);
    run(t, () => t.shield === 0);
    expect(events.at(-1)).toEqual({ type: 'saved' });
    expect(t.got.size).toBe(0);                                                              // the set is spent with the shield
    expect(t.toast).toContain('PPE');
    let over = false;
    for (let i = 0; i < 600 && !over; i++) over = t.update(DT);
    expect(t.done).toBe(true); expect(over).toBe(true);                                      // → startReal()
  });

  it('keeps the floor moving through both new steps and ignores input in them', () => {
    const t = make(); doMoves(t);
    for (const kind of ['ppe', 'shield'] as const) {
      run(t, () => t.current.kind === kind);
      const d = t.dist; t.update(DT); t.update(DT);
      expect(t.dist).toBeGreaterThan(d);
      for (const a of ['left', 'right', 'up', 'down'] as Action[]) t.input(a);
      expect(t.lane).toBe(0); expect(t.py).toBe(0); expect(t.slide).toBe(0);
      if (kind === 'ppe') run(t, () => t.current.kind === 'shield');
    }
  });
});
