import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { admin, finish, leaderboard, start } from '../server/handlers.js';
import { createMemoryStore } from '../server/memory-store.js';
import type { Store } from '../server/store.js';
import { STEP, createRun } from '../shared/sim.js';

type Body = Record<string, any>;

/** A run where the player never touches anything: it ends at the first hazard. */
function idleRun(seed: number) {
  const run = createRun(seed);
  while (!run.finished) run.step();
  return { ticks: run.tick, score: run.score() };
}

let store: Store;
beforeEach(() => { store = createMemoryStore(); vi.useFakeTimers(); vi.setSystemTime(new Date('2026-12-01T09:00:00Z')); });
afterEach(() => { vi.useRealTimers(); delete process.env.MAX_PLAYS; delete process.env.ALLOWED_IDS; delete process.env.ADMIN_KEY; });

async function play(id: string) {
  const s = (await start(store, { id }, 'test')).body as Body;
  const { ticks, score } = idleRun(s.seed);
  vi.setSystemTime(Date.now() + ticks * STEP * 1000 + 500); // a real run takes real time
  return { s, ticks, score };
}

describe('start', () => {
  it('rejects malformed ids', async () => {
    expect((await start(store, { id: 'x' }, '')).status).toBe(400);
    expect((await start(store, { id: 'a b$' }, '')).status).toBe(400);
    expect((await start(store, { id: 'EMP001' }, '')).status).toBe(400);
    expect((await start(store, { id: '123' }, '')).status).toBe(400);
    expect((await start(store, { id: '12345' }, '')).status).toBe(400);
  });
  it('normalises the id and hands out run numbers and avatars', async () => {
    const a = (await start(store, { id: ' 10 01 ' }, '')).body as Body;
    const b = (await start(store, { id: '1001' }, '')).body as Body;
    expect(a.runNo).toBe(1);
    expect(b.runNo).toBe(2);
    expect(b.avatar).toBe(a.avatar);
    expect(((await start(store, { id: '1002' }, '')).body as Body).avatar).toBe(a.avatar + 1);
  });
  it('lets an older all-digit id keep playing, but no new one that is not 4 digits', async () => {
    expect((await start(store, { id: '000' }, '')).status).toBe(400);     // nobody has played as 000: new ids need 4 digits
    await store.avatarOf('000'); await store.avatarOf('AB12');            // played before the 4-digit rule
    expect((await start(store, { id: '000' }, '')).status).toBe(200);
    expect((await start(store, { id: 'AB12' }, '')).status).toBe(400);    // letters stay refused
    expect((await start(store, { id: '00' }, '')).status).toBe(400);
  });
  it('honours MAX_PLAYS', async () => {
    process.env.MAX_PLAYS = '1';
    await start(store, { id: '1001' }, '');
    const r = await start(store, { id: '1001' }, '');
    expect(r.status).toBe(409);
    expect((r.body as Body).error).toBe('used');
  });
  it('honours ALLOWED_IDS', async () => {
    process.env.ALLOWED_IDS = '1111, 2222';
    expect((await start(store, { id: '9999' }, '')).status).toBe(400);
    expect((await start(store, { id: ' 1111' }, '')).status).toBe(200);
  });
});

describe('finish', () => {
  it('verifies the replay and stores the score once', async () => {
    const { s, ticks, score } = await play('1001');
    const body = { id: '1001', run: s.run, token: s.token, ticks, inputs: [] };
    const r = await finish(store, body);
    expect(r.status).toBe(200);
    expect((r.body as Body).score).toBe(score);
    // submitting again is harmless and returns the same score
    const again = await finish(store, body);
    expect((again.body as Body).score).toBe(score);
    expect((again.body as Body).used).toBe(1);
  });
  it('rejects a wrong token', async () => {
    const { s, ticks } = await play('1001');
    expect((await finish(store, { id: '1001', run: s.run, token: 'nope', ticks, inputs: [] })).status).toBe(403);
  });
  it('rejects a replay that claims more time than has passed', async () => {
    const s = (await start(store, { id: '1001' }, '')).body as Body;
    const { ticks } = idleRun(s.seed);
    const r = await finish(store, { id: '1001', run: s.run, token: s.token, ticks, inputs: [] });
    expect(r.status).toBe(400);
    expect((r.body as Body).error).toBe('invalid_replay');
  });
  it('rejects a forged score (wrong tick count)', async () => {
    const { s, ticks } = await play('1001');
    expect((await finish(store, { id: '1001', run: s.run, token: s.token, ticks: ticks + 600, inputs: [] })).status).toBe(400);
  });
});

