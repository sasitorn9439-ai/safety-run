import postgres from 'postgres';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createPostgresStore } from '../server/postgres-store.js';
import { FIRST_SEASON_START, seasonStartingAt } from '../shared/seasons.js';
import { settlePastSeasons } from '../server/seasons.js';

// Needs a throwaway database: TEST_POSTGRES_URL=postgres://... npm test (it drops the safety_run_* tables)
const url = process.env.TEST_POSTGRES_URL;
const gate = url ? describe : describe.skip;

gate('postgres init', () => {
  const sql = postgres(url || 'postgres://unused', { ssl: 'require', max: 6, onnotice: () => {} });
  const blockedFor = (p: Promise<unknown>, ms: number) => Promise.race([p.then(() => false), new Promise<boolean>(r => setTimeout(() => r(true), ms))]);
  const hasHidden = async () => (await sql`select 1 from pg_attribute where attrelid = to_regclass('safety_run_players') and attname = 'hidden' and not attisdropped`).length === 1;

  beforeEach(async () => {
    await sql`drop table if exists safety_run_runs, safety_run_players cascade`;
    await sql`drop sequence if exists safety_run_avatar_seq`;
  });
  afterAll(() => sql.end());

  it('builds the schema once when several cold starts race on an empty database', async () => {
    const results = await Promise.allSettled(Array.from({ length: 6 }, () => createPostgresStore(url!).init()));
    expect(results.map(r => r.status)).toEqual(Array(6).fill('fulfilled'));
    expect(await hasHidden()).toBe(true);
  });

  it('does not queue behind a running query once the schema is current', async () => {
    await createPostgresStore(url!).init();
    const busy = await sql.reserve();
    await busy`begin`;
    await busy`select 1 from safety_run_runs limit 1`;
    try {
      expect(await blockedFor(createPostgresStore(url!).init(), 1500)).toBe(false);
      expect(await blockedFor(sql`select count(*) from safety_run_runs`, 1500)).toBe(false);
    } finally { await busy`commit`; busy.release(); }
  });

  it('adds a missing column to an older schema', async () => {
    await createPostgresStore(url!).init();
    await sql`alter table safety_run_players drop column hidden`;
    await createPostgresStore(url!).init();
    expect(await hasHidden()).toBe(true);
  });

  it('gives up on a blocked migration instead of freezing the table, then succeeds on retry', async () => {
    await createPostgresStore(url!).init();
    await sql`alter table safety_run_players drop column hidden`;
    const busy = await sql.reserve();
    await busy`begin`;
    await busy`select 1 from safety_run_players limit 1`;
    const store = createPostgresStore(url!);
    await expect(store.init()).rejects.toThrow(/lock timeout/);
    await busy`commit`; busy.release();
    await store.init();
    expect(await hasHidden()).toBe(true);
  }, 15000);

  it('ranks verified weekly scores and grants prizes once across concurrent requests', async () => {
    const store = createPostgresStore(url!), other = createPostgresStore(url!);
    await store.init();
    await other.init();
    await sql`truncate safety_run_box_grants, safety_run_settled_seasons`;
    const first = seasonStartingAt(FIRST_SEASON_START), second = seasonStartingAt(+first.end);
    await sql`insert into safety_run_players (emp_id, hidden) values
      ('1001', false), ('1002', false), ('1003', false), ('1004', false), ('1005', true)`;
    await sql`insert into safety_run_runs (emp_id, run_no, name, token_hash, game_seed, score, finished_at) values
      ('1001', 1, '', '', 1, 999, ${new Date(+first.start - 1)}),
      ('1001', 2, '', '', 1, 200, ${first.start}),
      ('1001', 3, '', '', 1, 100, ${first.start}),
      ('1002', 1, '', '', 1, 200, ${first.start}),
      ('1003', 1, '', '', 1, 150, ${first.start}),
      ('1004', 1, '', '', 1, 125, ${first.start}),
      ('1004', 2, '', '', null, 999, ${first.start}),
      ('1004', 3, '', '', 1, 300, ${first.end}),
      ('1005', 1, '', '', 1, 500, ${first.start})`;
    const board = await store.leaderboard('1002', first);
    expect(board.top.map(r => [r.empId, r.score])).toEqual([['1001', 200], ['1002', 200], ['1003', 150], ['1004', 125]]);
    expect([board.rank, board.best, board.total]).toEqual([2, 200, 4]);
    expect((await store.leaderboard('', second)).top.map(r => r.empId)).toEqual(['1004']);

    await Promise.all([settlePastSeasons(store, second), settlePastSeasons(other, second)]);
    await settlePastSeasons(other, second);
    const prizes = await sql`select emp_id, n, season_start from safety_run_box_grants order by n desc`;
    expect(prizes.map(r => [r.emp_id, r.n, r.season_start])).toEqual([
      ['1001', 50, first.start], ['1002', 25, first.start], ['1003', 10, first.start],
    ]);
    expect((await store.wardrobe('1001')).earned).toBe(50);
  });
});
