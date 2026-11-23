import { describe, expect, it } from 'vitest';
import { SLIDE_SECONDS } from '../shared/sim.js';
import { Fx, interp } from '../src/render/fx.js';
import { ANIMS as FLAT, DEFAULT_SLIDE, SLIDE_IDS, slideAnim, type SlideId } from '../src/render/flat/anims.js';
import { pixelFrame, snap, type FrameConfig, type PixelAnim, type Range } from '../src/render/pixel-frames.js';
import { loadMascot, type MascotStyle } from '../src/render/pixel-mascot.js';
import type { Frame, SceneState } from '../src/render/types.js';
import pixelVec from '../assets/mascot-pixel/vector.json';
import smoothVec from '../assets/mascot-vector/vector.json';

const STYLES: MascotStyle[] = ['flat', 'smooth', 'pixel'];
const ANIM_NAMES: PixelAnim[] = ['idle', 'run', 'jump', 'slide'];

const frame = (s: Partial<SceneState> = {}, playing = true): Frame => {
  const st: SceneState = { dist: 20, lane: 0, px: 0, py: 0, vy: 0, slide: 0, inv: 0, shield: 0, objs: [], ...s };
  return { s: st, prev: { dist: st.dist, px: st.px, py: st.py, slide: st.slide }, alpha: 1, playing, flash: 0 };
};
const pick = (cfg: FrameConfig, s: Partial<SceneState>, o: { playing?: boolean; landT?: number; now?: number } = {}) => {
  const f = frame(s, o.playing ?? true), fx = new Fx();
  fx.landT = o.landT ?? 0;
  return pixelFrame(f, interp(f), fx, o.now ?? 0, cfg);
};
const inRange = (n: number, r: Range) => n >= r[0] && n <= r[1];

