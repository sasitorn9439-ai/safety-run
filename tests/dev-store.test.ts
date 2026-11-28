import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { leaderboard, wardrobe } from '../server/handlers.js';
import { createMemoryStore } from '../server/memory-store.js';
import { cosmetic } from '../src/cosmetics/wardrobe.js';
import { FIRST_SEASON_START, seasonStartingAt } from '../shared/seasons.js';

type Body = Record<string, any>;
const dirs: string[] = [];
afterEach(() => {
  vi.useRealTimers();
  for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

describe('dev store', () => {
  it('keeps opened chests and worn items across a restart', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sr-dev-')); dirs.push(dir);
    const file = path.join(dir, 'nested', 'store.json');

    const before = createMemoryStore(file);
    await before.avatarOf('1001');
    await before.grantBoxes(['1001'], 3);
    const opened = (await wardrobe(before, { id: '1001', action: 'open', n: 2 })).body as Body;
    const item = opened.owned[0] as string, slot = cosmetic(item)!.slot;
    const worn = (await wardrobe(before, { id: '1001', action: 'equip', slot, item })).body as Body;

    const after = createMemoryStore(file);                      // the dev server restarted
    expect((await wardrobe(after, { id: '1001' })).body).toEqual(worn);
    expect(((await wardrobe(after, { id: '1001' })).body as Body).boxes).toBe(1);
    expect(await after.avatarOf('1001')).toBe(0);
    expect(await after.avatarOf('1002')).toBe(1);                // new players still get the next avatar
  });

  it('starts empty when there is no file yet', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sr-dev-')); dirs.push(dir);
    const store = createMemoryStore(path.join(dir, 'store.json'));
    expect((await wardrobe(store, { id: '1001' })).body).toEqual({ boxes: 0, owned: [], equipped: {}, dupes: 0 });
  });

  it('starts a fresh board each Monday and catches up on rewards after a restart', async () => {
    vi.useFakeTimers();
    const first = seasonStartingAt(FIRST_SEASON_START), second = seasonStartingAt(+first.end);
    const third = seasonStartingAt(+second.end), fourth = seasonStartingAt(+third.end);
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sr-dev-')); dirs.push(dir);
    const file = path.join(dir, 'store.json');
    const store = createMemoryStore(file);
    const run = async (id: string, runNo: number) => {
      await store.avatarOf(id);
      return String(await store.createRun({ id, runNo, name: '', tokenHash: '', ua: '', seed: 1 }));
    };
    const score = (id: string, points: number) => store.finishRun(id, { score: points, secs: 1, loot: 0, dist: 1 });

    vi.setSystemTime(+first.start - 1);
    await score(await run('1001', 1), 999);
    const upcoming = await leaderboard(store, '');
    expect(upcoming.body).toMatchObject({ season: { kind: 'upcoming' }, total: 1 });
    expect(upcoming.cache).toBe('no-store');

    vi.setSystemTime(first.start);
    expect((await leaderboard(store, '')).body).toMatchObject({ season: { kind: 'active', number: 1 }, top: [] });
    await score(await run('1001', 2), 200);
    vi.setSystemTime(+first.start + 1);
    await score(await run('1002', 1), 200);
    await score(await run('1003', 1), 100);
    expect((await leaderboard(store, '1002')).body).toMatchObject({ rank: 2, best: 200, total: 3 });

    vi.setSystemTime(+second.start - 1);
    const crossing = await run('1004', 1);
    vi.setSystemTime(second.start);
    await score(crossing, 300);
    expect((await leaderboard(store, '1001')).body).toMatchObject({
      season: { kind: 'active', number: 2 }, rank: 0, best: null, total: 1, top: [{ score: 300 }],
    });
    expect((await wardrobe(store, { id: '1001' })).body).toMatchObject({ boxes: 50 });

    vi.setSystemTime(fourth.start);
    const restarted = createMemoryStore(file);
    expect((await wardrobe(restarted, { id: '1004' })).body).toMatchObject({ boxes: 50 });
    expect((await wardrobe(restarted, { id: '1001' })).body).toMatchObject({ boxes: 50 });
    expect((await wardrobe(restarted, { id: '1002' })).body).toMatchObject({ boxes: 25 });
    expect((await wardrobe(restarted, { id: '1003' })).body).toMatchObject({ boxes: 10 });
    expect(await restarted.lastSettledSeason()).toEqual(third.start);
    expect(await restarted.usage('1001')).toEqual({ used: 2, best: 999 });
  });
});
