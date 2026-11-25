import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createMemoryStore } from '../server/memory-store.js';
import { createMemoryTourStore } from '../server/tour-store.js';
import { COUNTDOWN_MS, RESULT_GRACE_MS, STAGES, tournament } from '../server/tournament.js';
import { STEP, TOUR_DURATION, createRun } from '../shared/sim.js';
import { CATALOG } from '../src/cosmetics/wardrobe.js';

type Body = Record<string, any>;
let call: (b: Body, now?: number) => Promise<{ status: number; body: Body }>;
let store: ReturnType<typeof createMemoryStore>;
const T0 = Date.UTC(2026, 11, 1, 9);

beforeEach(() => {
  process.env.ADMIN_KEY = 'k';
  store = createMemoryStore();
  const tours = createMemoryTourStore();
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

  it('seats eight players, and the same employee again in their own seat', async () => {
    const { code } = await room();
    const seats = [];
    for (const id of ['2001', '2002', '2003', '2004', '2005', '2006', '2007', '2008']) seats.push((await call({ action: 'join', code, id })).body.slot);
    expect(seats).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect((await call({ action: 'join', code, id: '2009' })).body.error).toBe('full');
    expect((await call({ action: 'join', code, id: ' 2002 ' })).body.slot).toBe(1);
    expect((await call({ action: 'join', code: 'ZZZZ', id: '2010' })).status).toBe(404);
  });

  it('shows what each player wears, as of their latest join, and only what they own', async () => {
    const { code } = await room();
    const hat = CATALOG.find(c => c.slot === 'hat')!.id, skin = CATALOG.find(c => c.slot === 'skin')!.id;
    await store.avatarOf('2001');
    await store.addCosmetic('2001', 1, hat, false);
    await store.setEquipped('2001', { hat, skin });          // the skin isn't theirs
    await call({ action: 'join', code, id: '2001' });
    await call({ action: 'join', code, id: '2002' });
    const players = (await call({ action: 'state', code })).body.players;
    expect(players.map((p: Body) => p.look)).toEqual([{ hat }, {}]);
    await store.setEquipped('2001', {});
    await call({ action: 'join', code, id: '2001' });
    expect((await call({ action: 'state', code })).body.players[0].look).toEqual({});
  });

  it('lets only the host start, and no one picks the stage or the time', async () => {
    const { code, hostToken } = await room();
    await call({ action: 'join', code, id: '2001' });
    expect((await call({ action: 'start', code })).status).toBe(403);
    expect((await call({ action: 'config', code, hostToken, stage: 'chemical', duration: 60 })).status).toBe(400);
    const s = await call({ action: 'start', code, hostToken });
    expect(s.body).toMatchObject({ phase: 'running', startAt: T0 + COUNTDOWN_MS, duration: TOUR_DURATION });
    expect(STAGES).toContain(s.body.stage);
    expect(typeof s.body.seed).toBe('number');
    expect((await call({ action: 'join', code, id: '2009' })).body.error).toBe('started');
  });

  it('scores a race from its replay, once the race has had time to run', async () => {
    const { code, hostToken } = await room();
    const a = (await call({ action: 'join', code, id: '2001' })).body, b = (await call({ action: 'join', code, id: '2002' })).body;
    const { seed, startAt, stage } = (await call({ action: 'start', code, hostToken })).body;
    const end = startAt + TOUR_DURATION * 1000;

    expect((await call({ action: 'finish', code, slot: 0, token: a.token, inputs: [] }, end - 5000)).body.error).toBe('too_early');
    expect((await call({ action: 'finish', code, slot: 0, token: b.token, inputs: [] }, end)).status).toBe(403);
    expect((await call({ action: 'finish', code, slot: 0, token: a.token, inputs: [[999999, 'left']] }, end)).body.error).toBe('invalid_replay');

    const first = await call({ action: 'finish', code, slot: 0, token: a.token, inputs: [] }, end);
    expect(first.body.players[0].score).toBe(idle(seed, stage, TOUR_DURATION));
    expect(first.body.phase).toBe('running');           // still waiting for the second player
    const both = await call({ action: 'finish', code, slot: 1, token: b.token, inputs: [] }, end + 1000);
    expect(both.body.phase).toBe('finished');
  });

  it('closes a race whose results never all came in', async () => {
    const { code, hostToken } = await room();
    await call({ action: 'join', code, id: '2001' });
    const { startAt } = (await call({ action: 'start', code, hostToken })).body;
    const later = startAt + TOUR_DURATION * 1000 + RESULT_GRACE_MS + 1;
    expect((await call({ action: 'state', code }, later)).body.phase).toBe('finished');
  });

  it('a rematch keeps the players and deals a new track', async () => {
    const { code, hostToken } = await room();
    await call({ action: 'join', code, id: '2001' });
    const first = (await call({ action: 'start', code, hostToken })).body.seed;
    const again = await call({ action: 'reset', code, hostToken });
    expect(again.body).toMatchObject({ phase: 'lobby', startAt: null, players: [{ slot: 0, score: null }] });
    const second = (await call({ action: 'start', code, hostToken })).body.seed;
    expect(second).not.toBe(first);
  });

  it('draws the stage at random for each race', async () => {
    const { code, hostToken } = await room();
    await call({ action: 'join', code, id: '2001' });
    const seen = new Set<string>();
    for (let i = 0; i < 40; i++) {
      seen.add((await call({ action: 'start', code, hostToken })).body.stage);
      await call({ action: 'reset', code, hostToken });
    }
    expect(seen.size).toBeGreaterThan(1);
  });
});