for (const style of STYLES) {
  describe(`mascot set: ${style}`, () => {
    it('has a frame config that covers every frame of jump and slide, in order', async () => {
      const m = await loadMascot(style), { cfg } = m;
      expect(m.count('idle')).toBe(cfg.idle);
      expect(m.count('run')).toBe(cfg.run);
      const j = [cfg.jump.takeoff, cfg.jump.rise, cfg.jump.apex, cfg.jump.fall, cfg.jump.land];
      expect(j[0]![0]).toBe(0);
      for (let i = 1; i < j.length; i++) expect(j[i]![0]).toBe(j[i - 1]![1] + 1);       // contiguous
      expect(j.at(-1)![1]).toBe(m.count('jump') - 1);
      const s = [cfg.slide.drop, cfg.slide.hold, cfg.slide.recover];
      expect(s[0]![0]).toBe(0);
      expect(s[1]![0]).toBeLessThanOrEqual(s[0]![1] + 1);
      expect(s[2]![0]).toBeLessThanOrEqual(s[1]![1] + 1);
      expect(s.at(-1)![1]).toBe(m.count('slide') - 1);
    });

    it('runs through every run frame as the distance grows', async () => {
      const { cfg } = await loadMascot(style), seen = new Set<number>();
      for (let d = 20; d < 20 + cfg.metresPerLoop * 2; d += .05) { const p = pick(cfg, { dist: d }); expect(p.anim).toBe('run'); seen.add(p.frame); }
      expect(seen.size).toBe(cfg.run);
    });

    it('follows the jump: takeoff → rise → apex → fall as vy falls', async () => {
      const { cfg } = await loadMascot(style), j = cfg.jump;
      const f = (vy: number, py: number) => pick(cfg, { vy, py });
      expect(inRange(f(9.2, 0).frame, j.takeoff)).toBe(true);
      expect(inRange(f(5, .8).frame, j.rise)).toBe(true);
      expect(inRange(f(.5, 1.7).frame, j.apex)).toBe(true);
      expect(inRange(f(-1, 1.7).frame, j.apex)).toBe(true);
      expect(inRange(f(-8, 1).frame, j.fall)).toBe(true);
      for (const vy of [9.2, 5, 1, -2, -8, -16]) expect(f(vy, 1).anim).toBe('jump');
      // through one real jump (the sim's physics: vy = 9.2, g = 24, 1/60 s steps) the frame only ever moves forward
      let last = -1, vy = 9.2, py = 0;
      do {
        vy -= 24 / 60; py += vy / 60;
        if (py <= 0) break;
        const fr = f(vy, py).frame;
        expect(fr).toBeGreaterThanOrEqual(last);
        expect(f(vy, py).anim).toBe('jump');
        last = fr;
      } while (true);
      expect(last).toBeGreaterThan(j.apex[1]);                     // it reached the fall frames before touching down
    });

    it('plays the landing frames after touchdown, then goes back to running', async () => {
      const { cfg } = await loadMascot(style);
      const frames = [1, .75, .5, .25].map(landT => pick(cfg, { py: 0 }, { landT }).frame);
      for (const fr of frames) expect(inRange(fr, cfg.jump.land)).toBe(true);
      expect([...frames].sort((a, b) => a - b)).toEqual(frames);
      expect(pick(cfg, { py: 0 }, { landT: 0 }).anim).toBe('run');
    });

    it('slides through drop, hold and recover, and a slide in mid-air still shows the slide', async () => {
      const { cfg } = await loadMascot(style);
      const at = (p: number) => pick(cfg, { slide: SLIDE_SECONDS * (1 - p) });
      expect(inRange(at(.02).frame, cfg.slide.drop)).toBe(true);
      expect(inRange(at(.5).frame, cfg.slide.hold)).toBe(true);
      expect(inRange(at(.95).frame, cfg.slide.recover)).toBe(true);
      let last = -1;
      for (let p = 0; p < 1; p += .02) { const fr = at(p).frame; expect(fr).toBeGreaterThanOrEqual(last); last = fr; }
      expect(pick(cfg, { slide: .6, py: 1, vy: -16 }).anim).toBe('slide');
    });

    it('breathes when standing still on the menu', async () => {
      const { cfg } = await loadMascot(style);
      const a = pick(cfg, { dist: 0 }, { playing: false, now: 0 }), b = pick(cfg, { dist: 0 }, { playing: false, now: cfg.idleMs + 1 });
      expect(a.anim).toBe('idle');
      expect(b.frame).toBe((a.frame + 1) % cfg.idle);
    });

    it('never asks for a frame the set does not have', async () => {
      const m = await loadMascot(style);
      for (let i = 0; i < 600; i++) {
        const p = pick(m.cfg, { dist: i * .7, py: (i % 7) * .3, vy: 10 - (i % 13) * 2, slide: i % 5 ? 0 : (i % 9) * .08 }, { landT: (i % 4) * .3, playing: i % 3 > 0, now: i * 37 });
        expect(p.frame).toBeGreaterThanOrEqual(0);
        expect(p.frame).toBeLessThan(m.count(p.anim));
      }
    });

    it('builds an art box around the feet for every frame', async () => {
      const m = await loadMascot(style);
      for (const a of ANIM_NAMES) for (let i = 0; i < m.count(a); i++) {
        const box = m.art(a, i, 1).box;
        expect(box[0]).toBeLessThan(0); expect(box[2]).toBeGreaterThan(0);                 // feet inside
        expect(box[1]).toBeLessThan(-.5); expect(box[3]).toBeGreaterThanOrEqual(0);
      }
    });
  });
}

describe('flat set', () => {
  it('uses the side-view slide for the middle of the slide and the back view around it', () => {
    const slide = slideAnim('side');
    for (let i = 0; i < slide.frames; i++) expect('side' in slide.pose(i)).toBe(i >= 2 && i <= 11);
  });
  it('the game and the exported sheets default to the Tuck ball crouch', () => {
    expect(DEFAULT_SLIDE).toBe('c2');
    const slide = FLAT.find(a => a.name === 'slide')!;
    expect(slide.note).toMatch(/^Tuck ball/);
    for (let i = 0; i < slide.frames; i++) expect('side' in slide.pose(i)).toBe(false);          // seen from behind the whole time
  });
});

