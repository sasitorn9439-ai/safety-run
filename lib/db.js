import postgres from 'postgres';
import crypto from 'node:crypto';

const url = process.env.POSTGRES_URL || process.env.POSTGRES_URL_NON_POOLING;
export const sql = postgres(url, { ssl: 'require', prepare: false, max: 1, idle_timeout: 5, connect_timeout: 10 });

let ready;
export function init() {
  ready ||= (async () => {
    await sql`create table if not exists safety_run_plays (
      emp_id text primary key,
      name text not null,
      token_hash text not null,
      started_at timestamptz not null default now(),
      score integer,
      secs integer,
      capped boolean not null default false,
      finished_at timestamptz,
      ua text)`;
    // block the public anon/publishable keys; server connects as table owner
    await sql`alter table safety_run_plays enable row level security`;
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
