import postgres from 'postgres';
import type { StageId } from '../shared/sim.js';
import { TOUR_SEATS } from '../shared/tour-channels.js';
import type { Slot, TourPlayer, TourStore } from './tour-store.js';

export function createPostgresTourStore(url: string): TourStore {
  const sql = postgres(url, { ssl: 'require', prepare: false, max: 1, idle_timeout: 5, connect_timeout: 10 });

  let ready: Promise<void> | null = null;
  return {
    init() {
      // a catalog read takes no lock: the DDL only runs while the tables are missing (see postgres-store.ts)
      ready ||= (async () => {
        // a catalog read: the tables exist, have every column added since they were first made, and the slot check allows 8 seats
        const [have] = await sql`select exists (select 1 from pg_attribute where attrelid = to_regclass('safety_run_tour_players') and attname = 'look' and not attisdropped)
          and exists (select 1 from pg_constraint where conname = 'safety_run_tour_players_slot_check' and pg_get_constraintdef(oid) like '%<= 7%') as ok`;
        if (have?.ok) return;
        await sql.begin(async tx => {
          await tx`set local lock_timeout = '5s'`;
          await tx`select pg_advisory_xact_lock(hashtext('safety_run_tour_migrate'))`;
          await tx`create table if not exists safety_run_tour_rooms (
            code text primary key,
            host_hash text not null,
            seed bigint not null,
            stage text not null,
            duration integer not null,
            status text not null default 'lobby',
            start_at timestamptz,
            created_at timestamptz not null default now())`;
          await tx`create table if not exists safety_run_tour_players (
            code text not null references safety_run_tour_rooms (code) on delete cascade,
            slot smallint not null,
            emp_id text not null,
            avatar integer not null,
            token_hash text not null,
            score integer,
            correct integer,
            finished_at timestamptz,
            primary key (code, slot),
            unique (code, emp_id))`;
          // what the player wore when they joined
          await tx`alter table safety_run_tour_players add column if not exists look jsonb not null default '{}'::jsonb`;
          // seats 0..7 (TOUR_SEATS); a room used to hold three
          await tx`alter table safety_run_tour_players drop constraint if exists safety_run_tour_players_slot_check`;
          await tx`alter table safety_run_tour_players add constraint safety_run_tour_players_slot_check check (slot between 0 and 7)`;
          await tx`alter table safety_run_tour_rooms enable row level security`;
          await tx`alter table safety_run_tour_players enable row level security`;
        });
      })().catch(e => { ready = null; throw e; });
      return ready;
    },

    async create(r) {
      const rows = await sql`insert into safety_run_tour_rooms (code, host_hash, seed, stage, duration)
        values (${r.code}, ${r.hostHash}, ${r.seed}, ${r.stage}, ${r.duration}) on conflict (code) do nothing returning code`;
      return rows.length > 0;
    },

    async get(code) {
      const [r] = await sql`select code, host_hash, seed, stage, duration, status, start_at from safety_run_tour_rooms where code = ${code}`;
      if (!r) return null;
      const ps = await sql`select slot, emp_id, avatar, look, token_hash, score, correct from safety_run_tour_players where code = ${code} order by slot`;
      return {
        code: r.code, hostHash: r.host_hash, seed: Number(r.seed), stage: r.stage as StageId, duration: r.duration,
        status: r.status, startAt: r.start_at ? new Date(r.start_at).getTime() : null,
        players: ps.map((p): TourPlayer => ({ slot: p.slot as Slot, empId: p.emp_id, avatar: p.avatar, look: p.look ?? {}, tokenHash: p.token_hash, score: p.score, correct: p.correct })),
      };
    },

    async join(code, p) {
      const again = await sql`update safety_run_tour_players set token_hash = ${p.tokenHash}, look = ${sql.json(p.look)} where code = ${code} and emp_id = ${p.empId} returning slot`;
      if (again.length) return again[0]!.slot as Slot;
      // two phones joining at once may both pick the same free slot: the primary key turns one away, and it tries the next
      for (let attempt = 0; attempt < TOUR_SEATS; attempt++) {
        const rows = await sql`insert into safety_run_tour_players (code, slot, emp_id, avatar, look, token_hash)
          select ${code}, s, ${p.empId}, ${p.avatar}, ${sql.json(p.look)}, ${p.tokenHash} from generate_series(0, ${TOUR_SEATS - 1}) s
          where s not in (select slot from safety_run_tour_players where code = ${code}) order by s limit 1
          on conflict do nothing returning slot`;
        if (rows.length) return rows[0]!.slot as Slot;
        const [n] = await sql`select count(*)::int as n from safety_run_tour_players where code = ${code}`;
        if (n!.n >= TOUR_SEATS) return null;
      }
      return null;
    },

    async kick(code, slot) {
      await sql`delete from safety_run_tour_players p using safety_run_tour_rooms r
        where p.code = ${code} and p.slot = ${slot} and r.code = p.code and r.status = 'lobby'`;
    },

    async config(code, stage, duration) {
      await sql`update safety_run_tour_rooms set stage = ${stage}, duration = ${duration} where code = ${code} and status = 'lobby'`;
    },

    async start(code, startAt) {
      const rows = await sql`update safety_run_tour_rooms set status = 'running', start_at = ${new Date(startAt)}
        where code = ${code} and status = 'lobby' returning code`;
      return rows.length > 0;
    },

    async finish(code, slot, score, correct) {
      const rows = await sql`update safety_run_tour_players set score = ${score}, correct = ${correct}, finished_at = now()
        where code = ${code} and slot = ${slot} and score is null returning slot`;
      return rows.length > 0;
    },

    async reset(code, seed) {
      await sql.begin(async tx => {
        await tx`update safety_run_tour_rooms set status = 'lobby', start_at = null, seed = ${seed} where code = ${code}`;
        await tx`update safety_run_tour_players set score = null, correct = null, finished_at = null where code = ${code}`;
      });
    },
  };
}
