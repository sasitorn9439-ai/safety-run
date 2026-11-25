import { describe, expect, it } from 'vitest';
import { LOOT_CHANCE, LOOT_GAP, createRun, type SimEvent } from '../shared/sim.js';
import { CATALOG, EMPTY_WARDROBE, RARITY_WEIGHT, addBox, equip, lookOf, openBox, parseWardrobe, type Wardrobe } from '../src/cosmetics/wardrobe.js';
import { RARITIES, SLOTS, type Look } from '../src/cosmetics/types.js';
import { DEFAULT_LOOK } from '../src/cosmetics/skins.js';
import type { Ctx } from '../src/render/draw.js';
import { loadMascot } from '../src/render/pixel-mascot.js';
import type { PixelAnim } from '../src/render/pixel-frames.js';
import { play, think } from './bot.js';

/** a small seeded random, so the box tests are repeatable */
const rng = (seed: number) => () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);

describe('catalog', () => {
  it('has 30 of each kind (plus custom skins), every id unique, every rarity in every kind', () => {
    expect(new Set(CATALOG.map(c => c.id)).size).toBe(CATALOG.length);
    for (const slot of SLOTS) {
      const of = CATALOG.filter(c => c.slot === slot);
      expect(of.filter(c => !(c.slot === 'skin' && c.figure))).toHaveLength(30);
      for (const r of RARITIES) expect(of.some(c => c.rarity === r)).toBe(true);
    }
  });
});

describe('opening boxes', () => {
  it('needs a box, uses it up and never gives a duplicate until everything is owned', () => {
    expect(openBox(EMPTY_WARDROBE, Math.random)).toBeNull();
    let w: Wardrobe = addBox(EMPTY_WARDROBE, CATALOG.length + 3);
    const random = rng(7);
    for (let i = 0; i < CATALOG.length; i++) {
      const r = openBox(w, random)!;
      expect(w.owned).not.toContain(r.item.id);
      expect(r.wardrobe.boxes).toBe(w.boxes - 1);
      w = r.wardrobe;
    }
    expect(new Set(w.owned).size).toBe(CATALOG.length);
    expect(openBox(w, random)).toBeNull();                 // nothing left to win: the remaining boxes are kept
    expect(w.boxes).toBe(3);
  });

  it('pays out rarities close to their weights', () => {
    const random = rng(42), n = 20000, seen = Object.fromEntries(RARITIES.map(r => [r, 0]));
    for (let i = 0; i < n; i++) seen[openBox(addBox(EMPTY_WARDROBE), random)!.item.rarity]!++;
    const total = RARITIES.reduce((s, r) => s + RARITY_WEIGHT[r], 0);
    for (const r of RARITIES) expect(Math.abs(seen[r]! / n - RARITY_WEIGHT[r] / total)).toBeLessThan(.015);
  });

  it('skips a rarity the player has completed', () => {
    const legendaries = CATALOG.filter(c => c.rarity === 'legendary').map(c => c.id);
    const w: Wardrobe = { boxes: 500, owned: legendaries, equipped: {} };
    const random = rng(3);
    let cur = w;
    for (let i = 0; i < 40; i++) { const r = openBox(cur, random)!; expect(r.item.rarity).not.toBe('legendary'); cur = r.wardrobe; }
  });
});

