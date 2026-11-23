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
  });
  it('normalises the id and hands out run numbers and avatars', async () => {
    const a = (await start(store, { id: ' e m p1 ' }, '')).body as Body;
    const b = (await start(store, { id: 'EMP1' }, '')).body as Body;
    expect(a.runNo).toBe(1);
    expect(b.runNo).toBe(2);
    expect(b.avatar).toBe(a.avatar);
    expect(((await start(store, { id: 'EMP2' }, '')).body as Body).avatar).toBe(a.avatar + 1);
  });
  it('honours MAX_PLAYS', async () => {
    process.env.MAX_PLAYS = '1';
    await start(store, { id: 'EMP1' }, '');
    const r = await start(store, { id: 'EMP1' }, '');
    expect(r.status).toBe(409);
    expect((r.body as Body).error).toBe('used');
  });
  it('honours ALLOWED_IDS', async () => {
    process.env.ALLOWED_IDS = 'AAA111, BBB222';
    expect((await start(store, { id: 'ZZZ999' }, '')).status).toBe(400);
    expect((await start(store, { id: 'aaa111' }, '')).status).toBe(200);
  });
});

describe('finish', () => {
  it('verifies the replay and stores the score once', async () => {
    const { s, ticks, score } = await play('EMP1');
    const body = { id: 'EMP1', run: s.run, token: s.token, ticks, inputs: [] };
    const r = await finish(store, body);
    expect(r.status).toBe(200);
    expect((r.body as Body).score).toBe(score);
    // submitting again is harmless and returns the same score
    const again = await finish(store, body);
    expect((again.body as Body).score).toBe(score);
    expect((again.body as Body).used).toBe(1);
  });
  it('rejects a wrong token', async () => {
    const { s, ticks } = await play('EMP1');
    expect((await finish(store, { id: 'EMP1', run: s.run, token: 'nope', ticks, inputs: [] })).status).toBe(403);
  });
  it('rejects a replay that claims more time than has passed', async () => {
    const s = (await start(store, { id: 'EMP1' }, '')).body as Body;
    const { ticks } = idleRun(s.seed);
    const r = await finish(store, { id: 'EMP1', run: s.run, token: s.token, ticks, inputs: [] });
    expect(r.status).toBe(400);
    expect((r.body as Body).error).toBe('invalid_replay');
  });
  it('rejects a forged score (wrong tick count)', async () => {
    const { s, ticks } = await play('EMP1');
    expect((await finish(store, { id: 'EMP1', run: s.run, token: s.token, ticks: ticks + 600, inputs: [] })).status).toBe(400);
  });
});

describe('leaderboard', () => {
  it('shows avatars, never employee ids, and marks the caller', async () => {
    const { s, ticks } = await play('EMP1');
    await finish(store, { id: 'EMP1', run: s.run, token: s.token, ticks, inputs: [] });
    const r = (await leaderboard(store, 'emp1')).body as Body;
    expect(r.total).toBe(1);
    expect(r.rank).toBe(1);
    expect(r.top[0]).toEqual({ avatar: s.avatar, score: expect.any(Number), me: true });
    expect(JSON.stringify(r)).not.toContain('EMP1');
    expect(((await leaderboard(store, '')).body as Body).top[0].me).toBe(false);
  });
});

describe('admin', () => {
  it('needs the key, exports and resets', async () => {
    process.env.ADMIN_KEY = 'secret';
    expect((await admin(store, { key: 'wrong', action: 'export' })).status).toBe(401);
    expect((await admin(store, { action: 'export' })).status).toBe(401);
    await start(store, { id: 'EMP1' }, '');
    expect(((await admin(store, { key: 'secret', action: 'export' })).body as Body).rows).toHaveLength(1);
    expect(((await admin(store, { key: 'secret', action: 'reset', id: 'emp1' })).body as Body).found).toBe(1);
    expect(((await admin(store, { key: 'secret', action: 'export' })).body as Body).rows).toHaveLength(0);
  });
  it('is closed when no ADMIN_KEY is configured', async () => {
    expect((await admin(store, { key: '', action: 'export' })).status).toBe(401);
  });
});
