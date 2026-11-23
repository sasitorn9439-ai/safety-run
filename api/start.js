import crypto from 'node:crypto';
import { sql, init, normId, idOk, cleanName, sha, json, body } from '../lib/db.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'method' });
  try {
    const b = body(req), id = normId(b.id), name = cleanName(b.name);
    if (!idOk(id)) return json(res, 400, { error: 'bad_id' });
    if (!name) return json(res, 400, { error: 'no_name' });
    await init();
    const token = crypto.randomBytes(18).toString('base64url');
    const ua = String(req.headers['user-agent'] || '').slice(0, 160);
    const r = await sql`insert into safety_run_plays (emp_id, name, token_hash, ua)
      values (${id}, ${name}, ${sha(token)}, ${ua}) on conflict (emp_id) do nothing returning emp_id`;
    if (!r.length) return json(res, 409, { error: 'used' });
    return json(res, 200, { token });
  } catch (e) {
    console.error(e);
    return json(res, 500, { error: 'server' });
  }
}
