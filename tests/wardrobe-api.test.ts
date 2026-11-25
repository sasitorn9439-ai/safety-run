import crypto from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { admin, finish, start, wardrobe } from '../server/handlers.js';
import { createMemoryStore } from '../server/memory-store.js';
import type { Store } from '../server/store.js';
import { LOOT_GAP, STEP, createRun, type Action, type InputEntry } from '../shared/sim.js';
import { CATALOG } from '../src/cosmetics/wardrobe.js';
import { think } from './bot.js';

type Body = Record<string, any>;

/** Plays `seed` steering into the first loot box, then stops dodging so the run ends. Null if no box was reached. */
function lootRun(seed: number) {
  let loot = false;
  const run = createRun(seed, undefined, e => { if (e.type === 'loot') loot = true; }), inputs: InputEntry[] = [];
  const go = (a: Action) => { if (run.input(a)) inputs.push([run.tick, a]); };
  while (!run.finished && run.tick < 60 * 60 * 6) {
    const v = run.view();
    if (v.pendingBonus) { const i = v.pendingBonus.correct; if (run.answer(i)) inputs.push([run.tick, i]); continue; }
    if (!loot) {
      const a = think(run), box = v.objs.find(o => o.k === 'loot' && !o.gone && o.z > 0 && o.z < 30);
      if (a) inputs.push([run.tick, a]);                     // think() pressed it already
      else if (box && box.l !== v.lane) go(box.l < v.lane ? 'left' : 'right');
    }
    run.step();
  }
  return loot && run.finished ? { seed, ticks: run.tick, inputs } : null;
}

let found: ReturnType<typeof lootRun> = null;
for (let seed = 1; seed <= 400 && !found; seed++) found = lootRun(seed);

let store: Store;
beforeEach(() => { store = createMemoryStore(); vi.useFakeTimers(); vi.setSystemTime(new Date('2026-12-01T09:00:00Z')); });
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); delete process.env.ADMIN_KEY; delete process.env.ALLOWED_IDS; });

const ward = async (b: Body) => (await wardrobe(store, b)) as { status: number; body: Body };

/** starts a run on `seed` (the server normally rolls it) */
async function startOn(id: string, seed: number) {
  const real = crypto.randomBytes.bind(crypto);
  const spy = vi.spyOn(crypto, 'randomBytes').mockImplementation(((n: number) => {
    if (n !== 4) return real(n);
    const b = Buffer.alloc(4); b.writeUInt32BE(seed); return b;
  }) as typeof crypto.randomBytes);
  const s = (await start(store, { id }, 'test')).body as Body;
  spy.mockRestore();
  expect(s.seed).toBe(seed);
  return s;
}

describe('wardrobe API: runs toward special items', () => {
  /** finishes `n` runs for `id` straight in the store (a verified replay each would take far too long) */
  async function finished(id: string, n: number) {
    await store.avatarOf(id);
    for (let i = 1; i <= n; i++) {
      const runId = await store.createRun({ id, runNo: i, name: id, tokenHash: 'h' + i, ua: 't', seed: i });
      await store.finishRun(String(runId), { score: 100, secs: 30, dist: 100, loot: 0 });
    }
  }
  it('counts finished runs, and the special skin can be worn only from the 50th', async () => {
    await finished('2001', 49);
    expect((await ward({ id: '2001' })).body.runs).toBe(49);
    expect((await ward({ id: '2001', action: 'equip', slot: 'skin', item: 'skin-boss' })).status).toBe(400);
    await finished('2002', 50);
    const w = (await ward({ id: '2002' })).body;
    expect(w.runs).toBe(50);
    expect(w.owned).toContain('skin-boss');
    expect((await ward({ id: '2002', action: 'equip', slot: 'skin', item: 'skin-boss' })).body.equipped).toEqual({ skin: 'skin-boss' });
  });
});

