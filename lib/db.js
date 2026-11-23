import postgres from 'postgres';
import crypto from 'node:crypto';

const url = process.env.POSTGRES_URL || process.env.POSTGRES_URL_NON_POOLING;
export const sql = postgres(url, { ssl: 'require', prepare: false, max: 1, idle_timeout: 5, connect_timeout: 10 });

// 0 / unset = unlimited plays per employee
export const MAX_PLAYS = Math.max(0, +process.env.MAX_PLAYS || 0);

let ready;
export function init() {
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
    // block the public anon/publishable keys; server connects as table owner
    await sql`alter table safety_run_runs enable row level security`;
    await sql`alter table safety_run_players enable row level security`;
    // players who started before avatars existed get theirs now
    await sql`insert into safety_run_players (emp_id) select distinct emp_id from safety_run_runs order by emp_id on conflict (emp_id) do nothing`;
  })().catch(e => { ready = null; throw e; });
  return ready;
}

export const sha = s => crypto.createHash('sha256').update(String(s)).digest('hex');
export const normId = s => String(s || '').trim().toUpperCase().replace(/\s+/g, '');
export const idOk = id => {
  if (!/^[A-Z0-9-]{3,15}$/.test(id)) return false;
  const allow = (process.env.ALLOWED_IDS || '').split(/[,\s]+/).filter(Boolean).map(normId);
  return !allow.length || allow.includes(id);
};
export const cleanName = s => String(s || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 40);
export const mask = id => (id.length > 4 ? '•'.repeat(id.length - 3) + id.slice(-3) : id);

export function json(res, code, body, cache) {
  res.statusCode = code;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', cache || 'no-store');
  res.end(JSON.stringify(body));
}
export const body = req => (typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {});

export async function avatarOf(id) {
  const [have] = await sql`select avatar from safety_run_players where emp_id = ${id}`;
  if (have) return have.avatar;
  await sql`insert into safety_run_players (emp_id) values (${id}) on conflict (emp_id) do nothing`;
  const [p] = await sql`select avatar from safety_run_players where emp_id = ${id}`;
  return p.avatar;
}
