import { describe, expect, it } from 'vitest';
import { ZMAX, type GameObject } from '../shared/sim.js';
import { Camera } from '../src/render/camera.js';
import { DrawList, Fx, HAZARD_SCALE, PPE_FAR_BOOST, RUN_FRAMES, envItems, interp, pose, type EnvItem } from '../src/render/fx.js';
import { HAZARD_BOX } from '../src/render/draw.js';
import type { Frame, SceneState } from '../src/render/types.js';

const scene = (over: Partial<SceneState> = {}): SceneState => ({ dist: 10, lane: 0, px: 0, py: 0, vy: 0, slide: 0, inv: 0, shield: 0, objs: [], ...over });
const frame = (s: SceneState, alpha = 1, prevDist = s.dist): Frame => ({ s, prev: { dist: prevDist, px: s.px, py: s.py, slide: s.slide }, alpha, playing: true, flash: 0 });
const cam = () => { const c = new Camera(); c.set(390, 780); return c; };

describe('interp', () => {
  it('blends the last two sim steps', () => {
    const f: Frame = { s: scene({ dist: 11, px: 1 }), prev: { dist: 10, px: 0, py: 0, slide: 0 }, alpha: .25, playing: true, flash: 0 };
    const I = interp(f);
    expect(I.dist).toBeCloseTo(10.25);
    expect(I.px).toBeCloseTo(.25);
  });
  it('objects trail by the part of the last step not yet shown', () => {
    expect(interp(frame(scene({ dist: 11 }), .25, 10)).lead).toBeCloseTo(.75);
    expect(interp(frame(scene({ dist: 11 }), 1, 10)).lead).toBeCloseTo(0);
  });
});

describe('DrawList', () => {
  const obj = (z: number, k = 'spill' as const): GameObject => ({ k, l: 0, z });
  it('draws far to near with the mascot between objects ahead and behind', () => {
    const f = frame(scene({ objs: [obj(-1), obj(30), obj(5), obj(60)] }));
    const dl = new DrawList(); dl.build(f, cam(), interp(f), 0);
    expect(dl.items.slice(0, dl.n).map(i => (i.kind === 'player' ? 'P' : Math.round(i.z)))).toEqual([60, 30, 5, 'P', -1]);
  });
  it('puts the mascot last when nothing is behind it', () => {
    const f = frame(scene({ objs: [obj(8)] }));
    const dl = new DrawList(); dl.build(f, cam(), interp(f), 0);
    expect(dl.items[dl.n - 1]!.kind).toBe('player');
  });
  it('fades objects in from the haze and skips ones beyond the draw distance', () => {
    const f = frame(scene({ objs: [obj(ZMAX - 1), obj(ZMAX + 5), obj(10)] }));
    const dl = new DrawList(); dl.build(f, cam(), interp(f), 0);
    const hazards = dl.items.slice(0, dl.n).filter(i => i.kind === 'hazard');
    expect(hazards).toHaveLength(2);
    expect(hazards[0]!.fade).toBeLessThan(.1);
    expect(hazards[1]!.fade).toBe(1);
  });
  it('ignores collected pickups', () => {
    const f = frame(scene({ objs: [{ k: 'ppe', p: 'helmet', l: 0, z: 5, gone: true }] }));
    const dl = new DrawList(); dl.build(f, cam(), interp(f), 0);
    expect(dl.n).toBe(1);
  });
  it('scales objects with perspective', () => {
    const f = frame(scene({ objs: [obj(40), obj(5)] }));
    const dl = new DrawList(); dl.build(f, cam(), interp(f), 0);
    const [far, near] = dl.items.filter(i => i.kind === 'hazard');
    expect(near!.u).toBeGreaterThan(far!.u * 3);
  });
});

describe('coins', () => {
  const item = (z: number, now = 0) => {
    const f = frame(scene({ objs: [{ k: 'coin', l: 0, z }] })), dl = new DrawList(); dl.build(f, cam(), interp(f), now);
    return dl.items.slice(0, dl.n).find(i => i.kind === 'coin')!;
  };
  it('are drawn, a bit larger than perspective when far, and sit above the floor', () => {
    const near = item(4), far = item(40);
    expect(far.u / near.u).toBeGreaterThan((6 + 4) / (6 + 40));
    expect(near.gy).toBeGreaterThan(near.y);
  });
  it('spin all the way round but never vanish edge-on', () => {
    let lo = 9, hi = 0;
    for (let now = 0; now < 4000; now += 41) { const s = item(10, now).sx; lo = Math.min(lo, s); hi = Math.max(hi, s); }
    expect(lo).toBeGreaterThanOrEqual(.12 - 1e-9); expect(lo).toBeLessThan(.3); expect(hi).toBeGreaterThan(.95);
  });
  it('neighbours are out of phase, so a trail ripples', () => {
    const f = frame(scene({ objs: [{ k: 'coin', l: 0, z: 10 }, { k: 'coin', l: 0, z: 11.7 }] })), dl = new DrawList(); dl.build(f, cam(), interp(f), 0);
    const [a, b] = dl.items.slice(0, dl.n).filter(i => i.kind === 'coin');
    expect(a!.sx).not.toBeCloseTo(b!.sx, 2);
  });
});

