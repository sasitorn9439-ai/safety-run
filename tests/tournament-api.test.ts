import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createMemoryStore } from '../server/memory-store.js';
import { createMemoryTourStore } from '../server/tour-store.js';
import { COUNTDOWN_MS, RESULT_GRACE_MS, tournament } from '../server/tournament.js';
import { STEP, createRun } from '../shared/sim.js';

type Body = Record<string, any>;
let call: (b: Body, now?: number) => Promise<{ status: number; body: Body }>;
const T0 = Date.UTC(2026, 11, 1, 9);

beforeEach(() => {
  process.env.ADMIN_KEY = 'k';
  const store = createMemoryStore(), tours = createMemoryTourStore();
  call = async (b, now = T0) => (await tournament(store, tours, b, now)) as never;
});
afterEach(() => { delete process.env.ADMIN_KEY; });

async function room() {
  const r = await call({ action: 'create', key: 'k' });
  expect(r.status).toBe(200);
  return r.body as { code: string; hostToken: string };
}

/** a player who never presses anything: the race still has a score */
function idle(seed: number, stage: string, duration: number) {
  const run = createRun(seed, undefined, undefined, { tour: { stage: stage as never, durationTicks: Math.round(duration / STEP) } });
  while (!run.finished) run.step();
  return run.score();
}

describe('tournament rooms', () => {
  it('needs the admin key to open a room', async () => {
    expect((await call({ action: 'create', key: 'nope' })).status).toBe(401);
    const { code } = await room();
    expect(code).toMatch(/^[A-Z0-9]{4}$/);
  });

  it('seats three players, and the same employee again in their own seat', async () => {
    const { code } = await room();
    const seats = [];
    for (const id of ['E001', 'E002', 'E003']) seats.push((await call({ action: 'join', code, id })).body.slot);
    expect(seats).toEqual([0, 1, 2]);
    expect((await call({ action: 'join', code, id: 'E004' })).body.error).toBe('full');
    expect((await call({ action: 'join', code, id: 'e002' })).body.slot).toBe(1);
    expect((await call({ action: 'join', code: 'ZZZZ', id: 'E005' })).status).toBe(404);
  });

  it('lets only the host configure, kick and start', async () => {
    const { code, hostToken } = await room();
    await call({ action: 'join', code, id: 'E001' });
    expect((await call({ action: 'config', code, stage: 'chemical', duration: 60 })).status).toBe(403);
    expect((await call({ action: 'config', code, hostToken, stage: 'moon', duration: 60 })).status).toBe(400);
    expect((await call({ action: 'config', code, hostToken, stage: 'chemical', duration: 61 })).status).toBe(400);
    const cfg = await call({ action: 'config', code, hostToken, stage: 'chemical', duration: 60 });
    expect(cfg.body).toMatchObject({ stage: 'chemical', duration: 60, phase: 'lobby', seed: null });
    const s = await call({ action: 'start', code, hostToken });
    expect(s.body).toMatchObject({ phase: 'running', startAt: T0 + COUNTDOWN_MS });
    expect(typeof s.body.seed).toBe('number');
    expect((await call({ action: 'join', code, id: 'E009' })).body.error).toBe('started');
  });

  it('scores a race from its replay, once the race has had time to run', async () => {
    const { code, hostToken } = await room();
    const a = (await call({ action: 'join', code, id: 'E001' })).body, b = (await call({ action: 'join', code, id: 'E002' })).body;
    await call({ action: 'config', code, hostToken, stage: 'tour', duration: 60 });
    const { seed, startAt } = (await call({ action: 'start', code, hostToken })).body;
    const end = startAt + 60_000;

    expect((await call({ action: 'finish', code, slot: 0, token: a.token, inputs: [] }, end - 5000)).body.error).toBe('too_early');
    expect((await call({ action: 'finish', code, slot: 0, token: b.token, inputs: [] }, end)).status).toBe(403);
    expect((await call({ action: 'finish', code, slot: 0, token: a.token, inputs: [[999999, 'left']] }, end)).body.error).toBe('invalid_replay');

    const first = await call({ action: 'finish', code, slot: 0, token: a.token, inputs: [] }, end);
    expect(first.body.players[0].score).toBe(idle(seed, 'tour', 60));
    expect(first.body.phase).toBe('running');           // still waiting for the second player
    const both = await call({ action: 'finish', code, slot: 1, token: b.token, inputs: [] }, end + 1000);
    expect(both.body.phase).toBe('finished');
  });

  it('closes a race whose results never all came in', async () => {
    const { code, hostToken } = await room();
    await call({ action: 'join', code, id: 'E001' });
    const { startAt } = (await call({ action: 'start', code, hostToken })).body;
    const later = startAt + 120_000 + RESULT_GRACE_MS + 1;
    expect((await call({ action: 'state', code }, later)).body.phase).toBe('finished');
  });

  it('a rematch keeps the players and deals a new track', async () => {
    const { code, hostToken } = await room();
    await call({ action: 'join', code, id: 'E001' });
    const first = (await call({ action: 'start', code, hostToken })).body.seed;
    const again = await call({ action: 'reset', code, hostToken });
    expect(again.body).toMatchObject({ phase: 'lobby', startAt: null, players: [{ slot: 0, score: null }] });
    const second = (await call({ action: 'start', code, hostToken })).body.seed;
    expect(second).not.toBe(first);
  });
});
