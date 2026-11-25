import postgres from 'postgres';
import type { Store } from './store.js';

export function createPostgresStore(url: string): Store {
  const sql = postgres(url, { ssl: 'require', prepare: false, max: 1, idle_timeout: 5, connect_timeout: 10 });

  // best run per employee, hidden players excluded; ties go to whoever reached that score first
  const best = () => sql`
    select distinct on (emp_id) emp_id, name, score, finished_at
    from safety_run_runs r where score is not null and game_seed is not null
      and not exists (select 1 from safety_run_players p where p.emp_id = r.emp_id and p.hidden)
    order by emp_id, score desc, finished_at asc`;

  // Every `alter table` takes an ACCESS EXCLUSIVE lock, even when it ends up skipping. Run on every cold start,
  // that lock queues behind any in-flight query and every request after it queues behind the lock.
  // A plain catalog read takes no lock, so the DDL only runs when the schema is actually behind.
  const migrated = (q: postgres.Sql | postgres.TransactionSql) => q`
    select exists (select 1 from pg_attribute where attrelid = to_regclass('safety_run_players') and attname = 'hidden' and not attisdropped)
       and exists (select 1 from pg_attribute where attrelid = to_regclass('safety_run_runs') and attname = 'game_seed' and not attisdropped)
       and exists (select 1 from pg_attribute where attrelid = to_regclass('safety_run_runs') and attname = 'loot' and not attisdropped)
       and exists (select 1 from pg_attribute where attrelid = to_regclass('safety_run_players') and attname = 'equipped' and not attisdropped)
       and to_regclass('safety_run_cosmetics') is not null
       and to_regclass('safety_run_box_grants') is not null
       and exists (select 1 from pg_attribute where attrelid = to_regclass('safety_run_runs') and attname = 'dist' and not attisdropped)
       and exists (select 1 from pg_attribute where attrelid = to_regclass('safety_run_cosmetics') and attname = 'dupe' and not attisdropped) as ok`
    .then(([r]) => !!r?.ok);

  let ready: Promise<void> | null = null;
  return {
    init() {
      ready ||= (async () => {
        if (await migrated(sql)) return;
        await sql.begin(async tx => {
          // fail fast instead of freezing the table for everyone; the next request retries
          await tx`set local lock_timeout = '5s'`;
          // one instance migrates, the rest wait here and then see it done (xact-scoped: safe behind a pooler)
          await tx`select pg_advisory_xact_lock(hashtext('safety_run_migrate'))`;
          if (await migrated(tx)) return;
          // one row per run; (emp_id, run_no) unique + run_no limit = hard cap on plays per employee
          await tx`create table if not exists safety_run_runs (
            id bigserial primary key,
            emp_id text not null,
            run_no smallint not null check (run_no >= 1),
            name text not null,
            token_hash text not null,
            started_at timestamptz not null default now(),
            score integer,
            secs integer,
            capped boolean not null default false,
            finished_at timestamptz,
            ua text,
            unique (emp_id, run_no))`;
          await tx`alter table safety_run_runs add column if not exists game_seed bigint`;
          await tx`alter table safety_run_runs drop constraint if exists safety_run_runs_run_no_check`;
          // one avatar per employee, never reused: the sequence hands out each number once
          await tx`create sequence if not exists safety_run_avatar_seq minvalue 0 start 0`;
          await tx`create table if not exists safety_run_players (
            emp_id text primary key,
            avatar integer not null unique default nextval('safety_run_avatar_seq'),
            created_at timestamptz not null default now())`;
          // admin can hide a player's scores from the leaderboard without deleting anything
          await tx`alter table safety_run_players add column if not exists hidden boolean not null default false`;
          // loot boxes are counted from verified replays only, so the only way to earn one is to pick it up on a run
          await tx`alter table safety_run_runs add column if not exists loot smallint not null default 0`;
          // metres run, from the verified replay (null for runs finished before it was recorded)
          await tx`alter table safety_run_runs add column if not exists dist integer`;
          await tx`alter table safety_run_players add column if not exists equipped jsonb not null default '{}'::jsonb`;
          // one row per opened box: (emp_id, box_no) unique stops two devices opening the same box. A box can repeat an item
          // the player has (dupe); every 5 duplicates make a free box.
          await tx`create table if not exists safety_run_cosmetics (
            emp_id text not null,
            box_no integer not null check (box_no >= 1),
            item text not null,
            opened_at timestamptz not null default now(),
            primary key (emp_id, box_no))`;
          // tables made before duplicates existed allowed each item once
          await tx`alter table safety_run_cosmetics drop constraint if exists safety_run_cosmetics_emp_id_item_key`;
          await tx`alter table safety_run_cosmetics add column if not exists dupe boolean not null default false`;
          await tx`alter table safety_run_cosmetics enable row level security`;
          // boxes an admin handed out, one row per player per grant, so every grant can be traced
          await tx`create table if not exists safety_run_box_grants (
            id bigserial primary key,
            emp_id text not null,
            n smallint not null check (n >= 1),
            granted_at timestamptz not null default now())`;
          await tx`create index if not exists safety_run_box_grants_emp on safety_run_box_grants (emp_id)`;
          await tx`alter table safety_run_box_grants enable row level security`;
          // block the public anon/publishable keys; server connects as table owner
          await tx`alter table safety_run_runs enable row level security`;
          await tx`alter table safety_run_players enable row level security`;
          // players who started before avatars existed get theirs now
          await tx`insert into safety_run_players (emp_id) select distinct emp_id from safety_run_runs order by emp_id on conflict (emp_id) do nothing`;
        });
      })().catch(e => { ready = null; throw e; });
      return ready;
    },

    async known(id) {
      const [r] = await sql`select exists (select 1 from safety_run_players where emp_id = ${id})
        or exists (select 1 from safety_run_runs where emp_id = ${id}) as known`;
      return !!r?.known;
    },
    async avatarOf(id) {
      const [have] = await sql`select avatar from safety_run_players where emp_id = ${id}`;
      if (have) return have.avatar as number;
      await sql`insert into safety_run_players (emp_id) values (${id}) on conflict (emp_id) do nothing`;
      const [p] = await sql`select avatar from safety_run_players where emp_id = ${id}`;
      return p!.avatar as number;
    },

    async usage(id) {
      const [s] = await sql`select count(*)::int as used, max(score) filter (where game_seed is not null) as best from safety_run_runs where emp_id = ${id}`;
      return { used: s!.used, best: s!.best };
    },

    async createRun(r) {
      const rows = await sql`insert into safety_run_runs (emp_id, run_no, name, token_hash, ua, game_seed)
        values (${r.id}, ${r.runNo}, ${r.name}, ${r.tokenHash}, ${r.ua}, ${r.seed})
        on conflict (emp_id, run_no) do nothing returning id`;
      return rows.length ? Number(rows[0]!.id) : null;
    },

    async getRun(runId, id) {
      const [p] = await sql`select token_hash, score, game_seed, extract(epoch from now() - started_at)::float as secs
        from safety_run_runs where id = ${runId} and emp_id = ${id}`;
      return p ? { tokenHash: p.token_hash, score: p.score, seed: p.game_seed == null ? null : Number(p.game_seed), secs: p.secs } : null;
    },

    async finishRun(runId, f) {
      const [saved] = await sql`update safety_run_runs set score = ${f.score}, secs = ${f.secs}, loot = ${f.loot}, dist = ${f.dist}, finished_at = now()
        where id = ${runId} and score is null returning score`;
      return saved ? saved.score : null;
    },

    async runScore(runId) {
      const [existing] = await sql`select score from safety_run_runs where id = ${runId}`;
      return existing ? existing.score : undefined;
    },

    async leaderboard(id) {
      // sequential on purpose: one pooled connection, no pipelining
      const top = await sql`select b.emp_id, b.score, p.avatar from (${best()}) b left join safety_run_players p using (emp_id) order by b.score desc, b.finished_at asc limit 20`;
      const cnt = await sql`select count(*)::int as total from (${best()}) b`;
      let rank = 0;
      if (id) {
        const r = await sql`with b as (${best()})
          select 1 + (select count(*)::int from b o where o.score > m.score or (o.score = m.score and o.finished_at < m.finished_at)) as rank
          from b m where m.emp_id = ${id}`;
        rank = r[0]?.rank || 0;
      }
      return { top: top.map(r => ({ empId: r.emp_id, avatar: r.avatar ?? null, score: r.score })), total: cnt[0]?.total || 0, rank };
    },

    async adminExport() {
      const rows = await sql`select r.emp_id as id, max(p.avatar) as avatar, count(*)::int as plays,
          max(score) filter (where game_seed is not null) as best, string_agg(case when score is null then '—' when game_seed is null then score::text || ' (legacy)' else score::text end, ' / ' order by run_no) as scores,
          min(started_at) as "startedAt", bool_or(capped) as flagged, coalesce(bool_or(p.hidden), false) as hidden,
          count(*) filter (where score is null)::int as unfinished
        from safety_run_runs r left join safety_run_players p using (emp_id) group by r.emp_id
        order by max(score) filter (where game_seed is not null) desc nulls last, min(started_at) asc`;
      return rows as never;
    },

    async adminRuns() {
      const rows = await sql`select r.emp_id as id, p.avatar, r.run_no as "runNo", r.started_at as "startedAt",
          r.finished_at as "finishedAt", r.secs, r.score, r.game_seed is null as legacy, coalesce(p.hidden, false) as hidden
        from safety_run_runs r left join safety_run_players p using (emp_id)
        order by r.started_at desc, r.id desc`;
      return rows as never;
    },

    async adminPlayers() {
      const rows = await sql`select p.emp_id as id, p.avatar, p.hidden,
          count(r.id)::int as plays,
          max(r.score) filter (where r.game_seed is not null) as best,
          max(r.dist) as "maxDist",
          max(r.started_at) as "lastPlayed",
          coalesce(sum(r.loot), 0)::int as loot,
          (select coalesce(sum(g.n), 0)::int from safety_run_box_grants g where g.emp_id = p.emp_id) as granted,
          (select count(*)::int from safety_run_cosmetics c where c.emp_id = p.emp_id) as opened,
          (select (count(*) filter (where c.dupe) / 5)::int from safety_run_cosmetics c where c.emp_id = p.emp_id) as free
        from safety_run_players p left join safety_run_runs r using (emp_id)
        group by p.emp_id, p.avatar, p.hidden
        order by max(r.score) filter (where r.game_seed is not null) desc nulls last, p.emp_id`;
      return rows as never;
    },

    async adminHide(id, hidden) {
      const r = await sql`update safety_run_players set hidden = ${hidden} where emp_id = ${id} returning emp_id`;
      return r.length;
    },

    async wardrobe(id) {
      // sequential on purpose: one pooled connection, no pipelining
      const [e] = await sql`select (select coalesce(sum(loot), 0) from safety_run_runs where emp_id = ${id} and score is not null)
        + (select coalesce(sum(n), 0) from safety_run_box_grants where emp_id = ${id}) as earned`;
      const opened = await sql`select item, dupe from safety_run_cosmetics where emp_id = ${id} order by box_no`;
      const [p] = await sql`select equipped from safety_run_players where emp_id = ${id}`;
      return { earned: Number(e!.earned), opened: opened.map(r => ({ item: r.item as string, dupe: !!r.dupe })), equipped: (p?.equipped ?? {}) as Record<string, string> };
    },

    async addCosmetic(id, boxNo, item, dupe) {
      const r = await sql`insert into safety_run_cosmetics (emp_id, box_no, item, dupe) values (${id}, ${boxNo}, ${item}, ${dupe})
        on conflict do nothing returning box_no`;
      return r.length > 0;
    },

    async grantBoxes(ids, n) {
      if (ids === 'all') {
        const r = await sql`insert into safety_run_box_grants (emp_id, n) select emp_id, ${n} from safety_run_players returning emp_id`;
        return { granted: r.length, unknown: [] };
      }
      const known = await sql`select emp_id from safety_run_players where emp_id = any(${ids}::text[])`;
      await sql`insert into safety_run_box_grants (emp_id, n) select unnest(${ids}::text[]), ${n}`;
      const seen = new Set(known.map(r => r.emp_id as string));
      return { granted: ids.length, unknown: ids.filter(id => !seen.has(id)) };
    },

    async setEquipped(id, equipped) {
      await sql`insert into safety_run_players (emp_id, equipped) values (${id}, ${sql.json(equipped)})
        on conflict (emp_id) do update set equipped = excluded.equipped`;
    },
  };
}