describe('PPE pickups stay readable', () => {
  const ppe = (z: number): GameObject => ({ k: 'ppe', p: 'helmet', l: 0, z });
  const item = (z: number, now = 0) => {
    const f = frame(scene({ objs: [ppe(z)] })), dl = new DrawList(); dl.build(f, cam(), interp(f), now);
    return dl.items.slice(0, dl.n).find(i => i.kind === 'ppe')!;
  };
  it('are drawn bigger than true perspective when far away, so they never shrink to a dot', () => {
    const near = item(4), far = item(40), c = cam();
    const trueRatio = (6 + 4) / (6 + 40);                                   // size ratio under pure perspective
    expect(far.u / near.u).toBeGreaterThan(trueRatio * 1.1);
    expect(PPE_FAR_BOOST).toBeGreaterThan(0);
    expect(far.u).toBeGreaterThan(c.lw * .12);                              // still a clearly visible medallion at the far end
  });
  it('turn slowly (never edge-on) and glow, but stay put on the floor', () => {
    for (let now = 0; now < 4000; now += 97) {
      const i = item(10, now);
      expect(i.sx).toBeGreaterThanOrEqual(.59); expect(i.sx).toBeLessThanOrEqual(1.01);
      expect(i.halo).toBeGreaterThan(.2); expect(i.halo).toBeLessThan(.7);
      expect(i.gy).toBeGreaterThan(i.y);                                    // the floor point is below the floating medallion
    }
  });
  it('leave hazards untouched', () => {
    const f = frame(scene({ objs: [{ k: 'forklift', l: 0, z: 20 }] })), dl = new DrawList(); dl.build(f, cam(), interp(f), 0);
    const h = dl.items.find(i => i.kind === 'hazard')!;
    expect([h.sx, h.halo]).toEqual([1, 0]);
  });
});

describe('pose', () => {
  const P = (s: Partial<SceneState>, now = 0) => { const f = frame(scene(s)); return pose(f, cam(), interp(f), new Fx(), now, { x: 0, y: 0, s: 1 }); };
  it('runs through the cycle as the distance grows and loops', () => {
    const frames = new Set([0, .5, 1, 2, 3, 4, 5, 6].map(d => P({ dist: d }).frame));
    expect(frames.size).toBeGreaterThan(4);
    expect([...frames].every(n => n >= 0 && n < RUN_FRAMES)).toBe(true);
  });
  it('leans toward the lane it is moving into', () => {
    expect(P({ lane: 1, px: 0 }).lean).toBeGreaterThan(0);
    expect(P({ lane: -1, px: 0 }).lean).toBeLessThan(0);
    expect(P({ lane: 0, px: 0 }).lean).toBe(0);
  });
  it('lifts off the ground and stretches while jumping up', () => {
    const ground = P({}), up = P({ py: 1, vy: 5 });
    expect(up.feetY).toBeLessThan(ground.feetY);
    expect(up.ys).toBeGreaterThan(1);
    expect(up.shadowU).toBeLessThan(ground.shadowU);
  });
  it('uses the slide animation while sliding and flickers while invincible', () => {
    expect(P({ slide: .3 }).sliding).toBe(true);
    expect(P({ inv: .05 }).alpha).toBe(1);
    expect(P({ inv: .15 }).alpha).toBeLessThan(1);
  });
});

describe('envItems', () => {
  it('always fills the corridor with pillars on both sides and a light every 8 m', () => {
    for (const d of [0, 3.7, 11.9, 1234.5]) {
      const out: EnvItem[] = [];
      const n = envItems(d, out);
      const items = out.slice(0, n);
      expect(items.filter(i => !i.light && i.l < 0).length).toBe(items.filter(i => !i.light && i.l > 0).length);
      expect(items.filter(i => i.light).length).toBeGreaterThanOrEqual(8);
      expect(items.every(i => i.z < ZMAX && i.z > -12)).toBe(true);
    }
  });
});

