import postgres from 'postgres';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createPostgresStore } from '../server/postgres-store.js';

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
});