describe('wardrobe', () => {
  it('reads back anything stored, dropping what is not valid', () => {
    expect(parseWardrobe(null)).toEqual(EMPTY_WARDROBE);
    expect(parseWardrobe('junk')).toEqual(EMPTY_WARDROBE);
    const w = parseWardrobe({ boxes: 2.7, owned: ['hat-crown', 'hat-crown', 'nope', 5], equipped: { hat: 'hat-crown', skin: 'skin-gold', effect: 'hat-crown' } });
    expect(w).toEqual({ boxes: 2, owned: ['hat-crown'], equipped: { hat: 'hat-crown' } });
  });

  it('wears only what is owned, in its own slot, and can take it off', () => {
    const w: Wardrobe = { boxes: 0, owned: ['hat-crown', 'skin-gold'], equipped: {} };
    expect(equip(w, 'hat', 'hat-wizard')).toBe(w);
    expect(equip(w, 'skin', 'hat-crown')).toBe(w);
    const worn = equip(equip(w, 'hat', 'hat-crown'), 'skin', 'skin-gold');
    expect(lookOf(worn).hat?.id).toBe('hat-crown');
    expect(lookOf(worn).pal).not.toEqual(DEFAULT_LOOK.pal);
    expect(lookOf(equip(worn, 'hat', null)).hat).toBeNull();
  });
});

/* ---------- the mascot: a fake 2D context that records where every shape lands ---------- */
type M = [number, number, number, number, number, number];
function boundsCtx() {
  let m: M = [1, 0, 0, 1, 0, 0];
  const stack: M[] = [], box = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
  const pt = (x: number, y: number) => {
    const X = m[0] * x + m[2] * y + m[4], Y = m[1] * x + m[3] * y + m[5];
    box.x0 = Math.min(box.x0, X); box.y0 = Math.min(box.y0, Y); box.x1 = Math.max(box.x1, X); box.y1 = Math.max(box.y1, Y);
  };
  const oval = (x: number, y: number, rx: number, ry: number, rot = 0) => {
    for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2, c = Math.cos(a) * rx, s = Math.sin(a) * ry; pt(x + c * Math.cos(rot) - s * Math.sin(rot), y + c * Math.sin(rot) + s * Math.cos(rot)); }
  };
  const mul = (a: M, b: M): M => [a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1], a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3], a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5]];
  const rect = (x: number, y: number, w: number, h: number) => { pt(x, y); pt(x + w, y + h); pt(x + w, y); pt(x, y + h); };
  const grad = { addColorStop() {} };
  const api: Record<string, unknown> = {
    save: () => stack.push(m), restore: () => { m = stack.pop()!; },
    translate: (x: number, y: number) => { m = mul(m, [1, 0, 0, 1, x, y]); },
    scale: (x: number, y: number) => { m = mul(m, [x, 0, 0, y, 0, 0]); },
    rotate: (a: number) => { m = mul(m, [Math.cos(a), Math.sin(a), -Math.sin(a), Math.cos(a), 0, 0]); },
    moveTo: pt, lineTo: pt,
    quadraticCurveTo: (a: number, b: number, x: number, y: number) => { pt(a, b); pt(x, y); },
    bezierCurveTo: (a: number, b: number, c: number, d: number, x: number, y: number) => { pt(a, b); pt(c, d); pt(x, y); },
    arc: (x: number, y: number, r: number) => oval(x, y, r, r),
    ellipse: (x: number, y: number, rx: number, ry: number, rot: number) => oval(x, y, rx, ry, rot),
    roundRect: rect, fillRect: rect, rect,
    createRadialGradient: () => grad, createLinearGradient: () => grad,
  };
  const ctx = new Proxy(api, { get: (t, k) => k in t ? t[k as string] : () => {}, set: () => true }) as unknown as Ctx;
  return { ctx, box };
}

const ANIMS: PixelAnim[] = ['idle', 'run', 'jump', 'slide'];
const looks: [string, Look][] = [
  ['no cosmetics', DEFAULT_LOOK],
  ...CATALOG.filter(c => c.slot === 'hat').map(h => [h.id, { ...DEFAULT_LOOK, hat: h }] as [string, Look]),
  ...CATALOG.filter(c => c.slot === 'effect').map(e => [e.id, { ...DEFAULT_LOOK, effect: e }] as [string, Look]),
  // custom skins add parts to the body: they must stay inside the cell too, and with a hat on
  ...CATALOG.flatMap(c => c.slot === 'skin' && c.figure ? [[c.id, lookOf({ boxes: 0, owned: [c.id, 'hat-wizard'], equipped: { skin: c.id, hat: 'hat-wizard' } })] as [string, Look]] : []),
];