describe('leaderboard', () => {
  it('shows avatars, never employee ids, and marks the caller', async () => {
    const { s, ticks } = await play('1001');
    await finish(store, { id: '1001', run: s.run, token: s.token, ticks, inputs: [] });
    const r = (await leaderboard(store, ' 1001 ')).body as Body;
    expect(r.total).toBe(1);
    expect(r.rank).toBe(1);
    expect(r.top[0]).toEqual({ avatar: s.avatar, score: expect.any(Number), me: true });
    expect(JSON.stringify(r)).not.toContain('1001');
    expect(((await leaderboard(store, '')).body as Body).top[0].me).toBe(false);
  });
});

describe('admin', () => {
  it('needs the key and exports', async () => {
    process.env.ADMIN_KEY = 'secret';
    expect((await admin(store, { key: 'wrong', action: 'export' })).status).toBe(401);
    expect((await admin(store, { action: 'export' })).status).toBe(401);
    await start(store, { id: '1001' }, '');
    expect(((await admin(store, { key: 'secret', action: 'export' })).body as Body).rows).toHaveLength(1);
  });
  it('has no way to delete results', async () => {
    process.env.ADMIN_KEY = 'secret';
    await start(store, { id: '1001' }, '');
    const r = await admin(store, { key: 'secret', action: 'reset', id: ' 1001 ' });
    expect(r.status).toBe(400);
    expect((r.body as Body).error).toBe('action');
    expect(((await admin(store, { key: 'secret', action: 'export' })).body as Body).rows).toHaveLength(1);
  });
  it('lists every run, newest first, finished or not', async () => {
    process.env.ADMIN_KEY = 'secret';
    expect((await admin(store, { key: 'wrong', action: 'runs' })).status).toBe(401);
    const { s, ticks, score } = await play('1001');
    await finish(store, { id: '1001', run: s.run, token: s.token, ticks, inputs: [] });
    const later = (await start(store, { id: '1002' }, '')).body as Body;
    await admin(store, { key: 'secret', action: 'hide', id: '1002', hidden: true });

    const runs = ((await admin(store, { key: 'secret', action: 'runs' })).body as Body).runs as Body[];
    expect(runs).toEqual([
      { id: '1002', avatar: later.avatar, runNo: 1, startedAt: new Date().toISOString(), finishedAt: null, secs: null, score: null, legacy: false, hidden: true },
      { id: '1001', avatar: s.avatar, runNo: 1, startedAt: '2026-12-01T09:00:00.000Z', finishedAt: new Date().toISOString(), secs: Math.round(ticks * STEP), score, legacy: false, hidden: false },
    ]);
  });
  it('hides a player from the leaderboard without deleting anything, and shows them again', async () => {
    process.env.ADMIN_KEY = 'secret';
    const hide = (id: string, hidden?: unknown, key = 'secret') => admin(store, { key, action: 'hide', id, hidden });
    for (const id of ['1001', '1002']) {
      const { s, ticks } = await play(id);
      await finish(store, { id, run: s.run, token: s.token, ticks, inputs: [] });
    }
    const board = async (id = '') => (await leaderboard(store, id)).body as Body;
    expect((await board('1001')).total).toBe(2);
    expect((await board('1001')).rank).toBeGreaterThan(0);

    expect((await hide(' 1001 ', true)).status).toBe(200);
    expect((await board('1001')).total).toBe(1);
    expect((await board('1001')).rank).toBe(0);
    expect((await board()).top).toHaveLength(1);
    const row = (((await admin(store, { key: 'secret', action: 'export' })).body as Body).rows as Body[]).find(r => r.id === '1001')!;
    expect(row.hidden).toBe(true);
    expect(row.best).not.toBeNull(); // the score is still stored

    expect((await hide('1001', false)).status).toBe(200);
    expect((await board('1001')).total).toBe(2);
    expect((await board('1001')).rank).toBeGreaterThan(0);
  });
  it('validates the hide request', async () => {
    process.env.ADMIN_KEY = 'secret';
    await start(store, { id: '1001' }, '');
    expect((await admin(store, { key: 'nope', action: 'hide', id: '1001', hidden: true })).status).toBe(401);
    expect((await admin(store, { key: 'secret', action: 'hide', id: '1001' })).status).toBe(400);
    expect((await admin(store, { key: 'secret', action: 'hide', id: '1001', hidden: 'yes' })).status).toBe(400);
    expect((await admin(store, { key: 'secret', action: 'hide', id: '', hidden: true })).status).toBe(400);
    expect(((await admin(store, { key: 'secret', action: 'hide', id: 'NOBODY', hidden: true })).body as Body).found).toBe(0);
  });
  it('is closed when no ADMIN_KEY is configured', async () => {
    expect((await admin(store, { key: '', action: 'export' })).status).toBe(401);
  });
});