describe('Fx', () => {
  it('burst particles live, fall and die; crash shakes the screen', () => {
    const fx = new Fx(), c = cam();
    fx.onEvent({ type: 'crash', kind: 'forklift' }, 0, c);
    expect(fx.shake).toBe(1);
    expect(fx.particles.length).toBeGreaterThan(0);
    const f = frame(scene()), I = interp(f);
    for (let i = 0; i < 120; i++) fx.update(I, true, c, 1 / 60);
    expect(fx.particles.length).toBe(0);
    expect(fx.shake).toBe(0);
  });
  it('detects a landing', () => {
    const fx = new Fx(), c = cam();
    fx.update(interp(frame(scene({ py: 1 }))), true, c, 1 / 60);
    fx.update(interp(frame(scene({ py: 0 }))), true, c, 1 / 60);
    expect(fx.landT).toBeGreaterThan(.5);
  });
});

describe('pickups vs hazards: obstacles must outweigh the things you collect', () => {
  const at = (objs: GameObject[]) => { const f = frame(scene({ objs })), dl = new DrawList(); dl.build(f, cam(), interp(f), 0); return dl.items.slice(0, dl.n); };
  const ICON = .58;                                                     // PPE art size in units (draw.ts)
  it('at every distance a PPE item is clearly smaller than the tall hazards', () => {
    for (const z of [4, 8, 14, 24, 40, 60]) {
      const items = at([{ k: 'forklift', l: -1, z }, { k: 'pallet', l: 1, z }, { k: 'ppe', p: 'helmet', l: 0, z }]);
      const ppe = items.find(i => i.kind === 'ppe')!, fork = items.find(i => i.kind === 'hazard' && i.k === 'forklift')!, pal = items.find(i => i.kind === 'hazard' && i.k === 'pallet')!;
      const hFork = fork.u * (HAZARD_BOX.forklift[3] - HAZARD_BOX.forklift[1]), hPal = pal.u * (HAZARD_BOX.pallet[3] - HAZARD_BOX.pallet[1]);
      expect(ppe.u * ICON / hFork).toBeLessThan(.6);
      expect(ppe.u * ICON / hPal).toBeLessThan(.65);
    }
  });
  it('tall hazards are drawn larger than true perspective, flat ones are not', () => {
    expect(HAZARD_SCALE.forklift).toBeGreaterThan(1); expect(HAZARD_SCALE.pallet).toBeGreaterThan(1);
    expect(HAZARD_SCALE.spill).toBe(1); expect(HAZARD_SCALE.hose).toBe(1); expect(HAZARD_SCALE.pipe).toBe(1);
    expect(HAZARD_SCALE.forklift).toBeLessThanOrEqual(1.2);              // wider than that and it reaches into the next lane
  });
  it('the flat hazards carry a tall warning (sign / cone), so their art box is tall enough', () => {
    for (const k of ['spill', 'hose'] as const) expect(-HAZARD_BOX[k][1]).toBeGreaterThanOrEqual(.45);
  });
});

describe('power-ups', () => {
  const item = (z: number, now = 0) => {
    const f = frame(scene({ objs: [{ k: 'power', t: 'lift', l: 0, z }] })), dl = new DrawList(); dl.build(f, cam(), interp(f), now);
    return dl.items.slice(0, dl.n).find(i => i.kind === 'power')!;
  };
  it('are drawn as their own kind, with the power-up type, a strong glow and the floor point below', () => {
    const i = item(10);
    expect(i.pw).toBe('lift'); expect(i.halo).toBeGreaterThan(.5); expect(i.gy).toBeGreaterThan(i.y);
  });
  it('are bigger than a PPE item at the same distance', () => {
    const f = frame(scene({ objs: [{ k: 'power', t: 'estop', l: -1, z: 10 }, { k: 'ppe', p: 'helmet', l: 1, z: 10 }] })), dl = new DrawList(); dl.build(f, cam(), interp(f), 0);
    const items = dl.items.slice(0, dl.n), pw = items.find(i => i.kind === 'power')!, pp = items.find(i => i.kind === 'ppe')!;
    expect(pw.u * .8).toBeGreaterThan(pp.u * .58);                 // art sizes in units: power .8, PPE .58
  });
  it('turn slowly and never edge-on', () => {
    for (let now = 0; now < 4000; now += 97) { const s = item(10, now).sx; expect(s).toBeGreaterThanOrEqual(.69); expect(s).toBeLessThanOrEqual(1.01); }
  });
});
