import { describe, expect, it, vi } from 'vitest';
import { ANNOUNCE_CUTOFF, admin, finish, start } from '../server/handlers.js';
import { STEP, createRun } from '../shared/sim.js';
import { createMemoryStore } from '../server/memory-store.js';
import { DEV_ID, EARTH_KM, THAILAND_KM, dayHours, factsOf, wantsMoon, winnersOf } from '../src/announce/calc.js';
import type { AdminAnnounce } from '../src/lib/api.js';

const row = (id: string, best: number | null, extra: Partial<AdminAnnounce> = {}): AdminAnnounce => ({
  id, avatar: 1, look: {}, hidden: false, plays: 2, best, bestAt: '2026-12-01T09:00:00Z', dist: 10_000, secs: 600, ...extra,
});

describe('announce facts', () => {
  it('measures Thailand end to end, Betong to Mae Sai', () => {
    expect(THAILAND_KM).toBeGreaterThan(1500);
    expect(THAILAND_KM).toBeLessThan(1800);
  });

  it('leaves the developer out of totals and prizes', () => {
    const rows = [row(DEV_ID, 999_999, { dist: 5_000_000, secs: 99_999 }), row('1001', 500), row('1002', 800)];
    const f = factsOf(rows);
    expect(f.players).toBe(2);
    expect(f.km).toBe(20);
    expect(f.secs).toBe(1200);
    expect(f.winners.map(w => w.id)).toEqual(['1002', '1001']);
  });

  it('ranks by best score, ties to whoever got there first, and skips hidden players', () => {
    const rows = [
      row('1001', 700, { bestAt: '2026-12-01T10:00:00Z' }),
      row('1002', 700, { bestAt: '2026-12-01T09:00:00Z' }),
      row('1003', 900, { hidden: true }),
      row('1004', null),
      row('1005', 100),
    ];
    expect(winnersOf(rows).map(w => [w.rank, w.id])).toEqual([[1, '1002'], [2, '1001'], [3, '1005']]);
  });

  it('keeps hidden players\' metres and minutes in the totals', () => {
    expect(factsOf([row('1001', 5), row('1002', 9, { hidden: true })]).km).toBe(20);
  });

  it('gives at most seven winners', () => {
    const rows = Array.from({ length: 12 }, (_, i) => row(String(1000 + i), 100 + i));
    expect(winnersOf(rows)).toHaveLength(7);
    expect(winnersOf(rows)[0]!.score).toBe(111);
  });

  it('splits seconds into days and hours, and knows when the Moon is in reach', () => {
    expect(dayHours(2 * 86400 + 5 * 3600 + 59)).toEqual({ d: 2, h: 5 });
    expect(wantsMoon({ km: 384_399 })).toBe(false);
    expect(wantsMoon({ km: 384_400 })).toBe(true);
    expect(EARTH_KM).toBe(40_075);
  });
});

describe('admin announce', () => {
  it('needs the key', async () => {
    process.env.ADMIN_KEY = 'secret';
    try {
      expect((await admin(createMemoryStore(), { action: 'announce' })).status).toBe(401);
      const ok = await admin(createMemoryStore(), { key: 'secret', action: 'announce' });
      expect(ok.status).toBe(200);
      expect((ok.body as { players: unknown[] }).players).toEqual([]);
    } finally { delete process.env.ADMIN_KEY; }
  });
});

describe('announce cutoff', () => {
  it('is 27 Nov 2026 08:00 Thailand time', () => {
    expect(ANNOUNCE_CUTOFF.toISOString()).toBe('2026-11-27T01:00:00.000Z');
  });

  it('ignores runs finished at or after the cutoff', async () => {
    vi.useFakeTimers();
    process.env.ADMIN_KEY = 'secret';
    try {
      const store = createMemoryStore();
      // a run that takes its real time and ends where the clock says `end`
      const playUntil = async (id: string, end: string) => {
        const t = new Date(end).getTime();
        const probe = createRun(1); while (!probe.finished) probe.step();
        vi.setSystemTime(t - probe.tick * STEP * 1000 - 600);
        const s = (await start(store, { id }, 't')).body as { seed: number; token: string; run: string };
        const run = createRun(s.seed); while (!run.finished) run.step();
        vi.setSystemTime(t - 600 + run.tick * STEP * 1000 - probe.tick * STEP * 1000 + 600);
        return finish(store, { id, run: s.run, token: s.token, ticks: run.tick, inputs: [] });
      };
      expect((await playUntil('1001', '2026-11-27T00:50:00Z')).status).toBe(200);
      expect((await playUntil('1002', '2026-11-27T01:10:00Z')).status).toBe(200);
      const ids = async (before?: string) => ((await admin(store, { key: 'secret', action: 'announce', ...before && { before } })).body as { players: { id: string }[] }).players.map(p => p.id);
      expect(await ids()).toEqual(['1001']);
      expect((await ids('2026-11-28T00:00:00Z')).sort()).toEqual(['1001', '1002']);
      expect((await admin(store, { key: 'secret', action: 'announce', before: 'nope' })).status).toBe(400);
    } finally { vi.useRealTimers(); delete process.env.ADMIN_KEY; }
  });
});