describe('wardrobe API', () => {
  it("an older all-digit id still sees the chests it opened", async () => {
    await store.avatarOf('000');
    await store.grantBoxes(['000'], 2);
    const opened = (await ward({ id: '000', action: 'open' })).body;
    expect(opened.owned).toHaveLength(1);
    expect((await ward({ id: ' 000 ' })).body).toMatchObject({ boxes: 1, owned: opened.owned });
    expect((await ward({ id: '001' })).status).toBe(400);                  // never played: not a valid new id
  });
  it('a new player has nothing, and cannot open a box they never picked up', async () => {
    expect((await ward({ id: '1001' })).body).toEqual({ boxes: 0, owned: [], equipped: {}, dupes: 0 });
    const r = await ward({ id: '1001', action: 'open' });
    expect([r.status, r.body.error]).toEqual([409, 'no_box']);
    expect((await ward({ id: 'x' })).status).toBe(400);
    expect((await ward({ id: '1001', action: 'grant' })).status).toBe(400);   // no way to ask for boxes
  });

  it('a box counts once its run verifies, the server rolls it, and it opens only once', async () => {
    const f = found!;
    expect(f).not.toBeNull();
    const s = await startOn('1001', f.seed);
    expect((await ward({ id: '1001' })).body.boxes).toBe(0);              // picked up mid-run: nothing until the run is sent
    vi.setSystemTime(Date.now() + f.ticks * STEP * 1000 + 500);
    const done = await finish(store, { id: '1001', run: s.run, token: s.token, ticks: f.ticks, inputs: f.inputs });
    expect(done.status).toBe(200);
    expect((await ward({ id: '1001' })).body.boxes).toBe(1);
    expect((await ward({ id: '1002' })).body.boxes).toBe(0);              // someone else's box isn't yours

    // sending the same run again doesn't add another box
    await finish(store, { id: '1001', run: s.run, token: s.token, ticks: f.ticks, inputs: f.inputs });
    expect((await ward({ id: '1001' })).body.boxes).toBe(1);

    const random = vi.spyOn(Math, 'random');
    const opened = await ward({ id: '1001', action: 'open' });
    expect(opened.status).toBe(200);
    expect(random).not.toHaveBeenCalled();
    expect(opened.body.items).toHaveLength(1);
    const [first] = opened.body.items;
    expect(CATALOG.some(c => c.id === first.id)).toBe(true);
    expect(opened.body).toMatchObject({ boxes: 0, owned: [first.id], dupes: 0, items: [{ id: first.id, dupe: false, free: false }] });
    expect((await ward({ id: '1001', action: 'open' })).body.error).toBe('no_box');
  });

  it('two opens of the same box at once give one item', async () => {
    await store.grantBoxes(['1001'], 1);
    const [a, b] = await Promise.all([ward({ id: '1001', action: 'open' }), ward({ id: '1001', action: 'open' })]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    expect((await ward({ id: '1001' })).body.owned).toHaveLength(1);
  });

  it('wears only what was won', async () => {
    await store.grantBoxes(['1001'], 1);
    const [won] = (await ward({ id: '1001', action: 'open' })).body.items;
    const item = CATALOG.find(c => c.id === won.id)!;
    const other = CATALOG.find(c => c.slot === item.slot && c.id !== item.id)!;
    expect((await ward({ id: '1001', action: 'equip', slot: item.slot, item: other.id })).status).toBe(400);
    expect((await ward({ id: '1001', action: 'equip', slot: 'cape', item: item.id })).status).toBe(400);
    expect((await ward({ id: '1001', action: 'equip', slot: item.slot, item: item.id })).body.equipped).toEqual({ [item.slot]: item.id });
    expect((await ward({ id: '1001' })).body.equipped).toEqual({ [item.slot]: item.id });
    expect((await ward({ id: '1001', action: 'equip', slot: item.slot, item: null })).body.equipped).toEqual({});
  });

  it('admin hands boxes to a list of players or to everyone, and only with the key', async () => {
    process.env.ADMIN_KEY = 'secret';
    await start(store, { id: '1001' }, 'test'); await start(store, { id: '1002' }, 'test'); await start(store, { id: '1003' }, 'test');
    const grant = async (b: Body, key = 'secret') => (await admin(store, { key, action: 'grant', ...b })) as { status: number; body: Body };
    const boxes = async (id: string) => (await ward({ id })).body.boxes;

    expect((await grant({ ids: '1001', n: 2 }, 'wrong')).status).toBe(401);
    expect((await grant({ ids: '1001', n: 0 })).status).toBe(400);
    expect((await grant({ ids: '1001', n: 101 })).status).toBe(400);
    expect((await grant({ ids: '', n: 1 })).status).toBe(400);
    expect((await grant({ ids: '1001, x', n: 1 })).body).toEqual({ error: 'ids', bad: ['X'] });   // nothing is given when any id is wrong
    expect(await boxes('1001')).toBe(0);

    const some = await grant({ ids: '1001, 1002\n1001  2009', n: 2 });
    expect(some.body).toEqual({ n: 2, granted: 3, unknown: ['2009'] });     // duplicates once; an id that never played still gets them
    expect([await boxes('1001'), await boxes('1002'), await boxes('1003'), await boxes('2009')]).toEqual([2, 2, 0, 2]);

    expect((await grant({ all: true, n: 1 })).body.granted).toBe(3);         // everyone who has played; 2009 never has
    expect([await boxes('1001'), await boxes('1003')]).toEqual([3, 1]);

    process.env.ALLOWED_IDS = '1001';
    expect((await grant({ ids: ['1002'], n: 1 })).body.bad).toEqual(['1002']);
  });

  it('opens up to ten at once, fewer when fewer are left; duplicates fill the meter and pay out free boxes', async () => {
    await store.grantBoxes(['1001'], 13);
    expect((await ward({ id: '1001', action: 'open', n: 11 })).status).toBe(400);
    expect((await ward({ id: '1001', action: 'open', n: 0 })).status).toBe(400);
    const ten = (await ward({ id: '1001', action: 'open', n: 10 })).body;
    const free = (b: Body) => (b.items as Body[]).filter(i => i.free).length;
    expect(ten.items).toHaveLength(10);
    expect(ten.boxes).toBe(3 + free(ten));
    const all: Body[] = [...ten.items];
    for (let left = ten.boxes; left > 0;) {
      const more = (await ward({ id: '1001', action: 'open', n: 10 })).body;
      all.push(...more.items); left = more.boxes;
    }
    expect((await ward({ id: '1001', action: 'open', n: 10 })).body.error).toBe('no_box');
    const end = (await ward({ id: '1001' })).body, dupes = all.filter(i => i.dupe).length;
    expect(all.length).toBe(13 + all.filter(i => i.free).length);              // every box, free ones included, was opened
    expect(end.owned).toEqual([...new Set(all.filter(i => !i.dupe).map(i => i.id))]);
    expect(end.dupes).toBe(dupes % 5);
  });

  it('a player who owns everything keeps opening: every box is a duplicate, and 5 of them give a free box', async () => {
    await store.grantBoxes(['1001'], CATALOG.length + 10);
    for (let left = 1; left > 0;) left = (await ward({ id: '1001', action: 'open', n: 10 })).body.boxes;   // opens until none are left
    const w = (await ward({ id: '1001' })).body;
    expect(w.boxes).toBe(0);
    expect(w.owned.length).toBeLessThanOrEqual(CATALOG.length);
  });

  it('admin sees each player: plays, best score, farthest run and chests', async () => {
    process.env.ADMIN_KEY = 'secret';
    const f = found!;
    const s = await startOn('1001', f.seed);
    vi.setSystemTime(Date.now() + f.ticks * STEP * 1000 + 500);
    const score = ((await finish(store, { id: '1001', run: s.run, token: s.token, ticks: f.ticks, inputs: f.inputs })).body as Body).score;
    await start(store, { id: '1001' }, 'test');                                  // a second run, never sent
    await start(store, { id: '1002' }, 'test');
    await admin(store, { key: 'secret', action: 'grant', ids: '1001', n: 2 });
    await ward({ id: '1001', action: 'open' });

    expect((await admin(store, { key: 'wrong', action: 'players' })).status).toBe(401);
    const players = ((await admin(store, { key: 'secret', action: 'players' })).body as Body).players as Body[];
    const one = players.find(p => p.id === '1001')!, two = players.find(p => p.id === '1002')!;
    expect(one).toMatchObject({ plays: 2, best: score, loot: 1, granted: 2, opened: 1, free: 0, hidden: false });
    expect(one.maxDist).toBeGreaterThan(LOOT_GAP);                                 // the run went past the first chest checkpoint
    expect(two).toMatchObject({ plays: 1, best: null, maxDist: null, loot: 0, granted: 0, free: 0, opened: 0 });
  });
});