describe('slide variants', () => {
  const ids = SLIDE_IDS.filter(i => i !== 'side') as SlideId[];
  it('there are five back-facing slides, five crouches, plus the side-view slide', () => {
    expect(ids).toEqual(['1', '2', '3', '4', '5', 'c1', 'c2', 'c3', 'c4', 'c5']);
    expect(SLIDE_IDS).toContain('side');
  });
  for (const id of ids) {
    it(`variant ${id}: 14 frames, same tags, stays seen from behind, start and end in the run pose`, () => {
      const a = slideAnim(id), ref = slideAnim('side');
      expect(a.frames).toBe(14);
      expect(a.tags).toEqual(ref.tags);
      for (let i = 0; i < 14; i++) {
        const pose = a.pose(i);
        expect('side' in pose).toBe(false);                                  // never the side view
        const nums = JSON.stringify(pose).match(/-?\d+(\.\d+)?(e-?\d+)?/g)!.map(Number);
        expect(nums.every(Number.isFinite)).toBe(true);
      }
      expect(a.pose(0)).toEqual(FLAT.find(x => x.name === 'slide')!.pose(0));    // the run pose
      expect(JSON.stringify(a.pose(13))).toBe(JSON.stringify(ref.pose(13)));
    });
    it(`variant ${id}: loads as a mascot set with matching frame counts`, async () => {
      const m = await loadMascot('flat', id);
      expect(m.count('slide')).toBe(14);
      expect(m.cfg.slide.hold).toEqual([4, 9]);
    });
  }
  it('every variant differs from the others in the held frames', () => {
    const held = ids.map(id => JSON.stringify(slideAnim(id).pose(6)));
    expect(new Set(held).size).toBe(ids.length);
  });
});

describe('smooth and pixel vector sets', () => {
  const sets = { pixel: pixelVec, smooth: smoothVec } as unknown as Record<string, { cell: { w: number; h: number }; anchor: { x: number; y: number }; unit: number; animations: Record<string, [string, string, string?, number?][][]> }>;
  it('use the same cell, anchor and unit, so they are interchangeable', () => {
    const { pixel, smooth } = sets as Record<string, (typeof sets)[string]>;
    expect([smooth!.cell, smooth!.anchor, smooth!.unit]).toEqual([pixel!.cell, { x: 16, y: 32 }, pixel!.unit]);
  });
  for (const [name, vec] of Object.entries(sets)) {
    it(`${name}: every layer is valid path data inside the cell`, () => {
      for (const frames of Object.values(vec.animations)) for (const layers of frames) {
        expect(layers.length).toBeGreaterThan(3);
        for (const [fill, d, stroke, sw] of layers) {
          expect(fill).toMatch(/^(none|#[0-9a-f]{6})$/);
          if (stroke) { expect(stroke).toMatch(/^#[0-9a-f]{6}$/); expect(sw).toBeGreaterThan(0); }
          expect(d).toMatch(/^[MLHVCQAZmlhvcqaz0-9 .,-]+$/);
          // the pixel set uses relative h/v lengths (can be negative); only the smooth set is absolute coordinates
          if (name === 'smooth') for (const m of d.matchAll(/-?\d+(\.\d+)?/g)) { const n = +m[0]; expect(n > -4 && n < vec.cell.w + 4).toBe(true); }
        }
      }
    });
  }
  it('smooth is real curves, not rectangles', () => {
    expect(sets.smooth!.animations.idle![0]!.map(l => l[1]).join('')).toMatch(/[CQA]/);
  });
});

describe('device pixel snapping', () => {
  it('snaps to the device grid', () => {
    expect(snap(10.3, 2)).toBe(10.5);
    expect(snap(10.2, 2)).toBe(10);
  });
});
