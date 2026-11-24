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

  let ready: Promise<void> | null = null;
  return {
    init() {
      ready ||= (async () => {
        // one row per run; (emp_id, run_no) unique + run_no limit = hard cap on plays per employee
        await sql`create table if not exists safety_run_runs (
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
        await sql`alter table safety_run_runs add column if not exists game_seed bigint`;
        await sql`alter table safety_run_runs drop constraint if exists safety_run_runs_run_no_check`;
        // one avatar per employee, never reused: the sequence hands out each number once
        await sql`create sequence if not exists safety_run_avatar_seq minvalue 0 start 0`;
        await sql`create table if not exists safety_run_players (
          emp_id text primary key,
          avatar integer not null unique default nextval('safety_run_avatar_seq'),
          created_at timestamptz not null default now())`;
        // admin can hide a player's scores from the leaderboard without deleting anything
        await sql`alter table safety_run_players add column if not exists hidden boolean not null default false`;
        // block the public anon/publishable keys; server connects as table owner
        await sql`alter table safety_run_runs enable row level security`;
        await sql`alter table safety_run_players enable row level security`;
        // players who started before avatars existed get theirs now
        await sql`insert into safety_run_players (emp_id) select distinct emp_id from safety_run_runs order by emp_id on conflict (emp_id) do nothing`;
      })().catch(e => { ready = null; throw e; });
      return ready;
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

    async finishRun(runId, score, secs) {
      const [saved] = await sql`update safety_run_runs set score = ${score}, secs = ${secs}, finished_at = now()
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

    async adminReset(id) {
      const r = await sql`delete from safety_run_runs where emp_id = ${id} returning id`;
      return r.length;
    },

    async adminHide(id, hidden) {
      const r = await sql`update safety_run_players set hidden = ${hidden} where emp_id = ${id} returning emp_id`;
      return r.length;
    },
  };
}