describe('realtime tokens', () => {
  afterEach(() => { delete process.env.ABLY_API_KEY; });

  it('signs a token for the host and for a seated player, each only for its own way on its own room', async () => {
    process.env.ABLY_API_KEY = 'appId.keyId:secret';
    const { code, hostToken } = await room();
    const { slot, token } = (await call({ action: 'join', code, id: '2001' })).body;
    const caps = async (b: Body) => {
      const r = await call({ action: 'realtime', code, ...b });
      expect(r.status).toBe(200);
      expect(r.body.tokenRequest.keyName).toBe('appId.keyId');
      expect(JSON.stringify(r.body)).not.toContain('secret');
      return JSON.parse(r.body.tokenRequest.capability);
    };
    const up = `safety-run-tour:${code}-up`, down = `safety-run-tour:${code}-down`;
    expect(await caps({ hostToken })).toEqual({ [up]: ['subscribe'], [down]: ['publish'] });
    expect(await caps({ slot, token })).toEqual({ [up]: ['publish', 'subscribe'], [down]: ['subscribe'] });
  });

  it('gives a player the same client id in every room, without their employee id', async () => {
    process.env.ABLY_API_KEY = 'appId.keyId:secret';
    const clientIdIn = async () => {
      const { code } = await room();
      const { slot, token } = (await call({ action: 'join', code, id: '2001' })).body;
      return (await call({ action: 'realtime', code, slot, token })).body.tokenRequest.clientId as string;
    };
    const first = await clientIdIn();
    expect(first).toMatch(/^emp-[0-9a-f]{16}$/);
    expect(first).not.toContain('2001');
    expect(await clientIdIn()).toBe(first);
  });

  it('refuses anyone without a seat, and says so when realtime is not set up', async () => {
    const { code } = await room();
    const { slot } = (await call({ action: 'join', code, id: '2001' })).body;
    expect((await call({ action: 'realtime', code, slot, token: 'x' })).body.error).toBe('realtime');
    process.env.ABLY_API_KEY = 'appId.keyId:secret';
    expect((await call({ action: 'realtime', code, slot, token: 'x' })).status).toBe(403);
    expect((await call({ action: 'realtime', code, slot: 1, token: 'x' })).status).toBe(403);
    expect((await call({ action: 'realtime', code })).status).toBe(403);
  });
});