describe('cosmetics on the flat mascot', async () => {
  const m = await loadMascot('flat');
  const counts = ANIMS.map(a => m.count(a)), cfg = JSON.stringify(m.cfg);

  it.each(looks)('%s: every idle, run, jump and slide frame fits inside the drawn cell (nothing is clipped)', (_, look) => {
    m.look = look;
    for (const anim of ANIMS) for (let i = 0; i < m.count(anim); i++) {
      const art = m.art(anim, i, 1), { ctx, box } = boundsCtx();
      art.draw(ctx, 1);
      const [x0, y0, x1, y1] = art.box, tol = .03;            // strokes reach a little past the path
      expect([anim, i, box.x0 >= x0 - tol, box.y0 >= y0 - tol, box.x1 <= x1 + tol, box.y1 <= y1 + tol]).toEqual([anim, i, true, true, true, true]);
    }
    m.look = DEFAULT_LOOK;
  });

  it('wearing anything leaves the animations themselves alone: same frames, same tags, feet at the same anchor', () => {
    for (const [, look] of looks.concat(CATALOG.filter(c => c.slot === 'skin').map(s => [s.id, lookOf({ boxes: 0, owned: [s.id], equipped: { skin: s.id } })]))) {
      m.look = look;
      expect(ANIMS.map(a => m.count(a))).toEqual(counts);
      expect(JSON.stringify(m.cfg)).toBe(cfg);
      const [x0, y0, x1, y1] = m.art('run', 0, 1).box;
      expect(x0 < 0 && x1 > 0 && y0 < 0 && y1 > 0).toBe(true);   // the origin (the feet) is inside every cell
    }
    m.look = DEFAULT_LOOK;
  });
});

/* ---------- loot boxes in the run ---------- */
describe('loot boxes on the track', () => {
  it('turn up rarely: at most one per LOOT_GAP checkpoint, and about LOOT_CHANCE of them', () => {
    let checkpoints = 0, spawned = 0;
    for (let seed = 1; seed <= 200; seed++) {
      const seen = new Set<object>();
      const { run } = play(seed, { maxTicks: 60 * 60 * 10, onTick: r => { for (const o of r.view().objs) if (o.k === 'loot' && !seen.has(o)) { seen.add(o); spawned++; } } });
      checkpoints += Math.floor(run.view().dist / LOOT_GAP);
    }
    expect(spawned).toBeLessThanOrEqual(checkpoints);
    expect(spawned / checkpoints).toBeGreaterThan(LOOT_CHANCE / 4);
    expect(spawned / checkpoints).toBeLessThan(LOOT_CHANCE * 2.5);
  });

  it('picking one up says so and adds nothing to the score', () => {
    let found = 0;
    for (let seed = 1; seed <= 400 && found < 2; seed++) {
      const events: SimEvent[] = [];
      const run = createRun(seed, () => {}, e => events.push(e));
      while (run.tick < 60 * 60 * 6 && !run.finished) {
        const v = run.view();
        if (v.pendingBonus) { run.answer(v.pendingBonus.correct); continue; }
        // steer into a loot box's lane when the way there is clear, otherwise just dodge
        const box = v.objs.find(o => o.k === 'loot' && !o.gone && o.z > 0 && o.z < 30);
        if (!think(run) && box && box.l !== v.lane) run.input(box.l < v.lane ? 'left' : 'right');
        const before = { score: run.score(), coin: run.view().earned.coin, dist: Math.floor(run.view().dist), n: events.length };
        run.step();
        if (events.slice(before.n).some(e => e.type === 'loot')) {
          found++;
          const after = run.view();
          expect(after.toast).toMatch(/กล่องสุ่ม/);
          expect(run.score() - before.score).toBe((Math.floor(after.dist) - before.dist) + (after.earned.coin - before.coin));
        }
      }
    }
    expect(found).toBeGreaterThan(0);
  });
});
